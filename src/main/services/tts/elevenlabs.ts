import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import type { TtsProvider, TtsOptionList } from './types'

const EMPTY: TtsOptionList = { options: [], default: '' }
const MAX_CHUNK_CHARS = 4800 // stay safely under the 5000 char API limit
const MAX_CONTEXT_CHARS = 500 // context hints for cross-chunk continuity

/**
 * Split text into chunks by paragraph, greedily packing as many paragraphs
 * as possible into each chunk to preserve the model's natural sentence
 * breaks and inter-paragraph pauses.
 */
function splitTextIntoChunks(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text]

  const paragraphs = text.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean)

  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    const separator = current ? '\n\n' : ''
    if (current.length + separator.length + para.length <= MAX_CHUNK_CHARS) {
      current += separator + para
    } else {
      if (current) chunks.push(current)
      if (para.length > MAX_CHUNK_CHARS) {
        const sentences = para.match(/[^.!?]*[.!?]+\s*/g) || [para]
        let sentBuf = ''
        for (const sent of sentences) {
          if (sentBuf.length + sent.length > MAX_CHUNK_CHARS && sentBuf) {
            chunks.push(sentBuf.trimEnd())
            sentBuf = sent
          } else {
            sentBuf += sent
          }
        }
        current = sentBuf
      } else {
        current = para
      }
    }
  }
  if (current) chunks.push(current)

  return chunks.filter((c) => c.length > 0)
}

type Alignment = {
  characters: string[]
  characterStartTimesSeconds: number[]
  characterEndTimesSeconds: number[]
}

export function buildWordSegments(
  alignment: Alignment | undefined,
  timeOffset: number,
): { start: number; end: number; text: string }[] {
  const segments: { start: number; end: number; text: string }[] = []
  if (!alignment) return segments

  const chars = alignment.characters
  const starts = alignment.characterStartTimesSeconds
  const ends = alignment.characterEndTimesSeconds

  let wordStart = (starts[0] ?? 0) + timeOffset
  let wordChars: string[] = []

  for (let i = 0; i < chars.length; i++) {
    const isWhitespace = /\s/.test(chars[i])
    const isLast = i === chars.length - 1

    if (isWhitespace || isLast) {
      if (isLast && !isWhitespace) {
        wordChars.push(chars[i])
      }
      if (wordChars.length > 0) {
        const wordText = wordChars.join('')
        segments.push({
          start: wordStart,
          end: ends[isLast && !isWhitespace ? i : i - 1] + timeOffset,
          text: wordText,
        })
      }
      wordChars = []
      wordStart = (starts[i + 1] ?? 0) + timeOffset
    } else {
      wordChars.push(chars[i])
    }
  }

  return segments
}

/**
 * Synthesize a single chunk using streamWithTimestamps.
 * Streams audio + alignment data incrementally, avoiding timeout issues.
 */
async function synthesizeChunkStreaming(
  client: ElevenLabsClient,
  voice: string,
  text: string,
  modelId: string | undefined,
  timeOffset: number,
  onChunkProgress?: (charsProcessed: number) => void,
  previousText?: string,
  nextText?: string,
): Promise<{ audioBuffer: Buffer; segments: { start: number; end: number; text: string }[]; duration: number }> {
  // Only some models support previous_text/next_text for cross-chunk continuity.
  // eleven_multilingual_v2, eleven_turbo_v2_5 and eleven_flash_v2_5 are known to support it.
  // eleven_v3 explicitly rejects it. Default to not sending for unknown models.
  const CONTEXT_SUPPORTED_MODELS = ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5', 'eleven_turbo_v2']
  const supportsContext = modelId ? CONTEXT_SUPPORTED_MODELS.includes(modelId) : false
  const prevCtx = supportsContext && previousText ? previousText.slice(-MAX_CONTEXT_CHARS) : undefined
  const nextCtx = supportsContext && nextText ? nextText.slice(0, MAX_CONTEXT_CHARS) : undefined

  const stream = await client.textToSpeech.streamWithTimestamps(
    voice,
    {
      text,
      modelId,
      outputFormat: 'mp3_44100_128',
      ...(prevCtx ? { previousText: prevCtx } : {}),
      ...(nextCtx ? { nextText: nextCtx } : {}),
    },
    { timeoutInSeconds: 300 },
  )

  const audioChunks: Buffer[] = []
  // Accumulate all alignment data across SSE events before building words,
  // since a single word can span multiple events.
  const allChars: string[] = []
  const allStarts: number[] = []
  const allEnds: number[] = []
  let charsReceived = 0

  for await (const event of stream) {
    if (event.audioBase64) {
      audioChunks.push(Buffer.from(event.audioBase64, 'base64'))
    }
    if (event.alignment) {
      const alignment = event.alignment as Alignment
      allChars.push(...alignment.characters)
      allStarts.push(...alignment.characterStartTimesSeconds)
      allEnds.push(...alignment.characterEndTimesSeconds)
      charsReceived += alignment.characters.length
      onChunkProgress?.(charsReceived)
    }
  }

  // Build word segments from the complete accumulated alignment
  const mergedAlignment: Alignment = {
    characters: allChars,
    characterStartTimesSeconds: allStarts,
    characterEndTimesSeconds: allEnds,
  }
  const allSegments = buildWordSegments(mergedAlignment, timeOffset)

  const audioBuffer = Buffer.concat(audioChunks)
  const duration = allSegments.length > 0
    ? allSegments[allSegments.length - 1].end - timeOffset
    : (audioBuffer.length * 8) / (128 * 1000)

  return { audioBuffer, segments: allSegments, duration }
}

export const elevenlabsProvider: TtsProvider = {
  capabilities: {
    wordLevelTimestamps: true,
    audioFormat: '.mp3',
  },

  async synthesize(service, voice, speed, text, outputPath, onProgress) {
    const apiKey = service.credentials.apiKey
    if (!apiKey) throw new Error('ElevenLabs API key is not configured')

    const client = new ElevenLabsClient({ apiKey })
    const chunks = splitTextIntoChunks(text)
    const totalChars = chunks.reduce((sum, c) => sum + c.length, 0)
    let processedChars = 0

    onProgress?.(2)

    const allSegments: { start: number; end: number; text: string }[] = []
    const dir = path.dirname(outputPath)

    // Progress callback: map chars received across all chunks to 2%–80%
    const makeChunkProgressCb = () => {
      return (charsInChunk: number) => {
        const pct = 2 + Math.round(((processedChars + charsInChunk) / totalChars) * 78)
        onProgress?.(Math.min(pct, 80))
      }
    }

    if (chunks.length === 1) {
      const result = await synthesizeChunkStreaming(
        client, voice, chunks[0], service.options.model, 0,
        makeChunkProgressCb(),
      )
      fs.writeFileSync(outputPath, result.audioBuffer)
      allSegments.push(...result.segments)
    } else {
      const tempFiles: string[] = []
      let timeOffset = 0

      for (let ci = 0; ci < chunks.length; ci++) {
        const prevText = ci > 0 ? chunks[ci - 1] : undefined
        const nxtText = ci < chunks.length - 1 ? chunks[ci + 1] : undefined

        const result = await synthesizeChunkStreaming(
          client, voice, chunks[ci], service.options.model, timeOffset,
          makeChunkProgressCb(),
          prevText, nxtText,
        )

        const tempPath = path.join(dir, `_elevenlabs_chunk_${ci}.mp3`)
        fs.writeFileSync(tempPath, result.audioBuffer)
        tempFiles.push(tempPath)

        allSegments.push(...result.segments)

        // Use ffprobe for accurate duration, fall back to alignment-based
        let chunkDuration = result.duration
        try {
          const out = execSync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempPath}"`,
            { encoding: 'utf-8' },
          )
          chunkDuration = parseFloat(out.trim()) || chunkDuration
        } catch { /* keep estimate */ }
        timeOffset += chunkDuration

        processedChars += chunks[ci].length
      }

      // Concatenate with ffmpeg
      const listFile = path.join(dir, '_elevenlabs_concat.txt')
      const listContent = tempFiles.map((f) => `file '${f}'`).join('\n')
      fs.writeFileSync(listFile, listContent)
      try {
        execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}"`, {
          stdio: 'pipe',
        })
      } finally {
        try { fs.unlinkSync(listFile) } catch { /* ignore */ }
        for (const f of tempFiles) {
          try { fs.unlinkSync(f) } catch { /* ignore */ }
        }
      }
    }

    onProgress?.(90)

    // Get final duration via ffprobe
    let duration = 0
    if (allSegments.length > 0) {
      duration = allSegments[allSegments.length - 1].end
    }
    try {
      const out = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`,
        { encoding: 'utf-8' },
      )
      duration = parseFloat(out.trim()) || duration
    } catch { /* keep segment-based duration */ }

    onProgress?.(100)

    return { duration, audioPath: outputPath, segments: allSegments }
  },

  async listModels(service): Promise<TtsOptionList> {
    const apiKey = service.credentials.apiKey
    if (!apiKey) return EMPTY

    try {
      const client = new ElevenLabsClient({ apiKey })
      const models = await client.models.list()
      const ttsModels = models
        .filter((m) => m.canDoTextToSpeech)
        .map((m) => ({ value: m.modelId, label: m.name ?? m.modelId }))
      if (ttsModels.length === 0) return EMPTY
      return { options: ttsModels, default: ttsModels[0].value }
    } catch {
      return EMPTY
    }
  },

  async listVoices(service): Promise<TtsOptionList> {
    const apiKey = service.credentials.apiKey
    if (!apiKey) return EMPTY

    try {
      const client = new ElevenLabsClient({ apiKey })
      const response = await client.voices.getAll()
      const voices = response.voices.map((v) => ({
        value: v.voiceId,
        label: v.name ?? v.voiceId,
      }))
      if (voices.length === 0) return EMPTY
      return { options: voices, default: voices[0].value }
    } catch {
      return EMPTY
    }
  },
}
