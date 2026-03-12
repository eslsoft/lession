import { ipcMain, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { IPC } from '../../shared/ipc-channels'
import { getTranscript, getTranscriptById, createTranscript, updateTranscript, updateTranscriptSegments, updateSegmentText, splitSegment } from '../db/repositories/transcript'
import { getEpisode, updateEpisodeStatus, updateEpisode } from '../db/repositories/episode'
import { getSeries } from '../db/repositories/series'
import { dispatchTranscribe, getCachedTranscript } from '../services/transcription'
import { processTranscript } from '../services/nlp'
import type { AppConfig } from '../../shared/types'

const store = new Store()

export function registerTranscriptIpc(): void {
  ipcMain.handle(IPC.TRANSCRIPT_GET, (_event, episodeId: string) => {
    return getTranscript(episodeId)
  })

  ipcMain.handle(IPC.TRANSCRIPT_GENERATE, async (_event, episodeId: string) => {
    const config = store.get('config') as AppConfig | undefined
    if (!config) throw new Error('App not configured. Please complete setup first.')

    const episode = getEpisode(episodeId)
    if (!episode) throw new Error(`Episode not found: ${episodeId}`)
    if (!episode.localPath) throw new Error(`Episode has no local file: ${episodeId}`)

    const series = getSeries(episode.seriesId)
    if (!series) throw new Error(`Series not found: ${episode.seriesId}`)

    const mainWindow = BrowserWindow.getAllWindows()[0]

    function emitProgress(stage: string, percent: number): void {
      mainWindow?.webContents.send(IPC.TRANSCRIPTION_PROGRESS, { episodeId, stage, percent })
    }

    // Clear previous error
    updateEpisode(episodeId, { lastError: undefined })

    try {
      // Stage 1: Transcription (local or cloud)
      updateEpisodeStatus(episodeId, 'transcribing')
      emitProgress('transcribing', 0)

      const segments = await dispatchTranscribe(
        config,
        episode.localPath,
        series.language,
        (percent) => emitProgress('transcribing', percent),
      )

      let transcript = getTranscript(episodeId)
      if (transcript) {
        updateTranscript(transcript.id, {
          segments,
          language: series.language,
        })
      } else {
        transcript = createTranscript({
          episodeId,
          language: series.language,
          segments,
        })
      }

      emitProgress('transcribing', 100)

      // Stage 2: NLP processing
      emitProgress('nlp', 0)
      const nlpSegments = await processTranscript(segments)
      updateTranscriptSegments(transcript.id, nlpSegments)
      emitProgress('nlp', 100)

      // Mark episode as transcribed
      updateEpisodeStatus(episodeId, 'transcribed')

      return getTranscript(episodeId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      updateEpisode(episodeId, {
        lastError: { message, occurredAt: new Date().toISOString() },
      })
      throw err
    }
  })

  ipcMain.handle(IPC.TRANSCRIPT_UPDATE_SEGMENT, (_event, transcriptId: string, segmentIndex: number, text: string) => {
    updateSegmentText(transcriptId, segmentIndex, text)
  })

  ipcMain.handle(IPC.TRANSCRIPT_SPLIT_SEGMENT, async (_event, transcriptId: string, segmentIndex: number, wordIndex: number) => {
    splitSegment(transcriptId, segmentIndex, wordIndex)

    // Re-run NLP on the two newly created segments to restore phrases & complexity
    const transcript = getTranscriptById(transcriptId)
    if (!transcript) return

    const newFirst = transcript.segments[segmentIndex]
    const newSecond = transcript.segments[segmentIndex + 1]
    if (!newFirst || !newSecond) return

    try {
      const nlpResults = await processTranscript([newFirst, newSecond])
      const segments = [...transcript.segments]
      segments[segmentIndex] = nlpResults[0]
      segments[segmentIndex + 1] = nlpResults[1]
      updateTranscriptSegments(transcriptId, segments)
    } catch {
      // NLP failed — keep the split result without NLP data
    }
  })

  // ── File-level transcription with cache ──

  ipcMain.handle(IPC.TRANSCRIPTION_GET_FILE, (_event, filePath: string) => {
    const cached = getCachedTranscript(filePath)
    return cached?.segments ?? null
  })

  ipcMain.handle(IPC.TRANSCRIPTION_TRANSCRIBE_FILE, async (_event, filePath: string) => {
    const config = store.get('config') as AppConfig | undefined
    if (!config) throw new Error('App not configured. Please complete setup first.')

    const mainWindow = BrowserWindow.getAllWindows()[0]
    function emitProgress(stage: string, percent: number): void {
      mainWindow?.webContents.send(IPC.TRANSCRIPTION_FILE_PROGRESS, { stage, percent })
    }

    emitProgress('transcribing', 0)
    const language = config.transcription.defaultLanguage || 'en'
    const segments = await dispatchTranscribe(config, filePath, language, (percent) => emitProgress('transcribing', percent))
    if (segments.length === 0) throw new Error('Transcription produced no segments.')
    emitProgress('transcribing', 100)
    return segments
  })
}
