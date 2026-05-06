import mongoose from 'mongoose'
import { app } from './app.js'
import { env } from './config/env.js'

async function start() {
  await mongoose.connect(env.MONGODB_URI)
  console.log('MongoDB connected')

  app.listen(env.PORT, () => {
    console.log(`RekrootAI server running on port ${env.PORT}`)
  })
}

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
