import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { checkAllTools } from '../services/env-check'

export function registerEnvIpc(): void {
  ipcMain.handle(IPC.ENV_CHECK_ALL, () => checkAllTools())
}
