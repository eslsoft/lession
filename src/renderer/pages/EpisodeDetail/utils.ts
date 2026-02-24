import type { EpisodeStatus, PublishStatus, Episode, Series, AppConfig } from '../../../shared/types'

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
    case 'pending': return 'secondary' as const
    case 'ready_to_process': return 'outline' as const
    case 'transcribing': return 'default' as const
    case 'transcribed': return 'secondary' as const
    case 'done': return 'secondary' as const
  }
}

export function getStatusLabel(status: EpisodeStatus): string {
  switch (status) {
    case 'pending': return 'Pending'
    case 'ready_to_process': return 'Ready'
    case 'transcribing': return 'Transcribing'
    case 'transcribed': return 'Transcribed'
    case 'done': return 'Done'
  }
}

export function buildFeedItemPreview(
  episode: Episode,
  series: Series | undefined,
  config: AppConfig | null,
  mode: PublishStatus,
): object {
  const baseUrl = config?.storage?.publicBaseUrl?.replace(/\/$/, '') ?? ''
  const baseKey = `${episode.seriesId}/${episode.id}`
  const ext = episode.localPath
    ? episode.localPath.substring(episode.localPath.lastIndexOf('.') + 1).toLowerCase() || 'mp3'
    : episode.mimeType === 'video' ? 'mp4' : 'mp3'
  const mimeType = episode.mimeType === 'video' ? `video/${ext}` : `audio/${ext}`
  const url = (key: string) => baseUrl ? `${baseUrl}/${key}` : `/${key}`

  return {
    id: episode.id,
    title: episode.title,
    summary: episode.description ?? '',
    date_published: episode.updatedAt,
    attachments: [
      {
        url: episode.remoteUrl ?? url(`${baseKey}/media.${ext}`),
        mime_type: mimeType,
        duration_in_seconds: episode.duration ?? 0,
      },
    ],
    _order: episode.order,
    _status: mode,
    _transcript_url: url(`${baseKey}/transcript.json`),
    _subtitles: {
      srt: url(`${baseKey}/subtitle.srt`),
      vtt: url(`${baseKey}/subtitle.vtt`),
    },
  }
}
