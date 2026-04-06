import crypto from 'node:crypto'
import { getDatabase } from '../index'
import type { Transcript, Segment } from '../../../shared/types'

interface TranscriptRow {
  id: string
  episodeId: string
  language: string
  segments: string
  createdAt: string
  updatedAt: string
}

function rowToTranscript(row: TranscriptRow): Transcript {
  return {
    id: row.id,
    episodeId: row.episodeId,
    language: row.language,
    segments: JSON.parse(row.segments) as Segment[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function getTranscript(episodeId: string): Transcript | null {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM transcripts WHERE episodeId = ?')
  const row = stmt.get(episodeId) as TranscriptRow | undefined
  return row ? rowToTranscript(row) : null
}

export function createTranscript(data: Omit<Transcript, 'id' | 'createdAt' | 'updatedAt'>): Transcript {
  const db = getDatabase()
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  const stmt = db.prepare(`
    INSERT INTO transcripts (id, episodeId, language, segments, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  stmt.run(id, data.episodeId, data.language, JSON.stringify(data.segments), now, now)

  return getTranscriptById(id)!
}

export function getTranscriptById(id: string): Transcript | null {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM transcripts WHERE id = ?')
  const row = stmt.get(id) as TranscriptRow | undefined
  return row ? rowToTranscript(row) : null
}

export function updateTranscript(id: string, data: Partial<Transcript>): Transcript {
  const db = getDatabase()
  const now = new Date().toISOString()

  const sets: string[] = []
  const values: unknown[] = []

  if ('language' in data) {
    sets.push('language = ?')
    values.push(data.language)
  }

  if ('segments' in data) {
    sets.push('segments = ?')
    values.push(JSON.stringify(data.segments))
  }

  sets.push('updatedAt = ?')
  values.push(now)
  values.push(id)

  const stmt = db.prepare(`UPDATE transcripts SET ${sets.join(', ')} WHERE id = ?`)
  stmt.run(...values)

  return getTranscriptById(id)!
}

export function updateTranscriptSegments(id: string, segments: Segment[]): void {
  const db = getDatabase()
  const now = new Date().toISOString()
  const stmt = db.prepare('UPDATE transcripts SET segments = ?, updatedAt = ? WHERE id = ?')
  stmt.run(JSON.stringify(segments), now, id)
}

export function updateSegmentText(id: string, segmentIndex: number, text: string): void {
  const db = getDatabase()
  const transcript = getTranscriptById(id)
  if (!transcript) return

  const segments = [...transcript.segments]
  if (segmentIndex < 0 || segmentIndex >= segments.length) return

  segments[segmentIndex] = { ...segments[segmentIndex], text, edited: true }

  const now = new Date().toISOString()
  const stmt = db.prepare('UPDATE transcripts SET segments = ?, updatedAt = ? WHERE id = ?')
  stmt.run(JSON.stringify(segments), now, id)
}

export function mergeSegments(id: string, segmentIndex: number): void {
  const db = getDatabase()
  const transcript = getTranscriptById(id)
  if (!transcript) throw new Error(`Transcript not found: ${id}`)

  const segments = [...transcript.segments]
  if (segmentIndex < 0 || segmentIndex >= segments.length - 1) {
    throw new Error(`Cannot merge at index ${segmentIndex}: out of bounds`)
  }

  const first = segments[segmentIndex]
  const second = segments[segmentIndex + 1]

  const merged: Segment = {
    start: first.start,
    end: second.end,
    text: [first.text.trimEnd(), second.text.trimStart()].join(' '),
    edited: true,
    speaker: first.speaker,
    words: [...(first.words ?? []), ...(second.words ?? [])],
    phrases: undefined,
    complexity: undefined,
  }

  segments.splice(segmentIndex, 2, merged)

  const now = new Date().toISOString()
  const stmt = db.prepare('UPDATE transcripts SET segments = ?, updatedAt = ? WHERE id = ?')
  stmt.run(JSON.stringify(segments), now, id)
}

export function splitSegment(id: string, segmentIndex: number, wordIndex: number): void {
  const db = getDatabase()
  const transcript = getTranscriptById(id)
  if (!transcript) throw new Error(`Transcript not found: ${id}`)

  const segments = [...transcript.segments]
  if (segmentIndex < 0 || segmentIndex >= segments.length) {
    throw new Error(`Cannot split at index ${segmentIndex}: out of bounds`)
  }

  const segment = segments[segmentIndex]
  if (!segment.words || wordIndex <= 0 || wordIndex >= segment.words.length) {
    throw new Error(`Cannot split at word index ${wordIndex}: out of bounds`)
  }

  const firstWords = segment.words.slice(0, wordIndex)
  const secondWords = segment.words.slice(wordIndex)

  const firstSegment: Segment = {
    start: segment.start,
    end: firstWords[firstWords.length - 1].end,
    text: firstWords.map((w) => w.word).join(' '),
    edited: true,
    speaker: segment.speaker,
    words: firstWords,
    phrases: undefined,
    complexity: undefined,
  }

  const secondSegment: Segment = {
    start: secondWords[0].start,
    end: segment.end,
    text: secondWords.map((w) => w.word).join(' '),
    edited: true,
    speaker: segment.speaker,
    words: secondWords,
    phrases: undefined,
    complexity: undefined,
  }

  segments.splice(segmentIndex, 1, firstSegment, secondSegment)

  const now = new Date().toISOString()
  const stmt = db.prepare('UPDATE transcripts SET segments = ?, updatedAt = ? WHERE id = ?')
  stmt.run(JSON.stringify(segments), now, id)
}
