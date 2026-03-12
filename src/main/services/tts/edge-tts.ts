import type { TtsProvider } from './types'
import { runTtsScript } from './run-script'

export const edgeTtsProvider: TtsProvider = {
  capabilities: { wordLevelTimestamps: true, audioFormat: '.mp3' },
  synthesize(config, text, outputPath, onProgress) {
    return runTtsScript('tts_edge.py', {
      text, outputPath, voice: config.voice, speed: config.speed,
    }, outputPath, onProgress)
  },
}
