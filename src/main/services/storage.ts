import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { AppConfig } from '../../shared/types'

export function createS3Client(config: AppConfig['storage']): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  })
}

export async function uploadFile(
  client: S3Client,
  bucket: string,
  key: string,
  filePath: string,
  contentType?: string,
): Promise<string> {
  const body = await readFile(filePath)

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType ?? guessMimeType(filePath),
  }))

  return key
}

export async function uploadJson(
  client: S3Client,
  bucket: string,
  key: string,
  data: object,
): Promise<string> {
  const body = JSON.stringify(data, null, 2)

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: Buffer.from(body, 'utf-8'),
    ContentType: 'application/json',
  }))

  return key
}

export async function uploadBuffer(
  client: S3Client,
  bucket: string,
  key: string,
  buffer: Buffer | string,
  contentType: string,
): Promise<string> {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: typeof buffer === 'string' ? Buffer.from(buffer, 'utf-8') : buffer,
    ContentType: contentType,
  }))

  return key
}

export async function deleteFile(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<void> {
  await client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }))
}

export async function testConnection(config: AppConfig['storage']): Promise<boolean> {
  try {
    const client = createS3Client(config)
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }))
    return true
  } catch {
    return false
  }
}

export { s3Keys } from '../../shared/s3-keys'

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.json': 'application/json',
    '.srt': 'text/plain',
    '.vtt': 'text/vtt',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
  }
  return map[ext] ?? 'application/octet-stream'
}
