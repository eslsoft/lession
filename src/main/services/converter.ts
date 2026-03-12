import { spawn } from 'node:child_process'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { getFfmpegPath } from './bin-paths'

// Extensions that are already AAC-in-MP4 container and can be stream-copied to .m4a
const AAC_COMPATIBLE_EXTS = new Set(['.m4a', '.m4b', '.mp4', '.aac'])

/**
 * Convert a media file to M4A format with progress reporting.
 * If already M4A, calls onProgress(100) and returns the original path.
 * AAC-compatible sources use stream copy; others are re-encoded to AAC 128k.
 */
export async function convertToM4a(
  filePath: string,
  outputDir: string,
  durationSec: number,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const srcExt = path.extname(filePath).toLowerCase()
  if (srcExt === '.m4a') {
    onProgress?.(100)
    return filePath
  }

  await mkdir(outputDir, { recursive: true })

  const baseName = path.basename(filePath, srcExt)
  const outputPath = path.join(outputDir, `${baseName}.m4a`)
  const canCopy = AAC_COMPATIBLE_EXTS.has(srcExt)

  return new Promise((resolve, reject) => {
    const codecArgs = canCopy
      ? ['-c', 'copy']
      : ['-vn', '-c:a', 'aac', '-b:a', '128k']

    const proc = spawn(getFfmpegPath(), [
      '-y',
      '-i', filePath,
      ...codecArgs,
      '-progress', 'pipe:1',
      outputPath,
    ])

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
      // Parse progress from ffmpeg -progress output
      // Lines like: out_time_us=12345678
      const lines = stdout.split('\n')
      for (const line of lines) {
        const match = line.match(/^out_time_us=(\d+)/)
        if (match && durationSec > 0) {
          const currentSec = parseInt(match[1], 10) / 1_000_000
          const percent = Math.min(99, Math.round((currentSec / durationSec) * 100))
          onProgress?.(percent)
        }
      }
      // Keep only the last incomplete line
      stdout = lines[lines.length - 1]
    })

    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg convert failed: ${stderr}`))
        return
      }
      onProgress?.(100)
      resolve(outputPath)
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`))
    })
  })
}
