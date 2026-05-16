import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, Plus, X, CheckCircle2, Info, Lock, Zap, BookOpen } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../lib/axios'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Progress } from '../../components/ui/progress'
import { cn } from '../../lib/utils'

const STEPS = ['Company', 'Workspace', 'Branding', 'Team', 'Review']

const INDUSTRIES = [
  'Technology', 'Finance & Banking', 'Healthcare', 'Education', 'Creative & Media',
  'Consulting', 'Retail & E-commerce', 'Manufacturing', 'Legal', 'Real Estate', 'Other',
]
const SIZES = ['1–10', '11–50', '51–200', '201–500', '501–1,000', '1,000+']
const TONES = ['Professional', 'Friendly & Approachable', 'Bold & Direct', 'Academic', 'Creative']

const companySchema = z.object({
  legalName: z.string().min(2, 'Legal name is required'),
  companyName: z.string().min(2, 'Trade name is required'),
  teamName: z.string().min(2, 'First team name is required'),
  website: z.string().url('Enter a valid URL').optional().or(z.literal('')),
  hqCountry: z.string().min(2, 'HQ country is required'),
  jobTitle: z.string().min(2, 'Your job title is required'),
  phone: z.string().optional(),
  registrationNumber: z.string().min(5, 'Registration number is required'),
  taxId: z.string().optional(),
  businessEmail: z.string().email('Valid business email required'),
})
type CompanyForm = z.infer<typeof companySchema>

const missionSchema = z.object({
  mission: z.string().min(20, 'Mission statement should be at least 20 characters'),
  vision: z.string().optional(),
})
type MissionForm = z.infer<typeof missionSchema>
type AssignmentMode = 'round_robin' | 'manual'
type InviteDraft = {
  email: string
  role: 'recruiter' | 'admin'
}

// Why-we-ask sidebar content per step
const WHY_ASK = [
  {
    title: 'Why we ask',
    items: [
      { icon: Info, label: 'Context', desc: 'Helps candidates understand your workplace culture.' },
      { icon: Lock, label: 'Security', desc: 'Encryption standards for all organisational data.' },
      { icon: Zap, label: 'Impact', desc: 'Improves match accuracy by 40% for niche roles.' },
      { icon: BookOpen, label: 'Guidance', desc: 'Best practices for profile completion.' },
    ],
  },
  {
    title: 'Why mission matters',
    items: [
      { icon: Info, label: 'Alignment', desc: 'Candidates self-select based on mission fit, reducing churn.' },
      { icon: Zap, label: 'Quality', desc: 'Purposeful companies attract 2× more qualified applicants.' },
    ],
  },
  {
    title: 'Brand voice',
    items: [
      { icon: Info, label: 'Consistency', desc: 'Consistent tone builds trust with passive candidates.' },
      { icon: Zap, label: 'AI writing', desc: 'Your tone guides our AI when composing job descriptions.' },
    ],
  },
  {
    title: 'Team access',
    items: [
      { icon: Info, label: 'Collaboration', desc: 'Multiple reviewers reduce individual bias in hiring.' },
      { icon: Lock, label: 'Permissions', desc: 'Each role has scoped access — no over-sharing.' },
    ],
  },
]

export default function RecruiterOnboarding() {
  const { refreshUser } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [industry, setIndustry] = useState('')
  const [companySize, setCompanySize] = useState('')
  const [values, setValues] = useState<string[]>([])
  const [valueInput, setValueInput] = useState('')
  const [description, setDescription] = useState('')
  const [tone, setTone] = useState('')
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('round_robin')
  const [inviteRows, setInviteRows] = useState<InviteDraft[]>([])
  const [inviteInput, setInviteInput] = useState('')
  const [inviteRole, setInviteRole] = useState<'recruiter' | 'admin'>('recruiter')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [stepError, setStepError] = useState('')

  const companyForm = useForm<CompanyForm>({ resolver: zodResolver(companySchema) })
  const missionForm = useForm<MissionForm>({ resolver: zodResolver(missionSchema) })

  const addValue = () => {
    const v = valueInput.trim()
    if (v && !values.includes(v)) setValues((p) => [...p, v])
    setValueInput('')
  }

  const addInvite = () => {
    const e = inviteInput.trim()
    if (e && !inviteRows.some((row) => row.email === e)) {
      setInviteRows((prev) => [...prev, { email: e, role: inviteRole }])
    }
    setInviteInput('')
  }

  const handleNext = async () => {
    setStepError('')
    if (step === 0) {
      const valid = await companyForm.trigger()
      if (!valid) {
        const firstErrorField = Object.keys(companyForm.formState.errors)[0] as keyof CompanyForm | undefined
        if (firstErrorField) companyForm.setFocus(firstErrorField)
        setStepError('Please complete all required company details before continuing.')
        return
      }
    }
    if (step === 1) {
      const valid = await missionForm.trigger()
      if (!valid) {
        const firstErrorField = Object.keys(missionForm.formState.errors)[0] as keyof MissionForm | undefined
        if (firstErrorField) missionForm.setFocus(firstErrorField)
        setStepError('Please add a valid mission statement before continuing.')
        return
      }
    }
    setStep((s) => s + 1)
  }

  const finish = async () => {
    setSaving(true)
    setSaveError('')
    try {
      const companyValues = companyForm.getValues()
      const missionValues = missionForm.getValues()
      await api.post('/auth/onboarding', {
        ...companyValues,
        industry,
        companySize,
        assignmentMode,
        mission: missionValues.mission,
        vision: missionValues.vision,
        values,
        description,
        tone,
      })
      if (inviteRows.length) {
        await Promise.all(
          inviteRows.map((invite) =>
            api.post('/admin/team/invite', {
              email: invite.email,
              role: invite.role,
              teamName: companyValues.teamName,
            }),
          ),
        )
      }
      await refreshUser()
      navigate('/recruiter/dashboard')
    } catch {
      setSaveError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const companyVals = companyForm.watch()
  const missionVals = missionForm.watch()
  const sidebar = WHY_ASK[Math.min(step, WHY_ASK.length - 1)]
  const workspaceSummary = useMemo(() => {
    if (assignmentMode === 'manual') return 'Jobs stay unassigned until an admin chooses an owner.'
    return 'Every new job is assigned automatically to the next recruiter in this team.'
  }, [assignmentMode])

  return (
    <div className="auth-doodle-bg flex min-h-screen">
      {/* Left — form area */}
      <div className="flex flex-1 flex-col px-6 py-10 lg:px-16">
        <div className="mb-8">
          <span className="font-serif text-2xl font-bold text-primary">RekrootAI</span>
        </div>

        {/* Steps header */}
        <div className="mb-2 flex gap-6 text-sm">
          {STEPS.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => i < step && setStep(i)}
              className={cn(
                'font-medium transition-colors',
                i === step ? 'border-b-2 border-primary pb-1 text-primary' : 'text-muted-foreground',
                i < step ? 'cursor-pointer hover:text-foreground' : 'cursor-default',
              )}
            >
              <span className="mr-1 text-xs">STEP {String(i + 1).padStart(2, '0')}</span>
              {s}
            </button>
          ))}
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="mb-10 h-1" />

        <div className="flex flex-1 gap-10">
          {/* Form card */}
          <div className="flex-1">
            <h1 className="mb-6 font-serif text-3xl font-semibold">
              {['Company Profile', 'Workspace Setup', 'Brand Identity', 'Invite Your Team', 'Almost there!'][step]}
            </h1>

            {/* ── Step 0: Company ── */}
            {step === 0 && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label>Legal entity name <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. Editorial Intelligence Ltd." {...companyForm.register('legalName')} />
                  {companyForm.formState.errors.legalName && <p className="text-xs text-destructive">{companyForm.formState.errors.legalName.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Trade name (public) <span className="text-destructive">*</span></Label>
                    <Input placeholder="The Atelier" {...companyForm.register('companyName')} />
                    {companyForm.formState.errors.companyName && <p className="text-xs text-destructive">{companyForm.formState.errors.companyName.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>First team / workspace <span className="text-destructive">*</span></Label>
                    <Input placeholder="Core Hiring Team" {...companyForm.register('teamName')} />
                    <p className="text-xs text-muted-foreground">This keeps jobs and recruiters grouped safely from day one.</p>
                    {companyForm.formState.errors.teamName && <p className="text-xs text-destructive">{companyForm.formState.errors.teamName.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Industry</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                    >
                      <option value="">Select industry</option>
                      {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Business registration number <span className="text-destructive">*</span></Label>
                    <Input placeholder="RC1234567" {...companyForm.register('registrationNumber')} />
                    {companyForm.formState.errors.registrationNumber && <p className="text-xs text-destructive">{companyForm.formState.errors.registrationNumber.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tax ID (optional)</Label>
                    <Input placeholder="TIN-XXXX" {...companyForm.register('taxId')} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Corporate business email <span className="text-destructive">*</span></Label>
                  <Input placeholder="hiring@yourcompany.com" {...companyForm.register('businessEmail')} />
                  {companyForm.formState.errors.businessEmail && <p className="text-xs text-destructive">{companyForm.formState.errors.businessEmail.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Size band</Label>
                    <div className="flex flex-wrap gap-2">
                      {SIZES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setCompanySize(s)}
                          className={cn(
                            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                            companySize === s ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/50',
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>HQ country <span className="text-destructive">*</span></Label>
                    <Input placeholder="Nigeria" {...companyForm.register('hqCountry')} />
                    {companyForm.formState.errors.hqCountry && <p className="text-xs text-destructive">{companyForm.formState.errors.hqCountry.message}</p>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Company website <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    placeholder="https://yourcompany.com"
                    {...companyForm.register('website')}
                  />
                  {companyForm.formState.errors.website && <p className="text-xs text-destructive">{companyForm.formState.errors.website.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Your job title <span className="text-destructive">*</span></Label>
                    <Input placeholder="Head of Talent" {...companyForm.register('jobTitle')} />
                    {companyForm.formState.errors.jobTitle && <p className="text-xs text-destructive">{companyForm.formState.errors.jobTitle.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input type="tel" placeholder="+234 800 000 0000" {...companyForm.register('phone')} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 1: Mission & Values ── */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="rounded-2xl border bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Workspace flow</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Create company, define the first team, choose how jobs get owned, then invite the right people into that team.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setAssignmentMode('round_robin')}
                    className={cn(
                      'rounded-2xl border p-4 text-left transition-colors',
                      assignmentMode === 'round_robin' ? 'border-primary bg-primary/10' : 'hover:border-primary/40',
                    )}
                  >
                    <p className="font-medium">Round robin by team</p>
                    <p className="mt-1 text-sm text-muted-foreground">Best for agencies or shared hiring pods. New jobs rotate automatically between recruiters.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignmentMode('manual')}
                    className={cn(
                      'rounded-2xl border p-4 text-left transition-colors',
                      assignmentMode === 'manual' ? 'border-primary bg-primary/10' : 'hover:border-primary/40',
                    )}
                  >
                    <p className="font-medium">Manual ownership</p>
                    <p className="mt-1 text-sm text-muted-foreground">Best when one person wants to decide ownership for every role before pipeline work starts.</p>
                  </button>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-medium">What this means for your team</p>
                  <p className="mt-1">{workspaceSummary}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Mission statement <span className="text-destructive">*</span></Label>
                  <textarea
                    rows={4}
                    className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="e.g. To connect talent with purpose-driven organisations through fair, transparent AI hiring."
                    {...missionForm.register('mission')}
                  />
                  {missionForm.formState.errors.mission && <p className="text-xs text-destructive">{missionForm.formState.errors.mission.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Vision <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    placeholder="Where do you see the company in 10 years?"
                    {...missionForm.register('vision')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Core values</Label>
                  <p className="text-xs text-muted-foreground">Add values that define how your company operates.</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. Integrity, Innovation, Inclusion"
                      value={valueInput}
                      onChange={(e) => setValueInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addValue())}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={addValue}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {values.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {values.map((v) => (
                        <span key={v} className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                          {v}
                          <button type="button" onClick={() => setValues((p) => p.filter((x) => x !== v))}>
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Step 2: Branding ── */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label>Company description</Label>
                  <p className="text-xs text-muted-foreground">Shown to candidates on your job listings.</p>
                  <textarea
                    rows={5}
                    className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Tell candidates what makes your company a great place to work..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Brand tone of voice</Label>
                  <p className="text-xs text-muted-foreground">This guides our AI when writing job descriptions for you.</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {TONES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTone(t)}
                        className={cn(
                          'rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                          tone === t ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:border-primary/40',
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 3: Team ── */}
            {step === 3 && (
              <div className="space-y-5">
                <p className="text-sm text-muted-foreground">
                  Invite colleagues to collaborate on hiring. Choose whether each person can only manage pipeline work or administer the workspace too.
                </p>
                <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                  <Input
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addInvite())}
                  />
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'recruiter' | 'admin')}
                  >
                    <option value="recruiter">Recruiter only</option>
                    <option value="admin">Admin + job creation</option>
                  </select>
                  <Button type="button" variant="outline" onClick={addInvite}>Invite</Button>
                </div>
                <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                  <p className="font-medium">Team destination</p>
                  <p className="mt-1 text-muted-foreground">
                    Everyone invited here will join <strong>{companyVals.teamName || 'your first team'}</strong>. You can add more teams later.
                  </p>
                </div>
                {inviteRows.length > 0 ? (
                  <div className="space-y-2">
                    {inviteRows.map((invite) => (
                      <div key={invite.email} className="flex items-center justify-between rounded-lg border px-4 py-2 text-sm">
                        <div>
                          <p className="font-medium">{invite.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {invite.role === 'admin' ? 'Workspace admin, can create jobs and manage assignments' : 'Recruiter, can manage assigned pipeline work'}
                          </p>
                        </div>
                        <button type="button" onClick={() => setInviteRows((p) => p.filter((x) => x.email !== invite.email))} className="text-muted-foreground hover:text-destructive">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                    <div className="rounded-xl border-2 border-dashed p-8 text-center text-sm text-muted-foreground">
                    No invites added yet — solo teams are supported, and you can always add people later.
                  </div>
                )}
              </div>
            )}

            {/* ── Step 4: Review ── */}
            {step === 4 && (
              <div className="space-y-5">
                <div className="space-y-2 rounded-xl bg-muted/50 p-5 text-sm">
                  {[
                    ['Company', companyVals.companyName || '—'],
                    ['Team', companyVals.teamName || '—'],
                    ['Legal name', companyVals.legalName || '—'],
                    ['Industry', industry || '—'],
                    ['Size', companySize || '—'],
                    ['Country', companyVals.hqCountry || '—'],
                    ['Website', companyVals.website || '—'],
                    ['Assignment mode', assignmentMode === 'manual' ? 'Manual ownership' : 'Round robin by team'],
                    ['Mission', missionVals.mission ? `${missionVals.mission.slice(0, 60)}…` : '—'],
                    ['Values', values.length ? values.join(', ') : 'None added'],
                    ['Tone', tone || 'Not selected'],
                    ['Team invites', inviteRows.length ? `${inviteRows.length} pending` : 'None'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 border-b pb-2 last:border-0">
                      <span className="shrink-0 text-muted-foreground">{label}</span>
                      <span className="text-right font-medium">{value}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>Your workspace is ready. Jobs will stay inside <strong>{companyVals.teamName || 'your first team'}</strong>, and you can update these rules later from <strong>Settings → Company</strong>.</p>
                </div>
                {saveError && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {saveError}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar — Why we ask */}
          {step < 4 && (
            <div className="hidden w-64 shrink-0 lg:block">
              <div className="sticky top-0 rounded-2xl border bg-card p-5">
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {sidebar.title}
                </p>
                <div className="space-y-4">
                  {sidebar.items.map(({ icon: Icon, label, desc }) => (
                    <div key={label} className="flex gap-3">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Icon className="h-3 w-3 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 text-xs text-muted-foreground">
                  <span className="font-medium">{Math.round(((step + 1) / STEPS.length) * 100)}% profile maturity</span>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.round(((step + 1) / STEPS.length) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <div className="mt-10 flex justify-between">
          <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex gap-3">
            {stepError && (
              <p className="self-center text-sm text-destructive">{stepError}</p>
            )}
            {step < STEPS.length - 1 ? (
              <>
                {step >= 2 && (
                  <Button variant="ghost" onClick={() => setStep((s) => s + 1)}>
                    Skip
                  </Button>
                )}
                <Button onClick={handleNext}>
                  Continue <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button onClick={finish} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Launch workspace
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
