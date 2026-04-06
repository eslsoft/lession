import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { checkAllTools } from '../services/env-check'
import { isUvManagedTool, uvToolInstall, uvToolUpgrade, initUvToolPaths, type UvToolName } from '../services/uv-tools'
import type { ToolActionProgress } from '../../shared/types'

function broadcast(channel: string, data: ToolActionProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, data)
  }
}

async function runToolAction(
  name: UvToolName,
  stage: 'installing' | 'upgrading',
  action: typeof uvToolInstall,
): Promise<void> {
  broadcast(IPC.ENV_TOOL_PROGRESS, { toolName: name, stage })
  try {
    await action(name, (output) => {
      broadcast(IPC.ENV_TOOL_PROGRESS, { toolName: name, stage, output })
    })
    await initUvToolPaths()
    broadcast(IPC.ENV_TOOL_PROGRESS, { toolName: name, stage: 'done' })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    broadcast(IPC.ENV_TOOL_PROGRESS, { toolName: name, stage: 'error', error })
    throw err
  }
}

export function registerEnvIpc(): void {
  ipcMain.handle(IPC.ENV_CHECK_ALL, () => checkAllTools())

  ipcMain.handle(IPC.ENV_TOOL_INSTALL, async (_event, name: string) => {
    if (!isUvManagedTool(name)) throw new Error(`Tool "${name}" is not managed by uv`)
    await runToolAction(name, 'installing', uvToolInstall)
  })

  ipcMain.handle(IPC.ENV_TOOL_UPGRADE, async (_event, name: string) => {
    if (!isUvManagedTool(name)) throw new Error(`Tool "${name}" is not managed by uv`)
    await runToolAction(name, 'upgrading', uvToolUpgrade)
  })
}
