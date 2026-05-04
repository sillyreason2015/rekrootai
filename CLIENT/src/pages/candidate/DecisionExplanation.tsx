import { useParams, Link } from 'react-router-dom'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Info, MessageSquare, Clock, CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react'
import { applicationService, type ScoreBreakdown } from '../../services/application.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import AiBadge from '../../components/shared/AiBadge'
import { scoreBg, cn } from '../../lib/utils'


const decisionMeta: Record<string, { label: string; emoji: string; color: string; sub: string }> = {
  hire:   { label: 'Offer Extended',      emoji: '🏆', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', sub: 'Congratulations — the recruiter has reviewed your full evaluation and extended an offer.' },
  reject: { label: 'Not Progressed',      emoji: '📋', color: 'text-slate-700 bg-slate-50 border-slate-200',       sub: 'The recruiter reviewed your evaluation and determined another candidate was a stronger match for this role.' },
  hold:   { label: 'Application on Hold', emoji: '⏳', color: 'text-amber-700 bg-amber-50 border-amber-200',       sub: 'The recruiter is reviewing the full candidate pool before making a final decision.' },
}

const stageMeta: Record<string, { label: string; color: string; icon: React.ElementType; hint: string }> = {
  applied:    { label: 'Applied — CV under review',         color: 'text-slate-600',   icon: Clock,        hint: 'Your CV is being reviewed by the recruiter. You will be notified when the status changes.' },
  screening:  { label: 'Shortlisted — screening stage',     color: 'text-blue-600',    icon: TrendingUp,   hint: 'You have been shortlisted. Await the assessment invitation — it will appear on your dashboard.' },
  assessment: { label: 'Assessment stage',                  color: 'text-amber-600',   icon: AlertCircle,  hint: 'Complete your assessment before the deadline. Your score is compared against the role threshold and explained immediately.' },
  interview:  { label: 'Interview stage',                   color: 'text-purple-600',  icon: TrendingUp,   hint: 'An interview has been scheduled. Your score breakdown updates automatically after the interview is marked complete.' },
  decision:   { label: 'Decision — recruiter review',       color: 'text-emerald-600', icon: CheckCircle2, hint: 'The recruiter is making a final Hire / Hold / Reject decision. You will be notified immediately once made.' },
  rejected:   { label: 'Application closed',                color: 'text-red-600',     icon: AlertCircle,  hint: 'This application has been closed. See the AI explanation below for a full breakdown of how you were evaluated.' },
}

export default function DecisionExplanation() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [reply, setReply] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['explanation', id],
    queryFn: () => applicationService.getExplanation(id!),
    enabled: !!id,
    refetchInterval: 10_000,
  })
  const { data: thread } = useQuery({
    queryKey: ['candidate-correspondence-thread', id],
    queryFn: () => applicationService.getCorrespondenceThread(id!),
    enabled: !!id,
  })
  const replyMutation = useMutation({
    mutationFn: () => applicationService.replyCorrespondence(id!, { message: reply }),
    onSuccess: () => {
      setReply('')
      qc.invalidateQueries({ queryKey: ['candidate-correspondence-thread', id] })
    },
  })

  if (isLoading) return <LoadingSpinner />

  const scores = data?.scores as ScoreBreakdown | undefined
  const stage = scores?.stage ?? 'applied'
  const sm = stageMeta[stage] ?? stageMeta['applied']
  const StageIcon = sm.icon

  const hasResume = (scores?.resumeScore ?? 0) > 0
  const hasAssessment = (scores?.assessmentScore ?? 0) > 0
  const hasInterview = (scores?.interviewScore ?? 0) > 0
  const hasFinal = (scores?.finalScore ?? 0) > 0
  const hasAnyScore = hasResume || hasAssessment || hasInterview || hasFinal
  const hasExplanation = !!scores?.explanation?.trim()

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-10">
      <div className="flex items-center gap-2">
        <Link to="/candidate/applications" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to Applications
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">AI Decision Explanation</h1>
          <p className="text-sm text-muted-foreground">A transparent breakdown of how your application was evaluated at every stage.</p>
        </div>
        <AiBadge label="SHAP · XGBoost" size="md" />
      </div>

      {/* Stage status — shown when no decision yet */}
      {!scores?.decision && (
        <div className="flex items-start gap-3 rounded-xl border px-4 py-3 bg-card">
          <StageIcon className={cn('h-5 w-5 shrink-0 mt-0.5', sm.color)} />
          <div>
            <p className={cn('text-sm font-semibold', sm.color)}>{sm.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{sm.hint}</p>
          </div>
        </div>
      )}

      {/* Decision banner */}
      {scores?.decision && decisionMeta[scores.decision] && (
        <div className={cn('flex items-center gap-3 rounded-xl border px-5 py-4', decisionMeta[scores.decision].color)}>
          <span className="text-2xl">{decisionMeta[scores.decision].emoji}</span>
          <div>
            <p className="font-semibold">{decisionMeta[scores.decision].label}</p>
            <p className="text-sm opacity-80 mt-0.5">{decisionMeta[scores.decision].sub}</p>
          </div>
        </div>
      )}

      {/* AI narrative — shown whenever the server returns explanation text */}
      {hasExplanation && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex gap-3 p-5">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-semibold text-primary">AI Evaluation Summary</p>
                <AiBadge size="sm" />
              </div>
              <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line">{scores!.explanation}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Composite score — only when final score computed */}
      {hasFinal && (
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm text-muted-foreground">Composite Score</p>
              <p className="font-serif text-5xl font-bold text-primary">{scores!.finalScore.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground mt-1">Weighted across CV, assessment, fairness, and interview</p>
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
      )}

      {/* Score breakdown bars — shown when at least one score exists */}
      {hasAnyScore && (
        <Card>
          <CardHeader>
            <CardTitle>Score Breakdown by Stage</CardTitle>
            <p className="text-xs text-muted-foreground">Each stage is scored independently. Pending stages will update as you progress through the pipeline.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            {[
              {
                label: 'Resume / CV Match',
                value: scores?.resumeScore,
                weight: scores?.weights.w1 ?? 0.3,
                desc: 'Semantic similarity between your CV and the job requirements.',
                present: hasResume,
              },
              {
                label: 'Assessment Score',
                value: scores?.assessmentScore,
                weight: scores?.weights.w2 ?? 0.3,
                desc: 'Weighted average across all assessment modules. Compared against the role\'s pass threshold immediately on completion.',
                present: hasAssessment,
              },
              {
                label: 'AI Fairness Adjustment',
                value: scores?.penaltyApplied,
                weight: scores?.weights.w3 ?? 0.1,
                desc: 'Bias correction applied by the XGBoost fairness gate. Applied systematically — not personal to you.',
                present: (scores?.penaltyApplied ?? 0) > 0,
              },
              {
                label: 'Interview Evaluation',
                value: scores?.interviewScore,
                weight: scores?.weights.w4 ?? 0.3,
                desc: 'Rubric-scored evaluation of your structured interview across 5 criteria: communication, technical knowledge, problem solving, culture fit, and motivation.',
                present: hasInterview,
              },
            ].map(({ label, value, weight, desc, present }) => (
              <div key={label} className={cn('space-y-1.5', !present ? 'opacity-40' : '')}>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">weight {(weight * 100).toFixed(0)}%</span>
                  </div>
                  {present && value !== undefined ? (
                    <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', scoreBg(value))}>
                      {value.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground bg-muted">
                      {['rejected'].includes(stage) ? 'Not reached' : 'Pending'}
                    </span>
                  )}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: present && value !== undefined ? `${Math.min(100, value)}%` : '0%' }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Nothing yet */}
      {!hasAnyScore && !hasExplanation && !scores?.decision && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Clock className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No evaluation data yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Your score breakdown will appear here at each pipeline stage — after CV review, assessment, fairness check, and interview.
              You will receive a dashboard notification at every gate.
            </p>
          </CardContent>
        </Card>
      )}

      {/* SHAP feature importance */}
      {scores?.shapValues && Object.entries(scores.shapValues).some(([, v]) => Math.abs(v) > 0.001) && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Feature Importance</CardTitle>
              <AiBadge label="SHAP" />
            </div>
            <p className="text-xs text-muted-foreground">Green bars = features that helped your score. Red bars = factors that reduced it. Longer bar = stronger influence.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(scores.shapValues)
              .filter(([, v]) => Math.abs(v) > 0.001)
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

      {/* Recruiter note */}
      {scores?.recruiterNote && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex gap-3 p-5">
            <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-amber-700">Personal Recruiter Feedback</p>
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                  <CheckCircle2 className="h-3 w-3" /> Human reviewed
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-amber-800">{scores.recruiterNote}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Message Recruiter</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <textarea
            rows={3}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            className="w-full rounded-md border border-input bg-background p-3 text-sm"
            placeholder="Ask a question about this decision..."
          />
          <button
            className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50"
            disabled={reply.trim().length < 3 || replyMutation.isPending}
            onClick={() => replyMutation.mutate()}
          >
            Send Message
          </button>
          {Array.isArray(thread) && thread.length > 0 && (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-xs">
              {thread.map((t: any) => (
                <div key={t._id}>
                  <p className="font-medium">{t.action === 'correspondence-reply' ? 'You' : 'Recruiter'}</p>
                  <p className="text-muted-foreground">{t.message}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground leading-relaxed">
        Scores are generated by AI using XGBoost + SHAP and reviewed by a human recruiter before any final hiring decision is made.
        You have the right to request a full explanation of any automated decision under applicable data protection law.
      </p>
    </div>
  )
}
