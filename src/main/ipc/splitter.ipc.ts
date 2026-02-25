import { ipcMain, app } from 'electron'
import path from 'node:path'
import { IPC } from '../../shared/ipc-channels'
import { getMediaMetadata, splitFile } from '../services/splitter'
import { detectSilence } from '../services/silence-detect'
import { createEpisode, getNextOrder, updateEpisodeStatus } from '../db/repositories/episode'
import { createTranscript, updateTranscriptSegments } from '../db/repositories/transcript'
import { getCachedTranscript } from '../services/transcribe-dispatch'
import { processTranscript } from '../services/nlp'
import type { Episode, Segment } from '../../shared/types'

/**
 * Slice transcript segments for a time range [start, end).
 * Segments are assigned by their midpoint — if the midpoint falls
 * within the range, the segment belongs to this episode.
 * All timestamps are offset so the episode starts at 0.
 */
function sliceSegments(allSegments: Segment[], start: number, end: number): Segment[] {
  return allSegments
    .filter((seg) => {
      const mid = (seg.start + seg.end) / 2
      return mid >= start && mid < end
    })
    .map((seg) => ({
      ...seg,
      start: seg.start - start,
      end: seg.end - start,
      words: seg.words.map((w) => ({ ...w, start: w.start - start, end: w.end - start })),
    }))
}

export function registerSplitterIpc(): void {
  ipcMain.handle(IPC.SPLITTER_GET_METADATA, (_event, filePath: string) => {
    return getMediaMetadata(filePath)
  })

  ipcMain.handle(IPC.SPLITTER_SPLIT, async (_event, filePath: string, markers: { start: number; end: number; title: string }[], seriesId: string) => {
    const metadata = await getMediaMetadata(filePath)
    const outputDir = path.join(app.getPath('userData'), 'episodes', seriesId)
    const outputPaths = await splitFile(filePath, markers, outputDir)

    // Load cached transcript if available
    let cached: ReturnType<typeof getCachedTranscript> = null
    try {
      cached = getCachedTranscript(filePath)
    } catch (err) {
      console.error('Failed to load cached transcript:', err)
    }

    const isVideo = metadata.hasVideo
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
        status: 'ready',
        publishStatus: 'draft',
      })
      episodes.push(episode)
    }

    // Attach transcripts after all episodes are created
    const transcriptsToProcess: { transcriptId: string; segments: Segment[] }[] = []
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
            transcriptsToProcess.push({ transcriptId: transcript.id, segments: episodeSegments })
          }
        } catch (err) {
          console.error(`Failed to create transcript for episode ${i + 1}:`, err)
        }
      }
    }

    // Run NLP in background after returning
    if (transcriptsToProcess.length > 0) {
      setImmediate(async () => {
        for (const { transcriptId, segments: segs } of transcriptsToProcess) {
          try {
            const nlpSegments = await processTranscript(segs)
            updateTranscriptSegments(transcriptId, nlpSegments)
          } catch (err) {
            console.error(`Background NLP failed for transcript ${transcriptId}:`, err)
          }
        }
      })
    }

    return episodes
  })

  ipcMain.handle(IPC.SPLITTER_DETECT_SILENCE, (_event, filePath: string, noiseThreshold?: string, minDuration?: number) => {
    return detectSilence(filePath, noiseThreshold, minDuration)
  })
}
