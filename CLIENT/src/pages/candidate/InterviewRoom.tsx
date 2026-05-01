import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare } from 'lucide-react'
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  createLocalTracks,
  type LocalVideoTrack,
  type LocalAudioTrack,
  type RemoteTrack,
  type RemoteParticipant,
} from 'livekit-client'
import { interviewService } from '../../services/interview.service'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { Card } from '../../components/ui/card'
import { cn } from '../../lib/utils'
import api from '../../lib/axios'

interface TranscriptLine {
  speaker: string
  text: string
  ts: string
}

export default function CandidateInterviewRoom() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [connState, setConnState] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [errorMsg, setErrorMsg] = useState('')
  const transcriptRef = useRef<HTMLDivElement>(null)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)

  const roomRef = useRef<Room | null>(null)
  const localVideoTrackRef = useRef<LocalVideoTrack | null>(null)
  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

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

  // Auto-scroll transcript
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [transcript])

  const addTranscriptLine = useCallback((speaker: string, text: string) => {
    if (!text.trim()) return
    setTranscript((prev) => [...prev, { speaker, text, ts: new Date().toISOString() }])
  }, [])

  // Start Web Speech API for self transcription
  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          addTranscriptLine('You', event.results[i][0].transcript)
        }
      }
    }

    recognition.onerror = () => {
      // Silently restart on error
      setTimeout(() => recognition.start(), 1000)
    }

    recognition.onend = () => {
      if (micOn) recognition.start()
    }

    recognition.start()
    recognitionRef.current = recognition
  }, [addTranscriptLine, micOn])

  // Connect to LiveKit room
  useEffect(() => {
    if (!id) return

    let room: Room

    const connect = async () => {
      try {
        const { data } = await api.get(`/interviews/${id}/token`)
        const { token, wsUrl } = data as { token: string; wsUrl: string }

        if (!wsUrl) throw new Error('LiveKit host not configured on server')

        room = new Room({
          adaptiveStream: true,
          dynacast: true,
          videoCaptureDefaults: { resolution: { width: 1280, height: 720, frameRate: 30 } },
        })
        roomRef.current = room

        // Handle remote tracks
        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: any, participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
            track.attach(remoteVideoRef.current)
          }
          // Remote audio transcription hint via participant name
          if (track.kind === Track.Kind.Audio) {
            // We could attach audio here but browser plays remote audio automatically
            track.attach()
          }
          // Add "joined" transcript note
          addTranscriptLine('System', `${participant.name ?? 'Recruiter'} joined the room`)
        })

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach()
        })

        room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          if (state === ConnectionState.Connected) setConnState('connected')
          if (state === ConnectionState.Disconnected) {
            setConnState('error')
            setErrorMsg('Connection dropped. You can stay here and reconnect.')
          }
        })

        room.on(RoomEvent.Disconnected, () => {
          setConnState('error')
          setErrorMsg('Disconnected from room.')
        })

        await room.connect(wsUrl, token)

        // Publish local tracks
        const tracks = await createLocalTracks({ audio: true, video: true })
        for (const track of tracks) {
          await room.localParticipant.publishTrack(track)
          if (track.kind === Track.Kind.Video) {
            localVideoTrackRef.current = track as LocalVideoTrack
            if (localVideoRef.current) (track as LocalVideoTrack).attach(localVideoRef.current)
          }
          if (track.kind === Track.Kind.Audio) {
            localAudioTrackRef.current = track as LocalAudioTrack
          }
        }

        setConnState('connected')
        startSpeechRecognition()
      } catch (err: any) {
        console.error('[InterviewRoom] connect error:', err)
        setErrorMsg(err?.message ?? 'Failed to connect to interview room')
        setConnState('error')
      }
    }

    connect()

    return () => {
      recognitionRef.current?.stop()
      room?.disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const toggleMic = () => {
    const track = localAudioTrackRef.current
    if (!track) return
    if (micOn) {
      track.mute()
      recognitionRef.current?.stop()
    } else {
      track.unmute()
      startSpeechRecognition()
    }
    setMicOn((v) => !v)
  }

  const toggleCam = () => {
    const track = localVideoTrackRef.current
    if (!track) return
    if (camOn) track.mute(); else track.unmute()
    setCamOn((v) => !v)
  }

  const hangUp = () => {
    recognitionRef.current?.stop()
    roomRef.current?.disconnect()
    navigate(-1)
  }

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
        <div className="flex items-center gap-3">
          {connState === 'connecting' && (
            <span className="text-xs text-muted-foreground animate-pulse">Connecting…</span>
          )}
          {connState === 'error' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-destructive">{errorMsg}</span>
              <button
                className="rounded border border-destructive/30 px-2 py-0.5 text-[11px] text-destructive hover:bg-destructive/10"
                onClick={() => window.location.reload()}
              >
                Reconnect
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1.5 text-sm font-semibold text-destructive">
            <span className={cn('h-2 w-2 rounded-full bg-destructive', connState === 'connected' && 'animate-pulse')} />
            LIVE · {fmt(elapsed)}
          </div>
        </div>
      </div>

      <div className="flex flex-1 gap-3 overflow-hidden">
        {/* Video area */}
        <div className="flex flex-1 flex-col gap-3">
          {/* Remote video (Recruiter) */}
          <div className="relative flex-1 overflow-hidden rounded-2xl bg-gray-900">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />
            {connState !== 'connected' && (
              <div className="absolute inset-0 flex items-center justify-center text-white/30">
                <Video className="h-16 w-16" />
              </div>
            )}
            <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
              Recruiter
            </div>
          </div>

          {/* Self video */}
          <div className="relative h-32 overflow-hidden rounded-xl bg-gray-800">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={cn('h-full w-full object-cover', !camOn && 'hidden')}
            />
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center text-white/30">
                <VideoOff className="h-8 w-8" />
              </div>
            )}
            <div className="absolute bottom-2 left-2 text-xs text-white/70">You</div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={toggleMic}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                micOn ? 'bg-muted hover:bg-muted/80' : 'bg-destructive text-white',
              )}
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>
            <button
              onClick={toggleCam}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                camOn ? 'bg-muted hover:bg-muted/80' : 'bg-destructive text-white',
              )}
            >
              {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>
            <button
              onClick={hangUp}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive text-white hover:bg-destructive/90"
            >
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
                  <span className={cn('text-xs font-medium', line.speaker === 'System' ? 'text-muted-foreground italic' : 'text-primary')}>
                    {line.speaker}
                  </span>
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
