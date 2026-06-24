import fs from 'node:fs'
import path from 'node:path'
import type { Segment, WordTimedTranscriptInfo, WordToken } from '../../shared/types'

const TIMESTAMP_PATTERN = '(?:\\d{2}:)?\\d{2}:\\d{2}\\.\\d{3}'
const INLINE_TIMESTAMP = new RegExp(`<(${TIMESTAMP_PATTERN})>`, 'g')

function parseTimestamp(value: string): number {
  const parts = value.split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  throw new Error(`Invalid VTT timestamp: ${value}`)
}

function parseCue(block: string, cueIndex: number): Segment {
  const lines = block.split(/\r?\n/)
  const timingIndex = lines.findIndex((line) => line.includes('-->'))
  if (timingIndex === -1) throw new Error(`VTT cue ${cueIndex} has no timing line`)

  const timing = lines[timingIndex].match(new RegExp(`^(${TIMESTAMP_PATTERN})\\s+-->\\s+(${TIMESTAMP_PATTERN})(?:\\s|$)`))
  if (!timing) throw new Error(`VTT cue ${cueIndex} has an invalid timing line`)

  const start = parseTimestamp(timing[1])
  const end = parseTimestamp(timing[2])
  if (end <= start) throw new Error(`VTT cue ${cueIndex} has an invalid time range`)

  const content = lines.slice(timingIndex + 1).join(' ').trim()
  const matches = [...content.matchAll(INLINE_TIMESTAMP)]
  if (matches.length === 0) throw new Error(`VTT cue ${cueIndex} has no word timestamps`)

  const words: WordToken[] = matches.map((match, index) => {
    const wordStart = parseTimestamp(match[1])
    const textStart = (match.index ?? 0) + match[0].length
    const textEnd = index + 1 < matches.length ? matches[index + 1].index : content.length
    const word = content.slice(textStart, textEnd).trim()
    if (!word) throw new Error(`VTT cue ${cueIndex} contains an empty word`)

    const wordEnd = index + 1 < matches.length ? parseTimestamp(matches[index + 1][1]) : end
    if (wordStart < start || wordEnd > end || wordEnd < wordStart) {
      throw new Error(`VTT cue ${cueIndex} contains an invalid word time range`)
    }

    return {
      word,
      start: wordStart,
      end: wordEnd,
      score: 0,
      normal: null,
      tags: null,
      chunk: null,
    }
  })

  return {
    start,
    end,
    text: words.map((word) => word.word).join(' '),
    edited: false,
    words,
  }
}

export function parseWordTimedVtt(content: string): Segment[] {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('WEBVTT')) throw new Error('File is not a WebVTT document')

  const blocks = normalized
    .split(/\n{2,}/)
    .slice(1)
    .map((block) => block.trim())
    .filter((block) => block && !/^(NOTE|STYLE|REGION)(?:\s|$)/.test(block))

  const segments = blocks.map((block, index) => parseCue(block, index + 1))
  if (segments.length === 0) throw new Error('VTT contains no word-timed cues')

  for (let index = 1; index < segments.length; index++) {
    if (segments[index].start < segments[index - 1].start) {
      throw new Error(`VTT cue ${index + 1} starts before the previous cue`)
    }
  }

  return segments
}

export function getSidecarVttPath(mediaPath: string): string {
  const extension = path.extname(mediaPath)
  return path.join(path.dirname(mediaPath), `${path.basename(mediaPath, extension)}.vtt`)
}

export function loadWordTimedVtt(mediaPath: string): { info: WordTimedTranscriptInfo; segments: Segment[] } | null {
  const filePath = getSidecarVttPath(mediaPath)
  if (!fs.existsSync(filePath)) return null

  const segments = parseWordTimedVtt(fs.readFileSync(filePath, 'utf8'))
  return {
    info: {
      filePath,
      segmentCount: segments.length,
      wordCount: segments.reduce((total, segment) => total + segment.words.length, 0),
    },
    segments,
  }
}
