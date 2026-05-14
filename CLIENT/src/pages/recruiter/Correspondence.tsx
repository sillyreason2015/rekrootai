import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Send, Loader2, Mail, CheckCircle2, MessageSquare, Reply, ArrowLeft } from 'lucide-react'
import { applicationService } from '../../services/application.service'
import { jobService } from '../../services/job.service'
import { Button } from '../../components/ui/button'
import BrandSpinner from '../../components/brand/BrandSpinner'
import type { Application, Candidate, User } from '../../types'

const TEMPLATES: Record<string, { subject: string; body: string }> = {
  Shortlisted: {
    subject: 'Great news — you have been shortlisted',
    body: 'Congratulations! We are pleased to inform you that your application has been shortlisted. Please log in to your candidate portal to view next steps.',
  },
  Assessment: {
    subject: 'Action required: complete your online assessment',
    body: 'We would like to invite you to complete an online assessment as part of our selection process. Please log in to your portal to begin. The assessment has a time limit so please ensure you are in a quiet environment before starting.',
  },
  Interview: {
    subject: 'Interview invitation',
    body: 'We are delighted to invite you for a structured interview. Please log in to your candidate portal to confirm your availability and join the session at the scheduled time.',
  },
  'Not Selected': {
    subject: 'Your application — update',
    body: 'Thank you sincerely for the time and effort you invested in your application. After careful consideration of all candidates, we have decided to proceed with other applicants at this stage. We encourage you to apply for future openings.',
  },
  Offer: {
    subject: 'Congratulations — offer of employment',
    body: 'Congratulations! We are thrilled to extend you an offer for this role. Please log in to your portal to view the full offer details and respond within 5 business days.',
  },
}

export default function Correspondence() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialJob = searchParams.get('job') ?? ''
  const initialApp = searchParams.get('app') ?? ''
  const [selectedJob, setSelectedJob] = useState(initialJob)
  const [selectedApp, setSelectedApp] = useState(initialApp)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [replySubject, setReplySubject] = useState('')
  const [replyMessage, setReplyMessage] = useState('')
  const [error, setError] = useState('')
  const [sendStatus, setSendStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const { data: jobs } = useQuery({ queryKey: ['my-jobs'], queryFn: () => jobService.myJobs() })

  const { data: applications } = useQuery({
    queryKey: ['apps-for-correspondence', selectedJob],
    queryFn: () => applicationService.listForJob(selectedJob),
    enabled: !!selectedJob,
  })
  const { data: thread } = useQuery({
    queryKey: ['correspondence-thread', selectedApp],
    queryFn: () => applicationService.getCorrespondenceThread(selectedApp),
    enabled: !!selectedApp,
  })

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams)
    if (selectedJob) nextParams.set('job', selectedJob)
    else nextParams.delete('job')
    if (selectedApp) nextParams.set('app', selectedApp)
    else nextParams.delete('app')
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams, selectedApp, selectedJob, setSearchParams])

  const threadItems = Array.isArray(thread?.thread) ? thread.thread as Array<Record<string, unknown>> : []
  const latestCandidateEntry = useMemo(
    () => [...threadItems].reverse().find((entry) => String(entry.senderRole) === 'candidate') ?? null,
    [threadItems],
  )

  useEffect(() => {
    if (!replySubject && latestCandidateEntry?.subject && typeof latestCandidateEntry.subject === 'string') {
      setReplySubject(String(latestCandidateEntry.subject).startsWith('Re:') ? String(latestCandidateEntry.subject) : `Re: ${String(latestCandidateEntry.subject)}`)
    }
  }, [latestCandidateEntry, replySubject])

  const sendMutation = useMutation({
    mutationFn: () => applicationService.sendCorrespondence(selectedApp, { subject, message }),
    onSuccess: () => {
      setMessage('')
      setError('')
      setSendStatus({ kind: 'success', text: 'Message sent successfully.' })
      qc.invalidateQueries({ queryKey: ['correspondence-thread', selectedApp] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Failed to send message. Please try again.')
      setSendStatus({ kind: 'error', text: msg ?? 'Failed to send message. Please try again.' })
    },
  })

  const replyMutation = useMutation({
    mutationFn: () => applicationService.replyCorrespondence(selectedApp, { subject: replySubject || undefined, message: replyMessage }),
    onSuccess: () => {
      setReplyMessage('')
      setError('')
      setSendStatus({ kind: 'success', text: 'Reply sent successfully.' })
      qc.invalidateQueries({ queryKey: ['correspondence-thread', selectedApp] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Failed to send reply. Please try again.')
      setSendStatus({ kind: 'error', text: msg ?? 'Failed to send reply. Please try again.' })
    },
  })
  const sending = sendMutation.isPending || replyMutation.isPending

  const candidateName = (app: Application): string => {
    const candidate = app.candidate as Candidate
    const user = typeof candidate?.user === 'object' ? candidate.user as User : null
    if (user?.firstName) return `${user.firstName} ${user.lastName}`
    return `Application ${app._id.slice(-6)}`
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Correspondence</h1>
        <p className="text-sm text-muted-foreground">Send decisions and messages directly to candidates by email.</p>
        {!!selectedApp && (
          <Link to="/recruiter/shortlist" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to pipeline
          </Link>
        )}
      </div>

      {/* Selectors */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Job posting</label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedJob}
            onChange={(e) => {
              setSelectedJob(e.target.value)
              setSelectedApp('')
              setReplySubject('')
              setReplyMessage('')
            }}
          >
            <option value="">Select a job…</option>
            {jobs?.data.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Candidate</label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedApp}
            onChange={(e) => {
              setSelectedApp(e.target.value)
              setReplySubject('')
              setReplyMessage('')
            }}
            disabled={!selectedJob}
          >
            <option value="">Select a candidate…</option>
            {applications?.data.map((app: Application) => (
              <option key={app._id} value={app._id}>
                {candidateName(app)} — {app.stage}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Templates */}
      <div>
        <p className="mb-2 text-sm font-medium">Quick templates</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(TEMPLATES).map(([key, tpl]) => (
            <button
              key={key}
              onClick={() => { setSubject(tpl.subject); setMessage(tpl.body) }}
              className="rounded-full border bg-card px-3 py-1 text-xs capitalize transition-colors hover:border-primary/40 hover:bg-accent"
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {/* Compose */}
      <div className="space-y-3 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mail className="h-4 w-4" />
          Message will be sent via email and logged in the audit trail
        </div>
        <input
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Email subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <textarea
          rows={7}
          className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Type your message…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{message.length} characters</p>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={!selectedApp || !subject || !message || sendMutation.isPending}
          >
            {sendMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Send className="h-4 w-4" /> Send Message
          </Button>
        </div>
        {sendMutation.isPending && <BrandSpinner className="py-4" label="Sending message" />}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {sendStatus?.kind === 'success' && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {sendStatus.text}
        </div>
      )}
      {!!selectedApp && Array.isArray(thread?.thread) && thread.thread.length > 0 && (
        <div className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Conversation thread</p>
          </div>
          <div className="space-y-3">
            {threadItems.map((t: any, index: number) => {
              const fromCandidate = t.senderRole === 'candidate'
              return (
                <div
                  key={t._id ?? `${t.sentAt ?? 'thread'}-${index}`}
                  className={`rounded-lg border p-3 text-sm ${fromCandidate ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-muted/30'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{fromCandidate ? 'Candidate message' : 'Recruiter message'}</p>
                    {t.sentAt && <p className="text-[11px] text-muted-foreground">{new Date(String(t.sentAt)).toLocaleString()}</p>}
                  </div>
                  {t.subject && <p className="mt-1 text-xs font-medium text-foreground/80">Subject: {String(t.subject)}</p>}
                  <p className="mt-2 whitespace-pre-line text-muted-foreground">{t.message}</p>
                  {t.deliveryStatus && <p className="mt-2 text-[11px] text-muted-foreground">Delivery: {t.deliveryStatus}</p>}
                </div>
              )
            })}
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <Reply className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-primary">Reply to candidate</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              This sends a direct response on the same application thread and keeps the conversation together.
            </p>
            <div className="mt-3 space-y-3">
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Reply subject (optional)"
                value={replySubject}
                onChange={(e) => setReplySubject(e.target.value)}
              />
              <textarea
                rows={5}
                className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Write your reply to the candidate..."
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{replyMessage.length} characters</p>
                <Button
                  onClick={() => replyMutation.mutate()}
                  disabled={!selectedApp || replyMessage.trim().length < 3 || replyMutation.isPending}
                >
                  {replyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Reply className="h-4 w-4" /> Send Reply
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {!selectedApp && sending && <BrandSpinner className="py-4" label="Sending update" />}
    </div>
  )
}
