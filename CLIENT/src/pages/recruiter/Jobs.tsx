import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Briefcase, Lock, ChevronDown, ChevronUp, Settings2, CheckCircle2 } from 'lucide-react'
import { jobService } from '../../services/job.service'
import api from '../../lib/axios'
import { Card, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatRelative, cn } from '../../lib/utils'
import type { Job } from '../../types'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

interface ThresholdDraft {
  assessment: number
  fairness: number
  interview: number
}

export default function RecruiterJobs() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const [status, setStatus] = useState<string>('all')
  const [expandedThresh, setExpandedThresh] = useState<string | null>(null)
  const [threshDrafts, setThreshDrafts] = useState<Record<string, ThresholdDraft>>({})
  const [savedId, setSavedId] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['my-jobs', status],
    queryFn: () => jobService.myJobs({ status: status === 'all' ? undefined : status }),
  })

  const closeMutation = useMutation({
    mutationFn: (id: string) => jobService.close(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-jobs'] }),
  })

  const saveThreshMutation = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: ThresholdDraft }) =>
      api.patch(`/jobs/${id}/thresholds`, {
        assessment: draft.assessment,
        fairness: draft.fairness / 100,   // convert % → ratio for backend
        interview: draft.interview,
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['my-jobs'] })
      setSavedId(vars.id)
      setTimeout(() => setSavedId(null), 2500)
    },
  })

  const getDraft = (job: Job): ThresholdDraft => {
    if (threshDrafts[job._id]) return threshDrafts[job._id]
    const t = (job as Job & { thresholds?: { assessment?: number; fairness?: number; interview?: number } }).thresholds
    return {
      assessment: t?.assessment ?? 60,
      fairness: Math.round((t?.fairness ?? 0.5) * 100),
      interview: t?.interview ?? 60,
    }
  }

  const updateDraft = (id: string, key: keyof ThresholdDraft, val: number) => {
    setThreshDrafts((prev) => ({
      ...prev,
      [id]: { ...getDraft({ _id: id } as Job), ...prev[id], [key]: val },
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">My Jobs</h1>
          <p className="text-sm text-muted-foreground">{data?.total ?? 0} total roles</p>
        </div>
        {isAdmin && (
          <Link to="/admin/jobs/create">
            <Button size="sm">+ Post a Job</Button>
          </Link>
        )}
        {!isAdmin && (
          <p className="text-xs text-muted-foreground">Only company admins can create jobs.</p>
        )}
      </div>

      <div className="flex gap-2">
        {['all', 'draft', 'published', 'closed'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm capitalize transition-colors',
              status === s ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingSpinner /> : !data?.data.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Briefcase className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No jobs yet</p>
            {isAdmin && (
              <Link to="/admin/jobs/create" className="mt-3 inline-block text-sm text-primary hover:underline">
                Create your first job →
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.data.map((job: Job) => {
            const draft = getDraft(job)
            const isExpand = expandedThresh === job._id
            const isSaved = savedId === job._id

            return (
              <Card key={job._id}>
                <CardContent className="p-5 space-y-0">
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium truncate">{job.title}</h3>
                        <Badge variant={job.status === 'published' ? 'success' : job.status === 'closed' ? 'destructive' : 'secondary'}>
                          {job.status}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {job.department} | {job.location} | Posted {formatRelative(job.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link to={`/recruiter/shortlist?job=${job._id}`} className="text-xs text-primary hover:underline">
                        View applicants
                      </Link>
                      <button
                        onClick={() => setExpandedThresh(isExpand ? null : job._id)}
                        className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors"
                        title="Edit AI thresholds"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        Thresholds
                        {isExpand ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      {job.status === 'published' && (
                        <Button size="sm" variant="outline" onClick={() => closeMutation.mutate(job._id)}>
                          <Lock className="h-3.5 w-3.5" /> Close
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Threshold editor */}
                  {isExpand && (
                    <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-primary">AI Decision Thresholds</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Candidates below these marks are auto-rejected with an immediate AI explanation.
                          </p>
                        </div>
                        {isSaved && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium flex items-center gap-1.5">
                            Assessment pass mark
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">auto-reject below</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range" min={0} max={100} step={5}
                              value={draft.assessment}
                              onChange={(e) => updateDraft(job._id, 'assessment', Number(e.target.value))}
                              className="flex-1"
                            />
                            <span className="w-10 text-right text-sm font-semibold tabular-nums">{draft.assessment}%</span>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-medium flex items-center gap-1.5">
                            Fairness gate
                            <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-700">bias control</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range" min={0} max={100} step={5}
                              value={draft.fairness}
                              onChange={(e) => updateDraft(job._id, 'fairness', Number(e.target.value))}
                              className="flex-1"
                            />
                            <span className="w-10 text-right text-sm font-semibold tabular-nums">{draft.fairness}%</span>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-medium flex items-center gap-1.5">
                            Interview guide mark
                            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">advisory</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range" min={0} max={100} step={5}
                              value={draft.interview}
                              onChange={(e) => updateDraft(job._id, 'interview', Number(e.target.value))}
                              className="flex-1"
                            />
                            <span className="w-10 text-right text-sm font-semibold tabular-nums">{draft.interview}%</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-muted-foreground">
                          Changes apply to new candidate evaluations immediately. Existing decisions are not retroactively changed.
                        </p>
                        <Button
                          size="sm"
                          onClick={() => saveThreshMutation.mutate({ id: job._id, draft })}
                          disabled={saveThreshMutation.isPending}
                        >
                          Save Thresholds
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
