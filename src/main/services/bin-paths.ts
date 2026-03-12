import { app } from 'electron'
import path from 'node:path'

const IS_WIN = process.platform === 'win32'

function getBundledBinPath(name: string): string {
  const bin = IS_WIN ? `${name}.exe` : name
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', bin)
  }
  // In development, use the npm packages
  return '' // will be overridden per-tool below
}

export function getFfmpegPath(): string {
  if (app.isPackaged) {
    return getBundledBinPath('ffmpeg')
  }
  // In dev, use @ffmpeg-installer/ffmpeg
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@ffmpeg-installer/ffmpeg').path
}

export function getFfprobePath(): string {
  if (app.isPackaged) {
    return getBundledBinPath('ffprobe')
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@ffprobe-installer/ffprobe').path
}

export function getYtdlpPath(configPath?: string): string {
  // User-configured path takes precedence
  if (configPath) return configPath

  if (app.isPackaged) {
    return getBundledBinPath('yt-dlp')
  }
  // In dev, fall back to system PATH
  return 'yt-dlp'
}
