#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "ebooklib>=0.18",
#     "beautifulsoup4>=4.12",
#     "lxml>=5.0",
# ]
# ///
"""
Extract chapters from an EPUB file.

Reads JSON from stdin: { "epubPath": "/path/to/book.epub" }
Writes JSON to stdout: {
  "title": "Book Title",
  "author": "Author Name",
  "chapters": [
    { "title": "Chapter 1", "text": "...", "order": 0 }
  ]
}

Run via: uv run scripts/extract_epub.py
"""
import sys
import json
import re

import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup, Tag


def extract_text(html_content: bytes) -> str:
    """Extract plain text from HTML content."""
    soup = BeautifulSoup(html_content, "lxml")
    # Remove non-content elements
    for tag in soup(["script", "style", "head", "meta", "link", "nav"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    # Collapse multiple blank lines
    lines = [line.strip() for line in text.splitlines()]
    result = []
    prev_blank = False
    for line in lines:
        if not line:
            if not prev_blank:
                result.append("")
                prev_blank = True
        else:
            result.append(line)
            prev_blank = False
    return "\n".join(result).strip()


def clean_title(raw: str) -> str:
    """Clean up a raw title string."""
    # Remove HTML entities/tags that leaked through
    raw = re.sub(r"<[^>]+>", "", raw)
    # Remove excessive whitespace
    raw = " ".join(raw.split())
    # Truncate very long titles (likely not real titles)
    if len(raw) > 120:
        raw = raw[:120].rsplit(" ", 1)[0] + "..."
    return raw.strip()


def is_plausible_title(text: str) -> bool:
    """Check if extracted text looks like a real chapter title vs. XHTML noise."""
    if not text or len(text) > 200:
        return False
    # Reject if it looks like a file path or XHTML artifact
    if re.match(r"^[\w-]+\.(xhtml|html|xml|htm|css|ncx)$", text, re.IGNORECASE):
        return False
    # Reject if mostly punctuation / numbers with no letters
    if not re.search(r"[a-zA-Z\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]", text):
        return False
    return True


def get_chapter_title(item, soup: BeautifulSoup, order: int) -> str:
    """Extract a chapter title from the HTML content."""
    # Strategy 1: Look for heading tags in order of specificity
    for tag_name in ["h1", "h2", "h3"]:
        for heading in soup.find_all(tag_name):
            if not isinstance(heading, Tag):
                continue
            title = heading.get_text(strip=True)
            title = clean_title(title)
            if is_plausible_title(title):
                return title

    # Strategy 2: Check the <title> element in <head> (if body has content)
    head_title = soup.find("title")
    if head_title:
        title = clean_title(head_title.get_text(strip=True))
        if is_plausible_title(title):
            return title

    # Strategy 3: Use first significant paragraph as fallback
    for p in soup.find_all(["p", "div"]):
        if not isinstance(p, Tag):
            continue
        # Look for bold or styled text that might be a title
        strong = p.find(["strong", "b", "em"])
        if strong:
            title = clean_title(strong.get_text(strip=True))
            if is_plausible_title(title) and len(title) < 80:
                return title

    # Fallback: generic numbered title
    return f"Chapter {order + 1}"


def build_toc_map(book) -> dict[str, str]:
    """Build a mapping from href → title using the EPUB table of contents."""
    toc_map = {}
    try:
        toc = book.toc
        for item in toc:
            if isinstance(item, epub.Link):
                # Remove fragment identifier
                href = item.href.split("#")[0]
                if item.title:
                    toc_map[href] = item.title
            elif isinstance(item, tuple) and len(item) == 2:
                # Nested TOC: (Section, [children])
                section, children = item
                if hasattr(section, "href") and hasattr(section, "title") and section.title:
                    href = section.href.split("#")[0]
                    toc_map[href] = section.title
                for child in children:
                    if isinstance(child, epub.Link) and child.title:
                        href = child.href.split("#")[0]
                        toc_map[href] = child.title
    except Exception:
        pass
    return toc_map


def main():
    input_data = json.loads(sys.stdin.read())
    epub_path = input_data["epubPath"]

    book = epub.read_epub(epub_path, options={"ignore_ncx": False})

    # Get metadata
    title = "Unknown"
    author = "Unknown"
    titles = book.get_metadata("DC", "title")
    if titles:
        title = titles[0][0]
    creators = book.get_metadata("DC", "creator")
    if creators:
        author = creators[0][0]

    # Build TOC mapping for better titles
    toc_map = build_toc_map(book)

    # Extract chapters following spine order
    chapters = []
    order = 0

    # Get spine items in order
    spine_ids = [item_id for item_id, _ in book.spine]
    spine_items = []
    for item_id in spine_ids:
        item = book.get_item_with_id(item_id)
        if item and item.get_type() == ebooklib.ITEM_DOCUMENT:
            spine_items.append(item)

    # Fallback: if spine is empty, use all document items
    if not spine_items:
        spine_items = list(book.get_items_of_type(ebooklib.ITEM_DOCUMENT))

    for item in spine_items:
        content = item.get_content()
        text = extract_text(content)

        # Skip very short items (cover pages, copyright, etc.)
        if len(text) < 100:
            continue

        # Try TOC title first (most reliable), then extract from HTML
        item_href = item.get_name()
        if item_href in toc_map:
            chapter_title = clean_title(toc_map[item_href])
        else:
            soup = BeautifulSoup(content, "lxml")
            chapter_title = get_chapter_title(item, soup, order)

        chapters.append({
            "title": chapter_title,
            "text": text,
            "order": order,
        })
        order += 1

    result = {
        "title": title,
        "author": author,
        "chapters": chapters,
    }

    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
