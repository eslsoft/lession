import { spawn } from 'node:child_process'
import { getFfmpegPath } from './bin-paths'

export interface SilenceGap {
  start: number
  end: number
  duration: number
}

/**
 * Detect silence gaps in an audio/video file using ffmpeg's silencedetect filter.
 * Very fast — only decodes audio stream, no re-encoding.
 */
export function detectSilence(
  filePath: string,
  noiseThreshold = '-30dB',
  minDuration = 2,
): Promise<SilenceGap[]> {
  return new Promise((resolve, reject) => {
    let stderr = ''

    const proc = spawn(getFfmpegPath(), [
      '-vn',              // skip video decoding
      '-hide_banner',
      '-i', filePath,
      '-af', `silencedetect=n=${noiseThreshold}:d=${minDuration}`,
      '-f', 'null',
      '-',
    ])

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg silencedetect failed with code ${code}`))
        return
      }
      const gaps: SilenceGap[] = []
      let currentStart: number | null = null

      for (const line of stderr.split('\n')) {
        const startMatch = line.match(/silence_start:\s*([\d.]+)/)
        if (startMatch) {
          currentStart = parseFloat(startMatch[1])
        }

        const endMatch = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/)
        if (endMatch && currentStart !== null) {
          gaps.push({
            start: currentStart,
            end: parseFloat(endMatch[1]),
            duration: parseFloat(endMatch[2]),
          })
          currentStart = null
        }
      }

      resolve(gaps)
    })

    proc.on('error', reject)
  })
}
