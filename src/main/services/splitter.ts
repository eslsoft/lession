import { spawn } from 'node:child_process'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'

export async function getMediaMetadata(filePath: string): Promise<{ duration: number; format: string; hasVideo: boolean }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ])

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed: ${stderr}`))
        return
      }
      try {
        const info = JSON.parse(stdout)
        const hasVideo = (info.streams || []).some(
          (s: Record<string, unknown>) =>
            s.codec_type === 'video' &&
            (s.disposition as Record<string, unknown> | undefined)?.attached_pic !== 1,
        )
        resolve({
          duration: parseFloat(info.format.duration),
          format: info.format.format_name,
          hasVideo,
        })
      } catch (err) {
        reject(new Error(`Failed to parse ffprobe output: ${err}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to start ffprobe: ${err.message}`))
    })
  })
}

export async function splitFile(
  filePath: string,
  segments: { start: number; end: number; title: string }[],
  outputDir: string,
): Promise<string[]> {
  await mkdir(outputDir, { recursive: true })

  const ext = path.extname(filePath)
  const outputPaths: string[] = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    // Sanitize title for filename
    const safeTitle = seg.title.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_')
    const outputPath = path.join(outputDir, `${String(i + 1).padStart(3, '0')}_${safeTitle}${ext}`)

    await splitSegment(filePath, outputPath, seg.start, seg.end)
    outputPaths.push(outputPath)
  }

  return outputPaths
}

function splitSegment(inputPath: string, outputPath: string, start: number, end: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-ss', String(start),
      '-to', String(end),
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      outputPath,
    ])

    let stderr = ''
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg split failed: ${stderr}`))
        return
      }
      resolve()
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`))
    })
  })
}
