import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronLeft, ChevronRight, Loader2, Plus, X, Upload, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { candidateService } from '../../services/candidate.service'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Progress } from '../../components/ui/progress'
import { cn } from '../../lib/utils'

const STEPS = ['Profile', 'Skills', 'Diversity', 'CV Upload', 'Review']

const profileSchema = z.object({
  headline: z.string().min(5, 'Add a short headline (min 5 chars)'),
  location: z.string().min(2, 'Enter your location'),
  linkedIn: z.string().url('Enter a valid URL').optional().or(z.literal('')),
  portfolio: z.string().url('Enter a valid URL').optional().or(z.literal('')),
})
type ProfileForm = z.infer<typeof profileSchema>

const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say']
const AGE_OPTIONS = ['18–24', '25–34', '35–44', '45–54', '55+', 'Prefer not to say']
const ETHNICITY_OPTIONS = [
  'Asian / Asian British',
  'Black / African / Caribbean',
  'Hispanic / Latino',
  'Middle Eastern / North African',
  'Mixed / Multiple ethnic groups',
  'White / Caucasian',
  'Other',
  'Prefer not to say',
]

export default function Onboarding() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [skills, setSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [gender, setGender] = useState('Prefer not to say')
  const [ageRange, setAgeRange] = useState('Prefer not to say')
  const [ethnicity, setEthnicity] = useState('Prefer not to say')
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) })

  const addSkill = () => {
    const s = skillInput.trim()
    if (s && !skills.includes(s)) setSkills((prev) => [...prev, s])
    setSkillInput('')
  }

  const handleNext = async () => {
    if (step === 0) {
      const valid = await trigger()
      if (!valid) return
    }
    setStep((s) => s + 1)
  }

  const finish = handleSubmit(async () => {
    setSaving(true)
    setSaveError('')
    try {
      const values = getValues()
      await candidateService.completeOnboarding({
        ...values,
        skills,
        gender,
        ageRange,
        ethnicity,
      })
      if (cvFile) {
        try {
          await candidateService.uploadCv(cvFile)
        } catch {
          // CV upload failed — non-blocking, user can re-upload from profile
        }
      }
      await refreshUser()
      navigate('/candidate/dashboard')
    } catch {
      setSaveError('Something went wrong saving your profile. Please try again.')
    } finally {
      setSaving(false)
    }
  })

  return (
    <div className="auth-doodle-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <span className="font-serif text-2xl font-bold text-primary">RekrootAI</span>
          <h1 className="mt-2 font-serif text-2xl font-semibold">Set up your profile</h1>
          <p className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
        </div>

        {/* Step labels + progress */}
        <div className="mb-8 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            {STEPS.map((s, i) => (
              <span key={s} className={cn(i === step ? 'font-medium text-primary' : '')}>{s}</span>
            ))}
          </div>
          <Progress value={((step + 1) / STEPS.length) * 100} />
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          {/* Step 0 — Profile */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="font-serif text-xl font-semibold">Tell us about yourself</h2>
              <div className="space-y-1.5">
                <Label>Professional headline <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. Full-Stack Developer · React & Node.js" {...register('headline')} />
                {errors.headline && <p className="text-xs text-destructive">{errors.headline.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Location <span className="text-destructive">*</span></Label>
                <Input placeholder="Lagos, Nigeria" {...register('location')} />
                {errors.location && <p className="text-xs text-destructive">{errors.location.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>LinkedIn URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input placeholder="https://linkedin.com/in/..." {...register('linkedIn')} />
                {errors.linkedIn && <p className="text-xs text-destructive">{errors.linkedIn.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Portfolio URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input placeholder="https://yourportfolio.com" {...register('portfolio')} />
                {errors.portfolio && <p className="text-xs text-destructive">{errors.portfolio.message}</p>}
              </div>
            </div>
          )}

          {/* Step 1 — Skills */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-serif text-xl font-semibold">Your skills</h2>
              <p className="text-sm text-muted-foreground">Add the skills that best represent your expertise. Press Enter or + to add.</p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Python, SQL, Project Management"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                />
                <Button type="button" variant="outline" size="icon" onClick={addSkill}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {skills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {skills.map((s) => (
                    <span
                      key={s}
                      className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                    >
                      {s}
                      <button type="button" onClick={() => setSkills((prev) => prev.filter((x) => x !== s))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No skills added yet.</p>
              )}
            </div>
          )}

          {/* Step 2 — Diversity */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-serif text-xl font-semibold">About you</h2>
              <p className="text-sm text-muted-foreground">
                This information is used <strong>only</strong> to audit our AI for fairness and bias. It is never shared with recruiters or used in hiring decisions.
              </p>
              <div className="space-y-1.5">
                <Label>Gender identity</Label>
                <div className="grid grid-cols-2 gap-2">
                  {GENDER_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setGender(opt)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                        gender === opt ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:border-primary/40',
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Age range</Label>
                <div className="grid grid-cols-3 gap-2">
                  {AGE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAgeRange(opt)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-center text-sm transition-colors',
                        ageRange === opt ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:border-primary/40',
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Ethnic background</Label>
                <div className="grid grid-cols-1 gap-1.5">
                  {ETHNICITY_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setEthnicity(opt)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                        ethnicity === opt ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:border-primary/40',
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — CV Upload */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-serif text-xl font-semibold">Upload your CV</h2>
              <p className="text-sm text-muted-foreground">
                PDF or DOCX, max 10 MB. You can always update this later from your profile.
              </p>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-10 transition-colors hover:border-primary/50 hover:bg-accent/50">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">{cvFile ? cvFile.name : 'Click to upload'}</p>
                  <p className="text-xs text-muted-foreground">PDF or DOCX · max 10 MB</p>
                </div>
                <input
                  type="file"
                  accept=".pdf,.docx"
                  className="hidden"
                  onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {!cvFile && (
                <p className="text-center text-xs text-muted-foreground">CV upload is optional — you can skip and add it later.</p>
              )}
            </div>
          )}

          {/* Step 4 — Review */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="font-serif text-xl font-semibold">All done!</h2>
              <p className="text-sm text-muted-foreground">Review your info before completing.</p>
              <div className="space-y-2 rounded-xl bg-muted/50 p-4 text-sm">
                {[
                  ['Name', `${user?.firstName} ${user?.lastName}`],
                  ['Email', user?.email ?? '—'],
                  ['Headline', getValues('headline') || '—'],
                  ['Location', getValues('location') || '—'],
                  ['Skills', skills.length ? skills.join(', ') : 'None added'],
                  ['CV', cvFile ? cvFile.name : 'Not uploaded (can add later)'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span className="shrink-0 text-muted-foreground">{label}</span>
                    <span className="text-right">{value}</span>
                  </div>
                ))}
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

        {/* Navigation */}
        <div className="mt-6 flex justify-between">
          <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={handleNext}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Complete profile
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
