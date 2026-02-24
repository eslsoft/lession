import { create } from 'zustand'
import type { Episode } from '../../shared/types'

interface EpisodeState {
  episodes: Episode[]
  currentEpisode: Episode | null
  loading: boolean
  error: string | null
  fetchEpisodes: (seriesId: string) => Promise<void>
  fetchEpisode: (id: string) => Promise<void>
  createEpisode: (data: Omit<Episode, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Episode>
  updateEpisode: (id: string, data: Partial<Episode>) => Promise<void>
  deleteEpisode: (id: string) => Promise<void>
}

export const useEpisodeStore = create<EpisodeState>((set) => ({
  episodes: [],
  currentEpisode: null,
  loading: false,
  error: null,

  fetchEpisodes: async (seriesId) => {
    set({ loading: true, error: null })
    try {
      const episodes = await window.electronAPI.episode.list(seriesId)
      set({ episodes, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  fetchEpisode: async (id) => {
    set({ loading: true, error: null })
    try {
      const episode = await window.electronAPI.episode.get(id)
      set({ currentEpisode: episode, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  createEpisode: async (data) => {
    const episode = await window.electronAPI.episode.create(data)
    set((state) => ({ episodes: [...state.episodes, episode] }))
    return episode
  },

  updateEpisode: async (id, data) => {
    const updated = await window.electronAPI.episode.update(id, data)
    set((state) => ({
      episodes: state.episodes.map((e) => (e.id === id ? updated : e)),
      currentEpisode: state.currentEpisode?.id === id ? updated : state.currentEpisode,
    }))
  },

  deleteEpisode: async (id) => {
    await window.electronAPI.episode.delete(id)
    set((state) => ({
      episodes: state.episodes.filter((e) => e.id !== id),
      currentEpisode: state.currentEpisode?.id === id ? null : state.currentEpisode,
    }))
  },
}))
