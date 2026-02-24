import { ipcMain, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { IPC } from '../../shared/ipc-channels'
import { getTranscript, createTranscript, updateTranscript, updateTranscriptSegments, updateSegmentText } from '../db/repositories/transcript'
import { getEpisode, updateEpisodeStatus, updateEpisode } from '../db/repositories/episode'
import { getSeries } from '../db/repositories/series'
import { transcribe } from '../services/transcription'
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
      // Stage 1: WhisperX transcription
      updateEpisodeStatus(episodeId, 'transcribing')
      emitProgress('transcribing', 0)

      const segments = await transcribe(
        config.transcription.whisperxPath,
        episode.localPath,
        series.language,
        config.transcription.device,
        config.transcription.computeType,
        (percent) => emitProgress('transcribing', percent),
      )

      let transcript = getTranscript(episodeId)
      if (transcript) {
        updateTranscript(transcript.id, {
          segments,
          language: series.language,
          status: 'transcribed',
        })
      } else {
        transcript = createTranscript({
          episodeId,
          language: series.language,
          status: 'transcribed',
          segments,
        })
      }

      emitProgress('transcribing', 100)

      // Stage 2: NLP processing
      emitProgress('nlp', 0)
      const nlpSegments = await processTranscript(segments)
      updateTranscriptSegments(transcript.id, nlpSegments)
      updateTranscript(transcript.id, { status: 'ready' })
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
}
