import type { ServiceConfig, Segment } from '../../../shared/types'

export interface TranscriptionProvider {
  transcribe(
    service: ServiceConfig,
    filePath: string,
    language: string,
    onProgress?: (percent: number) => void,
  ): Promise<Segment[]>
}
