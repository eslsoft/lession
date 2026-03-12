import type { Download } from '@shared/types'

export function formatDuration(seconds?: number): string {
  if (!seconds) return '--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return d.toLocaleDateString()
}

export function statusLabel(status: Download['status']): string {
  switch (status) {
    case 'pending': return 'Queued'
    case 'downloading': return 'Downloading'
    case 'converting': return 'Converting'
    case 'paused': return 'Paused'
    case 'done': return 'Completed'
    case 'error': return 'Failed'
  }
}

export function statusColor(status: Download['status']): string {
  switch (status) {
    case 'pending': return 'text-muted-foreground'
    case 'downloading': return 'text-blue-500'
    case 'converting': return 'text-orange-500'
    case 'paused': return 'text-yellow-500'
    case 'done': return 'text-green-500'
    case 'error': return 'text-destructive'
  }
}

export function progressBarColor(status: Download['status']): string {
  switch (status) {
    case 'downloading': return '[&>div]:bg-blue-500'
    case 'converting': return '[&>div]:bg-orange-500'
    case 'paused': return '[&>div]:bg-yellow-500'
    case 'done': return '[&>div]:bg-green-500'
    case 'error': return '[&>div]:bg-destructive'
    default: return ''
  }
}

export type StatusFilter = 'all' | Download['status']

export const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'downloading', label: 'Downloading' },
  { value: 'converting', label: 'Converting' },
  { value: 'pending', label: 'Queued' },
  { value: 'paused', label: 'Paused' },
  { value: 'done', label: 'Completed' },
  { value: 'error', label: 'Failed' },
]
