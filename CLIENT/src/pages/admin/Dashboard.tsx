import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users, Briefcase, FileText, Building2, Sparkles, TrendingUp, AlertTriangle, ArrowRight } from 'lucide-react'
import InfoTip from '../../components/shared/InfoTip'
import { Link } from 'react-router-dom'
import { adminService } from '../../services/admin.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import AiBadge from '../../components/shared/AiBadge'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatRelative } from '../../lib/utils'

type Activity = { action?: string; user?: string; createdAt?: string; resource?: string }

export default function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: adminService.getDashboard,
    retry: 0,
  })
  const { data: audits } = useQuery({ queryKey: ['admin-bias-audits-lite'], queryFn: adminService.getBiasAudits })
  const { data: qInsights } = useQuery({ queryKey: ['admin-question-insights'], queryFn: adminService.getQuestionInsights })
  const { data: funnelData } = useQuery({ queryKey: ['admin-funnel'], queryFn: adminService.getFunnel, retry: false })

  if (isLoading) return <LoadingSpinner />

  const pipelineStats =
    data?.pipelineStats && typeof data.pipelineStats === 'object'
      ? (data.pipelineStats as Record<string, number>)
      : {}
  const recentActivity: Activity[] = Array.isArray(data?.recentActivity) ? (data?.recentActivity as Activity[]) : []

  // Build AI pipeline insights from stats
  const appliedCount = Number(pipelineStats['applied'] ?? 0)
  const assessmentCount = Number(pipelineStats['assessment'] ?? 0)
  const interviewCount = Number(pipelineStats['interview'] ?? 0)
  const decisionCount = Number(pipelineStats['decision'] ?? 0)
  const totalActive = appliedCount + assessmentCount + interviewCount + decisionCount

  const aiInsights: { icon: React.ElementType; color: string; label: string; text: string }[] = []

  if (appliedCount > 10) aiInsights.push({
    icon: TrendingUp, color: 'text-amber-600', label: 'High application volume',
    text: `${appliedCount} applications are waiting to be reviewed. Consider shortlisting in batches to reduce time-to-hire.`,
  })
  if (assessmentCount > 0) aiInsights.push({
    icon: Sparkles, color: 'text-blue-600', label: 'Assessments pending fairness gate',
    text: `${assessmentCount} candidate(s) have completed assessments but haven't been put through the fairness gate yet. Run fairness checks on the Shortlist page.`,
  })
  if (interviewCount > 0) aiInsights.push({
    icon: TrendingUp, color: 'text-purple-600', label: 'Interviews in progress',
    text: `${interviewCount} candidate(s) are at interview stage. Ensure interviewers have completed their evaluation rubrics.`,
  })
  if (decisionCount > 0) aiInsights.push({
    icon: AlertTriangle, color: 'text-emerald-600', label: 'Decisions awaiting',
    text: `${decisionCount} candidate(s) are ready for a final Hire / Hold / Reject decision on the Final Selection page.`,
  })
  if (totalActive === 0) aiInsights.push({
    icon: Sparkles, color: 'text-muted-foreground', label: 'Pipeline is clear',
    text: 'No candidates currently require action. Post a new role or review closed applications.',
  })

  const stats = [
    { label: data?.scope === 'platform' ? 'Total Users' : 'Team Members', value: Number(data?.totalUsers ?? 0), icon: Users, tip: 'All active user accounts in this company, including recruiters, admins, and candidates.' },
    { label: data?.scope === 'platform' ? 'Total Jobs' : 'Company Jobs', value: Number(data?.totalJobs ?? 0), icon: Briefcase, tip: 'All jobs posted by this company, including drafts, published, and closed roles.' },
    { label: data?.scope === 'platform' ? 'Total Applications' : 'Company Applications', value: Number(data?.totalApplications ?? 0), icon: FileText, tip: 'Total candidate applications across all jobs. Includes every pipeline stage from Applied through to Decision.' },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Company Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">Manage your team, jobs, and candidate pipeline.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, tip }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold">{Number.isFinite(value) ? value.toLocaleString() : '0'}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  {label}
                  <InfoTip content={tip} />
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI Pipeline Insights */}
      {aiInsights.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle>AI Pipeline Insights</CardTitle>
              <AiBadge size="sm" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {aiInsights.map((ins, i) => {
              const Icon = ins.icon
              return (
                <div key={i} className="flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5">
                  <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${ins.color}`} />
                  <div>
                    <p className={`text-[11px] font-semibold uppercase tracking-wide ${ins.color}`}>{ins.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{ins.text}</p>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {Object.keys(pipelineStats).length > 0 && (
        <Card>
          <CardHeader><CardTitle>Pipeline Overview</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Object.entries(pipelineStats).map(([stage, count]) => (
                <div key={stage} className="rounded-xl bg-muted/40 p-4 text-center">
                  <p className="text-xl font-bold">{Number(count) || 0}</p>
                  <p className="mt-0.5 text-xs capitalize text-muted-foreground">{stage}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Fairness & Question Quality</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Recent bias audits: {Array.isArray(audits) ? audits.length : 0}</p>
          {Array.isArray(qInsights?.insights) && qInsights.insights.slice(0, 2).map((i: any) => (
            <p key={i.metric} className="text-muted-foreground">{i.metric}: {i.value} - {i.hint}</p>
          ))}
          <Link to="/admin/bias-audit" className="text-primary hover:underline">Open Bias Audit</Link>
        </CardContent>
      </Card>

      {recentActivity.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
          <CardContent>
            <div className="divide-y">
              {recentActivity.slice(0, 8).map((entry, i) => (
                <div key={i} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize">{(entry.action ?? 'activity').replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">{entry.user ?? 'system'} | {entry.resource ?? 'event'}</p>
                  </div>
                  <p className="ml-4 shrink-0 text-xs text-muted-foreground">
                    {entry.createdAt ? formatRelative(entry.createdAt) : '-'}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hiring Funnel */}
      {funnelData && funnelData.funnel.some((f) => f.count > 0) && (
        <Card>
          <CardHeader><CardTitle>Hiring Funnel</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">{funnelData.total} total applications · conversion rate at each stage</p>
            {funnelData.funnel.filter((f) => f.count > 0 || f.stage === 'applied').map((f, i, arr) => (
              <div key={f.stage} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-xs capitalize text-muted-foreground">{f.stage}</div>
                <div className="flex-1 h-6 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: funnelData.total > 0 ? `${Math.round((f.count / funnelData.total) * 100)}%` : '0%' }}
                  />
                </div>
                <div className="w-10 text-right text-sm font-bold">{f.count}</div>
                {i > 0 && arr[i - 1].count > 0 && (
                  <div className="w-12 text-right text-xs text-muted-foreground">{f.conversionRate}%</div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recruiter Performance */}
      {funnelData?.performance && funnelData.performance.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Recruiter Performance</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Recruiter</th>
                    <th className="pb-2 text-right font-medium">Pipeline</th>
                    <th className="pb-2 text-right font-medium">Shortlisted</th>
                    <th className="pb-2 text-right font-medium">Rejected</th>
                    <th className="pb-2 text-right font-medium">Avg Score</th>
                    <th className="pb-2 text-right font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {funnelData.performance.map((r) => (
                    <tr key={r.recruiterId ?? r.name}>
                      <td className="py-2.5 font-medium">{r.name}</td>
                      <td className="py-2.5 text-right">{r.total}</td>
                      <td className="py-2.5 text-right text-emerald-600 font-medium">{r.shortlisted}</td>
                      <td className="py-2.5 text-right text-red-500">{r.rejected}</td>
                      <td className="py-2.5 text-right">{r.avgScore != null ? `${r.avgScore}%` : '—'}</td>
                      <td className="py-2.5 text-right text-muted-foreground">
                        {r.total > 0 ? `${Math.round((r.shortlisted / r.total) * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-3 p-5">
          <Building2 className="h-6 w-6 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">Company Management</p>
            <p className="text-xs text-muted-foreground">
              Update your company profile, billing, and team permissions from this admin workspace.
            </p>
            <div className="mt-2 flex gap-3 text-xs">
              <Link to="/admin/team" className="text-primary hover:underline">Manage Team</Link>
              <Link to="/admin/candidates" className="text-primary hover:underline">View Candidates</Link>
              <Link to="/settings" className="text-primary hover:underline">Company Settings</Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
