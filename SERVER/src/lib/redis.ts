import { Redis } from '@upstash/redis'
import { env } from '../config/env.js'

export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
})

const PREFIX = 'rt:'
const OTP_PREFIX = 'otp:'
const OTP_TTL = 10 * 60 // 10 minutes

export async function storeOtp(userId: string, otp: string): Promise<void> {
  await redis.set(`${OTP_PREFIX}${userId}`, otp, { ex: OTP_TTL })
}

export async function verifyAndConsumeOtp(userId: string, otp: string): Promise<boolean> {
  const stored = await redis.get(`${OTP_PREFIX}${userId}`)
  if (stored === null || stored === undefined) return false
  if (String(stored) !== String(otp).trim()) return false
  await redis.del(`${OTP_PREFIX}${userId}`)
  return true
}

export async function deleteOtp(userId: string): Promise<void> {
  await redis.del(`${OTP_PREFIX}${userId}`)
}
const TTL_SECONDS = env.JWT_REFRESH_EXPIRY_DAYS * 24 * 60 * 60

export async function storeRefreshToken(token: string, userId: string): Promise<void> {
  await redis.set(`${PREFIX}${token}`, userId, { ex: TTL_SECONDS })
}

export async function getUserIdFromRefreshToken(token: string): Promise<string | null> {
  return redis.get<string>(`${PREFIX}${token}`)
}

export async function deleteRefreshToken(token: string): Promise<void> {
  await redis.del(`${PREFIX}${token}`)
}

/** Rotate: delete old token and store new one atomically */
export async function rotateRefreshToken(oldToken: string, newToken: string, userId: string): Promise<void> {
  await Promise.all([
    redis.del(`${PREFIX}${oldToken}`),
    redis.set(`${PREFIX}${newToken}`, userId, { ex: TTL_SECONDS }),
  ])
}
