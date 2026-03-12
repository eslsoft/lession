import crypto from 'node:crypto'
import { getDatabase } from '../index'
import type { BookImport } from '../../../shared/types'

interface BookImportRow {
  id: string
  seriesId: string
  filePath: string
  epubPath: string | null
  status: BookImport['status']
  totalChapters: number
  completedChapters: number
  chapters: string | null
  lastError: string | null
  createdAt: string
}

function rowToBookImport(row: BookImportRow): BookImport {
  return {
    id: row.id,
    seriesId: row.seriesId,
    filePath: row.filePath,
    epubPath: row.epubPath ?? undefined,
    status: row.status,
    totalChapters: row.totalChapters,
    completedChapters: row.completedChapters,
    chapters: row.chapters ? JSON.parse(row.chapters) : undefined,
    lastError: row.lastError ?? undefined,
    createdAt: row.createdAt,
  }
}

export function listBookImports(seriesId: string): BookImport[] {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM book_imports WHERE seriesId = ? ORDER BY createdAt DESC')
  const rows = stmt.all(seriesId) as BookImportRow[]
  return rows.map(rowToBookImport)
}

export function getBookImport(id: string): BookImport | null {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM book_imports WHERE id = ?')
  const row = stmt.get(id) as BookImportRow | undefined
  return row ? rowToBookImport(row) : null
}

export function createBookImport(data: Omit<BookImport, 'id' | 'createdAt'>): BookImport {
  const db = getDatabase()
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  const stmt = db.prepare(`
    INSERT INTO book_imports (id, seriesId, filePath, epubPath, status, totalChapters, completedChapters, chapters, lastError, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    id,
    data.seriesId,
    data.filePath,
    data.epubPath ?? null,
    data.status,
    data.totalChapters,
    data.completedChapters,
    data.chapters ? JSON.stringify(data.chapters) : null,
    data.lastError ?? null,
    now,
  )

  return getBookImport(id)!
}

export function updateBookImport(id: string, data: Partial<BookImport>): BookImport {
  const db = getDatabase()

  const sets: string[] = []
  const values: unknown[] = []

  const simpleFields = ['seriesId', 'filePath', 'epubPath', 'status', 'totalChapters', 'completedChapters', 'lastError'] as const
  for (const field of simpleFields) {
    if (field in data) {
      sets.push(`${field} = ?`)
      values.push(data[field] ?? null)
    }
  }

  if ('chapters' in data) {
    sets.push('chapters = ?')
    values.push(data.chapters ? JSON.stringify(data.chapters) : null)
  }

  if (sets.length === 0) return getBookImport(id)!

  values.push(id)
  const stmt = db.prepare(`UPDATE book_imports SET ${sets.join(', ')} WHERE id = ?`)
  stmt.run(...values)

  return getBookImport(id)!
}

export function deleteBookImport(id: string): void {
  const db = getDatabase()
  const stmt = db.prepare('DELETE FROM book_imports WHERE id = ?')
  stmt.run(id)
}
