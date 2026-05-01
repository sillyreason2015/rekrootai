import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Send, Loader2, Mail, CheckCircle2 } from 'lucide-react'
import { applicationService } from '../../services/application.service'
import { jobService } from '../../services/job.service'
import { Button } from '../../components/ui/button'
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
  const [selectedJob, setSelectedJob] = useState('')
  const [selectedApp, setSelectedApp] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState<string[]>([])
  const [error, setError] = useState('')

  const { data: jobs } = useQuery({ queryKey: ['my-jobs'], queryFn: () => jobService.myJobs() })

  const { data: applications } = useQuery({
    queryKey: ['apps-for-correspondence', selectedJob],
    queryFn: () => applicationService.listForJob(selectedJob),
    enabled: !!selectedJob,
  })

  const sendMutation = useMutation({
    mutationFn: () => applicationService.sendCorrespondence(selectedApp, { subject, message }),
    onSuccess: () => {
      setSent((p) => [...p, selectedApp])
      setMessage('')
      setError('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Failed to send message. Please try again.')
    },
  })

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
      </div>

      {/* Selectors */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Job posting</label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedJob}
            onChange={(e) => { setSelectedJob(e.target.value); setSelectedApp('') }}
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
            onChange={(e) => setSelectedApp(e.target.value)}
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
            disabled={!selectedApp || !subject || !message || sendMutation.isPending || sent.includes(selectedApp)}
          >
            {sendMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Send className="h-4 w-4" /> Send Message
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {sent.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {sent.length} message{sent.length > 1 ? 's' : ''} sent successfully.
        </div>
      )}
    </div>
  )
}
