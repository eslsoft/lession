import type { Segment } from '../../shared/types'

export async function processTranscriptInBatches(
  segments: Segment[],
  batchSize: number,
  processBatch: (batch: Segment[]) => Promise<Segment[]>,
  onProgress: (percent: number) => void,
): Promise<Segment[]> {
  const result: Segment[] = []

  for (let start = 0; start < segments.length; start += batchSize) {
    const batch = segments.slice(start, start + batchSize)
    const processed = await processBatch(batch)
    if (processed.length !== batch.length) {
      throw new Error(`NLP returned ${processed.length} segments for a batch of ${batch.length}`)
    }
    result.push(...processed)
    onProgress(Math.round((result.length / segments.length) * 100))
  }

  return result
}
