import { create } from 'zustand'
import type { Download, DownloadProgressInfo } from '../../shared/types'

interface DownloadState {
  downloads: Download[]
  loading: boolean
  error: string | null
  fetchDownloads: () => Promise<void>
  startDownload: (url: string) => Promise<Download>
  startBatchDownload: (urls: string[]) => Promise<Download[]>
  cancelDownload: (id: string) => Promise<void>
  pauseDownload: (id: string) => Promise<void>
  resumeDownload: (id: string) => Promise<void>
  retryDownload: (id: string) => Promise<void>
  deleteDownload: (id: string, deleteFiles?: boolean) => Promise<void>
  clearCompleted: (deleteFiles?: boolean) => Promise<void>
  retryAllFailed: () => Promise<void>
  openFile: (id: string) => Promise<void>
  showInFolder: (id: string) => Promise<void>
  updateProgress: (info: DownloadProgressInfo) => void
}

export const useDownloadStore = create<DownloadState>((set) => ({
  downloads: [],
  loading: false,
  error: null,

  fetchDownloads: async () => {
    set({ loading: true, error: null })
    try {
      const downloads = await window.electronAPI.download.list()
      set({ downloads, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  startDownload: async (url) => {
    const download = await window.electronAPI.download.start(url)
    set((state) => ({ downloads: [download, ...state.downloads] }))
    return download
  },

  startBatchDownload: async (urls) => {
    const downloads = await window.electronAPI.download.startBatch(urls)
    set((state) => ({ downloads: [...downloads, ...state.downloads] }))
    return downloads
  },

  cancelDownload: async (id) => {
    await window.electronAPI.download.cancel(id)
    set((state) => ({
      downloads: state.downloads.filter((d) => d.id !== id),
    }))
  },

  pauseDownload: async (id) => {
    await window.electronAPI.download.pause(id)
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id ? { ...d, status: 'paused' as const, speed: undefined, eta: undefined } : d
      ),
    }))
  },

  resumeDownload: async (id) => {
    await window.electronAPI.download.resume(id)
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id ? { ...d, status: 'pending' as const } : d
      ),
    }))
  },

  retryDownload: async (id) => {
    await window.electronAPI.download.retry(id)
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id ? { ...d, status: 'pending' as const, progress: 0, lastError: undefined } : d
      ),
    }))
  },

  deleteDownload: async (id, deleteFiles) => {
    await window.electronAPI.download.delete(id, deleteFiles)
    set((state) => ({
      downloads: state.downloads.filter((d) => d.id !== id),
    }))
  },

  clearCompleted: async (deleteFiles) => {
    await window.electronAPI.download.clearCompleted(deleteFiles)
    set((state) => ({
      downloads: state.downloads.filter((d) => d.status !== 'done'),
    }))
  },

  retryAllFailed: async () => {
    await window.electronAPI.download.retryAllFailed()
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.status === 'error' ? { ...d, status: 'pending' as const, progress: 0, lastError: undefined } : d
      ),
    }))
  },

  openFile: async (id) => {
    await window.electronAPI.download.openFile(id)
  },

  showInFolder: async (id) => {
    await window.electronAPI.download.showInFolder(id)
  },

  updateProgress: (info) => {
    const { id, progress, speed, eta, fileSize, title, duration } = info
    if (info.status === 'done' || info.status === 'error') {
      // Terminal state — refetch from DB to get final fields (fileSize, lastError, etc.)
      window.electronAPI.download.list().then((downloads) => set({ downloads }))
      return
    }
    set((state) => ({
      downloads: state.downloads.map((d) => {
        if (d.id !== id) return d
        // Use explicit status from main if provided, otherwise promote pending→downloading
        const status = info.status || (d.status === 'pending' ? 'downloading' as const : d.status)
        return {
          ...d,
          status,
          progress,
          speed,
          eta,
          fileSize: fileSize || d.fileSize,
          title: title || d.title,
          duration: duration || d.duration,
        }
      }),
    }))
  },
}))
