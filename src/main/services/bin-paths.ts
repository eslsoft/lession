import { app } from 'electron'
import path from 'node:path'
import { getUvToolPath } from './uv-tools'

const IS_WIN = process.platform === 'win32'

function getBundledBinPath(name: string): string {
  const bin = IS_WIN ? `${name}.exe` : name
  return path.join(process.resourcesPath, 'bin', bin)
}

export function getFfmpegPath(): string {
  if (app.isPackaged) return getBundledBinPath('ffmpeg')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@ffmpeg-installer/ffmpeg').path
}

export function getFfprobePath(): string {
  if (app.isPackaged) return getBundledBinPath('ffprobe')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@ffprobe-installer/ffprobe').path
}

export function getUvPath(): string {
  if (app.isPackaged) return getBundledBinPath('uv')
  return 'uv'
}

export function getYtdlpPath(overridePath?: string): string | null {
  if (overridePath) return overridePath
  return getUvToolPath('yt-dlp')
}

export function getWhisperxPath(overridePath?: string): string | null {
  if (overridePath) return overridePath
  return getUvToolPath('whisperx')
}
