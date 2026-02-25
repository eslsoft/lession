import { ipcMain } from 'electron'
import Store from 'electron-store'
import { IPC } from '../../shared/ipc-channels'
import { testConnection } from '../services/storage'
import type { AppConfig } from '../../shared/types'

const store = new Store()

export function registerConfigIpc(): void {
  ipcMain.handle(IPC.CONFIG_GET, () => {
    const config = store.get('config') as AppConfig | undefined
    if (!config) return null
    // Ensure replicate config exists for older configs
    if (!config.transcription.replicate) {
      config.transcription.replicate = { apiToken: '', model: 'victor-upmeet/whisperx' }
    }
    return config
  })

  ipcMain.handle(IPC.CONFIG_SET, (_event, config: AppConfig) => {
    store.set('config', config)
  })

  ipcMain.handle(IPC.CONFIG_TEST_S3, (_event, storage: AppConfig['storage']) => {
    return testConnection(storage)
  })
}
