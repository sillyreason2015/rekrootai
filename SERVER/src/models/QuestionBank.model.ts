import { Schema, model } from 'mongoose'
import { baseSchemaOptions } from './_base.js'

export interface QuestionBankItem {
  _id: string
  text: string
  type: 'mcq' | 'open' | 'code'
  options?: string[]
  correctIndex?: number
  points: number
  category: string
  difficulty: 'easy' | 'medium' | 'hard'
  tags: string[]
  companyName?: string
  createdBy?: string
  createdAt: string
}

const questionBankSchema = new Schema<Omit<QuestionBankItem, '_id' | 'createdAt'>>(
  {
    text: { type: String, required: true },
    type: { type: String, enum: ['mcq', 'open', 'code'], required: true },
    options: [String],
    correctIndex: Number,
    points: { type: Number, default: 1 },
    category: { type: String, default: 'general' },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    tags: { type: [String], default: [] },
    companyName: { type: String },
    createdBy: { type: String },
  },
  baseSchemaOptions,
)

export const QuestionBankModel = model<Omit<QuestionBankItem, '_id' | 'createdAt'>>('QuestionBank', questionBankSchema)
