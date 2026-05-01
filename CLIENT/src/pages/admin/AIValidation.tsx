import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Shield, Brain, BarChart3, CheckCircle2, XCircle, Loader2, RefreshCw, Info } from 'lucide-react'
import api from '../../lib/axios'
import { jobService } from '../../services/job.service'
import { applicationService } from '../../services/application.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import AiBadge from '../../components/shared/AiBadge'
import { scoreBg, cn } from '../../lib/utils'
import type { Application, Candidate, User } from '../../types'

interface FairnessResult {
  ok: boolean
  gate: {
    decision: 'pass' | 'fail'
    delta: number
    disparateImpact?: number
    details?: Record<string, unknown>
  }
  explain: {
    topFeatures?: Array<{ name: string; value: number }>
    explanation?: string
  }
}

export default function AIValidation() {
  const [selectedJob, setSelectedJob] = useState('')
  const [selectedApp, setSelectedApp] = useState('')
  const [result, setResult] = useState<FairnessResult | null>(null)
  const [error, setError] = useState('')

  const { data: jobs } = useQuery({ queryKey: ['my-jobs'], queryFn: () => jobService.myJobs() })
  const { data: appsData } = useQuery({
    queryKey: ['apps-for-validation', selectedJob],
    queryFn: () => applicationService.listForJob(selectedJob),
    enabled: !!selectedJob,
  })

  const { data: explanation } = useQuery({
    queryKey: ['explanation', selectedApp],
    queryFn: () => applicationService.getExplanation(selectedApp),
    enabled: !!selectedApp && !!result,
  })

  const runMutation = useMutation({
    mutationFn: () => api.post(`/applications/${selectedApp}/fairness-gate`).then(r => r.data as FairnessResult),
    onSuccess: (data) => { setResult(data); setError('') },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Pipeline run failed.')
    },
  })

  const getName = (app: Application) => {
    const cand = app.candidate as Candidate
    const user = typeof cand?.user === 'object' ? cand.user as User : null
    return user ? `${user.firstName} ${user.lastName}` : `Application ${app._id.slice(-6)}`
  }

  const scores = (explanation?.scores as Record<string, number> | undefined)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">AI Pipeline Validation</h1>
          <p className="text-sm text-muted-foreground">Run and verify the full AI pipeline for any application. Use this as a live demonstration of the system.</p>
        </div>
        <AiBadge label="Live Pipeline" size="md" />
      </div>

      {/* Proof point banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Info className="h-4 w-4" /> Defense Proof Points
        </div>
        <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>XGBoost fairness gate with configurable disparate-impact threshold</li>
          <li>SHAP-based explanation showing top feature contributions per candidate</li>
          <li>Recruiter retains override authority — pipeline result is advisory</li>
          <li>Every run is logged in the audit trail with actor, timestamp and model version</li>
        </ul>
      </div>

      {/* Selectors */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Job</label>
          <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedJob} onChange={(e) => { setSelectedJob(e.target.value); setSelectedApp(''); setResult(null) }}>
            <option value="">Select a job…</option>
            {jobs?.data.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Candidate application</label>
          <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedApp} onChange={(e) => { setSelectedApp(e.target.value); setResult(null) }} disabled={!selectedJob}>
            <option value="">Select a candidate…</option>
            {appsData?.data.map((app: Application) => (
              <option key={app._id} value={app._id}>
                {getName(app)} — {app.stage}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button onClick={() => runMutation.mutate()} disabled={!selectedApp || runMutation.isPending}
        className="gap-2">
        {runMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Run Full AI Pipeline (Fairness Gate + SHAP)
      </Button>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Fairness Gate Result */}
          <Card className={cn('border-2', result.gate.decision === 'pass' ? 'border-emerald-300' : 'border-red-300')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className={cn('h-5 w-5', result.gate.decision === 'pass' ? 'text-emerald-500' : 'text-red-500')} />
                Fairness Gate
                {result.gate.decision === 'pass'
                  ? <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> PASS</span>
                  : <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700"><XCircle className="h-3.5 w-3.5" /> FLAGGED</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Decision</p>
                  <p className={cn('mt-1 font-bold uppercase text-lg', result.gate.decision === 'pass' ? 'text-emerald-600' : 'text-red-600')}>
                    {result.gate.decision}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Bias Correction δ</p>
                  <p className={cn('mt-1 font-bold text-lg', result.gate.delta > 0 ? 'text-amber-600' : 'text-muted-foreground')}>
                    {result.gate.delta > 0 ? `−${result.gate.delta.toFixed(2)}` : '0.00'}
                  </p>
                </div>
                {result.gate.disparateImpact !== undefined && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Disparate Impact</p>
                    <p className={cn('mt-1 font-bold text-lg', result.gate.disparateImpact >= 0.8 ? 'text-emerald-600' : 'text-amber-600')}>
                      {result.gate.disparateImpact.toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {result.gate.decision === 'pass'
                  ? 'No demographic bias detected. Candidate advances to next stage.'
                  : 'Potential bias signal detected. Score adjusted by δ. Recruiter review required before advancing.'}
              </p>
            </CardContent>
          </Card>

          {/* SHAP Explanation */}
          {result.explain?.topFeatures?.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  SHAP Feature Importance
                  <AiBadge label="XGBoost" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.explain.topFeatures
                  .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
                  .slice(0, 8)
                  .map((feat) => (
                    <div key={feat.name} className="flex items-center gap-3 text-sm">
                      <span className="w-36 shrink-0 text-xs text-muted-foreground capitalize">{feat.name.replace(/_/g, ' ')}</span>
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full rounded-full', feat.value >= 0 ? 'bg-emerald-400' : 'bg-red-400')}
                          style={{ width: `${Math.min(100, Math.abs(feat.value) * 200)}%` }} />
                      </div>
                      <span className={cn('w-12 text-right font-mono text-xs', feat.value >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                        {feat.value >= 0 ? '+' : ''}{feat.value.toFixed(3)}
                      </span>
                    </div>
                  ))}
                <p className="text-xs text-muted-foreground pt-1">
                  Positive values increase the predicted score; negative values decrease it. This output is deterministic for a given candidate.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {/* Composite scores after pipeline */}
          {scores && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" /> Composite Score After Pipeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Resume',     key: 'resumeScore' },
                  { label: 'Assessment', key: 'assessmentScore' },
                  { label: 'Interview',  key: 'interviewScore' },
                  { label: 'Penalty',    key: 'penaltyApplied' },
                  { label: 'Final',      key: 'finalScore' },
                ].map(({ label, key }) => {
                  const val = scores[key] ?? 0
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
                      <div className="flex-1 h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, val)}%` }} />
                      </div>
                      <span className={cn('w-14 text-right text-xs font-bold', scoreBg(val).split(' ').find(c => c.startsWith('text-')) ?? '')}>
                        {val.toFixed(1)}%
                      </span>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {result.explain?.explanation && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="flex gap-3 p-5">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-primary">Generated AI Narrative</p>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{result.explain.explanation}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
