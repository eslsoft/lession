import { spawn } from 'node:child_process'
import { getFfmpegPath, getFfprobePath, getYtdlpPath, getWhisperxPath, getUvPath } from './bin-paths'
import type { ToolStatus } from '../../shared/types'

function checkBinary(binPath: string, args: string[], timeoutMs = 5000): Promise<{ available: boolean; version?: string }> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(binPath, args, { timeout: timeoutMs })
      let output = ''

      proc.stdout.on('data', (data: Buffer) => { output += data.toString() })
      proc.stderr.on('data', (data: Buffer) => { output += data.toString() })

      proc.on('close', (code) => {
        if (code === 0) {
          const firstLine = output.split('\n')[0]?.trim()
          resolve({ available: true, version: firstLine || 'installed' })
        } else {
          resolve({ available: false })
        }
      })

      proc.on('error', () => {
        resolve({ available: false })
      })
    } catch {
      resolve({ available: false })
    }
  })
}

export async function checkAllTools(): Promise<ToolStatus[]> {
  return Promise.all([
    checkFfmpeg(),
    checkFfprobe(),
    checkYtdlp(),
    checkUv(),
    checkWhisperx(),
    checkEbookConvert(),
  ])
}

async function checkFfmpeg(): Promise<ToolStatus> {
  const result = await checkBinary(getFfmpegPath(), ['-version'])
  return { name: 'ffmpeg', bundled: true, ...result }
}

async function checkFfprobe(): Promise<ToolStatus> {
  const result = await checkBinary(getFfprobePath(), ['-version'])
  return { name: 'ffprobe', bundled: true, ...result }
}

async function checkYtdlp(): Promise<ToolStatus> {
  const binPath = getYtdlpPath()
  const result = binPath
    ? await checkBinary(binPath, ['--version'], 15000)
    : { available: false }
  return {
    name: 'yt-dlp',
    bundled: false,
    managedBy: 'uv',
    ...result,
    installUrl: 'https://github.com/yt-dlp/yt-dlp',
    installHint: 'uv tool install yt-dlp',
  }
}

async function checkUv(): Promise<ToolStatus> {
  const result = await checkBinary(getUvPath(), ['--version'])
  return {
    name: 'uv',
    bundled: true,
    ...result,
  }
}

async function checkWhisperx(): Promise<ToolStatus> {
  const binPath = getWhisperxPath()
  const result = binPath
    ? await checkBinary(binPath, ['--help'], 15000)
    : { available: false }
  return {
    name: 'whisperx',
    bundled: false,
    managedBy: 'uv',
    ...result,
    installUrl: 'https://github.com/m-bain/whisperX',
    installHint: 'uv tool install whisperx',
  }
}

async function checkEbookConvert(): Promise<ToolStatus> {
  const result = await checkBinary('ebook-convert', ['--version'])
  return {
    name: 'ebook-convert',
    bundled: false,
    managedBy: 'system',
    ...result,
    installUrl: 'https://calibre-ebook.com/download',
    installHint: 'Install Calibre from https://calibre-ebook.com/download',
  }
}
