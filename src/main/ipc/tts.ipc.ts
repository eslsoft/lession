import path from 'node:path'
import { ipcMain, app } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { TtsEngine } from '../../shared/types'
import { listTtsModels, listTtsVoices, previewTts } from '../services/tts'

export function registerTtsIpc(): void {
  ipcMain.handle(IPC.TTS_LIST_MODELS, async (_event, engine: TtsEngine, credentials: Record<string, string>) => {
    return listTtsModels(engine, credentials)
  })

  ipcMain.handle(IPC.TTS_LIST_VOICES, async (_event, engine: TtsEngine, credentials: Record<string, string>) => {
    return listTtsVoices(engine, credentials)
  })

  ipcMain.handle(IPC.TTS_PREVIEW, async (_event, engine: TtsEngine, credentials: Record<string, string>, voice: string, speed: number, model?: string, text?: string) => {
    const MAX_PREVIEW_CHARS = 500
    const defaultText = 'The quick brown fox jumps over the lazy dog. This is a preview of the selected voice.'
    const previewText = text ? text.slice(0, MAX_PREVIEW_CHARS) : defaultText
    const ext = engine === 'kokoro' ? '.wav' : '.mp3'
    const outputPath = path.join(app.getPath('temp'), `tts-preview-${Date.now()}${ext}`)
    return previewTts(engine, credentials, voice, speed, previewText, outputPath, model)
  })
}
