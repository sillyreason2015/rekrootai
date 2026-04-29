import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Briefcase, Users, Video, TrendingUp, Plus, ChevronRight } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { jobService } from '../../services/job.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatRelative } from '../../lib/utils'
import type { Job } from '../../types'

export default function RecruiterDashboard() {
  const { user } = useAuth()
  const { data: jobs, isLoading } = useQuery({
    queryKey: ['my-jobs'],
    queryFn: () => jobService.myJobs({ limit: 5 } as Parameters<typeof jobService.myJobs>[0]),
  })

  if (isLoading) return <LoadingSpinner />

  const published = jobs?.data.filter((j: Job) => j.status === 'published').length ?? 0

  const stats = [
    { label: 'Active Jobs', value: published, icon: Briefcase, href: '/recruiter/jobs' },
    { label: 'Total Roles', value: jobs?.total ?? 0, icon: TrendingUp, href: '/recruiter/jobs' },
    { label: 'Shortlist Reviews', value: '—', icon: Users, href: '/recruiter/shortlist' },
    { label: 'Interviews Today', value: '—', icon: Video, href: '/recruiter/interviews' },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {user?.firstName}. Here's your recruitment overview.
          </p>
        </div>
        <Link
          to="/recruiter/jobs/create"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Post a Job
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} to={href}>
            <Card className="hover:border-primary/30 hover:shadow-md transition-all">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Pipeline status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle>My Jobs</CardTitle>
          <Link to="/recruiter/jobs" className="flex items-center gap-1 text-xs text-primary hover:underline">
            Manage all <ChevronRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {!jobs?.data.length ? (
            <div className="py-10 text-center text-muted-foreground">
              <Briefcase className="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">No jobs posted yet.</p>
              <Link to="/recruiter/jobs/create" className="mt-2 inline-block text-xs text-primary hover:underline">
                Create your first job →
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {jobs.data.map((job: Job) => (
                <div key={job._id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{job.title}</p>
                    <p className="text-xs text-muted-foreground">{job.department} · Posted {formatRelative(job.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <Badge variant={job.status === 'published' ? 'success' : job.status === 'closed' ? 'destructive' : 'secondary'}>
                      {job.status}
                    </Badge>
                    <Link
                      to={`/recruiter/shortlist?job=${job._id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Review
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
