import type { TtsProvider, TtsOptionList } from './types'
import type { SelectOption } from '../../../shared/engines'
import { runTtsScript } from './run-script'

const VOICES: SelectOption[] = [
  { value: 'af_heart', label: 'Heart (Female)' },
  { value: 'af_bella', label: 'Bella (Female)' },
  { value: 'af_sarah', label: 'Sarah (Female)' },
  { value: 'am_adam', label: 'Adam (Male)' },
  { value: 'am_michael', label: 'Michael (Male)' },
  { value: 'bf_emma', label: 'Emma (British Female)' },
  { value: 'bm_george', label: 'George (British Male)' },
]

export const kokoroProvider: TtsProvider = {
  capabilities: { wordLevelTimestamps: false, audioFormat: '.wav' },
  synthesize(_service, voice, speed, text, outputPath, onProgress) {
    return runTtsScript('tts_kokoro.py', {
      text, outputPath, voice, speed,
    }, outputPath, onProgress)
  },
  async listModels(): Promise<TtsOptionList> {
    return { options: [], default: '' }
  },
  async listVoices(): Promise<TtsOptionList> {
    return { options: VOICES, default: 'af_heart' }
  },
}
