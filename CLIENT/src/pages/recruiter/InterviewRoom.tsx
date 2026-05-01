import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Mic, MicOff, Video, VideoOff, PhoneOff, Save, MessageSquare } from 'lucide-react'
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
import { Button } from '../../components/ui/button'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { cn } from '../../lib/utils'
import api from '../../lib/axios'

const DEFAULT_CRITERIA = ['Communication', 'Technical Knowledge', 'Problem Solving', 'Culture Fit', 'Motivation']

interface RubricEntry { criterion: string; score: number; notes: string }
interface TranscriptLine { speaker: string; text: string; ts: string }

export default function RecruiterInterviewRoom() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [connState, setConnState] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [errorMsg, setErrorMsg] = useState('')
  const [remoteConnected, setRemoteConnected] = useState(false)
  const [rubric, setRubric] = useState<RubricEntry[]>(DEFAULT_CRITERIA.map((c) => ({ criterion: c, score: 0, notes: '' })))
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
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

  const saveMutation = useMutation({ mutationFn: () => interviewService.submitRubric(id!, rubric) })
  const completeMutation = useMutation({
    mutationFn: () => interviewService.complete(id!),
    onSuccess: () => navigate('/recruiter/final-selection'),
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
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SR()
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

  useEffect(() => {
    if (!id) return
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
          addTranscriptLine('System', `${participant.name ?? 'Candidate'} joined`)
        })

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach()
          setRemoteConnected(false)
        })

        room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
          addTranscriptLine('System', `${p.name ?? 'Candidate'} connected`)
        })

        room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
          setRemoteConnected(false)
          addTranscriptLine('System', `${p.name ?? 'Candidate'} left the room`)
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

        // Try cam+mic; fall back to audio-only if camera conflict (same-machine testing)
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
          try {
            const audioTracks = await createLocalTracks({ audio: true, video: false })
            for (const track of audioTracks) {
              await room.localParticipant.publishTrack(track)
              if (track.kind === Track.Kind.Audio) localAudioTrackRef.current = track as LocalAudioTrack
            }
            setCamOn(false)
            addTranscriptLine('System', 'Camera unavailable — audio only.')
          } catch {
            addTranscriptLine('System', 'Could not access microphone or camera.')
          }
        }

        setConnState('connected')
        startSpeechRecognition()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to connect'
        console.error('[RecruiterInterviewRoom] connect error:', err)
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
  }, [id])

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
    navigate('/recruiter/final-selection')
  }

  if (isLoading) return <LoadingSpinner />
  if (!interview) return <p>Interview not found.</p>

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const totalScore = rubric.reduce((sum, r) => sum + r.score, 0)
  const maxScore = rubric.length * 5

  return (
    <div className="flex h-screen flex-col gap-3 overflow-hidden bg-gray-950 p-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-serif text-lg font-semibold text-white">
            {typeof interview.job === 'object' ? interview.job.title : 'Interview'}
          </h1>
          <p className="text-xs text-white/50">Live Interview</p>
        </div>
        <div className="flex items-center gap-3">
          {connState === 'connecting' && <span className="text-xs text-white/50 animate-pulse">Connecting…</span>}
          {connState === 'error' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400 max-w-xs truncate">{errorMsg}</span>
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

      {/* Body */}
      <div className="flex flex-1 gap-3 overflow-hidden min-h-0">
        {/* Left: videos + controls */}
        <div className="flex flex-1 flex-col gap-3 min-w-0">
          {/* Side-by-side videos */}
          <div className="flex flex-1 gap-3 min-h-0">
            {/* Candidate (remote) */}
            <div className="relative flex-1 overflow-hidden rounded-2xl bg-gray-900">
              <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
              {!remoteConnected && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/20">
                  <Video className="h-12 w-12" />
                  <p className="text-xs">Waiting for candidate…</p>
                </div>
              )}
              <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                Candidate
              </div>
            </div>

            {/* You (local) */}
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
          <div className="flex items-center justify-center gap-3 shrink-0">
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
            <Button variant="outline" size="sm" className="text-white border-white/20 hover:bg-white/10" onClick={() => saveMutation.mutate()}>
              <Save className="h-4 w-4 mr-1" /> Save Rubric
            </Button>
            <button
              onClick={hangUp}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Right: rubric + transcript */}
        <div className="flex w-80 shrink-0 flex-col gap-3 overflow-hidden">
          {/* Rubric */}
          <Card className="flex flex-col overflow-hidden" style={{ maxHeight: '55%' }}>
            <CardHeader className="py-3 shrink-0">
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
              <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => completeMutation.mutate()}>
                End Interview &amp; Score
              </Button>
            </CardContent>
          </Card>

          {/* Transcript */}
          <Card className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b px-4 py-3 shrink-0">
              <MessageSquare className="h-4 w-4" />
              <span className="text-sm font-medium">Live Transcript</span>
              <span className="ml-auto text-[10px] text-emerald-600 flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> AI
              </span>
            </div>
            <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin">
              {transcript.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground">Transcript will appear here as you speak…</p>
              ) : transcript.map((line, i) => (
                <div key={i} className={cn('text-sm', line.speaker === 'You' ? 'text-right' : '')}>
                  <span className={cn('font-medium text-xs', line.speaker === 'System' ? 'text-muted-foreground italic' : 'text-primary')}>{line.speaker}</span>
                  <p className="text-muted-foreground">{line.text}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
