import Store from 'electron-store'
import type { ServiceConfig, TtsEngine } from '../../../shared/types'
import { BUILTIN_SERVICES } from '../../../shared/types'
import type { TtsProvider, TtsResult, TtsProviderCapabilities, TtsOptionList } from './types'
import { edgeTtsProvider } from './edge-tts'
import { kokoroProvider } from './kokoro'
import { elevenlabsProvider } from './elevenlabs'
import { openaiProvider } from './openai'
import { openaiCompatibleProvider } from './openai-compatible'

// Re-export public types
export type { TtsSegment, TtsResult, TtsProviderCapabilities, TtsOptionList } from './types'

// ── Provider registry ──

const providers: Record<TtsEngine, TtsProvider> = {
  edge_tts: edgeTtsProvider,
  kokoro: kokoroProvider,
  elevenlabs: elevenlabsProvider,
  openai: openaiProvider,
  openai_compatible: openaiCompatibleProvider,
}

function getProvider(engine: TtsEngine): TtsProvider {
  const provider = providers[engine]
  if (!provider) throw new Error(`Unknown TTS engine: ${engine}`)
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

export function getProviderCapabilities(engine: TtsEngine): TtsProviderCapabilities {
  return getProvider(engine).capabilities
}

export async function listTtsModels(engine: TtsEngine, credentials: Record<string, string>): Promise<TtsOptionList> {
  return getProvider(engine).listModels({ engine, credentials } as ServiceConfig)
}

export async function listTtsVoices(engine: TtsEngine, credentials: Record<string, string>): Promise<TtsOptionList> {
  return getProvider(engine).listVoices({ engine, credentials } as ServiceConfig)
}

/** Apply a runtime model override to a service config (non-mutating). */
function withModelOverride(service: ServiceConfig, model?: string): ServiceConfig {
  if (!model) return service
  return { ...service, options: { ...service.options, model } }
}

export async function dispatchTts(
  service: ServiceConfig,
  voice: string,
  speed: number,
  text: string,
  outputPath: string,
  onProgress?: (percent: number) => void,
): Promise<TtsResult> {
  return getProvider(service.engine as TtsEngine).synthesize(
    service, voice, speed, text, outputPath, onProgress,
  )
}

export async function previewTts(
  engine: TtsEngine,
  credentials: Record<string, string>,
  voice: string,
  speed: number,
  text: string,
  outputPath: string,
  model?: string,
): Promise<string> {
  const service = withModelOverride(
    { engine, credentials } as ServiceConfig,
    model,
  )
  const result = await dispatchTts(service, voice, speed, text, outputPath)
  return result.audioPath
}
