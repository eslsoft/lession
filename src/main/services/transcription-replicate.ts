import Replicate from 'replicate'
import fs from 'node:fs'
import type { Segment, WordToken } from '../../shared/types'

const DEFAULT_MODEL = 'victor-upmeet/whisperx'

/** Fetch model info to resolve the latest version and detect the audio input field name. */
async function resolveModel(replicate: Replicate, owner: string, name: string): Promise<{ version: string; audioField: string }> {
  const model = await replicate.models.get(owner, name)
  const version = model.latest_version?.id
  if (!version) throw new Error(`Model ${owner}/${name} has no published version on Replicate.`)

  let audioField = 'audio'
  const schema = model.latest_version?.openapi_schema as {
    components?: { schemas?: { Input?: { properties?: Record<string, { format?: string }> } } }
  } | null
  const props = schema?.components?.schemas?.Input?.properties
  if (props) {
    const field = Object.keys(props).find((k) => k.toLowerCase().includes('audio'))
    if (field) audioField = field
  }

  return { version, audioField }
}

export async function transcribeWithReplicate(
  apiToken: string,
  model: string,
  filePath: string,
  language: string,
  onProgress?: (percent: number) => void,
): Promise<Segment[]> {
  const replicate = new Replicate({ auth: apiToken })
  const modelId = model || DEFAULT_MODEL
  const [owner, name] = modelId.split('/')

  let currentProgress = 0
  const progressInterval = setInterval(() => {
    if (currentProgress < 90) {
      currentProgress = Math.min(90, currentProgress + 2)
      onProgress?.(currentProgress)
    }
  }, 3000)

  try {
    onProgress?.(5)

    const { version, audioField } = await resolveModel(replicate, owner, name)

    const output = await replicate.run(`${owner}/${name}:${version}` as `${string}/${string}:${string}`, {
      input: {
        [audioField]: fs.readFileSync(filePath),
        language,
        align_output: true,
        batch_size: 32,
      },
    })

    clearInterval(progressInterval)
    onProgress?.(100)

    return parseOutput(output)
  } catch (err) {
    clearInterval(progressInterval)
    throw err
  }
}

function parseOutput(output: unknown): Segment[] {
  const data = output as { segments?: Record<string, unknown>[] }
  const segments = data?.segments ?? (Array.isArray(output) ? output : [])

  return segments.map((seg: Record<string, unknown>) => {
    const words: WordToken[] = ((seg.words as Record<string, unknown>[]) || []).map((w) => ({
      word: w.word as string,
      start: w.start as number,
      end: w.end as number,
      score: (w.score as number) ?? 0,
      normal: null,
      tags: null,
      chunk: null,
    }))

    return {
      start: seg.start as number,
      end: seg.end as number,
      text: seg.text as string,
      edited: false,
      speaker: (seg.speaker as string) ?? undefined,
      words,
    }
  })
}
