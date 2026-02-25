// Single source of truth for all S3 storage paths.
// Shared between main process and renderer.

export const s3Keys = {
  index: () => 'series/index.json',
  seriesFeed: (seriesId: string) => `series/${seriesId}/feed.json`,
  seriesCover: (seriesId: string, ext: string) => `series/${seriesId}/cover${ext}`,
  episodeBase: (seriesId: string, episodeId: string) => `series/${seriesId}/episodes/${episodeId}`,
  episodeMedia: (seriesId: string, episodeId: string, ext: string) =>
    `${s3Keys.episodeBase(seriesId, episodeId)}/media.${ext}`,
  episodeTranscript: (seriesId: string, episodeId: string) =>
    `${s3Keys.episodeBase(seriesId, episodeId)}/transcript.json`,
  episodeSubtitleSrt: (seriesId: string, episodeId: string) =>
    `${s3Keys.episodeBase(seriesId, episodeId)}/subtitle.srt`,
  episodeSubtitleVtt: (seriesId: string, episodeId: string) =>
    `${s3Keys.episodeBase(seriesId, episodeId)}/subtitle.vtt`,
}
