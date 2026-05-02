import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileText, ExternalLink, CheckCircle2, Circle, Clock } from 'lucide-react'
import { applicationService } from '../../services/application.service'
import { Card, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatRelative, scoreBg, cn } from '../../lib/utils'
import type { Application, Job } from '../../types'

const PIPELINE_STAGES = [
  { key: 'applied',     label: 'Applied',     days: null },
  { key: 'screening',   label: 'Screening',   days: '1–2 days' },
  { key: 'assessment',  label: 'Assessment',  days: '2–5 days' },
  { key: 'interview',   label: 'Interview',   days: '3–7 days' },
  { key: 'decision',    label: 'Decision',    days: '1–3 days' },
]

const stageColor: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
  applied: 'secondary', screening: 'secondary', assessment: 'warning',
  interview: 'warning', decision: 'default', offered: 'success', rejected: 'destructive',
}

const stageHint: Record<string, string> = {
  applied:    'Your application has been received and is awaiting initial review.',
  screening:  'A recruiter is reviewing your resume. You may hear back soon.',
  assessment: 'You have been shortlisted! Complete your assessment to progress.',
  interview:  'You passed the assessment. An interview will be scheduled shortly.',
  decision:   'Your interview is complete. The recruiter is making a final decision.',
  rejected:   'This application was not progressed. View the AI explanation for full details.',
  offered:    'Congratulations — an offer has been extended!',
}

function PipelineTracker({ stage }: { stage: string }) {
  const isRejected = stage === 'rejected' || stage === 'offered'
  const currentIdx = PIPELINE_STAGES.findIndex((s) => s.key === stage)
  const activeIdx = isRejected ? PIPELINE_STAGES.length : currentIdx

  return (
    <div className="mt-3">
      <div className="flex items-center gap-0">
        {PIPELINE_STAGES.map((s, i) => {
          const done = i < activeIdx
          const active = i === activeIdx
          const isLast = i === PIPELINE_STAGES.length - 1
          return (
            <div key={s.key} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1 shrink-0">
                {done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : active ? (
                  <div className="h-4 w-4 rounded-full border-2 border-primary bg-primary/20 flex items-center justify-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  </div>
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/30" />
                )}
                <span className={cn('text-[10px] font-medium whitespace-nowrap', done ? 'text-emerald-600' : active ? 'text-primary' : 'text-muted-foreground/40')}>
                  {s.label}
                </span>
                {active && s.days && (
                  <span className="text-[9px] text-muted-foreground whitespace-nowrap">~{s.days}</span>
                )}
              </div>
              {!isLast && (
                <div className={cn('h-px flex-1 mx-1 mb-4', i < activeIdx ? 'bg-emerald-400' : 'bg-muted-foreground/20')} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Applications() {
  const { data: applications, isLoading } = useQuery({
    queryKey: ['my-applications'],
    queryFn: applicationService.myApplications,
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">My Applications</h1>
        <p className="text-sm text-muted-foreground">{applications?.length ?? 0} total application{applications?.length !== 1 ? 's' : ''}</p>
      </div>

      {!applications?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No applications yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Browse the job board to find opportunities.</p>
            <Link to="/candidate/jobs" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
              Browse Jobs
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {applications.map((app: Application) => {
            const job = app.job as Job
            const hint = stageHint[app.stage] ?? ''
            return (
              <Card key={app._id} className={cn('hover:border-primary/30 transition-colors', app.stage === 'rejected' ? 'opacity-70' : '')}>
                <CardContent className="p-5 space-y-4">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium truncate">{typeof job === 'object' ? job.title : 'Job'}</h3>
                        <Badge variant={stageColor[app.stage] ?? 'secondary'} className="capitalize shrink-0">
                          {app.stage}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Applied {formatRelative(app.createdAt)}
                      </p>
                      {hint && (
                        <p className="mt-1.5 text-xs text-foreground/70 leading-relaxed">{hint}</p>
                      )}
                    </div>
                    {/* Score */}
                    {app.scores?.final !== undefined && app.scores.final > 0 && (
                      <div className={cn('rounded-full border px-2.5 py-0.5 text-xs font-bold shrink-0', scoreBg(app.scores.final))}>
                        {app.scores.final.toFixed(0)}%
                      </div>
                    )}
                  </div>

                  {/* Pipeline progress bar */}
                  {app.stage !== 'offered' && <PipelineTracker stage={app.stage} />}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {app.stage === 'assessment' && (
                      <>
                        <Link
                          to={`/candidate/assessment/${app._id}`}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Complete Assessment <ExternalLink className="h-3 w-3" />
                        </Link>
                        {app.assessmentExpiresAt && (
                          <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                            Due {new Date(app.assessmentExpiresAt).toLocaleString()}
                          </span>
                        )}
                      </>
                    )}
                    {app.stage === 'interview' && app.interviewId && (
                      <Link
                        to={`/candidate/interview/${app.interviewId}`}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Join Interview Room <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                    {app.stage === 'interview' && !app.interviewId && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-3 py-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> Interview link pending
                      </span>
                    )}
                    {(app.stage === 'decision' || app.stage === 'rejected') && (
                      <Link
                        to={`/candidate/explanation/${app._id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-primary/30 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5"
                      >
                        {app.stage === 'rejected' ? 'Why this decision' : 'View AI explanation'} <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                    {app.stage === 'offered' && (
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700">
                        🎉 Offer Extended — check your email for next steps
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3 text-xs">
                    <p className="mb-1 font-medium">Decision Timeline</p>
                    <div className="space-y-1 text-muted-foreground">
                      <p>Applied: {new Date(app.createdAt).toLocaleString()}</p>
                      {app.assessmentExpiresAt && <p>Assessment window set: {new Date(app.assessmentExpiresAt).toLocaleString()}</p>}
                      {app.fairnessComputedAt && <p>Fairness computed: {new Date(app.fairnessComputedAt).toLocaleString()}</p>}
                      {app.explanationComputedAt && <p>AI explanation generated: {new Date(app.explanationComputedAt).toLocaleString()}</p>}
                      {app.interviewId && <p>Interview scheduled: linked</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
