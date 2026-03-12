/**
 * Static metadata for each TTS / Transcription engine.
 * Single source of truth — imported by both main and renderer.
 */

import type { TtsEngine, TranscriptionEngine } from './types'

export interface SelectOption {
  value: string
  label: string
}

export interface TtsEngineMetadata {
  label: string
  models: SelectOption[]
  defaultModel: string
  voices: SelectOption[]
  defaultVoice: string
}

export interface TranscriptionEngineMetadata {
  label: string
}

// ── TTS Engines ──

export const TTS_ENGINES: Record<TtsEngine, TtsEngineMetadata> = {
  edge_tts: {
    label: 'Edge TTS',
    models: [],
    defaultModel: '',
    voices: [
      { value: 'en-US-AndrewMultilingualNeural', label: 'Andrew (Male)' },
      { value: 'en-US-AvaMultilingualNeural', label: 'Ava (Female)' },
      { value: 'en-US-GuyNeural', label: 'Guy (Male)' },
      { value: 'en-US-JennyNeural', label: 'Jenny (Female)' },
      { value: 'en-US-AriaNeural', label: 'Aria (Female)' },
      { value: 'en-GB-SoniaNeural', label: 'Sonia (British Female)' },
      { value: 'en-GB-RyanNeural', label: 'Ryan (British Male)' },
    ],
    defaultVoice: 'en-US-AndrewMultilingualNeural',
  },
  kokoro: {
    label: 'Kokoro',
    models: [],
    defaultModel: '',
    voices: [
      { value: 'af_heart', label: 'Heart (Female)' },
      { value: 'af_bella', label: 'Bella (Female)' },
      { value: 'af_sarah', label: 'Sarah (Female)' },
      { value: 'am_adam', label: 'Adam (Male)' },
      { value: 'am_michael', label: 'Michael (Male)' },
      { value: 'bf_emma', label: 'Emma (British Female)' },
      { value: 'bm_george', label: 'George (British Male)' },
    ],
    defaultVoice: 'af_heart',
  },
  elevenlabs: {
    label: 'ElevenLabs',
    models: [
      { value: 'eleven_turbo_v2_5', label: 'Turbo v2.5' },
      { value: 'eleven_multilingual_v2', label: 'Multilingual v2' },
      { value: 'eleven_monolingual_v1', label: 'Monolingual v1' },
      { value: 'eleven_flash_v2_5', label: 'Flash v2.5' },
    ],
    defaultModel: 'eleven_turbo_v2_5',
    voices: [
      { value: 'JBFqnCBsd6RMkjVDRZzb', label: 'George (Male, Narrative)' },
      { value: 'pFZP5JQG7iQjIQuC4Bku', label: 'Lily (Female, Narrative)' },
      { value: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel (Male, British)' },
      { value: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah (Female, Soft)' },
      { value: 'TX3LPaxmHKxFdv7VOQHJ', label: 'Liam (Male, Articulate)' },
      { value: 'XB0fDUnXU5powFXDhCwa', label: 'Charlotte (Female, Swedish)' },
    ],
    defaultVoice: 'JBFqnCBsd6RMkjVDRZzb',
  },
  openai: {
    label: 'OpenAI TTS',
    models: [
      { value: 'tts-1-hd', label: 'TTS-1 HD' },
      { value: 'tts-1', label: 'TTS-1' },
      { value: 'gpt-4o-mini-tts', label: 'GPT-4o Mini TTS' },
    ],
    defaultModel: 'tts-1-hd',
    voices: [
      { value: 'alloy', label: 'Alloy' },
      { value: 'ash', label: 'Ash' },
      { value: 'ballad', label: 'Ballad' },
      { value: 'coral', label: 'Coral' },
      { value: 'echo', label: 'Echo' },
      { value: 'fable', label: 'Fable' },
      { value: 'nova', label: 'Nova' },
      { value: 'onyx', label: 'Onyx' },
      { value: 'sage', label: 'Sage' },
      { value: 'shimmer', label: 'Shimmer' },
    ],
    defaultVoice: 'alloy',
  },
  openai_compatible: {
    label: 'OpenAI Compatible',
    models: [],
    defaultModel: '',
    voices: [],
    defaultVoice: '',
  },
}

// ── Transcription Engines ──

export const TRANSCRIPTION_ENGINES: Record<TranscriptionEngine, TranscriptionEngineMetadata> = {
  whisperx: {
    label: 'WhisperX',
  },
}

// ── Helpers ──

export function getEngineLabel(engine: string): string {
  return TTS_ENGINES[engine as TtsEngine]?.label
    ?? TRANSCRIPTION_ENGINES[engine as TranscriptionEngine]?.label
    ?? engine
}

export const PROVIDER_LABELS: Record<string, string> = {
  local: 'Local',
  openai: 'OpenAI',
  openai_compatible: 'OpenAI Compatible',
  elevenlabs: 'ElevenLabs',
  replicate: 'Replicate',
}

/**
 * Get voices for a service. For openai_compatible, parses from service options.
 * For standard engines, returns the static voice list.
 */
export function getVoicesForEngine(engine: string, optionsVoices?: string): SelectOption[] {
  if (engine === 'openai_compatible' && optionsVoices) {
    return optionsVoices.split(',').map((pair) => {
      const [value, label] = pair.trim().split(':')
      return { value: value.trim(), label: label?.trim() || value.trim() }
    }).filter((v) => v.value)
  }
  return TTS_ENGINES[engine as TtsEngine]?.voices ?? []
}

export function getDefaultVoice(engine: string, optionsVoices?: string): string {
  if (engine === 'openai_compatible' && optionsVoices) {
    const voices = getVoicesForEngine(engine, optionsVoices)
    return voices[0]?.value ?? ''
  }
  return TTS_ENGINES[engine as TtsEngine]?.defaultVoice ?? ''
}

export function getModelsForEngine(engine: string): SelectOption[] {
  return TTS_ENGINES[engine as TtsEngine]?.models ?? []
}

export function getDefaultModel(engine: string): string {
  return TTS_ENGINES[engine as TtsEngine]?.defaultModel ?? ''
}
