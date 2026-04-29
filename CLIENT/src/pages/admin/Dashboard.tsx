import { useQuery } from '@tanstack/react-query'
import { Users, Briefcase, FileText, ShieldCheck, TrendingUp } from 'lucide-react'
import { adminService } from '../../services/admin.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatRelative } from '../../lib/utils'

export default function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: adminService.getDashboard,
  })

  if (isLoading) return <LoadingSpinner />

  const stats = [
    { label: 'Total Users', value: data?.totalUsers ?? 0, icon: Users },
    { label: 'Jobs Posted', value: data?.totalJobs ?? 0, icon: Briefcase },
    { label: 'Applications', value: data?.totalApplications ?? 0, icon: FileText },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">Platform-wide overview and compliance controls.</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline overview */}
      {data?.pipelineStats && (
        <Card>
          <CardHeader><CardTitle>Pipeline Overview</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Object.entries(data.pipelineStats as Record<string, number>).map(([stage, count]) => (
                <div key={stage} className="rounded-xl bg-muted/40 p-4 text-center">
                  <p className="text-xl font-bold">{count}</p>
                  <p className="mt-0.5 text-xs capitalize text-muted-foreground">{stage}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent activity */}
      {data?.recentActivity && (
        <Card>
          <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
          <CardContent>
            <div className="divide-y">
              {(data.recentActivity as Array<{ action: string; user: string; createdAt: string; resource: string }>).slice(0, 8).map((entry, i) => (
                <div key={i} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize">{entry.action?.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">{entry.user} · {entry.resource}</p>
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0 ml-4">{formatRelative(entry.createdAt)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compliance notice */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-3 p-5">
          <ShieldCheck className="h-6 w-6 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">NDPR/GDPR Compliance Active</p>
            <p className="text-xs text-muted-foreground">
              All AI decisions are logged. Protected attributes anonymised before ranking. Human override mandatory at decision stage.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
