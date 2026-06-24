import { ipcMain } from 'electron'
import Store from 'electron-store'
import { IPC } from '../../shared/ipc-channels'
import { listEpisodes, getEpisode, createEpisode, updateEpisode, deleteEpisode } from '../db/repositories/episode'
import { cleanupDeletedEpisodePublication } from '../services/publisher'
import type { AppConfig, Episode, EpisodeCreateInput, PublishStatus } from '../../shared/types'

const store = new Store()

function getConfig(): AppConfig {
  const config = store.get('config') as AppConfig | undefined
  if (!config) throw new Error('App not configured. Please complete setup first.')
  return config
}

export function registerEpisodeIpc(): void {
  ipcMain.handle(IPC.EPISODE_LIST, (_event, seriesId: string) => {
    return listEpisodes(seriesId)
  })

  ipcMain.handle(IPC.EPISODE_GET, (_event, id: string) => {
    return getEpisode(id)
  })

  ipcMain.handle(IPC.EPISODE_CREATE, (_event, data: EpisodeCreateInput) => {
    return createEpisode(data)
  })

  ipcMain.handle(IPC.EPISODE_UPDATE, (_event, id: string, data: Partial<Episode>) => {
    return updateEpisode(id, data)
  })

  ipcMain.handle(IPC.EPISODE_DELETE, async (_event, id: string) => {
    const episode = getEpisode(id)
    const needsPublicationCleanup = episode && (episode.publishStatus !== 'draft' || episode.remoteUrl)
    const config = needsPublicationCleanup ? getConfig() : null
    deleteEpisode(id)
    if (episode && config) await cleanupDeletedEpisodePublication(episode, config)
  })

  ipcMain.handle(IPC.EPISODE_PUBLISH, (_event, id: string, status: PublishStatus) => {
    return updateEpisode(id, { publishStatus: status })
  })
}
