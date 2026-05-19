import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Download, ChevronDown, ChevronUp } from 'lucide-react'
import { adminService } from '../../services/admin.service'
import { Card, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatDate, cn } from '../../lib/utils'

const ACTION_COLORS: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  login: 'secondary',
  register: 'secondary',
  apply: 'default',
  applied: 'default',
  shortlist: 'success',
  shortlisted: 'success',
  'screening-passed': 'success',
  hire: 'success',
  hired: 'success',
  'assessment-completed': 'success',
  'interview-completed': 'success',
  reject: 'destructive',
  rejected: 'destructive',
  'screening-failed': 'destructive',
  decision_override: 'warning',
  'decision-override': 'warning',
  bias_audit_run: 'warning',
  'bias-audit-run': 'warning',
  email_sent: 'secondary',
  'email-sent': 'secondary',
}

type Entry = {
  _id: string
  action: string
  narrative?: string
  actor?: string
  mode?: string
  user: { firstName?: string; lastName?: string; email?: string }
  resource?: string
  resourceId?: string
  createdAt?: string
  metadata?: Record<string, unknown>
}

function actorBadge(actor?: string, mode?: string) {
  if (actor === 'ai') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 text-xs font-medium">
      🤖 AI{mode ? ` · ${mode}` : ''}
    </span>
  )
  if (actor === 'user') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 text-xs font-medium">
      👤 User{mode ? ` · ${mode}` : ''}
    </span>
  )
  return null
}

export default function AuditLog() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', page, action],
    queryFn: () => adminService.getAuditLog({ page, limit: 25, action: action || undefined }),
  })

  const entries = ((data as { data?: Entry[] })?.data ?? []) as Entry[]

  async function exportCsv() {
    // Hit the server-side export endpoint — returns full CSV (up to 5000 rows, scoped to company)
    const { default: api } = await import('../../lib/axios')
    const resp = await api.get('/admin/audit-log/export', { responseType: 'blob' })
    const url = URL.createObjectURL(resp.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Audit Log</h1>
          <p className="text-sm text-muted-foreground">Plain-English record of every action on the platform — AI and human.</p>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Filter by action (e.g. shortlist, reject, interview)…" value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} />
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <>
          <Card>
            <CardContent className="p-0">
              {!entries.length ? (
                <p className="py-8 text-center text-muted-foreground">No audit entries found.</p>
              ) : (
                <div className="divide-y">
                  {entries.map((entry) => (
                    <div key={entry._id} className="px-5 py-4">
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={ACTION_COLORS[entry.action] ?? 'secondary'} className="capitalize">
                            {entry.action?.replace(/[-_]/g, ' ')}
                          </Badge>
                          {actorBadge(entry.actor, entry.mode)}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{entry.createdAt ? formatDate(entry.createdAt) : '—'}</span>
                      </div>

                      {/* Narrative */}
                      {entry.narrative ? (
                        <p className="mt-2 text-sm text-foreground leading-relaxed">{entry.narrative}</p>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground italic">No description available.</p>
                      )}

                      {/* Involved user */}
                      {(entry.user?.firstName || entry.user?.email) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          User involved: <span className="font-medium text-foreground">{[entry.user.firstName, entry.user.lastName].filter(Boolean).join(' ')}</span>
                          {entry.user.email && <span className="ml-1 font-mono">({entry.user.email})</span>}
                        </p>
                      )}

                      {/* Expandable technical row */}
                      <button
                        className={cn('mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors')}
                        onClick={() => setExpanded(expanded === entry._id ? null : entry._id)}
                      >
                        {expanded === entry._id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        Technical details
                      </button>
                      {expanded === entry._id && (
                        <div className="mt-2 rounded-lg bg-muted/40 px-4 py-3">
                          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                            <div className="flex gap-2 text-xs">
                              <dt className="text-muted-foreground shrink-0 min-w-[72px]">Resource:</dt>
                              <dd className="font-medium capitalize">{entry.resource ?? '—'}</dd>
                            </div>
                            <div className="flex gap-2 text-xs">
                              <dt className="text-muted-foreground shrink-0 min-w-[72px]">Ref:</dt>
                              <dd className="font-mono">…{entry.resourceId?.slice(-8) ?? '—'}</dd>
                            </div>
                            {entry.metadata && Object.entries(entry.metadata)
                              .filter(([, v]) => v !== undefined && v !== null && v !== '')
                              .map(([k, v]) => (
                                <div key={k} className="flex gap-2 text-xs">
                                  <dt className="text-muted-foreground shrink-0 min-w-[72px] capitalize">{k.replace(/[-_]/g, ' ')}:</dt>
                                  <dd className="font-medium truncate max-w-[200px]">{String(v)}</dd>
                                </div>
                              ))}
                          </dl>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

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
