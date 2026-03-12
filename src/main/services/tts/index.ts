import Store from 'electron-store'
import type { ServiceConfig, TtsProviderType } from '../../../shared/types'
import { BUILTIN_SERVICES } from '../../../shared/types'
import type { TtsProvider, TtsResult, TtsProviderCapabilities } from './types'
import { edgeTtsProvider } from './edge-tts'
import { kokoroProvider } from './kokoro'
import { elevenlabsProvider } from './elevenlabs'
import { openaiProvider } from './openai'
import { openaiCompatibleProvider } from './openai-compatible'

// Re-export public types
export type { TtsSegment, TtsResult, TtsProviderCapabilities } from './types'

// ── Provider registry ──

const providers: Record<TtsProviderType, TtsProvider> = {
  edge_tts: edgeTtsProvider,
  kokoro: kokoroProvider,
  elevenlabs: elevenlabsProvider,
  openai: openaiProvider,
  openai_compatible: openaiCompatibleProvider,
}

function getProvider(providerType: TtsProviderType): TtsProvider {
  const provider = providers[providerType]
  if (!provider) throw new Error(`Unknown TTS provider: ${providerType}`)
  return provider
}

// ── Service resolution ──

const store = new Store()

export function resolveService(serviceId: string): ServiceConfig {
  const config = store.get('config') as { services?: ServiceConfig[] } | undefined
  const service = config?.services?.find((s) => s.id === serviceId)
    ?? BUILTIN_SERVICES.find((s) => s.id === serviceId)
  if (!service) throw new Error(`Service not found: ${serviceId}`)
  return service
}

// ── Public API ──

export function getProviderCapabilities(providerType: TtsProviderType): TtsProviderCapabilities {
  return getProvider(providerType).capabilities
}

export async function dispatchTts(
  service: ServiceConfig,
  voice: string,
  speed: number,
  text: string,
  outputPath: string,
  onProgress?: (percent: number) => void,
): Promise<TtsResult> {
  return getProvider(service.providerType as TtsProviderType).synthesize(
    service, voice, speed, text, outputPath, onProgress,
  )
}

export async function previewTts(
  serviceId: string,
  voice: string,
  speed: number,
  text: string,
  outputPath: string,
): Promise<string> {
  const service = resolveService(serviceId)
  const result = await dispatchTts(service, voice, speed, text, outputPath)
  return result.audioPath
}
