import { ipcMain, app } from 'electron'
import path from 'node:path'
import { IPC } from '../../shared/ipc-channels'
import { getMediaMetadata, splitFile } from '../services/splitter'
import { createEpisode, getNextOrder } from '../db/repositories/episode'
import type { Episode } from '../../shared/types'

export function registerSplitterIpc(): void {
  ipcMain.handle(IPC.SPLITTER_GET_METADATA, (_event, filePath: string) => {
    return getMediaMetadata(filePath)
  })

  ipcMain.handle(IPC.SPLITTER_SPLIT, async (_event, filePath: string, markers: { start: number; end: number; title: string }[], seriesId: string) => {
    const metadata = await getMediaMetadata(filePath)
    const outputDir = path.join(app.getPath('userData'), 'episodes', seriesId)
    const outputPaths = await splitFile(filePath, markers, outputDir)

    const isVideo = metadata.hasVideo
    const episodes: Episode[] = []

    for (let i = 0; i < markers.length; i++) {
      const nextOrder = getNextOrder(seriesId)
      const episode = createEpisode({
        seriesId,
        title: markers[i].title,
        order: nextOrder,
        mimeType: isVideo ? 'video' : 'audio',
        localPath: outputPaths[i],
        duration: markers[i].end - markers[i].start,
        source: { type: 'local', origin: filePath },
        status: 'ready_to_process',
        publishStatus: 'draft',
      })
      episodes.push(episode)
    }

    return episodes
  })
}
