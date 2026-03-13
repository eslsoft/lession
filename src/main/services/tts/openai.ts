import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { execSync } from 'node:child_process'
import OpenAI from 'openai'
import type { TtsProvider, TtsOptionList } from './types'
import type { SelectOption } from '../../../shared/engines'
import { splitTextIntoChunks } from './text-chunker'

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
const MAX_CHUNK_CHARS = 4096

/**
 * Stream the OpenAI TTS response body to a file instead of buffering
 * the entire response in memory.
 */
async function streamResponseToFile(response: Response, filePath: string): Promise<void> {
  const body = response.body
  if (!body) {
    // Fallback: no streaming body available
    const buffer = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(filePath, buffer)
    return
  }
  const nodeStream = Readable.fromWeb(body as import('stream/web').ReadableStream)
  await pipeline(nodeStream, fs.createWriteStream(filePath))
}

export const openaiProvider: TtsProvider = {
  capabilities: {
    wordLevelTimestamps: false,
    audioFormat: '.mp3',
  },

  async synthesize(service, voice, speed, text, outputPath, onProgress) {
    const apiKey = service.credentials.apiKey
    if (!apiKey) throw new Error('OpenAI API key is not configured')

    const client = new OpenAI({ apiKey })
    const chunks = splitTextIntoChunks(text, MAX_CHUNK_CHARS)
    const totalChars = chunks.reduce((sum, c) => sum + c.length, 0)
    let processedChars = 0

    onProgress?.(2)

    const dir = path.dirname(outputPath)
    const tempFiles: string[] = []

    for (let i = 0; i < chunks.length; i++) {
      const response = await client.audio.speech.create({
        model: service.options.model || DEFAULT_MODEL,
        voice: voice as 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'fable' | 'nova' | 'onyx' | 'sage' | 'shimmer',
        input: chunks[i],
        response_format: 'mp3',
        speed,
      })

      if (chunks.length === 1) {
        await streamResponseToFile(response, outputPath)
      } else {
        const tempPath = path.join(dir, `_tts_chunk_${i}.mp3`)
        await streamResponseToFile(response, tempPath)
        tempFiles.push(tempPath)
      }

      processedChars += chunks[i].length
      const pct = 2 + Math.round((processedChars / totalChars) * 78)
      onProgress?.(Math.min(pct, 80))
    }

    // If multiple chunks, concatenate with ffmpeg
    if (tempFiles.length > 1) {
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

    return { duration, audioPath: outputPath, segments: [] }
  },

  async listModels(): Promise<TtsOptionList> {
    return { options: MODELS, default: DEFAULT_MODEL }
  },

  async listVoices(): Promise<TtsOptionList> {
    return { options: VOICES, default: DEFAULT_VOICE }
  },
}
