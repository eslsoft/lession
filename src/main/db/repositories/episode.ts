import crypto from 'node:crypto'
import { getDatabase } from '../index'
import type { Episode, EpisodeStatus, PublishStatus } from '../../../shared/types'

interface EpisodeRow {
  id: string
  seriesId: string
  title: string
  description: string | null
  order: number
  mimeType: 'audio' | 'video'
  localPath: string | null
  remoteUrl: string | null
  duration: number | null
  sourceType: string | null
  sourceOrigin: string | null
  status: EpisodeStatus
  publishStatus: PublishStatus
  lastErrorMessage: string | null
  lastErrorOccurredAt: string | null
  createdAt: string
  updatedAt: string
}

function rowToEpisode(row: EpisodeRow): Episode {
  const episode: Episode = {
    id: row.id,
    seriesId: row.seriesId,
    title: row.title,
    description: row.description ?? undefined,
    order: row.order,
    mimeType: row.mimeType,
    localPath: row.localPath ?? undefined,
    remoteUrl: row.remoteUrl ?? undefined,
    duration: row.duration ?? undefined,
    status: row.status,
    publishStatus: row.publishStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }

  if (row.sourceType) {
    episode.source = {
      type: row.sourceType as 'url' | 'local' | 'direct',
      origin: row.sourceOrigin ?? undefined,
    }
  }

  if (row.lastErrorMessage) {
    episode.lastError = {
      message: row.lastErrorMessage,
      occurredAt: row.lastErrorOccurredAt!,
    }
  }

  return episode
}

export function listEpisodes(seriesId: string): Episode[] {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM episodes WHERE seriesId = ? ORDER BY "order" ASC')
  const rows = stmt.all(seriesId) as EpisodeRow[]
  return rows.map(rowToEpisode)
}

export function getEpisode(id: string): Episode | null {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM episodes WHERE id = ?')
  const row = stmt.get(id) as EpisodeRow | undefined
  return row ? rowToEpisode(row) : null
}

export function createEpisode(data: Omit<Episode, 'id' | 'createdAt' | 'updatedAt'>): Episode {
  const db = getDatabase()
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  const stmt = db.prepare(`
    INSERT INTO episodes (id, seriesId, title, description, "order", mimeType, localPath, remoteUrl, duration, sourceType, sourceOrigin, status, publishStatus, lastErrorMessage, lastErrorOccurredAt, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    id,
    data.seriesId,
    data.title,
    data.description ?? null,
    data.order,
    data.mimeType,
    data.localPath ?? null,
    data.remoteUrl ?? null,
    data.duration ?? null,
    data.source?.type ?? null,
    data.source?.origin ?? null,
    data.status,
    data.publishStatus,
    data.lastError?.message ?? null,
    data.lastError?.occurredAt ?? null,
    now,
    now,
  )

  return getEpisode(id)!
}

export function updateEpisode(id: string, data: Partial<Episode>): Episode {
  const db = getDatabase()
  const now = new Date().toISOString()

  const sets: string[] = []
  const values: unknown[] = []

  const simpleFields = ['seriesId', 'title', 'description', 'mimeType', 'localPath', 'remoteUrl', 'duration', 'status', 'publishStatus'] as const
  for (const field of simpleFields) {
    if (field in data) {
      sets.push(`${field} = ?`)
      values.push(data[field] ?? null)
    }
  }

  if ('order' in data) {
    sets.push('"order" = ?')
    values.push(data.order)
  }

  if ('source' in data) {
    sets.push('sourceType = ?')
    values.push(data.source?.type ?? null)
    sets.push('sourceOrigin = ?')
    values.push(data.source?.origin ?? null)
  }

  if ('lastError' in data) {
    sets.push('lastErrorMessage = ?')
    values.push(data.lastError?.message ?? null)
    sets.push('lastErrorOccurredAt = ?')
    values.push(data.lastError?.occurredAt ?? null)
  }

  sets.push('updatedAt = ?')
  values.push(now)
  values.push(id)

  const stmt = db.prepare(`UPDATE episodes SET ${sets.join(', ')} WHERE id = ?`)
  stmt.run(...values)

  return getEpisode(id)!
}

export function deleteEpisode(id: string): void {
  const db = getDatabase()
  const stmt = db.prepare('DELETE FROM episodes WHERE id = ?')
  stmt.run(id)
}

export function getNextOrder(seriesId: string): number {
  const db = getDatabase()
  const stmt = db.prepare('SELECT COALESCE(MAX("order"), -1) + 1 AS nextOrder FROM episodes WHERE seriesId = ?')
  const row = stmt.get(seriesId) as { nextOrder: number }
  return row.nextOrder
}

export function updateEpisodeStatus(id: string, status: EpisodeStatus): void {
  const db = getDatabase()
  const now = new Date().toISOString()
  const stmt = db.prepare('UPDATE episodes SET status = ?, updatedAt = ? WHERE id = ?')
  stmt.run(status, now, id)
}

export function updatePublishStatus(id: string, publishStatus: PublishStatus): void {
  const db = getDatabase()
  const now = new Date().toISOString()
  const stmt = db.prepare('UPDATE episodes SET publishStatus = ?, updatedAt = ? WHERE id = ?')
  stmt.run(publishStatus, now, id)
}
