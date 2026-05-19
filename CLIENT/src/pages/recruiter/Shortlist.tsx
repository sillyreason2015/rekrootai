import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ChevronDown, ChevronUp, Shield, Ban, CheckCircle2, AlertTriangle,
  Calendar, Video, ArrowRight, Download, Layers, TrendingUp, TrendingDown,
  Minus, Bot, X, Send, Loader2, Info, FileText, Eye, Sparkles, ExternalLink, MessageSquare,
  SlidersHorizontal, Search, Square, CheckSquare, Pencil, Save, LayoutGrid, List,
} from 'lucide-react'
import InfoTip from '../../components/shared/InfoTip'
import { applicationService } from '../../services/application.service'
import { jobService } from '../../services/job.service'
import { recruiterService } from '../../services/recruiter.service'
import api from '../../lib/axios'
import { Card, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import WorkspaceEmptyState from '../../components/layout/WorkspaceEmptyState'
import AiBadge from '../../components/shared/AiBadge'
import AiSuggestion from '../../components/shared/AiSuggestion'
import { scoreBg, cn } from '../../lib/utils'
import type { Application, BiasAudit, Candidate, User } from '../../types'
import { useToast } from '../../contexts/ToastContext'

type Mode = 'Assist' | 'Veto' | 'Override'

type ChatMessage = { role: 'user' | 'ai'; text: string }

type ExplanationData = {
  scores?: {
    resumeScore?: number; assessmentScore?: number; penaltyApplied?: number
    interviewScore?: number; finalScore?: number; explanation?: string
    shapValues?: Record<string, number>; stage?: string; decision?: string
    weights?: { w1: number; w2: number; w3: number; w4: number }
  }
}

type FairnessAuditResult = {
  _id: string
  flagged: boolean
  disparateImpact: Record<string, number>
  details?: Record<string, unknown>
}

type NextAction = {
  label: string
  icon: typeof CheckCircle2
  onClick: () => void
  disabled?: boolean
  className?: string
}

type ApplicationsQuery = { data: Application[]; total?: number; page?: number; limit?: number; totalPages?: number }

function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    applied: 'Applied', screening: 'Screening', assessment: 'Assessment',
    interview: 'Interview', decision: 'Decision', rejected: 'Rejected', offered: 'Offered',
  }
  return labels[stage] ?? stage
}

function stageBadge(stage: string) {
  const colors: Record<string, string> = {
    applied: 'bg-slate-100 text-slate-600',
    screening: 'bg-blue-50 text-blue-600',
    assessment: 'bg-amber-50 text-amber-700',
    interview: 'bg-purple-50 text-purple-700',
    decision: 'bg-emerald-50 text-emerald-700',
    rejected: 'bg-red-50 text-red-600',
    offered: 'bg-emerald-100 text-emerald-800',
  }
  return colors[stage] ?? 'bg-muted text-muted-foreground'
}

/** Inline AI Explanation panel shown inside the card */
function ExplanationPanel({ appId, candidateName }: { appId: string; candidateName: string }) {
  const { data, isLoading, isError } = useQuery<ExplanationData>({
    queryKey: ['recruiter-explanation', appId],
    queryFn: () => applicationService.getExplanation(appId),
    retry: false,
  })

  const scores = data?.scores

  if (isLoading) return (
    <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-sm">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading AI explanation…
    </div>
  )
  if (isError || !scores) return (
    <p className="py-4 text-sm text-muted-foreground italic">No AI explanation generated yet for this candidate.</p>
  )

  const bars = [
    { label: 'CV / Resume Match',    value: scores.resumeScore,    weight: scores.weights?.w1 ?? 0.3 },
    { label: 'Assessment Score',     value: scores.assessmentScore, weight: scores.weights?.w2 ?? 0.3 },
    { label: 'Fairness Adjustment',  value: scores.penaltyApplied, weight: scores.weights?.w3 ?? 0.1 },
    { label: 'Interview Evaluation', value: scores.interviewScore, weight: scores.weights?.w4 ?? 0.3 },
  ]
  const shapEntries = Object.entries(scores.shapValues ?? {}).filter(([, v]) => Math.abs(v) > 0.001).sort(([, a], [, b]) => Math.abs(b) - Math.abs(a)).slice(0, 6)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AiBadge label="AI Evaluation" size="md" />
        <span className="text-xs text-muted-foreground">{candidateName} · {scores.stage ?? 'unknown stage'}</span>
        {scores.decision && (
          <span className={cn('ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold border', scores.decision === 'hire' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : scores.decision === 'reject' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200')}>
            {scores.decision}
          </span>
        )}
      </div>

      {/* Composite score */}
      {(scores.finalScore ?? 0) > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <p className={cn('text-3xl font-bold font-serif', scoreBg(scores.finalScore!).split(' ').find(c => c.startsWith('text-')))}>{scores.finalScore!.toFixed(1)}%</p>
          <div>
            <p className="text-sm font-medium">Composite Score</p>
            <p className="text-xs text-muted-foreground">Weighted across all completed stages</p>
          </div>
        </div>
      )}

      {/* Score breakdown bars */}
      <div className="space-y-3">
        {bars.map(({ label, value, weight }) => {
          const present = (value ?? 0) > 0
          return (
            <div key={label} className={cn('space-y-1', !present && 'opacity-40')}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{label} <span className="text-muted-foreground font-normal">({(weight * 100).toFixed(0)}%)</span></span>
                {present && value !== undefined
                  ? <span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold', scoreBg(value))}>{value.toFixed(1)}%</span>
                  : <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground bg-muted">Pending</span>}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: present && value !== undefined ? `${Math.min(100, value)}%` : '0%' }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* AI narrative */}
      {scores.explanation && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-4 w-4 text-primary shrink-0" />
            <p className="text-xs font-semibold text-primary">AI Evaluation Summary</p>
          </div>
          <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line">{scores.explanation}</p>
        </div>
      )}

      {/* SHAP features */}
      {shapEntries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">SHAP Feature Importance</p>
          {shapEntries.map(([feat, val]) => (
            <div key={feat} className="flex items-center gap-3 text-xs">
              <span className="w-40 shrink-0 truncate capitalize text-muted-foreground">{feat.replace(/_/g, ' ')}</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full rounded-full', val >= 0 ? 'bg-emerald-400' : 'bg-red-400')} style={{ width: `${Math.min(100, Math.abs(val) * 200)}%` }} />
              </div>
              <span className={cn('w-12 text-right font-mono', val >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                {val >= 0 ? '+' : ''}{val.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Inline AI chat panel — Assist mode only */
function AssistantPanel({ appId, name, scores, onClose }: {
  appId: string; name: string; scores: Application['scores']; stage?: string; onClose: () => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'ai', text: `Hi! I'm ready to help you evaluate **${name}**. Ask me about their strengths, concerns, whether to progress them, or anything else about their profile.` }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const send = async () => {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: q }])
    setLoading(true)
    try {
      const { answer } = await recruiterService.askAssistant(appId, q)
      setMessages((prev) => [...prev, { role: 'ai', text: answer }])
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', text: 'Sorry, I could not get a response right now. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">AI Hiring Assistant — {name}</p>
          <AiBadge size="sm" />
        </div>
        <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>
      </div>

      {/* Score summary strip */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        {[
          { label: 'Resume',     val: scores?.resume },
          { label: 'Assessment', val: scores?.assessment },
          { label: 'Interview',  val: scores?.interview },
          { label: 'Composite',  val: scores?.final },
        ].map(({ label, val }) => (
          <div key={label} className="rounded-md border bg-background px-2 py-2 text-center">
            <p className="text-muted-foreground">{label}</p>
            <p className="font-bold text-sm mt-0.5">{val != null && val > 0 ? `${val.toFixed(0)}%` : '—'}</p>
          </div>
        ))}
      </div>

      {/* Chat messages */}
      <div className="max-h-56 overflow-y-auto space-y-2 rounded-lg border bg-background p-3 scrollbar-thin">
        {messages.map((m, i) => (
          <div key={i} className={cn('text-sm leading-relaxed', m.role === 'user' ? 'text-right' : 'text-left')}>
            <span className={cn('inline-block rounded-xl px-3 py-2 max-w-[85%] text-left', m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>
              {m.text}
            </span>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
          </div>
        )}
      </div>

      {/* Suggested questions */}
      <div className="flex flex-wrap gap-1.5">
        {[`What are ${name.split(' ')[0]}'s strengths?`, 'Any concerns?', 'Should I progress them?'].map((q) => (
          <button key={q} onClick={() => { setInput(q); }} className="rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-accent transition-colors">{q}</button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder={`Ask about ${name.split(' ')[0]}…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          disabled={loading}
        />
        <Button size="sm" onClick={send} disabled={!input.trim() || loading} className="shrink-0">
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

/** Inline CV viewer + AI analysis panel */
function CvViewerPanel({ appId, name, onClose, enableAi }: { appId: string; name: string; onClose: () => void; enableAi: boolean }) {
  const { data: cvData, isLoading: cvLoading } = useQuery({
    queryKey: ['recruiter-cv', appId],
    queryFn: () => recruiterService.getApplicationCv(appId),
    retry: false,
  })
  const { data: analysis, isLoading: analysisLoading, refetch: runAnalysis, isFetched, isError: analysisError } = useQuery({
    queryKey: ['cv-analysis', appId],
    queryFn: () => recruiterService.getCvAnalysis(appId),
    enabled: false,
    retry: false,
  })

  return (
    <div className="rounded-xl border border-primary/20 bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">CV Viewer — {name}</p>
        </div>
        <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>
      </div>

      {/* CV embed */}
      {cvLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading CV…</div>}
      {!cvLoading && !cvData?.url && <p className="text-sm text-muted-foreground italic">No CV uploaded by this candidate.</p>}
      {cvData?.url && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <a href={cvData.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">
              <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
            </a>
            <a href={cvData.url} download
              className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          </div>
          <iframe
            src={cvData.url}
            className="w-full rounded-lg border bg-muted"
            style={{ height: '480px' }}
            title={`${name} CV`}
          />
        </div>
      )}

      {/* AI Analysis */}
      {enableAi && <div className="border-t pt-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">AI CV Analysis</p>
            <AiBadge size="sm" />
          </div>
          <Button size="sm" variant="outline" onClick={() => runAnalysis()} disabled={analysisLoading} className="gap-1">
            {analysisLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {isFetched ? 'Run Again' : 'Analyse CV'}
          </Button>
        </div>

        {analysisLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Gemini is analysing the CV…</div>}

        {analysisError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">AI CV analysis failed. Please try again.</div>}
        {!analysisLoading && isFetched && !analysis && !analysisError && <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">No AI CV analysis was returned for this candidate yet.</div>}
        {analysis && (
          <div className="space-y-3">
            {analysis.overall && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground/80">{analysis.overall}</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {analysis.strengths?.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20 p-3 space-y-1">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Strengths</p>
                  {analysis.strengths.map((s: string, i: number) => <p key={i} className="text-xs text-emerald-800 dark:text-emerald-300">· {s}</p>)}
                </div>
              )}
              {analysis.gaps?.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20 p-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Gaps</p>
                  {analysis.gaps.map((g: string, i: number) => <p key={i} className="text-xs text-amber-800 dark:text-amber-300">· {g}</p>)}
                </div>
              )}
            </div>
            {analysis.suggestedQuestions?.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Suggested Interview Questions</p>
                {analysis.suggestedQuestions.map((q: string, i: number) => (
                  <p key={i} className="text-xs text-foreground/70">Q{i + 1}: {q}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>}
    </div>
  )
}

export default function Shortlist() {
  const [params] = useSearchParams()
  const jobId = params.get('job') ?? ''
  const [mode, setMode] = useState<Mode>('Assist')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showExplanation, setShowExplanation] = useState<string | null>(null)
  const [showCvViewer, setShowCvViewer] = useState<string | null>(null)
  const [scheduleFor, setScheduleFor] = useState<string | null>(null)
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0)
    return d.toISOString().slice(0, 16)
  })
  const [duration, setDuration] = useState(45)
  const [vetoSummary, setVetoSummary] = useState<{ processed: number; shortlisted: number; rejected: number; review: number } | null>(null)
  const [assistantCandidate, setAssistantCandidate] = useState<{ id: string; name: string; scores: Application['scores']; stage: string } | null>(null)
  const [showTriage, setShowTriage] = useState(false)
  const [cvNotice, setCvNotice] = useState<string | null>(null)
  const [auditNotice, setAuditNotice] = useState<string | null>(null)
  const [pendingMode, setPendingMode] = useState<Mode | null>(null)
  // Filters
  const [filterStage, setFilterStage] = useState('')
  const [filterMinScore, setFilterMinScore] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  // Notes
  const [editingNotes, setEditingNotes] = useState<string | null>(null)
  const [notesValue, setNotesValue] = useState('')
  const qc = useQueryClient()
  const { toast } = useToast()

  const { data: jobs } = useQuery({ queryKey: ['my-jobs'], queryFn: () => jobService.myJobs() })
  const [selectedJob, setSelectedJob] = useState(jobId)
  const selectedJobData = jobs?.data?.find((job) => job._id === selectedJob)
  const isOverrideMode = mode === 'Override'
  const isVetoMode = mode === 'Veto'
  useEffect(() => {
    const nextMode = selectedJobData?.aiMode
    if (nextMode === 'assist' || nextMode === 'veto' || nextMode === 'override') {
      setMode((nextMode[0].toUpperCase() + nextMode.slice(1)) as Mode)
      return
    }
    setMode('Assist')
  }, [selectedJobData?._id, selectedJobData?.aiMode])

  const { data: triageData, isLoading: triageLoading } = useQuery({
    queryKey: ['triage', selectedJob, mode],
    queryFn: () => recruiterService.getJobTriage(selectedJob, mode.toLowerCase() as 'assist' | 'veto' | 'override'),
    enabled: !!selectedJob && showTriage,
  })
  const { data: latestBiasAudit } = useQuery<BiasAudit | null>({
    queryKey: ['latest-bias-audit', selectedJob],
    queryFn: () => recruiterService.getLatestBiasAudit(selectedJob),
    enabled: !!selectedJob,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['applications', selectedJob],
    queryFn: () => applicationService.listForJob(selectedJob),
    enabled: !!selectedJob,
  })

  const invalidateApplications = () => qc.invalidateQueries({ queryKey: ['applications', selectedJob] })
  const patchApplicationStage = async (id: string, updates: Partial<Application>) => {
    await qc.cancelQueries({ queryKey: ['applications', selectedJob] })
    const previous = qc.getQueryData<ApplicationsQuery>(['applications', selectedJob])
    qc.setQueryData<ApplicationsQuery>(['applications', selectedJob], (current) => {
      if (!current) return current
      return {
        ...current,
        data: current.data.map((app) => (app._id === id ? { ...app, ...updates } : app)),
      }
    })
    return { previous }
  }
  const rollbackApplications = (context?: { previous?: ApplicationsQuery }) => {
    if (context?.previous) qc.setQueryData(['applications', selectedJob], context.previous)
  }
  const mutationError = (fallback: string) => (error: unknown) => {
    const message = typeof error === 'object' && error && 'response' in error
      ? String((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback)
      : fallback
    toast({ title: 'Action could not be completed', description: message, variant: 'error' })
  }

  const mutOpts = { onSuccess: () => invalidateApplications(), onError: mutationError('Please try again in a moment.') }

  const shortlistMutation  = useMutation({
    mutationFn: (id: string) => applicationService.shortlist(id, mode.toLowerCase()),
    ...mutOpts,
    onMutate: (id: string) => patchApplicationStage(id, { stage: 'screening' }),
    onError: (error, _id, context) => { rollbackApplications(context); mutationError('Please try again in a moment.')(error) },
    onSuccess: () => { invalidateApplications(); toast({ title: 'Candidate shortlisted', description: 'The candidate moved into screening.' }) },
  })
  const rejectMutation     = useMutation({
    mutationFn: (id: string) => applicationService.reject(id, undefined, mode.toLowerCase()),
    ...mutOpts,
    onMutate: (id: string) => patchApplicationStage(id, { stage: 'rejected', status: 'rejected' }),
    onError: (error, _id, context) => { rollbackApplications(context); mutationError('Please try again in a moment.')(error) },
    onSuccess: () => { invalidateApplications(); toast({ title: 'Candidate rejected', description: 'The application has been closed for this role.' }) },
  })
  const sendAssessmentMutation = useMutation({
    mutationFn: (id: string) => applicationService.sendAssessment(id, 60),
    ...mutOpts,
    onMutate: (id: string) => patchApplicationStage(id, { stage: 'assessment', status: 'assessment_sent' }),
    onError: (error, _id, context) => { rollbackApplications(context); mutationError('Please try again in a moment.')(error) },
    onSuccess: () => { invalidateApplications(); toast({ title: 'Assessment sent', description: 'The candidate can now continue with the evaluation.' }) },
  })
  const undoAssessmentMutation = useMutation({
    mutationFn: (id: string) => applicationService.undoAssessment(id),
    ...mutOpts,
    onMutate: (id: string) => patchApplicationStage(id, { stage: 'screening', status: 'shortlisted' }),
    onError: (error, _id, context) => { rollbackApplications(context); mutationError('Please try again in a moment.')(error) },
    onSuccess: () => { invalidateApplications(); toast({ title: 'Assessment reset', description: 'The candidate was moved back for another review cycle.' }) },
  })
  const fairnessMutation   = useMutation({
    mutationFn: (id: string) => applicationService.runFairnessGate(id),
    ...mutOpts,
    onSuccess: () => { invalidateApplications(); toast({ title: 'Fairness gate completed', description: 'Bias checks were re-run for this candidate.' }) },
  })
  const rejectDecisionMutation = useMutation({
    mutationFn: (id: string) => applicationService.makeDecision(id, 'reject', 'Rejected after assessment review'),
    ...mutOpts,
    onMutate: (id: string) => patchApplicationStage(id, { stage: 'rejected', status: 'rejected', decision: 'reject' }),
    onError: (error, _id, context) => { rollbackApplications(context); mutationError('Please try again in a moment.')(error) },
    onSuccess: () => { invalidateApplications(); toast({ title: 'Candidate rejected', description: 'The candidate was declined after later-stage review.' }) },
  })
  const undoVetoMutation   = useMutation({
    mutationFn: (id: string) => applicationService.undoVeto(id),
    ...mutOpts,
    onSuccess: () => { invalidateApplications(); toast({ title: 'Veto cleared', description: 'This candidate is back in manual review.' }) },
  })
  const biasAuditMutation  = useMutation({
    mutationFn: () => recruiterService.runBiasAudit(selectedJob),
    onSuccess: (audit: FairnessAuditResult) => {
      const ratios = Object.entries(audit.disparateImpact ?? {}).map(([key, value]) => `${key}: ${(value * 100).toFixed(0)}%`).join(', ')
      setAuditNotice(audit.flagged ? `Demographic parity flagged for review. ${ratios}` : `Demographic parity check passed. ${ratios}`)
      qc.invalidateQueries({ queryKey: ['latest-bias-audit', selectedJob] })
      toast({ title: audit.flagged ? 'Bias audit flagged this job' : 'Bias audit passed', description: ratios })
    },
    onError: mutationError('We could not run the demographic parity audit right now.'),
  })
  const scheduleMutation   = useMutation({
    mutationFn: ({ appId, scheduledAt, durationMin }: { appId: string; scheduledAt: string; durationMin: number }) =>
      api.post('/interviews', { applicationId: appId, scheduledAt: new Date(scheduledAt).toISOString(), durationMin, mode: mode.toLowerCase() }),
    onMutate: ({ appId, scheduledAt }) => patchApplicationStage(appId, { stage: 'interview', interviewStatus: 'scheduled', interviewScheduledAt: new Date(scheduledAt).toISOString(), status: 'interview_scheduled' }),
    onError: (error, _vars, context) => { rollbackApplications(context); mutationError('We could not schedule the interview.')(error) },
    onSuccess: (_resp, vars) => {
      invalidateApplications()
      setScheduleFor(null)
      toast({ title: 'Interview scheduled', description: `Scheduled for ${new Date(vars.scheduledAt).toLocaleString()}.` })
    },
  })
  const completeMutation = useMutation({
    mutationFn: (interviewId: string) => api.post(`/interviews/${interviewId}/complete`, {}),
    ...mutOpts,
    onMutate: async (interviewId: string) => {
      await qc.cancelQueries({ queryKey: ['applications', selectedJob] })
      const previous = qc.getQueryData<ApplicationsQuery>(['applications', selectedJob])
      qc.setQueryData<ApplicationsQuery>(['applications', selectedJob], (current) => {
        if (!current) return current
        return {
          ...current,
          data: current.data.map((app) => (app.interviewId === interviewId ? { ...app, stage: 'decision', interviewStatus: 'completed' } : app)),
        }
      })
      return { previous }
    },
    onError: (error, _id, context) => { rollbackApplications(context); mutationError('Please try again in a moment.')(error) },
    onSuccess: () => { invalidateApplications(); toast({ title: 'Interview marked complete', description: 'The candidate moved into the decision stage.' }) },
  })
  const vetoMutation = useMutation({
    mutationFn: () => applicationService.aiDecide({ jobId: selectedJob }),
    onSuccess: (resp: any) => {
      const results = Array.isArray(resp?.results) ? resp.results : []
      setVetoSummary({
        processed: Number(resp?.processed ?? results.length),
        shortlisted: results.filter((r: any) => r.decision === 'shortlist').length,
        rejected: results.filter((r: any) => r.decision === 'reject').length,
        review: results.filter((r: any) => r.decision === 'review').length,
      })
      qc.invalidateQueries({ queryKey: ['applications', selectedJob] })
      toast({ title: 'Veto batch completed', description: `${Number(resp?.processed ?? results.length)} candidates were re-evaluated.` })
    },
    onError: mutationError('AI veto mode could not process this shortlist right now.'),
  })
  const modeMutation = useMutation({
    mutationFn: ({ jobId: id, nextMode }: { jobId: string; nextMode: Mode }) =>
      jobService.update(id, { aiMode: nextMode.toLowerCase() as 'assist' | 'veto' | 'override' }),
    onSuccess: (_resp, vars) => {
      qc.invalidateQueries({ queryKey: ['my-jobs'] })
      setPendingMode(null)
      setAssistantCandidate(null)
      if (vars.nextMode === 'Veto') {
        vetoMutation.mutate()
      }
      toast({ title: 'AI mode updated', description: `${vars.nextMode} mode is now active for this job.` })
    },
    onError: mutationError('We could not update the AI mode for this role.'),
  })

  const bulkMutation = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: 'shortlist' | 'reject' | 'send-assessment' }) =>
      applicationService.bulkAction(ids, action),
    onSuccess: (resp: any) => {
      setSelectedIds(new Set())
      invalidateApplications()
      toast({ title: `Bulk action complete`, description: `${resp.succeeded} succeeded${resp.failed ? `, ${resp.failed} failed` : ''}.` })
    },
    onError: mutationError('Bulk action failed. Please try again.'),
  })

  const notesMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => applicationService.saveNotes(id, notes),
    onSuccess: () => {
      setEditingNotes(null)
      invalidateApplications()
      toast({ title: 'Notes saved' })
    },
    onError: mutationError('Could not save notes.'),
  })

  const downloadCv = async (appId: string) => {
    setCvNotice(null)
    try {
      const r = await recruiterService.getApplicationCv(appId)
      if (r.url) {
        const a = document.createElement('a'); a.href = r.url; a.target = '_blank'; a.click()
      } else {
        setCvNotice('This candidate has not uploaded a CV yet.')
        setTimeout(() => setCvNotice(null), 4000)
      }
    } catch {
      setCvNotice('CV not available for this candidate.')
      setTimeout(() => setCvNotice(null), 4000)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Shortlist Review</h1>
          <p className="text-sm text-muted-foreground">AI-ranked candidates with SHAP explanations.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border bg-card p-0.5">
            <button onClick={() => setViewMode('list')} className={cn('flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors', viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button onClick={() => setViewMode('kanban')} className={cn('flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors', viewMode === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </button>
          </div>
          <InfoTip
            size="md"
            content="Assist: you approve each candidate. Veto: AI shortlists automatically, you remove any. Override: full manual control, AI scores are advisory only."
          />
          <div className="flex rounded-xl border bg-card p-1">
            {(['Assist', 'Veto', 'Override'] as Mode[]).map((m) => (
              <button key={m} onClick={() => {
                if (!selectedJob || mode === m) return
                setPendingMode(m)
              }}
                className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {m === 'Assist'   && <CheckCircle2 className="h-3.5 w-3.5" />}
                {m === 'Veto'     && <Ban          className="h-3.5 w-3.5" />}
                {m === 'Override' && <Shield       className="h-3.5 w-3.5" />}
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        {mode === 'Assist'   && 'AI assists — recommendations shown but you approve each decision.'}
        {mode === 'Veto'     && 'AI shortlists automatically. You can veto individual candidates.'}
        {mode === 'Override' && 'Full manual control. AI scores are advisory only.'}
      </div>

      {pendingMode && selectedJob && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>Changing AI mode updates how future actions behave for this job. It will not rewind candidates who have already progressed.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => modeMutation.mutate({ jobId: selectedJob, nextMode: pendingMode })} disabled={modeMutation.isPending}>
              Confirm {pendingMode}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPendingMode(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {isVetoMode && vetoSummary && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
          Veto run complete: processed {vetoSummary.processed}, shortlisted {vetoSummary.shortlisted}, rejected {vetoSummary.rejected}, manual review {vetoSummary.review}.
        </div>
      )}

      {cvNotice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {cvNotice}
        </div>
      )}

      {/* AI Companion chat */}
      {assistantCandidate && mode === 'Assist' && (
        <AssistantPanel
          appId={assistantCandidate.id}
          name={assistantCandidate.name}
          scores={assistantCandidate.scores}
          stage={assistantCandidate.stage}
          onClose={() => setAssistantCandidate(null)}
        />
      )}

      {/* Job + toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">Job:</label>
        <select className="h-9 min-w-[260px] rounded-md border border-input bg-background px-3 text-sm"
          value={selectedJob} onChange={(e) => { setSelectedJob(e.target.value); setShowTriage(false) }}>
          <option value="">Select a job…</option>
          {jobs?.data.map((j: any) => (
            <option key={j._id} value={j._id}>
              {j.title}{j.department ? ` — ${j.department}` : ''}{j.level ? ` (${j.level})` : ''}{j.status === 'draft' ? ' [draft]' : j.status === 'closed' ? ' [closed]' : ''}
            </option>
          ))}
        </select>
        {selectedJob && (
          <>
            <Button size="sm" variant="outline" className="gap-1.5"
              onClick={async () => {
                const bundle = await recruiterService.getJobCvBundle(selectedJob)
                const cvs = bundle.cvs ?? []
                if (!cvs.length) { setCvNotice('No CVs available for this job yet.'); setTimeout(() => setCvNotice(null), 4000); return }
                cvs.forEach((c: { name: string; url: string }) => {
                  const a = document.createElement('a'); a.href = c.url; a.download = `${c.name}.pdf`; a.target = '_blank'; a.click()
                })
              }}>
              <Download className="h-3.5 w-3.5" /> Download All CVs
            </Button>
            {!isOverrideMode && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowTriage((v) => !v)}>
                <Layers className="h-3.5 w-3.5" /> {showTriage ? 'Hide Triage' : 'AI Triage'}
              </Button>
            )}
            {!isOverrideMode && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => biasAuditMutation.mutate()} disabled={biasAuditMutation.isPending}>
                {biasAuditMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                Demographic Parity
              </Button>
            )}
          </>
        )}
      </div>

      {selectedJobData && (
        <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm">
          <p className="font-medium">{selectedJobData.title}</p>
          <p className="mt-1 text-muted-foreground">
            Team: {selectedJobData.teamName || 'Workspace'} | Assignment: {selectedJobData.assignmentMethod === 'manual' ? 'Manual ownership' : selectedJobData.assignmentMethod === 'solo_owner' ? 'Workspace owner' : 'Round robin'}
          </p>
        </div>
      )}

      {!isOverrideMode && auditNotice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800 flex items-center gap-2">
          <Shield className="h-4 w-4 shrink-0" /> {auditNotice}
        </div>
      )}

      {/* AI Triage panel */}
      {!isOverrideMode && showTriage && selectedJob && (
        <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <AiBadge label="AI Triage Analysis" size="md" />
            <span className="text-xs text-muted-foreground">Grouped by resume score · {mode} mode</span>
          </div>
          {triageLoading ? <LoadingSpinner /> : triageData && (
            <>
              {triageData.adminGuidance?.length > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1.5">Suggested next steps</p>
                  {triageData.adminGuidance.map((step: string, i: number) => (
                    <p key={i} className="text-xs text-blue-700 dark:text-blue-400">· {step}</p>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { key: 'strong', label: 'Strong',      icon: TrendingUp,   color: 'emerald' },
                  { key: 'review', label: 'Needs Review', icon: Minus,        color: 'amber'   },
                  { key: 'weak',   label: 'Weak',         icon: TrendingDown, color: 'red'     },
                ].map(({ key, label, icon: Icon, color }) => (
                  <div key={key} className={`rounded-lg border border-${color}-200 dark:border-${color}-900 bg-${color}-50 dark:bg-${color}-950/20 p-3 space-y-2`}>
                    <div className={`flex items-center gap-2 text-${color}-700 dark:text-${color}-400`}>
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="ml-auto text-xs font-normal">{triageData[key]?.length ?? 0}</span>
                    </div>
                    {triageData[key]?.slice(0, 5).map((c: { candidateName: string; score: number; recommendation: string }) => (
                      <div key={c.candidateName} className="text-xs space-y-0.5">
                        <p className="font-medium">{c.candidateName}</p>
                        <p className={`text-${color}-600 dark:text-${color}-400`}>{c.recommendation}</p>
                      </div>
                    ))}
                    {triageData[key]?.length > 5 && (
                      <p className="text-xs text-muted-foreground">+{triageData[key].length - 5} more</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Filter bar */}
      {selectedJob && (data?.data?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/20 px-3 py-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-8 rounded-md border border-input bg-background pl-7 pr-3 text-sm w-44 focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Search name…"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
            />
          </div>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
          >
            <option value="">All stages</option>
            {['applied','screening','assessment','interview','decision','offered','rejected'].map(s => (
              <option key={s} value={s}>{stageLabel(s)}</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Min score</span>
            <input
              type="number" min={0} max={100}
              className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="0"
              value={filterMinScore}
              onChange={(e) => setFilterMinScore(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
          {(filterSearch || filterStage || filterMinScore) && (
            <button
              onClick={() => { setFilterSearch(''); setFilterStage(''); setFilterMinScore('') }}
              className="text-xs text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {!selectedJob ? (
        <WorkspaceEmptyState
          title="Pick a role to start reviewing candidates"
          body="Choose a job to open its hiring workspace, compare applicants, and move the strongest candidates to the next stage."
          secondary={{ label: 'Open jobs workspace', to: '/recruiter/jobs' }}
          icon="search"
        />
      ) : isLoading ? <LoadingSpinner />
      : !data?.data?.length ? (
        <WorkspaceEmptyState
          title="No applications for this role yet"
          body="Share the published job link, double-check the role details, or switch to another open role while candidates begin applying."
          secondary={{ label: 'Back to jobs', to: '/recruiter/jobs' }}
          icon="users"
        />
      ) : viewMode === 'kanban' ? (
        /* Kanban view */
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {['applied', 'screening', 'assessment', 'interview', 'decision', 'offered', 'rejected'].map((stage) => {
              const cols = (data.data ?? []).filter((app: Application) => app.stage === stage)
              return (
                <div key={stage} className="w-64 shrink-0">
                  <div className="mb-2 flex items-center justify-between">
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', stageBadge(stage))}>{stageLabel(stage)}</span>
                    <span className="text-xs text-muted-foreground">{cols.length}</span>
                  </div>
                  <div className="space-y-2">
                    {cols.map((app: Application) => {
                      const candidate = app.candidate as any
                      const user = typeof candidate?.user === 'object' ? candidate.user : null
                      const name = user ? `${user.firstName} ${user.lastName}` : 'Candidate'
                      const initials = user ? `${user.firstName[0]}${user.lastName[0]}` : '?'
                      const score = app.scores?.final
                      return (
                        <div key={app._id} className="rounded-lg border bg-card p-3 space-y-2 shadow-sm">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initials}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{name}</p>
                              {score != null && score > 0 && (
                                <p className={cn('text-xs font-bold', scoreBg(score).split(' ').find(c => c.startsWith('text-')))}>{score.toFixed(0)}%</p>
                              )}
                            </div>
                          </div>
                          {stage === 'applied' && (
                            <button onClick={() => shortlistMutation.mutate(app._id)} disabled={shortlistMutation.isPending}
                              className="w-full rounded-md border border-emerald-200 bg-emerald-50 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                              Shortlist
                            </button>
                          )}
                          {stage === 'screening' && (
                            <button onClick={() => sendAssessmentMutation.mutate(app._id)} disabled={sendAssessmentMutation.isPending}
                              className="w-full rounded-md border py-1 text-xs font-medium hover:bg-accent disabled:opacity-50">
                              Send Assessment
                            </button>
                          )}
                          {!['decision', 'rejected', 'offered'].includes(stage) && (
                            <button onClick={() => rejectMutation.mutate(app._id)} disabled={rejectMutation.isPending}
                              className="w-full rounded-md border border-red-100 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">
                              Reject
                            </button>
                          )}
                        </div>
                      )
                    })}
                    {cols.length === 0 && (
                      <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-xs text-muted-foreground">Empty</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Bulk selection header */}
          {(() => {
            const minScore = filterMinScore ? Number(filterMinScore) : 0
            const filtered = data.data.filter((app: Application) => {
              const candidate = app.candidate as any
              const user = typeof candidate?.user === 'object' ? candidate.user : null
              const name = user ? `${user.firstName} ${user.lastName}` : ''
              if (filterSearch && !name.toLowerCase().includes(filterSearch.toLowerCase())) return false
              if (filterStage && app.stage !== filterStage) return false
              if (minScore > 0 && (app.scores?.final ?? 0) < minScore) return false
              return true
            })
            const allSelected = filtered.length > 0 && filtered.every((a: Application) => selectedIds.has(a._id))
            if (!filtered.length) return null
            return (
              <div className="flex items-center gap-3 px-1 text-sm text-muted-foreground">
                <button
                  onClick={() => {
                    if (allSelected) setSelectedIds(new Set())
                    else setSelectedIds(new Set(filtered.map((a: Application) => a._id)))
                  }}
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                >
                  {allSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                  {allSelected ? 'Deselect all' : `Select all (${filtered.length})`}
                </button>
                {selectedIds.size > 0 && (
                  <span className="text-xs font-medium text-primary">{selectedIds.size} selected</span>
                )}
              </div>
            )
          })()}
          {data.data
            .filter((app: Application) => {
              const candidate = app.candidate as any
              const user = typeof candidate?.user === 'object' ? candidate.user : null
              const name = user ? `${user.firstName} ${user.lastName}` : ''
              if (filterSearch && !name.toLowerCase().includes(filterSearch.toLowerCase())) return false
              if (filterStage && app.stage !== filterStage) return false
              const minScore = filterMinScore ? Number(filterMinScore) : 0
              if (minScore > 0 && (app.scores?.final ?? 0) < minScore) return false
              return true
            })
            .sort((a: Application, b: Application) => (b.scores?.final ?? 0) - (a.scores?.final ?? 0))
            .map((app: Application) => {
              const toPercent = (value?: number) => {
                if (typeof value !== 'number' || Number.isNaN(value)) return null
                return value <= 1 ? value * 100 : value
              }
              const screeningThreshold = toPercent(selectedJobData?.thresholds?.screening)
              const assessmentThreshold = toPercent(selectedJobData?.thresholds?.assessment)
              const interviewThreshold = toPercent(selectedJobData?.thresholds?.interview)

              const thresholdBreaches: Array<{ label: string; value: number; threshold: number }> = []
              const resumeScore = app.scores?.resume
              const assessmentScore = app.scores?.assessment
              const interviewScore = app.scores?.interview
              if (typeof resumeScore === 'number' && resumeScore > 0 && typeof screeningThreshold === 'number' && resumeScore < screeningThreshold) {
                thresholdBreaches.push({ label: 'Screening', value: resumeScore, threshold: screeningThreshold })
              }
              if (typeof assessmentScore === 'number' && assessmentScore > 0 && typeof assessmentThreshold === 'number' && assessmentScore < assessmentThreshold) {
                thresholdBreaches.push({ label: 'Assessment', value: assessmentScore, threshold: assessmentThreshold })
              }
              if (typeof interviewScore === 'number' && interviewScore > 0 && typeof interviewThreshold === 'number' && interviewScore < interviewThreshold) {
                thresholdBreaches.push({ label: 'Interview', value: interviewScore, threshold: interviewThreshold })
              }

              const candidate = app.candidate as Candidate
              const user = typeof candidate?.user === 'object' ? candidate.user as User : null
              const name = user ? `${user.firstName} ${user.lastName}` : 'Candidate'
              const initials = user ? `${user.firstName[0]}${user.lastName[0]}` : '?'
              const isExpand = expanded === app._id
              const isExplaining = showExplanation === app._id
              const isScheduling = scheduleFor === app._id
              const extApp = app as Application & { fairnessComputedAt?: string; explanationComputedAt?: string; interviewId?: string; interviewStatus?: string; interviewScheduledAt?: string }
              const nextAction: NextAction | null =
                app.stage === 'applied'
                  ? { label: 'Shortlist', icon: CheckCircle2, onClick: () => shortlistMutation.mutate(app._id), disabled: shortlistMutation.isPending, className: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' }
                  : app.stage === 'screening'
                    ? { label: 'Send Assessment', icon: ArrowRight, onClick: () => sendAssessmentMutation.mutate(app._id), disabled: sendAssessmentMutation.isPending }
                    : app.stage === 'assessment'
                      ? { label: 'Advance to Interview', icon: Calendar, onClick: () => setScheduleFor(isScheduling ? null : app._id), className: 'text-blue-700 border-blue-200 hover:bg-blue-50' }
                      : app.stage === 'interview' && !extApp.interviewId
                        ? { label: 'Schedule Interview', icon: Calendar, onClick: () => setScheduleFor(isScheduling ? null : app._id), className: 'text-blue-600 border-blue-200 hover:bg-blue-50' }
                        : app.stage === 'interview' && extApp.interviewId && extApp.interviewStatus !== 'completed'
                          ? { label: 'Mark Complete', icon: CheckCircle2, onClick: () => completeMutation.mutate(extApp.interviewId!), disabled: completeMutation.isPending, className: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' }
                          : null

              return (
                <Card key={app._id} className={cn('transition-all', app.stage === 'rejected' ? 'opacity-50' : '', app.stage === 'decision' ? 'border-emerald-200' : '')}>
                  <CardContent className="p-0">
                    {/* Header row */}
                    <div className="p-4 space-y-3">
                      {/* Identity row — never wraps */}
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          onClick={() => setSelectedIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(app._id)) next.delete(app._id)
                            else next.add(app._id)
                            return next
                          })}
                          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                        >
                          {selectedIds.has(app._id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                        </button>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{name}</p>
                          <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-medium mt-0.5', stageBadge(app.stage))}>
                            {stageLabel(app.stage)}
                          </span>
                        </div>
                        {/* Score */}
                        {(app.scores?.final ?? 0) > 0 && (
                          <div className="flex items-center gap-1 shrink-0">
                            <div className={cn('rounded-full border px-3 py-1 text-sm font-bold', scoreBg(app.scores?.final ?? 0))}>
                              {(app.scores?.final ?? 0).toFixed(0)}%
                            </div>
                            <InfoTip content="Weighted composite of CV match, assessment, and interview. Hover the breakdown below for details." />
                          </div>
                        )}
                      </div>

                      {/* Action buttons — wraps freely */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {nextAction && (
                          <Button size="sm" variant="outline" className={cn('gap-1', nextAction.className)} onClick={nextAction.onClick} disabled={nextAction.disabled}>
                            <nextAction.icon className="h-3.5 w-3.5" /> {nextAction.label}
                          </Button>
                        )}
                        {app.stage === 'interview' && extApp.interviewId && extApp.interviewStatus !== 'completed' && (
                          <Button size="sm" variant="outline" className="gap-1 text-purple-600 border-purple-200"
                            onClick={() => window.open(`/recruiter/interview/${extApp.interviewId}?mode=${selectedJobData?.aiMode ?? mode.toLowerCase()}`, '_blank')}>
                            <Video className="h-3.5 w-3.5" /> Join
                          </Button>
                        )}
                        {!isOverrideMode && <AiBadge />}
                        {!isOverrideMode && (
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowExplanation(isExplaining ? null : app._id)}>
                            <FileText className="h-3.5 w-3.5" />
                            {isExplaining ? 'Hide AI Explanation' : 'AI Explanation'}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowCvViewer(showCvViewer === app._id ? null : app._id)}>
                          <Eye className="h-3.5 w-3.5" />
                          {showCvViewer === app._id ? 'Hide CV' : 'View CV'}
                        </Button>
                        <Link to={`/recruiter/correspondence?job=${selectedJob}&app=${app._id}`}>
                          <Button size="sm" variant="outline" className="gap-1">
                            <MessageSquare className="h-3.5 w-3.5" />
                            Messages
                          </Button>
                        </Link>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => downloadCv(app._id)}>
                          <Download className="h-3.5 w-3.5" />
                          CV
                        </Button>

                        {mode === 'Assist' && (
                          <Button size="sm" variant="outline" className="gap-1"
                            onClick={() => setAssistantCandidate(
                              assistantCandidate?.id === app._id ? null :
                              { id: app._id, name, scores: app.scores, stage: app.stage }
                            )}>
                            <Bot className="h-3.5 w-3.5" />
                            {assistantCandidate?.id === app._id ? 'Close Chat' : 'Assist Me'}
                          </Button>
                        )}

                        {app.stage === 'assessment' && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {/* Assessment status badge */}
                            {app.assessmentStatus && (
                              <span className={cn(
                                'rounded-full px-2 py-0.5 text-[11px] font-medium border',
                                app.assessmentStatus === 'completed' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                app.assessmentStatus === 'in_progress' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                                app.assessmentStatus === 'expired' ? 'bg-red-50 border-red-200 text-red-700' :
                                'bg-amber-50 border-amber-200 text-amber-700'
                              )}>
                                Assessment: {app.assessmentStatus === 'in_progress' ? 'In progress' : app.assessmentStatus === 'completed' ? 'Completed' : app.assessmentStatus === 'expired' ? 'Expired' : 'Sent — awaiting start'}
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-blue-700 border-blue-200 hover:bg-blue-50 disabled:opacity-50"
                              onClick={() => setScheduleFor(isScheduling ? null : app._id)}
                              disabled={!extApp.fairnessComputedAt}
                              title={!extApp.fairnessComputedAt ? 'Run the Fairness gate before advancing to interview' : undefined}
                            >
                              <Calendar className="h-3.5 w-3.5" /> Advance to Interview
                            </Button>
                            {!extApp.fairnessComputedAt && (
                              <span className="text-[11px] text-amber-600 font-medium">⚠ Fairness check required</span>
                            )}
                            {/* Only allow reset if candidate hasn't started yet */}
                            {(!app.assessmentStatus || app.assessmentStatus === 'pending') && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-amber-700 border-amber-200 hover:bg-amber-50"
                                onClick={() => undoAssessmentMutation.mutate(app._id)}
                                disabled={undoAssessmentMutation.isPending}
                              >
                                <ArrowRight className="h-3.5 w-3.5 rotate-180" /> Reset Assessment
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="gap-1 text-purple-600 border-purple-200 hover:bg-purple-50"
                              onClick={() => fairnessMutation.mutate(app._id)} disabled={fairnessMutation.isPending}>
                              <Shield className="h-3.5 w-3.5" /> Run Fairness
                            </Button>
                            <InfoTip content="Checks for demographic parity before confirming a shortlist decision." />
                          </div>
                        )}
                        {!['decision', 'rejected', 'offered'].includes(app.stage) && (
                          <Button size="sm" variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/5"
                            onClick={() => {
                              if (app.stage === 'assessment' || app.stage === 'interview') {
                                rejectDecisionMutation.mutate(app._id)
                                return
                              }
                              rejectMutation.mutate(app._id)
                            }}
                            disabled={rejectMutation.isPending || rejectDecisionMutation.isPending}>
                            <Ban className="h-3.5 w-3.5" /> Reject
                          </Button>
                        )}
                        {mode === 'Veto' && ['shortlist', 'reject'].includes(app.aiDecision ?? '') && ['screening', 'rejected'].includes(app.stage) && (
                          <Button size="sm" variant="outline" className="text-amber-700 border-amber-200 hover:bg-amber-50"
                            onClick={() => undoVetoMutation.mutate(app._id)} disabled={undoVetoMutation.isPending}>
                            <ArrowRight className="h-3.5 w-3.5 rotate-180" /> Undo Veto
                          </Button>
                        )}
                        <button onClick={() => setExpanded(isExpand ? null : app._id)} className="p-1 text-muted-foreground shrink-0 ml-auto">
                          {isExpand ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Threshold breach strip */}
                    {thresholdBreaches.length > 0 && (
                      <div className="border-t px-4 py-2 flex flex-wrap gap-2">
                        {thresholdBreaches.map((breach) => (
                          <span
                            key={`${breach.label}-${breach.threshold}`}
                            className="inline-block rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700"
                          >
                            {breach.label} below threshold ({breach.value.toFixed(0)}% &lt; {breach.threshold.toFixed(0)}%)
                          </span>
                        ))}
                      </div>
                    )}

                    {/* AI suggestion strip */}
                    {!isOverrideMode && (
                      <div className="border-t px-4 py-3">
                        {latestBiasAudit && (
                          <div className={cn('mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
                            latestBiasAudit.flagged ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>
                            <Shield className="h-3.5 w-3.5 shrink-0" />
                            Latest demographic parity audit:
                            <span className="font-semibold">{latestBiasAudit.flagged ? 'Flagged for review' : 'Passed'}</span>
                            <span className="text-current/80">
                              gender {(Number(latestBiasAudit.disparateImpact?.gender ?? 1) * 100).toFixed(0)}%,
                              age {(Number((latestBiasAudit.disparateImpact as any)?.ageRange ?? latestBiasAudit.disparateImpact?.age ?? 1) * 100).toFixed(0)}%,
                              ethnicity {(Number(latestBiasAudit.disparateImpact?.ethnicity ?? 1) * 100).toFixed(0)}%
                            </span>
                          </div>
                        )}
                        <AiSuggestion
                          stage={app.stage}
                          scores={app.scores}
                          fairnessComputedAt={extApp.fairnessComputedAt}
                          decision={(app as any).decision}
                        />
                      </div>
                    )}

                    {/* Inline AI Explanation panel */}
                    {!isOverrideMode && isExplaining && (
                      <div className="border-t px-4 pb-4 pt-3">
                        <ExplanationPanel appId={app._id} candidateName={name} />
                      </div>
                    )}

                    {/* CV Viewer + AI Analysis panel */}
                    {showCvViewer === app._id && (
                      <div className="border-t px-4 pb-4 pt-3">
                        <CvViewerPanel appId={app._id} name={name} enableAi={!isOverrideMode} onClose={() => setShowCvViewer(null)} />
                      </div>
                    )}

                    {/* Schedule Interview inline panel */}
                    {isScheduling && (
                      <div className="border-t bg-blue-50/50 px-4 py-3 space-y-3">
                        <p className="text-sm font-medium text-blue-700">Schedule interview for {name}</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Date & Time</label>
                            <input type="datetime-local" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                              value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Duration (minutes)</label>
                            <input type="number" min={15} max={120} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                              value={duration} onChange={(e) => setDuration(+e.target.value)} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => scheduleMutation.mutate({ appId: app._id, scheduledAt, durationMin: duration })}
                            disabled={scheduleMutation.isPending}>
                            <Calendar className="h-3.5 w-3.5" /> Confirm Schedule
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setScheduleFor(null)}>Cancel</Button>
                        </div>
                      </div>
                    )}

                    {/* Recruiter notes panel */}
                    {isExpand && (
                      <div className="border-t px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recruiter Notes</p>
                          {editingNotes !== app._id && (
                            <button
                              onClick={() => { setEditingNotes(app._id); setNotesValue(app.recruiterNotes ?? '') }}
                              className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <Pencil className="h-3 w-3" /> {app.recruiterNotes ? 'Edit' : 'Add note'}
                            </button>
                          )}
                        </div>
                        {editingNotes === app._id ? (
                          <div className="space-y-2">
                            <textarea
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                              rows={3}
                              placeholder="Add private notes about this candidate…"
                              value={notesValue}
                              onChange={(e) => setNotesValue(e.target.value)}
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Button size="sm" className="gap-1" onClick={() => notesMutation.mutate({ id: app._id, notes: notesValue })} disabled={notesMutation.isPending}>
                                <Save className="h-3.5 w-3.5" /> Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingNotes(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            {app.recruiterNotes || 'No notes yet.'}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Expanded SHAP score details */}
                    {isExpand && (
                      <div className="border-t px-4 pb-4 pt-3 space-y-3">
                        {!isOverrideMode && <AiBadge label="Stage Score Breakdown" size="md" />}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {[
                            { label: 'Resume',     value: app.scores?.resume },
                            { label: 'Assessment', value: app.scores?.assessment },
                            { label: 'Interview',  value: app.scores?.interview },
                          ].map(({ label, value }) => (
                            <div key={label} className="rounded-lg border bg-muted/30 p-3 text-center">
                              <p className="text-xs text-muted-foreground">{label}</p>
                              <p className={cn('mt-1 text-lg font-bold', value !== undefined && value > 0 ? scoreBg(value).split(' ').filter(c => c.startsWith('text-')).join(' ') : 'text-muted-foreground')}>
                                {value !== undefined && value > 0 ? `${value.toFixed(0)}%` : '—'}
                              </p>
                            </div>
                          ))}
                          {/* Fairness — special display: penalty=0 means passed */}
                          <div className="rounded-lg border bg-muted/30 p-3 text-center">
                            <p className="text-xs text-muted-foreground">Fairness</p>
                            {extApp.fairnessComputedAt ? (
                              app.scores?.penalty !== undefined && app.scores.penalty > 0 ? (
                                <p className="mt-1 text-lg font-bold text-red-600">-{app.scores.penalty.toFixed(0)}%</p>
                              ) : (
                                <p className="mt-1 text-sm font-bold text-emerald-600">✓ Passed</p>
                              )
                            ) : (
                              <p className="mt-1 text-sm text-amber-600 font-medium">Pending</p>
                            )}
                          </div>
                        </div>
                        {extApp.interviewScheduledAt && (
                          <p className="text-xs text-muted-foreground">
                            Interview: {new Date(extApp.interviewScheduledAt).toLocaleString()}
                            {extApp.interviewStatus && ` · ${extApp.interviewStatus}`}
                          </p>
                        )}
                        {Array.isArray((extApp as any).interviewPreferredTimes) && (extApp as any).interviewPreferredTimes.length > 0 && (
                          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 space-y-1">
                            <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">Candidate availability</p>
                            {(extApp as any).interviewPreferredTimes.map((t: string, i: number) => (
                              <p key={i} className="text-xs text-blue-700">{new Date(t).toLocaleString()}</p>
                            ))}
                          </div>
                        )}
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          <p>{extApp.fairnessComputedAt ? `✓ Fairness gate: ${new Date(extApp.fairnessComputedAt).toLocaleString()}` : '○ Fairness gate: pending'}</p>
                          <p>{extApp.explanationComputedAt ? `✓ SHAP explanation: ${new Date(extApp.explanationComputedAt).toLocaleString()}` : '○ SHAP explanation: pending'}</p>
                        </div>
                        {app.scores?.final !== undefined && (
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-muted-foreground">
                              Final score is weighted: CV 30% · Assessment 30% · Interview 30% · Fairness 10%. Human review required before any hiring decision.
                            </p>
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

      {/* Bulk action bar — sticky at bottom */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-2xl border bg-card px-5 py-3 shadow-2xl">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <div className="h-4 w-px bg-border" />
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => bulkMutation.mutate({ ids: [...selectedIds], action: 'shortlist' })}
              disabled={bulkMutation.isPending}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Shortlist all
            </Button>
            <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => bulkMutation.mutate({ ids: [...selectedIds], action: 'send-assessment' })}
              disabled={bulkMutation.isPending}>
              <ArrowRight className="h-3.5 w-3.5" /> Send Assessment
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => bulkMutation.mutate({ ids: [...selectedIds], action: 'reject' })}
              disabled={bulkMutation.isPending}>
              <Ban className="h-3.5 w-3.5" /> Reject all
            </Button>
            <button onClick={() => setSelectedIds(new Set())} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
