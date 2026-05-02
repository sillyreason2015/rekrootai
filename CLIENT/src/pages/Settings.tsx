import { useMemo, useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Save, User, Lock, Bell, Building2, CheckCircle2, Users, Send, ImagePlus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/axios'
import { candidateService } from '../services/candidate.service'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const profileSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email(),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword: z.string().min(8).regex(/[A-Z]/, 'Include uppercase').regex(/[0-9]/, 'Include number'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })

const companySchema = z.object({
  name: z.string().min(2, 'Company name required'),
  legalName: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  hqCountry: z.string().optional(),
  website: z.string().url('Enter a valid URL').optional().or(z.literal('')),
  mission: z.string().optional(),
  vision: z.string().optional(),
  description: z.string().optional(),
})

type ProfileForm = z.infer<typeof profileSchema>
type PasswordForm = z.infer<typeof passwordSchema>
type CompanyForm = z.infer<typeof companySchema>

function SaveBanner({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      <CheckCircle2 className="h-4 w-4" /> Saved successfully.
    </div>
  )
}

export default function Settings() {
  const { user, refreshUser } = useAuth()
  const qc = useQueryClient()
  const isCompanyAdmin = user?.role === 'admin'
  const isRecruiter = user?.role === 'recruiter'
  const canManageCompany = isRecruiter || isCompanyAdmin
  const [profileSaved, setProfileSaved] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwError, setPwError] = useState('')
  const [companySaved, setCompanySaved] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState('')
  const avatarSrc = useMemo(() => avatarPreview || user?.avatarPreviewUrl || '', [avatarPreview, user?.avatarPreviewUrl])
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoPreview, setLogoPreview] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', email: user?.email ?? '' },
  })

  const pwForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })

  // Fetch company for recruiter
  const { data: company } = useQuery({
    queryKey: ['my-company'],
    queryFn: () => api.get('/companies/mine').then((r) => r.data),
    enabled: canManageCompany,
  })

  const companyForm = useForm<CompanyForm>({
    resolver: zodResolver(companySchema),
    values: company ? {
      name: company.name ?? '',
      legalName: company.legalName ?? '',
      industry: company.industry ?? '',
      size: company.size ?? '',
      hqCountry: company.hqCountry ?? '',
      website: company.website ?? '',
      mission: company.mission ?? '',
      vision: company.vision ?? '',
      description: company.description ?? '',
    } : undefined,
  })
  const companyVerified = Boolean(company?.isVerified)
  const recruiterPendingReview = isRecruiter && !companyVerified

  const uploadLogo = async (file: File) => {
    setLogoUploading(true)
    try {
      const form = new FormData()
      form.append('logo', file)
      const { data } = await api.post<{ previewUrl: string }>('/companies/mine/logo', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      if (data.previewUrl) setLogoPreview(data.previewUrl)
      qc.invalidateQueries({ queryKey: ['my-company'] })
    } finally { setLogoUploading(false) }
  }

  const saveCompany = useMutation({
    mutationFn: (data: CompanyForm) => api.patch('/companies/mine', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-company'] })
      setCompanySaved(true)
      setTimeout(() => setCompanySaved(false), 3000)
    },
  })

  // Team management (recruiter only)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [inviteSent, setInviteSent] = useState(false)

  const { data: teamData } = useQuery<{ members: Array<{ _id: string; firstName: string; lastName: string; email: string; role: string }> }>({
    queryKey: ['company-team'],
    queryFn: () => api.get('/companies/team').then((r) => r.data),
    enabled: canManageCompany,
  })

  const sendInvite = useMutation({
    mutationFn: (email: string) => api.post('/companies/invite', { email }),
    onSuccess: () => {
      setInviteEmail('')
      setInviteError('')
      setInviteSent(true)
      qc.invalidateQueries({ queryKey: ['company-team'] })
      setTimeout(() => setInviteSent(false), 4000)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setInviteError(msg ?? 'Failed to send invite. Please try again.')
    },
  })
  const deleteAccount = useMutation({
    mutationFn: candidateService.deleteAccount,
    onSuccess: () => {
      window.location.href = '/register'
    },
  })

  const saveProfile = async (data: ProfileForm) => {
    await api.patch('/auth/me', data)
    await refreshUser()
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 3000)
  }

  const uploadAvatar = async (file: File) => {
    setAvatarUploading(true)
    try {
      const form = new FormData()
      form.append('avatar', file)
      const { data } = await api.post<{ avatarUrl: string; previewUrl?: string }>('/auth/me/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      if (data.previewUrl) setAvatarPreview(data.previewUrl)
      await refreshUser()
    } finally {
      setAvatarUploading(false)
    }
  }

  const changePassword = async (data: PasswordForm) => {
    setPwError('')
    try {
      await api.post('/auth/change-password', { currentPassword: data.currentPassword, newPassword: data.newPassword })
      pwForm.reset()
      setPwSaved(true)
      setTimeout(() => setPwSaved(false), 3000)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setPwError(msg ?? 'Failed to change password')
    }
  }

  const recruiterNotifications = [
    { label: 'New application received', desc: 'When a candidate applies to one of your jobs' },
    { label: 'Assessment completed', desc: 'When a candidate finishes their assessment' },
    { label: 'Interview reminder', desc: '1 hour before a scheduled interview' },
    { label: 'AI scoring complete', desc: 'When the fairness gate finishes processing' },
  ]
  const candidateNotifications = [
    { label: 'Application status updates', desc: 'When your application moves to a new stage' },
    { label: 'Assessment reminders', desc: '24h before an assessment expires' },
    { label: 'Interview reminders', desc: '1 hour before scheduled interviews' },
    { label: 'Hiring decisions', desc: 'When a recruiter makes a decision on your application' },
  ]
  const notifications = isRecruiter ? recruiterNotifications : candidateNotifications

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and preferences.</p>
        {recruiterPendingReview && (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Pending super-admin review: your company profile is awaiting verification. Until verified, recruiter company/team settings are read-only.
          </p>
        )}
      </div>

      <Tabs defaultValue={canManageCompany ? 'company' : 'profile'}>
        <TabsList>
          <TabsTrigger value="profile" className="gap-1.5"><User className="h-4 w-4" /> Profile</TabsTrigger>
          {canManageCompany && (
            <TabsTrigger value="company" className="gap-1.5"><Building2 className="h-4 w-4" /> Company</TabsTrigger>
          )}
          {canManageCompany && (
            <TabsTrigger value="team" className="gap-1.5"><Users className="h-4 w-4" /> Team</TabsTrigger>
          )}
          <TabsTrigger value="security" className="gap-1.5"><Lock className="h-4 w-4" /> Security</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5"><Bell className="h-4 w-4" /> Notifications</TabsTrigger>
        </TabsList>

        {/* Profile */}
        <TabsContent value="profile">
          <Card>
            <CardHeader><CardTitle>Profile Information</CardTitle></CardHeader>
            <CardContent>
              <SaveBanner show={profileSaved} />
              <form onSubmit={profileForm.handleSubmit(saveProfile)} className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 overflow-hidden rounded-full border bg-muted">
                    {avatarSrc ? <img src={avatarSrc} alt="avatar" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No photo</div>}
                  </div>
                  <div>
                    <Label className="mb-1 block">Headshot</Label>
                    <Input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void uploadAvatar(f)
                      }}
                    />
                    {avatarUploading && <p className="mt-1 text-xs text-muted-foreground">Uploading...</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>First name</Label>
                    <Input {...profileForm.register('firstName')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last name</Label>
                    <Input {...profileForm.register('lastName')} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Email address</Label>
                  <Input type="email" {...profileForm.register('email')} />
                </div>
                {isRecruiter && user?.companyName && (
                  <div className="space-y-1.5">
                    <Label>Company</Label>
                    <Input value={user.companyName} disabled className="text-muted-foreground" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Input value={user?.role} disabled className="capitalize text-muted-foreground" />
                </div>
                <Button type="submit" disabled={profileForm.formState.isSubmitting}>
                  {profileForm.formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Save className="h-4 w-4" /> Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Company (recruiter only) */}
        {canManageCompany && (
          <TabsContent value="company">
            <Card>
              <CardHeader><CardTitle>Company Profile</CardTitle></CardHeader>
              <CardContent>
                <SaveBanner show={companySaved} />
                {/* Logo upload */}
                <div className="mb-5 flex items-center gap-4">
                  <div
                    className="relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-input bg-muted hover:border-primary/50 transition-colors"
                    onClick={() => !recruiterPendingReview && logoInputRef.current?.click()}
                  >
                    {logoPreview || company?.logoUrl ? (
                      <img src={logoPreview || ''} alt="logo" className="h-full w-full object-contain p-1" />
                    ) : (
                      <ImagePlus className="h-6 w-6 text-muted-foreground" />
                    )}
                    {logoUploading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Company Logo</p>
                    <p className="text-xs text-muted-foreground mb-2">PNG, JPG or WebP · max 4 MB · shown on job listings</p>
                    <Button type="button" size="sm" variant="outline" disabled={recruiterPendingReview || logoUploading}
                      onClick={() => logoInputRef.current?.click()}>
                      <ImagePlus className="h-3.5 w-3.5" /> {logoPreview ? 'Replace logo' : 'Upload logo'}
                    </Button>
                    <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f) }} />
                  </div>
                </div>
                <form onSubmit={companyForm.handleSubmit((d) => saveCompany.mutate(d))} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Trade name <span className="text-destructive">*</span></Label>
                      <Input {...companyForm.register('name')} disabled={recruiterPendingReview} />
                      {companyForm.formState.errors.name && <p className="text-xs text-destructive">{companyForm.formState.errors.name.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Legal entity name</Label>
                      <Input {...companyForm.register('legalName')} disabled={recruiterPendingReview} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Industry</Label>
                      <Input {...companyForm.register('industry')} disabled={recruiterPendingReview} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Company size</Label>
                      <Input {...companyForm.register('size')} disabled={recruiterPendingReview} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>HQ country</Label>
                      <Input {...companyForm.register('hqCountry')} disabled={recruiterPendingReview} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Website</Label>
                      <Input placeholder="https://..." {...companyForm.register('website')} disabled={recruiterPendingReview} />
                      {companyForm.formState.errors.website && <p className="text-xs text-destructive">{companyForm.formState.errors.website.message}</p>}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Mission statement</Label>
                    <textarea rows={3} className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" {...companyForm.register('mission')} disabled={recruiterPendingReview} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vision</Label>
                    <Input {...companyForm.register('vision')} disabled={recruiterPendingReview} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Company description</Label>
                    <textarea rows={3} className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" {...companyForm.register('description')} disabled={recruiterPendingReview} />
                  </div>
                  <Button type="submit" disabled={saveCompany.isPending || recruiterPendingReview}>
                    {saveCompany.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Save className="h-4 w-4" /> Save Company
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Team (recruiter only) */}
        {canManageCompany && (
          <TabsContent value="team">
            <Card>
              <CardHeader><CardTitle>Team Members</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                {/* Invite form */}
                <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                  <p className="text-sm font-medium">Invite a colleague</p>
                  <p className="text-xs text-muted-foreground">They'll receive an email with a link to join your workspace as a recruiter.</p>
                  {inviteSent && (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> Invite sent successfully!
                    </div>
                  )}
                  {inviteError && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {inviteError}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="colleague@company.com"
                      className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && inviteEmail) sendInvite.mutate(inviteEmail)
                      }}
                    />
                    <Button
                      onClick={() => { if (inviteEmail) sendInvite.mutate(inviteEmail) }}
                      disabled={!inviteEmail || sendInvite.isPending || recruiterPendingReview}
                    >
                      {sendInvite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send Invite
                    </Button>
                  </div>
                </div>

                {/* Members list */}
                <div>
                  <p className="mb-3 text-sm font-medium">Current team ({teamData?.members.length ?? 0})</p>
                  {!teamData?.members.length ? (
                    <p className="text-sm text-muted-foreground">No team members found.</p>
                  ) : (
                    <div className="divide-y rounded-xl border">
                      {teamData.members.map((m) => (
                        <div key={m._id} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {m.firstName[0]}{m.lastName[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{m.firstName} {m.lastName}</p>
                            <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                          </div>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                            {m.role}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Security */}
        <TabsContent value="security">
          <Card>
            <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
            <CardContent>
              <SaveBanner show={pwSaved} />
              {pwError && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {pwError}
                </div>
              )}
              <form onSubmit={pwForm.handleSubmit(changePassword)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Current password</Label>
                  <Input type="password" {...pwForm.register('currentPassword')} />
                </div>
                <div className="space-y-1.5">
                  <Label>New password</Label>
                  <Input type="password" {...pwForm.register('newPassword')} />
                  {pwForm.formState.errors.newPassword && <p className="text-xs text-destructive">{pwForm.formState.errors.newPassword.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Confirm new password</Label>
                  <Input type="password" {...pwForm.register('confirmPassword')} />
                  {pwForm.formState.errors.confirmPassword && <p className="text-xs text-destructive">{pwForm.formState.errors.confirmPassword.message}</p>}
                </div>
                <Button type="submit" disabled={pwForm.formState.isSubmitting}>
                  {pwForm.formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Update Password
                </Button>
              </form>
            </CardContent>
          </Card>
          {user?.role === 'candidate' && (
            <Card className="mt-4 border-destructive/30">
              <CardHeader><CardTitle>Danger Zone</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  NDPR/GDPR account deletion removes your profile, applications, assessments, interviews, and related AI records.
                </p>
                <div className="space-y-1.5">
                  <Label>Type DELETE to confirm</Label>
                  <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} />
                </div>
                <Button
                  variant="destructive"
                  disabled={deleteConfirm !== 'DELETE' || deleteAccount.isPending}
                  onClick={() => deleteAccount.mutate()}
                >
                  {deleteAccount.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Delete My Account
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader><CardTitle>Notification Preferences</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {notifications.map(({ label, desc }) => (
                <div key={label} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" defaultChecked className="peer sr-only" />
                    <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-4" />
                  </label>
                </div>
              ))}
              <Button>Save Preferences</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
