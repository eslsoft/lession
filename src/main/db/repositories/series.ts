import crypto from 'node:crypto'
import { getDatabase } from '../index'
import type { Series, SeriesLevel } from '../../../shared/types'

interface SeriesRow {
  id: string
  title: string
  description: string | null
  coverPath: string | null
  type: Series['type']
  language: string
  authors: string | null   // JSON array
  category: string | null
  tags: string | null      // JSON array
  level: SeriesLevel | null
  createdAt: string
  updatedAt: string
}

function rowToSeries(row: SeriesRow): Series {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    coverPath: row.coverPath ?? undefined,
    type: row.type,
    language: row.language,
    authors: row.authors ? JSON.parse(row.authors) : undefined,
    category: row.category ?? undefined,
    tags: row.tags ? JSON.parse(row.tags) : undefined,
    level: row.level ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function listSeries(): Series[] {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM series ORDER BY createdAt DESC')
  return (stmt.all() as SeriesRow[]).map(rowToSeries)
}

export function getSeries(id: string): Series | null {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM series WHERE id = ?')
  const row = stmt.get(id) as SeriesRow | undefined
  return row ? rowToSeries(row) : null
}

export function createSeries(data: Omit<Series, 'id' | 'createdAt' | 'updatedAt'>): Series {
  const db = getDatabase()
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  const stmt = db.prepare(`
    INSERT INTO series (id, title, description, coverPath, type, language, authors, category, tags, level, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    id,
    data.title,
    data.description ?? null,
    data.coverPath ?? null,
    data.type,
    data.language,
    data.authors?.length ? JSON.stringify(data.authors) : null,
    data.category ?? null,
    data.tags?.length ? JSON.stringify(data.tags) : null,
    data.level ?? null,
    now,
    now,
  )

  return getSeries(id)!
}

export function updateSeries(id: string, data: Partial<Series>): Series {
  const db = getDatabase()
  const now = new Date().toISOString()

  const sets: string[] = []
  const values: unknown[] = []

  // Simple text fields
  const simpleFields = ['title', 'description', 'coverPath', 'type', 'language', 'category', 'level'] as const
  for (const field of simpleFields) {
    if (field in data) {
      sets.push(`${field} = ?`)
      values.push(data[field] ?? null)
    }
  }

  // JSON array fields
  if ('authors' in data) {
    sets.push('authors = ?')
    values.push(data.authors?.length ? JSON.stringify(data.authors) : null)
  }
  if ('tags' in data) {
    sets.push('tags = ?')
    values.push(data.tags?.length ? JSON.stringify(data.tags) : null)
  }

  sets.push('updatedAt = ?')
  values.push(now)
  values.push(id)

  const stmt = db.prepare(`UPDATE series SET ${sets.join(', ')} WHERE id = ?`)
  stmt.run(...values)

  return getSeries(id)!
}

export function deleteSeries(id: string): void {
  const db = getDatabase()
  const stmt = db.prepare('DELETE FROM series WHERE id = ?')
  stmt.run(id)
}
