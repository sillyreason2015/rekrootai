import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Shield, Ban, CheckCircle2, AlertTriangle } from 'lucide-react'
import { applicationService } from '../../services/application.service'
import { jobService } from '../../services/job.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import AiBadge from '../../components/shared/AiBadge'
import { scoreBg, cn } from '../../lib/utils'
import type { Application, Candidate, User } from '../../types'

type Mode = 'Assist' | 'Veto' | 'Override'

export default function Shortlist() {
  const [params] = useSearchParams()
  const jobId = params.get('job') ?? ''
  const [mode, setMode] = useState<Mode>('Assist')
  const [expanded, setExpanded] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: jobs } = useQuery({ queryKey: ['my-jobs'], queryFn: () => jobService.myJobs() })
  const [selectedJob, setSelectedJob] = useState(jobId)

  const { data, isLoading } = useQuery({
    queryKey: ['applications', selectedJob],
    queryFn: () => applicationService.listForJob(selectedJob),
    enabled: !!selectedJob,
  })

  const shortlistMutation = useMutation({
    mutationFn: (id: string) => applicationService.shortlist(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications', selectedJob] }),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => applicationService.reject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications', selectedJob] }),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Shortlist Review</h1>
          <p className="text-sm text-muted-foreground">AI-ranked candidates with SHAP explanations.</p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl border bg-card p-1">
          {(['Assist', 'Veto', 'Override'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'Assist' && <CheckCircle2 className="h-3.5 w-3.5" />}
              {m === 'Veto' && <Ban className="h-3.5 w-3.5" />}
              {m === 'Override' && <Shield className="h-3.5 w-3.5" />}
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Mode description */}
      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        {mode === 'Assist' && 'AI assists — recommendations shown but you approve each decision.'}
        {mode === 'Veto' && 'AI shortlists automatically. You can veto individual candidates.'}
        {mode === 'Override' && 'Full manual control. AI scores are advisory only.'}
      </div>

      {/* Job selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Job:</label>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={selectedJob}
          onChange={(e) => setSelectedJob(e.target.value)}
        >
          <option value="">Select a job</option>
          {jobs?.data.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)}
        </select>
      </div>

      {!selectedJob ? (
        <p className="text-sm text-muted-foreground">Select a job to view applications.</p>
      ) : isLoading ? (
        <LoadingSpinner />
      ) : !data?.data.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No applications yet for this role.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {data.data
            .sort((a: Application, b: Application) => (b.scores?.final ?? 0) - (a.scores?.final ?? 0))
            .map((app: Application) => {
              const candidate = app.candidate as Candidate
              const user = typeof candidate?.user === 'object' ? candidate.user as User : null
              const isExpand = expanded === app._id

              return (
                <Card key={app._id} className={cn('transition-all', app.status === 'shortlisted' ? 'border-emerald-200' : '')}>
                  <CardContent className="p-0">
                    {/* Row */}
                    <div className="flex items-center gap-4 p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary shrink-0">
                        {user ? `${user.firstName[0]}${user.lastName[0]}` : '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{user ? `${user.firstName} ${user.lastName}` : 'Candidate'}</p>
                        <p className="text-xs text-muted-foreground capitalize">{app.stage}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {app.scores?.final !== undefined && (
                          <div className={`rounded-full border px-3 py-1 text-sm font-bold ${scoreBg(app.scores.final)}`}>
                            {app.scores.final.toFixed(0)}%
                          </div>
                        )}
                        <AiBadge />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => shortlistMutation.mutate(app._id)}
                          disabled={app.status === 'shortlisted'}
                          className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => rejectMutation.mutate(app._id)}
                          className="text-destructive border-destructive/20 hover:bg-destructive/5"
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                        <button onClick={() => setExpanded(isExpand ? null : app._id)} className="p-1 text-muted-foreground">
                          {isExpand ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* SHAP expansion */}
                    {isExpand && (
                      <div className="border-t px-4 pb-4 pt-3 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <AiBadge label="SHAP Explanation" size="md" />
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {[
                            { label: 'Resume', value: app.scores?.resume },
                            { label: 'Assessment', value: app.scores?.assessment },
                            { label: 'Penalty', value: app.scores?.penalty },
                            { label: 'Interview', value: app.scores?.interview },
                          ].map(({ label, value }) => (
                            <div key={label} className="rounded-lg border bg-muted/30 p-3 text-center">
                              <p className="text-xs text-muted-foreground">{label}</p>
                              <p className={`mt-1 text-lg font-bold ${value !== undefined ? scoreBg(value).split(' ')[1] : ''}`}>
                                {value !== undefined ? value.toFixed(0) : '—'}
                              </p>
                            </div>
                          ))}
                        </div>
                        {app.scores?.final !== undefined && (
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                            <p className="text-xs text-muted-foreground">
                              Final score is a weighted composite. Human review required before any hiring decision.
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
