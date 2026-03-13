import Store from 'electron-store'
import { getCachedTranscript, saveCachedTranscript, hasCachedTranscript } from './cache'
import type { ServiceConfig, Segment } from '../../../shared/types'
import { BUILTIN_SERVICES } from '../../../shared/types'
import type { TranscriptionProvider } from './types'
import { localWhisperxProvider } from './local-whisperx'
import { replicateTranscriptionProvider } from './replicate'

// Re-export cache utilities used by other modules
export { hasCachedTranscript, getCachedTranscript, saveCachedTranscript }

// ── Provider registry (keyed by ServiceProvider, not engine) ──

const providers: Record<string, TranscriptionProvider> = {
  local: localWhisperxProvider,
  replicate: replicateTranscriptionProvider,
}

// ── Service resolution ──

const store = new Store()

export function resolveTranscriptionService(serviceId: string): ServiceConfig {
  const config = store.get('config') as { services?: ServiceConfig[] } | undefined
  const service = config?.services?.find((s) => s.id === serviceId)
    ?? BUILTIN_SERVICES.find((s) => s.id === serviceId)
  if (!service) throw new Error(`Service not found: ${serviceId}`)
  return service
}

// ── Public API ──

/**
 * Dispatch transcription to the configured provider (local WhisperX or Replicate cloud).
 * This is a pure transcription function — callers are responsible for caching.
 */
export async function dispatchTranscribe(
  service: ServiceConfig,
  filePath: string,
  language: string,
  onProgress?: (percent: number) => void,
): Promise<Segment[]> {
  const provider = providers[service.provider]
  if (!provider) throw new Error(`Unknown transcription provider: ${service.provider}`)

  return provider.transcribe(service, filePath, language, onProgress)
}
