import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { TtsEngine } from '../../shared/types'
import { listTtsModels, listTtsVoices } from '../services/tts'

export function registerTtsIpc(): void {
  ipcMain.handle(IPC.TTS_LIST_MODELS, async (_event, engine: TtsEngine, credentials: Record<string, string>) => {
    return listTtsModels(engine, credentials)
  })

  ipcMain.handle(IPC.TTS_LIST_VOICES, async (_event, engine: TtsEngine, credentials: Record<string, string>) => {
    return listTtsVoices(engine, credentials)
  })
}
