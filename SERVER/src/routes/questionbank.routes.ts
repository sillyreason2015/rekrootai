import { Router } from 'express'
import multer from 'multer'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { QuestionBankModel } from '../models/QuestionBank.model.js'
import { UserModel } from '../models/User.model.js'
import { generateQuestions, extractQuestionsFromText } from '../lib/questionGen.js'

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

// POST /question-bank/generate — AI template generation
questionBankRouter.post('/generate', requireAuth, requireRole('recruiter', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const me = await UserModel.findById(req.user!._id).lean()
    const { moduleType, difficulty, count, category } = req.body as {
      moduleType?: string
      difficulty?: string
      count?: number
      category?: string
    }
    if (!moduleType) throw new HttpError(400, 'moduleType is required')

    const validType = ['aptitude', 'technical', 'situational', 'personality'].includes(moduleType as string)
    if (!validType) throw new HttpError(400, 'moduleType must be one of: aptitude, technical, situational, personality')

    const diff = (['easy', 'medium', 'hard'].includes(difficulty as string) ? difficulty : 'medium') as 'easy' | 'medium' | 'hard'
    const n = Math.min(Math.max(1, Number(count ?? 5)), 20)

    const generated = generateQuestions(moduleType as 'aptitude' | 'technical' | 'situational' | 'personality', diff, n, category)
    if (!generated.length) throw new HttpError(400, 'No questions available for this combination')

    // Save to bank
    const docs = await QuestionBankModel.insertMany(
      generated.map((q) => ({ ...q, companyName: me?.companyName, createdBy: req.user!._id })),
    )
    res.status(201).json({ added: docs.length, questions: docs.map((d) => ({ ...d.toJSON(), _id: String(d._id) })) })
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
      const pdfModule = await import('pdf-parse') as any
      const pdfParse = pdfModule.default ?? pdfModule
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
