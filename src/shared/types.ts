// ── Series ──
export type SeriesLevel = 'beginner' | 'intermediate' | 'advanced'

export interface Series {
  id: string
  title: string
  description?: string
  coverPath?: string
  type: 'course' | 'podcast' | 'audiobook' | 'video_series'
  language: string
  authors?: string[]
  category?: string
  tags?: string[]
  level?: SeriesLevel
  createdAt: string
  updatedAt: string
}

// ── Episode ──
export type EpisodeStatus =
  | 'ready'
  | 'transcribing'
  | 'transcribed'

export type PublishStatus = 'draft' | 'preview' | 'published'

export interface Episode {
  id: string
  seriesId: string
  title: string
  description?: string
  order: number
  mimeType: 'audio' | 'video'
  localPath?: string
  remoteUrl?: string
  duration?: number
  source?: {
    type: 'url' | 'local' | 'direct'
    origin?: string
  }
  status: EpisodeStatus
  publishStatus: PublishStatus
  lastError?: {
    message: string
    occurredAt: string
  }
  createdAt: string
  updatedAt: string
}

// ── Download ──
export interface Download {
  id: string
  url: string
  filename: string
  localPath?: string
  status: 'pending' | 'downloading' | 'done' | 'error'
  progress: number
  title?: string
  thumbnailUrl?: string
  duration?: number
  chapters?: {
    title: string
    startTime: number
    endTime: number
  }[]
  lastError?: string
  createdAt: string
}

// ── Transcript ──
export interface WordToken {
  word: string
  start: number
  end: number
  score: number
  normal: string | null
  tags: string[] | null
  chunk: string | null
}

export interface PhraseToken {
  type: 'NP' | 'PV' | 'Person' | 'Place' | 'Organization' | 'Event' | 'Temporal'
  text: string
  startIdx: number
  endIdx: number // inclusive
}

export interface SegmentComplexity {
  score: 1 | 2 | 3 | 4 | 5
  label: 'Simple' | 'Basic' | 'Intermediate' | 'Advanced' | 'Complex'
  details: {
    wordCount?: number
    treeDepth?: number
    numClauses?: number
    hasSubordination?: boolean
    hasPassive?: boolean
  }
}

export interface Segment {
  start: number
  end: number
  text: string
  edited: boolean
  speaker?: string
  words: WordToken[]
  phrases?: PhraseToken[]
  complexity?: SegmentComplexity
}

export interface Transcript {
  id: string
  episodeId: string
  language: string
  segments: Segment[]
  createdAt: string
  updatedAt: string
}

// ── Config ──
export interface AppConfig {
  storage: {
    endpoint: string
    region: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
    publicBaseUrl: string
  }
  transcription: {
    provider: 'local_whisperx' | 'replicate'
    whisperxPath: string
    device: 'cpu' | 'cuda' | 'mps'
    computeType: string
    defaultLanguage: string
    replicate: {
      apiToken: string
      model: string
    }
  }
  import: {
    ytdlpPath: string
    downloadDir: string
  }
}

// ── Publish Preview ──
export interface PublishFileInfo {
  key: string
  type: 'json' | 'text' | 'binary'
  size?: string
}

export interface PublishPreviewFile extends PublishFileInfo {
  content: string | object
}

// ── IPC API Types ──
export interface ElectronAPI {
  // Series
  series: {
    list: () => Promise<Series[]>
    get: (id: string) => Promise<Series | null>
    create: (data: Omit<Series, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Series>
    update: (id: string, data: Partial<Series>) => Promise<Series>
    delete: (id: string) => Promise<void>
    uploadCover: (seriesId: string, sourcePath: string) => Promise<Series>
  }
  // Episode
  episode: {
    list: (seriesId: string) => Promise<Episode[]>
    get: (id: string) => Promise<Episode | null>
    create: (data: Omit<Episode, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Episode>
    update: (id: string, data: Partial<Episode>) => Promise<Episode>
    delete: (id: string) => Promise<void>
    publish: (id: string, status: PublishStatus) => Promise<void>
  }
  // Transcript
  transcript: {
    get: (episodeId: string) => Promise<Transcript | null>
    generate: (episodeId: string) => Promise<Transcript>
    updateSegment: (transcriptId: string, segmentIndex: number, text: string) => Promise<void>
    splitSegment: (transcriptId: string, segmentIndex: number, wordIndex: number) => Promise<void>
    getFileTranscript: (filePath: string) => Promise<Segment[] | null>
    transcribeFile: (filePath: string) => Promise<Segment[]>
    onFileProgress: (callback: (data: { stage: string; percent: number }) => void) => () => void
  }
  // Download
  download: {
    list: () => Promise<Download[]>
    start: (url: string) => Promise<Download>
    cancel: (id: string) => Promise<void>
    retry: (id: string) => Promise<void>
    onProgress: (callback: (id: string, progress: number) => void) => () => void
  }
  // Config
  config: {
    get: () => Promise<AppConfig | null>
    set: (config: AppConfig) => Promise<void>
    testS3: (config: AppConfig['storage']) => Promise<boolean>
  }
  // Splitter
  splitter: {
    getMetadata: (filePath: string) => Promise<{ duration: number; format: string }>
    split: (filePath: string, markers: { start: number; end: number; title: string }[], seriesId: string) => Promise<Episode[]>
    detectSilence: (filePath: string, noiseThreshold?: string, minDuration?: number) => Promise<{ start: number; end: number; duration: number }[]>
  }
  // Publisher
  publisher: {
    publishEpisode: (episodeId: string, targetStatus?: PublishStatus) => Promise<void>
    unpublishEpisode: (episodeId: string) => Promise<void>
    publishSeries: (seriesId: string) => Promise<void>
    previewFiles: (episodeId: string, mode: PublishStatus) => Promise<PublishFileInfo[] | null>
    previewFile: (episodeId: string, fileKey: string, mode: PublishStatus) => Promise<PublishPreviewFile | null>
  }
  // Dialog
  dialog: {
    openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>
    openDirectory: () => Promise<string | null>
  }
  // Transcription progress (main -> renderer)
  transcription: {
    onProgress: (callback: (data: { episodeId: string; stage: string; percent: number }) => void) => () => void
  }
  // Media file reading
  media: {
    readFile: (filePath: string) => Promise<ArrayBuffer>
    extractPeaks: (filePath: string) => Promise<{ peaks: number[]; duration: number }>
  }
}
