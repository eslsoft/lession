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
  | 'converting'
  | 'generating'
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
  status: 'pending' | 'downloading' | 'converting' | 'paused' | 'done' | 'error'
  progress: number
  speed?: string
  eta?: string
  fileSize?: string
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

export interface DownloadProgressInfo {
  id: string
  progress: number
  status?: Download['status']
  speed?: string
  eta?: string
  fileSize?: string
  title?: string
  duration?: number
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

// ── Book Import ──
export interface ExtractedBook {
  title: string
  author: string
  epubPath: string
  chapters: ExtractedBookChapter[]
}

export interface ExtractedBookChapter {
  title: string
  text: string
  order: number
  selected?: boolean
}

export interface BookImport {
  id: string
  seriesId: string
  filePath: string
  epubPath?: string
  status: 'pending' | 'extracting' | 'generating' | 'done' | 'error' | 'cancelled'
  totalChapters: number
  completedChapters: number
  lastError?: string
  chapters?: BookImportChapter[]
  createdAt: string
}

export interface BookImportChapter {
  title: string
  textLength: number
  episodeId?: string
  status: 'pending' | 'generating' | 'done' | 'error'
  error?: string
}

// ── Service Config ──
export type ServiceProvider = 'local' | 'openai' | 'openai_compatible' | 'elevenlabs' | 'replicate'
export type TtsEngine = 'edge_tts' | 'kokoro' | 'elevenlabs' | 'openai' | 'openai_compatible'
export type TranscriptionEngine = 'whisperx'


export interface ServiceConfig {
  id: string
  name: string
  category: 'tts' | 'transcription'
  provider: ServiceProvider
  engine: TtsEngine | TranscriptionEngine
  credentials: Record<string, string>
  options: Record<string, string>
  builtin?: boolean
}

export const BUILTIN_SERVICES: ServiceConfig[] = [
  { id: 'builtin_edge_tts', name: 'Edge TTS', category: 'tts', provider: 'local', engine: 'edge_tts', credentials: {}, options: {}, builtin: true },
  { id: 'builtin_kokoro', name: 'Kokoro', category: 'tts', provider: 'local', engine: 'kokoro', credentials: {}, options: {}, builtin: true },
  { id: 'builtin_whisperx', name: 'WhisperX', category: 'transcription', provider: 'local', engine: 'whisperx', credentials: {}, options: { device: 'cpu', computeType: 'float16', defaultLanguage: 'en' }, builtin: true },
]

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
  downloader: {
    ytdlpPath: string
    downloadDir: string
    maxConcurrent: number
  }
  services: ServiceConfig[]
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

// ── Environment Check ──
export interface ToolStatus {
  name: string
  available: boolean
  version?: string
  bundled: boolean
  managedBy?: 'uv' | 'system'
  installUrl?: string
  installHint?: string
}

export interface ToolActionProgress {
  toolName: string
  stage: 'installing' | 'upgrading' | 'done' | 'error'
  output?: string
  error?: string
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
    generate: (episodeId: string, serviceId: string) => Promise<Transcript>
    updateSegment: (transcriptId: string, segmentIndex: number, text: string) => Promise<void>
    splitSegment: (transcriptId: string, segmentIndex: number, wordIndex: number) => Promise<void>
    mergeSegments: (transcriptId: string, segmentIndex: number) => Promise<void>
    getFileTranscript: (filePath: string) => Promise<Segment[] | null>
    transcribeFile: (filePath: string, serviceId: string) => Promise<Segment[]>
    onFileProgress: (callback: (data: { stage: string; percent: number }) => void) => () => void
  }
  // Download
  download: {
    list: () => Promise<Download[]>
    start: (url: string) => Promise<Download>
    startBatch: (urls: string[]) => Promise<Download[]>
    cancel: (id: string) => Promise<void>
    pause: (id: string) => Promise<void>
    resume: (id: string) => Promise<void>
    retry: (id: string) => Promise<void>
    delete: (id: string, deleteFiles?: boolean) => Promise<void>
    clearCompleted: (deleteFiles?: boolean) => Promise<void>
    retryAllFailed: () => Promise<void>
    openFile: (id: string) => Promise<void>
    showInFolder: (id: string) => Promise<void>
    onProgress: (callback: (info: DownloadProgressInfo) => void) => () => void
  }
  // Config
  config: {
    get: () => Promise<AppConfig | null>
    set: (config: AppConfig) => Promise<void>
    testS3: (config: AppConfig['storage']) => Promise<boolean>
    verifyService: (service: ServiceConfig) => Promise<{ ok: boolean; error?: string }>
  }
  // Splitter
  splitter: {
    getMetadata: (filePath: string) => Promise<{
      duration: number
      format: string
      hasVideo: boolean
      chapters?: { start: number; end: number; title: string }[]
      tags?: {
        title?: string
        artist?: string
        album?: string
        date?: string
        genre?: string
        comment?: string
      }
      coverPath?: string
    }>
    split: (filePath: string, markers: { start: number; end: number; title: string }[], seriesId: string) => Promise<Episode[]>
    detectSilence: (filePath: string, noiseThreshold?: string, minDuration?: number) => Promise<{ start: number; end: number; duration: number }[]>
  }
  // Converter
  converter: {
    convert: (episodeId: string) => Promise<void>
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
  // TTS
  tts: {
    listModels: (engine: TtsEngine, credentials: Record<string, string>) => Promise<{ options: { value: string; label: string }[]; default: string }>
    listVoices: (engine: TtsEngine, credentials: Record<string, string>) => Promise<{ options: { value: string; label: string }[]; default: string }>
    preview: (engine: TtsEngine, credentials: Record<string, string>, voice: string, speed: number, model?: string, text?: string) => Promise<string>
  }
  // Book Import
  bookImport: {
    extract: (filePath: string) => Promise<ExtractedBook>
    preview: (serviceId: string, voice: string, speed: number, model?: string, text?: string) => Promise<string>
    generate: (seriesId: string, epubPath: string, chapters: { title: string; text: string }[], serviceId: string, voice: string, speed: number, model?: string) => Promise<BookImport>
    cancel: (id: string) => Promise<void>
    retry: (id: string) => Promise<void>
    list: (seriesId: string) => Promise<BookImport[]>
    onProgress: (callback: (data: BookImport) => void) => () => void
  }
  // Environment
  env: {
    checkAll: () => Promise<ToolStatus[]>
    installTool: (name: string) => Promise<void>
    upgradeTool: (name: string) => Promise<void>
    onToolProgress: (callback: (data: ToolActionProgress) => void) => () => void
  }
  // Media file reading
  media: {
    readFile: (filePath: string) => Promise<ArrayBuffer>
    extractPeaks: (filePath: string) => Promise<{ peaks: number[]; duration: number }>
  }
}
