import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Info } from 'lucide-react'
import { applicationService } from '../../services/application.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import AiBadge from '../../components/shared/AiBadge'
import { scoreBg } from '../../lib/utils'

interface ScoreBreakdown {
  resumeScore: number
  assessmentScore: number
  penaltyApplied: number
  interviewScore: number
  finalScore: number
  weights: { w1: number; w2: number; w3: number; w4: number }
  explanation: string
  shapValues?: Record<string, number>
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/candidate/applications" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Score Explanation</h1>
          <p className="text-sm text-muted-foreground">How your application was evaluated by our AI.</p>
        </div>
        <AiBadge label="AI Explained" size="md" />
      </div>

      {/* Final score */}
      {scores && (
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm text-muted-foreground">Final Score</p>
              <p className="font-serif text-4xl font-bold text-primary">{scores.finalScore.toFixed(1)}%</p>
            </div>
            <div className={`rounded-2xl border px-6 py-4 text-center ${scoreBg(scores.finalScore)}`}>
              <p className="text-2xl font-bold">{scores.finalScore >= 75 ? '🏆' : scores.finalScore >= 50 ? '📊' : '⚠️'}</p>
              <p className="text-xs font-medium mt-1">
                {scores.finalScore >= 75 ? 'Strong candidate' : scores.finalScore >= 50 ? 'Considered' : 'Below threshold'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Score breakdown */}
      {scores && (
        <Card>
          <CardHeader>
            <CardTitle>Score Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Resume / CV Score', value: scores.resumeScore, weight: scores.weights.w1, desc: 'Keyword match + semantic similarity' },
              { label: 'Assessment Score', value: scores.assessmentScore, weight: scores.weights.w2, desc: 'Average across all modules' },
              { label: 'Penalty (flags)', value: scores.penaltyApplied, weight: scores.weights.w3, desc: 'Applied for inconsistencies detected' },
              { label: 'Interview Score', value: scores.interviewScore, weight: scores.weights.w4, desc: 'Rubric-based evaluation' },
            ].map(({ label, value, weight, desc }) => (
              <div key={label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">weight {(weight * 100).toFixed(0)}%</span>
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${scoreBg(value)}`}>
                    {value.toFixed(1)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${value}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* SHAP values */}
      {scores?.shapValues && Object.keys(scores.shapValues).length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Feature Importance</CardTitle>
              <AiBadge label="SHAP" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(scores.shapValues)
              .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
              .slice(0, 8)
              .map(([feat, val]) => (
                <div key={feat} className="flex items-center gap-3 text-sm">
                  <span className="w-40 truncate text-muted-foreground capitalize">{feat.replace(/_/g, ' ')}</span>
                  <div className="relative flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${val >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                      style={{ width: `${Math.min(100, Math.abs(val) * 200)}%` }}
                    />
                  </div>
                  <span className={`w-12 text-right text-xs font-mono ${val >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {val >= 0 ? '+' : ''}{val.toFixed(2)}
                  </span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Narrative explanation */}
      {scores?.explanation && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex gap-3 p-5">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium text-primary">AI Summary</p>
              <p className="mt-1 text-sm text-muted-foreground">{scores.explanation}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Scores are generated by AI and reviewed by a human recruiter before any hiring decision is made.
      </p>
    </div>
  )
}
