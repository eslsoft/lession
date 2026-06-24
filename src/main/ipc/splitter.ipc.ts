import { ipcMain, app, BrowserWindow } from 'electron'
import path from 'node:path'
import { IPC } from '../../shared/ipc-channels'
import { getMediaMetadata, splitFile } from '../services/splitter'
import { convertToM4a } from '../services/converter'
import { detectSilence } from '../services/silence-detect'
import { createEpisode, getEpisode, getNextOrder, updateEpisode, updateEpisodeStatus } from '../db/repositories/episode'
import { createTranscript } from '../db/repositories/transcript'
import { getCachedTranscript } from '../services/transcription'
import { enrichTranscriptWithNlp } from '../services/transcript-nlp'
import type { Episode, Segment } from '../../shared/types'
import { needsAudioConversion } from '../../shared/media-formats'

/**
 * Slice transcript segments for a time range [start, end).
 * When a segment straddles a split boundary, it is split at the word level:
 * words whose midpoint falls within [start, end) are kept, and the segment
 * text / timestamps are rebuilt from the remaining words.
 * All timestamps are offset so the episode starts at 0.
 */
function sliceSegments(allSegments: Segment[], start: number, end: number): Segment[] {
  const result: Segment[] = []

  for (const seg of allSegments) {
    // Skip segments entirely outside the range
    if (seg.end <= start || seg.start >= end) continue

    // Segment fully inside — keep as-is
    if (seg.start >= start && seg.end <= end) {
      result.push({
        ...seg,
        start: seg.start - start,
        end: seg.end - start,
        words: seg.words.map((w) => ({ ...w, start: w.start - start, end: w.end - start })),
      })
      continue
    }

    // Segment straddles boundary — split at word level
    const keptWords = seg.words.filter((w) => {
      const mid = (w.start + w.end) / 2
      return mid >= start && mid < end
    })
    if (keptWords.length === 0) continue

    const text = keptWords.map((w) => w.word).join(' ')
    result.push({
      ...seg,
      start: Math.max(seg.start, start) - start,
      end: Math.min(seg.end, end) - start,
      text,
      words: keptWords.map((w) => ({ ...w, start: w.start - start, end: w.end - start })),
      // Clear derived NLP data since text changed
      phrases: undefined,
      complexity: undefined,
    })
  }

  return result
}

export function registerSplitterIpc(): void {
  ipcMain.handle(IPC.SPLITTER_GET_METADATA, (_event, filePath: string) => {
    return getMediaMetadata(filePath)
  })

  ipcMain.handle(IPC.SPLITTER_SPLIT, async (
    _event,
    filePath: string,
    markers: { start: number; end: number; title: string }[],
    seriesId: string,
    transcriptPolicy: 'none' | 'generated' | 'any' = 'none',
  ) => {
    const metadata = await getMediaMetadata(filePath)
    const outputDir = path.join(app.getPath('userData'), 'episodes', seriesId)
    const outputPaths = await splitFile(filePath, markers, outputDir)

    // Load cached transcript if available
    let cached: ReturnType<typeof getCachedTranscript> = null
    if (transcriptPolicy !== 'none') {
      try {
        cached = getCachedTranscript(filePath)
        if (transcriptPolicy === 'generated' && cached?.source === 'imported') cached = null
      } catch (err) {
        console.error('Failed to load cached transcript:', err)
      }
    }

    const isVideo = metadata.hasVideo
    const needsConvert = !isVideo && needsAudioConversion(filePath)
    const episodes: Episode[] = []

    for (let i = 0; i < markers.length; i++) {
      const nextOrder = getNextOrder(seriesId)
      const episode = createEpisode({
        seriesId,
        title: markers[i].title,
        order: nextOrder,
        mimeType: isVideo ? 'video' : 'audio',
        localPath: outputPaths[i],
        duration: markers[i].end - markers[i].start,
        source: { type: 'local', origin: filePath },
        status: needsConvert ? 'converting' : 'ready',
        publishStatus: 'draft',
      })
      episodes.push(episode)
    }

    // Convert non-M4A audio episodes in background
    if (needsConvert) {
      const mainWindow = BrowserWindow.getAllWindows()[0]
      setImmediate(async () => {
        for (const ep of episodes) {
          if (!ep.localPath) continue
          const emitProgress = (percent: number) => {
            mainWindow?.webContents.send(IPC.TRANSCRIPTION_PROGRESS, {
              episodeId: ep.id,
              stage: 'converting',
              percent,
            })
          }
          try {
            emitProgress(0)
            const m4aPath = await convertToM4a(ep.localPath, outputDir, ep.duration ?? 0, emitProgress)
            const current = getEpisode(ep.id)
            updateEpisode(ep.id, {
              localPath: m4aPath,
              ...(current?.status === 'converting' ? { status: 'ready' } : {}),
            })
            emitProgress(100)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            const current = getEpisode(ep.id)
            updateEpisode(ep.id, {
              ...(current?.status === 'converting' ? { status: 'ready' } : {}),
              lastError: { message, occurredAt: new Date().toISOString() },
            })
            emitProgress(-1)
          }
        }
      })
    }

    // Attach transcripts after all episodes are created
    const transcriptsToProcess: { episodeId: string; transcriptId: string; segments: Segment[] }[] = []
    if (cached) {
      for (let i = 0; i < markers.length; i++) {
        try {
          const episodeSegments = sliceSegments(cached.segments, markers[i].start, markers[i].end)
          if (episodeSegments.length > 0) {
            const transcript = createTranscript({
              episodeId: episodes[i].id,
              language: cached.language,
              segments: episodeSegments,
            })
            updateEpisodeStatus(episodes[i].id, 'transcribed')
            transcriptsToProcess.push({
              episodeId: episodes[i].id,
              transcriptId: transcript.id,
              segments: episodeSegments,
            })
          }
        } catch (err) {
          console.error(`Failed to create transcript for episode ${i + 1}:`, err)
        }
      }
    }

    // Run NLP in background after returning
    if (transcriptsToProcess.length > 0) {
      setImmediate(async () => {
        for (const { episodeId, transcriptId, segments: segs } of transcriptsToProcess) {
          await enrichTranscriptWithNlp(episodeId, transcriptId, segs)
        }
      })
    }

    return episodes
  })

  ipcMain.handle(IPC.SPLITTER_DETECT_SILENCE, (_event, filePath: string, noiseThreshold?: string, minDuration?: number) => {
    return detectSilence(filePath, noiseThreshold, minDuration)
  })
}
