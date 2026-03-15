import { ipcMain, app } from 'electron'
import path from 'node:path'
import * as fs from 'node:fs/promises'
import Store from 'electron-store'
import { IPC } from '../../shared/ipc-channels'
import { listSeries, getSeries, createSeries, updateSeries, deleteSeries } from '../db/repositories/series'
import { createS3Client, uploadFile, uploadJson, deletePrefix, s3Keys } from '../services/storage'
import { listEpisodes } from '../db/repositories/episode'
import { generateIndexJson } from '../services/publisher'
import type { Series, AppConfig, Episode } from '../../shared/types'

const store = new Store()

function getConfig(): AppConfig {
  const config = store.get('config') as AppConfig | undefined
  if (!config) throw new Error('App not configured. Please complete setup first.')
  return config
}

export function registerSeriesIpc(): void {
  ipcMain.handle(IPC.SERIES_LIST, () => {
    return listSeries()
  })

  ipcMain.handle(IPC.SERIES_GET, (_event, id: string) => {
    return getSeries(id)
  })

  ipcMain.handle(IPC.SERIES_CREATE, (_event, data: Omit<Series, 'id' | 'createdAt' | 'updatedAt'>) => {
    return createSeries(data)
  })

  ipcMain.handle(IPC.SERIES_UPDATE, (_event, id: string, data: Partial<Series>) => {
    return updateSeries(id, data)
  })

  ipcMain.handle(IPC.SERIES_DELETE, async (_event, id: string) => {
    // Clean up S3 files for this series (cover, episodes, feed)
    try {
      const config = getConfig()
      const s3 = createS3Client(config.storage)
      await deletePrefix(s3, config.storage.bucket, `series/${id}/`)
    } catch {
      // S3 cleanup is best-effort; proceed with local deletion
    }

    // Clean up local episode files
    const episodesDir = path.join(app.getPath('userData'), 'episodes', id)
    await fs.rm(episodesDir, { recursive: true, force: true }).catch(() => { /* ignore */ })

    // Clean up local cover
    const coversDir = path.join(app.getPath('userData'), 'covers')
    const coverFiles = await fs.readdir(coversDir).catch(() => [] as string[])
    for (const f of coverFiles) {
      if (f.startsWith(id)) {
        await fs.rm(path.join(coversDir, f)).catch(() => { /* ignore */ })
      }
    }

    // Delete from database (cascades to episodes, transcripts, book_imports)
    deleteSeries(id)

    // Regenerate index.json to remove deleted series
    try {
      const config = getConfig()
      const s3 = createS3Client(config.storage)
      const allSeries = listSeries()
      const episodesMap = new Map<string, Episode[]>()
      for (const s of allSeries) {
        episodesMap.set(s.id, listEpisodes(s.id))
      }
      const index = generateIndexJson(allSeries, episodesMap)
      await uploadJson(s3, config.storage.bucket, s3Keys.index(), index)
    } catch {
      // Best-effort index regeneration
    }
  })

  ipcMain.handle(IPC.SERIES_UPLOAD_COVER, async (_event, seriesId: string, sourcePath: string) => {
    const ext = path.extname(sourcePath)
    const destDir = path.join(app.getPath('userData'), 'covers')
    await fs.mkdir(destDir, { recursive: true })
    const destPath = path.join(destDir, `${seriesId}${ext}`)
    await fs.copyFile(sourcePath, destPath)
    // Upload to S3
    const config = getConfig()
    const s3 = createS3Client(config.storage)
    const s3Key = s3Keys.seriesCover(seriesId, ext)
    await uploadFile(s3, config.storage.bucket, s3Key, destPath)
    // Update DB
    return updateSeries(seriesId, { coverPath: destPath })
  })
}
