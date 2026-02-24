import { create } from 'zustand'
import type { AppConfig } from '../../shared/types'

interface ConfigState {
  config: AppConfig | null
  loading: boolean
  initialized: boolean
  fetchConfig: () => Promise<void>
  saveConfig: (config: AppConfig) => Promise<void>
  testS3Connection: (storage: AppConfig['storage']) => Promise<boolean>
}

export const useConfigStore = create<ConfigState>((set) => ({
  config: null,
  loading: false,
  initialized: false,

  fetchConfig: async () => {
    set({ loading: true })
    try {
      const config = await window.electronAPI.config.get()
      set({ config, loading: false, initialized: true })
    } catch {
      set({ loading: false, initialized: true })
    }
  },

  saveConfig: async (config) => {
    await window.electronAPI.config.set(config)
    set({ config })
  },

  testS3Connection: async (storage) => {
    return await window.electronAPI.config.testS3(storage)
  },
}))
