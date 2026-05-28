#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "spacy>=3.7",
#     "click",
#     "en-core-web-sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl",
# ]
# ///
"""
NLP processing script using spaCy.

Reads a JSON array of transcript segments from stdin, enriches each segment's
words with POS/lemma/dependency info and extracts phrases, then writes the
result to stdout as JSON.

Only uses spaCy's native annotations — no hand-written heuristic rules.

Phrase types extracted:
  - NER entities:  Person, Place, Organization, Event, Temporal
  - Noun phrases:  NP  (spaCy doc.noun_chunks, multi-word only)
  - Phrasal verbs: PV  (spaCy dep_=="prt", e.g. "give up", "look into")

Run via: uv run scripts/nlp_spacy.py
"""
import sys
import json
import re

import spacy

nlp = spacy.load("en_core_web_sm")

# Map spaCy NER labels to our phrase types.
# Unlisted labels (MONEY, PERCENT, QUANTITY, ORDINAL, CARDINAL, PRODUCT,
# LANGUAGE) are intentionally dropped — low value for language learners.
ENT_TYPE_MAP = {
    "PERSON": "Person",
    "GPE": "Place",
    "LOC": "Place",
    "FAC": "Place",
    "ORG": "Organization",
    "NORP": "Organization",
    "EVENT": "Event",
    "WORK_OF_ART": "Event",
    "LAW": "Event",
    "DATE": "Temporal",
    "TIME": "Temporal",
}


def compute_complexity(doc):
    """
    Compute a segment complexity score from spaCy's dependency parse.

    Returns a dict with:
      - score: int 1-5 (Simple / Basic / Intermediate / Advanced / Complex)
      - label: human-readable label
      - details: breakdown metrics
    """
    tokens = [t for t in doc if not t.is_punct and not t.is_space]
    if not tokens:
        return {"score": 1, "label": "Simple", "details": {}}

    word_count = len(tokens)

    # Tree depth: max distance from any token to ROOT
    tree_depth = 0
    for t in tokens:
        depth = len(list(t.ancestors))
        if depth > tree_depth:
            tree_depth = depth

    # Count clauses: tokens whose dep signals a clause boundary
    clause_deps = {"advcl", "relcl", "ccomp", "xcomp", "acl", "csubj", "ROOT"}
    num_clauses = sum(1 for t in doc if t.dep_ in clause_deps)

    # Subordination markers (because, although, if, when, ...)
    has_subordination = any(t.dep_ == "mark" for t in doc)

    # Passive voice
    has_passive = any(t.dep_ in ("nsubjpass", "auxpass") for t in doc)

    # Score: each factor adds points, then map to 1-5
    points = 0
    if word_count > 15:
        points += 1
    if word_count > 25:
        points += 1
    if tree_depth > 4:
        points += 1
    if tree_depth > 6:
        points += 1
    if num_clauses > 2:
        points += 1
    if num_clauses > 4:
        points += 1
    if has_subordination:
        points += 1
    if has_passive:
        points += 1

    score = min(5, max(1, 1 + points // 2))
    labels = {1: "Simple", 2: "Basic", 3: "Intermediate", 4: "Advanced", 5: "Complex"}

    return {
        "score": score,
        "label": labels[score],
        "details": {
            "wordCount": word_count,
            "treeDepth": tree_depth,
            "numClauses": num_clauses,
            "hasSubordination": has_subordination,
            "hasPassive": has_passive,
        },
    }


def process_segments(segments):
    for seg in segments:
        words = seg.get("words", [])
        if not words:
            seg["phrases"] = []
            seg["complexity"] = {"score": 1, "label": "Simple", "details": {}}
            continue

        text = " ".join(w["word"] for w in words)
        doc = nlp(text)

        # Build spaCy token char offset -> WhisperX word index mapping
        char_to_word = {}
        pos = 0
        for wi, w in enumerate(words):
            word_text = w["word"]
            for c in range(len(word_text)):
                char_to_word[pos + c] = wi
            pos += len(word_text) + 1  # +1 for the joining space

        def token_to_word_idx(token):
            return char_to_word.get(token.idx, -1)

        # Enrich words with NLP fields.
        # When a WhisperX word contains trailing punctuation (e.g. "heroin,"),
        # spaCy splits it into multiple tokens ("heroin" + ",").  Both tokens
        # map to the same word index via char_to_word.  We skip punctuation
        # tokens so the real word's POS/lemma isn't overwritten by PUNCT.
        for token in doc:
            if token.is_punct or token.is_space:
                continue
            wi = token_to_word_idx(token)
            if 0 <= wi < len(words):
                words[wi]["normal"] = token.lemma_
                words[wi]["tags"] = [token.pos_, token.tag_]
                words[wi]["chunk"] = token.dep_

        # Extract phrases — only from spaCy's native annotations
        phrases = []
        occupied = set()

        def try_add_phrase(ptype, start_wi, end_wi, text):
            """Add a phrase if no word in its range is already occupied."""
            if start_wi < 0 or end_wi < 0:
                return False
            for i in range(start_wi, end_wi + 1):
                if i in occupied:
                    return False
            for i in range(start_wi, end_wi + 1):
                occupied.add(i)
            phrases.append({
                "type": ptype,
                "text": text.strip(".,!?;: "),
                "startIdx": start_wi,
                "endIdx": end_wi,
            })
            return True

        # 1) NER entities (highest priority)
        for ent in doc.ents:
            ptype = ENT_TYPE_MAP.get(ent.label_)
            if not ptype:
                continue
            start_wi = token_to_word_idx(ent[0])
            end_wi = token_to_word_idx(ent[-1])
            try_add_phrase(ptype, start_wi, end_wi, ent.text)

        # 2) Regex fallback: catch time expressions spaCy missed (e.g. "2.30pm")
        TIME_RE = re.compile(r'^\d{1,2}[.:]\d{2}\s?[ap]m$', re.IGNORECASE)
        for wi, w in enumerate(words):
            if TIME_RE.match(w["word"].rstrip(".,!?;:")):
                try_add_phrase("Temporal", wi, wi, w["word"].rstrip(".,!?;:"))

        # 3) Phrasal verbs: verb + particle (spaCy dep_=="prt")
        for token in doc:
            if token.dep_ == "prt" and token.head.pos_ == "VERB":
                verb = token.head
                particle = token
                # Determine order (verb is usually before particle)
                if verb.i < particle.i:
                    start_wi = token_to_word_idx(verb)
                    end_wi = token_to_word_idx(particle)
                else:
                    start_wi = token_to_word_idx(particle)
                    end_wi = token_to_word_idx(verb)
                pv_text = verb.text + " " + particle.text
                try_add_phrase("PV", start_wi, end_wi, pv_text)

        # 4) Noun phrases: spaCy doc.noun_chunks (multi-word only)
        for chunk in doc.noun_chunks:
            start_wi = token_to_word_idx(chunk[0])
            end_wi = token_to_word_idx(chunk[-1])
            if start_wi == end_wi:
                continue  # skip single-word NPs
            try_add_phrase("NP", start_wi, end_wi, chunk.text)

        phrases.sort(key=lambda p: p["startIdx"])
        seg["phrases"] = phrases

        # Segment complexity
        seg["complexity"] = compute_complexity(doc)

    return segments


if __name__ == "__main__":
    data = json.loads(sys.stdin.read())
    result = process_segments(data)
    json.dump(result, sys.stdout, ensure_ascii=False)
