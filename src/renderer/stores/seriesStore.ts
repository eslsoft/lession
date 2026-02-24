import { create } from 'zustand'
import type { Series } from '../../shared/types'

interface SeriesState {
  series: Series[]
  loading: boolean
  error: string | null
  fetchSeries: () => Promise<void>
  createSeries: (data: Omit<Series, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Series>
  updateSeries: (id: string, data: Partial<Series>) => Promise<void>
  deleteSeries: (id: string) => Promise<void>
}

export const useSeriesStore = create<SeriesState>((set) => ({
  series: [],
  loading: false,
  error: null,

  fetchSeries: async () => {
    set({ loading: true, error: null })
    try {
      const series = await window.electronAPI.series.list()
      set({ series, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  createSeries: async (data) => {
    const series = await window.electronAPI.series.create(data)
    set((state) => ({ series: [...state.series, series] }))
    return series
  },

  updateSeries: async (id, data) => {
    const updated = await window.electronAPI.series.update(id, data)
    set((state) => ({
      series: state.series.map((s) => (s.id === id ? updated : s)),
    }))
  },

  deleteSeries: async (id) => {
    await window.electronAPI.series.delete(id)
    set((state) => ({
      series: state.series.filter((s) => s.id !== id),
    }))
  },
}))
