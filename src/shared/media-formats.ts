// ── Media format definitions (single source of truth) ──

export const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.wma': 'audio/x-ms-wma',
}

export const VIDEO_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
}

export const IMAGE_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export const SUBTITLE_MIME: Record<string, string> = {
  '.srt': 'text/plain',
  '.vtt': 'text/vtt',
}

/** All media (audio + video) MIME types by extension. */
export const MEDIA_MIME: Record<string, string> = { ...AUDIO_MIME, ...VIDEO_MIME }

/** All known MIME types (media + image + subtitle + json). */
export const ALL_MIME: Record<string, string> = {
  ...MEDIA_MIME,
  ...IMAGE_MIME,
  ...SUBTITLE_MIME,
  '.json': 'application/json',
}

/** Guess MIME type from file path; falls back to `application/octet-stream`. */
export function guessMimeType(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  return ALL_MIME[ext] ?? 'application/octet-stream'
}

/** Strip leading dots: `['.mp3', '.wav']` → `['mp3', 'wav']` */
function exts(map: Record<string, string>): string[] {
  return Object.keys(map).map((k) => k.slice(1))
}

/** File-dialog filter for media files (audio + video). */
export const MEDIA_FILE_FILTER = { name: 'Media Files', extensions: exts(MEDIA_MIME) }

/** File-dialog filter for image files. */
export const IMAGE_FILE_FILTER = { name: 'Images', extensions: exts(IMAGE_MIME) }

const VIDEO_EXT_SET = new Set(Object.keys(VIDEO_MIME))
const DIRECT_MP4_AUDIO_EXT_SET = new Set(['.m4a', '.m4b'])

/** Check whether a file path refers to a video format by extension. */
export function isVideoPath(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  return VIDEO_EXT_SET.has(ext)
}

/** M4A and M4B are both directly usable AAC/MP4 audio containers. */
export function needsAudioConversion(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  return !DIRECT_MP4_AUDIO_EXT_SET.has(ext)
}
