import crypto from 'node:crypto'
import { getDatabase } from '../index'
import type { Download } from '../../../shared/types'

interface DownloadRow {
  id: string
  url: string
  filename: string
  localPath: string | null
  status: Download['status']
  progress: number
  speed: string | null
  eta: string | null
  fileSize: string | null
  title: string | null
  thumbnailUrl: string | null
  duration: number | null
  chapters: string | null
  lastError: string | null
  createdAt: string
}

function rowToDownload(row: DownloadRow): Download {
  return {
    id: row.id,
    url: row.url,
    filename: row.filename,
    localPath: row.localPath ?? undefined,
    status: row.status,
    progress: row.progress,
    speed: row.speed ?? undefined,
    eta: row.eta ?? undefined,
    fileSize: row.fileSize ?? undefined,
    title: row.title ?? undefined,
    thumbnailUrl: row.thumbnailUrl ?? undefined,
    duration: row.duration ?? undefined,
    chapters: row.chapters ? JSON.parse(row.chapters) : undefined,
    lastError: row.lastError ?? undefined,
    createdAt: row.createdAt,
  }
}

export function listDownloads(): Download[] {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM downloads ORDER BY createdAt DESC')
  const rows = stmt.all() as DownloadRow[]
  return rows.map(rowToDownload)
}

export function getDownload(id: string): Download | null {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM downloads WHERE id = ?')
  const row = stmt.get(id) as DownloadRow | undefined
  return row ? rowToDownload(row) : null
}

export function createDownload(data: Omit<Download, 'id' | 'createdAt'>): Download {
  const db = getDatabase()
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  const stmt = db.prepare(`
    INSERT INTO downloads (id, url, filename, localPath, status, progress, speed, eta, fileSize, title, thumbnailUrl, duration, chapters, lastError, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    id,
    data.url,
    data.filename,
    data.localPath ?? null,
    data.status,
    data.progress,
    data.speed ?? null,
    data.eta ?? null,
    data.fileSize ?? null,
    data.title ?? null,
    data.thumbnailUrl ?? null,
    data.duration ?? null,
    data.chapters ? JSON.stringify(data.chapters) : null,
    data.lastError ?? null,
    now,
  )

  return getDownload(id)!
}

export function updateDownload(id: string, data: Partial<Download>): Download {
  const db = getDatabase()

  const sets: string[] = []
  const values: unknown[] = []

  const simpleFields = ['url', 'filename', 'localPath', 'status', 'progress', 'speed', 'eta', 'fileSize', 'title', 'thumbnailUrl', 'duration', 'lastError'] as const
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

  if (sets.length === 0) return getDownload(id)!

  values.push(id)
  const stmt = db.prepare(`UPDATE downloads SET ${sets.join(', ')} WHERE id = ?`)
  stmt.run(...values)

  return getDownload(id)!
}

export function resetInterruptedDownloads(): void {
  const db = getDatabase()
  db.prepare("UPDATE downloads SET status = 'pending', progress = 0, speed = NULL, eta = NULL WHERE status IN ('downloading', 'converting')").run()
}

export function listPendingDownloads(): Download[] {
  const db = getDatabase()
  const stmt = db.prepare("SELECT * FROM downloads WHERE status = 'pending' ORDER BY createdAt ASC")
  const rows = stmt.all() as DownloadRow[]
  return rows.map(rowToDownload)
}

export function deleteDownload(id: string): void {
  const db = getDatabase()
  const stmt = db.prepare('DELETE FROM downloads WHERE id = ?')
  stmt.run(id)
}

export function deleteCompletedDownloads(): number {
  const db = getDatabase()
  const result = db.prepare("DELETE FROM downloads WHERE status = 'done'").run()
  return result.changes
}

export function listFailedDownloads(): Download[] {
  const db = getDatabase()
  const stmt = db.prepare("SELECT * FROM downloads WHERE status = 'error' ORDER BY createdAt ASC")
  const rows = stmt.all() as DownloadRow[]
  return rows.map(rowToDownload)
}
