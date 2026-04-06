#!/usr/bin/env node

/**
 * Prepare external binaries for Electron packaging.
 * Copies ffmpeg/ffprobe from npm packages and downloads uv.
 * Run before `electron-forge package` or `make`.
 *
 * yt-dlp and whisperx are managed via `uv tool install` at runtime.
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

function downloadUv() {
  const destName = IS_WIN ? 'uv.exe' : 'uv'
  const dest = path.join(BIN_DIR, destName)

  if (fs.existsSync(dest)) {
    console.log(`  uv already exists at ${dest}, skipping download`)
    return
  }

  // Determine platform-specific archive URL
  let archiveName
  if (process.platform === 'darwin') {
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
    archiveName = `uv-${arch}-apple-darwin.tar.gz`
  } else if (IS_WIN) {
    archiveName = 'uv-x86_64-pc-windows-msvc.zip'
  } else {
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
    archiveName = `uv-${arch}-unknown-linux-gnu.tar.gz`
  }

  const url = `https://github.com/astral-sh/uv/releases/latest/download/${archiveName}`
  const archivePath = path.join(BIN_DIR, archiveName)

  console.log(`  Downloading uv from ${url}`)
  execSync(`curl -L -o "${archivePath}" "${url}"`, { stdio: 'inherit' })

  // Extract the uv binary from the archive
  if (archiveName.endsWith('.tar.gz')) {
    execSync(`tar -xzf "${archivePath}" --strip-components=1 -C "${BIN_DIR}" "*/uv"`, { stdio: 'inherit' })
    fs.chmodSync(dest, 0o755)
  } else {
    execSync(`unzip -o "${archivePath}" "uv.exe" -d "${BIN_DIR}"`, { stdio: 'inherit' })
  }

  // Clean up archive
  fs.unlinkSync(archivePath)
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

// 3. uv
console.log('[3/3] uv')
try {
  downloadUv()
} catch (err) {
  console.error('  Failed to download uv:', err.message)
  process.exit(1)
}

console.log('Done! Binaries ready in', BIN_DIR)
