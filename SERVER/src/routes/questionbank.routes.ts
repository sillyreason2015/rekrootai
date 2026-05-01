import { Router } from 'express'
import { requireAuth, requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { QuestionBankModel } from '../models/QuestionBank.model.js'
import { UserModel } from '../models/User.model.js'

export const questionBankRouter = Router()

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
