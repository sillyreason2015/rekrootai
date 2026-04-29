import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Briefcase, ClipboardList, Video, TrendingUp, ChevronRight } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { candidateService } from '../../services/candidate.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatRelative, scoreBg } from '../../lib/utils'
import type { Application } from '../../types'

export default function CandidateDashboard() {
  const { user } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['candidate-dashboard'],
    queryFn: candidateService.getDashboard,
  })

  if (isLoading) return <LoadingSpinner />

  const stats = [
    { label: 'Applications', value: data?.applications ?? 0, icon: Briefcase, href: '/candidate/applications' },
    { label: 'Assessments Pending', value: data?.assessmentsPending ?? 0, icon: ClipboardList, href: '/candidate/applications' },
    { label: 'Interviews Scheduled', value: data?.interviewsScheduled ?? 0, icon: Video, href: '/candidate/applications' },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'},{' '}
          {user?.firstName} 👋
        </h1>
        <p className="text-sm text-muted-foreground">Here's what's happening with your applications.</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
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

      {/* Recent applications */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Recent Applications</CardTitle>
          <Link to="/candidate/applications" className="flex items-center gap-1 text-xs text-primary hover:underline">
            View all <ChevronRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {!data?.recentApplications?.length ? (
            <div className="py-8 text-center text-muted-foreground">
              <Briefcase className="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">No applications yet.</p>
              <Link to="/candidate/jobs" className="mt-2 inline-block text-xs text-primary hover:underline">
                Browse open roles →
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {(data.recentApplications as Application[]).map((app) => (
                <div key={app._id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {typeof app.job === 'object' ? app.job.title : 'Job'}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatRelative(app.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {app.scores?.final !== undefined && (
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreBg(app.scores.final)}`}>
                        {app.scores.final.toFixed(0)}%
                      </span>
                    )}
                    <Badge variant={
                      app.stage === 'rejected' ? 'destructive'
                        : app.stage === 'offered' ? 'success'
                        : 'secondary'
                    }>
                      {app.stage}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick action */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center justify-between p-5">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Find your next opportunity</p>
              <p className="text-xs text-muted-foreground">Browse roles matched to your profile.</p>
            </div>
          </div>
          <Link to="/candidate/jobs">
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Browse Jobs
            </button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
