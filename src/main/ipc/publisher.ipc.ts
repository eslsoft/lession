import { ipcMain } from 'electron'
import Store from 'electron-store'
import { IPC } from '../../shared/ipc-channels'
import { publishEpisode, unpublishEpisode, publishSeries, previewPublish } from '../services/publisher'
import type { AppConfig, PublishStatus } from '../../shared/types'

const store = new Store()

function getConfig(): AppConfig {
  const config = store.get('config') as AppConfig | undefined
  if (!config) throw new Error('App not configured. Please complete setup first.')
  return config
}

export function registerPublisherIpc(): void {
  ipcMain.handle(IPC.PUBLISHER_PUBLISH_EPISODE, async (_event, episodeId: string, targetStatus?: PublishStatus) => {
    return publishEpisode(episodeId, getConfig(), targetStatus)
  })

  ipcMain.handle(IPC.PUBLISHER_UNPUBLISH_EPISODE, async (_event, episodeId: string) => {
    return unpublishEpisode(episodeId, getConfig())
  })

  ipcMain.handle(IPC.PUBLISHER_PUBLISH_SERIES, async (_event, seriesId: string) => {
    return publishSeries(seriesId, getConfig())
  })

  ipcMain.handle(IPC.PUBLISHER_PREVIEW_FEED_ITEM, (_event, episodeId: string, mode: PublishStatus) => {
    return previewPublish(episodeId, mode)
  })
}
