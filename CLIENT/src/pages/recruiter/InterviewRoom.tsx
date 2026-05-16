import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Mic, MicOff, Video, VideoOff, PhoneOff, Save, MessageSquare, FileText, X } from 'lucide-react'
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
import { startInterviewRecording } from '../../lib/interviewRecording'

const DEFAULT_CRITERIA = ['Communication', 'Technical Knowledge', 'Problem Solving', 'Culture Fit', 'Motivation']

interface RubricEntry { criterion: string; score: number; notes: string }
interface TranscriptLine { speaker: string; text: string; ts: string }
interface LiveSuggestion {
  title: string
  detail: string
}

function mapTranscriptSpeaker(speaker: string) {
  if (speaker === 'recruiter') return 'You'
  if (speaker === 'candidate') return 'Candidate'
  return speaker
}

function buildLiveSuggestions(transcript: TranscriptLine[], collaborationMode: 'veto' | 'assist' | 'override'): LiveSuggestion[] {
  if (collaborationMode === 'override') return []
  const candidateLines = transcript.filter((line) => line.speaker === 'Candidate').map((line) => line.text.trim()).filter(Boolean)
  if (!candidateLines.length) {
    return [{ title: 'Waiting for signal', detail: 'Suggestions will appear after the candidate gives a few substantive answers.' }]
  }

  const lastAnswer = candidateLines[candidateLines.length - 1] ?? ''
  const combined = candidateLines.join(' ').toLowerCase()
  const suggestions: LiveSuggestion[] = []

  if (lastAnswer.length < 60) {
    suggestions.push({ title: 'Probe deeper', detail: 'The latest answer is brief. Ask for a concrete example, metrics, or the candidate’s exact contribution.' })
  }
  if (!/\b(i|my|me)\b/i.test(lastAnswer)) {
    suggestions.push({ title: 'Clarify ownership', detail: 'The response sounds team-level. Ask what the candidate personally owned and delivered.' })
  }
  if (!/\b(result|impact|improve|reduced|increased|saved|delivered|launched|metric)\b/i.test(combined)) {
    suggestions.push({ title: 'Ask for outcomes', detail: 'There are few measurable outcomes so far. Ask what changed because of their work.' })
  }
  if (!/\b(challenge|problem|issue|conflict|bug|risk|constraint|deadline)\b/i.test(combined)) {
    suggestions.push({ title: 'Test problem solving', detail: 'Ask about a difficult constraint, tradeoff, or failure and how they handled it.' })
  }

  return suggestions.slice(0, 3)
}

export default function RecruiterInterviewRoom() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [connState, setConnState] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [errorMsg, setErrorMsg] = useState('')
  const [remoteConnected, setRemoteConnected] = useState(false)
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'uploading'>('idle')
  const [recordingError, setRecordingError] = useState('')
  const [showCv, setShowCv] = useState(false)
  const [rubric, setRubric] = useState<RubricEntry[]>(DEFAULT_CRITERIA.map((c) => ({ criterion: c, score: 0, notes: '' })))
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const transcriptRef = useRef<HTMLDivElement>(null)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const roomRef = useRef<Room | null>(null)
  const localVideoTrackRef = useRef<LocalVideoTrack | null>(null)
  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const recordingControllerRef = useRef<{ stop: () => Promise<Blob | null> } | null>(null)

  const { data: interview, isLoading } = useQuery({
    queryKey: ['interview', id],
    queryFn: () => interviewService.get(id!),
    enabled: !!id,
  })
  const collaborationMode = (searchParams.get('mode') ?? interview?.collaborationMode ?? 'assist') as 'veto' | 'assist' | 'override'
  const proctoringCount = interview?.proctoringEvents?.length ?? 0
  const liveSuggestions = buildLiveSuggestions(transcript, collaborationMode)

  useEffect(() => {
    if (Array.isArray(interview?.rubric) && interview.rubric.length > 0) {
      setRubric(interview.rubric.map((item) => ({
        criterion: item.criterion,
        score: item.score,
        notes: item.notes ?? '',
      })))
    }
  }, [interview?.rubric])

  useEffect(() => {
    if (!Array.isArray(interview?.transcript) || interview.transcript.length === 0) return
    setTranscript((prev) => {
      if (prev.length > 0) return prev
      return interview.transcript!.map((line) => ({
        speaker: mapTranscriptSpeaker(line.speaker),
        text: line.text,
        ts: line.timestamp,
      }))
    })
  }, [interview?.transcript])

  const saveMutation = useMutation({ mutationFn: () => interviewService.submitRubric(id!, rubric) })
  const completeMutation = useMutation({
    mutationFn: () => {
      const total = rubric.reduce((sum, r) => sum + r.score, 0)
      const max = rubric.length * 5
      const score = max > 0 ? Math.round((total / max) * 100) : 0
      return interviewService.complete(id!, score, collaborationMode)
    },
    onSuccess: () => navigate('/recruiter/final-selection'),
  })

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [transcript])

  useEffect(() => {
    if (!id || transcript.length === 0) return
    const timer = window.setTimeout(() => {
      const payload = transcript
        .filter((line) => line.speaker === 'You')
        .map((line) => ({ speaker: 'recruiter', text: line.text, timestamp: line.ts }))
      if (payload.length) void api.post(`/interviews/${id}/transcript`, { transcript: payload })
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [id, transcript])

  const addTranscriptLine = useCallback((speaker: string, text: string) => {
    if (!text.trim()) return
    setTranscript((prev) => [...prev, { speaker, text, ts: new Date().toISOString() }])
  }, [])

  const stopAndUploadRecording = useCallback(async () => {
    const controller = recordingControllerRef.current
    recordingControllerRef.current = null
    if (!controller || !id) return

    const blob = await controller.stop()
    if (!blob || blob.size === 0) return

    try {
      await interviewService.uploadRecording(id, blob, `recruiter-interview-${id}.webm`)
      setRecordingError('')
    } catch {
      setRecordingError('Recording upload failed. The interview ended, but the recording could not be saved.')
    }
  }, [id])

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

  const reacquireVideoTrack = useCallback(async () => {
    const room = roomRef.current
    if (!room) return false
    try {
      const [videoTrack] = await createLocalTracks({ video: true, audio: false })
      const previous = localVideoTrackRef.current
      if (previous) {
        await room.localParticipant.unpublishTrack(previous).catch(() => {})
        previous.detach()
        previous.stop()
      }
      await room.localParticipant.publishTrack(videoTrack)
      localVideoTrackRef.current = videoTrack as LocalVideoTrack
      if (localVideoRef.current) (videoTrack as LocalVideoTrack).attach(localVideoRef.current)
      setCamOn(true)
      setErrorMsg('')
      return true
    } catch {
      setErrorMsg('Camera could not be restarted on this device. You can continue in audio-only mode.')
      return false
    }
  }, [])

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
          if (track.kind === Track.Kind.Audio) {
            if (remoteAudioRef.current) track.attach(remoteAudioRef.current)
            else track.attach()
          }
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

        recordingControllerRef.current = startInterviewRecording({
          localVideoEl: localVideoRef.current,
          remoteVideoEl: remoteVideoRef.current,
          remoteAudioEl: remoteAudioRef.current,
          localAudioTrack: localAudioTrackRef.current?.mediaStreamTrack,
          onStateChange: setRecordingState,
        })
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
      void stopAndUploadRecording()
      room?.disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, stopAndUploadRecording])

  const toggleMic = () => {
    const track = localAudioTrackRef.current
    if (!track) return
    if (micOn) { track.mute(); recognitionRef.current?.stop() }
    else { track.unmute(); startSpeechRecognition() }
    setMicOn((v) => !v)
  }

  const toggleCam = () => {
    const track = localVideoTrackRef.current
    if (!track) {
      void reacquireVideoTrack()
      return
    }
    if (camOn) {
      track.mute()
      setCamOn(false)
      if (id) void interviewService.reportProctoringEvent(id, { type: 'camera_off', reason: 'Recruiter turned camera off during interview' })
      return
    }
    if (track.mediaStreamTrack.readyState === 'ended') {
      void reacquireVideoTrack()
      return
    }
    track.unmute()
    setCamOn(true)
  }

  const hangUp = () => {
    recognitionRef.current?.stop()
    void stopAndUploadRecording()
    roomRef.current?.disconnect()
    navigate('/recruiter/final-selection')
  }

  if (isLoading) return <LoadingSpinner />
  if (!interview) return <p>Interview not found.</p>

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const totalScore = rubric.reduce((sum, r) => sum + r.score, 0)
  const maxScore = rubric.length * 5
  const candidate = typeof interview?.candidate === 'object' && interview.candidate !== null ? interview.candidate as { cvUrl?: string; headline?: string } : null
  const cvUrl = candidate?.cvUrl

  return (
    <div className="flex min-h-screen flex-col gap-3 overflow-hidden bg-gray-950 p-3 sm:p-4">
      <audio ref={remoteAudioRef} autoPlay className="hidden" />
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 gap-3">
        <div>
          <h1 className="font-serif text-lg font-semibold text-white">
            {typeof interview.job === 'object' ? interview.job.title : 'Interview'}
          </h1>
          <p className="text-xs text-white/50">Live Interview</p>
          {recordingState !== 'idle' && <p className="text-[11px] text-emerald-300">Recording: {recordingState}</p>}
          {recordingError && <p className="text-[11px] text-amber-300">{recordingError}</p>}
        </div>
        <div className="flex items-center gap-3">
          {proctoringCount > 0 && <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-300">{proctoringCount} proctoring alert{proctoringCount === 1 ? '' : 's'}</span>}
          {connState === 'connecting' && <span className="text-xs text-white/50 animate-pulse">Connecting…</span>}
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

      {/* Body */}
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden xl:flex-row">
        {/* Left: videos + controls */}
        <div className="flex flex-1 flex-col gap-3 min-w-0">
          {/* Side-by-side videos */}
          <div className="grid flex-1 min-h-0 grid-cols-1 gap-3 md:grid-cols-2">
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
            <button
              onClick={() => setShowCv((v) => !v)}
              className={cn('flex h-12 w-12 items-center justify-center rounded-full transition-colors', showCv ? 'bg-primary text-white' : 'bg-white/10 hover:bg-white/20 text-white')}
              title="View CV"
            >
              <FileText className="h-5 w-5" />
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
        <div className="flex w-full shrink-0 flex-col gap-3 overflow-hidden xl:w-80">
          {!!interview.proctoringEvents?.length && (
            <Card className="overflow-hidden">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Proctoring Alerts</CardTitle>
              </CardHeader>
              <CardContent className="max-h-40 space-y-2 overflow-y-auto text-xs scrollbar-thin">
                {interview.proctoringEvents
                  .slice()
                  .reverse()
                  .map((event, index) => (
                    <div key={`${event.at}-${index}`} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                      <p className="font-medium">{event.actor}: {event.reason}</p>
                      <p className="mt-0.5 text-[11px] text-amber-700">{new Date(event.at).toLocaleString()} · {event.type.replace(/_/g, ' ')}</p>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

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
          {liveSuggestions.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Live AI Suggestions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {liveSuggestions.map((item) => (
                  <div key={item.title} className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-0.5 text-[11px] text-blue-800">{item.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* CV slide-over panel */}
      {showCv && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Candidate CV</span>
            </div>
            <button onClick={() => setShowCv(false)} className="rounded p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {cvUrl ? (
              <iframe src={cvUrl} className="h-full w-full" title="Candidate CV" />
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground p-8">
                <div>
                  <FileText className="mx-auto mb-3 h-10 w-10 opacity-30" />
                  <p>No CV file uploaded by this candidate.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
