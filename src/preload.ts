import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from './shared/ipc-channels'
import type { ElectronAPI, BookImport } from './shared/types'

const api: ElectronAPI = {
  series: {
    list: () => ipcRenderer.invoke(IPC.SERIES_LIST),
    get: (id) => ipcRenderer.invoke(IPC.SERIES_GET, id),
    create: (data) => ipcRenderer.invoke(IPC.SERIES_CREATE, data),
    update: (id, data) => ipcRenderer.invoke(IPC.SERIES_UPDATE, id, data),
    delete: (id) => ipcRenderer.invoke(IPC.SERIES_DELETE, id),
    uploadCover: (seriesId, sourcePath) => ipcRenderer.invoke(IPC.SERIES_UPLOAD_COVER, seriesId, sourcePath),
  },
  episode: {
    list: (seriesId) => ipcRenderer.invoke(IPC.EPISODE_LIST, seriesId),
    get: (id) => ipcRenderer.invoke(IPC.EPISODE_GET, id),
    create: (data) => ipcRenderer.invoke(IPC.EPISODE_CREATE, data),
    update: (id, data) => ipcRenderer.invoke(IPC.EPISODE_UPDATE, id, data),
    delete: (id) => ipcRenderer.invoke(IPC.EPISODE_DELETE, id),
    publish: (id, status) => ipcRenderer.invoke(IPC.EPISODE_PUBLISH, id, status),
  },
  transcript: {
    get: (episodeId) => ipcRenderer.invoke(IPC.TRANSCRIPT_GET, episodeId),
    generate: (episodeId, serviceId) => ipcRenderer.invoke(IPC.TRANSCRIPT_GENERATE, episodeId, serviceId),
    updateSegment: (transcriptId, segmentIndex, text) =>
      ipcRenderer.invoke(IPC.TRANSCRIPT_UPDATE_SEGMENT, transcriptId, segmentIndex, text),
    splitSegment: (transcriptId, segmentIndex, wordIndex) =>
      ipcRenderer.invoke(IPC.TRANSCRIPT_SPLIT_SEGMENT, transcriptId, segmentIndex, wordIndex),
    getFileTranscript: (filePath: string) =>
      ipcRenderer.invoke(IPC.TRANSCRIPTION_GET_FILE, filePath),
    transcribeFile: (filePath: string, serviceId: string) =>
      ipcRenderer.invoke(IPC.TRANSCRIPTION_TRANSCRIBE_FILE, filePath, serviceId),
    onFileProgress: (callback: (data: { stage: string; percent: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { stage: string; percent: number }) => callback(data)
      ipcRenderer.on(IPC.TRANSCRIPTION_FILE_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC.TRANSCRIPTION_FILE_PROGRESS, handler)
    },
  },
  download: {
    list: () => ipcRenderer.invoke(IPC.DOWNLOAD_LIST),
    start: (url) => ipcRenderer.invoke(IPC.DOWNLOAD_START, url),
    cancel: (id) => ipcRenderer.invoke(IPC.DOWNLOAD_CANCEL, id),
    retry: (id) => ipcRenderer.invoke(IPC.DOWNLOAD_RETRY, id),
    onProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, id: string, progress: number) => callback(id, progress)
      ipcRenderer.on(IPC.DOWNLOAD_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC.DOWNLOAD_PROGRESS, handler)
    },
  },
  config: {
    get: () => ipcRenderer.invoke(IPC.CONFIG_GET),
    set: (config) => ipcRenderer.invoke(IPC.CONFIG_SET, config),
    testS3: (config) => ipcRenderer.invoke(IPC.CONFIG_TEST_S3, config),
    verifyService: (service) => ipcRenderer.invoke(IPC.CONFIG_VERIFY_SERVICE, service),
  },
  splitter: {
    getMetadata: (filePath) => ipcRenderer.invoke(IPC.SPLITTER_GET_METADATA, filePath),
    split: (filePath, markers, seriesId) => ipcRenderer.invoke(IPC.SPLITTER_SPLIT, filePath, markers, seriesId),
    detectSilence: (filePath, noiseThreshold?, minDuration?) =>
      ipcRenderer.invoke(IPC.SPLITTER_DETECT_SILENCE, filePath, noiseThreshold, minDuration),
  },
  converter: {
    convert: (episodeId) => ipcRenderer.invoke(IPC.CONVERTER_CONVERT, episodeId),
  },
  publisher: {
    publishEpisode: (episodeId, targetStatus) => ipcRenderer.invoke(IPC.PUBLISHER_PUBLISH_EPISODE, episodeId, targetStatus),
    unpublishEpisode: (episodeId) => ipcRenderer.invoke(IPC.PUBLISHER_UNPUBLISH_EPISODE, episodeId),
    publishSeries: (seriesId) => ipcRenderer.invoke(IPC.PUBLISHER_PUBLISH_SERIES, seriesId),
    previewFiles: (episodeId, mode) => ipcRenderer.invoke(IPC.PUBLISHER_PREVIEW_FILES, episodeId, mode),
    previewFile: (episodeId, fileKey, mode) => ipcRenderer.invoke(IPC.PUBLISHER_PREVIEW_FILE, episodeId, fileKey, mode),
  },
  dialog: {
    openFile: (options) => ipcRenderer.invoke(IPC.DIALOG_OPEN_FILE, options),
    openDirectory: () => ipcRenderer.invoke(IPC.DIALOG_OPEN_DIRECTORY),
  },
  transcription: {
    onProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { episodeId: string; stage: string; percent: number }) => callback(data)
      ipcRenderer.on(IPC.TRANSCRIPTION_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC.TRANSCRIPTION_PROGRESS, handler)
    },
  },
  tts: {
    listModels: (engine, credentials) => ipcRenderer.invoke(IPC.TTS_LIST_MODELS, engine, credentials),
    listVoices: (engine, credentials) => ipcRenderer.invoke(IPC.TTS_LIST_VOICES, engine, credentials),
    preview: (engine, credentials, voice, speed, model?, text?) => ipcRenderer.invoke(IPC.TTS_PREVIEW, engine, credentials, voice, speed, model, text),
  },
  bookImport: {
    extract: (filePath: string) => ipcRenderer.invoke(IPC.BOOK_IMPORT_EXTRACT, filePath),
    preview: (serviceId: string, voice: string, speed: number, model?: string, text?: string) =>
      ipcRenderer.invoke(IPC.BOOK_IMPORT_PREVIEW, serviceId, voice, speed, model, text),
    generate: (seriesId: string, epubPath: string, chapters: { title: string; text: string }[], serviceId: string, voice: string, speed: number, model?: string) =>
      ipcRenderer.invoke(IPC.BOOK_IMPORT_GENERATE, seriesId, epubPath, chapters, serviceId, voice, speed, model),
    cancel: (id: string) => ipcRenderer.invoke(IPC.BOOK_IMPORT_CANCEL, id),
    retry: (id: string) => ipcRenderer.invoke(IPC.BOOK_IMPORT_RETRY, id),
    list: (seriesId: string) => ipcRenderer.invoke(IPC.BOOK_IMPORT_LIST, seriesId),
    onProgress: (callback: (data: BookImport) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: BookImport) => callback(data)
      ipcRenderer.on(IPC.BOOK_IMPORT_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC.BOOK_IMPORT_PROGRESS, handler)
    },
  },
  env: {
    checkAll: () => ipcRenderer.invoke(IPC.ENV_CHECK_ALL),
  },
  media: {
    readFile: (filePath: string) => ipcRenderer.invoke('media:read-file', filePath),
    extractPeaks: (filePath: string) => ipcRenderer.invoke('media:extract-peaks', filePath),
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
