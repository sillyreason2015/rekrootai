import { app } from './app.js'
import { env } from './config/env.js'
import { connectDB } from './db/mongoose.js'
import { verifySmtpConnection } from './lib/mail.js'
import { startSchedulers } from './lib/scheduler.js'

async function start() {
  await connectDB()

  // Non-blocking SMTP check so local startup is not delayed by mail transport health.
  verifySmtpConnection().catch(() => {})
  startSchedulers()

  app.listen(env.PORT, () => {
    console.log(`RekrootAI server running on port ${env.PORT}`)
  })
}

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
