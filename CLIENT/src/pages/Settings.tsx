import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Save, User, Lock, Bell } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/axios'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'

const profileSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email(),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword: z.string().min(8, 'At least 8 characters').regex(/[A-Z]/, 'Include uppercase').regex(/[0-9]/, 'Include number'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })

type ProfileForm = z.infer<typeof profileSchema>
type PasswordForm = z.infer<typeof passwordSchema>

export default function Settings() {
  const { user, refreshUser } = useAuth()
  const [profileSaved, setProfileSaved] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwError, setPwError] = useState('')

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', email: user?.email ?? '' },
  })

  const pwForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })

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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account preferences.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile"><User className="h-4 w-4" /> Profile</TabsTrigger>
          <TabsTrigger value="security"><Lock className="h-4 w-4" /> Security</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-4 w-4" /> Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader><CardTitle>Profile Information</CardTitle></CardHeader>
            <CardContent>
              {profileSaved && (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  ✓ Profile updated successfully.
                </div>
              )}
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
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Input value={user?.role} disabled className="capitalize" />
                </div>
                <Button type="submit" disabled={profileForm.formState.isSubmitting}>
                  {profileForm.formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Save className="h-4 w-4" /> Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
            <CardContent>
              {pwSaved && (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  ✓ Password changed successfully.
                </div>
              )}
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

        <TabsContent value="notifications">
          <Card>
            <CardHeader><CardTitle>Notification Preferences</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Application status updates', desc: 'When your application moves to a new stage' },
                { label: 'Assessment reminders', desc: '24h before an assessment expires' },
                { label: 'Interview reminders', desc: '1 hour before scheduled interviews' },
                { label: 'Hiring decisions', desc: 'When a recruiter makes a decision on your application' },
              ].map(({ label, desc }) => (
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
