import { useMemo, useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Save, User, Lock, Bell, Building2, CheckCircle2, Users, Send, ImagePlus, Briefcase, GraduationCap, Plus, Trash2, Pencil, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/axios'
import { candidateService } from '../services/candidate.service'
import { authService } from '../services/auth.service'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ExperienceEntry, EducationEntry, LinkedProvider } from '../types'

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

function CvUploadSection({ onUploaded, candidateProfile }: { onUploaded: () => void; candidateProfile?: { cvParsed?: { fileName?: string } } | null }) {
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const upload = async (file: File) => {
    setUploading(true); setMsg('')
    try {
      await candidateService.uploadCv(file)
      setMsg('CV uploaded — skills and experience updated from your CV.')
      onUploaded()
    } catch { setMsg('Upload failed. Please try again.') }
    finally { setUploading(false) }
  }
  return (
    <div className="space-y-1.5">
      <Label>CV / Resume</Label>
      {candidateProfile?.cvParsed?.fileName && (
        <p className="text-xs text-muted-foreground">Current: {candidateProfile.cvParsed.fileName}</p>
      )}
      <Input type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} disabled={uploading} />
      {uploading && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Uploading and parsing…</p>}
      {msg && <p className={`text-xs ${msg.includes('failed') ? 'text-destructive' : 'text-emerald-600'}`}>{msg}</p>}
      <p className="text-xs text-muted-foreground">Re-uploading will automatically update your skills, experience, and education from the CV text.</p>
    </div>
  )
}

function ExperienceForm({ initial, onSave, onCancel }: {
  initial: ExperienceEntry
  onSave: (e: ExperienceEntry) => void
  onCancel: () => void
}) {
  const [v, setV] = useState<ExperienceEntry>(initial)
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Job Title *</Label>
          <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. Software Engineer" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Company *</Label>
          <Input value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} placeholder="e.g. Acme Corp" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Start Date</Label>
          <Input type="month" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">End Date</Label>
          <Input type="month" value={v.endDate ?? ''} disabled={v.current} onChange={(e) => setV({ ...v, endDate: e.target.value })} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={v.current} onChange={(e) => setV({ ...v, current: e.target.checked, endDate: e.target.checked ? '' : v.endDate })} />
        I currently work here
      </label>
      <div className="space-y-1">
        <Label className="text-xs">Description</Label>
        <textarea rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })}
          placeholder="Key responsibilities and achievements…"
          className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => { if (v.title && v.company) onSave(v) }} disabled={!v.title || !v.company}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}><X className="h-3.5 w-3.5" /> Cancel</Button>
      </div>
    </div>
  )
}

function EducationForm({ initial, onSave, onCancel }: {
  initial: EducationEntry
  onSave: (e: EducationEntry) => void
  onCancel: () => void
}) {
  const [v, setV] = useState<EducationEntry>(initial)
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Institution *</Label>
        <Input value={v.institution} onChange={(e) => setV({ ...v, institution: e.target.value })} placeholder="e.g. University of Lagos" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Degree *</Label>
          <Input value={v.degree} onChange={(e) => setV({ ...v, degree: e.target.value })} placeholder="e.g. B.Sc Computer Science" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Field of Study</Label>
          <Input value={v.field} onChange={(e) => setV({ ...v, field: e.target.value })} placeholder="e.g. Computer Science" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Start Date</Label>
          <Input type="month" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">End Date</Label>
          <Input type="month" value={v.endDate ?? ''} disabled={v.current} onChange={(e) => setV({ ...v, endDate: e.target.value })} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={v.current} onChange={(e) => setV({ ...v, current: e.target.checked, endDate: e.target.checked ? '' : v.endDate })} />
        Currently studying here
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => { if (v.institution && v.degree) onSave(v) }} disabled={!v.institution || !v.degree}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}><X className="h-3.5 w-3.5" /> Cancel</Button>
      </div>
    </div>
  )
}

export default function Settings() {
  const { user, refreshUser } = useAuth()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const providerStatusParam = searchParams.get('providerStatus')
  const providerParam = searchParams.get('provider')
  const providerMessage = searchParams.get('providerMessage')
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

  // Fetch company — returns null when none exists yet (not 404)
  const { data: company } = useQuery({
    queryKey: ['my-company'],
    queryFn: () => api.get('/companies/mine').then((r) => r.data as Record<string, string> | null),
    enabled: canManageCompany,
    retry: false,
  })
  const { data: providerStatus } = useQuery({
    queryKey: ['auth-provider-status'],
    queryFn: authService.providerStatus,
    retry: false,
  })
  const { data: linkedProviderData } = useQuery<{ providers: LinkedProvider[] }>({
    queryKey: ['linked-providers'],
    queryFn: authService.linkedProviders,
    retry: false,
  })
  const linkedProviders = linkedProviderData?.providers ?? []
  const linkedProviderSet = new Set(linkedProviders.map((item) => item.provider))

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
  // Admins can always edit; only pending recruiters are read-only
  const recruiterPendingReview = isRecruiter && !isCompanyAdmin && !companyVerified

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
  const unlinkProvider = useMutation({
    mutationFn: (provider: 'google' | 'microsoft') => authService.unlinkProvider(provider),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['linked-providers'] })
      await refreshUser()
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

  // ── Career tab (candidates only) ──────────────────────────────────────────
  const { data: candidateProfile, refetch: refetchProfile } = useQuery({
    queryKey: ['candidate-profile'],
    queryFn: candidateService.getProfile,
    enabled: user?.role === 'candidate',
  })

  const [experience, setExperience] = useState<ExperienceEntry[]>([])
  const [education, setEducation] = useState<EducationEntry[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [aboutMe, setAboutMe] = useState({ headline: '', location: '', linkedIn: '', portfolio: '', availableFrom: '' })
  const [careerSaved, setCareerSaved] = useState(false)
  const [editingExp, setEditingExp] = useState<number | 'new' | null>(null)
  const [editingEdu, setEditingEdu] = useState<number | 'new' | null>(null)
  const [cvUploading, setCvUploading] = useState(false)
  const [cvUploadMessage, setCvUploadMessage] = useState('')

  useEffect(() => {
    if (candidateProfile) {
      setExperience(candidateProfile.experience ?? [])
      setEducation(candidateProfile.education ?? [])
      setSkills(candidateProfile.skills ?? [])
      setAboutMe({
        headline: (candidateProfile as any).headline ?? '',
        location: (candidateProfile as any).location ?? '',
        linkedIn: (candidateProfile as any).linkedIn ?? '',
        portfolio: (candidateProfile as any).portfolio ?? '',
        availableFrom: (candidateProfile as any).availableFrom ?? '',
      })
    }
  }, [candidateProfile])

  const saveCareer = useMutation({
    mutationFn: () => candidateService.updateProfile({ experience, education, skills, ...aboutMe } as any),
    onSuccess: async () => {
      await refetchProfile()
      setCareerSaved(true)
      setTimeout(() => setCareerSaved(false), 3000)
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

  const uploadCv = async (file: File) => {
    setCvUploading(true)
    setCvUploadMessage('')
    try {
      await candidateService.uploadCv(file)
      await refetchProfile()
      setCvUploadMessage('CV uploaded and parsed successfully.')
    } catch {
      setCvUploadMessage('CV upload failed. Please try again.')
    } finally {
      setCvUploading(false)
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
        {providerStatusParam && providerParam && (
          <p className={`mt-2 rounded-md border px-3 py-2 text-xs ${
            providerStatusParam === 'linked'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : providerStatusParam === 'unlinked'
                ? 'border-blue-300 bg-blue-50 text-blue-800'
                : 'border-amber-300 bg-amber-50 text-amber-800'
          }`}>
            {providerMessage ?? (
              providerStatusParam === 'linked'
                ? `${providerParam} sign-in was linked successfully.`
                : providerStatusParam === 'unlinked'
                  ? `${providerParam} sign-in was removed successfully.`
                  : `We couldn't complete the ${providerParam} provider action.`
            )}
          </p>
        )}
        {recruiterPendingReview && (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Pending super-admin review: your company profile is awaiting verification. Until verified, recruiter company/team settings are read-only.
          </p>
        )}
      </div>

      <Tabs defaultValue={tabParam ?? (canManageCompany ? 'company' : 'profile')}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="profile" className="gap-1.5"><User className="h-4 w-4" /> Profile</TabsTrigger>
          {user?.role === 'candidate' && (
            <TabsTrigger value="career" className="gap-1.5"><Briefcase className="h-4 w-4" /> Career</TabsTrigger>
          )}
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
                {user?.role === 'candidate' && (
                  <CvUploadSection onUploaded={() => refetchProfile()} candidateProfile={candidateProfile} />
                )}
                <div className="space-y-2 rounded-lg border p-4">
                  <div>
                    <Label>Linked sign-in providers</Label>
                    <p className="text-xs text-muted-foreground">Connect Google or Microsoft to sign in faster without changing your main account.</p>
                  </div>
                  <div className="space-y-2">
                    {linkedProviders.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No external providers linked yet.</p>
                    ) : (
                      linkedProviders.map((item) => (
                        <div key={item.provider} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                          <div>
                            <span className="capitalize">{item.provider}</span>
                            <span className="ml-2 text-muted-foreground">{item.email}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={unlinkProvider.isPending}
                            onClick={() => unlinkProvider.mutate(item.provider)}
                          >
                            Unlink
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    {providerStatus?.googleEnabled && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={linkedProviderSet.has('google')}
                        onClick={() => { window.location.href = authService.linkGoogleUrl() }}
                      >
                        {linkedProviderSet.has('google') ? 'Google Linked' : 'Link Google'}
                      </Button>
                    )}
                    {providerStatus?.microsoftEnabled && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={linkedProviderSet.has('microsoft')}
                        onClick={() => { window.location.href = authService.linkMicrosoftUrl() }}
                      >
                        {linkedProviderSet.has('microsoft') ? 'Microsoft Linked' : 'Link Microsoft'}
                      </Button>
                    )}
                  </div>
                </div>
                <Button type="submit" disabled={profileForm.formState.isSubmitting}>
                  {profileForm.formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Save className="h-4 w-4" /> Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Career (candidates only) */}
        {user?.role === 'candidate' && (
          <TabsContent value="career" className="space-y-6">
            <SaveBanner show={careerSaved} />

            <Card>
              <CardHeader><CardTitle>CV / Resume</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Current CV</Label>
                  <p className="text-sm text-muted-foreground">
                    {String((candidateProfile?.cvParsed as { fileName?: string } | undefined)?.fileName ?? 'No CV uploaded yet')}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Upload or re-upload CV</Label>
                  <Input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void uploadCv(file)
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Parsed CV data is used to refresh skills, work history, and resume scoring.</p>
                  {cvUploading && <p className="text-xs text-muted-foreground">Uploading CV...</p>}
                  {!!cvUploadMessage && <p className="text-xs text-muted-foreground">{cvUploadMessage}</p>}
                </div>
              </CardContent>
            </Card>

            {/* About Me */}
            <Card>
              <CardHeader><CardTitle>About Me</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Professional Headline</Label>
                  <Input value={aboutMe.headline} onChange={(e) => setAboutMe({ ...aboutMe, headline: e.target.value })} placeholder="e.g. Full-Stack Engineer · 5 years experience" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Location</Label>
                    <Input value={aboutMe.location} onChange={(e) => setAboutMe({ ...aboutMe, location: e.target.value })} placeholder="e.g. Lagos, Nigeria" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Available From</Label>
                    <Input type="date" value={aboutMe.availableFrom} onChange={(e) => setAboutMe({ ...aboutMe, availableFrom: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">LinkedIn URL</Label>
                    <Input value={aboutMe.linkedIn} onChange={(e) => setAboutMe({ ...aboutMe, linkedIn: e.target.value })} placeholder="https://linkedin.com/in/..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Portfolio / GitHub</Label>
                    <Input value={aboutMe.portfolio} onChange={(e) => setAboutMe({ ...aboutMe, portfolio: e.target.value })} placeholder="https://..." />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Skills */}
            <Card>
              <CardHeader><CardTitle>Skills</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ',') && skillInput.trim()) {
                        e.preventDefault()
                        const s = skillInput.trim().replace(/,$/, '')
                        if (s && !skills.includes(s)) setSkills([...skills, s])
                        setSkillInput('')
                      }
                    }}
                    placeholder="Type a skill and press Enter…"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    const s = skillInput.trim()
                    if (s && !skills.includes(s)) { setSkills([...skills, s]); setSkillInput('') }
                  }}><Plus className="h-3.5 w-3.5" /></Button>
                </div>
                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {skills.map((s) => (
                      <span key={s} className="flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-xs">
                        {s}
                        <button onClick={() => setSkills(skills.filter((x) => x !== s))} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Skills improve your AI job match score.</p>
              </CardContent>
            </Card>

            {/* Work Experience */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <CardTitle>Work Experience</CardTitle>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditingExp('new')}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {experience.length === 0 && editingExp !== 'new' && (
                  <p className="text-sm text-muted-foreground italic">No work experience added yet.</p>
                )}
                {experience.map((exp, i) => (
                  <div key={i}>
                    {editingExp === i ? (
                      <ExperienceForm
                        initial={exp}
                        onSave={(updated) => {
                          const next = [...experience]; next[i] = updated; setExperience(next); setEditingExp(null)
                        }}
                        onCancel={() => setEditingExp(null)}
                      />
                    ) : (
                      <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3">
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-medium text-sm">{exp.title}</p>
                          <p className="text-xs text-muted-foreground">{exp.company}</p>
                          <p className="text-xs text-muted-foreground">
                            {exp.startDate}{exp.current ? ' – Present' : exp.endDate ? ` – ${exp.endDate}` : ''}
                          </p>
                          {exp.description && (
                            <p className="text-xs text-foreground/70 mt-1 line-clamp-2">{exp.description}</p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => setEditingExp(i)} className="rounded p-1 hover:bg-accent"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
                          <button onClick={() => setExperience(experience.filter((_, j) => j !== i))} className="rounded p-1 hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {editingExp === 'new' && (
                  <ExperienceForm
                    initial={{ title: '', company: '', startDate: '', endDate: '', current: false, description: '' }}
                    onSave={(entry) => { setExperience([...experience, entry]); setEditingExp(null) }}
                    onCancel={() => setEditingExp(null)}
                  />
                )}
              </CardContent>
            </Card>

            {/* Education */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-primary" />
                  <CardTitle>Education</CardTitle>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditingEdu('new')}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {education.length === 0 && editingEdu !== 'new' && (
                  <p className="text-sm text-muted-foreground italic">No education added yet.</p>
                )}
                {education.map((edu, i) => (
                  <div key={i}>
                    {editingEdu === i ? (
                      <EducationForm
                        initial={edu}
                        onSave={(updated) => {
                          const next = [...education]; next[i] = updated; setEducation(next); setEditingEdu(null)
                        }}
                        onCancel={() => setEditingEdu(null)}
                      />
                    ) : (
                      <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3">
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-medium text-sm">{edu.degree}{edu.field ? ` in ${edu.field}` : ''}</p>
                          <p className="text-xs text-muted-foreground">{edu.institution}</p>
                          <p className="text-xs text-muted-foreground">
                            {edu.startDate}{edu.current ? ' – Present' : edu.endDate ? ` – ${edu.endDate}` : ''}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => setEditingEdu(i)} className="rounded p-1 hover:bg-accent"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
                          <button onClick={() => setEducation(education.filter((_, j) => j !== i))} className="rounded p-1 hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {editingEdu === 'new' && (
                  <EducationForm
                    initial={{ institution: '', degree: '', field: '', startDate: '', endDate: '', current: false }}
                    onSave={(entry) => { setEducation([...education, entry]); setEditingEdu(null) }}
                    onCancel={() => setEditingEdu(null)}
                  />
                )}
              </CardContent>
            </Card>

            <Button onClick={() => saveCareer.mutate()} disabled={saveCareer.isPending}>
              {saveCareer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" /> Save Career Profile
            </Button>
          </TabsContent>
        )}

        {/* Company (recruiter only) */}
        {canManageCompany && (
          <TabsContent value="company">
            <Card>
              <CardHeader><CardTitle>Company Profile</CardTitle></CardHeader>
              <CardContent>
                <SaveBanner show={companySaved} />
                {!company && (
                  <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-700 dark:text-blue-400">
                    No company profile yet — fill in the details below and click Save to create it.
                  </div>
                )}
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
