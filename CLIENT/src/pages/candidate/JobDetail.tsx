import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { MapPin, Wifi, Clock, ChevronLeft, Loader2, Building2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { jobService } from '../../services/job.service'
import { applicationService } from '../../services/application.service'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Card, CardContent } from '../../components/ui/card'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { cn } from '../../lib/utils'
import { useState } from 'react'
import type { Application } from '../../types'
import { useAuth } from '../../contexts/AuthContext'
import { useLocation } from 'react-router-dom'

export default function JobDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const publicMode = location.pathname.startsWith('/jobs')
  const [applyError, setApplyError] = useState('')
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({})
  const { user } = useAuth()

  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => jobService.get(id!),
    enabled: !!id,
  })

  // Check if already applied
  const { data: myApplications } = useQuery({
    queryKey: ['my-applications'],
    queryFn: applicationService.myApplications,
  })

  const alreadyApplied = myApplications?.some(
    (a: Application) => (typeof a.job === 'object' ? a.job._id : a.job) === id,
  )

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!job) throw new Error('Job not loaded')
      return applicationService.apply(
        id!,
        (job.applicationQuestions ?? [])
          .map((q) => ({ question: q.question, answer: (questionAnswers[q.question] ?? '').trim() }))
          .filter((a) => a.answer.length > 0),
      )
    },
    onSuccess: () => {
      setApplyError('')
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number; data?: { message?: string } } })?.response?.status
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      if (status === 409) {
        setApplyError('You have already applied to this role.')
      } else if (status === 404) {
        setApplyError('Your candidate profile is incomplete. Please update your profile first.')
      } else {
        setApplyError(msg ?? 'Something went wrong. Please try again.')
      }
    },
  })

  if (jobLoading) return <LoadingSpinner />
  if (!job) return <p className="text-muted-foreground">Job not found.</p>

  const company = typeof job.company === 'object' ? job.company : null
  const applied = alreadyApplied || applyMutation.isSuccess
  const requiresQuestionnaire = Boolean(job.requiresQuestionnaire && (job.applicationQuestions?.length ?? 0) > 0)
  const missingRequired = requiresQuestionnaire
    ? (job.applicationQuestions ?? []).some((q) => q.required && !(questionAnswers[q.question] ?? '').trim())
    : false

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back to jobs
      </button>

      {publicMode && (
        <div className="overflow-hidden rounded-[28px] border border-[#d9c5b7] bg-[linear-gradient(140deg,#fff8f2_0%,#f0ddcf_100%)] px-6 py-7 shadow-[0_20px_60px_rgba(86,42,24,0.08)]">
          <p className="text-xs uppercase tracking-[0.18em] text-[#8b3a1e]/70">Public role preview</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight text-[#2d1a14]">{job.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#6d554b]">
            Review the role, responsibilities, and evaluation structure before you apply. If you are not signed in, applying will take you into registration first.
          </p>
        </div>
      )}

      <Card className={cn(publicMode && 'rounded-[24px] border-[#dbc7bb] bg-[linear-gradient(180deg,#fffdfb_0%,#f8efe7_100%)] shadow-[0_16px_40px_rgba(86,42,24,0.06)]', 'overflow-hidden')}>
        {(job as any).bannerUrl && (
          <div className="h-40 w-full overflow-hidden">
            <img src={(job as any).bannerUrl} alt="job banner" className="h-full w-full object-cover" />
          </div>
        )}
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 border">
                {company?.logoUrl
                  ? <img src={company.logoUrl} alt={company.name} className="h-full w-full object-contain p-1" />
                  : <Building2 className="h-7 w-7 text-primary" />}
              </div>
              <div>
                <h1 className="font-serif text-2xl font-semibold">{job.title}</h1>
                <p className="text-muted-foreground">{company?.name ?? 'Company'}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location}</span>
                  <span className="flex items-center gap-1"><Wifi className="h-3.5 w-3.5" />{job.remote}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{job.type}</span>
                </div>
              </div>
            </div>
            <Badge variant="secondary">{job.department}</Badge>
          </div>

          {job.salaryMin && (
            <div className="mt-4 rounded-lg bg-accent p-3 text-sm">
              <span className="font-medium">Salary: </span>
              {job.salaryCurrency}{job.salaryMin.toLocaleString()}
              {job.salaryMax ? ` – ${job.salaryCurrency}${job.salaryMax.toLocaleString()}` : '+'}
            </div>
          )}

          <div className="mt-6">
            <h2 className="font-serif text-lg font-semibold">About the role</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{job.description}</p>
          </div>

          {job.responsibilities.length > 0 && (
            <div className="mt-6">
              <h2 className="font-serif text-lg font-semibold">Responsibilities</h2>
              <ul className="mt-2 space-y-1.5">
                {job.responsibilities.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {job.requirements.length > 0 && (
            <div className="mt-6">
              <h2 className="font-serif text-lg font-semibold">Requirements</h2>
              <ul className="mt-2 space-y-1.5">
                {job.requirements.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {job.skills.length > 0 && (
            <div className="mt-6">
              <h2 className="font-serif text-lg font-semibold">Required Skills</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {job.skills.map((s) => (
                  <span key={s} className="rounded-full bg-accent px-3 py-1 text-sm">{s}</span>
                ))}
              </div>
            </div>
          )}

          {requiresQuestionnaire && (
            <div className="mt-6 rounded-lg border bg-accent/40 p-4">
              <h2 className="font-serif text-lg font-semibold">Application Questions</h2>
              <p className="mt-1 text-sm text-muted-foreground">Answer these questions to submit your application.</p>
              <div className="mt-3 space-y-3">
                {(job.applicationQuestions ?? []).map((q, idx) => (
                  <div key={`${q.question}-${idx}`} className="space-y-1.5">
                    <label className="text-sm font-medium">
                      {q.question} {q.required ? <span className="text-destructive">*</span> : null}
                    </label>
                    <textarea
                      rows={3}
                      className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={questionAnswers[q.question] ?? ''}
                      onChange={(e) => setQuestionAnswers((prev) => ({ ...prev, [q.question]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 space-y-3">
            {applyError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {applyError}
              </div>
            )}
            {applied ? (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="h-5 w-5" />
                Application submitted — we'll be in touch.
              </div>
            ) : (
              <Button
                size="lg"
                onClick={() => {
                  if (!user) {
                    navigate('/register')
                    return
                  }
                  applyMutation.mutate()
                }}
                disabled={applyMutation.isPending || missingRequired}
                className="px-10"
              >
                {applyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Apply Now
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
