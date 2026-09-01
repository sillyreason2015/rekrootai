import { env } from '../config/env.js'

export interface FairnessGateRequest {
  applicationId: string
  jobId: string
  candidateId: string
  protectedAttributes: { gender?: string; ageRange?: string; ethnicity?: string }
  features: Record<string, unknown>
  threshold: number
  minimumGroupSize?: number
  cohort: Array<{
    protectedAttributes: { gender?: string; ageRange?: string; ethnicity?: string }
    features: Record<string, unknown>
    groundTruth?: number
  }>
}

export interface FairnessGateResponse {
  p_s: number
  delta: number
  p_prime_s: number
  decision: 'pass' | 'fail'
  reason: string
  metric: 'demographic_parity_difference'
  cohortSize: number
  modelVersion?: string
  demographicParityByAttribute?: Record<string, number>
  demographicParityStatusByAttribute?: Record<string, 'computed' | 'insufficient_data'>
  equalOpportunityDifference: number | null
  equalOpportunityByAttribute?: Record<string, number | null>
  equalOpportunityStatus: 'computed' | 'insufficient_data'
}

export interface ExplainRequest {
  applicationId: string
  modelInput: Record<string, unknown>
}

export interface ScoreRequest {
  applicationId: string
  modelInput: Record<string, number>
}

export interface ScoreResponse {
  probability: number
  score: number
  modelVersion?: string
}

export interface ExplainResponse {
  explanation: string
  topFeatures: Array<{ name: string; value: number }>
  modelVersion?: string
}

async function postJson<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const response = await fetch(`${env.ML_SERVICE_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.ML_SERVICE_TOKEN ? { 'x-ml-service-token': env.ML_SERVICE_TOKEN } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`ML service ${path} failed with ${response.status}`)
  }
  return (await response.json()) as TRes
}

async function assertNonSyntheticInProduction(): Promise<void> {
  if (env.NODE_ENV !== 'production') return
  const response = await fetch(`${env.ML_SERVICE_URL}/metadata`)
  if (!response.ok) throw new Error('ML metadata check failed')
  const meta = (await response.json()) as { synthetic_data?: boolean }
  if (meta.synthetic_data) {
    throw new Error('Synthetic ML artifacts are blocked in production')
  }
}

export function runFairnessGate(payload: FairnessGateRequest) {
  return assertNonSyntheticInProduction().then(() =>
    postJson<FairnessGateRequest, FairnessGateResponse>('/fairness-gate', payload),
  )
}

export function runShapExplain(payload: ExplainRequest) {
  return assertNonSyntheticInProduction().then(() =>
    postJson<ExplainRequest, ExplainResponse>('/explain', payload),
  )
}

export function runModelScore(payload: ScoreRequest) {
  return assertNonSyntheticInProduction().then(() =>
    postJson<ScoreRequest, ScoreResponse>('/score', payload),
  )
}
