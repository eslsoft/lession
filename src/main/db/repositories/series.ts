import crypto from 'node:crypto'
import { getDatabase } from '../index'
import type { Series } from '../../../shared/types'

export function listSeries(): Series[] {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM series ORDER BY createdAt DESC')
  return stmt.all() as Series[]
}

export function getSeries(id: string): Series | null {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM series WHERE id = ?')
  return (stmt.get(id) as Series) ?? null
}

export function createSeries(data: Omit<Series, 'id' | 'createdAt' | 'updatedAt'>): Series {
  const db = getDatabase()
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  const stmt = db.prepare(`
    INSERT INTO series (id, title, description, coverPath, type, language, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(id, data.title, data.description ?? null, data.coverPath ?? null, data.type, data.language, now, now)

  return getSeries(id)!
}

export function updateSeries(id: string, data: Partial<Series>): Series {
  const db = getDatabase()
  const now = new Date().toISOString()

  const allowedFields = ['title', 'description', 'coverPath', 'type', 'language'] as const
  const sets: string[] = []
  const values: unknown[] = []

  for (const field of allowedFields) {
    if (field in data) {
      sets.push(`${field} = ?`)
      values.push(data[field] ?? null)
    }
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
