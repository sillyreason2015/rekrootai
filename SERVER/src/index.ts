import mongoose from 'mongoose'
import { app } from './app.js'
import { env } from './config/env.js'
import { verifySmtpConnection } from './lib/mail.js'

async function start() {
  await mongoose.connect(env.MONGODB_URI)
  console.log('MongoDB connected')

  // Non-blocking SMTP check — logs result so you can see if email works
  verifySmtpConnection().catch(() => {})

  app.listen(env.PORT, () => {
    console.log(`RekrootAI server running on port ${env.PORT}`)
  })
}

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
