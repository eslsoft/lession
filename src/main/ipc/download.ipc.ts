import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { listDownloads } from '../db/repositories/download'
import {
  startDownload,
  startBatchDownload,
  cancelDownload,
  pauseDownload,
  resumeDownload,
  retryDownload,
  removeDownload,
  clearCompletedDownloads,
  retryAllFailedDownloads,
  openDownloadFile,
  showDownloadInFolder,
} from '../services/downloader'

export function registerDownloadIpc(): void {
  ipcMain.handle(IPC.DOWNLOAD_LIST, () => {
    return listDownloads()
  })

  ipcMain.handle(IPC.DOWNLOAD_START, (_event, urlOrUrls: string | string[]) => {
    if (Array.isArray(urlOrUrls)) {
      return startBatchDownload(urlOrUrls)
    }
    return startDownload(urlOrUrls)
  })

  ipcMain.handle(IPC.DOWNLOAD_CANCEL, (_event, id: string) => {
    cancelDownload(id)
  })

  ipcMain.handle(IPC.DOWNLOAD_PAUSE, (_event, id: string) => {
    pauseDownload(id)
  })

  ipcMain.handle(IPC.DOWNLOAD_RESUME, (_event, id: string) => {
    resumeDownload(id)
  })

  ipcMain.handle(IPC.DOWNLOAD_RETRY, (_event, id: string) => {
    return retryDownload(id)
  })

  ipcMain.handle(IPC.DOWNLOAD_DELETE, (_event, id: string, deleteFiles?: boolean) => {
    removeDownload(id, deleteFiles)
  })

  ipcMain.handle(IPC.DOWNLOAD_CLEAR_COMPLETED, (_event, deleteFiles?: boolean) => {
    clearCompletedDownloads(deleteFiles)
  })

  ipcMain.handle(IPC.DOWNLOAD_RETRY_ALL_FAILED, () => {
    retryAllFailedDownloads()
  })

  ipcMain.handle(IPC.DOWNLOAD_OPEN_FILE, (_event, id: string) => {
    openDownloadFile(id)
  })

  ipcMain.handle(IPC.DOWNLOAD_SHOW_IN_FOLDER, (_event, id: string) => {
    showDownloadInFolder(id)
  })
}
