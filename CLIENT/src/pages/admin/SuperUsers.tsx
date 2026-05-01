import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminService } from '../../services/admin.service'
import { Card, CardContent } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import LoadingSpinner from '../../components/shared/LoadingSpinner'

export default function SuperUsers() {
  const [page, setPage] = useState(1); const [q, setQ] = useState(''); const [role, setRole] = useState('')
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['super-users', page, q, role], queryFn: () => adminService.getSuperUsers({ page, q: q || undefined, role: role || undefined }) })
  const del = useMutation({ mutationFn: (id: string) => adminService.deleteSuperUser(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['super-users'] }) })
  const users = (data?.data ?? []) as Array<{ _id: string; email: string; firstName: string; lastName: string; role: string; isVerified: boolean }>
  if (isLoading) return <LoadingSpinner />
  return <div className="space-y-6"><h1 className="font-serif text-2xl font-semibold">Global Users</h1><div className="flex gap-2"><Input placeholder="Search user..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} /><select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }}><option value="">All roles</option><option>candidate</option><option>recruiter</option><option>admin</option><option>super_admin</option></select></div><Card><CardContent className="p-0"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/30"><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Email</th><th className="px-4 py-3 text-left">Role</th><th className="px-4 py-3 text-left">Actions</th></tr></thead><tbody className="divide-y">{users.map((u) => <tr key={u._id}><td className="px-4 py-3">{u.firstName} {u.lastName}</td><td className="px-4 py-3">{u.email}</td><td className="px-4 py-3">{u.role}</td><td className="px-4 py-3"><Button size="sm" variant="outline" onClick={() => del.mutate(u._id)}>Delete</Button></td></tr>)}</tbody></table></CardContent></Card><div className="flex justify-center gap-2"><button className="rounded border px-3 py-1 text-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</button><span className="px-2 py-1 text-sm">Page {page}</span><button className="rounded border px-3 py-1 text-sm" disabled={users.length < 25} onClick={() => setPage((p) => p + 1)}>Next</button></div></div>
}
