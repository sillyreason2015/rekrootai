import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Shield, Ban, CheckCircle2, AlertTriangle, Calendar, Video, ArrowRight } from 'lucide-react'
import { applicationService } from '../../services/application.service'
import { jobService } from '../../services/job.service'
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
  const qc = useQueryClient()

  const { data: jobs } = useQuery({ queryKey: ['my-jobs'], queryFn: () => jobService.myJobs() })
  const [selectedJob, setSelectedJob] = useState(jobId)

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

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Job:</label>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={selectedJob} onChange={(e) => setSelectedJob(e.target.value)}>
          <option value="">Select a job</option>
          {jobs?.data.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)}
        </select>
      </div>

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
                          <div className={cn('rounded-full border px-3 py-1 text-sm font-bold shrink-0', scoreBg(app.scores?.final ?? 0))}>
                            {(app.scores?.final ?? 0).toFixed(0)}%
                          </div>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(`/candidate/explanation/${app._id}`, '_blank')}
                        >
                          Explain
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
                          <Button size="sm" variant="outline" className="text-purple-600 border-purple-200 hover:bg-purple-50"
                            onClick={() => fairnessMutation.mutate(app._id)} disabled={fairnessMutation.isPending}>
                            <Shield className="h-3.5 w-3.5" /> Run Fairness
                          </Button>
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
                        {mode === 'Assist' && (
                          <AiSuggestion
                            stage={app.stage}
                            scores={app.scores}
                            fairnessComputedAt={extApp.fairnessComputedAt}
                            decision={(app as any).decision}
                          />
                        )}
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
