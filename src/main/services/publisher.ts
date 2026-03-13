import path from 'node:path'
import { statSync } from 'node:fs'
import { listEpisodes, getEpisode, updateEpisode } from '../db/repositories/episode'
import { getSeries, listSeries } from '../db/repositories/series'
import { getTranscript } from '../db/repositories/transcript'
import { createS3Client, uploadFile, uploadJson, uploadBuffer, s3Keys } from './storage'
import { generateSRT, generateVTT } from './subtitle'
import type { AppConfig, Episode, PublishFileInfo, PublishPreviewFile, PublishStatus, Segment, Series } from '../../shared/types'

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

  // Upload media if not already uploaded
  if (episode.localPath && !episode.remoteUrl) {
    const mediaExt = path.extname(episode.localPath).slice(1) || 'mp4'
    const mediaKey = s3Keys.episodeMedia(episode.seriesId, episodeId, mediaExt)
    await uploadFile(s3, bucket, mediaKey, episode.localPath)
    updateEpisode(episodeId, { remoteUrl: mediaKey })
  } else if (episode.remoteUrl && isAbsoluteUrl(episode.remoteUrl)) {
    // Migrate legacy full URL to relative S3 key
    updateEpisode(episodeId, { remoteUrl: normalizeRemoteUrl(episode) })
  }

  // Validate transcript before publishing
  const transcript = getTranscript(episodeId)
  if (transcript) {
    validateTranscriptSegments(transcript.segments)

    // Upload transcript + subtitles
    await uploadJson(s3, bucket, s3Keys.episodeTranscript(episode.seriesId, episodeId), transcript)
    const srt = generateSRT(transcript.segments)
    const vtt = generateVTT(transcript.segments)
    await uploadBuffer(s3, bucket, s3Keys.episodeSubtitleSrt(episode.seriesId, episodeId), srt, 'text/plain')
    await uploadBuffer(s3, bucket, s3Keys.episodeSubtitleVtt(episode.seriesId, episodeId), vtt, 'text/vtt')
  }

  // Update publish status
  updateEpisode(episodeId, { publishStatus: targetStatus })

  // Regenerate feed.json for the series
  const series = getSeries(episode.seriesId)
  if (!series) throw new Error(`Series not found: ${episode.seriesId}`)
  const episodes = listEpisodes(episode.seriesId)
  const feed = generateFeedJson(series, episodes)
  await uploadJson(s3, bucket, s3Keys.seriesFeed(episode.seriesId), feed)

  // Regenerate index.json
  const allSeries = listSeries()
  const episodesMap = new Map<string, Episode[]>()
  for (const s of allSeries) {
    episodesMap.set(s.id, listEpisodes(s.id))
  }
  const index = generateIndexJson(allSeries, episodesMap)
  await uploadJson(s3, bucket, s3Keys.index(), index)
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
  const feed = generateFeedJson(series, episodes)
  await uploadJson(s3, bucket, s3Keys.seriesFeed(episode.seriesId), feed)

  // Regenerate index.json
  const allSeries = listSeries()
  const episodesMap = new Map<string, Episode[]>()
  for (const s of allSeries) {
    episodesMap.set(s.id, listEpisodes(s.id))
  }
  const index = generateIndexJson(allSeries, episodesMap)
  await uploadJson(s3, bucket, s3Keys.index(), index)
}

export async function publishSeries(seriesId: string, config: AppConfig): Promise<void> {
  const s3 = createS3Client(config.storage)
  const bucket = config.storage.bucket

  // Regenerate feed.json
  const series = getSeries(seriesId)
  if (!series) throw new Error(`Series not found: ${seriesId}`)
  const episodes = listEpisodes(seriesId)
  const feed = generateFeedJson(series, episodes)
  await uploadJson(s3, bucket, s3Keys.seriesFeed(seriesId), feed)

  // Regenerate index.json
  const allSeries = listSeries()
  const episodesMap = new Map<string, Episode[]>()
  for (const s of allSeries) {
    episodesMap.set(s.id, listEpisodes(s.id))
  }
  const index = generateIndexJson(allSeries, episodesMap)
  await uploadJson(s3, bucket, s3Keys.index(), index)
}

export function generateFeedJson(series: Series, episodes: Episode[]): object {
  const publishedEpisodes = episodes.filter(
    (ep) => ep.publishStatus === 'published' || ep.publishStatus === 'preview',
  )

  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: series.title,
    description: series.description ?? '',
    icon: series.coverPath ? s3Keys.seriesCover(series.id, getExt(series.coverPath)) : '',
    language: series.language,
    authors: series.authors?.map((name) => ({ name })) ?? [],
    _type: series.type,
    _id: series.id,
    _category: series.category ?? '',
    _tags: series.tags ?? [],
    _level: series.level ?? '',
    items: publishedEpisodes.map((ep) => buildFeedItem(series, ep)),
  }
}

export function generateIndexJson(
  allSeries: Series[],
  episodes: Map<string, Episode[]>,
): object {
  const publishedSeries = allSeries.filter((s) => {
    const eps = episodes.get(s.id) || []
    return eps.some((ep) => ep.publishStatus === 'published')
  })

  return {
    version: '1',
    updatedAt: new Date().toISOString(),
    series: publishedSeries.map((s) => {
      const eps = episodes.get(s.id) || []
      const publishedEps = eps.filter((ep) => ep.publishStatus === 'published')
      return {
        id: s.id,
        title: s.title,
        description: s.description ?? '',
        type: s.type,
        language: s.language,
        authors: s.authors ?? [],
        category: s.category ?? '',
        tags: s.tags ?? [],
        level: s.level ?? '',
        cover: s.coverPath ? s3Keys.seriesCover(s.id, getExt(s.coverPath)) : '',
        feedUrl: s3Keys.seriesFeed(s.id),
        episodeCount: publishedEps.length,
        totalDuration: publishedEps.reduce((sum, ep) => sum + (ep.duration ?? 0), 0),
        publishedAt: s.updatedAt,
      }
    }),
  }
}

export function previewPublishFiles(episodeId: string, _mode: PublishStatus): PublishFileInfo[] | null {
  const episode = getEpisode(episodeId)
  if (!episode) return null
  if (!getSeries(episode.seriesId)) return null

  const files: PublishFileInfo[] = []

  // feed & index first — most relevant for preview
  files.push({ key: s3Keys.seriesFeed(episode.seriesId), type: 'json' })
  files.push({ key: s3Keys.index(), type: 'json' })

  if (episode.localPath && !episode.remoteUrl) {
    const mediaExt = path.extname(episode.localPath).slice(1) || 'mp4'
    files.push({
      key: s3Keys.episodeMedia(episode.seriesId, episodeId, mediaExt),
      type: 'binary',
      size: getFileSize(episode.localPath),
    })
  }

  const transcript = getTranscript(episodeId)
  if (transcript) {
    files.push({ key: s3Keys.episodeTranscript(episode.seriesId, episodeId), type: 'json' })
    files.push({ key: s3Keys.episodeSubtitleSrt(episode.seriesId, episodeId), type: 'text' })
    files.push({ key: s3Keys.episodeSubtitleVtt(episode.seriesId, episodeId), type: 'text' })
  }

  return files
}

export function previewPublishFile(episodeId: string, fileKey: string, mode: PublishStatus): PublishPreviewFile | null {
  const episode = getEpisode(episodeId)
  if (!episode) return null
  const series = getSeries(episode.seriesId)
  if (!series) return null

  if (fileKey === s3Keys.index()) {
    const allSeries = listSeries()
    const episodesMap = new Map<string, Episode[]>()
    for (const s of allSeries) {
      const eps = listEpisodes(s.id)
      episodesMap.set(s.id, s.id === episode.seriesId
        ? eps.map((ep) => ep.id === episodeId ? { ...ep, publishStatus: mode } : ep)
        : eps,
      )
    }
    return { key: fileKey, type: 'json', content: generateIndexJson(allSeries, episodesMap) }
  }

  if (fileKey === s3Keys.seriesFeed(episode.seriesId)) {
    const episodes = listEpisodes(episode.seriesId)
    const simulatedEpisodes = episodes.map((ep) =>
      ep.id === episodeId ? { ...ep, publishStatus: mode, remoteUrl: normalizeRemoteUrl(ep) } : { ...ep, remoteUrl: normalizeRemoteUrl(ep) },
    )
    return { key: fileKey, type: 'json', content: generateFeedJson(series, simulatedEpisodes) }
  }

  if (fileKey === s3Keys.episodeTranscript(episode.seriesId, episodeId)) {
    const transcript = getTranscript(episodeId)
    if (!transcript) return null
    return { key: fileKey, type: 'json', content: transcript }
  }

  if (fileKey === s3Keys.episodeSubtitleSrt(episode.seriesId, episodeId)) {
    const transcript = getTranscript(episodeId)
    if (!transcript) return null
    return { key: fileKey, type: 'text', content: generateSRT(transcript.segments) }
  }

  if (fileKey === s3Keys.episodeSubtitleVtt(episode.seriesId, episodeId)) {
    const transcript = getTranscript(episodeId)
    if (!transcript) return null
    return { key: fileKey, type: 'text', content: generateVTT(transcript.segments) }
  }

  if (episode.localPath) {
    const mediaExt = path.extname(episode.localPath).slice(1) || 'mp4'
    if (fileKey === s3Keys.episodeMedia(episode.seriesId, episodeId, mediaExt)) {
      return { key: fileKey, type: 'binary', size: getFileSize(episode.localPath), content: '' }
    }
  }

  return null
}

/**
 * Validate transcript segments before publishing.
 * Rules:
 * 1. Each word token's `word` must be a substring of the segment's `text`
 * 2. Word tokens must appear in `text` in the same order as in the `words` array
 * 3. Each word token's time range (start/end) must fall within its own segment's time range
 * 4. Segment text must not contain newline characters
 */
export function validateTranscriptSegments(segments: Segment[]): void {
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const text = segment.text

    // Rule 4: no newlines in text
    if (/[\r\n]/.test(text)) {
      throw new Error(`Segment ${i}: text contains newline characters`)
    }

    let searchFrom = 0
    for (let j = 0; j < segment.words.length; j++) {
      const wordToken = segment.words[j]

      // Rule 1: word must be substring of text
      const pos = text.indexOf(wordToken.word, searchFrom)
      if (pos === -1) {
        throw new Error(
          `Segment ${i}, word ${j} ("${wordToken.word}"): not found in segment text after position ${searchFrom}`,
        )
      }

      // Rule 2: advance search position to maintain order
      searchFrom = pos + wordToken.word.length

      // Rule 3: word timing must fall within its segment's time range
      if (wordToken.start < segment.start || wordToken.end > segment.end) {
        throw new Error(
          `Segment ${i}, word ${j} ("${wordToken.word}"): time range [${wordToken.start}, ${wordToken.end}] outside segment range [${segment.start}, ${segment.end}]`,
        )
      }
    }
  }
}

function getFileSize(filePath: string): string {
  try {
    const stats = statSync(filePath)
    const bytes = stats.size
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  } catch {
    return 'unknown'
  }
}

function buildFeedItem(series: Series, episode: Episode) {
  const mediaExt = episode.localPath
    ? path.extname(episode.localPath).slice(1)
    : (episode.mimeType === 'video' ? 'mp4' : 'mp3')
  const mimeType = episode.mimeType === 'video' ? `video/${mediaExt}` : `audio/${mediaExt}`

  const transcript = getTranscript(episode.id)
  const sentenceCount = transcript?.segments.length ?? 0
  const wordCount = transcript?.segments.reduce((sum, seg) => sum + seg.words.length, 0) ?? 0

  return {
    id: episode.id,
    title: episode.title,
    summary: episode.description ?? '',
    date_published: episode.updatedAt,
    attachments: [
      {
        url: s3Keys.episodeMedia(series.id, episode.id, mediaExt),
        mime_type: mimeType,
        duration_in_seconds: episode.duration ?? 0,
      },
    ],
    _order: episode.order,
    _status: episode.publishStatus,
    _sentence_count: sentenceCount,
    _word_count: wordCount,
    _transcript_url: s3Keys.episodeTranscript(series.id, episode.id),
    _subtitles: {
      srt: s3Keys.episodeSubtitleSrt(series.id, episode.id),
      vtt: s3Keys.episodeSubtitleVtt(series.id, episode.id),
    },
  }
}

function getExt(filePath: string): string {
  const dot = filePath.lastIndexOf('.')
  return dot >= 0 ? filePath.substring(dot) : ''
}

function isAbsoluteUrl(str: string): boolean {
  return /^https?:\/\//.test(str)
}

/** Convert legacy full-URL remoteUrl to S3 key; return undefined if not set */
function normalizeRemoteUrl(episode: Episode): string | undefined {
  if (!episode.remoteUrl) return undefined
  if (!isAbsoluteUrl(episode.remoteUrl)) return episode.remoteUrl
  // Legacy: derive key from episode metadata
  const mediaExt = path.extname(episode.localPath ?? '').slice(1) || 'mp4'
  return s3Keys.episodeMedia(episode.seriesId, episode.id, mediaExt)
}
