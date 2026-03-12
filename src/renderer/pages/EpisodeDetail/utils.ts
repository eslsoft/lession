import type { EpisodeStatus } from '../../../shared/types'

export function formatDuration(seconds?: number): string {
  if (!seconds) return '--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function getStatusVariant(status: EpisodeStatus) {
  switch (status) {
    case 'ready': return 'outline' as const
    case 'converting': return 'default' as const
    case 'generating': return 'default' as const
    case 'transcribing': return 'default' as const
    case 'transcribed': return 'secondary' as const
  }
}

export function getStatusLabel(status: EpisodeStatus): string {
  switch (status) {
    case 'ready': return 'Ready'
    case 'converting': return 'Converting'
    case 'generating': return 'Generating'
    case 'transcribing': return 'Transcribing'
    case 'transcribed': return 'Transcribed'
  }
}
