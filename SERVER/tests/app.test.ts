import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app } from '../src/app.js'
import { computeCompositeScore } from '../src/lib/scoring.js'
import { computeAttributeParity } from '../src/lib/fairness.js'

test('fairness penalty reduces the composite score', () => {
  assert.equal(computeCompositeScore({ resume: 80, assessment: 80, interview: 80, penalty: 10 }, 'decision'), 71)
})

test('fairness parity includes groups with zero progression', () => {
  const result = computeAttributeParity(
    [
      { candidate: 'a', stage: 'interview' },
      { candidate: 'b', stage: 'rejected' },
    ],
    { a: { gender: 'group-a' }, b: { gender: 'group-b' } },
    'gender',
  )
  assert.equal(result.ratio, 0)
})

test('GET /health returns ok', async () => {
  const res = await request(app).get('/health')
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
})

test('POST /auth/login with missing body returns 400', async () => {
  const res = await request(app).post('/auth/login').send({})
  assert.ok(res.status >= 400, `expected 4xx, got ${res.status}`)
})

test('POST /auth/forgot-password always returns ok (no email reveal)', async () => {
  const res = await request(app)
    .post('/auth/forgot-password')
    .send({ email: 'nonexistent@example.com' })
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
})

test('POST /auth/reset-password with invalid token returns 400', async () => {
  const res = await request(app)
    .post('/auth/reset-password')
    .send({ token: 'invalid-token-xyz', password: 'NewPassword123' })
  assert.ok(res.status >= 400, `expected 4xx, got ${res.status}`)
})

test('GET /jobs does not require auth (returns 200 or DB-unavailable 500, never 401)', async () => {
  const res = await request(app).get('/jobs')
  // 401 would mean auth guard is incorrectly applied to a public route
  assert.notEqual(res.status, 401, 'public /jobs route should not require auth')
})

test('Protected route GET /applications/mine requires auth', async () => {
  const res = await request(app).get('/applications/mine')
  assert.equal(res.status, 401)
})

test('Protected route GET /notifications/mine requires auth', async () => {
  const res = await request(app).get('/notifications/mine')
  assert.equal(res.status, 401)
})

test('Protected route GET /admin/dashboard requires auth', async () => {
  const res = await request(app).get('/admin/dashboard')
  assert.equal(res.status, 401)
})

test('POST /anonymize/preview requires auth', async () => {
  const res = await request(app).post('/anonymize/preview').send({ text: 'email@example.com' })
  assert.equal(res.status, 401)
})

test('final decision endpoint remains protected before payload validation', async () => {
  const res = await request(app).post('/applications/not-a-real-id/decision').send({ decision: 'hire' })
  assert.equal(res.status, 401)
})

test('POST /admin/team/invite/accept does not require prior auth', async () => {
  const res = await request(app)
    .post('/admin/team/invite/accept')
    .send({ token: 'invalid-token', password: 'Password123', firstName: 'John', lastName: 'Tester' })

  assert.notEqual(res.status, 401, 'invite acceptance should be public')
  assert.notEqual(res.status, 403, 'invite acceptance should not require admin role')
})
