import { useQuery } from '@tanstack/react-query'
import { Users, Briefcase, FileText, Building2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { adminService } from '../../services/admin.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatRelative } from '../../lib/utils'

type Activity = { action?: string; user?: string; createdAt?: string; resource?: string }

export default function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: adminService.getDashboard,
    retry: 0,
  })

  if (isLoading) return <LoadingSpinner />

  const pipelineStats =
    data?.pipelineStats && typeof data.pipelineStats === 'object'
      ? (data.pipelineStats as Record<string, number>)
      : {}
  const recentActivity: Activity[] = Array.isArray(data?.recentActivity) ? (data?.recentActivity as Activity[]) : []

  const stats = [
    { label: 'Total Users', value: Number(data?.totalUsers ?? 0), icon: Users },
    { label: 'Jobs Posted', value: Number(data?.totalJobs ?? 0), icon: Briefcase },
    { label: 'Applications', value: Number(data?.totalApplications ?? 0), icon: FileText },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Company Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">Manage your team, jobs, and candidate pipeline.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{Number.isFinite(value) ? value.toLocaleString() : '0'}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
