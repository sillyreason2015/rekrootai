import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { recruiterService } from '../../services/recruiter.service'
import { Card, CardContent } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Badge } from '../../components/ui/badge'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatDate } from '../../lib/utils'

export default function RecruiterAuditLog() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['recruiter-audit-log', page, action],
    queryFn: () => recruiterService.getAuditLog({ page, limit: 20, action: action || undefined }),
  })
  const entries = (data?.data ?? []) as Array<{ _id: string; action: string; timestamp?: string; createdAt?: string }>

  return (
    <div className="space-y-6">
      <div><h1 className="font-serif text-2xl font-semibold">My Audit Log</h1></div>
      <Input placeholder="Filter by action..." value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} />
      {isLoading ? <LoadingSpinner /> : (
        <>
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/30 text-xs text-muted-foreground"><th className="px-4 py-3 text-left">Action</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Details</th></tr></thead>
              <tbody className="divide-y">
                {entries.map((e) => (
                  <tr key={e._id}><td className="px-4 py-3"><Badge variant="secondary">{e.action}</Badge></td><td className="px-4 py-3">{formatDate((e.timestamp ?? e.createdAt ?? new Date().toISOString()))}</td><td className="px-4 py-3"><details><summary className="cursor-pointer text-xs text-primary">View</summary><pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">{JSON.stringify(e, null, 2)}</pre></details></td></tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
          <div className="flex justify-center gap-2">
            <button className="rounded border px-3 py-1 text-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span className="px-2 py-1 text-sm">Page {page}</span>
            <button className="rounded border px-3 py-1 text-sm" disabled={entries.length < 20} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  )
}
