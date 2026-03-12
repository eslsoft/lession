import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { app, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { IPC } from '../../shared/ipc-channels'
import type { AppConfig, BookImport, ExtractedBook, Segment, ServiceConfig, TtsEngine } from '../../shared/types'
import { BUILTIN_SERVICES } from '../../shared/types'
import {
  createBookImport,
  getBookImport,
  updateBookImport,
} from '../db/repositories/book-import'
import { createEpisode, updateEpisode, updateEpisodeStatus, getNextOrder } from '../db/repositories/episode'
import { getTranscript, createTranscript, updateTranscript, updateTranscriptSegments } from '../db/repositories/transcript'
import { dispatchTts, getProviderCapabilities, listTtsVoices } from './tts'
import type { TtsSegment } from './tts'
import { convertToM4a } from './converter'
import { getMediaMetadata } from './splitter'
import { processTranscript } from './nlp'

/**
 * Convert word-level TTS segments into sentence-level Transcript segments.
 * Uses the original text to determine sentence boundaries, since TTS word
 * boundaries don't include punctuation.
 */
function ttsSegmentsToTranscriptSegments(ttsSegments: TtsSegment[], originalText: string): Segment[] {
  if (ttsSegments.length === 0) return []

  // Split original text into sentences.
  // Use a negative lookbehind to avoid splitting on common abbreviations (Mr., Dr., etc.)
  // and decimal numbers (3.14).
  const sentences = originalText
    .split(/(?<![A-Z][a-z]|[A-Z]\.[A-Z]|\d)(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const segments: Segment[] = []
  let wordIdx = 0

  for (const sentence of sentences) {
    // Count how many words this sentence has (strip punctuation for matching)
    const sentenceWords = sentence.split(/\s+/).filter(Boolean)
    const wordCount = sentenceWords.length

    if (wordIdx >= ttsSegments.length) break

    const sliceEnd = Math.min(wordIdx + wordCount, ttsSegments.length)
    const wordsInSegment = ttsSegments.slice(wordIdx, sliceEnd)

    if (wordsInSegment.length > 0) {
      const words: import('../../shared/types').WordToken[] = wordsInSegment.map((w) => ({
        word: w.text,
        start: w.start,
        end: w.end,
        score: 1,
        normal: null,
        tags: null,
        chunk: null,
      }))
      segments.push({
        start: wordsInSegment[0].start,
        end: wordsInSegment[wordsInSegment.length - 1].end,
        text: sentence,
        edited: false,
        words,
      })
    }

    wordIdx = sliceEnd
  }

  // Flush any remaining words not covered by sentence splitting
  if (wordIdx < ttsSegments.length) {
    const remaining = ttsSegments.slice(wordIdx)
    const words: import('../../shared/types').WordToken[] = remaining.map((w) => ({
      word: w.text,
      start: w.start,
      end: w.end,
      score: 1,
      normal: null,
      tags: null,
      chunk: null,
    }))
    segments.push({
      start: remaining[0].start,
      end: remaining[remaining.length - 1].end,
      text: remaining.map((w) => w.text).join(' '),
      edited: false,
      words,
    })
  }

  return segments
}

const store = new Store()
const activeImports = new Map<string, { cancelled: boolean }>()

function resolveService(serviceId: string): ServiceConfig {
  const config = store.get('config') as AppConfig | undefined
  const service = config?.services?.find((s) => s.id === serviceId)
    ?? BUILTIN_SERVICES.find((s) => s.id === serviceId)
  if (!service) throw new Error(`Service not found: ${serviceId}`)
  return service
}

function sendProgress(bookImport: BookImport): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.webContents.send(IPC.BOOK_IMPORT_PROGRESS, bookImport)
  }
}

function sendEpisodeProgress(episodeId: string, stage: string, percent: number): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.webContents.send(IPC.TRANSCRIPTION_PROGRESS, { episodeId, stage, percent })
  }
}

// ── Phase 1: Extract (synchronous, returns data for user review) ──

async function convertToEpub(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.epub') return filePath

  // Write to temp directory to avoid issues with read-only source locations
  const baseName = path.basename(filePath, ext)
  const outputPath = path.join(app.getPath('temp'), `${baseName}-${Date.now()}.epub`)

  return new Promise((resolve, reject) => {
    const proc = spawn('ebook-convert', [filePath, outputPath])
    let stderr = ''
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ebook-convert failed: ${stderr.trim() || `exit code ${code}`}`))
        return
      }
      resolve(outputPath)
    })
    proc.on('error', (err) => {
      reject(new Error(`Failed to start ebook-convert (Calibre): ${err.message}`))
    })
  })
}

function getScriptPath(scriptName: string): string {
  if (!app.isPackaged) {
    return path.join(app.getAppPath(), 'scripts', scriptName)
  }
  return path.join(process.resourcesPath, 'scripts', scriptName)
}

async function runExtractEpub(epubPath: string): Promise<{ title: string; author: string; chapters: { title: string; text: string; order: number }[] }> {
  const scriptPath = getScriptPath('extract_epub.py')

  return new Promise((resolve, reject) => {
    const proc = spawn('uv', ['run', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    proc.stdin.write(JSON.stringify({ epubPath }))
    proc.stdin.end()

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`EPUB extraction failed: ${stderr.trim() || `exit code ${code}`}`))
        return
      }
      try {
        resolve(JSON.parse(stdout))
      } catch {
        reject(new Error('Failed to parse EPUB extraction output'))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to start extract_epub.py: ${err.message}`))
    })
  })
}

/**
 * Extract chapters from an EPUB/PDF file.
 * Returns data for user to review before generating.
 */
export async function extractBook(filePath: string): Promise<ExtractedBook> {
  // Convert PDF → EPUB if needed
  let epubPath = filePath
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.pdf') {
    epubPath = await convertToEpub(filePath)
  }

  const extracted = await runExtractEpub(epubPath)

  return {
    title: extracted.title,
    author: extracted.author,
    epubPath,
    chapters: extracted.chapters.map((ch) => ({
      title: ch.title,
      text: ch.text,
      order: ch.order,
      selected: true,
    })),
  }
}

// ── Phase 2: Generate (async pipeline, user has confirmed chapters) ──

interface ConfirmedChapter {
  title: string
  text: string
}

export function startBookImport(
  seriesId: string,
  epubPath: string,
  confirmedChapters: ConfirmedChapter[],
  serviceId: string,
  voice: string,
  speed: number,
  model?: string,
): BookImport {
  // Prevent concurrent imports for the same series
  for (const [, control] of activeImports) {
    if (!control.cancelled) {
      throw new Error('Another book import is already in progress. Please wait or cancel it first.')
    }
  }

  const bookImport = createBookImport({
    seriesId,
    filePath: epubPath,
    epubPath,
    status: 'generating',
    totalChapters: confirmedChapters.length,
    completedChapters: 0,
    chapters: confirmedChapters.map((ch) => ({
      title: ch.title,
      textLength: ch.text.length,
      status: 'pending' as const,
    })),
  })

  const control = { cancelled: false }
  activeImports.set(bookImport.id, control)

  // Kick off pipeline asynchronously
  runGeneratePipeline(bookImport.id, seriesId, epubPath, confirmedChapters, serviceId, voice, speed, control, model).catch((err) => {
    const existing = getBookImport(bookImport.id)
    if (existing && existing.status !== 'cancelled') {
      updateBookImport(bookImport.id, {
        status: 'error',
        lastError: err instanceof Error ? err.message : String(err),
      })
      sendProgress(getBookImport(bookImport.id)!)
    }
    activeImports.delete(bookImport.id)
  })

  return getBookImport(bookImport.id)!
}

export function cancelBookImport(id: string): void {
  const control = activeImports.get(id)
  if (control) {
    control.cancelled = true
  }
  const existing = getBookImport(id)
  if (existing) {
    updateBookImport(id, { status: 'cancelled' })
    sendProgress(getBookImport(id)!)
  }
}

export function retryBookImport(id: string): void {
  const existing = getBookImport(id)
  if (!existing) throw new Error(`Book import ${id} not found`)

  const control = { cancelled: false }
  activeImports.set(id, control)

  updateBookImport(id, { status: 'generating', lastError: undefined })
  sendProgress(getBookImport(id)!)

  // Re-extract text, then re-run only failed/pending chapters
  retryPipeline(id, control).catch((err) => {
    const current = getBookImport(id)
    if (current && current.status !== 'cancelled') {
      updateBookImport(id, {
        status: 'error',
        lastError: err instanceof Error ? err.message : String(err),
      })
      sendProgress(getBookImport(id)!)
    }
    activeImports.delete(id)
  })
}

// ── Pipeline implementation ──

async function runGeneratePipeline(
  importId: string,
  seriesId: string,
  epubPath: string,
  confirmedChapters: ConfirmedChapter[],
  serviceId: string,
  voice: string,
  speed: number,
  control: { cancelled: boolean },
  model?: string,
): Promise<void> {
  const resolved = resolveService(serviceId)
  const service = model ? { ...resolved, options: { ...resolved.options, model } } : resolved
  const bookImport = getBookImport(importId)!
  const chapters = bookImport.chapters!

  // Create episodes for each confirmed chapter
  let nextOrder = getNextOrder(seriesId)
  for (let i = 0; i < confirmedChapters.length; i++) {
    const ch = confirmedChapters[i]
    const episode = createEpisode({
      seriesId,
      title: ch.title,
      order: nextOrder++,
      mimeType: 'audio',
      status: 'generating',
      publishStatus: 'draft',
      source: { type: 'local', origin: epubPath },
    })
    chapters[i].episodeId = episode.id
  }

  updateBookImport(importId, { chapters })
  sendProgress(getBookImport(importId)!)

  // Generate audio for each chapter
  const outputDir = path.join(app.getPath('userData'), 'episodes', seriesId)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  let completedCount = 0

  for (let i = 0; i < confirmedChapters.length; i++) {
    if (control.cancelled) { activeImports.delete(importId); return }

    const ch = confirmedChapters[i]
    const chapter = chapters[i]
    const episodeId = chapter.episodeId!

    chapter.status = 'generating'
    updateBookImport(importId, { chapters })
    sendEpisodeProgress(episodeId, 'generating', 0)

    try {
      // TTS: text → audio
      const capabilities = getProviderCapabilities(service.engine as TtsEngine)
      const rawAudioPath = path.join(outputDir, `${episodeId}${capabilities.audioFormat}`)
      const ttsResult = await dispatchTts(
        service,
        voice,
        speed,
        ch.text,
        rawAudioPath,
        (percent) => sendEpisodeProgress(episodeId, 'generating', Math.round(percent * 0.8)),
      )

      if (control.cancelled) { activeImports.delete(importId); return }

      // Convert to M4A
      sendEpisodeProgress(episodeId, 'generating', 80)
      const m4aPath = await convertToM4a(rawAudioPath, outputDir, ttsResult.duration, (percent) => {
        sendEpisodeProgress(episodeId, 'generating', 80 + Math.round(percent * 0.2))
      })

      // Clean up raw audio
      try { fs.unlinkSync(rawAudioPath) } catch { /* ignore */ }

      // Get accurate duration
      const metadata = await getMediaMetadata(m4aPath)

      updateEpisode(episodeId, {
        localPath: m4aPath,
        duration: metadata.duration,
        status: 'ready',
      })

      // Create transcript + run NLP if provider supports word-level timestamps
      if (capabilities.wordLevelTimestamps && ttsResult.segments.length > 0) {
        const transcriptSegments = ttsSegmentsToTranscriptSegments(ttsResult.segments, ch.text)
        const transcript = createTranscript({
          episodeId,
          language: 'en',
          segments: transcriptSegments,
        })

        // Run NLP analysis
        try {
          sendEpisodeProgress(episodeId, 'nlp', 0)
          const nlpSegments = await processTranscript(transcriptSegments)
          updateTranscriptSegments(transcript.id, nlpSegments)
          sendEpisodeProgress(episodeId, 'nlp', 100)
        } catch {
          // NLP failed — keep transcript without NLP data
        }

        updateEpisodeStatus(episodeId, 'transcribed')
      }

      chapter.status = 'done'
      completedCount++
      sendEpisodeProgress(episodeId, 'generating', 100)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      chapter.status = 'error'
      chapter.error = message

      updateEpisode(episodeId, {
        status: 'ready',
        lastError: { message, occurredAt: new Date().toISOString() },
      })
      sendEpisodeProgress(episodeId, 'generating', -1)
    }

    updateBookImport(importId, { completedChapters: completedCount, chapters })
    sendProgress(getBookImport(importId)!)
  }

  // All chapters processed
  const hasErrors = chapters.some((ch) => ch.status === 'error')
  updateBookImport(importId, {
    status: hasErrors ? 'error' : 'done',
    lastError: hasErrors ? `${chapters.filter((ch) => ch.status === 'error').length} chapter(s) failed` : undefined,
  })
  sendProgress(getBookImport(importId)!)
  activeImports.delete(importId)
}

async function retryPipeline(
  importId: string,
  control: { cancelled: boolean },
): Promise<void> {
  const bookImport = getBookImport(importId)
  if (!bookImport || !bookImport.chapters) throw new Error('No chapters to retry')

  // For retry we need to find a TTS service — use the first available TTS service
  const config = store.get('config') as AppConfig | undefined
  const ttsService = config?.services?.find((s) => s.category === 'tts')
  if (!ttsService) throw new Error('No TTS service configured. Please add one in Settings.')

  const chapters = bookImport.chapters
  const outputDir = path.join(app.getPath('userData'), 'episodes', bookImport.seriesId)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Re-extract text from EPUB for chapters that need retry
  const epubPath = bookImport.epubPath ?? bookImport.filePath
  const extracted = await runExtractEpub(epubPath)

  let completedCount = chapters.filter((ch) => ch.status === 'done').length

  for (let i = 0; i < chapters.length; i++) {
    if (control.cancelled) { activeImports.delete(importId); return }

    const chapter = chapters[i]
    if (chapter.status === 'done') continue

    const episodeId = chapter.episodeId
    if (!episodeId) continue

    // Find matching extracted chapter by title
    const extractedChapter = extracted.chapters.find((ec) => ec.title === chapter.title) ?? extracted.chapters[i]
    if (!extractedChapter) continue

    chapter.status = 'generating'
    chapter.error = undefined
    updateBookImport(importId, { chapters })
    sendEpisodeProgress(episodeId, 'generating', 0)

    try {
      const capabilities = getProviderCapabilities(ttsService.engine as TtsEngine)
      const rawAudioPath = path.join(outputDir, `${episodeId}${capabilities.audioFormat}`)
      const ttsResult = await dispatchTts(
        ttsService,
        ttsService.options.voice || (await listTtsVoices(ttsService.engine as TtsEngine, ttsService.credentials)).default,
        parseFloat(ttsService.options.speed || '1.0'),
        extractedChapter.text,
        rawAudioPath,
        (percent) => sendEpisodeProgress(episodeId, 'generating', Math.round(percent * 0.8)),
      )

      if (control.cancelled) { activeImports.delete(importId); return }

      sendEpisodeProgress(episodeId, 'generating', 80)
      const m4aPath = await convertToM4a(rawAudioPath, outputDir, ttsResult.duration, (percent) => {
        sendEpisodeProgress(episodeId, 'generating', 80 + Math.round(percent * 0.2))
      })

      try { fs.unlinkSync(rawAudioPath) } catch { /* ignore */ }

      const metadata = await getMediaMetadata(m4aPath)

      updateEpisode(episodeId, {
        localPath: m4aPath,
        duration: metadata.duration,
        status: 'ready',
      })

      // Create/update transcript + run NLP if provider supports word-level timestamps
      if (capabilities.wordLevelTimestamps && ttsResult.segments.length > 0) {
        const transcriptSegments = ttsSegmentsToTranscriptSegments(ttsResult.segments, extractedChapter.text)
        const existing = getTranscript(episodeId)
        let transcriptId: string
        if (existing) {
          updateTranscript(existing.id, { segments: transcriptSegments })
          transcriptId = existing.id
        } else {
          const created = createTranscript({
            episodeId,
            language: 'en',
            segments: transcriptSegments,
          })
          transcriptId = created.id
        }

        // Run NLP analysis
        try {
          sendEpisodeProgress(episodeId, 'nlp', 0)
          const nlpSegments = await processTranscript(transcriptSegments)
          updateTranscriptSegments(transcriptId, nlpSegments)
          sendEpisodeProgress(episodeId, 'nlp', 100)
        } catch {
          // NLP failed — keep transcript without NLP data
        }

        updateEpisodeStatus(episodeId, 'transcribed')
      }

      chapter.status = 'done'
      completedCount++
      sendEpisodeProgress(episodeId, 'generating', 100)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      chapter.status = 'error'
      chapter.error = message

      updateEpisode(episodeId, {
        status: 'ready',
        lastError: { message, occurredAt: new Date().toISOString() },
      })
      sendEpisodeProgress(episodeId, 'generating', -1)
    }

    updateBookImport(importId, { completedChapters: completedCount, chapters })
    sendProgress(getBookImport(importId)!)
  }

  const hasErrors = chapters.some((ch) => ch.status === 'error')
  updateBookImport(importId, {
    status: hasErrors ? 'error' : 'done',
    lastError: hasErrors ? `${chapters.filter((ch) => ch.status === 'error').length} chapter(s) failed` : undefined,
  })
  sendProgress(getBookImport(importId)!)
  activeImports.delete(importId)
}
