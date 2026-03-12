import type { AppConfig } from '../../../shared/types'
import type { TtsProvider, TtsResult, TtsProviderCapabilities } from './types'
import { edgeTtsProvider } from './edge-tts'
import { kokoroProvider } from './kokoro'
import { elevenlabsProvider } from './elevenlabs'
import { openaiProvider } from './openai'

// Re-export public types
export type { TtsSegment, TtsResult, TtsProviderCapabilities } from './types'

// ── Provider registry ──

const providers: Record<AppConfig['tts']['provider'], TtsProvider> = {
  edge_tts: edgeTtsProvider,
  kokoro: kokoroProvider,
  elevenlabs: elevenlabsProvider,
  openai: openaiProvider,
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
  const config: AppConfig['tts'] = {
    provider: provider as AppConfig['tts']['provider'],
    voice,
    speed,
  }
  const result = await dispatchTts(config, text, outputPath)
  return result.audioPath
}
