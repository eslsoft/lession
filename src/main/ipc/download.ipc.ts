import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { listDownloads } from '../db/repositories/download'
import { startDownload, cancelDownload, retryDownload } from '../services/downloader'

export function registerDownloadIpc(): void {
  ipcMain.handle(IPC.DOWNLOAD_LIST, () => {
    return listDownloads()
  })

  ipcMain.handle(IPC.DOWNLOAD_START, (_event, url: string) => {
    return startDownload(url)
  })

  ipcMain.handle(IPC.DOWNLOAD_CANCEL, (_event, id: string) => {
    cancelDownload(id)
  })

  ipcMain.handle(IPC.DOWNLOAD_RETRY, (_event, id: string) => {
    return retryDownload(id)
  })
}
