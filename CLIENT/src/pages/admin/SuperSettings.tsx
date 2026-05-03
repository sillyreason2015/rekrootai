import { useEffect, useState } from 'react'
import { Shield, Brain, ToggleLeft, ToggleRight, AlertTriangle, Key, Globe, Trash2, Loader2, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import InfoTip from '../../components/shared/InfoTip'
import { useMutation, useQuery } from '@tanstack/react-query'
import { adminService } from '../../services/admin.service'
import { cn } from '../../lib/utils'

function Toggle({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button onClick={onToggle} disabled={disabled} className="shrink-0 focus:outline-none disabled:opacity-40">
      {enabled
        ? <ToggleRight className="h-7 w-7 text-primary" />
        : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
    </button>
  )
}

type DangerResult = { ok: boolean; deleted?: number; cleared?: number; archived?: number } | null

export default function SuperSettings() {
  const [aiAssist, setAiAssist] = useState(true)
  const [fairnessGate, setFairnessGate] = useState(true)
  const [shapExplain, setShapExplain] = useState(true)
  const [proctoring, setProctoring] = useState(true)
  const [geminiGen, setGeminiGen] = useState(true)
  const [gdprMode, setGdprMode] = useState(true)
  const [auditImmutable, setAuditImmutable] = useState(true)
  const [candidateExplain, setCandidateExplain] = useState(true)
  const [maintenance, setMaintenance] = useState(false)
  const [maintenanceMsg, setMaintenanceMsg] = useState('The platform is undergoing scheduled maintenance. We will be back shortly.')
  const [retentionDays, setRetentionDays] = useState(730)
  const [showKeys, setShowKeys] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [dangerResults, setDangerResults] = useState<Record<string, DangerResult>>({})
  const [dangerConfirm, setDangerConfirm] = useState<string | null>(null)

  const { data, isError } = useQuery({
    queryKey: ['super-settings'],
    queryFn: adminService.getSuperSettings,
    retry: false,
  })

  const { data: keyStatus } = useQuery({
    queryKey: ['super-key-status'],
    queryFn: adminService.getSuperKeyStatus,
    retry: false,
  })

  useEffect(() => {
    if (!data) return
    setAiAssist(Boolean(data.aiAssist))
    setFairnessGate(Boolean(data.fairnessGate))
    setShapExplain(Boolean(data.shapExplain))
    setProctoring(Boolean(data.proctoring))
    setGeminiGen(Boolean(data.geminiGen))
    setGdprMode(Boolean(data.gdprMode))
    setAuditImmutable(Boolean(data.auditImmutable))
    setCandidateExplain(Boolean(data.candidateExplain))
    setMaintenance(Boolean(data.maintenance))
    setMaintenanceMsg(String(data.maintenanceMsg ?? maintenanceMsg))
    setRetentionDays(Number(data.retentionDays ?? 730))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const saveMutation = useMutation({ mutationFn: adminService.updateSuperSettings })

  const handleSave = async () => {
    setSaveError('')
    try {
      await saveMutation.mutateAsync({
        aiAssist, fairnessGate, shapExplain, proctoring, geminiGen,
        gdprMode, auditImmutable, candidateExplain,
        maintenance, maintenanceMsg, retentionDays,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setSaveError('Failed to save. Check your connection and try again.')
    }
  }

  const runDanger = async (key: string, fn: () => Promise<DangerResult>) => {
    if (dangerConfirm !== key) { setDangerConfirm(key); return }
    setDangerConfirm(null)
    try {
      const result = await fn()
      setDangerResults((prev) => ({ ...prev, [key]: result }))
      setTimeout(() => setDangerResults((prev) => ({ ...prev, [key]: null })), 5000)
    } catch {
      setDangerResults((prev) => ({ ...prev, [key]: null }))
    }
  }

  const keyRows: { name: string; label: string; envKey: string }[] = [
    { name: 'GEMINI_API_KEY',  label: 'Gemini AI',          envKey: 'GEMINI_API_KEY' },
    { name: 'LIVEKIT_API_KEY', label: 'LiveKit (video)',     envKey: 'LIVEKIT_API_KEY' },
    { name: 'SMTP_HOST',       label: 'Email (SMTP)',        envKey: 'SMTP_HOST' },
    { name: 'BLOB_ACCESS_KEY', label: 'S3 / Blob storage',  envKey: 'BLOB_ACCESS_KEY' },
    { name: 'ML_SERVICE_URL',  label: 'ML scoring service', envKey: 'ML_SERVICE_URL' },
    { name: 'MONGODB_URI',     label: 'MongoDB',            envKey: 'MONGODB_URI' },
    { name: 'JWT_SECRET',      label: 'JWT secret',         envKey: 'JWT_SECRET' },
  ]

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="font-semibold">Access denied</p>
        <p className="text-sm text-muted-foreground">Platform settings are restricted to super admins only.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Platform Settings</h1>
          <p className="text-sm text-muted-foreground">Global controls for the RekrootAI platform — super admin only.</p>
        </div>
        <div className="flex items-center gap-3">
          {saveError && <p className="text-xs text-destructive">{saveError}</p>}
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2 min-w-[120px]">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <><CheckCircle2 className="h-4 w-4" /> Saved</> : 'Save changes'}
          </Button>
        </div>
      </div>

      {/* Maintenance Mode */}
      <Card className={maintenance ? 'border-destructive/40 bg-destructive/5' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Maintenance Mode
            <InfoTip content="When enabled, all non-super-admin users see a maintenance message and cannot access the platform." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable maintenance mode</p>
              <p className="text-xs text-muted-foreground">Locks the platform for all users except super admins.</p>
            </div>
            <Toggle enabled={maintenance} onToggle={() => setMaintenance(!maintenance)} />
          </div>
          {maintenance && (
            <div className="space-y-1.5">
              <Label className="text-xs">Maintenance message shown to users</Label>
              <Input value={maintenanceMsg} onChange={(e) => setMaintenanceMsg(e.target.value)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Pipeline Policies */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" />
            AI Pipeline Policies
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {[
            { label: 'AI Assist mode', desc: 'Allow recruiters to use AI-powered shortlist recommendations.', tip: 'When off, all companies are forced into Override mode — AI scores are hidden and recruiters work manually.', val: aiAssist, set: setAiAssist },
            { label: 'Fairness gate', desc: 'Run demographic parity checks before confirming shortlist decisions.', tip: 'Disabling this removes the bias-detection layer platform-wide. Not recommended.', val: fairnessGate, set: setFairnessGate },
            { label: 'SHAP explainability', desc: 'Generate feature-importance explanations for every score.', tip: 'When off, candidates and recruiters will no longer see score breakdowns.', val: shapExplain, set: setShapExplain },
            { label: 'Interview proctoring', desc: 'Monitor tab switches and focus loss during assessments and interviews.', tip: 'Disabling removes all proctoring signals platform-wide.', val: proctoring, set: setProctoring },
            { label: 'Gemini AI question generation', desc: 'Allow recruiters to generate job-specific questions via Gemini API.', tip: 'When off, the Question Bank falls back to static templates only.', val: geminiGen, set: setGeminiGen },
          ].map(({ label, desc, tip, val, set }) => (
            <div key={label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="flex-1 pr-4">
                <p className="flex items-center gap-1.5 text-sm font-medium">{label}<InfoTip content={tip} /></p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Toggle enabled={val} onToggle={() => set(!val)} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Compliance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-purple-500" />
            Compliance Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {[
            { label: 'GDPR / NDPR right-to-erasure', desc: 'Allow candidates to request full deletion of their personal data.', tip: 'When enabled, candidates can trigger a deletion request from their settings.', val: gdprMode, set: setGdprMode },
            { label: 'Immutable audit log', desc: 'Prevent any user from editing or deleting audit entries.', tip: 'This should always be on. Disabling it is recorded and cannot be undone retroactively.', val: auditImmutable, set: setAuditImmutable },
            { label: 'Candidate decision explanations', desc: 'Allow candidates to view their SHAP-backed score breakdown.', tip: 'Turning this off may conflict with GDPR Article 22 rights.', val: candidateExplain, set: setCandidateExplain },
          ].map(({ label, desc, tip, val, set }) => (
            <div key={label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="flex-1 pr-4">
                <p className="flex items-center gap-1.5 text-sm font-medium">{label}<InfoTip content={tip} /></p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Toggle enabled={val} onToggle={() => set(!val)} />
            </div>
          ))}
          <div className="flex items-center justify-between py-3">
            <div className="flex-1 pr-4">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                Audit log retention
                <InfoTip content="How long audit records are kept. Minimum 2 years recommended for compliance." />
              </p>
              <p className="text-xs text-muted-foreground">Days to retain audit records.</p>
            </div>
            <Input type="number" min={365} max={3650} value={retentionDays} onChange={(e) => setRetentionDays(+e.target.value)} className="w-24 text-right" />
          </div>
        </CardContent>
      </Card>

      {/* Provider Keys — real status from server */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4 text-amber-500" />
            Provider Keys
            <InfoTip content="Status is live — checked against server environment variables. Values are never exposed in the UI." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {keyRows.map(({ label, envKey }) => {
            const status = keyStatus ? keyStatus[envKey] : undefined
            return (
              <div key={label} className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5 text-sm">
                <span className="font-medium">{label}</span>
                <span className={cn('flex items-center gap-1.5 text-xs font-medium', status === undefined ? 'text-muted-foreground' : status ? 'text-emerald-600' : 'text-destructive')}>
                  <span className={cn('h-2 w-2 rounded-full', status === undefined ? 'bg-muted-foreground animate-pulse' : status ? 'bg-emerald-500' : 'bg-destructive')} />
                  {status === undefined ? 'Checking…' : status ? 'Configured' : 'Missing'}
                </span>
              </div>
            )
          })}
          <button onClick={() => setShowKeys(!showKeys)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-1">
            <Globe className="h-3.5 w-3.5" />
            {showKeys ? 'Hide' : 'Show'} environment variable names
          </button>
          {showKeys && (
            <div className="rounded-lg border bg-muted/50 px-4 py-3 font-mono text-xs text-muted-foreground space-y-1">
              {['GEMINI_API_KEY', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_HOST', 'SMTP_HOST', 'SMTP_USER', 'BLOB_ACCESS_KEY', 'BLOB_SECRET_KEY', 'ML_SERVICE_URL', 'MONGODB_URI', 'JWT_SECRET'].map((k) => (
                <p key={k}>{k}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <Trash2 className="h-4 w-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            {
              key: 'purge',
              label: 'Purge all expired assessments',
              desc: 'Permanently delete assessment records past the expiry date.',
              fn: () => adminService.dangerPurgeAssessments(),
              resultLabel: (r: DangerResult) => r?.deleted !== undefined ? `${r.deleted} record${r.deleted !== 1 ? 's' : ''} deleted.` : '',
            },
            {
              key: 'caches',
              label: 'Reset all AI caches',
              desc: 'Clear Gemini question cache and stale AI output records.',
              fn: () => adminService.dangerResetCaches(),
              resultLabel: (r: DangerResult) => r?.cleared !== undefined ? `${r.cleared} cache record${r.cleared !== 1 ? 's' : ''} cleared.` : '',
            },
            {
              key: 'archive',
              label: 'Archive closed jobs',
              desc: 'Move all closed-status jobs and their applications to archive.',
              fn: () => adminService.dangerArchiveJobs(),
              resultLabel: (r: DangerResult) => r?.archived !== undefined ? `${r.archived} job${r.archived !== 1 ? 's' : ''} archived.` : '',
            },
          ] as const).map(({ key, label, desc, fn, resultLabel }) => (
            <div key={key} className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
                {dangerResults[key] && (
                  <p className="mt-1 text-xs text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Done — {resultLabel(dangerResults[key])}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  'shrink-0 transition-colors',
                  dangerConfirm === key
                    ? 'border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : 'border-destructive/30 text-destructive hover:bg-destructive/10',
                )}
                onClick={() => runDanger(key, fn as () => Promise<DangerResult>)}
              >
                {dangerConfirm === key ? 'Confirm' : 'Run'}
              </Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-1">Click <strong>Run</strong> once to stage, then <strong>Confirm</strong> to execute. All danger actions are logged.</p>
        </CardContent>
      </Card>
    </div>
  )
}
