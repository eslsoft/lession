import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { Segment } from '../../shared/types'
import { updateEpisode } from '../db/repositories/episode'
import { updateTranscriptSegments } from '../db/repositories/transcript'
import { processTranscript } from './nlp'
import { processTranscriptInBatches } from './nlp-batch'

const NLP_BATCH_SIZE = 200

export async function enrichTranscriptWithNlp(
  episodeId: string,
  transcriptId: string,
  segments: Segment[],
): Promise<void> {
  const mainWindow = BrowserWindow.getAllWindows()[0]
  const emitProgress = (percent: number) => {
    mainWindow?.webContents.send(IPC.TRANSCRIPTION_PROGRESS, { episodeId, stage: 'nlp', percent })
  }

  emitProgress(0)
  try {
    const processed = await processTranscriptInBatches(
      segments,
      NLP_BATCH_SIZE,
      processTranscript,
      (percent) => { if (percent < 100) emitProgress(percent) },
    )
    updateTranscriptSegments(transcriptId, processed)
    emitProgress(100)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    updateEpisode(episodeId, {
      lastError: { message: `NLP processing failed: ${message}`, occurredAt: new Date().toISOString() },
    })
    emitProgress(-1)
  }
}

export function scheduleTranscriptNlp(episodeId: string, transcriptId: string, segments: Segment[]): void {
  setImmediate(() => { void enrichTranscriptWithNlp(episodeId, transcriptId, segments) })
}
