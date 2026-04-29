import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronLeft, ChevronRight, Loader2, Plus, X, Upload } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { candidateService } from '../../services/candidate.service'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Progress } from '../../components/ui/progress'

const STEPS = ['Profile', 'Skills', 'Experience', 'Education', 'CV Upload', 'Review']

const profileSchema = z.object({
  headline: z.string().min(5, 'Add a short headline'),
  location: z.string().min(2, 'Enter your location'),
  linkedIn: z.string().url('Enter a valid URL').optional().or(z.literal('')),
  portfolio: z.string().url('Enter a valid URL').optional().or(z.literal('')),
})

export default function Onboarding() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [skills, setSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm({ resolver: zodResolver(profileSchema) })

  const addSkill = () => {
    const s = skillInput.trim()
    if (s && !skills.includes(s)) setSkills((prev) => [...prev, s])
    setSkillInput('')
  }

  const finish = async () => {
    setSaving(true)
    try {
      const values = getValues()
      await candidateService.completeOnboarding({ ...values, skills })
      if (cvFile) await candidateService.uploadCv(cvFile)
      await refreshUser()
      navigate('/candidate/dashboard')
    } catch {
      // TODO toast
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <span className="font-serif text-2xl font-bold text-primary">RekrootAI</span>
          <h1 className="mt-2 font-serif text-2xl font-semibold">Set up your profile</h1>
          <p className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
        </div>

        {/* Progress */}
        <div className="mb-8 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            {STEPS.map((s, i) => (
              <span key={s} className={i === step ? 'font-medium text-primary' : ''}>{s}</span>
            ))}
          </div>
          <Progress value={((step + 1) / STEPS.length) * 100} />
        </div>

        {/* Step content */}
        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="font-serif text-xl font-semibold">Tell us about yourself</h2>
              <div className="space-y-1.5">
                <Label>Professional headline</Label>
                <Input placeholder="e.g. Full-Stack Developer | React & Node.js" {...register('headline')} />
                {errors.headline && <p className="text-xs text-destructive">{String(errors.headline.message)}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input placeholder="Lagos, Nigeria" {...register('location')} />
                {errors.location && <p className="text-xs text-destructive">{String(errors.location.message)}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>LinkedIn URL <span className="text-muted-foreground">(optional)</span></Label>
                <Input placeholder="https://linkedin.com/in/..." {...register('linkedIn')} />
              </div>
              <div className="space-y-1.5">
                <Label>Portfolio URL <span className="text-muted-foreground">(optional)</span></Label>
                <Input placeholder="https://yourportfolio.com" {...register('portfolio')} />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-serif text-xl font-semibold">Your skills</h2>
              <p className="text-sm text-muted-foreground">Add the skills that best represent your expertise.</p>
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
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => (
                  <span
                    key={s}
                    className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                  >
                    {s}
                    <button onClick={() => setSkills((prev) => prev.filter((x) => x !== s))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-serif text-xl font-semibold">Work experience</h2>
              <p className="text-sm text-muted-foreground">
                Your experience will be parsed from your CV in the next step. You can also add it manually later from your profile.
              </p>
              <div className="rounded-xl border-2 border-dashed border-border p-8 text-center text-muted-foreground">
                <p className="text-sm">Experience entries will be auto-populated from your CV.</p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-serif text-xl font-semibold">Education</h2>
              <p className="text-sm text-muted-foreground">
                Education details will also be extracted from your CV automatically.
              </p>
              <div className="rounded-xl border-2 border-dashed border-border p-8 text-center text-muted-foreground">
                <p className="text-sm">Education entries will be auto-populated from your CV.</p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="font-serif text-xl font-semibold">Upload your CV</h2>
              <p className="text-sm text-muted-foreground">
                Upload a PDF or DOCX. Our AI will extract your experience, skills and education automatically.
              </p>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-10 hover:border-primary/50 hover:bg-accent/50 transition-colors">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">{cvFile ? cvFile.name : 'Click to upload'}</p>
                  <p className="text-xs text-muted-foreground">PDF or DOCX, max 10 MB</p>
                </div>
                <input
                  type="file"
                  accept=".pdf,.docx"
                  className="hidden"
                  onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="font-serif text-xl font-semibold">All done!</h2>
              <p className="text-sm text-muted-foreground">
                Review your profile below, then hit <strong>Complete</strong> to start exploring jobs.
              </p>
              <div className="space-y-2 rounded-xl bg-muted/50 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span>{user?.firstName} {user?.lastName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span>{user?.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Skills</span>
                  <span>{skills.length} added</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CV</span>
                  <span>{cvFile ? cvFile.name : 'Not uploaded'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <div className="mt-6 flex justify-between">
          <Button
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}>
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
