import { app } from './app.js'
import { env } from './config/env.js'
import { connectDB } from './db/mongoose.js'

async function bootstrap() {
  await connectDB()
  app.listen(env.PORT, () => {
    console.log(`RekrootAI server running on http://localhost:${env.PORT}`)
  })
}

bootstrap().catch((err) => {
  console.error('[bootstrap] failed to start server', err)
  process.exit(1)
})
