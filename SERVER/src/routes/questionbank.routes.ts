import { Router } from 'express'
import multer from 'multer'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { QuestionBankModel } from '../models/QuestionBank.model.js'
import { UserModel } from '../models/User.model.js'
import { JobModel } from '../models/Job.model.js'
import { generateQuestions, extractQuestionsFromText } from '../lib/questionGen.js'
import { env } from '../config/env.js'
import { GoogleGenerativeAI } from '@google/generative-ai'

async function generateWithGemini(
  jobContext: { title: string; description: string; skills: string[]; requirements: string[] },
  moduleType: string,
  difficulty: string,
  count: number,
): Promise<Array<{ text: string; type: 'mcq' | 'open'; options?: string[]; correctIndex?: number; points: number; category: string; difficulty: string; tags: string[] }>> {
  const moduleDescriptions: Record<string, string> = {
    aptitude: 'numerical reasoning, logical reasoning, and verbal reasoning relevant to this role',
    technical: 'technical knowledge and skills directly required for this role',
    situational: 'workplace scenarios and judgement calls a person in this role would face',
    personality: 'working style, traits, and self-awareness relevant to this role',
    values: 'alignment with company culture, ethics, and the values implied by this role',
  }

  const prompt = `You are an expert assessment designer. Generate exactly ${count} assessment questions for the following job role.

Job Title: ${jobContext.title}
Key Skills: ${jobContext.skills.slice(0, 10).join(', ')}
Requirements: ${jobContext.requirements.slice(0, 5).join('; ')}
Job Description (summary): ${jobContext.description.slice(0, 600)}

Module type: ${moduleType} — focus on ${moduleDescriptions[moduleType] ?? moduleType}
Difficulty: ${difficulty}

Rules:
- For mcq questions include exactly 4 options and set correctIndex (0-3) to the best answer
- For open questions omit options and correctIndex
- points: easy=1, medium=2, hard=3 (open hard=4)
- tags: 2-4 relevant lowercase tags
- category: use the moduleType value
- Mix mcq and open types (at least 1 open per 4 questions unless count<=2)
- Make questions SPECIFIC to the job — reference actual skills, tools, or scenarios from the job context

Respond with ONLY a valid JSON array. No markdown, no explanation. Example format:
[{"text":"...","type":"mcq","options":["A","B","C","D"],"correctIndex":1,"points":2,"category":"${moduleType}","difficulty":"${difficulty}","tags":["tag1","tag2"]}]`

  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  const result = await model.generateContent(prompt)
  const raw = result.response.text()

  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('Gemini returned no valid JSON array')

  const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>
  return parsed.map((q) => ({
    text: String(q.text ?? ''),
    type: (q.type === 'mcq' ? 'mcq' : 'open') as 'mcq' | 'open',
    options: Array.isArray(q.options) ? (q.options as string[]) : undefined,
    correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : undefined,
    points: typeof q.points === 'number' ? q.points : 2,
    category: String(q.category ?? moduleType),
    difficulty: String(q.difficulty ?? difficulty),
    tags: Array.isArray(q.tags) ? (q.tags as string[]) : [moduleType],
  }))
}

export const questionBankRouter = Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// GET /question-bank
questionBankRouter.get('/', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const me = await UserModel.findById(req.user!._id).lean()
    const filter: Record<string, unknown> = req.user?.role === 'super_admin'
      ? {}
      : { companyName: me?.companyName ?? '__none__' }
    const items = await QuestionBankModel.find(filter).sort({ createdAt: -1 }).lean()
    res.json(items.map((q) => ({ ...q, _id: String(q._id) })))
  } catch (err) {
    next(err)
  }
})

// POST /question-bank
questionBankRouter.post('/', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const me = await UserModel.findById(req.user!._id).lean()
    const body = req.body as {
      text?: string
      type?: 'mcq' | 'open' | 'code'
      options?: string[]
      correctIndex?: number
      points?: number
      category?: string
      difficulty?: 'easy' | 'medium' | 'hard'
      tags?: string[]
    }
    if (!body.text?.trim()) throw new HttpError(400, 'Question text is required')
    const question = await QuestionBankModel.create({
      text: body.text.trim(),
      type: body.type ?? 'open',
      options: body.options ?? [],
      correctIndex: body.correctIndex,
      points: body.points ?? 1,
      category: body.category ?? 'general',
      difficulty: body.difficulty ?? 'medium',
      tags: body.tags ?? [],
      companyName: me?.companyName,
      createdBy: req.user!._id,
    })
    res.status(201).json({ ...question.toJSON(), _id: String(question._id) })
  } catch (err) {
    next(err)
  }
})

type CachedResult = { questions: Array<{ text: string; type: 'mcq' | 'open'; options?: string[]; correctIndex?: number; points: number; category: string; difficulty: string; tags: string[] }>; expiresAt: number }
const geminiCache = new Map<string, CachedResult>()
const userCooldown = new Map<string, number>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000  // 24 hours
const COOLDOWN_MS = 30_000                  // 30 seconds per user

// POST /question-bank/generate — AI generation (Gemini if jobId provided, else templates)
questionBankRouter.post('/generate', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const { getSettings } = await import('../lib/settings.js')
    const settings = await getSettings()
    const me = await UserModel.findById(req.user!._id).lean()
    const { moduleType, difficulty, count, category, jobId } = req.body as {
      moduleType?: string
      difficulty?: string
      count?: number
      category?: string
      jobId?: string
    }
    if (!moduleType) throw new HttpError(400, 'moduleType is required')

    const validType = ['aptitude', 'technical', 'situational', 'personality', 'values'].includes(moduleType as string)
    if (!validType) throw new HttpError(400, 'moduleType must be one of: aptitude, technical, situational, personality, values')

    const diff = (['easy', 'medium', 'hard'].includes(difficulty as string) ? difficulty : 'medium') as 'easy' | 'medium' | 'hard'
    const n = Math.min(Math.max(1, Number(count ?? 5)), 50)

    let generated: Array<{ text: string; type: 'mcq' | 'open'; options?: string[]; correctIndex?: number; points: number; category: string; difficulty: string; tags: string[] }>

    let source = 'templates'
    if (jobId && env.GEMINI_API_KEY && settings.geminiGen) {
      const job = await JobModel.findById(jobId).lean()
      if (!job) throw new HttpError(404, 'Job not found')

      // Check per-user cooldown
      const userId = String(req.user!._id)
      const lastCall = userCooldown.get(userId) ?? 0
      const cooldownRemaining = Math.ceil((lastCall + COOLDOWN_MS - Date.now()) / 1000)
      if (cooldownRemaining > 0) {
        throw new HttpError(429, `Please wait ${cooldownRemaining}s before generating again.`)
      }

      // Check cache for this job+module+difficulty combo
      const cacheKey = `${jobId}:${moduleType}:${diff}`
      const cached = geminiCache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        generated = cached.questions.slice(0, n)
        source = 'gemini-cached'
      } else {
        userCooldown.set(userId, Date.now())
        try {
          generated = await generateWithGemini(
            { title: job.title, description: job.description, skills: job.skills, requirements: job.requirements },
            moduleType, diff, n,
          )
          geminiCache.set(cacheKey, { questions: generated, expiresAt: Date.now() + CACHE_TTL_MS })
          source = 'gemini'
        } catch (geminiErr) {
          const msg = geminiErr instanceof Error ? geminiErr.message : 'Unknown error'
          generated = generateQuestions(moduleType as 'aptitude' | 'technical' | 'situational' | 'personality' | 'values', diff, n, category)
          source = (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate'))
            ? 'templates-rate-limited'
            : 'templates'
        }
      }
    } else {
      generated = generateQuestions(moduleType as 'aptitude' | 'technical' | 'situational' | 'personality' | 'values', diff, n, category)
    }

    if (!generated.length) throw new HttpError(400, 'No questions available for this combination')

    const docs = await QuestionBankModel.insertMany(
      generated.map((q) => ({ ...q, companyName: me?.companyName, createdBy: req.user!._id })),
    )
    res.status(201).json({ added: docs.length, questions: docs.map((d) => ({ ...d.toJSON(), _id: String(d._id) })), source })
  } catch (err) {
    next(err)
  }
})

// POST /question-bank/upload — parse PDF or DOCX and extract questions
questionBankRouter.post('/upload', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'No file uploaded')
    const me = await UserModel.findById(req.user!._id).lean()
    const mime = req.file.mimetype
    const difficulty = (req.body as { difficulty?: string }).difficulty
    const diff = (['easy', 'medium', 'hard'].includes(difficulty as string) ? difficulty : 'medium') as 'easy' | 'medium' | 'hard'
    const category = (req.body as { category?: string }).category ?? 'uploaded'

    let text = ''

    if (mime === 'application/pdf' || req.file.originalname.endsWith('.pdf')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse = ((await import('pdf-parse/lib/pdf-parse.js' as string)) as any).default as (buf: Buffer) => Promise<{ text: string }>
      const result = await pdfParse(req.file.buffer)
      text = result.text
    } else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      req.file.originalname.endsWith('.docx')
    ) {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer: req.file.buffer })
      text = result.value
    } else {
      // Treat as plain text
      text = req.file.buffer.toString('utf-8')
    }

    if (!text.trim()) throw new HttpError(400, 'Could not extract any text from the uploaded file')

    const extracted = extractQuestionsFromText(text, diff, category)
    if (!extracted.length) throw new HttpError(400, 'No questions detected in the document. Ensure questions are numbered (1. / Q1. / Question 1:) or end with a "?"')

    const docs = await QuestionBankModel.insertMany(
      extracted.map((q) => ({ ...q, companyName: me?.companyName, createdBy: req.user!._id })),
    )

    res.status(201).json({ added: docs.length, questions: docs.map((d) => ({ ...d.toJSON(), _id: String(d._id) })) })
  } catch (err) {
    next(err)
  }
})

// DELETE /question-bank/:id
questionBankRouter.delete('/:id', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const me = await UserModel.findById(req.user!._id).lean()
    const item = await QuestionBankModel.findById(String(req.params.id)).lean()
    if (!item) throw new HttpError(404, 'Question not found')
    if (req.user?.role !== 'super_admin' && item.companyName !== me?.companyName) {
      throw new HttpError(403, 'Forbidden')
    }
    await QuestionBankModel.deleteOne({ _id: String(req.params.id) })
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})
