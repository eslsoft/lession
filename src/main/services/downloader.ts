import { spawn, ChildProcess } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { BrowserWindow } from 'electron'
import Store from 'electron-store'
import { IPC } from '../../shared/ipc-channels'
import type { Download, AppConfig } from '../../shared/types'
import {
  createDownload,
  updateDownload,
  getDownload,
  deleteDownload,
} from '../db/repositories/download'

const store = new Store()
const activeProcesses = new Map<string, ChildProcess>()

function getConfig(): AppConfig {
  const config = store.get('config') as AppConfig | undefined
  if (!config) throw new Error('App not configured. Please complete setup first.')
  return config
}

function sendProgress(downloadId: string, progress: number): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.webContents.send(IPC.DOWNLOAD_PROGRESS, downloadId, progress)
  }
}

export function startDownload(url: string): Download {
  const config = getConfig()
  const { ytdlpPath, downloadDir } = config.import

  // Create DB record immediately with pending status
  const download = createDownload({
    url,
    filename: '',
    status: 'pending',
    progress: 0,
  })

  // Kick off the yt-dlp process asynchronously
  runYtdlp(download.id, url, downloadDir, ytdlpPath)

  return download
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
  updateDownload(downloadId, { status: 'downloading', progress: 0 })
  sendProgress(downloadId, 0)

  const proc = spawn(ytdlpPath, [
    '-o', outputTemplate,
    '--write-info-json',
    '--newline',
    '--progress',
    url,
  ])

  activeProcesses.set(downloadId, proc)

  let lastFilename = ''

  proc.stdout.on('data', (data: Buffer) => {
    const text = data.toString()

    // Parse progress percentage
    const progressMatch = text.match(/(\d+\.?\d*)%/)
    if (progressMatch) {
      const progress = parseFloat(progressMatch[1])
      updateDownload(downloadId, { progress })
      sendProgress(downloadId, progress)
    }

    // Parse destination filename
    const destMatch = text.match(/\[download\] Destination: (.+)/)
    if (destMatch) {
      lastFilename = destMatch[1].trim()
    }

    // Also capture "already downloaded" pattern
    const alreadyMatch = text.match(/\[download\] (.+) has already been downloaded/)
    if (alreadyMatch) {
      lastFilename = alreadyMatch[1].trim()
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
    if (!existing) return

    if (code !== 0) {
      updateDownload(downloadId, {
        status: 'error',
        lastError: stderr.trim() || `yt-dlp exited with code ${code}`,
      })
      return
    }

    const localPath = lastFilename || ''
    const filename = path.basename(localPath)

    if (!localPath || !fs.existsSync(localPath)) {
      updateDownload(downloadId, {
        status: 'error',
        lastError: 'Download completed but output file not found',
      })
      return
    }

    // Read info.json for metadata
    let title: string | undefined
    let duration: number | undefined
    let chapters: Download['chapters']

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

    updateDownload(downloadId, {
      status: 'done',
      progress: 100,
      filename,
      localPath,
      title,
      duration,
      chapters,
    })
    sendProgress(downloadId, 100)
  })

  proc.on('error', (err) => {
    activeProcesses.delete(downloadId)
    const existing = getDownload(downloadId)
    if (!existing) return
    updateDownload(downloadId, {
      status: 'error',
      lastError: `Failed to start yt-dlp: ${err.message}`,
    })
  })
}

export function cancelDownload(id: string): void {
  const proc = activeProcesses.get(id)
  if (proc) {
    proc.kill('SIGTERM')
    activeProcesses.delete(id)
  }
  deleteDownload(id)
}

export function retryDownload(id: string): Download {
  const existing = getDownload(id)
  if (!existing) throw new Error(`Download ${id} not found`)

  const config = getConfig()
  const { ytdlpPath, downloadDir } = config.import

  // Reset state
  updateDownload(id, {
    status: 'pending',
    progress: 0,
    lastError: undefined,
  })

  // Re-run the download
  runYtdlp(id, existing.url, downloadDir, ytdlpPath)

  return getDownload(id)!
}
