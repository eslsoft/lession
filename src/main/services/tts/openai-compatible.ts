import fs from 'node:fs'
import path from 'node:path'
import OpenAI from 'openai'
import type { TtsProvider } from './types'

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

    onProgress?.(10)

    // Same chunking logic as openai provider
    const MAX_CHARS = 4096
    const chunks: string[] = []
    if (text.length <= MAX_CHARS) {
      chunks.push(text)
    } else {
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
        model,
        voice: voice as 'alloy',
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

    let duration = 0
    try {
      const { execSync } = await import('node:child_process')
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
}
