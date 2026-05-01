import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2 } from 'lucide-react'
import { jobService } from '../../services/job.service'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Progress } from '../../components/ui/progress'

const STEPS = ['Job Details', 'Requirements', 'Assessment', 'Review & Post']

const schema = z.object({
  title: z.string().min(3),
  department: z.string().min(2),
  location: z.string().min(2),
  type: z.enum(['full-time', 'part-time', 'contract', 'internship']),
  remote: z.enum(['on-site', 'hybrid', 'remote']),
  description: z.string().min(50),
  salaryMin: z.coerce.number().optional(),
  salaryMax: z.coerce.number().optional(),
  salaryCurrency: z.string().default('₦'),
  requirements: z.array(z.object({ value: z.string() })).default([]),
  responsibilities: z.array(z.object({ value: z.string() })).default([]),
  skills: z.array(z.object({ value: z.string() })).default([]),
  assessmentModules: z.array(z.object({
    type: z.enum(['aptitude', 'technical', 'situational', 'personality']),
    timeLimit: z.coerce.number().min(5).max(120),
    weight: z.coerce.number().min(0.1).max(1),
  })).default([]),
})
type FormData = z.infer<typeof schema>

export default function CreateJob() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'full-time',
      remote: 'hybrid',
      salaryCurrency: '₦',
      requirements: [{ value: '' }],
      responsibilities: [{ value: '' }],
      skills: [{ value: '' }],
      assessmentModules: [{ type: 'aptitude', timeLimit: 20, weight: 0.25 }],
    },
  })

  const { fields: reqFields, append: addReq, remove: rmReq } = useFieldArray({ control: form.control, name: 'requirements' })
  const { fields: respFields, append: addResp, remove: rmResp } = useFieldArray({ control: form.control, name: 'responsibilities' })
  const { fields: skillFields, append: addSkill, remove: rmSkill } = useFieldArray({ control: form.control, name: 'skills' })
  const { fields: modFields, append: addMod, remove: rmMod } = useFieldArray({ control: form.control, name: 'assessmentModules' })

  const buildPayload = (data: FormData, status: 'draft' | 'published') => ({
    ...data,
    requirements: data.requirements.map((r) => r.value).filter(Boolean),
    responsibilities: data.responsibilities.map((r) => r.value).filter(Boolean),
    skills: data.skills.map((s) => s.value).filter(Boolean),
    status,
  })

  const onSaveDraft = form.handleSubmit(async (data) => {
    setPublishing(true)
    setSubmitError('')
    try {
      await jobService.create(buildPayload(data, 'draft'))
      navigate('/recruiter/jobs')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setSubmitError(msg ?? 'Failed to save draft. Please try again.')
    } finally {
      setPublishing(false)
    }
  })

  const onPublish = form.handleSubmit(async (data) => {
    setPublishing(true)
    setSubmitError('')
    try {
      const job = await jobService.create(buildPayload(data, 'published'))
      navigate(`/recruiter/shortlist?job=${job._id}`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setSubmitError(msg ?? 'Failed to publish. Check the question bank has enough questions first.')
    } finally {
      setPublishing(false)
    }
  })

  const { register, watch } = form
  const values = watch()

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
              <Label>Job Title</Label>
              <Input placeholder="Senior React Developer" {...register('title')} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input placeholder="Engineering" {...register('department')} />
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input placeholder="Lagos, Nigeria" {...register('location')} />
              </div>
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
            <div className="space-y-1.5">
              <Label>Job Description</Label>
              <textarea
                rows={6}
                className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Describe the role, responsibilities, and what makes it exciting..."
                {...register('description')}
              />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="font-serif text-xl font-semibold">Requirements & Skills</h2>

            <div className="space-y-2">
              <Label>Requirements</Label>
              {reqFields.map((f, i) => (
                <div key={f.id} className="flex gap-2">
                  <Input placeholder={`Requirement ${i + 1}`} {...register(`requirements.${i}.value`)} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => rmReq(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => addReq({ value: '' })}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Responsibilities</Label>
              {respFields.map((f, i) => (
                <div key={f.id} className="flex gap-2">
                  <Input placeholder={`Responsibility ${i + 1}`} {...register(`responsibilities.${i}.value`)} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => rmResp(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => addResp({ value: '' })}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Required Skills</Label>
              <div className="space-y-2">
                {skillFields.map((f, i) => (
                  <div key={f.id} className="flex gap-2">
                    <Input placeholder={`Skill ${i + 1}`} {...register(`skills.${i}.value`)} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => rmSkill(i)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => addSkill({ value: '' })}>
                <Plus className="h-4 w-4" /> Add Skill
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
                    <Label>Type</Label>
                    <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" {...register(`assessmentModules.${i}.type`)}>
                      {['aptitude', 'technical', 'situational', 'personality'].map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Time (min)</Label>
                    <Input type="number" {...register(`assessmentModules.${i}.timeLimit`)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Weight (0–1)</Label>
                    <Input type="number" step="0.05" {...register(`assessmentModules.${i}.weight`)} />
                  </div>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => addMod({ type: 'technical', timeLimit: 20, weight: 0.25 })}>
              <Plus className="h-4 w-4" /> Add Module
            </Button>
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
