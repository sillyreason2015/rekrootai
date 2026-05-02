import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '../config/env.js'

const enabled = Boolean(env.BLOB_ENDPOINT && env.BLOB_ACCESS_KEY && env.BLOB_SECRET_KEY && env.BLOB_BUCKET)

const s3 = enabled
  ? new S3Client({
      region: env.BLOB_REGION,
      endpoint: env.BLOB_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.BLOB_ACCESS_KEY!,
        secretAccessKey: env.BLOB_SECRET_KEY!,
      },
    })
  : null

function requireBlobReady() {
  if (!enabled || !s3) {
    throw new Error('Blob storage is not configured. Set BLOB_ENDPOINT/BLOB_ACCESS_KEY/BLOB_SECRET_KEY/BLOB_BUCKET.')
  }
}

export function cvKey(userId: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.\-]/g, '_')
  return `cv/${userId}/${Date.now()}-${safe}`
}

export function avatarKey(userId: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.\-]/g, '_')
  return `avatar/${userId}/${Date.now()}-${safe}`
}

export function logoKey(companyId: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.\-]/g, '_')
  return `logos/${companyId}/${Date.now()}-${safe}`
}

export function bannerKey(jobId: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.\-]/g, '_')
  return `banners/${jobId}/${Date.now()}-${safe}`
}

export async function uploadBlob(key: string, body: Buffer, contentType: string): Promise<void> {
  requireBlobReady()
  await s3!.send(
    new PutObjectCommand({
      Bucket: env.BLOB_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

export async function presignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  requireBlobReady()
  return getSignedUrl(
    s3!,
    new GetObjectCommand({
      Bucket: env.BLOB_BUCKET!,
      Key: key,
    }),
    { expiresIn: expiresInSeconds },
  )
}

export async function removeBlob(key: string): Promise<void> {
  requireBlobReady()
  await s3!.send(new DeleteObjectCommand({ Bucket: env.BLOB_BUCKET!, Key: key }))
}

export async function blobExists(key: string): Promise<boolean> {
  requireBlobReady()
  try {
    await s3!.send(new HeadObjectCommand({ Bucket: env.BLOB_BUCKET!, Key: key }))
    return true
  } catch {
    return false
  }
}
