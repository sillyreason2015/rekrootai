import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Briefcase, Globe, Lock } from 'lucide-react'
import { jobService } from '../../services/job.service'
import { Card, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatRelative } from '../../lib/utils'
import type { Job } from '../../types'

export default function RecruiterJobs() {
  const [status, setStatus] = useState<string>('all')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['my-jobs', status],
    queryFn: () => jobService.myJobs({ status: status === 'all' ? undefined : status }),
  })

  const closeMutation = useMutation({
    mutationFn: (id: string) => jobService.close(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-jobs'] }),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">My Jobs</h1>
          <p className="text-sm text-muted-foreground">{data?.total ?? 0} total roles</p>
        </div>
        <Button asChild>
          <Link to="/recruiter/jobs/create"><Plus className="h-4 w-4" /> Post Job</Link>
        </Button>
      </div>

      <div className="flex gap-2">
        {['all', 'draft', 'published', 'closed'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1 text-sm capitalize transition-colors ${status === s ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingSpinner /> : !data?.data.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Briefcase className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No jobs yet</p>
            <Button asChild className="mt-4">
              <Link to="/recruiter/jobs/create">Post your first job</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.data.map((job: Job) => (
            <Card key={job._id} className="hover:border-primary/30 transition-colors">
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium truncate">{job.title}</h3>
                    <Badge variant={job.status === 'published' ? 'success' : job.status === 'closed' ? 'destructive' : 'secondary'}>
                      {job.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {job.department} · {job.location} · {job.remote} · Posted {formatRelative(job.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to={`/recruiter/shortlist?job=${job._id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    View applicants
                  </Link>
                  {job.status === 'published' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => closeMutation.mutate(job._id)}
                    >
                      <Lock className="h-3.5 w-3.5" /> Close
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
