import fs from 'node:fs'
import type { TtsProvider } from './types'

export const replicateProvider: TtsProvider = {
  capabilities: { wordLevelTimestamps: false, audioFormat: '.wav' },
  async synthesize(config, text, outputPath, onProgress) {
    const { apiToken, model } = config.replicate
    if (!apiToken) throw new Error('Replicate API token is not configured.')

    const Replicate = (await import('replicate')).default
    const replicate = new Replicate({ auth: apiToken })

    onProgress?.(10)

    const output = await replicate.run(model as `${string}/${string}`, {
      input: { text, voice: config.voice, speed: config.speed },
    })

    onProgress?.(80)

    const response = await fetch(output as unknown as string)
    const arrayBuffer = await response.arrayBuffer()
    fs.writeFileSync(outputPath, Buffer.from(arrayBuffer))

    onProgress?.(100)

    // Use ffprobe for accurate duration
    const { getMediaMetadata } = await import('../splitter')
    let duration: number
    try {
      const metadata = await getMediaMetadata(outputPath)
      duration = metadata.duration
    } catch {
      const stats = fs.statSync(outputPath)
      duration = stats.size / 16000
    }

    return {
      duration,
      audioPath: outputPath,
      segments: [{ start: 0, end: duration, text }],
    }
  },
}
