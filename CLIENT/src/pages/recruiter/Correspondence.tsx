import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Send, Loader2, Mail } from 'lucide-react'
import { applicationService } from '../../services/application.service'
import { jobService } from '../../services/job.service'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import type { Application, Candidate, User } from '../../types'

const TEMPLATES = {
  shortlist: 'Congratulations! We are pleased to inform you that your application has been shortlisted for the next stage of our recruitment process.',
  assessment: 'We would like to invite you to complete an online assessment as part of our selection process. Please log in to your portal to begin.',
  interview: 'We are delighted to invite you for an interview. Please log in to your candidate portal to confirm your availability.',
  rejection: 'Thank you for your interest in this role. After careful consideration, we have decided to proceed with other candidates at this time.',
  offer: 'Congratulations! We are thrilled to offer you the position. Please review the attached offer letter and respond within 5 business days.',
}

export default function Correspondence() {
  const [selectedJob, setSelectedJob] = useState('')
  const [selectedApp, setSelectedApp] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState<string[]>([])

  const { data: jobs } = useQuery({ queryKey: ['my-jobs'], queryFn: () => jobService.myJobs() })
  const { data: applications, isLoading } = useQuery({
    queryKey: ['apps-for-correspondence', selectedJob],
    queryFn: () => applicationService.listForJob(selectedJob),
    enabled: !!selectedJob,
  })

  const sendMutation = useMutation({
    mutationFn: () => applicationService.sendCorrespondence(selectedApp, message),
    onSuccess: () => {
      setSent((p) => [...p, selectedApp])
      setMessage('')
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Correspondence</h1>
        <p className="text-sm text-muted-foreground">Send decisions and messages to candidates.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Select Job</label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedJob}
            onChange={(e) => { setSelectedJob(e.target.value); setSelectedApp('') }}
          >
            <option value="">Choose a job...</option>
            {jobs?.data.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Select Candidate</label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedApp}
            onChange={(e) => setSelectedApp(e.target.value)}
            disabled={!selectedJob}
          >
            <option value="">Choose a candidate...</option>
            {applications?.data.map((app: Application) => {
              const candidate = app.candidate as Candidate
              const user = typeof candidate?.user === 'object' ? candidate.user as User : null
              return (
                <option key={app._id} value={app._id}>
                  {user ? `${user.firstName} ${user.lastName}` : app._id}
                </option>
              )
            })}
          </select>
        </div>
      </div>

      {/* Templates */}
      <div>
        <p className="mb-2 text-sm font-medium">Quick Templates</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(TEMPLATES).map(([key, text]) => (
            <button
              key={key}
              onClick={() => setMessage(text)}
              className="rounded-full border bg-card px-3 py-1 text-xs hover:border-primary/40 hover:bg-accent capitalize transition-colors"
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
          Message will be sent via email and shown in candidate portal
        </div>
        <textarea
          rows={6}
          className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Type your message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{message.length} characters</p>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={!selectedApp || !message || sendMutation.isPending || sent.includes(selectedApp)}
          >
            {sendMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Send className="h-4 w-4" /> Send Message
          </Button>
        </div>
      </div>

      {/* Sent confirmation */}
      {sent.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          ✓ {sent.length} message{sent.length > 1 ? 's' : ''} sent successfully.
        </div>
      )}
    </div>
  )
}
