import type { TtsProvider, TtsOptionList } from './types'
import type { SelectOption } from '../../../shared/engines'
import { runTtsScript } from './run-script'

const VOICES: SelectOption[] = [
  { value: 'en-US-AndrewMultilingualNeural', label: 'Andrew (Male)' },
  { value: 'en-US-AvaMultilingualNeural', label: 'Ava (Female)' },
  { value: 'en-US-GuyNeural', label: 'Guy (Male)' },
  { value: 'en-US-JennyNeural', label: 'Jenny (Female)' },
  { value: 'en-US-AriaNeural', label: 'Aria (Female)' },
  { value: 'en-GB-SoniaNeural', label: 'Sonia (British Female)' },
  { value: 'en-GB-RyanNeural', label: 'Ryan (British Male)' },
]

export const edgeTtsProvider: TtsProvider = {
  capabilities: { wordLevelTimestamps: true, audioFormat: '.mp3' },
  synthesize(_service, voice, speed, text, outputPath, onProgress) {
    return runTtsScript('tts_edge.py', {
      text, outputPath, voice, speed,
    }, outputPath, onProgress)
  },
  async listModels(): Promise<TtsOptionList> {
    return { options: [], default: '' }
  },
  async listVoices(): Promise<TtsOptionList> {
    return { options: VOICES, default: 'en-US-AndrewMultilingualNeural' }
  },
}
