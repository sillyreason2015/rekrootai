import type React from 'react'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Briefcase, Lock, ChevronDown, ChevronUp, Settings2, CheckCircle2, Globe, Pencil, Trash2, UserRound, Users2, Wand2, RotateCw } from 'lucide-react'
import { jobService } from '../../services/job.service'
import { adminService } from '../../services/admin.service'
import api from '../../lib/axios'
import { Card, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatRelative, cn } from '../../lib/utils'
import type { Job } from '../../types'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

interface ThresholdDraft {
  assessment: number
  fairness: number
  interview: number
}

export default function RecruiterJobs() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const canManageJobs = ['recruiter', 'admin', 'super_admin'].includes(user?.role ?? '')
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const [status, setStatus] = useState<string>('all')
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'mine' | 'unassigned'>('all')
  const [expandedThresh, setExpandedThresh] = useState<string | null>(null)
  const [threshDrafts, setThreshDrafts] = useState<Record<string, ThresholdDraft>>({})
  const [savedId, setSavedId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, { recruiterId: string; note: string }>>({})
  const qc = useQueryClient()
  const { data: teamData } = useQuery({
    queryKey: ['admin-team-lite'],
    queryFn: adminService.getTeam,
    enabled: isAdmin,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['my-jobs', status],
    queryFn: () => jobService.myJobs({ status: status === 'all' ? undefined : status }),
  })

  const closeMutation = useMutation({
    mutationFn: (id: string) => jobService.close(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-jobs'] }),
  })

  const publishMutation = useMutation({
    mutationFn: (id: string) => jobService.publish(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-jobs'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => jobService.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-jobs'] }); setConfirmDelete(null) },
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
  const assignmentMutation = useMutation({
    mutationFn: ({ id, recruiterId, note }: { id: string; recruiterId?: string | null; note?: string }) => jobService.updateAssignment(id, { recruiterId, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-jobs'] }),
  })

  const autoAssignMutation = useMutation({
    mutationFn: (id: string) => api.post(`/jobs/${id}/auto-assign`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-jobs'] }),
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

  const visibleJobs = (data?.data ?? []).filter((job) => {
    if (ownershipFilter === 'mine') return String(job.assignedRecruiter ?? '') === String(user?._id ?? '')
    if (ownershipFilter === 'unassigned') return !job.assignedRecruiter
    return true
  })

  const getAssignedRecruiterLabel = (job: Job) => {
    const assigned = job.assignedRecruiter
    if (assigned && typeof assigned === 'object') return `${assigned.firstName} ${assigned.lastName}`.trim()
    if (assigned && String(assigned) === String(user?._id ?? '')) return 'You'
    if (assigned) return 'Assigned recruiter'
    return 'Not assigned yet'
  }
  const teamMembers = ((teamData as { members?: Array<{ _id: string; firstName: string; lastName: string; role: string; teamName?: string }> } | undefined)?.members ?? [])
    .filter((member) => ['recruiter', 'admin', 'super_admin'].includes(member.role))

  const flashMessage = (location.state as { flash?: string } | null)?.flash

  return (
    <div className="space-y-6">
      {flashMessage && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex items-start justify-between gap-4 p-4 text-sm text-emerald-900">
            <p>{flashMessage}</p>
            <button
              type="button"
              className="text-xs font-medium text-emerald-700"
              onClick={() => navigate(location.pathname, { replace: true })}
            >
              Dismiss
            </button>
          </CardContent>
        </Card>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">My Jobs</h1>
          <p className="text-sm text-muted-foreground">{data?.total ?? 0} total roles</p>
        </div>
        {isAdmin && (
          <Link to="/recruiter/jobs/create">
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

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'all', label: 'All ownership' },
          { key: 'mine', label: 'Assigned to me' },
          { key: 'unassigned', label: 'Unassigned' },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setOwnershipFilter(item.key as 'all' | 'mine' | 'unassigned')}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              ownershipFilter === item.key ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingSpinner /> : !data?.data.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Briefcase className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No jobs yet</p>
            {isAdmin && (
              <Link to="/recruiter/jobs/create" className="mt-3 inline-block text-sm text-primary hover:underline">
                Create your first job →
              </Link>
            )}
          </CardContent>
        </Card>
      ) : !visibleJobs.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <UserRound className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No jobs match this ownership filter</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {ownershipFilter === 'mine'
                ? 'No roles are currently assigned to you. New round-robin jobs will appear here automatically.'
                : 'Every visible role already has an owner.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleJobs.map((job: Job) => {
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
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <Badge variant="outline" className="gap-1">
                          <Users2 className="h-3 w-3" />
                          Team: {job.teamName || user?.teamName || user?.companyName || 'Workspace'}
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <UserRound className="h-3 w-3" />
                          Owner: {getAssignedRecruiterLabel(job)}
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <Wand2 className="h-3 w-3" />
                          {job.assignmentMethod === 'manual' ? 'Manual assignment' : job.assignmentMethod === 'solo_owner' ? 'Auto-assigned to workspace owner' : 'Round robin assignment'}
                        </Badge>
                        {job.assignedRecruiterAt && (
                          <Badge variant="outline">Assigned {formatRelative(job.assignedRecruiterAt)}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {job.status !== 'draft' && (
                        <Link to={`/recruiter/shortlist?job=${job._id}`} className="text-xs text-primary hover:underline">
                          View applicants
                        </Link>
                      )}
                      {canManageJobs && (
                        <Link to={`/recruiter/jobs/${job._id}/edit`}>
                          <Button size="sm" variant="outline" className="gap-1">
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                        </Link>
                      )}
                      <button
                        onClick={() => setExpandedThresh(isExpand ? null : job._id)}
                        className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors"
                        title="Edit AI thresholds"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        Thresholds
                        {isExpand ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      {job.status === 'draft' && canManageJobs && (
                        <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 gap-1"
                          onClick={() => publishMutation.mutate(job._id)} disabled={publishMutation.isPending}>
                          <Globe className="h-3.5 w-3.5" /> Publish
                        </Button>
                      )}
                      {job.status === 'published' && canManageJobs && (
                        <Button size="sm" variant="outline" className="gap-1"
                          onClick={() => closeMutation.mutate(job._id)} disabled={closeMutation.isPending}>
                          <Lock className="h-3.5 w-3.5" /> Close
                        </Button>
                      )}
                      {job.status !== 'published' && canManageJobs && (
                        confirmDelete === job._id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-destructive font-medium">Delete?</span>
                            <Button size="sm" variant="destructive" className="h-7 px-2 text-xs"
                              onClick={() => deleteMutation.mutate(job._id)} disabled={deleteMutation.isPending}>
                              Yes
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                              onClick={() => setConfirmDelete(null)}>
                              No
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/5 gap-1"
                            onClick={() => setConfirmDelete(job._id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => setExpandedThresh(isExpand ? null : job._id)}
                          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors"
                          title="Assignment controls"
                        >
                          <UserRound className="h-3.5 w-3.5" />
                          Assignment
                        </button>
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
                      {isAdmin && (
                        <div className="rounded-xl border bg-background p-4 space-y-3">
                          <p className="text-sm font-semibold">Owner handoff</p>
                          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                            <select
                              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                              value={assignmentDrafts[job._id]?.recruiterId ?? String(job.assignedRecruiter ?? '')}
                              onChange={(e) => setAssignmentDrafts((prev) => ({ ...prev, [job._id]: { recruiterId: e.target.value, note: prev[job._id]?.note ?? '' } }))}
                            >
                              <option value="">No recruiter assigned</option>
                              {teamMembers
                                .filter((member) => !job.teamName || !member.teamName || member.teamName === job.teamName)
                                .map((member) => (
                                  <option key={member._id} value={member._id}>{member.firstName} {member.lastName}</option>
                                ))}
                            </select>
                            <Input
                              placeholder="Handoff note"
                              value={assignmentDrafts[job._id]?.note ?? ''}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAssignmentDrafts((prev) => ({ ...prev, [job._id]: { recruiterId: prev[job._id]?.recruiterId ?? String(job.assignedRecruiter ?? ''), note: e.target.value } }))}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => assignmentMutation.mutate({
                                  id: job._id,
                                  recruiterId: (assignmentDrafts[job._id]?.recruiterId ?? String(job.assignedRecruiter ?? '')) || null,
                                  note: assignmentDrafts[job._id]?.note ?? '',
                                })}
                                disabled={assignmentMutation.isPending}
                              >
                                Save owner
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                title="Auto-assign via round robin"
                                onClick={() => autoAssignMutation.mutate(job._id)}
                                disabled={autoAssignMutation.isPending}
                              >
                                <RotateCw className="h-3.5 w-3.5" /> Round Robin
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Assignment history</p>
                            {job.assignmentHistory?.length ? job.assignmentHistory.slice().reverse().map((entry, index) => (
                              <div key={`${entry.at}-${index}`} className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                                <p>{entry.method === 'manual' ? 'Manual handoff' : entry.method === 'solo_owner' ? 'Assigned to workspace owner' : 'Round robin assignment'} on {formatRelative(entry.at)}</p>
                                {entry.note && <p className="mt-1 text-muted-foreground">{entry.note}</p>}
                              </div>
                            )) : (
                              <p className="text-xs text-muted-foreground">No assignment activity yet.</p>
                            )}
                          </div>
                        </div>
                      )}
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
