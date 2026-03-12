import fs from 'node:fs'
import { ElevenLabsClient } from 'elevenlabs'
import type { TtsProvider } from './types'

export const elevenlabsProvider: TtsProvider = {
  capabilities: {
    wordLevelTimestamps: true,
    audioFormat: '.mp3',
    requiresApiKey: 'elevenlabs',
  },

  async synthesize(config, text, outputPath, onProgress) {
    const apiKey = config.elevenlabs?.apiKey
    if (!apiKey) throw new Error('ElevenLabs API key is not configured')

    const client = new ElevenLabsClient({ apiKey })

    onProgress?.(10)

    const response = await client.textToSpeech.convertWithTimestamps(
      config.voice,
      {
        text,
        model_id: 'eleven_turbo_v2_5',
        output_format: 'mp3_44100_128',
      },
    )

    onProgress?.(60)

    // Response is an object with audio_base64 and alignment
    const audioBase64 = response.audio_base64 as string
    const alignment = response.alignment as {
      characters: string[]
      character_start_times_seconds: number[]
      character_end_times_seconds: number[]
    } | undefined

    // Write audio
    const audioBuffer = Buffer.from(audioBase64, 'base64')
    fs.writeFileSync(outputPath, audioBuffer)

    onProgress?.(80)

    // Build word-level segments from character alignment
    const segments: { start: number; end: number; text: string }[] = []
    if (alignment) {
      const chars = alignment.characters
      const starts = alignment.character_start_times_seconds
      const ends = alignment.character_end_times_seconds

      let wordStart = starts[0] ?? 0
      let wordChars: string[] = []

      for (let i = 0; i < chars.length; i++) {
        if (chars[i] === ' ' || i === chars.length - 1) {
          if (i === chars.length - 1 && chars[i] !== ' ') {
            wordChars.push(chars[i])
          }
          if (wordChars.length > 0) {
            segments.push({
              start: wordStart,
              end: ends[i === chars.length - 1 ? i : i - 1],
              text: wordChars.join(''),
            })
          }
          wordChars = []
          wordStart = starts[i + 1] ?? 0
        } else {
          wordChars.push(chars[i])
        }
      }
    }

    // Estimate duration from last segment or audio length
    const duration = segments.length > 0
      ? segments[segments.length - 1].end
      : audioBuffer.length / (44100 * 2) // rough estimate

    onProgress?.(100)

    return { duration, audioPath: outputPath, segments }
  },
}
