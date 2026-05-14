import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Video, Calendar, Clock, CheckCircle2, ChevronDown, ChevronUp, FileVideo, FileText, Download, BrainCircuit } from 'lucide-react'
import { interviewService } from '../../services/interview.service'
import { Card, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { formatDate } from '../../lib/utils'
import type { Interview, InterviewArtifactsResponse } from '../../types'

const statusVariant: Record<string, 'default' | 'secondary' | 'success' | 'destructive' | 'warning'> = {
  scheduled: 'secondary',
  live: 'warning',
  completed: 'success',
  cancelled: 'destructive',
}

export default function RecruiterInterviews() {
  const qc = useQueryClient()
  const { data: interviews, isLoading } = useQuery({
    queryKey: ['my-interviews'],
    queryFn: interviewService.getMine,
  })

  if (isLoading) return <LoadingSpinner />

  const upcoming = interviews?.filter((i: Interview) => i.status === 'scheduled') ?? []
  const past = interviews?.filter((i: Interview) => i.status !== 'scheduled') ?? []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Interviews</h1>
        <p className="text-sm text-muted-foreground">
          {interviews?.length ?? 0} total · {upcoming.length} upcoming
        </p>
      </div>

      {!interviews?.length ? (
        <Card>
          <CardContent className="py-20 text-center">
            <Video className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No interviews scheduled yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Interviews are scheduled from the Shortlist page once you advance a candidate.
            </p>
            <Link
              to="/recruiter/shortlist"
              className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
            >
              Go to Shortlist
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-serif text-lg font-semibold">Upcoming</h2>
              {upcoming.map((interview: Interview) => (
                <InterviewCard key={interview._id} interview={interview} onChanged={() => qc.invalidateQueries({ queryKey: ['my-interviews'] })} />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-serif text-lg font-semibold text-muted-foreground">Past</h2>
              {past.map((interview: Interview) => (
                <InterviewCard key={interview._id} interview={interview} onChanged={() => qc.invalidateQueries({ queryKey: ['my-interviews'] })} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function InterviewCard({ interview, onChanged }: { interview: Interview; onChanged: () => void }) {
  const job = typeof interview.job === 'object' ? interview.job : null
  const isLive = interview.status === 'live'
  const isScheduled = interview.status === 'scheduled'
  const isUpcoming = isLive || isScheduled
  const [showReschedule, setShowReschedule] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [scheduledAt, setScheduledAt] = useState(new Date(interview.scheduledAt).toISOString().slice(0, 16))
  const [durationMin, setDurationMin] = useState(Number(interview.durationMin ?? 45))
  const [reason, setReason] = useState('')
  const { data: details, isLoading: detailsLoading } = useQuery<InterviewArtifactsResponse>({
    queryKey: ['interview-artifacts', interview._id],
    queryFn: () => interviewService.getArtifacts(interview._id),
    enabled: showDetails,
  })
  const rescheduleMutation = useMutation({
    mutationFn: () => interviewService.reschedule(interview._id, { scheduledAt: new Date(scheduledAt).toISOString(), durationMin, reason }),
    onSuccess: () => {
      setShowReschedule(false)
      onChanged()
    },
  })

  return (
    <Card className={isLive ? 'border-destructive/40 bg-destructive/5' : ''}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${isLive ? 'bg-destructive/10' : 'bg-primary/10'}`}>
            {isLive ? (
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
            ) : interview.status === 'completed' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <Video className="h-5 w-5 text-primary" />
            )}
          </div>
          <div>
            <p className="font-medium">{job?.title ?? 'Interview'}</p>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(interview.scheduledAt)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {interview.durationMin} min
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={statusVariant[interview.status] ?? 'secondary'} className="capitalize">
            {isLive ? '● LIVE' : interview.status}
          </Badge>
          {isUpcoming && (
            <>
              <Link
                to={`/recruiter/interview/${interview._id}`}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                  isLive ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'
                }`}
              >
                {isLive ? 'Join Now' : 'Enter Room'}
              </Link>
              {isScheduled && (
                <button
                  className="rounded-lg border px-3 py-2 text-xs"
                  onClick={() => setShowReschedule((v) => !v)}
                >
                  Reschedule
                </button>
              )}
            </>
          )}
          {interview.status === 'completed' && interview.score !== undefined && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
              Score: {interview.score}
            </span>
          )}
          <button
            className="rounded-lg border px-3 py-2 text-xs"
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? <span className="inline-flex items-center gap-1"><ChevronUp className="h-3.5 w-3.5" /> Hide Details</span> : <span className="inline-flex items-center gap-1"><ChevronDown className="h-3.5 w-3.5" /> View Details</span>}
          </button>
        </div>
        </div>
        {showReschedule && isScheduled && (
          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
            <input
              type="datetime-local"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
            <input
              type="number"
              min={15}
              max={180}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
            />
            <input
              type="text"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={reason}
              placeholder="Reason (optional)"
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50"
              disabled={rescheduleMutation.isPending}
              onClick={() => rescheduleMutation.mutate()}
            >
              Confirm Reschedule
            </button>
          </div>
        )}
        {showDetails && (
          <div className="space-y-4 rounded-xl border border-primary/15 bg-primary/5 p-4">
            {detailsLoading ? (
              <LoadingSpinner className="py-4" />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-background p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interview summary</p>
                    <p className="mt-2 text-sm">Scheduled: {formatDate(interview.scheduledAt)}</p>
                    <p className="mt-1 text-sm">Duration: {interview.durationMin} min</p>
                    <p className="mt-1 text-sm capitalize">Status: {interview.status}</p>
                    <p className="mt-1 text-sm capitalize">AI analysis: {details?.aiAnalysisStatus ?? interview.aiAnalysisStatus ?? 'idle'}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Artifacts</p>
                    <div className="mt-2 space-y-2 text-sm">
                      {details?.recordingUrl ? (
                        <a className="inline-flex items-center gap-2 text-primary hover:underline" href={details.recordingUrl} target="_blank" rel="noreferrer">
                          <FileVideo className="h-4 w-4" /> View recording
                        </a>
                      ) : (
                        <p className="text-muted-foreground">No recording uploaded yet.</p>
                      )}
                      {details?.artifacts?.filter((artifact) => artifact.downloadUrl && artifact.kind !== 'recording').map((artifact) => (
                        <a key={artifact._id} className="flex items-center gap-2 text-primary hover:underline" href={artifact.downloadUrl ?? '#'} target="_blank" rel="noreferrer">
                          <Download className="h-4 w-4" /> {artifact.kind} download
                        </a>
                      ))}
                    </div>
                  </div>
                </div>

                {!!details?.rubric?.length && (
                  <div className="rounded-lg border bg-background p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rubric scores</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {details.rubric.map((item, index) => (
                        <div key={`${item.criterion}-${index}`} className="rounded-md border bg-muted/20 p-2 text-sm">
                          <p className="font-medium">{item.criterion}</p>
                          <p className="text-muted-foreground">Score: {item.score}/{item.maxScore}</p>
                          {item.notes && <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!!details?.transcript?.length && (
                  <div className="rounded-lg border bg-background p-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transcript</p>
                    </div>
                    <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                      {details.transcript.map((line, index) => (
                        <div key={`${line.timestamp}-${index}`} className="rounded-md bg-muted/20 p-2 text-sm">
                          <p className="font-medium capitalize">{line.speaker}</p>
                          <p className="text-muted-foreground">{line.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {details?.aiAnalysis && (
                  <div className="rounded-lg border bg-background p-3">
                    <div className="flex items-center gap-2">
                      <BrainCircuit className="h-4 w-4 text-primary" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI analysis</p>
                    </div>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(details.aiAnalysis, null, 2)}</pre>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
