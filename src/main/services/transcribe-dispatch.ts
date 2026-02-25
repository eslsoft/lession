import { transcribe } from './transcription'
import { transcribeWithReplicate } from './transcription-replicate'
import { getCachedTranscript, saveCachedTranscript, hasCachedTranscript } from './transcript-cache'
import type { AppConfig, Segment } from '../../shared/types'

/**
 * Dispatch transcription to the configured provider (local WhisperX or Replicate cloud).
 * Results are cached by file path — the same file is never transcribed twice.
 */
export async function dispatchTranscribe(
  config: AppConfig,
  filePath: string,
  language: string,
  onProgress?: (percent: number) => void,
): Promise<Segment[]> {
  // Return from cache if available
  const cached = getCachedTranscript(filePath)
  if (cached) {
    onProgress?.(100)
    return cached.segments
  }

  let segments: Segment[]

  if (config.transcription.provider === 'replicate') {
    const { apiToken, model } = config.transcription.replicate
    if (!apiToken) throw new Error('Replicate API token is not configured.')
    segments = await transcribeWithReplicate(
      apiToken,
      model,
      filePath,
      language,
      onProgress,
      config.storage,
    )
  } else {
    segments = await transcribe(
      config.transcription.whisperxPath,
      filePath,
      language,
      config.transcription.device,
      config.transcription.computeType,
      onProgress,
    )
  }

  // Cache for future use
  saveCachedTranscript(filePath, language, segments)

  return segments
}

export { hasCachedTranscript, getCachedTranscript }
