import { spawn } from 'node:child_process'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { app } from 'electron'
import { getFfmpegPath, getFfprobePath } from './bin-paths'

interface FfprobeChapter {
  start_time: string
  end_time: string
  tags?: {
    title?: string
  }
}

async function extractCoverArt(filePath: string, outputPath: string): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true })
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), [
      '-y',
      '-i', filePath,
      '-an',
      '-vcodec', 'copy',
      outputPath,
    ])
    let stderr = ''
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to extract cover art: ${stderr}`))
        return
      }
      resolve()
    })
    proc.on('error', (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`))
    })
  })
}

export async function getMediaMetadata(filePath: string): Promise<{
  duration: number
  format: string
  hasVideo: boolean
  chapters?: { start: number; end: number; title: string }[]
  tags?: {
    title?: string
    artist?: string
    album?: string
    date?: string
    genre?: string
    comment?: string
  }
  coverPath?: string
}> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfprobePath(), [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-show_chapters',
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
        const chapters = (info.chapters || []).map((ch: FfprobeChapter, idx: number) => ({
          start: parseFloat(ch.start_time),
          end: parseFloat(ch.end_time),
          title: ch.tags?.title || `Chapter ${idx + 1}`,
        }))

        const coverStream = (info.streams || []).find(
          (s: Record<string, unknown>) =>
            s.codec_type === 'video' &&
            (s.disposition as Record<string, unknown> | undefined)?.attached_pic === 1,
        )

        const tags = info.format.tags || {}

        const duration = parseFloat(info.format.duration)
        const format = info.format.format_name

        if (coverStream) {
          const ext = coverStream.codec_name === 'png' ? '.png' : '.jpg'
          const tempCoverDir = path.join(app.getPath('userData'), 'temp_covers')
          const tempCoverPath = path.join(tempCoverDir, `${Date.now()}_cover${ext}`)
          extractCoverArt(filePath, tempCoverPath)
            .then(() => {
              resolve({
                duration,
                format,
                hasVideo,
                chapters,
                tags,
                coverPath: tempCoverPath,
              })
            })
            .catch((err) => {
              console.error('Failed to extract cover:', err)
              resolve({
                duration,
                format,
                hasVideo,
                chapters,
                tags,
              })
            })
        } else {
          resolve({
            duration,
            format,
            hasVideo,
            chapters,
            tags,
          })
        }
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

  const srcExt = path.extname(filePath).toLowerCase()
  const outputPaths: string[] = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    // Sanitize title for filename
    const safeTitle = seg.title.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_')
    const outputPath = path.join(outputDir, `${String(i + 1).padStart(3, '0')}_${safeTitle}${srcExt}`)

    await splitSegment(filePath, outputPath, seg.start, seg.end)
    outputPaths.push(outputPath)
  }

  return outputPaths
}

function splitSegment(inputPath: string, outputPath: string, start: number, end: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), [
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
