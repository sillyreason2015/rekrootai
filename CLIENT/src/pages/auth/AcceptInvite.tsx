import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { adminService } from '../../services/admin.service'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'

export default function AcceptInvite() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = useMemo(() => params.get('token') ?? '', [params])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async () => {
    setError('')
    try {
      await adminService.acceptInvite({ token, firstName, lastName, password })
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 1200)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Failed to accept invite')
    }
  }

  return (
    <div className="mx-auto mt-20 w-full max-w-md space-y-4 rounded-lg border p-6">
      <h1 className="font-serif text-2xl font-semibold">Accept Team Invite</h1>
      {!!error && <p className="text-sm text-destructive">{error}</p>}
      {done ? (
        <p className="text-sm text-emerald-600">Invite accepted. Redirecting to login...</p>
      ) : (
        <>
          <div className="space-y-1"><Label>First name</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
          <div className="space-y-1"><Label>Last name</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
          <div className="space-y-1"><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <Button className="w-full" onClick={submit} disabled={!token || !firstName || !lastName || password.length < 8}>
            Accept Invite
          </Button>
        </>
      )}
    </div>
  )
}
