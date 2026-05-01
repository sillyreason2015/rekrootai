import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Users, ArrowRight } from 'lucide-react'
import { jobService } from '../../services/job.service'
import { applicationService } from '../../services/application.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import type { Application, Job, Candidate, User } from '../../types'

export default function AdminCandidates() {
  const [selectedJob, setSelectedJob] = useState('')
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['admin-candidate-jobs'],
    queryFn: () => jobService.myJobs({ page: 1 }),
  })

  const effectiveJobId = selectedJob || jobs?.data?.[0]?._id || ''
  const { data: applications, isLoading: appsLoading } = useQuery({
    queryKey: ['admin-candidates', effectiveJobId],
    queryFn: () => applicationService.listForJob(effectiveJobId),
    enabled: !!effectiveJobId,
  })

  const appList = useMemo(() => (applications?.data ?? []) as Application[], [applications?.data])
  const stats = useMemo(() => ({
    total: appList.length,
    screened: appList.filter((a) => a.stage === 'screening').length,
    interview: appList.filter((a) => a.stage === 'interview').length,
    decided: appList.filter((a) => a.stage === 'decision' || a.stage === 'offered' || a.stage === 'rejected').length,
  }), [appList])

  if (jobsLoading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Company Candidates</h1>
        <p className="text-sm text-muted-foreground">Track all candidate progress for your company jobs.</p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Job:</label>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={effectiveJobId}
          onChange={(e) => setSelectedJob(e.target.value)}
        >
          {(jobs?.data ?? []).map((j: Job) => (
            <option key={j._id} value={j._id}>{j.title}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ['Total', stats.total],
          ['Screening', stats.screened],
          ['Interview', stats.interview],
          ['Decided', stats.decided],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{Number(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {appsLoading ? <LoadingSpinner /> : (
        <Card>
          <CardHeader><CardTitle>Candidates ({stats.total})</CardTitle></CardHeader>
          <CardContent>
            {!appList.length ? (
              <div className="py-10 text-center text-muted-foreground">
                <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
                No candidates yet for this job.
              </div>
            ) : (
              <div className="divide-y">
                {appList.map((app) => {
                  const c = app.candidate as Candidate
                  const u = typeof c?.user === 'object' ? (c.user as User) : null
                  return (
                    <div key={app._id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium">{u ? `${u.firstName} ${u.lastName}` : 'Candidate'}</p>
                        <p className="text-xs text-muted-foreground">{u?.email ?? '-'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="capitalize">{app.stage}</Badge>
                        <Link to={`/recruiter/shortlist?job=${effectiveJobId}`} className="text-sm text-primary hover:underline">
                          Review <ArrowRight className="inline h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
