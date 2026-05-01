import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminService } from '../../services/admin.service'
import { Card, CardContent } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import LoadingSpinner from '../../components/shared/LoadingSpinner'

export default function SuperCompanies() {
  const [page, setPage] = useState(1); const [q, setQ] = useState('')
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['super-companies', page, q], queryFn: () => adminService.getSuperCompanies({ page, q: q || undefined }) })
  const verify = useMutation({ mutationFn: (id: string) => adminService.verifySuperCompany(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['super-companies'] }) })
  const companies = (data?.data ?? []) as Array<{ _id: string; name: string; legalName?: string; businessEmail?: string; isVerified?: boolean }>
  if (isLoading) return <LoadingSpinner />
  return <div className="space-y-6"><h1 className="font-serif text-2xl font-semibold">Companies</h1><Input placeholder="Search company..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} /><Card><CardContent className="p-0"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/30"><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Business Email</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Actions</th></tr></thead><tbody className="divide-y">{companies.map((c) => <tr key={c._id}><td className="px-4 py-3">{c.name}</td><td className="px-4 py-3">{c.businessEmail ?? '-'}</td><td className="px-4 py-3">{c.isVerified ? 'Verified' : 'Pending'}</td><td className="px-4 py-3">{!c.isVerified && <Button size="sm" onClick={() => verify.mutate(c._id)}>Verify</Button>}</td></tr>)}</tbody></table></CardContent></Card><div className="flex justify-center gap-2"><button className="rounded border px-3 py-1 text-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</button><span className="px-2 py-1 text-sm">Page {page}</span><button className="rounded border px-3 py-1 text-sm" disabled={companies.length < 25} onClick={() => setPage((p) => p + 1)}>Next</button></div></div>
}
