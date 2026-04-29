import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Mic, MicOff, Video, VideoOff, PhoneOff, Save, Plus, MessageSquare } from 'lucide-react'
import { interviewService } from '../../services/interview.service'
import { Button } from '../../components/ui/button'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { cn } from '../../lib/utils'
import type { Interview } from '../../types'

const DEFAULT_CRITERIA = [
  'Communication',
  'Technical Knowledge',
  'Problem Solving',
  'Culture Fit',
  'Motivation',
]

interface RubricEntry {
  criterion: string
  score: number
  notes: string
}

export default function RecruiterInterviewRoom() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [rubric, setRubric] = useState<RubricEntry[]>(
    DEFAULT_CRITERIA.map((c) => ({ criterion: c, score: 0, notes: '' })),
  )
  const [transcript, setTranscript] = useState<Array<{ speaker: string; text: string }>>([])
  const transcriptRef = useRef<HTMLDivElement>(null)

  const { data: interview, isLoading } = useQuery({
    queryKey: ['interview', id],
    queryFn: () => interviewService.get(id!),
    enabled: !!id,
  })

  const saveMutation = useMutation({
    mutationFn: () => interviewService.submitRubric(id!, rubric),
  })

  const completeMutation = useMutation({
    mutationFn: () => interviewService.complete(id!),
    onSuccess: () => navigate('/recruiter/shortlist'),
  })

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [transcript])

  if (isLoading) return <LoadingSpinner />
  if (!interview) return <p>Interview not found.</p>

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const totalScore = rubric.reduce((sum, r) => sum + r.score, 0)
  const maxScore = rubric.length * 5

  return (
    <div className="flex h-[calc(100vh-56px)] gap-3 overflow-hidden p-4">
      {/* Left — video + controls */}
      <div className="flex flex-1 flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-lg font-semibold">
            Interview — {typeof interview.job === 'object' ? interview.job.title : 'Interview'}
          </h1>
          <div className="flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1.5 text-sm font-semibold text-destructive">
            <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
            LIVE · {fmt(elapsed)}
          </div>
        </div>

        {/* Main video */}
        <div className="relative flex-1 overflow-hidden rounded-2xl bg-gray-900">
          <div className="absolute inset-0 flex items-center justify-center text-white/20">
            <Video className="h-20 w-20" />
          </div>
          <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
            Candidate
          </div>
          <div className="absolute right-3 top-3 h-28 w-44 overflow-hidden rounded-lg bg-gray-800">
            <div className="absolute inset-0 flex items-center justify-center text-white/30">
              <Video className="h-6 w-6" />
            </div>
            <div className="absolute bottom-1 right-1 text-[10px] text-white/70">You</div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setMicOn((v) => !v)}
            className={cn('flex h-12 w-12 items-center justify-center rounded-full transition-colors', micOn ? 'bg-muted' : 'bg-destructive text-white')}
          >
            {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>
          <button
            onClick={() => setCamOn((v) => !v)}
            className={cn('flex h-12 w-12 items-center justify-center rounded-full transition-colors', camOn ? 'bg-muted' : 'bg-destructive text-white')}
          >
            {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>
          <Button variant="outline" size="sm" onClick={() => saveMutation.mutate()}>
            <Save className="h-4 w-4" /> Save Rubric
          </Button>
          <button
            onClick={() => completeMutation.mutate()}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive text-white"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Right — rubric + transcript */}
      <div className="flex w-80 shrink-0 flex-col gap-3 overflow-hidden">
        {/* Rubric */}
        <Card className="flex flex-col overflow-hidden" style={{ maxHeight: '55%' }}>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Evaluation Rubric</CardTitle>
              <span className="text-xs font-semibold text-primary">{totalScore}/{maxScore}</span>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-3 scrollbar-thin">
            {rubric.map((item, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{item.criterion}</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        onClick={() => setRubric((prev) => prev.map((r, ri) => ri === i ? { ...r, score: s } : r))}
                        className={cn('h-6 w-6 rounded-full text-xs font-bold transition-colors', item.score >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                  placeholder="Notes..."
                  value={item.notes}
                  onChange={(e) => setRubric((prev) => prev.map((r, ri) => ri === i ? { ...r, notes: e.target.value } : r))}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Transcript */}
        <Card className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <MessageSquare className="h-4 w-4" />
            <span className="text-sm font-medium">Transcript</span>
            <span className="ml-auto text-[10px] text-emerald-600 flex items-center gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live AI
            </span>
          </div>
          <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin">
            {transcript.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground">Transcript will appear here...</p>
            ) : transcript.map((line, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium text-primary text-xs">{line.speaker}</span>
                <p className="text-muted-foreground">{line.text}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
