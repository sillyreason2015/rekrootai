import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { UserPlus, Loader2, Shield, Briefcase, Users2 } from 'lucide-react'
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

export default function TeamManagement() {
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'recruiter' | 'admin'>('recruiter')
  const [teamName, setTeamName] = useState(user?.teamName || user?.companyName || '')
  const [inviteSent, setInviteSent] = useState(false)
  const [inviteSummary, setInviteSummary] = useState('')
  const [inviteLink, setInviteLink] = useState('')

  const { data: team, isLoading } = useQuery({
    queryKey: ['admin-team'],
    queryFn: adminService.getTeam,
  })

  const inviteMutation = useMutation({
    mutationFn: () => adminService.inviteTeamMember({ email, role, teamName }),
    onSuccess: (data) => {
      setInviteSent(true)
      setInviteSummary(`${role === 'admin' ? 'Admin + job creator' : 'Recruiter'} invited to ${teamName || 'this team'}.`)
      setEmail('')
      const token = (data as { inviteToken?: string })?.inviteToken
      if (token) setInviteLink(`${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`)
    },
  })

  const members: User[] = (team as { members?: User[] })?.members ?? []

  return (
    <div className="space-y-6">
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
          {inviteSent && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Invitation sent successfully. {inviteSummary}
              {inviteLink && <div className="mt-1 break-all text-xs">{inviteLink}</div>}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Email address</Label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
