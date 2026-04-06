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
  DOWNLOAD_PAUSE: 'download:pause',
  DOWNLOAD_RESUME: 'download:resume',
  DOWNLOAD_RETRY: 'download:retry',
  DOWNLOAD_DELETE: 'download:delete',
  DOWNLOAD_CLEAR_COMPLETED: 'download:clear-completed',
  DOWNLOAD_RETRY_ALL_FAILED: 'download:retry-all-failed',
  DOWNLOAD_OPEN_FILE: 'download:open-file',
  DOWNLOAD_SHOW_IN_FOLDER: 'download:show-in-folder',
  DOWNLOAD_PROGRESS: 'download:progress',

  // Config
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_TEST_S3: 'config:testS3',
  CONFIG_VERIFY_SERVICE: 'config:verifyService',

  // Splitter
  SPLITTER_GET_METADATA: 'splitter:getMetadata',
  SPLITTER_SPLIT: 'splitter:split',
  SPLITTER_DETECT_SILENCE: 'splitter:detectSilence',

  // Converter
  CONVERTER_CONVERT: 'converter:convert',

  // Publisher
  PUBLISHER_PUBLISH_EPISODE: 'publisher:publishEpisode',
  PUBLISHER_UNPUBLISH_EPISODE: 'publisher:unpublishEpisode',
  PUBLISHER_PUBLISH_SERIES: 'publisher:publishSeries',
  PUBLISHER_PREVIEW_FILES: 'publisher:previewFiles',
  PUBLISHER_PREVIEW_FILE: 'publisher:previewFile',

  // Dialog
  DIALOG_OPEN_FILE: 'dialog:openFile',
  DIALOG_OPEN_DIRECTORY: 'dialog:openDirectory',

  // File-level transcription
  TRANSCRIPTION_GET_FILE: 'transcription:get-file',
  TRANSCRIPTION_TRANSCRIBE_FILE: 'transcription:transcribe-file',
  TRANSCRIPTION_FILE_PROGRESS: 'transcription:file-progress',

  // TTS
  TTS_LIST_MODELS: 'tts:list-models',
  TTS_LIST_VOICES: 'tts:list-voices',
  TTS_PREVIEW: 'tts:preview',

  // Book Import
  BOOK_IMPORT_EXTRACT: 'book-import:extract',
  BOOK_IMPORT_PREVIEW: 'book-import:preview',
  BOOK_IMPORT_GENERATE: 'book-import:generate',
  BOOK_IMPORT_CANCEL: 'book-import:cancel',
  BOOK_IMPORT_RETRY: 'book-import:retry',
  BOOK_IMPORT_LIST: 'book-import:list',
  BOOK_IMPORT_PROGRESS: 'book-import:progress',

  // Transcription progress (main -> renderer)
  TRANSCRIPTION_PROGRESS: 'transcription:progress',

  // Environment
  ENV_CHECK_ALL: 'env:check-all',
  ENV_TOOL_INSTALL: 'env:tool-install',
  ENV_TOOL_UPGRADE: 'env:tool-upgrade',
  ENV_TOOL_PROGRESS: 'env:tool-progress',
} as const
