import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronLeft, Loader2, Plus, Trash2, Save, Globe } from 'lucide-react'
import { jobService } from '../../services/job.service'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import type { Job } from '../../types'

const schema = z.object({
  title: z.string().min(3, 'Title too short'),
  department: z.string().min(2, 'Department required'),
  level: z.enum(['graduate', 'entry', 'mid', 'senior', 'lead', 'executive']),
  positionsCount: z.coerce.number().min(1),
  type: z.enum(['full-time', 'part-time', 'contract', 'internship']),
  remote: z.enum(['on-site', 'hybrid', 'remote']),
  location: z.string().min(1),
  description: z.string().min(20, 'Description too short'),
  requirements: z.array(z.object({ value: z.string() })),
  responsibilities: z.array(z.object({ value: z.string() })),
  skills: z.array(z.object({ value: z.string() })),
  salaryMin: z.coerce.number().optional(),
  salaryMax: z.coerce.number().optional(),
  salaryCurrency: z.string().default('₦'),
})
type FormData = z.infer<typeof schema>

function toFieldArray(arr?: string[]): { value: string }[] {
  return (arr ?? []).map((v) => ({ value: v }))
}

export default function EditJob() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: job, isLoading } = useQuery<Job>({
    queryKey: ['job', id],
    queryFn: () => jobService.get(id!),
    enabled: !!id,
  })

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '', department: '', level: 'mid', positionsCount: 1,
      type: 'full-time', remote: 'hybrid', location: '',
      description: '', requirements: [{ value: '' }],
      responsibilities: [{ value: '' }], skills: [{ value: '' }],
      salaryCurrency: '₦',
    },
  })

  const { fields: reqFields, append: reqAppend, remove: reqRemove } = useFieldArray({ control: form.control, name: 'requirements' })
  const { fields: respFields, append: respAppend, remove: respRemove } = useFieldArray({ control: form.control, name: 'responsibilities' })
  const { fields: skillFields, append: skillAppend, remove: skillRemove } = useFieldArray({ control: form.control, name: 'skills' })

  // Populate form when job data loads
  useEffect(() => {
    if (!job) return
    const j = job as Job & { positionsCount?: number; salaryMin?: number; salaryMax?: number; salaryCurrency?: string; level?: string }
    form.reset({
      title: j.title ?? '',
      department: j.department ?? '',
      level: (j.level as FormData['level']) ?? 'mid',
      positionsCount: j.positionsCount ?? 1,
      type: (j.type as FormData['type']) ?? 'full-time',
      remote: (j.remote as FormData['remote']) ?? 'hybrid',
      location: j.location ?? '',
      description: j.description ?? '',
      requirements: toFieldArray(j.requirements?.length ? j.requirements : ['']),
      responsibilities: toFieldArray(j.responsibilities?.length ? j.responsibilities : ['']),
      skills: toFieldArray(j.skills?.length ? j.skills : ['']),
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      salaryCurrency: j.salaryCurrency ?? '₦',
    })
  }, [job, form])

  const saveMutation = useMutation({
    mutationFn: (data: FormData) => jobService.update(id!, {
      ...data,
      requirements: data.requirements.map((r) => r.value).filter(Boolean),
      responsibilities: data.responsibilities.map((r) => r.value).filter(Boolean),
      skills: data.skills.map((s) => s.value).filter(Boolean),
    } as Partial<Job>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-jobs'] })
      qc.invalidateQueries({ queryKey: ['job', id] })
    },
  })

  const publishMutation = useMutation({
    mutationFn: async (data: FormData) => {
      await jobService.update(id!, {
        ...data,
        requirements: data.requirements.map((r) => r.value).filter(Boolean),
        responsibilities: data.responsibilities.map((r) => r.value).filter(Boolean),
        skills: data.skills.map((s) => s.value).filter(Boolean),
      } as Partial<Job>)
      return jobService.publish(id!)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-jobs'] })
      navigate('/recruiter/jobs')
    },
  })

  if (isLoading) return <LoadingSpinner />

  const isSaving = saveMutation.isPending
  const isPublishing = publishMutation.isPending
  const isDraft = (job as Job & { status?: string })?.status === 'draft'

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-10">
      <div className="flex items-center gap-2">
        <Link to="/recruiter/jobs" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to Jobs
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Edit Job</h1>
          <p className="text-sm text-muted-foreground">{job?.title}</p>
        </div>
        {saveMutation.isSuccess && (
          <span className="text-xs text-emerald-600 font-medium pt-1">✓ Saved</span>
        )}
      </div>

      <form className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader><CardTitle>Job Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Job Title *</Label>
              <Input {...form.register('title')} />
              {form.formState.errors.title && <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Department *</Label>
                <Input {...form.register('department')} />
              </div>
              <div className="space-y-1.5">
                <Label>Level</Label>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" {...form.register('level')}>
                  {['graduate','entry','mid','senior','lead','executive'].map((l) => (
                    <option key={l} value={l} className="capitalize">{l.charAt(0).toUpperCase() + l.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" {...form.register('type')}>
                  <option value="full-time">Full-time</option>
                  <option value="part-time">Part-time</option>
                  <option value="contract">Contract</option>
                  <option value="internship">Internship</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Remote Policy</Label>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" {...form.register('remote')}>
                  <option value="on-site">On-site</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="remote">Remote</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Positions</Label>
                <Input type="number" min={1} {...form.register('positionsCount')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input {...form.register('location')} placeholder="e.g. Lagos, Nigeria" />
            </div>
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <textarea rows={5}
                className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                {...form.register('description')} />
              {form.formState.errors.description && <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input {...form.register('salaryCurrency')} />
              </div>
              <div className="space-y-1.5">
                <Label>Salary Min</Label>
                <Input type="number" {...form.register('salaryMin')} />
              </div>
              <div className="space-y-1.5">
                <Label>Salary Max</Label>
                <Input type="number" {...form.register('salaryMax')} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Requirements */}
        <Card>
          <CardHeader><CardTitle>Requirements</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {reqFields.map((field, i) => (
              <div key={field.id} className="flex gap-2">
                <Input {...form.register(`requirements.${i}.value`)} placeholder="Add a requirement…" />
                <button type="button" onClick={() => reqRemove(i)} className="p-2 hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => reqAppend({ value: '' })}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </CardContent>
        </Card>

        {/* Responsibilities */}
        <Card>
          <CardHeader><CardTitle>Responsibilities</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {respFields.map((field, i) => (
              <div key={field.id} className="flex gap-2">
                <Input {...form.register(`responsibilities.${i}.value`)} placeholder="Add a responsibility…" />
                <button type="button" onClick={() => respRemove(i)} className="p-2 hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => respAppend({ value: '' })}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </CardContent>
        </Card>

        {/* Skills */}
        <Card>
          <CardHeader><CardTitle>Required Skills</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {skillFields.map((field, i) => (
              <div key={field.id} className="flex gap-2">
                <Input {...form.register(`skills.${i}.value`)} placeholder="e.g. TypeScript" />
                <button type="button" onClick={() => skillRemove(i)} className="p-2 hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => skillAppend({ value: '' })}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </CardContent>
        </Card>

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button type="button" variant="outline" disabled={isSaving}
            onClick={form.handleSubmit((d) => saveMutation.mutate(d))}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            <Save className="h-4 w-4" /> Save Draft
          </Button>
          {isDraft && (
            <Button type="button" disabled={isPublishing}
              onClick={form.handleSubmit((d) => publishMutation.mutate(d))}>
              {isPublishing && <Loader2 className="h-4 w-4 animate-spin" />}
              <Globe className="h-4 w-4" /> Save & Publish
            </Button>
          )}
          {!isDraft && (
            <Button type="button" disabled={isSaving}
              onClick={form.handleSubmit(async (d) => { await saveMutation.mutateAsync(d); navigate('/recruiter/jobs') })}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save & Return
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
