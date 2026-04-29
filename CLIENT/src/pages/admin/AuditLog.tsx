import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Download } from 'lucide-react'
import { adminService } from '../../services/admin.service'
import { Card, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatDate } from '../../lib/utils'

const ACTION_COLORS: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  login: 'secondary',
  register: 'secondary',
  apply: 'default',
  shortlist: 'success',
  reject: 'destructive',
  hire: 'success',
  decision_override: 'warning',
  bias_audit_run: 'warning',
  email_sent: 'secondary',
}

export default function AuditLog() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', page, action],
    queryFn: () => adminService.getAuditLog({ page, limit: 25, action: action || undefined }),
  })

  const entries: Array<{ _id: string; action: string; user: { firstName: string; lastName: string; email: string }; resource: string; resourceId: string; createdAt: string; metadata: Record<string, unknown> }> =
    (data as { data?: unknown[] })?.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Audit Log</h1>
          <p className="text-sm text-muted-foreground">Complete record of all platform actions.</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Filter by action..." value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} />
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-left">Action</th>
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-left">Resource</th>
                    <th className="px-4 py-3 text-left">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.map((entry) => (
                    <tr key={entry._id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <Badge variant={ACTION_COLORS[entry.action] ?? 'secondary'} className="capitalize">
                          {entry.action?.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{entry.user?.firstName} {entry.user?.lastName}</p>
                        <p className="text-xs text-muted-foreground">{entry.user?.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="capitalize">{entry.resource}</p>
                        <p className="text-xs text-muted-foreground font-mono">{entry.resourceId?.slice(-8)}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(entry.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!entries.length && (
                <p className="py-8 text-center text-muted-foreground">No audit entries found.</p>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          <div className="flex justify-center gap-2">
            <button className="rounded border px-3 py-1 text-sm disabled:opacity-40" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span className="px-2 py-1 text-sm">Page {page}</span>
            <button className="rounded border px-3 py-1 text-sm disabled:opacity-40" disabled={entries.length < 25} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  )
}
