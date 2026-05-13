import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  ChevronDown, ChevronUp, Shield, Ban, CheckCircle2, AlertTriangle,
  Calendar, Video, ArrowRight, Download, Layers, TrendingUp, TrendingDown,
  Minus, Bot, X, Send, Loader2, Info, FileText, Eye, Sparkles, ExternalLink,
} from 'lucide-react'
import InfoTip from '../../components/shared/InfoTip'
import { applicationService } from '../../services/application.service'
import { jobService } from '../../services/job.service'
import { recruiterService } from '../../services/recruiter.service'
import api from '../../lib/axios'
import { Card, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import AiBadge from '../../components/shared/AiBadge'
import AiSuggestion from '../../components/shared/AiSuggestion'
import { scoreBg, cn } from '../../lib/utils'
import type { Application, Candidate, User } from '../../types'

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
function CvViewerPanel({ appId, name, onClose }: { appId: string; name: string; onClose: () => void }) {
  const { data: cvData, isLoading: cvLoading } = useQuery({
    queryKey: ['recruiter-cv', appId],
    queryFn: () => recruiterService.getApplicationCv(appId),
    retry: false,
  })
  const { data: analysis, isLoading: analysisLoading, refetch: runAnalysis, isFetched } = useQuery({
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
      <div className="border-t pt-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">AI CV Analysis</p>
            <AiBadge size="sm" />
          </div>
          {!isFetched && (
            <Button size="sm" variant="outline" onClick={() => runAnalysis()} disabled={analysisLoading} className="gap-1">
              {analysisLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Analyse CV
            </Button>
          )}
        </div>

        {analysisLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Gemini is analysing the CV…</div>}

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
      </div>
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
  const qc = useQueryClient()

  const { data: jobs } = useQuery({ queryKey: ['my-jobs'], queryFn: () => jobService.myJobs() })
  const [selectedJob, setSelectedJob] = useState(jobId)

  const { data: triageData, isLoading: triageLoading } = useQuery({
    queryKey: ['triage', selectedJob, mode],
    queryFn: () => recruiterService.getJobTriage(selectedJob, mode.toLowerCase() as 'assist' | 'veto' | 'override'),
    enabled: !!selectedJob && showTriage,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['applications', selectedJob],
    queryFn: () => applicationService.listForJob(selectedJob),
    enabled: !!selectedJob,
  })

  const mutOpts = { onSuccess: () => qc.invalidateQueries({ queryKey: ['applications', selectedJob] }) }

  const shortlistMutation  = useMutation({ mutationFn: (id: string) => applicationService.shortlist(id), ...mutOpts })
  const rejectMutation     = useMutation({ mutationFn: (id: string) => applicationService.reject(id), ...mutOpts })
  const sendAssessmentMutation = useMutation({ mutationFn: (id: string) => applicationService.sendAssessment(id, 60), ...mutOpts })
  const fairnessMutation   = useMutation({ mutationFn: (id: string) => applicationService.runFairnessGate(id), ...mutOpts })
  const scheduleMutation   = useMutation({
    mutationFn: ({ appId, scheduledAt, durationMin }: { appId: string; scheduledAt: string; durationMin: number }) =>
      api.post('/interviews', { applicationId: appId, scheduledAt: new Date(scheduledAt).toISOString(), durationMin, mode: mode.toLowerCase() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['applications', selectedJob] }); setScheduleFor(null) },
  })
  const completeMutation = useMutation({
    mutationFn: (interviewId: string) => api.post(`/interviews/${interviewId}/complete`, {}),
    ...mutOpts,
  })
  const vetoMutation = useMutation({
    mutationFn: () => applicationService.aiDecide({ jobId: selectedJob }),
    onSuccess: (resp: any) => {
      const results = Array.isArray(resp?.results) ? resp.results : []
      setVetoSummary({
        processed: Number(resp?.processed ?? results.length),
        shortlisted: results.filter((r: any) => r.action === 'shortlisted').length,
        rejected: results.filter((r: any) => r.action === 'rejected').length,
        review: results.filter((r: any) => r.action === 'review').length,
      })
      qc.invalidateQueries({ queryKey: ['applications', selectedJob] })
    },
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
          <InfoTip
            size="md"
            content="Assist: you approve each candidate. Veto: AI shortlists automatically, you remove any. Override: full manual control, AI scores are advisory only."
          />
          <div className="flex rounded-xl border bg-card p-1">
            {(['Assist', 'Veto', 'Override'] as Mode[]).map((m) => (
              <button key={m} onClick={() => {
                setMode(m)
                if (m === 'Veto' && selectedJob) vetoMutation.mutate()
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

      {mode === 'Veto' && vetoSummary && (
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
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowTriage((v) => !v)}>
              <Layers className="h-3.5 w-3.5" /> {showTriage ? 'Hide Triage' : 'AI Triage'}
            </Button>
          </>
        )}
      </div>

      {/* AI Triage panel */}
      {showTriage && selectedJob && (
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

      {!selectedJob ? (
        <p className="text-sm text-muted-foreground">Select a job to view applications.</p>
      ) : isLoading ? <LoadingSpinner />
      : !data?.data.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No applications yet for this role.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {data.data
            .sort((a: Application, b: Application) => (b.scores?.final ?? 0) - (a.scores?.final ?? 0))
            .map((app: Application) => {
              const candidate = app.candidate as Candidate
              const user = typeof candidate?.user === 'object' ? candidate.user as User : null
              const name = user ? `${user.firstName} ${user.lastName}` : 'Candidate'
              const initials = user ? `${user.firstName[0]}${user.lastName[0]}` : '?'
              const isExpand = expanded === app._id
              const isExplaining = showExplanation === app._id
              const isScheduling = scheduleFor === app._id
              const extApp = app as Application & { fairnessComputedAt?: string; explanationComputedAt?: string; interviewId?: string; interviewStatus?: string; interviewScheduledAt?: string }

              return (
                <Card key={app._id} className={cn('transition-all', app.stage === 'rejected' ? 'opacity-50' : '', app.stage === 'decision' ? 'border-emerald-200' : '')}>
                  <CardContent className="p-0">
                    {/* Header row */}
                    <div className="flex items-center gap-3 p-4 flex-wrap">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{name}</p>
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

                      {/* Action buttons */}
                      <Button size="sm" variant="outline" className="gap-1"
                        onClick={() => setShowExplanation(isExplaining ? null : app._id)}>
                        <FileText className="h-3.5 w-3.5" />
                        {isExplaining ? 'Hide' : 'AI Explanation'}
                      </Button>

                      <Button size="sm" variant="outline" className="gap-1"
                        onClick={() => setShowCvViewer(showCvViewer === app._id ? null : app._id)}>
                        <Eye className="h-3.5 w-3.5" />
                        {showCvViewer === app._id ? 'Hide CV' : 'View CV'}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1"
                        onClick={() => downloadCv(app._id)}>
                        <Download className="h-3.5 w-3.5" />
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

                      <AiBadge />

                      {/* Pipeline action buttons */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {app.stage === 'applied' && mode !== 'Veto' && (
                          <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            onClick={() => shortlistMutation.mutate(app._id)} disabled={shortlistMutation.isPending}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Shortlist
                          </Button>
                        )}
                        {app.stage === 'screening' && mode !== 'Override' && (
                          <Button size="sm" variant="outline"
                            onClick={() => sendAssessmentMutation.mutate(app._id)} disabled={sendAssessmentMutation.isPending}>
                            <ArrowRight className="h-3.5 w-3.5" /> Send Assessment
                          </Button>
                        )}
                        {app.stage === 'assessment' && mode !== 'Override' && (
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="outline" className="text-purple-600 border-purple-200 hover:bg-purple-50"
                              onClick={() => fairnessMutation.mutate(app._id)} disabled={fairnessMutation.isPending}>
                              <Shield className="h-3.5 w-3.5" /> Run Fairness
                            </Button>
                            <InfoTip content="Checks for demographic parity before confirming a shortlist decision." />
                          </div>
                        )}
                        {app.stage === 'interview' && !extApp.interviewId && (
                          <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50"
                            onClick={() => setScheduleFor(isScheduling ? null : app._id)}>
                            <Calendar className="h-3.5 w-3.5" /> Schedule Interview
                          </Button>
                        )}
                        {app.stage === 'interview' && extApp.interviewId && extApp.interviewStatus !== 'completed' && (
                          <>
                            <Button size="sm" variant="outline" className="text-purple-600 border-purple-200"
                              onClick={() => window.open(`/recruiter/interview/${extApp.interviewId}?mode=${mode.toLowerCase()}`, '_blank')}>
                              <Video className="h-3.5 w-3.5" /> Join
                            </Button>
                            <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200"
                              onClick={() => completeMutation.mutate(extApp.interviewId!)}>
                              <CheckCircle2 className="h-3.5 w-3.5" /> Mark Complete
                            </Button>
                          </>
                        )}
                        {!['decision', 'rejected', 'offered'].includes(app.stage) && mode !== 'Veto' && (
                          <Button size="sm" variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/5"
                            onClick={() => rejectMutation.mutate(app._id)} disabled={rejectMutation.isPending}>
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>

                      <button onClick={() => setExpanded(isExpand ? null : app._id)} className="p-1 text-muted-foreground shrink-0">
                        {isExpand ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* AI suggestion strip */}
                    <div className="border-t px-4 py-3">
                      <AiSuggestion
                        stage={app.stage}
                        scores={app.scores}
                        fairnessComputedAt={extApp.fairnessComputedAt}
                        decision={(app as any).decision}
                      />
                    </div>

                    {/* Inline AI Explanation panel */}
                    {isExplaining && (
                      <div className="border-t px-4 pb-4 pt-3">
                        <ExplanationPanel appId={app._id} candidateName={name} />
                      </div>
                    )}

                    {/* CV Viewer + AI Analysis panel */}
                    {showCvViewer === app._id && (
                      <div className="border-t px-4 pb-4 pt-3">
                        <CvViewerPanel appId={app._id} name={name} onClose={() => setShowCvViewer(null)} />
                      </div>
                    )}

                    {/* Schedule Interview inline panel */}
                    {isScheduling && (
                      <div className="border-t bg-blue-50/50 px-4 py-3 space-y-3">
                        <p className="text-sm font-medium text-blue-700">Schedule interview for {name}</p>
                        <div className="grid grid-cols-2 gap-3">
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

                    {/* Expanded SHAP score details */}
                    {isExpand && (
                      <div className="border-t px-4 pb-4 pt-3 space-y-3">
                        <AiBadge label="Stage Score Breakdown" size="md" />
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {[
                            { label: 'Resume',     value: app.scores?.resume },
                            { label: 'Assessment', value: app.scores?.assessment },
                            { label: 'Fairness',   value: app.scores?.penalty },
                            { label: 'Interview',  value: app.scores?.interview },
                          ].map(({ label, value }) => (
                            <div key={label} className="rounded-lg border bg-muted/30 p-3 text-center">
                              <p className="text-xs text-muted-foreground">{label}</p>
                              <p className={cn('mt-1 text-lg font-bold', value !== undefined && value > 0 ? scoreBg(value).split(' ').filter(c => c.startsWith('text-')).join(' ') : 'text-muted-foreground')}>
                                {value !== undefined && value > 0 ? `${value.toFixed(0)}%` : '—'}
                              </p>
                            </div>
                          ))}
                        </div>
                        {extApp.interviewScheduledAt && (
                          <p className="text-xs text-muted-foreground">
                            Interview: {new Date(extApp.interviewScheduledAt).toLocaleString()}
                            {extApp.interviewStatus && ` · ${extApp.interviewStatus}`}
                          </p>
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
    </div>
  )
}
