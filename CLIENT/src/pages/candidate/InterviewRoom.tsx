import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare, ShieldAlert, X } from 'lucide-react'
import ProctoringModal from '../../components/shared/ProctoringModal'
import { useProctoringMonitor } from '../../hooks/useProctoringMonitor'
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
  const [remoteConnected, setRemoteConnected] = useState(false)
  const [proctoringAccepted, setProctoringAccepted] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)

  const roomRef = useRef<Room | null>(null)
  const localVideoTrackRef = useRef<LocalVideoTrack | null>(null)
  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const { data: interview, isLoading, error } = useQuery({
    queryKey: ['interview', id],
    queryFn: () => interviewService.get(id!),
    enabled: !!id,
  })

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [transcript])

  const addTranscriptLine = useCallback((speaker: string, text: string) => {
    if (!text.trim()) return
    setTranscript((prev) => [...prev, { speaker, text, ts: new Date().toISOString() }])
  }, [])

  const startSpeechRecognition = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) addTranscriptLine('You', event.results[i][0].transcript)
      }
    }
    recognition.onerror = () => { try { setTimeout(() => recognition.start(), 1000) } catch { /* ignore */ } }
    recognition.onend = () => { if (micOn) { try { recognition.start() } catch { /* ignore */ } } }
    try { recognition.start() } catch { /* ignore */ }
    recognitionRef.current = recognition
  }, [addTranscriptLine, micOn])

  // Proctoring monitor — active once inside the room
  const { violations, lastViolationReason, showWarning, dismissWarning } = useProctoringMonitor({
    enabled: proctoringAccepted && connState === 'connected',
  })

  useEffect(() => {
    if (!id || !proctoringAccepted) return
    let room: Room

    const connect = async () => {
      try {
        const { data } = await api.get(`/interviews/${id}/token`)
        const { token, wsUrl } = data as { token: string; wsUrl: string }
        if (!wsUrl) throw new Error('LiveKit host not configured on server')

        room = new Room({ adaptiveStream: true, dynacast: true })
        roomRef.current = room

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: unknown, participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
            track.attach(remoteVideoRef.current)
            setRemoteConnected(true)
          }
          if (track.kind === Track.Kind.Audio) track.attach()
          addTranscriptLine('System', `${participant.name ?? 'Recruiter'} joined`)
        })

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach()
          setRemoteConnected(false)
        })

        room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
          addTranscriptLine('System', `${p.name ?? 'Recruiter'} connected`)
        })

        room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
          setRemoteConnected(false)
          addTranscriptLine('System', `${p.name ?? 'Recruiter'} left the room`)
        })

        room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          if (state === ConnectionState.Connected) setConnState('connected')
          if (state === ConnectionState.Disconnected) {
            setConnState('error')
            setErrorMsg('Disconnected from room.')
          }
        })

        room.on(RoomEvent.Disconnected, () => {
          setConnState('error')
          setErrorMsg('Disconnected from room.')
        })

        await room.connect(wsUrl, token)

        // Try camera first; fall back to audio-only if camera unavailable (e.g. same-machine testing)
        try {
          const tracks = await createLocalTracks({ audio: true, video: true })
          for (const track of tracks) {
            await room.localParticipant.publishTrack(track)
            if (track.kind === Track.Kind.Video) {
              localVideoTrackRef.current = track as LocalVideoTrack
              if (localVideoRef.current) (track as LocalVideoTrack).attach(localVideoRef.current)
            }
            if (track.kind === Track.Kind.Audio) localAudioTrackRef.current = track as LocalAudioTrack
          }
        } catch {
          // Camera already in use by another tab — try audio only
          try {
            const audioTracks = await createLocalTracks({ audio: true, video: false })
            for (const track of audioTracks) {
              await room.localParticipant.publishTrack(track)
              if (track.kind === Track.Kind.Audio) localAudioTrackRef.current = track as LocalAudioTrack
            }
            setCamOn(false)
            addTranscriptLine('System', 'Camera unavailable (may be in use by another window). Audio only.')
          } catch {
            addTranscriptLine('System', 'Could not access microphone or camera.')
          }
        }

        setConnState('connected')
        startSpeechRecognition()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to connect to interview room'
        console.error('[InterviewRoom] connect error:', err)
        setErrorMsg(msg)
        setConnState('error')
      }
    }

    connect()
    return () => {
      recognitionRef.current?.stop()
      room?.disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, proctoringAccepted])

  const toggleMic = () => {
    const track = localAudioTrackRef.current
    if (!track) return
    if (micOn) { track.mute(); recognitionRef.current?.stop() }
    else { track.unmute(); startSpeechRecognition() }
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
  if (!interview) {
    const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
    return (
      <div className="mx-auto mt-24 max-w-xl rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800">
        {msg ?? 'Interview was not found or is no longer available.'}
      </div>
    )
  }

  // Show proctoring consent before entering
  if (!proctoringAccepted) {
    return <ProctoringModal type="interview" onAccept={() => setProctoringAccepted(true)} />
  }

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="flex h-screen flex-col gap-3 overflow-hidden bg-gray-950 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-lg font-semibold text-white">Live Interview</h1>
          <p className="text-xs text-white/50">
            {typeof interview.job === 'object' ? interview.job.title : 'Interview'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {connState === 'connecting' && (
            <span className="text-xs text-white/50 animate-pulse">Connecting…</span>
          )}
          {connState === 'error' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400 max-w-xs truncate">{errorMsg}</span>
              <button
                className="rounded border border-blue-400/40 px-2 py-0.5 text-[11px] text-blue-300 hover:bg-blue-400/10"
                onClick={() => {
                  const track = localVideoTrackRef.current
                  if (track) track.mute()
                  setCamOn(false)
                  setErrorMsg('Switched to audio-only mode. Reconnect to continue.')
                }}
              >
                Audio-only
              </button>
              <button
                className="rounded border border-red-400/40 px-2 py-0.5 text-[11px] text-red-400 hover:bg-red-400/10"
                onClick={() => window.location.reload()}
              >
                Reconnect
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-full bg-red-500/20 px-3 py-1.5 text-sm font-semibold text-red-400">
            <span className={cn('h-2 w-2 rounded-full bg-red-500', connState === 'connected' && 'animate-pulse')} />
            LIVE · {fmt(elapsed)}
          </div>
        </div>
      </div>

      {/* Proctoring violation banner */}
      {showWarning && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/20 px-4 py-2.5 text-sm text-red-300 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span><strong>Proctoring violation ({violations}):</strong> {lastViolationReason}. This has been logged.</span>
          </div>
          <button onClick={dismissWarning} className="shrink-0 rounded p-0.5 hover:bg-red-500/20">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main: side-by-side videos + transcript */}
      <div className="flex flex-1 gap-3 overflow-hidden min-h-0">
        {/* Left: side-by-side video panels */}
        <div className="flex flex-1 flex-col gap-3 min-w-0">
          {/* Video row — side by side */}
          <div className="flex flex-1 gap-3 min-h-0">
            {/* Recruiter (remote) */}
            <div className="relative flex-1 overflow-hidden rounded-2xl bg-gray-900">
              <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
              {!remoteConnected && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/20">
                  <Video className="h-12 w-12" />
                  <p className="text-xs">Waiting for recruiter…</p>
                </div>
              )}
              <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                Recruiter
              </div>
            </div>

            {/* Self (local) */}
            <div className="relative flex-1 overflow-hidden rounded-2xl bg-gray-800">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={cn('h-full w-full object-cover', !camOn && 'hidden')}
              />
              {!camOn && (
                <div className="absolute inset-0 flex items-center justify-center text-white/20">
                  <VideoOff className="h-12 w-12" />
                </div>
              )}
              <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                You
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={toggleMic}
              className={cn('flex h-12 w-12 items-center justify-center rounded-full transition-colors', micOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500 text-white')}
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>
            <button
              onClick={toggleCam}
              className={cn('flex h-12 w-12 items-center justify-center rounded-full transition-colors', camOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500 text-white')}
            >
              {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>
            <button
              onClick={hangUp}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Transcript panel */}
        <Card className="flex w-72 shrink-0 flex-col overflow-hidden bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <MessageSquare className="h-4 w-4" />
            <span className="text-sm font-medium">Live Transcript</span>
            <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> AI
            </span>
          </div>
          <div ref={transcriptRef} className="flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin">
            {transcript.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground pt-4">Transcript will appear here as you speak…</p>
            ) : transcript.map((line, i) => (
              <div key={i} className={cn('text-sm', line.speaker === 'You' ? 'text-right' : '')}>
                <span className={cn('text-xs font-medium', line.speaker === 'System' ? 'text-muted-foreground italic' : 'text-primary')}>
                  {line.speaker}
                </span>
                <p className="mt-0.5 text-muted-foreground">{line.text}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
