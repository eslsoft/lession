import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { execSync } from 'node:child_process'
import OpenAI from 'openai'
import type { TtsProvider, TtsOptionList } from './types'
import { splitTextIntoChunks } from './text-chunker'

const MAX_CHUNK_CHARS = 4096

/**
 * Stream the OpenAI-compatible TTS response body to a file instead of
 * buffering the entire response in memory.
 */
async function streamResponseToFile(response: Response, filePath: string): Promise<void> {
  const body = response.body
  if (!body) {
    const buffer = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(filePath, buffer)
    return
  }
  const nodeStream = Readable.fromWeb(body as import('stream/web').ReadableStream)
  await pipeline(nodeStream, fs.createWriteStream(filePath))
}

export const openaiCompatibleProvider: TtsProvider = {
  capabilities: {
    wordLevelTimestamps: false,
    audioFormat: '.mp3',
  },

  async synthesize(service, voice, speed, text, outputPath, onProgress) {
    const baseURL = service.options.baseUrl
    if (!baseURL) throw new Error('Base URL is not configured for OpenAI-compatible provider')

    const model = service.options.model || 'tts-1'

    const client = new OpenAI({
      apiKey: service.credentials.apiKey || 'not-needed',
      baseURL,
    })

    const chunks = splitTextIntoChunks(text, MAX_CHUNK_CHARS)
    const totalChars = chunks.reduce((sum, c) => sum + c.length, 0)
    let processedChars = 0

    onProgress?.(2)

    const tempFiles: string[] = []
    const dir = path.dirname(outputPath)

    for (let i = 0; i < chunks.length; i++) {
      const response = await client.audio.speech.create({
        model,
        voice: voice as 'alloy',
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

    let duration = 0
    try {
      const out = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`,
        { encoding: 'utf-8' },
      )
      duration = parseFloat(out.trim()) || 0
    } catch {
      const stat = fs.statSync(outputPath)
      duration = (stat.size * 8) / (128 * 1000)
    }

    onProgress?.(100)

    return { duration, audioPath: outputPath, segments: [] }
  },

  async listModels(service): Promise<TtsOptionList> {
    const model = service.options.model
    if (!model) return { options: [], default: '' }
    return { options: [{ value: model, label: model }], default: model }
  },

  async listVoices(service): Promise<TtsOptionList> {
    const voicesStr = service.options.voices
    if (!voicesStr) return { options: [], default: '' }
    const voices = voicesStr.split(',').map((pair) => {
      const [value, label] = pair.trim().split(':')
      return { value: value.trim(), label: label?.trim() || value.trim() }
    }).filter((v) => v.value)
    return { options: voices, default: voices[0]?.value ?? '' }
  },
}
