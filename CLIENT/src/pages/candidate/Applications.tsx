import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileText, ExternalLink } from 'lucide-react'
import { applicationService } from '../../services/application.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatRelative, scoreBg } from '../../lib/utils'
import type { Application, Job } from '../../types'

const stageColor: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
  applied: 'secondary',
  screening: 'secondary',
  assessment: 'warning',
  interview: 'warning',
  decision: 'default',
  offered: 'success',
  rejected: 'destructive',
}

export default function Applications() {
  const { data: applications, isLoading } = useQuery({
    queryKey: ['my-applications'],
    queryFn: applicationService.myApplications,
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">My Applications</h1>
        <p className="text-sm text-muted-foreground">{applications?.length ?? 0} total applications</p>
      </div>

      {!applications?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No applications yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Browse the job board to find opportunities.</p>
            <Link to="/candidate/jobs" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
              Browse Jobs
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {applications.map((app: Application) => {
            const job = app.job as Job
            return (
              <Card key={app._id} className="hover:border-primary/30 transition-colors">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{typeof job === 'object' ? job.title : 'Job'}</h3>
                      <Badge variant={stageColor[app.stage] ?? 'secondary'} className="capitalize shrink-0">
                        {app.stage}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Applied {formatRelative(app.createdAt)}
                    </p>
                    {app.stage === 'assessment' && (
                      <Link
                        to={`/candidate/assessment/${app._id}`}
                        className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                      >
                        Complete Assessment <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                    {app.stage === 'interview' && (
                      <Link
                        to={`/candidate/interview/${app._id}`}
                        className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                      >
                        Join Interview Room <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {app.scores?.final !== undefined && (
                      <div className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${scoreBg(app.scores.final)}`}>
                        {app.scores.final.toFixed(0)}%
                      </div>
                    )}
                    {app.stage === 'decision' && (
                      <Link
                        to={`/candidate/explanation/${app._id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        View explanation
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
