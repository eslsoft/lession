import path from 'node:path'
import { ipcMain, app } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { TtsEngine } from '../../shared/types'
import { listBookImports } from '../db/repositories/book-import'
import { extractBook, startBookImport, cancelBookImport, retryBookImport } from '../services/book-import'
import { previewTts } from '../services/tts'

export function registerBookImportIpc(): void {
  ipcMain.handle(IPC.BOOK_IMPORT_EXTRACT, async (_event, filePath: string) => {
    return extractBook(filePath)
  })

  // Legacy preview via book-import — kept for backwards compatibility
  // New code should use TTS_PREVIEW instead
  ipcMain.handle(IPC.BOOK_IMPORT_PREVIEW, async (_event, serviceId: string, voice: string, speed: number, model?: string, text?: string) => {
    const { resolveService } = await import('../services/tts')
    const service = resolveService(serviceId)
    const MAX_PREVIEW_CHARS = 500
    const defaultText = 'The quick brown fox jumps over the lazy dog. This is a preview of the selected voice.'
    const previewText = text ? text.slice(0, MAX_PREVIEW_CHARS) : defaultText
    const ext = (service.engine === 'kokoro') ? '.wav' : '.mp3'
    const outputPath = path.join(app.getPath('temp'), `tts-preview-${Date.now()}${ext}`)
    return previewTts(service.engine as TtsEngine, service.credentials, voice, speed, previewText, outputPath, model)
  })

  ipcMain.handle(IPC.BOOK_IMPORT_GENERATE, (_event, seriesId: string, epubPath: string, chapters: { title: string; text: string }[], serviceId: string, voice: string, speed: number, model?: string) => {
    return startBookImport(seriesId, epubPath, chapters, serviceId, voice, speed, model)
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
