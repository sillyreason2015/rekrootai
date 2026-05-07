import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Shield, BarChart3, CheckCircle2, XCircle, Loader2, RefreshCw, Info } from 'lucide-react'
import InfoTip from '../../components/shared/InfoTip'
import api from '../../lib/axios'
import { jobService } from '../../services/job.service'
import { applicationService } from '../../services/application.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import AiBadge from '../../components/shared/AiBadge'
import { scoreBg, cn } from '../../lib/utils'
import type { Application, Candidate, User } from '../../types'

interface FairnessResult {
  passed: boolean
  score: number
  flags: string[]
  message: string
  breakdown: {
    resume: number
    assessment: number
    interview: number
    penalty: number
    final: number
  }
}

export default function AIValidation() {
  const [selectedJob, setSelectedJob] = useState('')
  const [selectedApp, setSelectedApp] = useState('')
  const [result, setResult] = useState<FairnessResult | null>(null)
  const [error, setError] = useState('')

  const { data: jobs } = useQuery({ queryKey: ['ai-validation-jobs'], queryFn: () => jobService.myJobs({ page: 1 }) })
  const { data: appsData } = useQuery({
    queryKey: ['apps-for-validation', selectedJob],
    queryFn: () => applicationService.listForJob(selectedJob),
    enabled: !!selectedJob,
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
          <Info className="h-4 w-4" /> How this pipeline works
        </div>
        <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>Fairness gate checks for demographic parity before confirming any shortlist decision</li>
          <li>SHAP explanations show the exact contribution of each factor to the candidate's final score</li>
          <li>Recruiter retains full override authority — all AI outputs are advisory</li>
          <li>Every run is logged in the audit trail with actor, timestamp, and model version</li>
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
      {!!selectedJob && !appsData?.data?.length && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No candidate applications found for this job yet.
        </div>
      )}

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
          <Card className={cn('border-2', result.passed ? 'border-emerald-300' : 'border-red-300')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className={cn('h-5 w-5', result.passed ? 'text-emerald-500' : 'text-red-500')} />
                Fairness Gate
                {result.passed
                  ? <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> PASS</span>
                  : <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700"><XCircle className="h-3.5 w-3.5" /> FLAGGED</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Final Score</p>
                  <p className="mt-1 font-bold text-lg">{result.score.toFixed(1)}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    Penalty
                    <InfoTip content="Score penalty applied when scoring anomalies or bias signals are detected. A value of 0 means no issues found." />
                  </p>
                  <p className={cn('mt-1 font-bold text-lg', result.breakdown.penalty > 0 ? 'text-amber-600' : 'text-muted-foreground')}>
                    {result.breakdown.penalty > 0 ? `−${result.breakdown.penalty}` : '0'}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    Flags
                    <InfoTip content="Number of fairness concerns detected. 0 means the candidate passed all checks." />
                  </p>
                  <p className={cn('mt-1 font-bold text-lg', result.flags.length > 0 ? 'text-red-600' : 'text-emerald-600')}>
                    {result.flags.length}
                  </p>
                </div>
              </div>
              {result.flags.length > 0 && (
                <ul className="space-y-1">
                  {result.flags.map((flag, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {flag}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">{result.message}</p>
            </CardContent>
          </Card>

          {/* Composite scores after pipeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" /> Score Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {([
                { label: 'Resume',     key: 'resume' as const },
                { label: 'Assessment', key: 'assessment' as const },
                { label: 'Interview',  key: 'interview' as const },
                { label: 'Penalty',    key: 'penalty' as const },
                { label: 'Final',      key: 'final' as const },
              ] as const).map(({ label, key }) => {
                const val = result.breakdown[key] ?? 0
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
                    <div className="flex-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, val)}%` }} />
                    </div>
                    <span className={cn('w-14 text-right text-xs font-bold', scoreBg(val).split(' ').find(c => c.startsWith('text-')) ?? '')}>
                      {val.toFixed(1)}
                    </span>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
