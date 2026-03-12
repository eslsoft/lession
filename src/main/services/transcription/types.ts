import type { AppConfig, Segment } from '../../../shared/types'

export interface TranscriptionProvider {
  transcribe(
    config: AppConfig,
    filePath: string,
    language: string,
    onProgress?: (percent: number) => void,
  ): Promise<Segment[]>
}
