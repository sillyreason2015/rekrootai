import express from 'express'
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
import { companyRouter } from './routes/company.routes.js'
import { questionBankRouter } from './routes/questionbank.routes.js'
import { recruiterRouter } from './routes/recruiter.routes.js'
import { notificationsRouter } from './routes/notifications.routes.js'
import { anonymizeRouter } from './routes/anonymize.routes.js'
import { HttpError } from './lib/http.js'
import { env } from './config/env.js'
import { SystemSettingsModel } from './models/SystemSettings.model.js'
import { verifyAccessToken } from './lib/auth.js'

export const app = express()

app.use(helmet())
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
)
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(morgan('dev'))

app.use(async (req, res, next) => {
  try {
    const settings = await SystemSettingsModel.findOne().lean()
    if (!settings?.maintenance) return next()
    const auth = req.headers.authorization
    const cookieToken = typeof req.cookies?.accessToken === 'string' ? req.cookies.accessToken : (typeof req.cookies?.token === 'string' ? req.cookies.token : '')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : cookieToken
    const payload = token ? verifyAccessToken(token) : null
    if (payload?.sub) {
      const me = await import('./models/User.model.js').then((m) => m.UserModel.findById(payload.sub).lean())
      if (me?.role === 'super_admin') return next()
    }
    if (req.path.startsWith('/health') || req.path.startsWith('/auth/login')) return next()
    return res.status(503).json({ message: settings.maintenanceMsg || 'Platform under maintenance' })
  } catch {
    return next()
  }
})

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'rekroot-server', now: new Date().toISOString() })
})

app.use('/auth', authRouter)
app.use('/candidates', candidateRouter)
app.use('/jobs', jobsRouter)
app.use('/applications', applicationsRouter)
app.use('/assessments', assessmentsRouter)
app.use('/interviews', interviewsRouter)
app.use('/admin', adminRouter)
app.use('/companies', companyRouter)
app.use('/question-bank', questionBankRouter)
app.use('/recruiter', recruiterRouter)
app.use('/notifications', notificationsRouter)
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
