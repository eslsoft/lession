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
}

export interface TranscriptionEngineMetadata {
  label: string
}

// ── TTS Engines ──

export const TTS_ENGINES: Record<TtsEngine, TtsEngineMetadata> = {
  edge_tts: { label: 'Edge TTS' },
  kokoro: { label: 'Kokoro' },
  elevenlabs: { label: 'ElevenLabs' },
  openai: { label: 'OpenAI TTS' },
  openai_compatible: { label: 'OpenAI Compatible' },
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

