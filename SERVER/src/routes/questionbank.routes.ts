import { Router } from 'express'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError, nowIso } from '../lib/http.js'

export const questionBankRouter = Router()

// In-memory store for question bank
const questions: Array<{
  _id: string
  text: string
  type: 'mcq' | 'open' | 'code'
  options?: string[]
  correctIndex?: number
  points: number
  category: string
  difficulty: 'easy' | 'medium' | 'hard'
  tags: string[]
  createdAt: string
}> = []

questionBankRouter.get('/', requireAuth, requireRole('recruiter', 'admin'), (_req, res) => {
  res.json(questions)
})

questionBankRouter.post('/', requireAuth, requireRole('recruiter', 'admin'), (req, res) => {
  const body = req.body as typeof questions[number]
  const question = {
    _id: `q-${questions.length + 1}-${Date.now()}`,
    text: body.text ?? '',
    type: body.type ?? 'open',
    options: body.options,
    correctIndex: body.correctIndex,
    points: body.points ?? 1,
    category: body.category ?? 'general',
    difficulty: body.difficulty ?? 'medium',
    tags: body.tags ?? [],
    createdAt: nowIso(),
  }
  questions.push(question)
  res.status(201).json(question)
})

questionBankRouter.delete('/:id', requireAuth, requireRole('recruiter', 'admin'), (req, res, next) => {
  try {
    const idx = questions.findIndex((q) => q._id === req.params.id)
    if (idx === -1) throw new HttpError(404, 'Question not found')
    questions.splice(idx, 1)
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})
