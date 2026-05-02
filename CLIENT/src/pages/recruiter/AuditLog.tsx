import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { recruiterService } from '../../services/recruiter.service'
import { Card, CardContent } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatDate, cn } from '../../lib/utils'

type Entry = {
  _id: string
  action: string
  actor?: string
  mode?: string
  timestamp?: string
  createdAt?: string
  candidateId?: string
  jobId?: string
  payload?: Record<string, unknown>
}

function actionColor(action: string) {
  if (action.includes('reject')) return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400'
  if (action.includes('shortlist') || action.includes('hire')) return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400'
  if (action.includes('assessment')) return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400'
  if (action.includes('interview')) return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400'
  if (action.includes('fairness') || action.includes('bias')) return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400'
  return 'bg-muted text-muted-foreground'
}

function PayloadDetail({ entry }: { entry: Entry }) {
  const p = entry.payload ?? {}
  const items: { label: string; value: string }[] = []
  if (entry.mode) items.push({ label: 'Mode', value: entry.mode })
  if (entry.actor) items.push({ label: 'Actor', value: entry.actor })
  if (typeof p.avgScore === 'number') items.push({ label: 'Score', value: `${p.avgScore}%` })
  if (typeof p.threshold === 'number') items.push({ label: 'Threshold', value: `${p.threshold}%` })
  if (typeof p.passed === 'boolean') items.push({ label: 'Result', value: p.passed ? '✓ Passed' : '✗ Failed' })
  if (p.stage) items.push({ label: 'Stage', value: String(p.stage) })
  if (p.decision) items.push({ label: 'Decision', value: String(p.decision) })
  if (p.reason) items.push({ label: 'Reason', value: String(p.reason) })
  if (entry.jobId) items.push({ label: 'Job ID', value: entry.jobId.slice(-8) })
  if (entry.candidateId) items.push({ label: 'Candidate ID', value: entry.candidateId.slice(-8) })
  if (!items.length) return <p className="text-xs text-muted-foreground italic">No additional details recorded.</p>
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
      {items.map(({ label, value }) => (
        <div key={label} className="flex gap-2 text-xs">
          <dt className="text-muted-foreground shrink-0">{label}:</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function RecruiterAuditLog() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['recruiter-audit-log', page, action],
    queryFn: () => recruiterService.getAuditLog({ page, limit: 20, action: action || undefined }),
  })
  const entries = (data?.data ?? []) as Entry[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">My Audit Log</h1>
        <p className="text-sm text-muted-foreground">Every action taken on your jobs — AI and human.</p>
      </div>
      <Input placeholder="Filter by action..." value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} />
      {isLoading ? <LoadingSpinner /> : (
        <>
          <Card>
            <CardContent className="p-0">
              {!entries.length ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No audit entries found.</p>
              ) : (
                <div className="divide-y">
                  {entries.map((e) => (
                    <div key={e._id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize', actionColor(e.action))}>
                            {e.action.replace(/-/g, ' ')}
                          </span>
                          {e.actor && (
                            <span className="text-xs text-muted-foreground capitalize">{e.actor}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{formatDate(e.timestamp ?? e.createdAt ?? '')}</span>
                          <button
                            className="text-xs text-primary hover:underline"
                            onClick={() => setExpanded(expanded === e._id ? null : e._id)}
                          >
                            {expanded === e._id ? 'Hide' : 'Details'}
                          </button>
                        </div>
                      </div>
                      {expanded === e._id && (
                        <div className="mt-3 rounded-lg bg-muted/40 px-3 py-3">
                          <PayloadDetail entry={e} />
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
            <button className="rounded border px-3 py-1 text-sm disabled:opacity-40" disabled={entries.length < 20} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  )
}
