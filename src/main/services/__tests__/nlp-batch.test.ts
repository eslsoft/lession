import { describe, expect, it, vi } from 'vitest'
import type { Segment } from '../../../shared/types'
import { processTranscriptInBatches } from '../nlp-batch'

function segment(text: string): Segment {
  return { start: 0, end: 1, text, edited: false, words: [] }
}

describe('processTranscriptInBatches', () => {
  it('processes batches sequentially and reports completed percentage', async () => {
    const segments = ['one', 'two', 'three', 'four', 'five'].map(segment)
    const processBatch = vi.fn(async (batch: Segment[]) => batch.map((item) => ({ ...item, edited: true })))
    const onProgress = vi.fn()

    const result = await processTranscriptInBatches(segments, 2, processBatch, onProgress)

    expect(processBatch.mock.calls.map(([batch]) => batch.length)).toEqual([2, 2, 1])
    expect(result.every((item) => item.edited)).toBe(true)
    expect(onProgress.mock.calls.map(([percent]) => percent)).toEqual([40, 80, 100])
  })

  it('fails when NLP drops segments from a batch', async () => {
    const segments = [segment('one'), segment('two')]

    await expect(processTranscriptInBatches(segments, 2, async () => [segments[0]], vi.fn()))
      .rejects.toThrow('NLP returned 1 segments for a batch of 2')
  })
})
