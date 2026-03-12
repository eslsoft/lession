import { getCachedTranscript, saveCachedTranscript, hasCachedTranscript } from './cache'
import type { AppConfig, Segment } from '../../../shared/types'
import type { TranscriptionProvider } from './types'
import { localWhisperxProvider } from './local-whisperx'
import { replicateTranscriptionProvider } from './replicate'

// Re-export cache utilities used by other modules
export { hasCachedTranscript, getCachedTranscript }

// ── Provider registry ──

const providers: Record<AppConfig['transcription']['provider'], TranscriptionProvider> = {
  local_whisperx: localWhisperxProvider,
  replicate: replicateTranscriptionProvider,
}

// ── Public API ──

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

  const provider = providers[config.transcription.provider]
  if (!provider) throw new Error(`Unknown transcription provider: ${config.transcription.provider}`)

  const segments = await provider.transcribe(config, filePath, language, onProgress)

  // Cache for future use
  saveCachedTranscript(filePath, language, segments)

  return segments
}
