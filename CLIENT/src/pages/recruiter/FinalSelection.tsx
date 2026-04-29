import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'
import { applicationService } from '../../services/application.service'
import { jobService } from '../../services/job.service'
import { Card, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import AiBadge from '../../components/shared/AiBadge'
import { scoreBg } from '../../lib/utils'
import type { Application, Candidate, User } from '../../types'

export default function FinalSelection() {
  const [params] = useSearchParams()
  const [selectedJob, setSelectedJob] = useState(params.get('job') ?? '')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const qc = useQueryClient()

  const { data: jobs } = useQuery({ queryKey: ['my-jobs'], queryFn: () => jobService.myJobs() })
  const { data, isLoading } = useQuery({
    queryKey: ['final-apps', selectedJob],
    queryFn: () => applicationService.listForJob(selectedJob, { stage: 'decision' }),
    enabled: !!selectedJob,
  })

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'hire' | 'reject' | 'hold' }) =>
      applicationService.makeDecision(id, decision, notes[id]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['final-apps', selectedJob] }),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Final Selection</h1>
          <p className="text-sm text-muted-foreground">Make hiring decisions. All decisions are audited.</p>
        </div>
        <AiBadge label="Human Override Required" size="md" />
      </div>

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
        <p className="text-sm text-muted-foreground">Select a job to begin.</p>
      ) : isLoading ? (
        <LoadingSpinner />
      ) : !data?.data.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No candidates at decision stage.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {data.data.map((app: Application) => {
            const candidate = app.candidate as Candidate
            const user = typeof candidate?.user === 'object' ? candidate.user as User : null
            const decided = !!app.decision

            return (
              <Card key={app._id} className={decided ? 'opacity-60' : ''}>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                      {user ? `${user.firstName[0]}${user.lastName[0]}` : '?'}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{user ? `${user.firstName} ${user.lastName}` : 'Candidate'}</p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                      {app.scores?.final !== undefined && (
                        <div className={`mt-1.5 inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${scoreBg(app.scores.final)}`}>
                          AI Score: {app.scores.final.toFixed(0)}%
                        </div>
                      )}
                    </div>
                    {decided && (
                      <div className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize
                        ${app.decision === 'hire' ? 'bg-emerald-50 text-emerald-700' : app.decision === 'reject' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                        {app.decision === 'hire' && <CheckCircle2 className="mr-1.5 inline h-4 w-4" />}
                        {app.decision === 'reject' && <XCircle className="mr-1.5 inline h-4 w-4" />}
                        {app.decision === 'hold' && <Clock className="mr-1.5 inline h-4 w-4" />}
                        {app.decision}
                      </div>
                    )}
                  </div>

                  {!decided && (
                    <>
                      <textarea
                        rows={2}
                        className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="Add decision notes (optional, will be included in candidate feedback)..."
                        value={notes[app._id] ?? ''}
                        onChange={(e) => setNotes((p) => ({ ...p, [app._id]: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => decideMutation.mutate({ id: app._id, decision: 'hire' })}
                          disabled={decideMutation.isPending}
                        >
                          {decideMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                          <CheckCircle2 className="h-4 w-4" /> Hire
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-amber-600 border-amber-200"
                          onClick={() => decideMutation.mutate({ id: app._id, decision: 'hold' })}
                          disabled={decideMutation.isPending}
                        >
                          <Clock className="h-4 w-4" /> Hold
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/20"
                          onClick={() => decideMutation.mutate({ id: app._id, decision: 'reject' })}
                          disabled={decideMutation.isPending}
                        >
                          <XCircle className="h-4 w-4" /> Reject
                        </Button>
                      </div>
                    </>
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
