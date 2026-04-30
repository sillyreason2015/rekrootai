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
}> = [
  {
    _id: 'q-1',
    text: 'Which React hook is used to manage side effects?',
    type: 'mcq',
    options: ['useState', 'useEffect', 'useContext', 'useRef'],
    correctIndex: 1,
    points: 1,
    category: 'technical',
    difficulty: 'easy',
    tags: ['react', 'hooks'],
    createdAt: nowIso(),
  },
  {
    _id: 'q-2',
    text: 'What does SOLID stand for in software engineering?',
    type: 'open',
    points: 2,
    category: 'technical',
    difficulty: 'medium',
    tags: ['software-design', 'principles'],
    createdAt: nowIso(),
  },
  {
    _id: 'q-3',
    text: 'A colleague disagrees with your technical approach. How do you handle it?',
    type: 'open',
    points: 2,
    category: 'situational',
    difficulty: 'medium',
    tags: ['communication', 'teamwork'],
    createdAt: nowIso(),
  },
]

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
