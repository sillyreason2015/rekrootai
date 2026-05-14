type ScoreInput = {
  resume?: number
  assessment?: number
  penalty?: number
  interview?: number
}

type CompositeStage = 'applied' | 'screening' | 'assessment' | 'interview' | 'decision' | 'offered' | 'rejected'

function clampScore(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.min(100, Math.max(0, value))
}

export function computeCompositeScore(scores: ScoreInput, stage: CompositeStage): number {
  const resume = clampScore(scores.resume)
  const assessment = clampScore(scores.assessment)
  const penalty = clampScore(scores.penalty)
  const interview = clampScore(scores.interview)

  if (stage === 'applied' || stage === 'screening') return resume

  if (stage === 'assessment' && interview <= 0) {
    const present = [resume, assessment].filter((value) => value > 0)
    if (!present.length) return 0
    return Math.round(present.reduce((sum, value) => sum + value, 0) / present.length)
  }

  const weighted = (resume * 0.3) + (assessment * 0.3) + (penalty * 0.1) + (interview * 0.3)
  return Math.round(weighted * 10) / 10
}
