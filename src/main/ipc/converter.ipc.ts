import { ipcMain, app, BrowserWindow } from 'electron'
import path from 'node:path'
import { IPC } from '../../shared/ipc-channels'
import { getEpisode, updateEpisode, updateEpisodeStatus } from '../db/repositories/episode'
import { convertToM4a } from '../services/converter'
import { getMediaMetadata } from '../services/splitter'

export function registerConverterIpc(): void {
  ipcMain.handle(IPC.CONVERTER_CONVERT, async (_event, episodeId: string) => {
    const episode = getEpisode(episodeId)
    if (!episode) throw new Error(`Episode not found: ${episodeId}`)
    if (!episode.localPath) throw new Error(`Episode has no local file: ${episodeId}`)

    // Already M4A — nothing to do
    if (path.extname(episode.localPath).toLowerCase() === '.m4a') return

    const mainWindow = BrowserWindow.getAllWindows()[0]

    function emitProgress(percent: number): void {
      mainWindow?.webContents.send(IPC.TRANSCRIPTION_PROGRESS, {
        episodeId,
        stage: 'converting',
        percent,
      })
    }

    updateEpisodeStatus(episodeId, 'converting')
    emitProgress(0)

    try {
      const metadata = await getMediaMetadata(episode.localPath)
      const outputDir = path.join(app.getPath('userData'), 'episodes', episode.seriesId)
      const m4aPath = await convertToM4a(episode.localPath, outputDir, metadata.duration, emitProgress)

      // Only transition to 'ready' if still in 'converting' state
      // (cached transcript may have already moved it to 'transcribed')
      const current = getEpisode(episodeId)
      const newStatus = current?.status === 'converting' ? 'ready' : current?.status
      updateEpisode(episodeId, { localPath: m4aPath, ...(newStatus ? { status: newStatus } : {}) })
      // Signal completion — reuse the same pattern as transcription
      mainWindow?.webContents.send(IPC.TRANSCRIPTION_PROGRESS, {
        episodeId,
        stage: 'converting',
        percent: 100,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const current = getEpisode(episodeId)
      updateEpisode(episodeId, {
        ...(current?.status === 'converting' ? { status: 'ready' } : {}),
        lastError: { message, occurredAt: new Date().toISOString() },
      })
      // Clear progress on error
      mainWindow?.webContents.send(IPC.TRANSCRIPTION_PROGRESS, {
        episodeId,
        stage: 'converting',
        percent: -1,
      })
    }
  })
}
