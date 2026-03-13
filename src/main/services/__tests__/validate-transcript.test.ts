import { describe, it, expect } from 'vitest'
import { validateTranscriptSegments } from '../publisher'
import type { Segment, WordToken } from '../../../shared/types'

function makeWord(word: string, start: number, end: number): WordToken {
  return { word, start, end, score: 1, normal: null, tags: null, chunk: null }
}

function makeSegment(text: string, start: number, end: number, words: WordToken[]): Segment {
  return { text, start, end, edited: false, words }
}

describe('validateTranscriptSegments', () => {
  it('should pass with valid segments', () => {
    const segments: Segment[] = [
      makeSegment('Hello world', 0, 2, [
        makeWord('Hello', 0, 1),
        makeWord('world', 1, 2),
      ]),
      makeSegment('Good morning', 2, 4, [
        makeWord('Good', 2, 3),
        makeWord('morning', 3, 4),
      ]),
    ]
    expect(() => validateTranscriptSegments(segments)).not.toThrow()
  })

  it('should pass with empty segments array', () => {
    expect(() => validateTranscriptSegments([])).not.toThrow()
  })

  it('should pass with segment that has no words', () => {
    const segments: Segment[] = [
      makeSegment('Hello world', 0, 2, []),
    ]
    expect(() => validateTranscriptSegments(segments)).not.toThrow()
  })

  // Rule 1: word must be substring of text
  it('should fail when word is not a substring of segment text', () => {
    const segments: Segment[] = [
      makeSegment('Hello world', 0, 2, [
        makeWord('Hello', 0, 1),
        makeWord('foo', 1, 2),
      ]),
    ]
    expect(() => validateTranscriptSegments(segments)).toThrow(
      'Segment 0, word 1 ("foo"): not found in segment text',
    )
  })

  // Rule 2: words must appear in order
  it('should fail when words appear in wrong order', () => {
    const segments: Segment[] = [
      makeSegment('Hello world', 0, 2, [
        makeWord('world', 0, 1),
        makeWord('Hello', 1, 2),
      ]),
    ]
    expect(() => validateTranscriptSegments(segments)).toThrow(
      'Segment 0, word 1 ("Hello"): not found in segment text after position',
    )
  })

  it('should pass when same word appears multiple times and order is maintained', () => {
    const segments: Segment[] = [
      makeSegment('the cat and the dog', 0, 5, [
        makeWord('the', 0, 1),
        makeWord('cat', 1, 2),
        makeWord('and', 2, 3),
        makeWord('the', 3, 4),
        makeWord('dog', 4, 5),
      ]),
    ]
    expect(() => validateTranscriptSegments(segments)).not.toThrow()
  })

  // Rule 3: word timing must fall within segment time range
  it('should fail when word start time is before segment start', () => {
    const segments: Segment[] = [
      makeSegment('Hello world', 1, 3, [
        makeWord('Hello', 0.5, 2),
        makeWord('world', 2, 3),
      ]),
    ]
    expect(() => validateTranscriptSegments(segments)).toThrow(
      'time range [0.5, 2] outside segment range [1, 3]',
    )
  })

  it('should fail when word end time is after segment end', () => {
    const segments: Segment[] = [
      makeSegment('Hello world', 1, 3, [
        makeWord('Hello', 1, 2),
        makeWord('world', 2, 3.5),
      ]),
    ]
    expect(() => validateTranscriptSegments(segments)).toThrow(
      'time range [2, 3.5] outside segment range [1, 3]',
    )
  })

  it('should pass when word timing is exactly at segment boundaries', () => {
    const segments: Segment[] = [
      makeSegment('Hello', 1, 3, [
        makeWord('Hello', 1, 3),
      ]),
    ]
    expect(() => validateTranscriptSegments(segments)).not.toThrow()
  })

  // Rule 4: no newlines in text
  it('should fail when segment text contains \\n', () => {
    const segments: Segment[] = [
      makeSegment('Hello\nworld', 0, 2, [
        makeWord('Hello', 0, 1),
        makeWord('world', 1, 2),
      ]),
    ]
    expect(() => validateTranscriptSegments(segments)).toThrow(
      'Segment 0: text contains newline characters',
    )
  })

  it('should fail when segment text contains \\r', () => {
    const segments: Segment[] = [
      makeSegment('Hello\rworld', 0, 2, [
        makeWord('Hello', 0, 1),
        makeWord('world', 1, 2),
      ]),
    ]
    expect(() => validateTranscriptSegments(segments)).toThrow(
      'Segment 0: text contains newline characters',
    )
  })

  it('should fail when segment text contains \\r\\n', () => {
    const segments: Segment[] = [
      makeSegment('Hello\r\nworld', 0, 2, [
        makeWord('Hello', 0, 1),
        makeWord('world', 1, 2),
      ]),
    ]
    expect(() => validateTranscriptSegments(segments)).toThrow(
      'Segment 0: text contains newline characters',
    )
  })

  // Multiple segments — error reports correct index
  it('should report the correct segment index on failure', () => {
    const segments: Segment[] = [
      makeSegment('Hello world', 0, 2, [
        makeWord('Hello', 0, 1),
        makeWord('world', 1, 2),
      ]),
      makeSegment('Good morning', 2, 4, [
        makeWord('Good', 2, 3),
        makeWord('evening', 3, 4), // not in text
      ]),
    ]
    expect(() => validateTranscriptSegments(segments)).toThrow(
      'Segment 1, word 1 ("evening")',
    )
  })
})
