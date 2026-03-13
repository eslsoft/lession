import type { Segment, WordToken } from '../../../shared/types'
import type { TtsSegment } from './types'

// ── Sentence splitting with character offsets ──

interface SentenceRange {
  text: string
  start: number // inclusive char offset in original text
  end: number   // exclusive char offset in original text
}

function splitSentencesWithOffsets(text: string): SentenceRange[] {
  const regex = /(?<![A-Z][a-z]|[A-Z]\.[A-Z]|\d)(?<=[.!?])\s+/g
  const splitPoints: number[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    splitPoints.push(match.index + match[0].length)
  }

  const ranges: SentenceRange[] = []
  let start = 0

  for (const sp of splitPoints) {
    const slice = text.slice(start, sp).trim()
    if (slice) ranges.push({ text: slice, start, end: sp })
    start = sp
  }

  const lastSlice = text.slice(start).trim()
  if (lastSlice) ranges.push({ text: lastSlice, start, end: text.length })

  return ranges
}

/**
 * Check whether the character is a word character (letter, digit, apostrophe).
 * Apostrophe is included so that "don't" is treated as one word.
 */
function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false
  return /[a-zA-Z0-9']/.test(ch)
}

/**
 * Find the position of a TTS word in the original text as a whole-word match,
 * searching forward from cursor. This prevents "the" from matching inside
 * "Then", "there", "other", etc.
 */
function findWordPosition(text: string, word: string, cursor: number): number {
  let searchFrom = cursor

  // Exact match with word boundaries
  while (searchFrom < text.length) {
    const idx = text.indexOf(word, searchFrom)
    if (idx < 0) break
    const before = idx > 0 ? text[idx - 1] : undefined
    const after = text[idx + word.length]
    if (!isWordChar(before) && !isWordChar(after)) return idx
    searchFrom = idx + 1
  }

  // Case-insensitive fallback with word boundaries
  const lowerText = text.toLowerCase()
  const lowerWord = word.toLowerCase()
  searchFrom = cursor
  while (searchFrom < lowerText.length) {
    const idx = lowerText.indexOf(lowerWord, searchFrom)
    if (idx < 0) break
    const before = idx > 0 ? lowerText[idx - 1] : undefined
    const after = lowerText[idx + lowerWord.length]
    if (!isWordChar(before) && !isWordChar(after)) return idx
    searchFrom = idx + 1
  }

  // Last resort: substring match (better than losing the word entirely)
  const idx = text.indexOf(word, cursor)
  return idx
}

/**
 * Convert word-level TTS segments into sentence-level Transcript segments.
 * Uses character-position matching to align TTS words with sentence boundaries,
 * avoiding the word-count mismatch problem.
 */
export function ttsSegmentsToTranscriptSegments(ttsSegments: TtsSegment[], originalText: string): Segment[] {
  if (ttsSegments.length === 0) return []

  // Normalize all whitespace (newlines, tabs, etc.) to single spaces before processing
  const cleanText = originalText.replace(/\s+/g, ' ').trim()

  const sentenceRanges = splitSentencesWithOffsets(cleanText)
  if (sentenceRanges.length === 0) return []

  // Step 1: Find each TTS word's character position in the original text
  let cursor = 0
  const wordCharPos: number[] = []

  for (const seg of ttsSegments) {
    const pos = findWordPosition(cleanText, seg.text, cursor)
    if (pos >= 0) {
      wordCharPos.push(pos)
      cursor = pos + seg.text.length
    } else {
      // Word not found (TTS may have transformed it) — use cursor as best guess
      wordCharPos.push(cursor)
    }
  }

  // Step 2: Assign each word to a sentence based on its char position
  const sentenceWordGroups: TtsSegment[][] = sentenceRanges.map(() => [])

  for (let i = 0; i < ttsSegments.length; i++) {
    const pos = wordCharPos[i]
    let sentIdx = sentenceRanges.findIndex((s) => pos >= s.start && pos < s.end)
    if (sentIdx < 0) sentIdx = sentenceRanges.length - 1
    sentenceWordGroups[sentIdx].push(ttsSegments[i])
  }

  // Step 3: Build segments
  const segments: Segment[] = []
  for (let i = 0; i < sentenceRanges.length; i++) {
    const wordsInGroup = sentenceWordGroups[i]
    if (wordsInGroup.length === 0) continue

    const words: WordToken[] = wordsInGroup.map((w) => ({
      word: w.text,
      start: w.start,
      end: w.end,
      score: 1,
      normal: null,
      tags: null,
      chunk: null,
    }))

    segments.push({
      start: wordsInGroup[0].start,
      end: wordsInGroup[wordsInGroup.length - 1].end,
      text: sentenceRanges[i].text,
      edited: false,
      words,
    })
  }

  return segments
}
