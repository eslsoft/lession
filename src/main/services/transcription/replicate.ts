import ReplicateLib from 'replicate'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { Segment, WordToken, AppConfig } from '../../../shared/types'
import type { TranscriptionProvider } from './types'

/** Compress audio to 16kHz mono MP3 for upload (WhisperX downsamples to 16kHz anyway). */
function compressForUpload(filePath: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `replicate-upload-${Date.now()}.mp3`)
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-i', filePath,
      '-ac', '1',      // mono
      '-ar', '16000',  // 16kHz
      '-b:a', '64k',   // 64kbps — plenty for speech
      '-y', tmpPath,
    ])
    proc.on('close', (code) => {
      if (code === 0) resolve(tmpPath)
      else reject(new Error(`ffmpeg compression failed with code ${code}`))
    })
    proc.on('error', reject)
  })
}

/** Upload a file to S3 and return a pre-signed GET URL (valid 1 hour). */
async function uploadToS3AndGetUrl(
  storageConfig: AppConfig['storage'],
  localPath: string,
  filename: string,
): Promise<{ url: string; key: string; client: S3Client }> {
  const client = new S3Client({
    endpoint: storageConfig.endpoint,
    region: storageConfig.region,
    credentials: {
      accessKeyId: storageConfig.accessKeyId,
      secretAccessKey: storageConfig.secretAccessKey,
    },
    forcePathStyle: true,
  })

  const key = `_tmp/transcription-${Date.now()}-${filename}`
  const body = fs.readFileSync(localPath)

  await client.send(new PutObjectCommand({
    Bucket: storageConfig.bucket,
    Key: key,
    Body: body,
    ContentType: 'audio/mpeg',
  }))

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: storageConfig.bucket, Key: key }),
    { expiresIn: 3600 },
  )

  return { url, key, client }
}

const DEFAULT_MODEL = 'saltbo/whisperx'

/** Fetch model info to resolve the latest version and detect the audio input field name. */
async function resolveModel(replicate: ReplicateLib, owner: string, name: string): Promise<{ version: string; audioField: string }> {
  const model = await replicate.models.get(owner, name)
  const version = model.latest_version?.id
  if (!version) throw new Error(`Model ${owner}/${name} has no published version on Replicate.`)

  let audioField = 'audio'
  const schema = model.latest_version?.openapi_schema as {
    components?: { schemas?: { Input?: { properties?: Record<string, { format?: string }> } } }
  } | null
  const props = schema?.components?.schemas?.Input?.properties
  if (props) {
    const field = Object.keys(props).find((k) => k.toLowerCase().includes('audio'))
    if (field) audioField = field
  }

  return { version, audioField }
}

function parseOutput(output: unknown): Segment[] {
  const data = output as { segments?: Record<string, unknown>[] }
  const segments = data?.segments ?? (Array.isArray(output) ? output : [])

  return segments.map((seg: Record<string, unknown>) => {
    const words: WordToken[] = ((seg.words as Record<string, unknown>[]) || []).map((w) => ({
      word: w.word as string,
      start: w.start as number,
      end: w.end as number,
      score: (w.score as number) ?? 0,
      normal: null,
      tags: null,
      chunk: null,
    }))

    return {
      start: seg.start as number,
      end: seg.end as number,
      text: seg.text as string,
      edited: false,
      speaker: (seg.speaker as string) ?? undefined,
      words,
    }
  })
}

export const replicateTranscriptionProvider: TranscriptionProvider = {
  async transcribe(config, filePath, language, onProgress) {
    const { apiToken } = config.transcription.replicate
    if (!apiToken) throw new Error('Replicate API token is not configured.')

    const replicate = new ReplicateLib({ auth: apiToken })
    const [owner, name] = DEFAULT_MODEL.split('/')

    let currentProgress = 0
    const progressInterval = setInterval(() => {
      if (currentProgress < 90) {
        currentProgress = Math.min(90, currentProgress + 2)
        onProgress?.(currentProgress)
      }
    }, 3000)

    let compressedPath: string | null = null
    let s3Key: string | null = null
    let s3Client: S3Client | null = null
    let s3Bucket: string | null = null

    try {
      onProgress?.(5)

      const { version, audioField } = await resolveModel(replicate, owner, name)

      // Compress to small MP3 before uploading
      compressedPath = await compressForUpload(filePath)

      // Upload compressed file to S3 and get pre-signed URL
      const storageConfig = config.storage
      if (!storageConfig) throw new Error('S3 storage is required for cloud transcription of large files. Please configure Storage in Settings.')

      const uploaded = await uploadToS3AndGetUrl(
        storageConfig,
        compressedPath,
        path.basename(filePath).replace(/\.[^.]+$/, '.mp3'),
      )
      s3Key = uploaded.key
      s3Client = uploaded.client
      s3Bucket = storageConfig.bucket

      const output = await replicate.run(`${owner}/${name}:${version}` as `${string}/${string}:${string}`, {
        input: {
          [audioField]: uploaded.url,
          language,
          align_output: true,
          batch_size: 32,
        },
      })

      clearInterval(progressInterval)
      onProgress?.(100)

      return parseOutput(output)
    } catch (err) {
      clearInterval(progressInterval)
      throw err
    } finally {
      // Clean up temp compressed file
      if (compressedPath && fs.existsSync(compressedPath)) {
        fs.unlinkSync(compressedPath)
      }
      // Clean up S3 temp object
      if (s3Client && s3Bucket && s3Key) {
        s3Client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: s3Key })).catch(() => { /* ignore cleanup errors */ })
      }
    }
  },
}
