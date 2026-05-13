import mongoose from 'mongoose'
import { env } from '../config/env.js'

export async function connectDB(): Promise<void> {
  mongoose.connection.on('connected', () => console.log('[mongo] connected'))
  mongoose.connection.on('error', (err) => console.error('[mongo] error', err))
  mongoose.connection.on('disconnected', () => console.warn('[mongo] disconnected'))

  mongoose.set('bufferCommands', false)

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
    socketTimeoutMS: 15_000,
    maxPoolSize: 20,
    minPoolSize: 2,
  })
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect()
}
