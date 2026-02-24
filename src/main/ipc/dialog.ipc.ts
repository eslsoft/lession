import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'

export function registerDialogIpc(): void {
  ipcMain.handle(IPC.DIALOG_OPEN_FILE, async (_event, options?: { filters?: { name: string; extensions: string[] }[] }) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: options?.filters,
    })

    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle(IPC.DIALOG_OPEN_DIRECTORY, async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    })

    return result.canceled ? null : result.filePaths[0] ?? null
  })
}
