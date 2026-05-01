import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { adminService } from '../../services/admin.service'
import { Card, CardContent } from '../../components/ui/card'
import LoadingSpinner from '../../components/shared/LoadingSpinner'

export default function SuperDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['super-metrics'], queryFn: adminService.getSuperMetrics })
  const { data: readiness } = useQuery({ queryKey: ['super-readiness'], queryFn: adminService.getSystemReadiness })
  if (isLoading) return <LoadingSpinner />
  const stats = [
    ['Users', data?.users ?? 0], ['Companies', data?.companies ?? 0], ['Verified Companies', data?.verifiedCompanies ?? 0],
    ['Jobs', data?.jobs ?? 0], ['Applications', data?.applications ?? 0], ['Interviews', data?.interviews ?? 0],
    ['Assessments', data?.assessments ?? 0], ['AI Outputs', data?.aiOutputs ?? 0],
  ]
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold">Platform Dashboard</h1>
      <div className="rounded-lg border bg-card px-4 py-3 text-sm">{readiness?.allGreen ? 'System readiness: OK' : 'System readiness: action needed'}</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/internal/super-admin/users" className="rounded-lg border bg-card px-4 py-3 text-sm hover:border-primary/40">Manage Users</Link>
        <Link to="/internal/super-admin/companies" className="rounded-lg border bg-card px-4 py-3 text-sm hover:border-primary/40">Verify Companies</Link>
        <Link to="/internal/super-admin/audit-log" className="rounded-lg border bg-card px-4 py-3 text-sm hover:border-primary/40">Global Audit Log</Link>
        <Link to="/internal/super-admin/settings" className="rounded-lg border bg-card px-4 py-3 text-sm hover:border-primary/40">Platform Settings</Link>
      </div>
      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          <p className="font-medium">Defense Readiness Checklist</p>
          <p>1. Candidate can apply from public board.</p>
          <p>2. Recruiter/Admin can run shortlist to assessment, fairness, and interview.</p>
          <p>3. Candidate receives immediate explanations + notifications at each stage.</p>
          <p>4. Final decision writes AI explanation and correspondence can be sent.</p>
          <p>5. Super admin can review users, companies, and readiness status.</p>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([l, v]) => (
          <Card key={String(l)}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{l}</p>
              <p className="text-2xl font-bold">{Number(v)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
