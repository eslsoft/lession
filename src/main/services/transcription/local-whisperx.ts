import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Segment, WordToken } from '../../../shared/types'
import type { TranscriptionProvider } from './types'
import { getWhisperxPath } from '../bin-paths'

export const localWhisperxProvider: TranscriptionProvider = {
  async transcribe(service, filePath, language, onProgress) {
    const whisperxPath = getWhisperxPath(service.options.whisperxPath)
    if (!whisperxPath) {
      throw new Error('WhisperX is not installed. Go to Settings → Environment to install it.')
    }
    const device = service.options.device || 'cpu'
    const computeType = service.options.computeType || 'float16'
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisperx-'))

    return new Promise<Segment[]>((resolve, reject) => {
      const args = [
        filePath,
        '--model', 'medium.en',
        '--language', language,
        '--device', device,
        '--compute_type', computeType,
        '--output_format', 'json',
        '--output_dir', outputDir,
        '--print_progress', 'True',
      ]

      const proc = spawn(whisperxPath, args, {
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      })
      let stderr = ''

      proc.stdout.on('data', (data: Buffer) => {
        const text = data.toString()
        const matches = [...text.matchAll(/Progress:\s*([\d.]+)%/g)]
        if (matches.length > 0 && onProgress) {
          onProgress(Math.round(parseFloat(matches[matches.length - 1][1])))
        }
      })

      proc.stderr.on('data', (data: Buffer) => {
        const text = data.toString()
        stderr += text
        const matches = [...text.matchAll(/Progress:\s*([\d.]+)%/g)]
        if (matches.length > 0 && onProgress) {
          onProgress(Math.round(parseFloat(matches[matches.length - 1][1])))
        }
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          cleanup(outputDir)
          reject(new Error(`WhisperX exited with code ${code}: ${stderr}`))
          return
        }

        try {
          const segments = parseOutput(outputDir, filePath)
          cleanup(outputDir)
          resolve(segments)
        } catch (err) {
          cleanup(outputDir)
          reject(err)
        }
      })

      proc.on('error', (err) => {
        cleanup(outputDir)
        reject(new Error(
          (err as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'WhisperX is not installed. Go to Settings → Environment to install it.'
            : `Failed to start WhisperX: ${err.message}`,
        ))
      })
    })
  },
}

function parseOutput(outputDir: string, audioPath: string): Segment[] {
  const baseName = path.basename(audioPath, path.extname(audioPath))
  const jsonPath = path.join(outputDir, `${baseName}.json`)

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`WhisperX output not found: ${jsonPath}`)
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  return (raw.segments || []).map((seg: Record<string, unknown>) => {
    const words: WordToken[] = ((seg.words as Record<string, unknown>[]) || []).map((w) => ({
      word: (w.word as string).trim(),
      start: w.start as number,
      end: w.end as number,
      score: (w.score as number) ?? 0,
      normal: null,
      tags: null,
      chunk: null,
    }))

    return {
      start: seg.start as number,
      end: seg.end as number,
      text: seg.text as string,
      edited: false,
      speaker: (seg.speaker as string) ?? undefined,
      words,
    }
  })
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // ignore cleanup errors
  }
}
