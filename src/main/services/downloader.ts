import { spawn, ChildProcess } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { app, BrowserWindow, shell } from 'electron'
import Store from 'electron-store'
import { IPC } from '../../shared/ipc-channels'
import type { Download, AppConfig, DownloadProgressInfo } from '../../shared/types'
import { getYtdlpPath } from './bin-paths'
import {
  createDownload,
  updateDownload,
  getDownload,
  deleteDownload,
  listPendingDownloads,
  resetInterruptedDownloads,
  deleteCompletedDownloads,
  listCompletedDownloads,
  listFailedDownloads,
} from '../db/repositories/download'

const store = new Store()
const activeProcesses = new Map<string, ChildProcess>()

function getConfig(): AppConfig {
  const config = store.get('config') as AppConfig | undefined
  if (!config) throw new Error('App not configured. Please complete setup first.')
  return config
}

function sendProgress(info: DownloadProgressInfo): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.webContents.send(IPC.DOWNLOAD_PROGRESS, info)
  }
}

function getMaxConcurrent(): number {
  const config = getConfig()
  return config.downloader.maxConcurrent || 3
}

function getDefaultDownloadDir(): string {
  return path.join(app.getPath('downloads'), 'lession')
}

function tryProcessQueue(): void {
  const config = getConfig()
  const { ytdlpPath: configYtdlpPath, downloadDir: configDownloadDir } = config.downloader
  const downloadDir = configDownloadDir || getDefaultDownloadDir()
  const resolvedPath = getYtdlpPath(configYtdlpPath || undefined)

  const pending = listPendingDownloads()
  for (const dl of pending) {
    if (activeProcesses.size >= getMaxConcurrent()) break
    if (activeProcesses.has(dl.id)) continue
    if (!resolvedPath) {
      updateDownload(dl.id, {
        status: 'error',
        lastError: 'yt-dlp is not installed. Go to Settings → Environment to install it.',
      })
      continue
    }
    runYtdlp(dl.id, dl.url, downloadDir, resolvedPath)
  }
}

/** Call on app startup to reset interrupted downloads and resume pending ones. */
export function resumeDownloads(): void {
  // Downloads that were "downloading" when the app quit have no active process — reset to pending
  resetInterruptedDownloads()

  try {
    tryProcessQueue()
  } catch {
    // Config may not be set yet on first launch — that's fine
  }
}

export function startDownload(url: string): Download {
  // Create DB record immediately with pending status
  const download = createDownload({
    url,
    filename: '',
    status: 'pending',
    progress: 0,
  })

  tryProcessQueue()
  return download
}

export function startBatchDownload(urls: string[]): Download[] {
  const downloads: Download[] = []
  for (const url of urls) {
    const trimmed = url.trim()
    if (!trimmed) continue
    downloads.push(createDownload({
      url: trimmed,
      filename: '',
      status: 'pending',
      progress: 0,
    }))
  }

  tryProcessQueue()
  return downloads
}

async function runYtdlp(
  downloadId: string,
  url: string,
  downloadDir: string,
  ytdlpPath: string,
): Promise<void> {
  // Ensure download dir exists
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true })
  }

  const outputTemplate = path.join(downloadDir, '%(title)s.%(ext)s')

  // Update status to downloading
  updateDownload(downloadId, { status: 'downloading', progress: 0, speed: undefined, eta: undefined, lastError: undefined })
  sendProgress({ id: downloadId, progress: 0 })

  const proc = spawn(ytdlpPath, [
    '-o', outputTemplate,
    '--extract-audio',
    '--audio-format', 'm4a',
    '--write-info-json',
    '--newline',
    '--progress',
    '--continue',  // Support resuming partial downloads
    url,
  ], {
    // Force Python (yt-dlp) to use unbuffered stdout so progress lines
    // arrive in real-time instead of all at once when the process exits.
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  })

  activeProcesses.set(downloadId, proc)

  let lastFilename = ''
  let metaTitle: string | undefined
  let metaDuration: number | undefined

  proc.stdout.on('data', (data: Buffer) => {
    const text = data.toString()

    // Capture destination from both [download] and [ExtractAudio] phases.
    // [ExtractAudio] Destination overrides [download] Destination because
    // --extract-audio deletes the original file, so only the final .m4a exists.
    const isExtractAudio = text.includes('[ExtractAudio]')
    const destMatch = text.match(/Destination:\s*(.+)/)
    if (destMatch) {
      lastFilename = destMatch[1].trim()

      // Mark as converting when audio extraction begins
      if (isExtractAudio) {
        const current = getDownload(downloadId)
        updateDownload(downloadId, { status: 'converting', speed: undefined, eta: undefined })
        sendProgress({ id: downloadId, progress: current?.progress ?? 100, status: 'converting', title: metaTitle, duration: metaDuration })
      }

      // Read info.json for metadata when we see the first [download] Destination.
      // At this point the info.json has been fully written to disk.
      if (!metaTitle) {
        const infoPath = lastFilename.replace(/\.[^.]+$/, '.info.json')
        try {
          if (fs.existsSync(infoPath)) {
            const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'))
            if (info.title) metaTitle = info.title
            if (info.duration) metaDuration = info.duration
            const updates: Partial<Download> = {}
            if (metaTitle) updates.title = metaTitle
            if (metaDuration) updates.duration = metaDuration
            if (info.chapters?.length > 0) {
              updates.chapters = info.chapters.map((ch: Record<string, unknown>) => ({
                title: ch.title as string,
                startTime: ch.start_time as number,
                endTime: ch.end_time as number,
              }))
            }
            if (Object.keys(updates).length > 0) {
              updateDownload(downloadId, updates)
              sendProgress({ id: downloadId, progress: 0, title: metaTitle, duration: metaDuration })
            }
          }
        } catch {
          // best-effort
        }
      }
    }

    // Also capture "already downloaded" pattern
    const alreadyMatch = text.match(/\[download\] (.+) has already been downloaded/)
    if (alreadyMatch) {
      lastFilename = alreadyMatch[1].trim()
    }

    // Parse progress line: e.g. "[download]  45.2% of   17.50MiB at  2.35MiB/s ETA 00:19"
    const progressMatch = text.match(/\[download\]\s+([\d.]+)%/)
    if (progressMatch) {
      const progress = parseFloat(progressMatch[1])

      // Parse speed: e.g. "at  2.35MiB/s" or "at 512.00KiB/s"
      const speedMatch = text.match(/at\s+([\d.]+\s*\S+\/s)/)
      const speed = speedMatch ? speedMatch[1] : undefined

      // Parse ETA: e.g. "ETA 00:19" — skip "ETA Unknown"
      const etaMatch = text.match(/ETA\s+(\d[\d:]+)/)
      const eta = etaMatch ? etaMatch[1] : undefined

      // Parse file size: e.g. "of   17.50MiB" or "of ~120.50MiB"
      const sizeMatch = text.match(/of\s+~?([\d.]+\s*\S+iB)/)
      const fileSize = sizeMatch ? sizeMatch[1] : undefined

      updateDownload(downloadId, { progress, speed, eta, fileSize })
      sendProgress({ id: downloadId, progress, speed, eta, fileSize, title: metaTitle, duration: metaDuration })
    }
  })

  let stderr = ''
  proc.stderr.on('data', (data: Buffer) => {
    stderr += data.toString()
  })

  proc.on('close', (code) => {
    activeProcesses.delete(downloadId)

    // Check if the download record still exists (might have been deleted via cancel)
    const existing = getDownload(downloadId)
    if (!existing) { tryProcessQueue(); return }

    // If already handled by 'error' event or paused, skip
    if (existing.status === 'error' || existing.status === 'paused') { tryProcessQueue(); return }

    if (code !== 0) {
      updateDownload(downloadId, {
        status: 'error',
        speed: undefined,
        eta: undefined,
        lastError: stderr.trim() || `yt-dlp exited with code ${code}`,
      })
      tryProcessQueue()
      return
    }

    const localPath = lastFilename || ''
    const filename = path.basename(localPath)

    if (!localPath || !fs.existsSync(localPath)) {
      updateDownload(downloadId, {
        status: 'error',
        speed: undefined,
        eta: undefined,
        lastError: 'Download completed but output file not found',
      })
      return
    }

    // Read info.json for metadata
    let title: string | undefined
    let duration: number | undefined
    let chapters: Download['chapters']
    let fileSize: string | undefined

    const infoJsonPath = localPath.replace(/\.[^.]+$/, '.info.json')
    try {
      if (fs.existsSync(infoJsonPath)) {
        const info = JSON.parse(fs.readFileSync(infoJsonPath, 'utf-8'))
        title = info.title
        duration = info.duration
        const rawChapters = (info.chapters || []).map((ch: Record<string, unknown>) => ({
          title: ch.title as string,
          startTime: ch.start_time as number,
          endTime: ch.end_time as number,
        }))
        if (rawChapters.length > 0) chapters = rawChapters
        // Clean up info.json
        fs.unlinkSync(infoJsonPath)
      }
    } catch {
      // Metadata parsing is best-effort
    }

    // Get final file size
    try {
      const stats = fs.statSync(localPath)
      const sizeMB = stats.size / (1024 * 1024)
      fileSize = sizeMB >= 1024
        ? `${(sizeMB / 1024).toFixed(2)} GiB`
        : `${sizeMB.toFixed(2)} MiB`
    } catch {
      // best-effort
    }

    updateDownload(downloadId, {
      status: 'done',
      progress: 100,
      speed: undefined,
      eta: undefined,
      fileSize,
      filename,
      localPath,
      title,
      duration,
      chapters,
    })
    sendProgress({ id: downloadId, progress: 100, status: 'done' })
    tryProcessQueue()
  })

  proc.on('error', (err) => {
    activeProcesses.delete(downloadId)
    const existing = getDownload(downloadId)
    if (!existing) return
    updateDownload(downloadId, {
      status: 'error',
      speed: undefined,
      eta: undefined,
      lastError: (err as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'yt-dlp is not installed. Go to Settings → Environment to install it.'
        : `Failed to start yt-dlp: ${err.message}`,
    })
    tryProcessQueue()
  })
}

export function cancelDownload(id: string): void {
  const proc = activeProcesses.get(id)
  if (proc) {
    proc.kill('SIGTERM')
    activeProcesses.delete(id)
  }
  deleteDownload(id)
  tryProcessQueue()
}

export function pauseDownload(id: string): void {
  const existing = getDownload(id)
  if (!existing) throw new Error(`Download ${id} not found`)

  // Only downloading or pending can be paused
  if (existing.status !== 'downloading' && existing.status !== 'pending') {
    throw new Error(`Cannot pause download with status "${existing.status}"`)
  }

  // Kill active process if running
  const proc = activeProcesses.get(id)
  if (proc) {
    proc.kill('SIGTERM')
    activeProcesses.delete(id)
  }

  updateDownload(id, {
    status: 'paused',
    speed: undefined,
    eta: undefined,
  })
  tryProcessQueue()
}

export function resumeDownload(id: string): void {
  const existing = getDownload(id)
  if (!existing) throw new Error(`Download ${id} not found`)

  if (existing.status !== 'paused') {
    throw new Error(`Cannot resume download with status "${existing.status}"`)
  }

  // Reset to pending, queue will pick it up. --continue flag handles partial file.
  updateDownload(id, {
    status: 'pending',
    speed: undefined,
    eta: undefined,
    lastError: undefined,
  })
  tryProcessQueue()
}

export function retryDownload(id: string): Download {
  const existing = getDownload(id)
  if (!existing) throw new Error(`Download ${id} not found`)

  // Reset state to pending, let the queue pick it up
  updateDownload(id, {
    status: 'pending',
    progress: 0,
    speed: undefined,
    eta: undefined,
    lastError: undefined,
  })

  tryProcessQueue()
  return getDownload(id)!
}

export function removeDownload(id: string, deleteFiles = false): void {
  const existing = getDownload(id)
  if (!existing) throw new Error(`Download ${id} not found`)

  // Cannot remove an actively downloading item — must pause/cancel first
  if (existing.status === 'downloading') {
    throw new Error('Cannot delete an active download. Pause or cancel it first.')
  }

  if (deleteFiles && existing.localPath) {
    try { fs.unlinkSync(existing.localPath) } catch { /* file may already be gone */ }
  }

  deleteDownload(id)
}

export function clearCompletedDownloads(deleteFiles = false): void {
  if (deleteFiles) {
    const completed = listCompletedDownloads()
    for (const dl of completed) {
      if (dl.localPath) {
        try { fs.unlinkSync(dl.localPath) } catch { /* file may already be gone */ }
      }
    }
  }
  deleteCompletedDownloads()
}

export function retryAllFailedDownloads(): void {
  const failed = listFailedDownloads()
  for (const dl of failed) {
    updateDownload(dl.id, {
      status: 'pending',
      progress: 0,
      speed: undefined,
      eta: undefined,
      lastError: undefined,
    })
  }
  tryProcessQueue()
}

export function openDownloadFile(id: string): void {
  const existing = getDownload(id)
  if (!existing || !existing.localPath) throw new Error('File not found')
  if (!fs.existsSync(existing.localPath)) throw new Error('File no longer exists on disk')
  shell.openPath(existing.localPath)
}

export function showDownloadInFolder(id: string): void {
  const existing = getDownload(id)
  if (!existing || !existing.localPath) throw new Error('File not found')
  if (!fs.existsSync(existing.localPath)) throw new Error('File no longer exists on disk')
  shell.showItemInFolder(existing.localPath)
}
