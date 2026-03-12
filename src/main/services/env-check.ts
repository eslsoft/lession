import { spawn } from 'node:child_process'
import { getFfmpegPath, getFfprobePath, getYtdlpPath } from './bin-paths'

export interface ToolStatus {
  name: string
  available: boolean
  version?: string
  bundled: boolean
  installUrl?: string
  installHint?: string
}

function checkBinary(binPath: string, args: string[], timeoutMs = 5000): Promise<{ available: boolean; version?: string }> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(binPath, args, { timeout: timeoutMs })
      let output = ''

      proc.stdout.on('data', (data: Buffer) => { output += data.toString() })
      proc.stderr.on('data', (data: Buffer) => { output += data.toString() })

      proc.on('close', (code) => {
        if (code === 0 || output.length > 0) {
          // Extract first line as version info
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
  const results = await Promise.all([
    checkFfmpeg(),
    checkFfprobe(),
    checkYtdlp(),
    checkUv(),
    checkWhisperx(),
    checkEbookConvert(),
  ])
  return results
}

async function checkFfmpeg(): Promise<ToolStatus> {
  const binPath = getFfmpegPath()
  const result = await checkBinary(binPath, ['-version'])
  return {
    name: 'ffmpeg',
    bundled: true,
    ...result,
  }
}

async function checkFfprobe(): Promise<ToolStatus> {
  const binPath = getFfprobePath()
  const result = await checkBinary(binPath, ['-version'])
  return {
    name: 'ffprobe',
    bundled: true,
    ...result,
  }
}

async function checkYtdlp(): Promise<ToolStatus> {
  const binPath = getYtdlpPath()
  const result = await checkBinary(binPath, ['--version'])
  return {
    name: 'yt-dlp',
    bundled: true,
    ...result,
  }
}

async function checkUv(): Promise<ToolStatus> {
  const result = await checkBinary('uv', ['--version'])
  return {
    name: 'uv',
    bundled: false,
    ...result,
    installUrl: 'https://docs.astral.sh/uv/',
    installHint: 'curl -LsSf https://astral.sh/uv/install.sh | sh',
  }
}

async function checkWhisperx(): Promise<ToolStatus> {
  const result = await checkBinary('whisperx', ['--help'])
  return {
    name: 'whisperx',
    bundled: false,
    ...result,
    installUrl: 'https://github.com/m-bain/whisperX',
    installHint: 'pip install whisperx',
  }
}

async function checkEbookConvert(): Promise<ToolStatus> {
  const result = await checkBinary('ebook-convert', ['--version'])
  return {
    name: 'ebook-convert',
    bundled: false,
    ...result,
    installUrl: 'https://calibre-ebook.com/download',
    installHint: 'Install Calibre from https://calibre-ebook.com/download',
  }
}
