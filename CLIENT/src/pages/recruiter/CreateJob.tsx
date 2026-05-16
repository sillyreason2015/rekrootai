import { useState, KeyboardEvent, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2, X, MapPin, ImagePlus } from 'lucide-react'
import InfoTip from '../../components/shared/InfoTip'
import { jobService } from '../../services/job.service'
import api from '../../lib/axios'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Progress } from '../../components/ui/progress'

const STEPS = ['Job Details', 'Requirements', 'Assessment', 'Review & Post']
const FIELD_LIMITS = {
  title: 120,
  department: 80,
  location: 160,
  description: 4000,
  listItem: 180,
  question: 220,
}

const schema = z.object({
  title: z.string().min(3),
  department: z.string().min(2),
  level: z.enum(['graduate', 'entry', 'mid', 'senior', 'lead', 'executive']).default('mid'),
  positionsCount: z.coerce.number().min(1).default(1),
  location: z.string().min(1).default('Undisclosed'),
  type: z.enum(['full-time', 'part-time', 'contract', 'internship']),
  remote: z.enum(['on-site', 'hybrid', 'remote']),
  description: z.string().min(50),
  salaryMin: z.coerce.number().optional(),
  salaryMax: z.coerce.number().optional(),
  salaryCurrency: z.string().default('₦'),
  requirements: z.array(z.object({ value: z.string() })).default([]),
  responsibilities: z.array(z.object({ value: z.string() })).default([]),
  skills: z.array(z.object({ value: z.string() })).default([]),
  departmentHiring: z.array(z.object({ department: z.string().min(2), seats: z.coerce.number().min(1) })).default([]),
  requiresQuestionnaire: z.boolean().default(true),
  applicationQuestions: z.array(z.object({ question: z.string().min(6), required: z.boolean().default(true) })).default([]),
  assessmentModules: z.array(z.object({
    type: z.enum(['aptitude', 'technical', 'situational', 'personality', 'values']),
    timeLimit: z.coerce.number().min(5).max(120),
    weight: z.coerce.number().min(0.1).max(1),
  })).default([]),
  thresholds: z.object({
    assessment: z.coerce.number().min(0).max(100).default(60),
    fairness: z.coerce.number().min(0).max(100).default(50),
    interview: z.coerce.number().min(0).max(100).default(60),
  }).default({ assessment: 60, fairness: 50, interview: 60 }),
})
type FormData = z.infer<typeof schema>

export default function CreateJob() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [locationTags, setLocationTags] = useState<string[]>([])
  const [locationInput, setLocationInput] = useState('')
  const [locationUndisclosed, setLocationUndisclosed] = useState(false)
  const [salaryUndisclosed, setSalaryUndisclosed] = useState(false)
  const [bannerPreview, setBannerPreview] = useState('')
  const [_bannerUploading, setBannerUploading] = useState(false)
  const [pendingBannerFile, setPendingBannerFile] = useState<File | null>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'full-time',
      remote: 'hybrid',
      level: 'mid',
      positionsCount: 1,
      location: 'Undisclosed',
      salaryCurrency: '₦',
      requirements: [{ value: '' }],
      responsibilities: [{ value: '' }],
      skills: [{ value: '' }],
      departmentHiring: [{ department: '', seats: 1 }],
      requiresQuestionnaire: true,
      applicationQuestions: [
        { question: 'Why are you interested in this role?', required: true },
        { question: 'Describe one recent project relevant to this job.', required: true },
      ],
      assessmentModules: [{ type: 'aptitude', timeLimit: 20, weight: 0.25 }],
      thresholds: { assessment: 60, fairness: 50, interview: 60 },
    },
  })

  const { fields: reqFields, append: addReq, remove: rmReq } = useFieldArray({ control: form.control, name: 'requirements' })
  const { fields: respFields, append: addResp, remove: rmResp } = useFieldArray({ control: form.control, name: 'responsibilities' })
  const { fields: skillFields, append: addSkill, remove: rmSkill } = useFieldArray({ control: form.control, name: 'skills' })
  const { fields: modFields, append: addMod, remove: rmMod } = useFieldArray({ control: form.control, name: 'assessmentModules' })
  const { fields: deptFields, append: addDept, remove: rmDept } = useFieldArray({ control: form.control, name: 'departmentHiring' })
  const { fields: qFields, append: addQ, remove: rmQ } = useFieldArray({ control: form.control, name: 'applicationQuestions' })

  const buildPayload = (data: FormData, status: 'draft' | 'published') => ({
    ...data,
    requirements: data.requirements.map((r) => r.value).filter(Boolean),
    responsibilities: data.responsibilities.map((r) => r.value).filter(Boolean),
    skills: data.skills.map((s) => s.value).filter(Boolean),
    status,
    thresholds: {
      assessment: data.thresholds.assessment,       // stored as 0-100 (e.g. 60)
      fairness: data.thresholds.fairness / 100,     // stored as 0-1 (e.g. 0.5)
      interview: data.thresholds.interview,         // stored as 0-100 (e.g. 60)
    },
  })

  const uploadBannerForJob = async (jobId: string, file: File) => {
    setBannerUploading(true)
    try {
      const form = new FormData()
      form.append('banner', file)
      await api.post(`/companies/jobs/${jobId}/banner`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    } finally { setBannerUploading(false) }
  }

  // Draft: skip validation entirely — save whatever exists
  const onSaveDraft = async () => {
    setPublishing(true)
    setSubmitError('')
    try {
      const data = form.getValues()
      const job = await jobService.create(buildPayload(data, 'draft'))
      if (pendingBannerFile && job._id) await uploadBannerForJob(job._id, pendingBannerFile)
      navigate('/recruiter/jobs')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setSubmitError(msg ?? 'Failed to save draft. Please try again.')
    } finally {
      setPublishing(false)
    }
  }

  const onPublish = form.handleSubmit(
    async (data) => {
      setPublishing(true)
      setSubmitError('')
      try {
        const job = await jobService.create(buildPayload(data, 'published'))
        if (pendingBannerFile && job._id) await uploadBannerForJob(job._id, pendingBannerFile)
        navigate(`/recruiter/shortlist?job=${job._id}`)
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        setSubmitError(msg ?? 'Failed to publish. Check the question bank has enough questions first.')
      } finally {
        setPublishing(false)
      }
    },
    (errors) => {
      // Navigate to first step with errors so user can see them
      const fields = Object.keys(errors)
      const step0Fields = ['title', 'department', 'level', 'positionsCount', 'location', 'type', 'remote', 'description', 'salaryCurrency']
      const step1Fields = ['requirements', 'responsibilities', 'skills', 'applicationQuestions']
      const step2Fields = ['assessmentModules', 'thresholds']
      if (fields.some((f) => step0Fields.includes(f))) { setStep(0) }
      else if (fields.some((f) => step1Fields.includes(f))) { setStep(1) }
      else if (fields.some((f) => step2Fields.includes(f))) { setStep(2) }
      setSubmitError('Please fix the highlighted fields before publishing.')
    }
  )

  const syncLocation = (tags: string[], undisclosed: boolean) => {
    form.setValue('location', undisclosed ? 'Undisclosed' : tags.join(', ') || 'Undisclosed', { shouldValidate: true })
  }

  const addLocationTag = (val: string) => {
    const trimmed = val.trim().replace(/,+$/, '')
    if (!trimmed || locationTags.includes(trimmed)) return
    const next = [...locationTags, trimmed]
    setLocationTags(next)
    setLocationInput('')
    syncLocation(next, locationUndisclosed)
  }

  const removeLocationTag = (tag: string) => {
    const next = locationTags.filter((t) => t !== tag)
    setLocationTags(next)
    syncLocation(next, locationUndisclosed)
  }

  const toggleUndisclosed = (val: boolean) => {
    setLocationUndisclosed(val)
    syncLocation(locationTags, val)
  }

  const { register, watch } = form
  const values = watch()
  const fieldMeta = (required = true, maxLength?: number) => (
    <span className="text-xs text-muted-foreground font-normal">
      {required ? 'Required' : 'Optional'}{typeof maxLength === 'number' ? ` · Max ${maxLength} chars` : ''}
    </span>
  )

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Post a New Job</h1>
        <p className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          {STEPS.map((s, i) => <span key={s} className={i === step ? 'font-medium text-primary' : ''}>{s}</span>)}
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} />
      </div>

      <div className="rounded-2xl border bg-card p-8 shadow-sm space-y-5">
        {step === 0 && (
          <>
            <h2 className="font-serif text-xl font-semibold">Job Details</h2>
            <div className="space-y-1.5">
              <Label className="flex items-center justify-between gap-2">Job Title {fieldMeta(true, FIELD_LIMITS.title)}</Label>
              <Input placeholder="Senior React Developer" maxLength={FIELD_LIMITS.title} {...register('title')} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="flex items-center justify-between gap-2">Department {fieldMeta(true, FIELD_LIMITS.department)}</Label>
                <Input placeholder="Engineering" maxLength={FIELD_LIMITS.department} {...register('department')} />
              </div>
              <div className="space-y-1.5">
                <Label>Level</Label>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" {...register('level')}>
                  {['graduate', 'entry', 'mid', 'senior', 'lead', 'executive'].map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Open Positions</Label>
                <Input type="number" min={1} {...register('positionsCount')} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Location(s)</Label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                  <input type="checkbox" checked={locationUndisclosed} onChange={(e) => toggleUndisclosed(e.target.checked)} />
                  Undisclosed / Remote only
                </label>
                {!locationUndisclosed && (
                  <>
                    <div className="flex min-h-[38px] flex-wrap gap-1.5 rounded-md border border-input bg-background px-2 py-1.5">
                      {locationTags.map((tag) => (
                        <span key={tag} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                          {tag}
                          <button type="button" onClick={() => removeLocationTag(tag)}><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                      <input
                        className="flex-1 min-w-[140px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        placeholder="Type city, press Enter or comma…"
                        value={locationInput}
                        onChange={(e) => setLocationInput(e.target.value)}
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLocationTag(locationInput) }
                          if (e.key === 'Backspace' && !locationInput && locationTags.length) removeLocationTag(locationTags[locationTags.length - 1])
                        }}
                        onBlur={() => { if (locationInput) addLocationTag(locationInput) }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Press Enter or comma to add each city. e.g. Lagos · Abuja · Remote</p>
                  </>
                )}
                {locationUndisclosed && (
                  <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">Location: Undisclosed</div>
                )}
                {/* hidden field so react-hook-form tracks the value */}
                <input type="hidden" {...register('location')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Hiring by Department</Label>
              {deptFields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-[1fr_120px_40px] gap-2">
                  <Input placeholder="Department name" {...register(`departmentHiring.${i}.department`)} />
                  <Input type="number" min={1} {...register(`departmentHiring.${i}.seats`)} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => rmDept(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => addDept({ department: '', seats: 1 })}>
                <Plus className="h-4 w-4" /> Add Department Slot
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Employment Type</Label>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" {...register('type')}>
                  {['full-time', 'part-time', 'contract', 'internship'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Work Arrangement</Label>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" {...register('remote')}>
                  {['on-site', 'hybrid', 'remote'].map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Salary</Label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={salaryUndisclosed}
                    onChange={(e) => {
                      setSalaryUndisclosed(e.target.checked)
                      if (e.target.checked) { form.setValue('salaryMin', undefined); form.setValue('salaryMax', undefined) }
                    }} />
                  Undisclosed
                </label>
              </div>
              {salaryUndisclosed ? (
                <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">Salary: Undisclosed</div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Currency</Label>
                    <Input {...register('salaryCurrency')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Min Salary</Label>
                    <Input type="number" placeholder="300000" {...register('salaryMin')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max Salary</Label>
                    <Input type="number" placeholder="500000" {...register('salaryMax')} />
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center justify-between gap-2">Job Description {fieldMeta(true, FIELD_LIMITS.description)}</Label>
              <textarea
                rows={6}
                className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Describe the role, responsibilities, and what makes it exciting..."
                maxLength={FIELD_LIMITS.description}
                {...register('description')}
              />
            </div>
            {/* Banner upload */}
            <div className="space-y-2">
              <Label>Job Banner Image <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
              <div
                className="relative flex h-32 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-input bg-muted/40 hover:border-primary/50 transition-colors"
                onClick={() => bannerInputRef.current?.click()}
              >
                {bannerPreview ? (
                  <>
                    <img src={bannerPreview} alt="banner" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <p className="text-white text-sm font-medium">Click to replace</p>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <ImagePlus className="h-6 w-6" />
                    <p className="text-xs">Click to upload a banner · PNG, JPG · max 4 MB</p>
                  </div>
                )}
              </div>
              <input ref={bannerInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  setPendingBannerFile(f)
                  setBannerPreview(URL.createObjectURL(f))
                }} />
              {bannerPreview && (
                <button type="button" className="text-xs text-destructive hover:underline"
                  onClick={() => { setBannerPreview(''); setPendingBannerFile(null); if (bannerInputRef.current) bannerInputRef.current.value = '' }}>
                  Remove banner
                </button>
              )}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="font-serif text-xl font-semibold">Requirements & Skills</h2>

            <div className="space-y-2">
              <Label className="flex items-center justify-between gap-2">Requirements {fieldMeta(true, FIELD_LIMITS.listItem)}</Label>
              {reqFields.map((f, i) => (
                <div key={f.id} className="flex gap-2">
                  <Input placeholder={`Requirement ${i + 1}`} maxLength={FIELD_LIMITS.listItem} {...register(`requirements.${i}.value`)} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => rmReq(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => addReq({ value: '' })}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center justify-between gap-2">Responsibilities {fieldMeta(true, FIELD_LIMITS.listItem)}</Label>
              {respFields.map((f, i) => (
                <div key={f.id} className="flex gap-2">
                  <Input placeholder={`Responsibility ${i + 1}`} maxLength={FIELD_LIMITS.listItem} {...register(`responsibilities.${i}.value`)} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => rmResp(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => addResp({ value: '' })}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center justify-between gap-2">Required Skills {fieldMeta(true, FIELD_LIMITS.listItem)}</Label>
              <div className="space-y-2">
                {skillFields.map((f, i) => (
                  <div key={f.id} className="flex gap-2">
                    <Input placeholder={`Skill ${i + 1}`} maxLength={FIELD_LIMITS.listItem} {...register(`skills.${i}.value`)} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => rmSkill(i)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => addSkill({ value: '' })}>
                <Plus className="h-4 w-4" /> Add Skill
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center justify-between gap-2">Application Questions {fieldMeta(false, FIELD_LIMITS.question)}</Label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" {...register('requiresQuestionnaire')} />
                  Require answers before apply
                </label>
              </div>
              {qFields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-[1fr_120px_40px] gap-2">
                  <Input placeholder={`Question ${i + 1}`} maxLength={FIELD_LIMITS.question} {...register(`applicationQuestions.${i}.question`)} />
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" {...register(`applicationQuestions.${i}.required`)} /> Required
                  </label>
                  <Button type="button" variant="ghost" size="icon" onClick={() => rmQ(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => addQ({ question: '', required: true })}>
                <Plus className="h-4 w-4" /> Add Question
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="font-serif text-xl font-semibold">Assessment Modules</h2>
            <p className="text-sm text-muted-foreground">Configure the AI-proctored assessment for this role.</p>
            {modFields.map((f, i) => (
              <div key={f.id} className="rounded-xl border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Module {i + 1}</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => rmMod(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1">
                      Type
                      <InfoTip content="Aptitude: numerical/logical reasoning. Technical: role-specific skills. Situational: scenario judgement. Personality: traits & working style. Values: alignment with company culture and ethics." />
                    </Label>
                    <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" {...register(`assessmentModules.${i}.type`)}>
                      {['aptitude', 'technical', 'situational', 'personality', 'values'].map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Time (min)</Label>
                    <Input type="number" {...register(`assessmentModules.${i}.timeLimit`)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1">
                      Weight (0–1)
                      <InfoTip content="How much this module contributes to the composite assessment score. All module weights are normalised, so total does not need to equal 1. Higher weight = more influence on ranking." />
                    </Label>
                    <Input type="number" step="0.05" {...register(`assessmentModules.${i}.weight`)} />
                  </div>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => addMod({ type: 'technical', timeLimit: 20, weight: 0.25 })}>
              <Plus className="h-4 w-4" /> Add Module
            </Button>

            {/* AI Decision Thresholds */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4 mt-2">
              <div>
                <h3 className="text-sm font-semibold text-primary">AI Decision Thresholds</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Candidates scoring below these thresholds are automatically failed at each gate.
                  The AI explains the decision to them immediately. You can override at any time.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 flex-wrap">
                    Assessment pass mark
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">auto-reject below</span>
                    <InfoTip content="Candidates who score below this on the combined assessment modules are automatically moved to rejected and receive an explanation. You can override any rejection manually." />
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      {...register('thresholds.assessment')}
                      className="w-full"
                    />
                    <span className="text-sm text-muted-foreground shrink-0">%</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Default: 60%</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 flex-wrap">
                    Fairness gate threshold
                    <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">bias control</span>
                    <InfoTip content="The minimum disparate impact ratio (0–100%) allowed before the gate flags a decision. A ratio below this means one demographic group is being selected at significantly lower rates than another. 80% is the legal 4/5ths rule standard." />
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      {...register('thresholds.fairness')}
                      className="w-full"
                    />
                    <span className="text-sm text-muted-foreground shrink-0">%</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Disparate impact ratio (default: 50%)</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 flex-wrap">
                    Interview pass mark
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">post-interview</span>
                    <InfoTip content="After the structured interview is scored on a rubric, candidates below this threshold are flagged for review rather than automatically advanced to final decision. You retain full override control." />
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      {...register('thresholds.interview')}
                      className="w-full"
                    />
                    <span className="text-sm text-muted-foreground shrink-0">%</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Default: 60%</p>
                </div>
              </div>

              <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <strong>How thresholds work:</strong> If a candidate scores below the assessment mark, the AI immediately
                rejects them and sends a personalised explanation to their dashboard. The fairness gate checks for
                demographic disparate impact — if bias is detected, the AI applies a correction before the interview stage.
                The interview mark guides the recruiter&apos;s final decision but does not auto-reject.
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="font-serif text-xl font-semibold">Review & Publish</h2>
            <div className="space-y-3 rounded-xl bg-muted/50 p-5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Title</span><span className="font-medium">{values.title}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Department</span><span>{values.department}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Location</span><span>{values.location}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{values.type}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Remote</span><span>{values.remote}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Assessment Modules</span><span>{values.assessmentModules?.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Skills Required</span><span>{values.skills?.filter((s) => s.value).length}</span></div>
              <div className="border-t pt-3 mt-1">
                <p className="text-muted-foreground text-xs font-medium mb-2">AI Thresholds</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Assessment pass mark</span><span className="font-medium">{values.thresholds?.assessment ?? 60}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Fairness gate</span><span className="font-medium">{values.thresholds?.fairness ?? 50}% disparate impact</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Interview guide</span><span className="font-medium">{values.thresholds?.interview ?? 60}%</span></div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Publishing will make this role visible to all candidates on the job board.</p>
          </>
        )}
      </div>

      {submitError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {submitError}
        </div>
      )}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex gap-2">
          {step === STEPS.length - 1 && (
            <Button variant="outline" onClick={onSaveDraft} disabled={publishing}>
              Save Draft
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={onPublish} disabled={publishing}>
              {publishing && <Loader2 className="h-4 w-4 animate-spin" />}
              Publish Job
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
