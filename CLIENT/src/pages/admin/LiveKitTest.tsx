import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Video, Key, FileText, CheckCircle2, XCircle, Loader2, RefreshCw, Wifi } from 'lucide-react'
import api from '../../lib/axios'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'

interface TokenResult {
  token: string
  roomName: string
  wsUrl: string | null
}

interface ArtifactResult {
  transcriptUrl: string
  recordingUrl: string
}

interface Interview {
  _id: string
  status: string
  scheduledAt?: string
  candidate?: string
  job?: string
  roomToken?: string
}

function StatusChip({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{label}</span>
  return (
    <span className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
      ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  )
}

export default function LiveKitTest() {
  const [selectedInterview, setSelectedInterview] = useState('')
  const [tokenResult, setTokenResult] = useState<TokenResult | null>(null)
  const [artifactResult, setArtifactResult] = useState<ArtifactResult | null>(null)
  const [tokenOk, setTokenOk] = useState<boolean | null>(null)
  const [artifactOk, setArtifactOk] = useState<boolean | null>(null)
  const [configOk, setConfigOk] = useState<boolean | null>(null)
  const [error, setError] = useState('')

  const { data: interviews, isLoading } = useQuery<Interview[]>({
    queryKey: ['all-interviews-admin'],
    queryFn: () => api.get('/interviews/mine').then(r => r.data),
  })

  const tokenMutation = useMutation({
    mutationFn: () => api.get<TokenResult>(`/interviews/${selectedInterview}/token`).then(r => r.data),
    onSuccess: (data) => {
      setTokenResult(data)
      setTokenOk(!!data.token)
      setConfigOk(!!data.wsUrl)
      setError('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setTokenOk(false)
      setConfigOk(false)
      setError(msg ?? 'Token issuance failed.')
    },
  })

  const artifactMutation = useMutation({
    mutationFn: () => api.get<ArtifactResult>(`/interviews/${selectedInterview}/artifacts`).then(r => r.data),
    onSuccess: (data) => {
      setArtifactResult(data)
      setArtifactOk(!!(data.transcriptUrl && data.recordingUrl))
      setError('')
    },
    onError: () => {
      setArtifactOk(false)
      setError('Artifact endpoint failed.')
    },
  })

  const reset = () => {
    setTokenResult(null); setArtifactResult(null)
    setTokenOk(null); setArtifactOk(null); setConfigOk(null)
    setError('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold">LiveKit Smoke Test</h1>
        <p className="text-sm text-muted-foreground">
          Verify the real-time interview infrastructure: token issuance, room configuration, and artifact endpoints.
        </p>
      </div>

      {/* Status summary */}
      <div className="flex flex-wrap gap-2">
        <StatusChip ok={configOk} label="LiveKit Config" />
        <StatusChip ok={tokenOk} label="Token Issuance" />
        <StatusChip ok={artifactOk} label="Artifact Endpoints" />
      </div>

      {/* Interview selector */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Video className="h-5 w-5 text-primary" /> Select Interview</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading interviews…</p>
          ) : !interviews?.length ? (
            <p className="text-sm text-muted-foreground">No interviews found. Schedule at least one interview from the Shortlist page first.</p>
          ) : (
            <select className="h-9 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
              value={selectedInterview} onChange={(e) => { setSelectedInterview(e.target.value); reset() }}>
              <option value="">Choose an interview…</option>
              {interviews.map((iv) => (
                <option key={iv._id} value={iv._id}>
                  {iv._id.slice(-8)} · {iv.status} {iv.scheduledAt ? `· ${new Date(iv.scheduledAt).toLocaleString()}` : ''}
                </option>
              ))}
            </select>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => tokenMutation.mutate()} disabled={!selectedInterview || tokenMutation.isPending}>
              {tokenMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
              Issue LiveKit Token
            </Button>
            <Button variant="outline" onClick={() => artifactMutation.mutate()} disabled={!selectedInterview || artifactMutation.isPending}>
              {artifactMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Check Artifact Endpoints
            </Button>
            {(tokenResult || artifactResult) && (
              <Button variant="ghost" onClick={reset}><RefreshCw className="h-4 w-4" /> Reset</Button>
            )}
          </div>
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {/* Token result */}
      {tokenResult && (
        <Card className={cn('border-2', tokenOk ? 'border-emerald-300' : 'border-red-300')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Token Response
              <StatusChip ok={tokenOk} label={tokenOk ? 'OK' : 'FAILED'} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 font-mono text-sm">
            <div className="rounded-lg bg-muted p-3 space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0">room_name</span>
                <span className="text-foreground break-all">{tokenResult.roomName}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0">ws_url</span>
                <span className={cn(tokenResult.wsUrl ? 'text-emerald-600' : 'text-amber-600')}>
                  {tokenResult.wsUrl ?? 'NOT SET — add LIVEKIT_HOST to .env'}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0 pt-0.5">jwt_token</span>
                <span className="text-foreground break-all text-xs opacity-70">
                  {tokenResult.token ? `${tokenResult.token.slice(0, 60)}…` : 'null'}
                </span>
              </div>
            </div>
            {!tokenResult.wsUrl && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <Wifi className="h-4 w-4 shrink-0 mt-0.5" />
                <span>LIVEKIT_HOST is not set in the server .env. Token is valid but the client won't know which server to connect to. Add: <code>LIVEKIT_HOST=wss://your-livekit-server.livekit.cloud</code></span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Artifact result */}
      {artifactResult && (
        <Card className={cn('border-2', artifactOk ? 'border-emerald-300' : 'border-amber-300')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Artifact Endpoints
              <StatusChip ok={artifactOk} label={artifactOk ? 'Registered' : 'Missing'} />
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm">
            <div className="rounded-lg bg-muted p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span className="text-muted-foreground">transcript_url</span>
                <span className="text-foreground text-xs">{artifactResult.transcriptUrl}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span className="text-muted-foreground">recording_url</span>
                <span className="text-foreground text-xs">{artifactResult.recordingUrl}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
