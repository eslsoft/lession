import type { Segment } from '../../shared/types'

export function generateSRT(segments: Segment[]): string {
  return segments.map((seg, i) => {
    const start = formatTimeSRT(seg.start)
    const end = formatTimeSRT(seg.end)
    return `${i + 1}\n${start} --> ${end}\n${seg.text}\n`
  }).join('\n')
}

export function generateVTT(segments: Segment[]): string {
  const lines = ['WEBVTT', '']
  for (const seg of segments) {
    const start = formatTimeVTT(seg.start)
    const end = formatTimeVTT(seg.end)
    lines.push(`${start} --> ${end}`)
    lines.push(seg.text)
    lines.push('')
  }
  return lines.join('\n')
}

function formatTimeSRT(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`
}

function formatTimeVTT(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}
