import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { UserPlus, Loader2, Shield, Briefcase, Users2, Copy, Check, X, Link2, Mail } from 'lucide-react'
import { adminService } from '../../services/admin.service'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { initials } from '../../lib/utils'
import type { User } from '../../types'
import { useAuth } from '../../contexts/AuthContext'

interface InviteResult {
  email: string
  inviteLink: string
  emailSent: boolean
  summary: string
}

function InviteLinkModal({ result, onClose }: { result: InviteResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(result.inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl border">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
              <UserPlus className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Invitation Created</h2>
              <p className="text-xs text-muted-foreground">{result.summary}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Email status */}
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${result.emailSent ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
            <Mail className="h-4 w-4 shrink-0" />
            {result.emailSent
              ? `Invite email sent to ${result.email}`
              : `Email delivery failed — share the link below with ${result.email}`}
          </div>

          {/* Invite link */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              Invite link
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
              <span className="flex-1 break-all text-xs font-mono text-muted-foreground leading-relaxed">
                {result.inviteLink}
              </span>
              <button
                onClick={copy}
                className="shrink-0 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              This link expires in 7 days. The invitee will be asked to set a password when they accept.
            </p>
          </div>

          <Button className="w-full" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  )
}

export default function TeamManagement() {
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'recruiter' | 'admin'>('recruiter')
  const [teamName, setTeamName] = useState(user?.teamName || user?.companyName || '')
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null)

  const { data: team, isLoading } = useQuery({
    queryKey: ['admin-team'],
    queryFn: adminService.getTeam,
  })

  const inviteMutation = useMutation({
    mutationFn: () => adminService.inviteTeamMember({ email, role, teamName }),
    onSuccess: (data) => {
      const d = data as { inviteToken?: string; inviteUrl?: string; emailSent?: boolean }
      const url = d.inviteUrl ?? (d.inviteToken ? `${window.location.origin}/accept-invite?token=${encodeURIComponent(d.inviteToken)}` : '')
      setInviteResult({
        email,
        inviteLink: url,
        emailSent: d.emailSent !== false,
        summary: `${role === 'admin' ? 'Admin' : 'Recruiter'} invite for ${teamName || 'this team'}`,
      })
      setEmail('')
    },
  })

  const members: User[] = (team as { members?: User[] })?.members ?? []

  return (
    <div className="space-y-6">
      {inviteResult && (
        <InviteLinkModal result={inviteResult} onClose={() => setInviteResult(null)} />
      )}

      <div>
        <h1 className="font-serif text-2xl font-semibold">Team Management</h1>
        <p className="text-sm text-muted-foreground">Manage recruiters and admins inside {user?.teamName || user?.companyName || 'your workspace'}.</p>
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 p-5">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Users2 className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium">Current workspace</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Jobs created for <strong>{user?.teamName || user?.companyName || 'this team'}</strong> stay visible to that team so pipelines do not leak across groups.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader><CardTitle>Invite Team Member</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Email address</Label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && email && teamName) inviteMutation.mutate() }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as 'recruiter' | 'admin')}
              >
                <option value="recruiter">Recruiter</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Team</Label>
              <Input
                placeholder="Core Hiring Team"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
            </div>
          </div>
          <div className="rounded-xl border bg-background/80 p-4 text-sm">
            <p className="font-medium">Permission summary</p>
            <p className="mt-1 text-muted-foreground">
              {role === 'admin'
                ? 'Admins can create jobs, invite teammates, and manage assignment visibility for this team.'
                : 'Recruiters can manage assigned pipeline work, but they do not control workspace setup.'}
            </p>
          </div>
          <Button
            onClick={() => inviteMutation.mutate()}
            disabled={!email || !teamName || inviteMutation.isPending}
          >
            {inviteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <UserPlus className="h-4 w-4" /> Send Invitation
          </Button>
        </CardContent>
      </Card>

      {isLoading ? <LoadingSpinner /> : (
        <Card>
          <CardHeader>
            <CardTitle>Team Members ({members.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {!members.length ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <p className="font-medium">This team has no hiring members yet.</p>
                <p className="mt-1">Invite a recruiter or admin so new jobs have someone to own the pipeline.</p>
              </div>
            ) : (
              <div className="divide-y">
                {members.map((member) => (
                  <div key={member._id} className="flex items-center gap-4 py-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary shrink-0">
                      {initials(member.firstName, member.lastName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{member.firstName} {member.lastName}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                      <p className="text-xs text-muted-foreground">{member.teamName || user?.teamName || 'Unassigned team'}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
                        {member.role === 'admin' ? <Shield className="mr-1 h-3 w-3 inline" /> : <Briefcase className="mr-1 h-3 w-3 inline" />}
                        {member.role}
                      </Badge>
                      <Badge variant={member.isVerified ? 'success' : 'warning'}>
                        {member.isVerified ? 'Verified' : 'Pending'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
