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

    // Remember the status before converting so we can restore it afterwards
    const statusBeforeConvert = episode.status
    updateEpisodeStatus(episodeId, 'converting')
    emitProgress(0)

    try {
      const metadata = await getMediaMetadata(episode.localPath)
      const outputDir = path.join(app.getPath('userData'), 'episodes', episode.seriesId)
      const m4aPath = await convertToM4a(episode.localPath, outputDir, metadata.duration, emitProgress)

      // Restore the original status (e.g. 'transcribed' stays 'transcribed')
      // Clear remoteUrl so next publish will re-upload the new M4A file
      const restoreStatus = statusBeforeConvert === 'converting' ? 'ready' : statusBeforeConvert
      updateEpisode(episodeId, { localPath: m4aPath, remoteUrl: undefined, status: restoreStatus })
      mainWindow?.webContents.send(IPC.TRANSCRIPTION_PROGRESS, {
        episodeId,
        stage: 'converting',
        percent: 100,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Restore original status on error too
      const restoreStatus = statusBeforeConvert === 'converting' ? 'ready' : statusBeforeConvert
      updateEpisode(episodeId, {
        status: restoreStatus,
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
