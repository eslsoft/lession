import { ipcMain } from 'electron'
import Store from 'electron-store'
import { IPC } from '../../shared/ipc-channels'
import { testConnection } from '../services/storage'
import type { AppConfig } from '../../shared/types'
import { BUILTIN_SERVICES } from '../../shared/types'

const store = new Store()

/** Ensure all builtin services exist, preserving user-edited options on builtins. */
function ensureBuiltins(services: AppConfig['services']): AppConfig['services'] {
  const result = [...services]
  for (const builtin of BUILTIN_SERVICES) {
    const existing = result.find((s) => s.id === builtin.id)
    if (!existing) {
      result.push(builtin)
    } else {
      // Ensure the builtin flag is always set
      existing.builtin = true
    }
  }
  return result
}

export function registerConfigIpc(): void {
  ipcMain.handle(IPC.CONFIG_GET, () => {
    const config = store.get('config') as AppConfig | undefined
    if (!config) return null
    config.services = ensureBuiltins(config.services ?? [])
    return config
  })

  ipcMain.handle(IPC.CONFIG_SET, (_event, config: AppConfig) => {
    // Ensure builtins are never removed on save
    config.services = ensureBuiltins(config.services ?? [])
    store.set('config', config)
  })

  ipcMain.handle(IPC.CONFIG_TEST_S3, (_event, storage: AppConfig['storage']) => {
    return testConnection(storage)
  })
}
