// IPC channel constants shared between main and preload

export const IPC = {
  // Series
  SERIES_LIST: 'series:list',
  SERIES_GET: 'series:get',
  SERIES_CREATE: 'series:create',
  SERIES_UPDATE: 'series:update',
  SERIES_DELETE: 'series:delete',
  SERIES_UPLOAD_COVER: 'series:upload-cover',

  // Episode
  EPISODE_LIST: 'episode:list',
  EPISODE_GET: 'episode:get',
  EPISODE_CREATE: 'episode:create',
  EPISODE_UPDATE: 'episode:update',
  EPISODE_DELETE: 'episode:delete',
  EPISODE_PUBLISH: 'episode:publish',

  // Transcript
  TRANSCRIPT_GET: 'transcript:get',
  TRANSCRIPT_GENERATE: 'transcript:generate',
  TRANSCRIPT_UPDATE_SEGMENT: 'transcript:updateSegment',
  TRANSCRIPT_SPLIT_SEGMENT: 'transcript:splitSegment',

  // Download
  DOWNLOAD_LIST: 'download:list',
  DOWNLOAD_START: 'download:start',
  DOWNLOAD_CANCEL: 'download:cancel',
  DOWNLOAD_RETRY: 'download:retry',
  DOWNLOAD_PROGRESS: 'download:progress',

  // Config
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_TEST_S3: 'config:testS3',

  // Splitter
  SPLITTER_GET_METADATA: 'splitter:getMetadata',
  SPLITTER_SPLIT: 'splitter:split',

  // Publisher
  PUBLISHER_PUBLISH_EPISODE: 'publisher:publishEpisode',
  PUBLISHER_UNPUBLISH_EPISODE: 'publisher:unpublishEpisode',
  PUBLISHER_PUBLISH_SERIES: 'publisher:publishSeries',
  PUBLISHER_PREVIEW_FEED_ITEM: 'publisher:previewFeedItem',

  // Dialog
  DIALOG_OPEN_FILE: 'dialog:openFile',
  DIALOG_OPEN_DIRECTORY: 'dialog:openDirectory',

  // Transcription progress (main -> renderer)
  TRANSCRIPTION_PROGRESS: 'transcription:progress',
} as const
