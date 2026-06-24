import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import type { Segment } from '../../../shared/types'

export interface CachedTranscript {
  filePath: string
  language: string
  segments: Segment[]
  createdAt: string
  source?: 'generated' | 'imported'
}

function getCacheDir(): string {
  const dir = path.join(app.getPath('userData'), 'transcript-cache')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getCachePath(filePath: string): string {
  const hash = crypto.createHash('sha256').update(filePath).digest('hex')
  return path.join(getCacheDir(), `${hash}.json`)
}

export function getCachedTranscript(filePath: string): CachedTranscript | null {
  const cachePath = getCachePath(filePath)
  if (!fs.existsSync(cachePath)) return null
  const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
  return data as CachedTranscript
}

export function saveCachedTranscript(
  filePath: string,
  language: string,
  segments: Segment[],
  source: CachedTranscript['source'] = 'generated',
): void {
  const data: CachedTranscript = { filePath, language, segments, createdAt: new Date().toISOString(), source }
  fs.writeFileSync(getCachePath(filePath), JSON.stringify(data))
}

export function hasCachedTranscript(filePath: string): boolean {
  return fs.existsSync(getCachePath(filePath))
}
