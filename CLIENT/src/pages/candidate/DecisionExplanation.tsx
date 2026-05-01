import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Info, MessageSquare, Clock, CheckCircle2 } from 'lucide-react'
import { applicationService } from '../../services/application.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import AiBadge from '../../components/shared/AiBadge'
import { scoreBg, cn } from '../../lib/utils'

interface ScoreBreakdown {
  resumeScore: number
  assessmentScore: number
  penaltyApplied: number
  interviewScore: number
  finalScore: number
  weights: { w1: number; w2: number; w3: number; w4: number }
  explanation: string
  shapValues?: Record<string, number>
  recruiterNote?: string | null
  stage?: string
  decision?: string
}

const decisionMeta: Record<string, { label: string; emoji: string; color: string }> = {
  hire:   { label: 'Offer Extended',    emoji: '🏆', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  reject: { label: 'Not Selected',      emoji: '📋', color: 'text-slate-700 bg-slate-50 border-slate-200' },
  hold:   { label: 'Under Review',      emoji: '⏳', color: 'text-amber-700 bg-amber-50 border-amber-200' },
}

export default function DecisionExplanation() {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading } = useQuery({
    queryKey: ['explanation', id],
    queryFn: () => applicationService.getExplanation(id!),
    enabled: !!id,
  })

  if (isLoading) return <LoadingSpinner />

  const scores = data?.scores as ScoreBreakdown | undefined
  const isPending = !scores || scores.finalScore === 0

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/candidate/applications" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to Applications
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">AI Decision Explanation</h1>
          <p className="text-sm text-muted-foreground">A transparent breakdown of how your application was evaluated.</p>
        </div>
        <AiBadge label="SHAP · XGBoost" size="md" />
      </div>

      {/* Decision banner */}
      {scores?.decision && (
        <div className={cn('flex items-center gap-3 rounded-xl border px-5 py-4', decisionMeta[scores.decision]?.color ?? '')}>
          <span className="text-2xl">{decisionMeta[scores.decision]?.emoji}</span>
          <div>
            <p className="font-semibold">{decisionMeta[scores.decision]?.label}</p>
            <p className="text-sm opacity-80">The recruiter has reviewed your evaluation and made a final decision.</p>
          </div>
        </div>
      )}

      {isPending ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Clock className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">Evaluation in progress</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Your full score breakdown will appear here once your application has been reviewed by the recruiter and processed through the AI pipeline.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Final score */}
          <Card>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-muted-foreground">Final Score</p>
                <p className="font-serif text-5xl font-bold text-primary">{scores!.finalScore.toFixed(1)}%</p>
              </div>
              <div className={cn('rounded-2xl border px-6 py-4 text-center', scoreBg(scores!.finalScore))}>
                <p className="text-2xl">
                  {scores!.finalScore >= 75 ? '🏆' : scores!.finalScore >= 50 ? '📊' : '⚠️'}
                </p>
                <p className="mt-1 text-xs font-semibold">
                  {scores!.finalScore >= 75 ? 'Strong candidate' : scores!.finalScore >= 50 ? 'Considered' : 'Below threshold'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Score breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Score Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {[
                { label: 'Resume / CV Match', value: scores!.resumeScore, weight: scores!.weights.w1, desc: 'Semantic similarity between your CV and the job requirements' },
                { label: 'Assessment Score', value: scores!.assessmentScore, weight: scores!.weights.w2, desc: 'Weighted average across all assessment modules completed' },
                { label: 'Fairness Adjustment', value: scores!.penaltyApplied, weight: scores!.weights.w3, desc: 'Bias correction applied by the AI fairness gate (systematic, not personal)' },
                { label: 'Interview Score', value: scores!.interviewScore, weight: scores!.weights.w4, desc: 'Rubric-scored evaluation of your structured interview responses' },
              ].map(({ label, value, weight, desc }) => (
                <div key={label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">weight {(weight * 100).toFixed(0)}%</span>
                    </div>
                    <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', scoreBg(value))}>
                      {value.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-700"
                      style={{ width: `${Math.min(100, value)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* SHAP feature importance */}
          {scores?.shapValues && Object.keys(scores.shapValues).length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>Feature Importance</CardTitle>
                  <AiBadge label="SHAP" />
                </div>
                <p className="text-xs text-muted-foreground">Green bars indicate features that contributed positively to your score; red bars indicate negative contributions.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(scores.shapValues)
                  .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
                  .slice(0, 8)
                  .map(([feat, val]) => (
                    <div key={feat} className="flex items-center gap-3 text-sm">
                      <span className="w-44 shrink-0 truncate text-xs text-muted-foreground capitalize">{feat.replace(/_/g, ' ')}</span>
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full', val >= 0 ? 'bg-emerald-400' : 'bg-red-400')}
                          style={{ width: `${Math.min(100, Math.abs(val) * 200)}%` }}
                        />
                      </div>
                      <span className={cn('w-12 text-right font-mono text-xs', val >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                        {val >= 0 ? '+' : ''}{val.toFixed(2)}
                      </span>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          {/* AI narrative explanation */}
          {scores?.explanation && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="flex gap-3 p-5">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-primary">AI-Generated Summary</p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/80">{scores.explanation}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recruiter note — human-in-the-loop feedback */}
          {scores?.recruiterNote && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="flex gap-3 p-5">
                <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-amber-700">Recruiter Feedback</p>
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                      <CheckCircle2 className="h-3 w-3" /> Human reviewed
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-amber-800">{scores.recruiterNote}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Scores are generated by AI using XGBoost + SHAP and reviewed by a human recruiter before any hiring decision is made.
        You have the right to request an explanation of any automated decision under applicable data protection law.
      </p>
    </div>
  )
}
