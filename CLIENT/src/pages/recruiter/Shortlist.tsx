import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Shield, Ban, CheckCircle2, AlertTriangle, Calendar, Video, ArrowRight, Download, Layers, TrendingUp, TrendingDown, Minus, Bot, X } from 'lucide-react'
import InfoTip from '../../components/shared/InfoTip'
import { applicationService } from '../../services/application.service'
import { jobService } from '../../services/job.service'
import { recruiterService } from '../../services/recruiter.service'
import api from '../../lib/axios'
import { Card, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import AiBadge from '../../components/shared/AiBadge'
import AiSuggestion from '../../components/shared/AiSuggestion'
import { scoreBg, cn } from '../../lib/utils'
import type { Application, Candidate, User } from '../../types'

type Mode = 'Assist' | 'Veto' | 'Override'

function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    applied: 'Applied', screening: 'Screening', assessment: 'Assessment',
    interview: 'Interview', decision: 'Decision', rejected: 'Rejected',
  }
  return labels[stage] ?? stage
}

function stageBadge(stage: string) {
  const colors: Record<string, string> = {
    applied: 'bg-slate-100 text-slate-600',
    screening: 'bg-blue-50 text-blue-600',
    assessment: 'bg-amber-50 text-amber-700',
    interview: 'bg-purple-50 text-purple-700',
    decision: 'bg-emerald-50 text-emerald-700',
    rejected: 'bg-red-50 text-red-600',
  }
  return colors[stage] ?? 'bg-muted text-muted-foreground'
}

export default function Shortlist() {
  const [params] = useSearchParams()
  const jobId = params.get('job') ?? ''
  const [mode, setMode] = useState<Mode>('Assist')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [scheduleFor, setScheduleFor] = useState<string | null>(null)
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0)
    return d.toISOString().slice(0, 16)
  })
  const [duration, setDuration] = useState(45)
  const [vetoSummary, setVetoSummary] = useState<{ processed: number; shortlisted: number; rejected: number; review: number } | null>(null)
  const [assistantCandidate, setAssistantCandidate] = useState<{ id: string; name: string; scores: Application['scores']; stage: string } | null>(null)
  const [showTriage, setShowTriage] = useState(false)
  const qc = useQueryClient()

  const { data: jobs } = useQuery({ queryKey: ['my-jobs'], queryFn: () => jobService.myJobs() })
  const [selectedJob, setSelectedJob] = useState(jobId)

  const { data: triageData, isLoading: triageLoading } = useQuery({
    queryKey: ['triage', selectedJob, mode],
    queryFn: () => recruiterService.getJobTriage(selectedJob, mode.toLowerCase() as 'assist' | 'veto' | 'override'),
    enabled: !!selectedJob && showTriage,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['applications', selectedJob],
    queryFn: () => applicationService.listForJob(selectedJob),
    enabled: !!selectedJob,
  })

  const mutOpts = { onSuccess: () => qc.invalidateQueries({ queryKey: ['applications', selectedJob] }) }

  const shortlistMutation = useMutation({ mutationFn: (id: string) => applicationService.shortlist(id), ...mutOpts })
  const rejectMutation = useMutation({ mutationFn: (id: string) => applicationService.reject(id), ...mutOpts })
  const sendAssessmentMutation = useMutation({ mutationFn: (id: string) => applicationService.sendAssessment(id, 60), ...mutOpts })
  const fairnessMutation = useMutation({ mutationFn: (id: string) => applicationService.runFairnessGate(id), ...mutOpts })
  const scheduleMutation = useMutation({
    mutationFn: ({ appId, scheduledAt, durationMin }: { appId: string; scheduledAt: string; durationMin: number }) =>
      api.post('/interviews', { applicationId: appId, scheduledAt: new Date(scheduledAt).toISOString(), durationMin }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['applications', selectedJob] }); setScheduleFor(null) },
  })
  const completeMutation = useMutation({
    mutationFn: (interviewId: string) => api.post(`/interviews/${interviewId}/complete`, {}),
    ...mutOpts,
  })
  const vetoMutation = useMutation({
    mutationFn: () => applicationService.aiDecide({ jobId: selectedJob }),
    onSuccess: (resp: any) => {
      const results = Array.isArray(resp?.results) ? resp.results : []
      setVetoSummary({
        processed: Number(resp?.processed ?? results.length),
        shortlisted: results.filter((r: any) => r.action === 'shortlisted').length,
        rejected: results.filter((r: any) => r.action === 'rejected').length,
        review: results.filter((r: any) => r.action === 'review').length,
      })
      qc.invalidateQueries({ queryKey: ['applications', selectedJob] })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Shortlist Review</h1>
          <p className="text-sm text-muted-foreground">AI-ranked candidates with SHAP explanations.</p>
        </div>
        <div className="flex items-center gap-2">
          <InfoTip
            size="md"
            content="Choose how much autonomy the AI has. Assist: you approve each candidate. Veto: AI shortlists automatically, you remove any. Override: full manual control, AI scores are advisory only."
          />
          <div className="flex rounded-xl border bg-card p-1">
          {(['Assist', 'Veto', 'Override'] as Mode[]).map((m) => (
            <button key={m} onClick={() => {
              setMode(m)
              if (m === 'Veto' && selectedJob) vetoMutation.mutate()
            }}
              className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {m === 'Assist' && <CheckCircle2 className="h-3.5 w-3.5" />}
              {m === 'Veto' && <Ban className="h-3.5 w-3.5" />}
              {m === 'Override' && <Shield className="h-3.5 w-3.5" />}
              {m}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        {mode === 'Assist' && 'AI assists — recommendations shown but you approve each decision.'}
        {mode === 'Veto' && 'AI shortlists automatically. You can veto individual candidates.'}
        {mode === 'Override' && 'Full manual control. AI scores are advisory only.'}
      </div>
      {mode === 'Veto' && vetoSummary && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
          Veto run complete: processed {vetoSummary.processed}, shortlisted {vetoSummary.shortlisted}, rejected {vetoSummary.rejected}, manual review {vetoSummary.review}.
        </div>
      )}
      {assistantCandidate && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">AI Hiring Companion — {assistantCandidate.name}</p>
            </div>
            <button onClick={() => setAssistantCandidate(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[
              { label: 'Resume', val: assistantCandidate.scores?.resume },
              { label: 'Assessment', val: assistantCandidate.scores?.assessment },
              { label: 'Interview', val: assistantCandidate.scores?.interview },
              { label: 'Final', val: assistantCandidate.scores?.final },
            ].map(({ label, val }) => (
              <div key={label} className="rounded-md border bg-background px-3 py-2 text-center">
                <p className="text-muted-foreground">{label}</p>
                <p className="font-bold text-sm mt-0.5">{val != null && val > 0 ? `${val.toFixed(0)}%` : '—'}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-background border px-3 py-3 text-sm text-muted-foreground space-y-2">
            {assistantCandidate.scores?.final != null && assistantCandidate.scores.final >= 75 && (
              <p className="text-emerald-600 font-medium">✓ Strong performer — recommend progressing to next stage.</p>
            )}
            {assistantCandidate.scores?.final != null && assistantCandidate.scores.final >= 50 && assistantCandidate.scores.final < 75 && (
              <p className="text-amber-600 font-medium">⚠ Borderline score — review assessment and interview details before deciding.</p>
            )}
            {(assistantCandidate.scores?.final == null || assistantCandidate.scores.final < 50) && assistantCandidate.stage !== 'applied' && (
              <p className="text-red-600 font-medium">✗ Below threshold — consider rejection with documented rationale.</p>
            )}
            {assistantCandidate.stage === 'applied' && (
              <p>Candidate is in initial review. Shortlist to begin AI-assisted screening.</p>
            )}
            <p className="text-xs">
              Current mode: <strong>{mode}</strong> — {mode === 'Assist' ? 'approve each step manually.' : mode === 'Veto' ? 'AI auto-processes, you can veto.' : 'full manual control, AI scores are advisory.'}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">Job:</label>
        <select className="h-9 min-w-[260px] rounded-md border border-input bg-background px-3 text-sm"
          value={selectedJob} onChange={(e) => { setSelectedJob(e.target.value); setShowTriage(false) }}>
          <option value="">Select a job…</option>
          {jobs?.data.map((j) => (
            <option key={j._id} value={j._id}>
              {j.title}{j.department ? ` — ${j.department}` : ''}{j.level ? ` (${j.level})` : ''}{j.status === 'draft' ? ' [draft]' : j.status === 'closed' ? ' [closed]' : ''}
            </option>
          ))}
        </select>
        {selectedJob && (
          <>
            <Button size="sm" variant="outline" className="gap-1.5"
              onClick={async () => {
                const bundle = await recruiterService.getJobCvBundle(selectedJob)
                bundle.cvs?.forEach((c: { name: string; url: string }) => {
                  const a = document.createElement('a'); a.href = c.url; a.download = `${c.name}.pdf`; a.target = '_blank'; a.click()
                })
              }}>
              <Download className="h-3.5 w-3.5" /> Download All CVs
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowTriage((v) => !v)}>
              <Layers className="h-3.5 w-3.5" /> {showTriage ? 'Hide' : 'AI Triage'}
            </Button>
          </>
        )}
      </div>

      {/* AI Triage panel */}
      {showTriage && selectedJob && (
        <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <AiBadge label="AI Triage Analysis" size="md" />
            <span className="text-xs text-muted-foreground">Grouped by resume score · {mode} mode</span>
          </div>
          {triageLoading ? <LoadingSpinner /> : triageData && (
            <>
              {triageData.adminGuidance?.length > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1.5">Suggested next steps</p>
                  {triageData.adminGuidance.map((step: string, i: number) => (
                    <p key={i} className="text-xs text-blue-700 dark:text-blue-400">· {step}</p>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { key: 'strong', label: 'Strong', icon: TrendingUp, color: 'emerald' },
                  { key: 'review', label: 'Needs Review', icon: Minus, color: 'amber' },
                  { key: 'weak', label: 'Weak', icon: TrendingDown, color: 'red' },
                ].map(({ key, label, icon: Icon, color }) => (
                  <div key={key} className={`rounded-lg border border-${color}-200 dark:border-${color}-900 bg-${color}-50 dark:bg-${color}-950/20 p-3 space-y-2`}>
                    <div className={`flex items-center gap-2 text-${color}-700 dark:text-${color}-400`}>
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="ml-auto text-xs font-normal">{triageData[key]?.length ?? 0}</span>
                    </div>
                    {triageData[key]?.slice(0, 5).map((c: { candidateName: string; score: number; recommendation: string }) => (
                      <div key={c.candidateName} className="text-xs space-y-0.5">
                        <p className="font-medium">{c.candidateName}</p>
                        <p className={`text-${color}-600 dark:text-${color}-400`}>{c.recommendation}</p>
                      </div>
                    ))}
                    {triageData[key]?.length > 5 && (
                      <p className="text-xs text-muted-foreground">+{triageData[key].length - 5} more</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {!selectedJob ? (
        <p className="text-sm text-muted-foreground">Select a job to view applications.</p>
      ) : isLoading ? <LoadingSpinner />
      : !data?.data.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No applications yet for this role.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {data.data
            .sort((a: Application, b: Application) => (b.scores?.final ?? 0) - (a.scores?.final ?? 0))
            .map((app: Application) => {
              const candidate = app.candidate as Candidate
              const user = typeof candidate?.user === 'object' ? candidate.user as User : null
              const name = user ? `${user.firstName} ${user.lastName}` : 'Candidate'
              const initials = user ? `${user.firstName[0]}${user.lastName[0]}` : '?'
              const isExpand = expanded === app._id
              const isScheduling = scheduleFor === app._id
              const extApp = app as Application & { fairnessComputedAt?: string; explanationComputedAt?: string; interviewId?: string; interviewStatus?: string; interviewScheduledAt?: string }

              return (
                <Card key={app._id} className={cn('transition-all', app.stage === 'rejected' ? 'opacity-50' : '', app.stage === 'decision' ? 'border-emerald-200' : '')}>
                  <CardContent className="p-0">
                    {/* Header row */}
                    <div className="flex items-center gap-3 p-4 flex-wrap">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{name}</p>
                        <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-medium mt-0.5', stageBadge(app.stage))}>
                          {stageLabel(app.stage)}
                        </span>
                      </div>

                      {/* Score */}
                        {(app.scores?.final ?? 0) > 0 && (
                          <div className="flex items-center gap-1 shrink-0">
                            <div className={cn('rounded-full border px-3 py-1 text-sm font-bold', scoreBg(app.scores?.final ?? 0))}>
                              {(app.scores?.final ?? 0).toFixed(0)}%
                            </div>
                            <InfoTip content="Weighted composite of CV match, assessment score, and interview performance. Threshold to reach interview stage is 60% by default." />
                          </div>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(`/candidate/explanation/${app._id}`, '_blank')}
                        >
                          Explain
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1"
                          onClick={async () => {
                            try {
                              const r = await recruiterService.getApplicationCv(app._id)
                              if (r.url) { const a = document.createElement('a'); a.href = r.url; a.target = '_blank'; a.click() }
                            } catch { /* no CV */ }
                          }}>
                          <Download className="h-3.5 w-3.5" /> CV
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1"
                          onClick={() => setAssistantCandidate({ id: app._id, name, scores: app.scores, stage: app.stage })}>
                          <Bot className="h-3.5 w-3.5" /> Assist Me
                        </Button>
                        <AiBadge />

                      {/* Pipeline action buttons */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Step 1: Shortlist (applied → screening) */}
                        {app.stage === 'applied' && mode !== 'Veto' && (
                          <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            onClick={() => shortlistMutation.mutate(app._id)} disabled={shortlistMutation.isPending}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Shortlist
                          </Button>
                        )}

                        {/* Step 2: Send Assessment (screening) */}
                        {app.stage === 'screening' && mode !== 'Override' && (
                          <Button size="sm" variant="outline"
                            onClick={() => sendAssessmentMutation.mutate(app._id)} disabled={sendAssessmentMutation.isPending}>
                            <ArrowRight className="h-3.5 w-3.5" /> Send Assessment
                          </Button>
                        )}

                        {/* Step 3: Run Fairness Gate (assessment) */}
                        {app.stage === 'assessment' && mode !== 'Override' && (
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="outline" className="text-purple-600 border-purple-200 hover:bg-purple-50"
                              onClick={() => fairnessMutation.mutate(app._id)} disabled={fairnessMutation.isPending}>
                              <Shield className="h-3.5 w-3.5" /> Run Fairness
                            </Button>
                            <InfoTip content="Checks for demographic parity across protected groups before confirming a shortlist decision. Flags any statistically significant disparity for recruiter review." />
                          </div>
                        )}

                        {/* Step 4: Schedule Interview (interview stage, no interview yet) */}
                        {app.stage === 'interview' && !extApp.interviewId && (
                          <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50"
                            onClick={() => setScheduleFor(isScheduling ? null : app._id)}>
                            <Calendar className="h-3.5 w-3.5" /> Schedule Interview
                          </Button>
                        )}

                        {/* Interview scheduled — join or complete */}
                        {app.stage === 'interview' && extApp.interviewId && extApp.interviewStatus !== 'completed' && (
                          <>
                            <Button size="sm" variant="outline" className="text-purple-600 border-purple-200"
                              onClick={() => window.open(`/recruiter/interview/${extApp.interviewId}`, '_blank')}>
                              <Video className="h-3.5 w-3.5" /> Join
                            </Button>
                            <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200"
                              onClick={() => completeMutation.mutate(extApp.interviewId!)}>
                              <CheckCircle2 className="h-3.5 w-3.5" /> Mark Complete
                            </Button>
                          </>
                        )}

                        {/* Reject (available at all non-final stages) */}
                        {!['decision', 'rejected'].includes(app.stage) && mode !== 'Veto' && (
                          <Button size="sm" variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/5"
                            onClick={() => rejectMutation.mutate(app._id)} disabled={rejectMutation.isPending}>
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>

                      <button onClick={() => setExpanded(isExpand ? null : app._id)} className="p-1 text-muted-foreground shrink-0">
                        {isExpand ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>

                    <div className="border-t px-4 py-3">
                      <AiSuggestion
                        stage={app.stage}
                        scores={app.scores}
                        fairnessComputedAt={extApp.fairnessComputedAt}
                        decision={(app as any).decision}
                      />
                    </div>

                    {/* Schedule Interview inline panel */}
                    {isScheduling && (
                      <div className="border-t bg-blue-50/50 px-4 py-3 space-y-3">
                        <p className="text-sm font-medium text-blue-700">Schedule interview for {name}</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Date & Time</label>
                            <input type="datetime-local" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                              value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Duration (minutes)</label>
                            <input type="number" min={15} max={120} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                              value={duration} onChange={(e) => setDuration(+e.target.value)} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => scheduleMutation.mutate({ appId: app._id, scheduledAt, durationMin: duration })}
                            disabled={scheduleMutation.isPending}>
                            <Calendar className="h-3.5 w-3.5" /> Confirm Schedule
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setScheduleFor(null)}>Cancel</Button>
                        </div>
                      </div>
                    )}

                    {/* SHAP details expansion */}
                    {isExpand && (
                      <div className="border-t px-4 pb-4 pt-3 space-y-3">
                        {mode === 'Assist' && null}
                        <AiBadge label="SHAP Score Breakdown" size="md" />
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {[
                            { label: 'Resume',     value: app.scores?.resume },
                            { label: 'Assessment', value: app.scores?.assessment },
                            { label: 'Penalty',    value: app.scores?.penalty },
                            { label: 'Interview',  value: app.scores?.interview },
                          ].map(({ label, value }) => (
                            <div key={label} className="rounded-lg border bg-muted/30 p-3 text-center">
                              <p className="text-xs text-muted-foreground">{label}</p>
                              <p className={cn('mt-1 text-lg font-bold', value !== undefined && value > 0 ? scoreBg(value).split(' ').filter(c => c.startsWith('text-')).join(' ') : 'text-muted-foreground')}>
                                {value !== undefined && value > 0 ? `${value.toFixed(0)}%` : '—'}
                              </p>
                            </div>
                          ))}
                        </div>
                        {extApp.interviewScheduledAt && (
                          <p className="text-xs text-muted-foreground">
                            Interview: {new Date(extApp.interviewScheduledAt).toLocaleString()}
                            {extApp.interviewStatus && ` · ${extApp.interviewStatus}`}
                          </p>
                        )}
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          <p>{extApp.fairnessComputedAt ? `✓ Fairness gate: ${new Date(extApp.fairnessComputedAt).toLocaleString()}` : '○ Fairness gate: pending'}</p>
                          <p>{extApp.explanationComputedAt ? `✓ SHAP explanation: ${new Date(extApp.explanationComputedAt).toLocaleString()}` : '○ SHAP explanation: pending'}</p>
                        </div>
                        {app.scores?.final !== undefined && (
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-muted-foreground">
                              Final score is a weighted composite (CV 30% · Assessment 30% · Interview 30% · Fairness 10%). Human review required before any hiring decision.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
        </div>
      )}
    </div>
  )
}
