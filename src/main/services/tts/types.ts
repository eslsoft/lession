import type { ServiceConfig } from '../../../shared/types'

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
}

export interface TtsProvider {
  capabilities: TtsProviderCapabilities
  synthesize(
    service: ServiceConfig,
    voice: string,
    speed: number,
    text: string,
    outputPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<TtsResult>
}
