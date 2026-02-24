import { ipcMain, app } from 'electron'
import path from 'node:path'
import * as fs from 'node:fs/promises'
import Store from 'electron-store'
import { IPC } from '../../shared/ipc-channels'
import { listSeries, getSeries, createSeries, updateSeries, deleteSeries } from '../db/repositories/series'
import { createS3Client, uploadFile } from '../services/storage'
import type { Series, AppConfig } from '../../shared/types'

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

  ipcMain.handle(IPC.SERIES_DELETE, (_event, id: string) => {
    deleteSeries(id)
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
    const s3Key = `${seriesId}/cover${ext}`
    await uploadFile(s3, config.storage.bucket, s3Key, destPath)
    // Update DB
    return updateSeries(seriesId, { coverPath: destPath })
  })
}
