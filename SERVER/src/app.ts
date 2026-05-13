import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import { authRouter } from './routes/auth.routes.js'
import { candidateRouter } from './routes/candidate.routes.js'
import { jobsRouter } from './routes/jobs.routes.js'
import { applicationsRouter } from './routes/applications.routes.js'
import { assessmentsRouter } from './routes/assessments.routes.js'
import { interviewsRouter } from './routes/interviews.routes.js'
import { adminRouter } from './routes/admin.routes.js'
import { recruiterRouter } from './routes/recruiter.routes.js'
import { notificationsRouter } from './routes/notifications.routes.js'
import { companyRouter } from './routes/company.routes.js'
import { questionBankRouter } from './routes/questionbank.routes.js'
import { anonymizeRouter } from './routes/anonymize.routes.js'
import { HttpError } from './lib/http.js'
import { env } from './config/env.js'
import { maintenanceGuard } from './lib/settings.js'

export const app = express()

mongoose.set('bufferTimeoutMS', 3000)

app.use(helmet())
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.CORS_ORIGINS.includes(origin)) {
        callback(null, true)
        return
      }
      callback(new Error(`Origin ${origin} is not allowed by CORS`))
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(morgan('dev'))
app.use((req, res, next) => {
  const startedAt = Date.now()
  res.setHeader('X-Request-Started-At', String(startedAt))
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt
    if (durationMs >= 1000) {
      console.warn(`[perf] slow request ${req.method} ${req.originalUrl} -> ${res.statusCode} in ${durationMs}ms`)
    }
  })
  next()
})

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'rekroot-server',
    now: new Date().toISOString(),
    mongoState: mongoose.connection.readyState,
  })
})

app.use(maintenanceGuard)

app.use('/auth', authRouter)
app.use('/candidates', candidateRouter)
app.use('/jobs', jobsRouter)
app.use('/applications', applicationsRouter)
app.use('/assessments', assessmentsRouter)
app.use('/interviews', interviewsRouter)
app.use('/admin', adminRouter)
app.use('/recruiter', recruiterRouter)
app.use('/notifications', notificationsRouter)
app.use('/companies', companyRouter)
app.use('/question-bank', questionBankRouter)
app.use('/anonymize', anonymizeRouter)

app.use((_req, _res, next) => {
  next(new HttpError(404, 'Route not found'))
})

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const httpError = error instanceof HttpError ? error : new HttpError(500, error instanceof Error ? error.message : 'Internal server error')
  res.status(httpError.status).json({
    message: httpError.message,
  })
})
