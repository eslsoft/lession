import { create } from 'zustand'

interface TranscriptionProgress {
  stage: string
  percent: number
}

interface TranscriptionState {
  /** episodeId → live progress; entry exists ⟹ transcription is running */
  progresses: Record<string, TranscriptionProgress>

  /**
   * Episode IDs whose transcription just finished (nlp reached 100 %).
   * Pages subscribe to this to know when to refetch episode / transcript data,
   * then call `ackCompleted(id)` to remove the id from the set.
   */
  completedIds: string[]

  /** Remove a single episode's progress (e.g. on error / manual cancel). */
  clear: (episodeId: string) => void

  /** Acknowledge that the UI has handled a completion event. */
  ackCompleted: (episodeId: string) => void
}

export const useTranscriptionStore = create<TranscriptionState>((set) => ({
  progresses: {},
  completedIds: [],

  clear: (episodeId) =>
    set((state) => {
      const { [episodeId]: _, ...rest } = state.progresses
      return { progresses: rest }
    }),

  ackCompleted: (episodeId) =>
    set((state) => ({
      completedIds: state.completedIds.filter((id) => id !== episodeId),
    })),
}))

// ---------------------------------------------------------------------------
// Global IPC subscription — lives for the entire app lifetime.
// ---------------------------------------------------------------------------
window.electronAPI.transcription.onProgress((data) => {
  const { episodeId, stage, percent } = data

  // The main-process pipeline ends with `emitProgress('nlp', 100)`.
  // Treat that as the "done" signal:
  //   1. Remove the progress entry so the UI stops showing a progress bar.
  //   2. Push the episodeId into `completedIds` so pages can refetch data.
  if (stage === 'nlp' && percent >= 100) {
    useTranscriptionStore.setState((state) => {
      const { [episodeId]: _, ...rest } = state.progresses
      return {
        progresses: rest,
        completedIds: [...state.completedIds, episodeId],
      }
    })
    return
  }

  // Normal in-flight progress update.
  useTranscriptionStore.setState((state) => ({
    progresses: {
      ...state.progresses,
      [episodeId]: { stage, percent },
    },
  }))
})
