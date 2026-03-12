import path from 'node:path'
import { ipcMain, app } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { listBookImports } from '../db/repositories/book-import'
import { extractBook, startBookImport, cancelBookImport, retryBookImport } from '../services/book-import'
import { previewTts } from '../services/tts'

export function registerBookImportIpc(): void {
  ipcMain.handle(IPC.BOOK_IMPORT_EXTRACT, async (_event, filePath: string) => {
    return extractBook(filePath)
  })

  ipcMain.handle(IPC.BOOK_IMPORT_PREVIEW, async (_event, provider: string, voice: string, speed: number) => {
    const previewText = 'The quick brown fox jumps over the lazy dog. This is a preview of the selected voice.'
    const ext = provider === 'edge_tts' ? '.mp3' : '.wav'
    const outputPath = path.join(app.getPath('temp'), `tts-preview-${Date.now()}${ext}`)
    return previewTts(provider, voice, speed, previewText, outputPath)
  })

  ipcMain.handle(IPC.BOOK_IMPORT_GENERATE, (_event, seriesId: string, epubPath: string, chapters: { title: string; text: string }[]) => {
    return startBookImport(seriesId, epubPath, chapters)
  })

  ipcMain.handle(IPC.BOOK_IMPORT_CANCEL, (_event, id: string) => {
    cancelBookImport(id)
  })

  ipcMain.handle(IPC.BOOK_IMPORT_RETRY, (_event, id: string) => {
    retryBookImport(id)
  })

  ipcMain.handle(IPC.BOOK_IMPORT_LIST, (_event, seriesId: string) => {
    return listBookImports(seriesId)
  })
}
