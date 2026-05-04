import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'
import { applicationService } from '../../services/application.service'
import { jobService } from '../../services/job.service'
import { Card, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Label } from '../../components/ui/label'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import AiBadge from '../../components/shared/AiBadge'
import { cn, scoreBg } from '../../lib/utils'
import type { Candidate, Job, User } from '../../types'

export default function FinalSelection() {
  const [params] = useSearchParams()
  const [selectedJob, setSelectedJob] = useState(params.get('job') ?? '')
  const [pendingDecision, setPendingDecision] = useState<Record<string, 'hire' | 'hold' | 'reject' | null>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [successState, setSuccessState] = useState<Record<string, string>>({})
  const qc = useQueryClient()

  const { data: jobs } = useQuery({
    queryKey: ['my-jobs'],
    queryFn: () => jobService.myJobs(),
  })

  const selectedJobRecord = jobs?.data.find((job: Job) => job._id === selectedJob) as (Job & { aiMode?: string; mode?: string }) | undefined
  const aiMode = selectedJobRecord?.aiMode ?? selectedJobRecord?.mode ?? params.get('mode') ?? 'assist'
  const isOverrideMode = aiMode === 'override'

  const { data: decisionData, isLoading } = useQuery({
    queryKey: ['final-apps-decision', selectedJob],
    queryFn: () => applicationService.listForJob(selectedJob, { stage: 'decision' }),
    enabled: !!selectedJob,
  })

  const decisionApps = (decisionData?.data ?? [])
    .filter((app) => app.stage === 'decision')
    .sort((a, b) => (b.scores?.final ?? 0) - (a.scores?.final ?? 0))

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'hire' | 'reject' | 'hold' }) =>
      applicationService.makeDecision(id, decision, notes[id]),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['final-apps-decision', selectedJob] })
      setPendingDecision((prev) => ({ ...prev, [vars.id]: null }))
      setSuccessState((prev) => ({ ...prev, [vars.id]: `${vars.decision} recorded successfully.` }))
    },
  })

  const getName = (candidate: unknown) => {
    const cand = candidate as Candidate
    const user = typeof cand?.user === 'object' ? cand.user as User : null
    return user ? `${user.firstName} ${user.lastName}` : 'Candidate'
  }

  const getInitials = (candidate: unknown) => {
    const cand = candidate as Candidate
    const user = typeof cand?.user === 'object' ? cand.user as User : null
    return user ? `${user.firstName[0]}${user.lastName[0]}` : '?'
  }

  const getEmail = (candidate: unknown) => {
    const cand = candidate as Candidate
    const user = typeof cand?.user === 'object' ? cand.user as User : null
    return user?.email ?? ''
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Final Selection</h1>
          <p className="text-sm text-muted-foreground">Decision-stage candidates ready for final recruiter action.</p>
        </div>
        <AiBadge label={isOverrideMode ? 'AI Advisory Only' : 'Human Decision Required'} size="md" />
      </div>

      {isOverrideMode && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          AI scores are advisory only. Final decisions are fully manual for this role.
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Job:</label>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={selectedJob} onChange={(e) => setSelectedJob(e.target.value)}>
          <option value="">Select a job</option>
          {jobs?.data.map((job) => <option key={job._id} value={job._id}>{job.title}</option>)}
        </select>
      </div>

      {!selectedJob ? (
        <p className="text-sm text-muted-foreground">Select a job to begin.</p>
      ) : isLoading ? <LoadingSpinner />
      : !decisionApps.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No decision-stage candidates yet.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {decisionApps.map((app) => {
            const currentIntent = pendingDecision[app._id]
            const note = notes[app._id] ?? ''
            const canConfirm = note.trim().length >= 10

            return (
              <Card key={app._id} className="border-emerald-200">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                      {getInitials(app.candidate)}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{getName(app.candidate)}</p>
                      <p className="text-xs text-muted-foreground">{getEmail(app.candidate)}</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{app.stage}</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Resume', value: app.scores?.resume ?? 0 },
                      { label: 'Assessment', value: app.scores?.assessment ?? 0 },
                      { label: 'Interview', value: app.scores?.interview ?? 0 },
                      { label: 'Composite', value: app.scores?.final ?? 0 },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-lg border bg-muted/20 px-3 py-3">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className={cn('mt-1 text-lg font-bold', scoreBg(value).split(' ').find((part) => part.startsWith('text-')))}>{value.toFixed(0)}%</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setPendingDecision((prev) => ({ ...prev, [app._id]: 'hire' }))}>
                      <CheckCircle2 className="h-4 w-4" /> {isOverrideMode ? 'Manual: Hire' : 'Hire'}
                    </Button>
                    <Button size="sm" variant="outline" className="border-amber-200 text-amber-600" onClick={() => setPendingDecision((prev) => ({ ...prev, [app._id]: 'hold' }))}>
                      <Clock className="h-4 w-4" /> {isOverrideMode ? 'Manual: Hold' : 'Hold'}
                    </Button>
                    <Button size="sm" variant="outline" className="border-destructive/20 text-destructive" onClick={() => setPendingDecision((prev) => ({ ...prev, [app._id]: 'reject' }))}>
                      <XCircle className="h-4 w-4" /> {isOverrideMode ? 'Manual: Reject' : 'Reject'}
                    </Button>
                  </div>

                  {currentIntent && (
                    <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
                      <Label>Override note</Label>
                      <textarea
                        rows={3}
                        className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="Add a decision note before confirming."
                        value={note}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [app._id]: e.target.value }))}
                      />
                      {!canConfirm && note.length > 0 && <p className="text-[11px] text-destructive">Please provide at least 10 characters before confirming.</p>}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => decideMutation.mutate({ id: app._id, decision: currentIntent })} disabled={decideMutation.isPending || !canConfirm}>
                          {decideMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Confirm {currentIntent}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setPendingDecision((prev) => ({ ...prev, [app._id]: null }))}>Cancel</Button>
                      </div>
                    </div>
                  )}

                  {successState[app._id] && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      {successState[app._id]}
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
