import type { ElectronAPI } from '../shared/types'

declare const __APP_VERSION__: string

declare global {
  const __APP_VERSION__: string
  interface Window {
    electronAPI: ElectronAPI
  }
}
