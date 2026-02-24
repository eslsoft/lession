import path from 'node:path'
import { listEpisodes, getEpisode, updateEpisode } from '../db/repositories/episode'
import { getSeries, listSeries } from '../db/repositories/series'
import { getTranscript } from '../db/repositories/transcript'
import { createS3Client, uploadFile, uploadJson, uploadBuffer, getPublicUrl } from './storage'
import { generateSRT, generateVTT } from './subtitle'
import type { AppConfig, Episode, PublishStatus, Series } from '../../shared/types'

export async function publishEpisode(
  episodeId: string,
  config: AppConfig,
  targetStatus: PublishStatus = 'published',
): Promise<void> {
  const episode = getEpisode(episodeId)
  if (!episode) throw new Error(`Episode not found: ${episodeId}`)
  if (episode.status !== 'transcribed') throw new Error('Episode must be transcribed before publishing')

  const s3 = createS3Client(config.storage)
  const bucket = config.storage.bucket
  const baseUrl = config.storage.publicBaseUrl
  const baseKey = `${episode.seriesId}/${episodeId}`

  // Upload media if not already uploaded
  if (episode.localPath && !episode.remoteUrl) {
    const mediaExt = path.extname(episode.localPath).slice(1) || 'mp4'
    const mediaKey = `${baseKey}/media.${mediaExt}`
    await uploadFile(s3, bucket, mediaKey, episode.localPath)
    updateEpisode(episodeId, { remoteUrl: getPublicUrl(baseUrl, mediaKey) })
  }

  // Upload transcript + subtitles
  const transcript = getTranscript(episodeId)
  if (transcript) {
    await uploadJson(s3, bucket, `${baseKey}/transcript.json`, transcript)
    const srt = generateSRT(transcript.segments)
    const vtt = generateVTT(transcript.segments)
    await uploadBuffer(s3, bucket, `${baseKey}/subtitle.srt`, srt, 'text/plain')
    await uploadBuffer(s3, bucket, `${baseKey}/subtitle.vtt`, vtt, 'text/vtt')
  }

  // Update publish status
  updateEpisode(episodeId, { publishStatus: targetStatus })

  // Regenerate feed.json for the series
  const series = getSeries(episode.seriesId)
  if (!series) throw new Error(`Series not found: ${episode.seriesId}`)
  const episodes = listEpisodes(episode.seriesId)
  const feed = generateFeedJson(series, episodes, config)
  await uploadJson(s3, bucket, `${episode.seriesId}/feed.json`, feed)

  // Regenerate index.json
  const allSeries = listSeries()
  const episodesMap = new Map<string, Episode[]>()
  for (const s of allSeries) {
    episodesMap.set(s.id, listEpisodes(s.id))
  }
  const index = generateIndexJson(allSeries, episodesMap, config)
  await uploadJson(s3, bucket, 'index.json', index)
}

export async function unpublishEpisode(episodeId: string, config: AppConfig): Promise<void> {
  const episode = getEpisode(episodeId)
  if (!episode) throw new Error(`Episode not found: ${episodeId}`)

  updateEpisode(episodeId, { publishStatus: 'draft' })

  const s3 = createS3Client(config.storage)
  const bucket = config.storage.bucket

  // Regenerate feed.json
  const series = getSeries(episode.seriesId)
  if (!series) throw new Error(`Series not found: ${episode.seriesId}`)
  const episodes = listEpisodes(episode.seriesId)
  const feed = generateFeedJson(series, episodes, config)
  await uploadJson(s3, bucket, `${episode.seriesId}/feed.json`, feed)

  // Regenerate index.json
  const allSeries = listSeries()
  const episodesMap = new Map<string, Episode[]>()
  for (const s of allSeries) {
    episodesMap.set(s.id, listEpisodes(s.id))
  }
  const index = generateIndexJson(allSeries, episodesMap, config)
  await uploadJson(s3, bucket, 'index.json', index)
}

export async function publishSeries(seriesId: string, config: AppConfig): Promise<void> {
  const s3 = createS3Client(config.storage)
  const bucket = config.storage.bucket

  // Regenerate feed.json
  const series = getSeries(seriesId)
  if (!series) throw new Error(`Series not found: ${seriesId}`)
  const episodes = listEpisodes(seriesId)
  const feed = generateFeedJson(series, episodes, config)
  await uploadJson(s3, bucket, `${seriesId}/feed.json`, feed)

  // Regenerate index.json
  const allSeries = listSeries()
  const episodesMap = new Map<string, Episode[]>()
  for (const s of allSeries) {
    episodesMap.set(s.id, listEpisodes(s.id))
  }
  const index = generateIndexJson(allSeries, episodesMap, config)
  await uploadJson(s3, bucket, 'index.json', index)
}

export function generateFeedJson(series: Series, episodes: Episode[], config: AppConfig): object {
  const baseUrl = config.storage.publicBaseUrl
  const publishedEpisodes = episodes.filter(
    (ep) => ep.publishStatus === 'published' || ep.publishStatus === 'preview',
  )

  const coverUrl = series.coverPath
    ? getPublicUrl(baseUrl, `${series.id}/cover${getExt(series.coverPath)}`)
    : undefined

  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: series.title,
    description: series.description ?? '',
    icon: coverUrl,
    language: series.language,
    authors: series.authors?.map((name) => ({ name })),
    _type: series.type,
    _id: series.id,
    _category: series.category,
    _tags: series.tags,
    _level: series.level,
    items: publishedEpisodes.map((ep) => buildFeedItem(baseUrl, series, ep)),
  }
}

export function generateIndexJson(
  allSeries: Series[],
  episodes: Map<string, Episode[]>,
  config: AppConfig,
): object {
  const baseUrl = config.storage.publicBaseUrl

  const publishedSeries = allSeries.filter((s) => {
    const eps = episodes.get(s.id) || []
    return eps.some((ep) => ep.publishStatus === 'published')
  })

  return {
    version: '1',
    updatedAt: new Date().toISOString(),
    series: publishedSeries.map((s) => ({
      id: s.id,
      title: s.title,
      type: s.type,
      language: s.language,
      cover: s.coverPath
        ? getPublicUrl(baseUrl, `${s.id}/cover${getExt(s.coverPath)}`)
        : undefined,
      feedUrl: getPublicUrl(baseUrl, `${s.id}/feed.json`),
      publishedAt: s.updatedAt,
    })),
  }
}

function buildFeedItem(baseUrl: string, series: Series, episode: Episode) {
  const baseKey = `${series.id}/${episode.id}`
  const mediaExt = episode.localPath
    ? path.extname(episode.localPath).slice(1)
    : (episode.mimeType === 'video' ? 'mp4' : 'mp3')
  const mimeType = episode.mimeType === 'video' ? `video/${mediaExt}` : `audio/${mediaExt}`

  return {
    id: episode.id,
    title: episode.title,
    summary: episode.description ?? '',
    date_published: episode.updatedAt,
    attachments: [
      {
        url: episode.remoteUrl ?? getPublicUrl(baseUrl, `${baseKey}/media.${mediaExt}`),
        mime_type: mimeType,
        duration_in_seconds: episode.duration ?? 0,
      },
    ],
    _order: episode.order,
    _status: episode.publishStatus,
    _transcript_url: getPublicUrl(baseUrl, `${baseKey}/transcript.json`),
    _subtitles: {
      srt: getPublicUrl(baseUrl, `${baseKey}/subtitle.srt`),
      vtt: getPublicUrl(baseUrl, `${baseKey}/subtitle.vtt`),
    },
  }
}

function getExt(filePath: string): string {
  const dot = filePath.lastIndexOf('.')
  return dot >= 0 ? filePath.substring(dot) : ''
}
