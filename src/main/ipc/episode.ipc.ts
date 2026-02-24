import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { listEpisodes, getEpisode, createEpisode, updateEpisode, deleteEpisode } from '../db/repositories/episode'
import type { Episode, PublishStatus } from '../../shared/types'

export function registerEpisodeIpc(): void {
  ipcMain.handle(IPC.EPISODE_LIST, (_event, seriesId: string) => {
    return listEpisodes(seriesId)
  })

  ipcMain.handle(IPC.EPISODE_GET, (_event, id: string) => {
    return getEpisode(id)
  })

  ipcMain.handle(IPC.EPISODE_CREATE, (_event, data: Omit<Episode, 'id' | 'createdAt' | 'updatedAt'>) => {
    return createEpisode(data)
  })

  ipcMain.handle(IPC.EPISODE_UPDATE, (_event, id: string, data: Partial<Episode>) => {
    return updateEpisode(id, data)
  })

  ipcMain.handle(IPC.EPISODE_DELETE, (_event, id: string) => {
    deleteEpisode(id)
  })

  ipcMain.handle(IPC.EPISODE_PUBLISH, (_event, id: string, status: PublishStatus) => {
    return updateEpisode(id, { publishStatus: status })
  })
}
