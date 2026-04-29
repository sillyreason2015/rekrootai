import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare, Clock } from 'lucide-react'
import { interviewService } from '../../services/interview.service'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { Card, CardContent } from '../../components/ui/card'
import { cn } from '../../lib/utils'

interface TranscriptLine {
  speaker: string
  text: string
  ts: string
}

export default function CandidateInterviewRoom() {
  const { id } = useParams<{ id: string }>()
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const transcriptRef = useRef<HTMLDivElement>(null)

  const { data: interview, isLoading } = useQuery({
    queryKey: ['interview', id],
    queryFn: () => interviewService.get(id!),
    enabled: !!id,
  })

  // Timer
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Mock transcript stream
  useEffect(() => {
    const mock = [
      { speaker: 'Recruiter', text: 'Tell me about yourself and your background.', ts: new Date().toISOString() },
    ]
    const t = setTimeout(() => setTranscript(mock), 3000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [transcript])

  if (isLoading) return <LoadingSpinner />
  if (!interview) return <p>Interview not found.</p>

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col gap-3 overflow-hidden p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-lg font-semibold">Live Interview</h1>
          <p className="text-xs text-muted-foreground">
            {typeof interview.job === 'object' ? interview.job.title : 'Interview'}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1.5 text-sm font-semibold text-destructive">
          <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
          LIVE · {fmt(elapsed)}
        </div>
      </div>

      <div className="flex flex-1 gap-3 overflow-hidden">
        {/* Video area */}
        <div className="flex flex-1 flex-col gap-3">
          {/* Main video */}
          <div className="relative flex-1 overflow-hidden rounded-2xl bg-gray-900">
            <div className="absolute inset-0 flex items-center justify-center text-white/30">
              <Video className="h-16 w-16" />
            </div>
            <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
              Recruiter
            </div>
          </div>
          {/* Self video */}
          <div className="relative h-32 overflow-hidden rounded-xl bg-gray-800">
            <div className="absolute inset-0 flex items-center justify-center text-white/30">
              {camOn ? <Video className="h-8 w-8" /> : <VideoOff className="h-8 w-8" />}
            </div>
            <div className="absolute bottom-2 left-2 text-xs text-white/70">You</div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setMicOn((v) => !v)}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                micOn ? 'bg-muted hover:bg-muted/80' : 'bg-destructive text-white',
              )}
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>
            <button
              onClick={() => setCamOn((v) => !v)}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                camOn ? 'bg-muted hover:bg-muted/80' : 'bg-destructive text-white',
              )}
            >
              {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>
            <button className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive text-white hover:bg-destructive/90">
              <PhoneOff className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Transcript panel */}
        <Card className="flex w-72 shrink-0 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <MessageSquare className="h-4 w-4" />
            <span className="text-sm font-medium">Live Transcript</span>
            <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> AI
            </span>
          </div>
          <div
            ref={transcriptRef}
            className="flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin"
          >
            {transcript.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground pt-4">
                Transcript will appear here as you speak…
              </p>
            ) : (
              transcript.map((line, i) => (
                <div key={i} className={cn('text-sm', line.speaker === 'You' ? 'text-right' : '')}>
                  <span className="text-xs font-medium text-primary">{line.speaker}</span>
                  <p className="mt-0.5 text-muted-foreground">{line.text}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
