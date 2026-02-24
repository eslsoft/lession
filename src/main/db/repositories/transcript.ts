import crypto from 'node:crypto'
import { getDatabase } from '../index'
import type { Transcript, Segment } from '../../../shared/types'

interface TranscriptRow {
  id: string
  episodeId: string
  language: string
  status: Transcript['status']
  segments: string
  createdAt: string
  updatedAt: string
}

function rowToTranscript(row: TranscriptRow): Transcript {
  return {
    id: row.id,
    episodeId: row.episodeId,
    language: row.language,
    status: row.status,
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
    INSERT INTO transcripts (id, episodeId, language, status, segments, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(id, data.episodeId, data.language, data.status, JSON.stringify(data.segments), now, now)

  return getTranscriptById(id)!
}

function getTranscriptById(id: string): Transcript | null {
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

  if ('status' in data) {
    sets.push('status = ?')
    values.push(data.status)
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
