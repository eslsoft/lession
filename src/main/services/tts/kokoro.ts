import type { TtsProvider } from './types'
import { runTtsScript } from './run-script'

export const kokoroProvider: TtsProvider = {
  capabilities: { wordLevelTimestamps: false, audioFormat: '.wav' },
  synthesize(config, text, outputPath, onProgress) {
    return runTtsScript('tts_kokoro.py', {
      text, outputPath, voice: config.voice, speed: config.speed,
    }, outputPath, onProgress)
  },
}
