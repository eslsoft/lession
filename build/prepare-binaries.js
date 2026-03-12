#!/usr/bin/env node

/**
 * Prepare external binaries for Electron packaging.
 * Copies ffmpeg, ffprobe from npm installer packages and downloads yt-dlp.
 * Run before `electron-forge package` or `make`.
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const BIN_DIR = path.join(__dirname, '..', 'bin')
const IS_WIN = process.platform === 'win32'

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function copyBinary(src, destName) {
  const dest = path.join(BIN_DIR, destName)
  console.log(`  Copying ${src} -> ${dest}`)
  fs.copyFileSync(src, dest)
  if (!IS_WIN) {
    fs.chmodSync(dest, 0o755)
  }
}

function downloadYtdlp() {
  const destName = IS_WIN ? 'yt-dlp.exe' : 'yt-dlp'
  const dest = path.join(BIN_DIR, destName)

  if (fs.existsSync(dest)) {
    console.log(`  yt-dlp already exists at ${dest}, skipping download`)
    return
  }

  let url
  if (process.platform === 'darwin') {
    url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
  } else if (IS_WIN) {
    url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  } else {
    url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux'
  }

  console.log(`  Downloading yt-dlp from ${url}`)
  execSync(`curl -L -o "${dest}" "${url}"`, { stdio: 'inherit' })

  if (!IS_WIN) {
    fs.chmodSync(dest, 0o755)
  }
}

// ── Main ──

console.log('Preparing binaries...')
ensureDir(BIN_DIR)

// 1. ffmpeg
console.log('[1/3] ffmpeg')
try {
  const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
  copyBinary(ffmpegPath, IS_WIN ? 'ffmpeg.exe' : 'ffmpeg')
} catch (err) {
  console.error('  Failed to copy ffmpeg:', err.message)
  process.exit(1)
}

// 2. ffprobe
console.log('[2/3] ffprobe')
try {
  const ffprobePath = require('@ffprobe-installer/ffprobe').path
  copyBinary(ffprobePath, IS_WIN ? 'ffprobe.exe' : 'ffprobe')
} catch (err) {
  console.error('  Failed to copy ffprobe:', err.message)
  process.exit(1)
}

// 3. yt-dlp
console.log('[3/3] yt-dlp')
try {
  downloadYtdlp()
} catch (err) {
  console.error('  Failed to download yt-dlp:', err.message)
  process.exit(1)
}

console.log('Done! Binaries ready in', BIN_DIR)
