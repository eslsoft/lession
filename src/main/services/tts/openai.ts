import fs from 'node:fs'
import path from 'node:path'
import OpenAI from 'openai'
import type { TtsProvider, TtsOptionList } from './types'
import type { SelectOption } from '../../../shared/engines'

const MODELS: SelectOption[] = [
  { value: 'tts-1-hd', label: 'TTS-1 HD' },
  { value: 'tts-1', label: 'TTS-1' },
  { value: 'gpt-4o-mini-tts', label: 'GPT-4o Mini TTS' },
]

const VOICES: SelectOption[] = [
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
]

const DEFAULT_MODEL = 'tts-1-hd'
const DEFAULT_VOICE = 'alloy'

export const openaiProvider: TtsProvider = {
  capabilities: {
    wordLevelTimestamps: false,
    audioFormat: '.mp3',
  },

  async synthesize(service, voice, speed, text, outputPath, onProgress) {
    const apiKey = service.credentials.apiKey
    if (!apiKey) throw new Error('OpenAI API key is not configured')

    const client = new OpenAI({ apiKey })

    onProgress?.(10)

    // OpenAI TTS has a 4096 character limit per request, split if needed
    const MAX_CHARS = 4096
    const chunks: string[] = []
    if (text.length <= MAX_CHARS) {
      chunks.push(text)
    } else {
      // Split on sentence boundaries
      const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text]
      let current = ''
      for (const sentence of sentences) {
        if (current.length + sentence.length > MAX_CHARS && current.length > 0) {
          chunks.push(current)
          current = sentence
        } else {
          current += sentence
        }
      }
      if (current) chunks.push(current)
    }

    const tempFiles: string[] = []
    const dir = path.dirname(outputPath)

    for (let i = 0; i < chunks.length; i++) {
      onProgress?.(10 + Math.round((i / chunks.length) * 70))

      const response = await client.audio.speech.create({
        model: service.options.model || DEFAULT_MODEL,
        voice: voice as 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'fable' | 'nova' | 'onyx' | 'sage' | 'shimmer',
        input: chunks[i],
        response_format: 'mp3',
        speed,
      })

      const buffer = Buffer.from(await response.arrayBuffer())

      if (chunks.length === 1) {
        fs.writeFileSync(outputPath, buffer)
      } else {
        const tempPath = path.join(dir, `_tts_chunk_${i}.mp3`)
        fs.writeFileSync(tempPath, buffer)
        tempFiles.push(tempPath)
      }
    }

    // If multiple chunks, concatenate with ffmpeg
    if (tempFiles.length > 1) {
      const { execSync } = await import('node:child_process')
      const listFile = path.join(dir, '_tts_concat.txt')
      const listContent = tempFiles.map((f) => `file '${f}'`).join('\n')
      fs.writeFileSync(listFile, listContent)
      try {
        execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}"`, {
          stdio: 'pipe',
        })
      } finally {
        fs.unlinkSync(listFile)
        for (const f of tempFiles) {
          try { fs.unlinkSync(f) } catch { /* ignore */ }
        }
      }
    }

    onProgress?.(90)

    // Get duration via ffprobe
    let duration = 0
    try {
      const { execSync } = await import('node:child_process')
      const out = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`,
        { encoding: 'utf-8' },
      )
      duration = parseFloat(out.trim()) || 0
    } catch {
      // fallback: rough estimate from file size (128kbps mp3)
      const stat = fs.statSync(outputPath)
      duration = (stat.size * 8) / (128 * 1000)
    }

    onProgress?.(100)

    // OpenAI TTS does not provide word-level timestamps
    return { duration, audioPath: outputPath, segments: [] }
  },

  async listModels(): Promise<TtsOptionList> {
    return { options: MODELS, default: DEFAULT_MODEL }
  },

  async listVoices(): Promise<TtsOptionList> {
    return { options: VOICES, default: DEFAULT_VOICE }
  },
}
