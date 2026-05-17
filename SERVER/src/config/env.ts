import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY_DAYS: z.coerce.number().default(7),

  BLOB_ENDPOINT: z.string().url().optional(),
  BLOB_REGION: z.string().default('us-east-1'),
  BLOB_ACCESS_KEY: z.string().optional(),
  BLOB_SECRET_KEY: z.string().optional(),
  BLOB_BUCKET: z.string().optional(),

  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  LIVEKIT_HOST: z.string().optional(),

  ML_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().default('common'),
  MICROSOFT_CALLBACK_URL: z.string().url().optional(),
  MAILERSEND_API_KEY: z.string().optional(),
})

const parsedEnv = schema.parse(process.env)

export const env = {
  ...parsedEnv,
  CORS_ORIGINS: parsedEnv.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
}
