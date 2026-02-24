import { create } from 'zustand'
import type { Download } from '../../shared/types'

interface DownloadState {
  downloads: Download[]
  loading: boolean
  error: string | null
  fetchDownloads: () => Promise<void>
  startDownload: (url: string) => Promise<Download>
  cancelDownload: (id: string) => Promise<void>
  retryDownload: (id: string) => Promise<void>
  updateProgress: (id: string, progress: number) => void
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

  cancelDownload: async (id) => {
    await window.electronAPI.download.cancel(id)
    set((state) => ({
      downloads: state.downloads.filter((d) => d.id !== id),
    }))
  },

  retryDownload: async (id) => {
    await window.electronAPI.download.retry(id)
  },

  updateProgress: (id, progress) => {
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id ? { ...d, progress, status: 'downloading' as const } : d
      ),
    }))
  },
}))
