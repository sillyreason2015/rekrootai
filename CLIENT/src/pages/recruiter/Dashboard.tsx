import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Briefcase, Users, Video, TrendingUp, ChevronRight, Sparkles } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { jobService } from '../../services/job.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import AiBadge from '../../components/shared/AiBadge'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatRelative } from '../../lib/utils'
import type { Job } from '../../types'

export default function RecruiterDashboard() {
  const { user } = useAuth()
  const { data: jobs, isLoading } = useQuery({
    queryKey: ['my-jobs'],
    queryFn: () => jobService.myJobs({ page: 1 }),
  })
  if (isLoading) return <LoadingSpinner />
  const published = jobs?.data.filter((j: Job) => j.status === 'published').length ?? 0
  const stats = [
    { label: 'Active Jobs', value: published, icon: Briefcase, href: '/recruiter/jobs' },
    { label: 'Total Roles', value: jobs?.total ?? 0, icon: TrendingUp, href: '/recruiter/jobs' },
    { label: 'Shortlist Reviews', value: '-', icon: Users, href: '/recruiter/shortlist' },
    { label: 'Interviews Today', value: '-', icon: Video, href: '/recruiter/interviews' },
  ]
  const draftCount = jobs?.data.filter((j: Job) => j.status === 'draft').length ?? 0
  const closedCount = jobs?.data.filter((j: Job) => j.status === 'closed').length ?? 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome back, {user?.firstName}. Here is your recruitment overview.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} to={href}><Card><CardContent className="flex items-center gap-4 p-5"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10"><Icon className="h-5 w-5 text-primary" /></div><div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card></Link>
        ))}
      </div>
      {/* AI Suggestions */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle>AI Suggestions</CardTitle>
            <AiBadge size="sm" />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {draftCount > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5">
              <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Unpublished jobs</p>
                <p className="text-xs text-muted-foreground mt-0.5">You have {draftCount} draft job(s). Publish them so candidates can apply.</p>
              </div>
            </div>
          )}
          {published === 0 && draftCount === 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5">
              <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">No active jobs</p>
                <p className="text-xs text-muted-foreground mt-0.5">Create a job in My Jobs and set up your Question Bank before publishing.</p>
              </div>
            </div>
          )}
          {published > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5">
              <TrendingUp className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Pipeline active</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {published} active role(s) accepting applications. Go to <Link to="/recruiter/shortlist" className="text-primary hover:underline">Shortlist</Link> to advance candidates through the pipeline.
                </p>
              </div>
            </div>
          )}
          {closedCount > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5">
              <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Closed roles</p>
                <p className="text-xs text-muted-foreground mt-0.5">{closedCount} closed role(s). Verify all candidates have received a decision and feedback note.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle>My Jobs</CardTitle>
          <Link to="/recruiter/jobs" className="flex items-center gap-1 text-xs text-primary hover:underline">Manage all <ChevronRight className="h-3 w-3" /></Link>
        </CardHeader>
        <CardContent>
          {!jobs?.data.length ? (
            <div className="py-10 text-center text-muted-foreground"><Briefcase className="mx-auto mb-2 h-8 w-8 opacity-40" /><p className="text-sm">No jobs posted yet.</p><p className="mt-2 text-xs text-muted-foreground">Ask your company admin to create a new job.</p></div>
          ) : (
            <div className="divide-y">
              {jobs.data.map((job: Job) => (
                <div key={job._id} className="flex items-center justify-between py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{job.title}</p><p className="text-xs text-muted-foreground">{job.department} | Posted {formatRelative(job.createdAt)}</p></div><div className="ml-4 flex items-center gap-2 shrink-0"><Badge variant={job.status === 'published' ? 'success' : job.status === 'closed' ? 'destructive' : 'secondary'}>{job.status}</Badge><Link to={`/recruiter/shortlist?job=${job._id}`} className="text-xs text-primary hover:underline">Review</Link></div></div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
