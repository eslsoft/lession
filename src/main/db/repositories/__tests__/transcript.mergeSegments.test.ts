import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../schema'

// We must mock the db index module before importing the repository so that
// getDatabase() returns our in-memory instance instead of calling Electron's
// app.getPath(), which is unavailable in the test environment.
let testDb: Database.Database

vi.mock('../../index', () => ({
  getDatabase: () => testDb,
}))

// Import after the mock is registered.
import { mergeSegments, createTranscript, getTranscriptById } from '../transcript'
import type { Segment } from '../../../../shared/types'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    start: 0,
    end: 1,
    text: 'hello',
    edited: false,
    speaker: 'A',
    words: [],
    phrases: undefined,
    complexity: undefined,
    ...overrides,
  }
}

function seedTranscript(segments: Segment[]): string {
  const result = createTranscript({ episodeId: 'ep-1', language: 'en', segments })
  return result.id
}

// ── setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  testDb = new Database(':memory:')
  initializeDatabase(testDb)

  // FK chain: transcripts → episodes → series. Insert parent rows first.
  // Also enable FK enforcement so the constraints are active.
  testDb.pragma('foreign_keys = ON')

  testDb
    .prepare(
      `INSERT INTO series (id, title, type, language, createdAt, updatedAt)
       VALUES ('series-1', 'Test Series', 'podcast', 'en', datetime('now'), datetime('now'))`,
    )
    .run()

  testDb
    .prepare(
      `INSERT INTO episodes (id, seriesId, title, "order", mimeType, status, publishStatus, createdAt, updatedAt)
       VALUES ('ep-1', 'series-1', 'Ep 1', 1, 'audio', 'ready', 'draft', datetime('now'), datetime('now'))`,
    )
    .run()
})

// ── tests ────────────────────────────────────────────────────────────────────

describe('mergeSegments', () => {
  describe('happy path', () => {
    it('removes the two source segments and replaces them with a single merged segment', () => {
      const seg0 = makeSegment({ start: 0, end: 1, text: 'hello' })
      const seg1 = makeSegment({ start: 1, end: 2, text: 'world' })
      const seg2 = makeSegment({ start: 2, end: 3, text: 'end' })
      const id = seedTranscript([seg0, seg1, seg2])

      mergeSegments(id, 0)

      const updated = getTranscriptById(id)!
      expect(updated.segments).toHaveLength(2)
    })

    it('sets the merged segment start to the first segment start', () => {
      const id = seedTranscript([
        makeSegment({ start: 1.5, end: 2.0, text: 'a' }),
        makeSegment({ start: 2.0, end: 3.5, text: 'b' }),
      ])

      mergeSegments(id, 0)

      const { segments } = getTranscriptById(id)!
      expect(segments[0].start).toBe(1.5)
    })

    it('sets the merged segment end to the second segment end', () => {
      const id = seedTranscript([
        makeSegment({ start: 1.5, end: 2.0, text: 'a' }),
        makeSegment({ start: 2.0, end: 3.5, text: 'b' }),
      ])

      mergeSegments(id, 0)

      const { segments } = getTranscriptById(id)!
      expect(segments[0].end).toBe(3.5)
    })

    it('sets edited to true on the merged segment', () => {
      const id = seedTranscript([
        makeSegment({ edited: false }),
        makeSegment({ edited: false }),
      ])

      mergeSegments(id, 0)

      const { segments } = getTranscriptById(id)!
      expect(segments[0].edited).toBe(true)
    })

    it('preserves the speaker from the first segment', () => {
      const id = seedTranscript([
        makeSegment({ speaker: 'Alice' }),
        makeSegment({ speaker: 'Bob' }),
      ])

      mergeSegments(id, 0)

      const { segments } = getTranscriptById(id)!
      expect(segments[0].speaker).toBe('Alice')
    })

    it('sets phrases to undefined on the merged segment', () => {
      const phrase = { type: 'NP' as const, text: 'hello', startIdx: 0, endIdx: 0 }
      const id = seedTranscript([
        makeSegment({ phrases: [phrase] }),
        makeSegment({ phrases: [phrase] }),
      ])

      mergeSegments(id, 0)

      const { segments } = getTranscriptById(id)!
      expect(segments[0].phrases).toBeUndefined()
    })

    it('sets complexity to undefined on the merged segment', () => {
      const complexity = {
        score: 3 as const,
        label: 'Intermediate' as const,
        details: { wordCount: 5 },
      }
      const id = seedTranscript([
        makeSegment({ complexity }),
        makeSegment({ complexity }),
      ])

      mergeSegments(id, 0)

      const { segments } = getTranscriptById(id)!
      expect(segments[0].complexity).toBeUndefined()
    })

    it('does not affect segments after the merge point', () => {
      const tail = makeSegment({ start: 9, end: 10, text: 'tail' })
      const id = seedTranscript([makeSegment(), makeSegment(), tail])

      mergeSegments(id, 0)

      const { segments } = getTranscriptById(id)!
      expect(segments[1]).toMatchObject({ start: 9, end: 10, text: 'tail' })
    })
  })

  describe('text trimming', () => {
    it('joins the two texts with a single space', () => {
      const id = seedTranscript([
        makeSegment({ text: 'hello' }),
        makeSegment({ text: 'world' }),
      ])

      mergeSegments(id, 0)

      const { segments } = getTranscriptById(id)!
      expect(segments[0].text).toBe('hello world')
    })

    it('trims trailing whitespace from the first segment text', () => {
      const id = seedTranscript([
        makeSegment({ text: 'hello   ' }),
        makeSegment({ text: 'world' }),
      ])

      mergeSegments(id, 0)

      const { segments } = getTranscriptById(id)!
      expect(segments[0].text).toBe('hello world')
    })

    it('trims leading whitespace from the second segment text', () => {
      const id = seedTranscript([
        makeSegment({ text: 'hello' }),
        makeSegment({ text: '   world' }),
      ])

      mergeSegments(id, 0)

      const { segments } = getTranscriptById(id)!
      expect(segments[0].text).toBe('hello world')
    })

    it('trims both sides when both segments have extra whitespace', () => {
      const id = seedTranscript([
        makeSegment({ text: '  hello  ' }),
        makeSegment({ text: '  world  ' }),
      ])

      mergeSegments(id, 0)

      const { segments } = getTranscriptById(id)!
      // trimEnd on first, trimStart on second — leading space on first and trailing on second are kept
      expect(segments[0].text).toBe('  hello world  ')
    })
  })

  describe('words array merging', () => {
    it('concatenates words from both segments', () => {
      const w1 = { word: 'hello', start: 0, end: 0.5, score: 1, normal: null, tags: null, chunk: null }
      const w2 = { word: 'world', start: 0.5, end: 1, score: 1, normal: null, tags: null, chunk: null }
      const id = seedTranscript([
        makeSegment({ words: [w1] }),
        makeSegment({ words: [w2] }),
      ])

      mergeSegments(id, 0)

      const { segments } = getTranscriptById(id)!
      expect(segments[0].words).toEqual([w1, w2])
    })

    it('handles null words on the first segment via nullish coalescing', () => {
      const w = { word: 'world', start: 0.5, end: 1, score: 1, normal: null, tags: null, chunk: null }
      // Force words to be undefined/null by bypassing TypeScript with a cast
      const id = seedTranscript([
        makeSegment({ words: undefined as unknown as [] }),
        makeSegment({ words: [w] }),
      ])

      mergeSegments(id, 0)

      const { segments } = getTranscriptById(id)!
      expect(segments[0].words).toEqual([w])
    })

    it('handles null words on the second segment via nullish coalescing', () => {
      const w = { word: 'hello', start: 0, end: 0.5, score: 1, normal: null, tags: null, chunk: null }
      const id = seedTranscript([
        makeSegment({ words: [w] }),
        makeSegment({ words: undefined as unknown as [] }),
      ])

      mergeSegments(id, 0)

      const { segments } = getTranscriptById(id)!
      expect(segments[0].words).toEqual([w])
    })

    it('produces an empty words array when both segments have no words', () => {
      const id = seedTranscript([
        makeSegment({ words: undefined as unknown as [] }),
        makeSegment({ words: undefined as unknown as [] }),
      ])

      mergeSegments(id, 0)

      const { segments } = getTranscriptById(id)!
      expect(segments[0].words).toEqual([])
    })
  })

  describe('error cases', () => {
    it('throws when the transcript id does not exist', () => {
      expect(() => mergeSegments('nonexistent-id', 0)).toThrow('Transcript not found: nonexistent-id')
    })

    it('throws when segmentIndex is negative', () => {
      const id = seedTranscript([makeSegment(), makeSegment()])
      expect(() => mergeSegments(id, -1)).toThrow('out of bounds')
    })

    it('throws when segmentIndex equals the last valid index (no next segment to merge)', () => {
      const id = seedTranscript([makeSegment(), makeSegment()])
      // index 1 is segments.length - 1, so there is no segment at index 2
      expect(() => mergeSegments(id, 1)).toThrow('out of bounds')
    })

    it('throws when segmentIndex is beyond the last segment', () => {
      const id = seedTranscript([makeSegment(), makeSegment()])
      expect(() => mergeSegments(id, 5)).toThrow('out of bounds')
    })

    it('throws when the transcript has only one segment', () => {
      const id = seedTranscript([makeSegment()])
      expect(() => mergeSegments(id, 0)).toThrow('out of bounds')
    })
  })

  describe('boundary conditions', () => {
    it('merges the last two segments in a longer list', () => {
      const segments = [makeSegment(), makeSegment(), makeSegment({ start: 2, end: 3, text: 'A' }), makeSegment({ start: 3, end: 4, text: 'B' })]
      const id = seedTranscript(segments)

      mergeSegments(id, 2)

      const updated = getTranscriptById(id)!
      expect(updated.segments).toHaveLength(3)
      expect(updated.segments[2].text).toBe('A B')
    })

    it('merges successfully when transcript has exactly two segments', () => {
      const id = seedTranscript([makeSegment({ text: 'first' }), makeSegment({ text: 'second' })])

      mergeSegments(id, 0)

      const updated = getTranscriptById(id)!
      expect(updated.segments).toHaveLength(1)
      expect(updated.segments[0].text).toBe('first second')
    })
  })
})
