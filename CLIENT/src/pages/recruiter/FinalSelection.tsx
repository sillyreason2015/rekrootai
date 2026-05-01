import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle, Clock, Loader2, Video, FileText, MessageSquare } from 'lucide-react'
import InfoTip from '../../components/shared/InfoTip'
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
import { Link } from 'react-router-dom'

type AppExt = Application & {
  fairnessComputedAt?: string
  explanationComputedAt?: string
  interviewId?: string
  interviewStatus?: string
  interviewScheduledAt?: string
}

function aiPreview(app: AppExt) {
  const f = Number(app.scores?.final ?? 0)
  if (app.stage === 'interview') return 'Interview completed candidates should be moved to decision after scoring.'
  if (app.decision === 'hire') return 'AI and human review align on positive outcome.'
  if (app.decision === 'reject') return 'Candidate did not meet composite threshold for this role.'
  if (app.decision === 'hold') return 'Candidate on hold pending additional comparisons.'
  if (f >= 75) return `High composite score (${f.toFixed(0)}%).`
  if (f >= 55) return `Moderate composite score (${f.toFixed(0)}%).`
  return `Low composite score (${f.toFixed(0)}%).`
}

const stageOrder: Record<string, number> = { interview: 0, decision: 1, offered: 2, rejected: 99 }

export default function FinalSelection() {
  const [params] = useSearchParams()
  const [selectedJob, setSelectedJob] = useState(params.get('job') ?? '')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [recruiterNotes, setRecruiterNotes] = useState<Record<string, string>>({})
  const qc = useQueryClient()

  const { data: jobs } = useQuery({ queryKey: ['my-jobs'], queryFn: () => jobService.myJobs() })

  // Fetch interview+decision stage candidates together
  const { data: interviewData, isLoading: loadingInterview } = useQuery({
    queryKey: ['final-apps-interview', selectedJob],
    queryFn: () => applicationService.listForJob(selectedJob, { stage: 'interview' }),
    enabled: !!selectedJob,
  })
  const { data: decisionData, isLoading: loadingDecision } = useQuery({
    queryKey: ['final-apps-decision', selectedJob],
    queryFn: () => applicationService.listForJob(selectedJob, { stage: 'decision' }),
    enabled: !!selectedJob,
  })

  const isLoading = loadingInterview || loadingDecision
  const allApps: AppExt[] = [
    ...(interviewData?.data ?? []),
    ...(decisionData?.data ?? []),
  ].sort((a, b) => (stageOrder[a.stage] ?? 0) - (stageOrder[b.stage] ?? 0) || (b.scores?.final ?? 0) - (a.scores?.final ?? 0))

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'hire' | 'reject' | 'hold' }) =>
      applicationService.makeDecision(id, decision, notes[id]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['final-apps-decision', selectedJob] })
      qc.invalidateQueries({ queryKey: ['final-apps-interview', selectedJob] })
    },
  })

  const addNoteMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.post(`/applications/${id}/recruiter-note`, { note }),
    onSuccess: (_d, vars) => {
      setRecruiterNotes((p) => ({ ...p, [vars.id]: '' }))
      qc.invalidateQueries({ queryKey: ['final-apps-decision', selectedJob] })
    },
  })

  const completeMutation = useMutation({
    mutationFn: (interviewId: string) => api.post(`/interviews/${interviewId}/complete`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['final-apps-interview', selectedJob] })
      qc.invalidateQueries({ queryKey: ['final-apps-decision', selectedJob] })
    },
  })

  const getName = (app: AppExt) => {
    const cand = app.candidate as Candidate
    const user = typeof cand?.user === 'object' ? cand.user as User : null
    return user ? `${user.firstName} ${user.lastName}` : 'Candidate'
  }
  const getInitials = (app: AppExt) => {
    const cand = app.candidate as Candidate
    const user = typeof cand?.user === 'object' ? cand.user as User : null
    return user ? `${user.firstName[0]}${user.lastName[0]}` : '?'
  }
  const getEmail = (app: AppExt) => {
    const cand = app.candidate as Candidate
    const user = typeof cand?.user === 'object' ? cand.user as User : null
    return user?.email ?? ''
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Final Selection</h1>
          <p className="text-sm text-muted-foreground">Interview-stage and decision-stage candidates. All decisions are audited.</p>
        </div>
        <AiBadge label="Human Decision Required" size="md" />
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Job:</label>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={selectedJob} onChange={(e) => setSelectedJob(e.target.value)}>
          <option value="">Select a job</option>
          {jobs?.data.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)}
        </select>
      </div>

      {!selectedJob ? (
        <p className="text-sm text-muted-foreground">Select a job to begin.</p>
      ) : isLoading ? <LoadingSpinner />
      : !allApps.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          No candidates at interview or decision stage yet.
          <p className="mt-1 text-xs">Advance candidates through the shortlist page first.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {allApps.map((app) => {
            const decided = !!app.decision
            const isInterviewStage = app.stage === 'interview'
            const name = getName(app)
            const email = getEmail(app)

            return (
              <Card key={app._id} className={cn(decided && app.decision !== 'hold' ? 'opacity-70' : '', app.stage === 'interview' ? 'border-purple-200' : 'border-emerald-200')}>
                <CardContent className="p-5 space-y-4">
                  {/* Candidate header */}
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                      {getInitials(app)}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">{email}</p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', isInterviewStage ? 'bg-purple-50 text-purple-700' : 'bg-emerald-50 text-emerald-700')}>
                          {app.stage}
                        </span>
                        {(app.scores?.final ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-bold', scoreBg(app.scores?.final ?? 0))}>
                              AI Score: {(app.scores?.final ?? 0).toFixed(0)}%
                            </span>
                            <InfoTip content="Weighted composite of CV match, assessment modules, and interview rubric score. This is advisory — your decision overrides it." />
                          </span>
                        )}
                        {app.explanationComputedAt && (
                          <Link to={`/candidate/explanation/${app._id}`} target="_blank"
                            className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/20">
                            <FileText className="h-3 w-3" /> AI Explanation
                          </Link>
                        )}
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          Fairness: {app.fairnessComputedAt ? 'done' : 'pending'}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          SHAP: {app.explanationComputedAt ? 'done' : 'pending'}
                        </span>
                      </div>
                    </div>
                    {decided && (
                      <div className={cn('rounded-lg px-3 py-1.5 text-sm font-medium capitalize flex items-center gap-1.5',
                        app.decision === 'hire' ? 'bg-emerald-50 text-emerald-700' : app.decision === 'reject' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700')}>
                        {app.decision === 'hire' && <CheckCircle2 className="h-4 w-4" />}
                        {app.decision === 'reject' && <XCircle className="h-4 w-4" />}
                        {app.decision === 'hold' && <Clock className="h-4 w-4" />}
                        {app.decision}
                      </div>
                    )}
                  </div>

                  {/* AI Suggestion */}
                  <AiSuggestion
                    stage={app.stage}
                    scores={app.scores}
                    fairnessComputedAt={app.fairnessComputedAt}
                    decision={app.decision}
                  />
                  <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    AI Preview: {aiPreview(app)}
                  </div>

                  {/* Interview stage: complete interview to advance */}
                  {isInterviewStage && app.interviewId && (
                    <div className="rounded-lg border border-purple-200 bg-purple-50/50 px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-purple-800">Interview scheduled</p>
                        {app.interviewScheduledAt && (
                          <p className="text-xs text-purple-600">{new Date(app.interviewScheduledAt).toLocaleString()}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white"
                          onClick={() => window.open(`/recruiter/interview/${app.interviewId}`, '_blank')}>
                          <Video className="h-3.5 w-3.5" /> Join Interview
                        </Button>
                        <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200"
                          onClick={() => completeMutation.mutate(app.interviewId!)} disabled={completeMutation.isPending}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Mark Complete
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Decision actions */}
                  {!decided && app.stage === 'decision' && (() => {
                    const hasNote = (notes[app._id] ?? '').trim().length >= 10
                    return (
                      <>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground/70">
                            Decision rationale <span className="text-destructive">*</span>
                            <span className="ml-1 text-[10px] text-muted-foreground">(min. 10 chars — recorded in audit log and shared with candidate)</span>
                          </label>
                          <textarea rows={2}
                            className={cn('w-full rounded-md border bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring', !hasNote && (notes[app._id] ?? '').length > 0 ? 'border-destructive/50' : 'border-input')}
                            placeholder="e.g. Strong technical skills but communication needs improvement…"
                            value={notes[app._id] ?? ''}
                            onChange={(e) => setNotes((p) => ({ ...p, [app._id]: e.target.value }))}
                          />
                          {!hasNote && (notes[app._id] ?? '').length > 0 && (
                            <p className="text-[11px] text-destructive">Please provide at least 10 characters before making a decision.</p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => decideMutation.mutate({ id: app._id, decision: 'hire' })}
                            disabled={decideMutation.isPending || !hasNote}
                            title={!hasNote ? 'Add a rationale before deciding' : ''}>
                            {decideMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                            <CheckCircle2 className="h-4 w-4" /> Hire
                          </Button>
                          <Button size="sm" variant="outline" className="text-amber-600 border-amber-200"
                            onClick={() => decideMutation.mutate({ id: app._id, decision: 'hold' })}
                            disabled={decideMutation.isPending || !hasNote}>
                            <Clock className="h-4 w-4" /> Hold
                          </Button>
                          <Button size="sm" variant="outline" className="text-destructive border-destructive/20"
                            onClick={() => decideMutation.mutate({ id: app._id, decision: 'reject' })}
                            disabled={decideMutation.isPending || !hasNote}>
                            <XCircle className="h-4 w-4" /> Reject
                          </Button>
                          <InfoTip content="Hire: sends an offer and notifies the candidate. Hold: keeps them in the pipeline for comparison. Reject: closes their application with the rationale you wrote above — this is shared with the candidate and logged immutably." />
                        </div>
                      </>
                    )
                  })()}

                  {/* Recruiter feedback note (human-in-loop) */}
                  {decided && (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <MessageSquare className="h-3.5 w-3.5" /> Add personal feedback for candidate (shown in their AI explanation)
                      </p>
                      <div className="flex gap-2">
                        <input type="text" className="h-8 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="e.g. Strong communication skills but limited system design experience…"
                          value={recruiterNotes[app._id] ?? ''}
                          onChange={(e) => setRecruiterNotes((p) => ({ ...p, [app._id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter' && recruiterNotes[app._id]) addNoteMutation.mutate({ id: app._id, note: recruiterNotes[app._id] }) }}
                        />
                        <Button size="sm" variant="outline" disabled={!recruiterNotes[app._id] || addNoteMutation.isPending}
                          onClick={() => addNoteMutation.mutate({ id: app._id, note: recruiterNotes[app._id] })}>
                          Save Note
                        </Button>
                      </div>
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
