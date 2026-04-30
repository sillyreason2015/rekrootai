import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Save, User, Lock, Bell, Building2, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/axios'
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
  const isRecruiter = user?.role === 'recruiter'
  const [profileSaved, setProfileSaved] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwError, setPwError] = useState('')
  const [companySaved, setCompanySaved] = useState(false)

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', email: user?.email ?? '' },
  })

  const pwForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })

  // Fetch company for recruiter
  const { data: company } = useQuery({
    queryKey: ['my-company'],
    queryFn: () => api.get('/companies/mine').then((r) => r.data),
    enabled: isRecruiter,
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

  const saveCompany = useMutation({
    mutationFn: (data: CompanyForm) => api.patch('/companies/mine', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-company'] })
      setCompanySaved(true)
      setTimeout(() => setCompanySaved(false), 3000)
    },
  })

  const saveProfile = async (data: ProfileForm) => {
    await api.patch('/auth/me', data)
    await refreshUser()
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 3000)
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
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" className="gap-1.5"><User className="h-4 w-4" /> Profile</TabsTrigger>
          {isRecruiter && (
            <TabsTrigger value="company" className="gap-1.5"><Building2 className="h-4 w-4" /> Company</TabsTrigger>
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
        {isRecruiter && (
          <TabsContent value="company">
            <Card>
              <CardHeader><CardTitle>Company Profile</CardTitle></CardHeader>
              <CardContent>
                <SaveBanner show={companySaved} />
                <form onSubmit={companyForm.handleSubmit((d) => saveCompany.mutate(d))} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Trade name <span className="text-destructive">*</span></Label>
                      <Input {...companyForm.register('name')} />
                      {companyForm.formState.errors.name && <p className="text-xs text-destructive">{companyForm.formState.errors.name.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Legal entity name</Label>
                      <Input {...companyForm.register('legalName')} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Industry</Label>
                      <Input {...companyForm.register('industry')} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Company size</Label>
                      <Input {...companyForm.register('size')} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>HQ country</Label>
                      <Input {...companyForm.register('hqCountry')} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Website</Label>
                      <Input placeholder="https://..." {...companyForm.register('website')} />
                      {companyForm.formState.errors.website && <p className="text-xs text-destructive">{companyForm.formState.errors.website.message}</p>}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Mission statement</Label>
                    <textarea rows={3} className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" {...companyForm.register('mission')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vision</Label>
                    <Input {...companyForm.register('vision')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Company description</Label>
                    <textarea rows={3} className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" {...companyForm.register('description')} />
                  </div>
                  <Button type="submit" disabled={saveCompany.isPending}>
                    {saveCompany.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Save className="h-4 w-4" /> Save Company
                  </Button>
                </form>
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
