import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().default('dev-secret'),
  MOCK_REFRESH_SECRET: z.string().default('dev-refresh-secret'),
})

export const env = schema.parse(process.env)
