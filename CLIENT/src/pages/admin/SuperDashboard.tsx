import { useQuery } from '@tanstack/react-query'
import { adminService } from '../../services/admin.service'
import { Card, CardContent } from '../../components/ui/card'
import LoadingSpinner from '../../components/shared/LoadingSpinner'

export default function SuperDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['super-metrics'], queryFn: adminService.getSuperMetrics })
  if (isLoading) return <LoadingSpinner />
  const stats = [
    ['Users', data?.users ?? 0], ['Companies', data?.companies ?? 0], ['Verified Companies', data?.verifiedCompanies ?? 0],
    ['Jobs', data?.jobs ?? 0], ['Applications', data?.applications ?? 0], ['Interviews', data?.interviews ?? 0],
    ['Assessments', data?.assessments ?? 0], ['AI Outputs', data?.aiOutputs ?? 0],
  ]
  return <div className="space-y-6"><h1 className="font-serif text-2xl font-semibold">Platform Dashboard</h1><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([l, v]) => <Card key={String(l)}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-bold">{Number(v)}</p></CardContent></Card>)}</div></div>
}
