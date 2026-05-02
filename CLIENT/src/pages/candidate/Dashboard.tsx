import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Briefcase, ClipboardList, Video, TrendingUp, ChevronRight, Sparkles, MapPin, Clock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { candidateService } from '../../services/candidate.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatRelative, scoreBg, cn } from '../../lib/utils'
import type { Application } from '../../types'

function stageTone(stage: string): 'destructive' | 'success' | 'secondary' {
  if (stage === 'rejected') return 'destructive'
  if (stage === 'offered') return 'success'
  return 'secondary'
}

function stageMessage(stage: string): string {
  switch (stage) {
    case 'applied':
      return 'Application received. AI screening is next.'
    case 'screening':
      return 'AI screening in progress.'
    case 'assessment':
      return 'Assessment stage active. Complete pending modules.'
    case 'interview':
      return 'Interview stage active. Check your schedule.'
    case 'decision':
      return 'Final decision in progress.'
    case 'offered':
      return 'Offer extended. Check your inbox and dashboard.'
    case 'rejected':
      return 'Not selected at current stage. See explanation for details.'
    default:
      return 'Pipeline update available.'
  }
}

export default function CandidateDashboard() {
  const { user } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['candidate-dashboard'],
    queryFn: candidateService.getDashboard,
  })
  const { data: recData } = useQuery({
    queryKey: ['recommendations'],
    queryFn: candidateService.getRecommendations,
    staleTime: 5 * 60 * 1000,
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
      {data?.nextAction && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Next Action</p>
              <p className="text-sm font-medium">{data.nextAction.label} — {data.nextAction.jobTitle}</p>
              {data.nextAction.dueAt && (
                <p className="text-xs text-amber-800">Due {new Date(data.nextAction.dueAt).toLocaleString()}</p>
              )}
            </div>
            <Link to={data.nextAction.href} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Continue
            </Link>
          </CardContent>
        </Card>
      )}

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
                <div key={app._id}>
                  <div className="flex items-center justify-between py-3">
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
                      <Badge variant={stageTone(app.stage)}>
                        {app.stage}
                      </Badge>
                    </div>
                  </div>
                  <div className="pb-3 text-xs text-muted-foreground">{stageMessage(app.stage)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Recommendation Engine */}
      {recData && recData.recommendations.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle>Recommended for You</CardTitle>
            </div>
            <span className="text-xs text-muted-foreground">AI-matched to your skills &amp; experience</span>
          </CardHeader>
          <CardContent className="space-y-3">
            {recData.recommendations.slice(0, 5).map((rec) => (
              <Link key={rec._id} to={`/candidate/jobs/${rec._id}`}
                className="flex items-start justify-between gap-3 rounded-xl border p-3 hover:border-primary/40 hover:bg-accent/50 transition-all group">
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-semibold group-hover:text-primary transition-colors">{rec.title}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {rec.department && <span>{rec.department}</span>}
                    {rec.level && <span className="capitalize">{rec.level}</span>}
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{rec.location}</span>
                    <span className="flex items-center gap-1 capitalize"><Clock className="h-3 w-3" />{rec.remote}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {rec.reasons.map((r, i) => (
                      <span key={i} className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px]">{r}</span>
                    ))}
                  </div>
                </div>
                <div className={cn('shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold', scoreBg(rec.matchScore))}>
                  {rec.matchScore}%
                </div>
              </Link>
            ))}
            <Link to="/candidate/jobs" className="block text-center text-xs text-primary hover:underline pt-1">
              Browse all open roles →
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Quick action fallback if no recommendations */}
      {(!recData || recData.recommendations.length === 0) && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Find your next opportunity</p>
                <p className="text-xs text-muted-foreground">Complete your profile to get AI-matched job recommendations.</p>
              </div>
            </div>
            <Link to="/candidate/jobs">
              <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Browse Jobs
              </button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
