import test from 'node:test'
import assert from 'node:assert/strict'
import { generateContextualQuestions } from '../src/lib/questionGen.js'

test('contextual aptitude fallback uses the role context and correct answer', () => {
  const [question] = generateContextualQuestions('aptitude', 'medium', 1, undefined, {
    title: 'Data Analyst',
    skills: ['SQL'],
    requirements: ['build weekly reports'],
  })
  assert.match(question.text, /Data Analyst/)
  assert.match(question.text, /SQL|weekly reports/)
  assert.equal(question.type, 'mcq')
  assert.equal(question.options?.[question.correctIndex ?? -1], '8 units')
})

test('contextual technical fallback is role-specific and auto-scoreable', () => {
  const questions = generateContextualQuestions('technical', 'hard', 3, undefined, {
    title: 'Backend Engineer',
    skills: ['Node.js', 'PostgreSQL'],
    requirements: [],
  })
  assert.equal(questions.length, 3)
  assert.ok(questions.every((question) => question.type === 'mcq' && question.options?.length === 4 && /Backend Engineer/.test(question.text)))
  assert.equal(new Set(questions.map((question) => question.text)).size, 3)
})
