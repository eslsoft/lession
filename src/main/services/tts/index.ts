import type { AppConfig } from '../../../shared/types'
import type { TtsProvider, TtsResult, TtsProviderCapabilities } from './types'
import { edgeTtsProvider } from './edge-tts'
import { kokoroProvider } from './kokoro'
import { replicateProvider } from './replicate'

// Re-export public types
export type { TtsSegment, TtsResult, TtsProviderCapabilities } from './types'

// ── Provider registry ──

const providers: Record<AppConfig['tts']['provider'], TtsProvider> = {
  edge_tts: edgeTtsProvider,
  local_kokoro: kokoroProvider,
  replicate: replicateProvider,
}

function getProvider(name: AppConfig['tts']['provider']): TtsProvider {
  const provider = providers[name]
  if (!provider) throw new Error(`Unknown TTS provider: ${name}`)
  return provider
}

// ── Public API ──

export function getProviderCapabilities(provider: AppConfig['tts']['provider']): TtsProviderCapabilities {
  return getProvider(provider).capabilities
}

export async function dispatchTts(
  config: AppConfig['tts'],
  text: string,
  outputPath: string,
  onProgress?: (percent: number) => void,
): Promise<TtsResult> {
  return getProvider(config.provider).synthesize(config, text, outputPath, onProgress)
}

export async function previewTts(
  provider: string,
  voice: string,
  speed: number,
  text: string,
  outputPath: string,
): Promise<string> {
  const Store = (await import('electron-store')).default
  const store = new Store()
  const savedConfig = store.get('config') as AppConfig | undefined
  const replicateConfig = savedConfig?.tts?.replicate ?? { apiToken: '', model: '' }

  const config: AppConfig['tts'] = {
    provider: provider as AppConfig['tts']['provider'],
    voice,
    speed,
    replicate: replicateConfig,
  }
  const result = await dispatchTts(config, text, outputPath)
  return result.audioPath
}
