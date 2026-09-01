/**
 * Bounded smoke/load test for the deployed API.
 *
 * Usage:
 *   LOAD_TEST_BASE_URL=https://rekrootai.vercel.app npm run test:load
 *   LOAD_TEST_TOTAL=100 LOAD_TEST_CONCURRENCY=20 npm run test:load
 *
 * This intentionally exercises only safe read/validation paths. It never uses
 * real credentials and does not create or mutate application data.
 */

const baseUrl = (process.env.LOAD_TEST_BASE_URL ?? 'https://rekrootai.vercel.app').replace(/\/$/, '')
const total = boundedInt(process.env.LOAD_TEST_TOTAL, 30, 1, 500)
const concurrency = boundedInt(process.env.LOAD_TEST_CONCURRENCY, 5, 1, 50)

function boundedInt(value, fallback, min, max) {
  const parsed = Number(value ?? fallback)
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

async function runScenario({ name, path, method = 'GET', body, expectedStatuses }) {
  const samples = []
  let next = 0

  async function worker() {
    while (true) {
      const index = next++
      if (index >= total) return
      const started = performance.now()
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: body ? { 'content-type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        })
        const responseBody = await response.text()
        samples.push({
          latencyMs: performance.now() - started,
          status: response.status,
          expected: expectedStatuses.includes(response.status),
          body: responseBody.slice(0, 160),
        })
      } catch (error) {
        samples.push({ latencyMs: performance.now() - started, status: 0, expected: false, body: String(error) })
      }
    }
  }

  const started = performance.now()
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker))
  const sorted = samples.map((sample) => sample.latencyMs).sort((a, b) => a - b)
  const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
  const statuses = Object.fromEntries([...new Set(samples.map((sample) => sample.status))].map((status) => [status, samples.filter((sample) => sample.status === status).length]))
  const failed = samples.filter((sample) => !sample.expected)

  return {
    name,
    total,
    concurrency,
    elapsedMs: round(performance.now() - started),
    requestsPerSecond: round(total / ((performance.now() - started) / 1000)),
    statuses,
    unexpectedResponses: failed.length,
    p50Ms: round(percentile(0.50)),
    p95Ms: round(percentile(0.95)),
    p99Ms: round(percentile(0.99)),
    maxMs: round(sorted.at(-1)),
    sampleFailure: failed[0]?.body ?? null,
  }
}

function round(value) {
  return Number(value.toFixed(1))
}

const results = await Promise.all([
  runScenario({ name: 'health', path: '/api/health', expectedStatuses: [200] }),
  runScenario({ name: 'readiness', path: '/api/ready', expectedStatuses: [200] }),
  runScenario({ name: 'public-jobs', path: '/api/jobs', expectedStatuses: [200] }),
  runScenario({
    name: 'invalid-login-validation',
    path: '/api/auth/login',
    method: 'POST',
    body: { email: `load-test-${Date.now()}@example.invalid`, password: 'NotARealPassword123!' },
    expectedStatuses: [401],
  }),
])

console.log(JSON.stringify({ baseUrl, total, concurrency, results }, null, 2))
if (results.some((result) => result.unexpectedResponses > 0)) process.exitCode = 1
