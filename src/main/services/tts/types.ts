import type { AppConfig } from '../../../shared/types'

export interface TtsSegment {
  start: number
  end: number
  text: string
}

export interface TtsResult {
  duration: number
  audioPath: string
  segments: TtsSegment[]
}

export interface TtsProviderCapabilities {
  wordLevelTimestamps: boolean
  audioFormat: '.mp3' | '.wav'
  requiresApiKey?: 'elevenlabs' | 'openai'
}

export interface TtsProvider {
  capabilities: TtsProviderCapabilities
  synthesize(
    config: AppConfig['tts'],
    text: string,
    outputPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<TtsResult>
}
