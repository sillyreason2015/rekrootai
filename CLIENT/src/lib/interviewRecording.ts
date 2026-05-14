type RecordingState = 'idle' | 'recording' | 'uploading'

interface StartInterviewRecordingArgs {
  localVideoEl: HTMLVideoElement | null
  remoteVideoEl: HTMLVideoElement | null
  remoteAudioEl?: HTMLAudioElement | null
  localAudioTrack?: MediaStreamTrack | null
  onStateChange?: (state: RecordingState) => void
}

interface InterviewRecorderController {
  stop: () => Promise<Blob | null>
}

const CANVAS_WIDTH = 1280
const CANVAS_HEIGHT = 720

function createSilentAudioTrack() {
  const audioContext = new AudioContext()
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  const destination = audioContext.createMediaStreamDestination()
  gainNode.gain.value = 0.0001
  oscillator.connect(gainNode)
  gainNode.connect(destination)
  oscillator.start()
  const [track] = destination.stream.getAudioTracks()
  return {
    track,
    cleanup: async () => {
      oscillator.stop()
      track.stop()
      await audioContext.close().catch(() => {})
    },
  }
}

export function startInterviewRecording(args: StartInterviewRecordingArgs): InterviewRecorderController | null {
  if (typeof MediaRecorder === 'undefined') return null

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const chunks: Blob[] = []
  const cleanupFns: Array<() => void | Promise<void>> = []
  let stopped = false

  const drawFrame = () => {
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const drawVideo = (video: HTMLVideoElement | null, x: number, y: number, width: number, height: number, label: string) => {
      const ready = video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0
      if (ready && video) {
        ctx.drawImage(video, x, y, width, height)
      } else {
        ctx.fillStyle = '#1f2937'
        ctx.fillRect(x, y, width, height)
        ctx.fillStyle = '#9ca3af'
        ctx.font = '24px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`Waiting for ${label}`, x + width / 2, y + height / 2)
      }

      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
      ctx.fillRect(x + 16, y + height - 52, 140, 36)
      ctx.fillStyle = '#ffffff'
      ctx.font = '20px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(label, x + 32, y + height - 28)
    }

    const gap = 24
    const width = (canvas.width - gap * 3) / 2
    const height = canvas.height - gap * 2
    drawVideo(args.remoteVideoEl, gap, gap, width, height, 'Remote')
    drawVideo(args.localVideoEl, gap * 2 + width, gap, width, height, 'You')
  }

  const renderTimer = window.setInterval(drawFrame, 1000 / 15)
  cleanupFns.push(() => window.clearInterval(renderTimer))
  drawFrame()

  const videoStream = canvas.captureStream(15)
  const combinedStream = new MediaStream()
  const mixedAudioContext = new AudioContext()
  const audioDestination = mixedAudioContext.createMediaStreamDestination()
  cleanupFns.push(async () => {
    await mixedAudioContext.close().catch(() => {})
  })

  const addAudioTrack = (track: MediaStreamTrack | null | undefined) => {
    if (!track) return
    const stream = new MediaStream([track])
    const source = mixedAudioContext.createMediaStreamSource(stream)
    source.connect(audioDestination)
  }

  addAudioTrack(args.localAudioTrack)
  if (args.remoteAudioEl) {
    const remoteAudioSource = mixedAudioContext.createMediaElementSource(args.remoteAudioEl)
    remoteAudioSource.connect(audioDestination)
  }

  const [videoTrack] = videoStream.getVideoTracks()
  if (videoTrack) combinedStream.addTrack(videoTrack)

  const audioTracks = audioDestination.stream.getAudioTracks()
  if (audioTracks.length > 0) {
    combinedStream.addTrack(audioTracks[0])
  } else {
    const silent = createSilentAudioTrack()
    combinedStream.addTrack(silent.track)
    cleanupFns.push(silent.cleanup)
  }

  const mimeTypeCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm',
  ]
  const mimeType = mimeTypeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? ''

  let recorder: MediaRecorder
  try {
    recorder = mimeType ? new MediaRecorder(combinedStream, { mimeType }) : new MediaRecorder(combinedStream)
  } catch {
    for (const track of combinedStream.getTracks()) track.stop()
    for (const cleanup of cleanupFns) void cleanup()
    return null
  }
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  recorder.start(1000)
  args.onStateChange?.('recording')

  return {
    stop: async () => {
      if (stopped) return null
      stopped = true
      args.onStateChange?.('uploading')

      const blob = await new Promise<Blob | null>((resolve) => {
        recorder.onstop = () => {
          resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || mimeType }) : null)
        }
        recorder.stop()
      })

      for (const track of combinedStream.getTracks()) track.stop()
      for (const cleanup of cleanupFns) await cleanup()
      args.onStateChange?.('idle')
      return blob
    },
  }
}
