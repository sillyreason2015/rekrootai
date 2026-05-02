import { useEffect, useState } from 'react'
import { Shield, Brain, ToggleLeft, ToggleRight, AlertTriangle, Key, Globe, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import InfoTip from '../../components/shared/InfoTip'
import { useMutation, useQuery } from '@tanstack/react-query'
import { adminService } from '../../services/admin.service'

function Toggle({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button onClick={onToggle} disabled={disabled} className="shrink-0 focus:outline-none disabled:opacity-40">
      {enabled
        ? <ToggleRight className="h-7 w-7 text-primary" />
        : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
    </button>
  )
}

export default function SuperSettings() {
  // AI / model policies
  const [aiAssist, setAiAssist] = useState(true)
  const [fairnessGate, setFairnessGate] = useState(true)
  const [shapExplain, setShapExplain] = useState(true)
  const [proctoring, setProctoring] = useState(true)
  const [geminiGen, setGeminiGen] = useState(true)

  // Compliance
  const [gdprMode, setGdprMode] = useState(true)
  const [auditImmutable, setAuditImmutable] = useState(true)
  const [candidateExplain, setCandidateExplain] = useState(true)

  // Maintenance
  const [maintenance, setMaintenance] = useState(false)
  const [maintenanceMsg, setMaintenanceMsg] = useState('The platform is undergoing scheduled maintenance. We will be back shortly.')

  // API keys (display only — not editable in UI for security)
  const [showKeys, setShowKeys] = useState(false)

  // Retention
  const [retentionDays, setRetentionDays] = useState(730)

  const [saved, setSaved] = useState(false)
  const { data } = useQuery({ queryKey: ['super-settings'], queryFn: adminService.getSuperSettings })
  useEffect(() => {
    if (!data) return
    setAiAssist(Boolean(data.aiAssist)); setFairnessGate(Boolean(data.fairnessGate)); setShapExplain(Boolean(data.shapExplain)); setProctoring(Boolean(data.proctoring)); setGeminiGen(Boolean(data.geminiGen))
    setGdprMode(Boolean(data.gdprMode)); setAuditImmutable(Boolean(data.auditImmutable)); setCandidateExplain(Boolean(data.candidateExplain))
    setMaintenance(Boolean(data.maintenance)); setMaintenanceMsg(String(data.maintenanceMsg ?? maintenanceMsg)); setRetentionDays(Number(data.retentionDays ?? 730))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
  const saveMutation = useMutation({ mutationFn: adminService.updateSuperSettings })
  const handleSave = async () => {
    await saveMutation.mutateAsync({ aiAssist, fairnessGate, shapExplain, proctoring, geminiGen, gdprMode, auditImmutable, candidateExplain, maintenance, maintenanceMsg, retentionDays })
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Platform Settings</h1>
          <p className="text-sm text-muted-foreground">Global controls for the RekrootAI platform.</p>
        </div>
        <Button onClick={handleSave} className="gap-2">
          {saved ? '✓ Saved' : 'Save changes'}
        </Button>
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
            { label: 'Fairness gate', desc: 'Run demographic parity checks before confirming shortlist decisions.', tip: 'Disabling this removes the bias-detection layer platform-wide. Not recommended — audit trail will record the change.', val: fairnessGate, set: setFairnessGate },
            { label: 'SHAP explainability', desc: 'Generate feature-importance explanations for every score.', tip: 'When off, candidates and recruiters will no longer see score breakdowns. Final scores are still computed.', val: shapExplain, set: setShapExplain },
            { label: 'Interview proctoring', desc: 'Monitor tab switches and focus loss during assessments and interviews.', tip: 'Disabling removes all proctoring signals platform-wide. Individual companies cannot override this.', val: proctoring, set: setProctoring },
            { label: 'Gemini AI question generation', desc: 'Allow recruiters to generate job-specific questions via Gemini API.', tip: 'When off, the Question Bank falls back to static templates only. Useful if the API key is expired or over quota.', val: geminiGen, set: setGeminiGen },
          ].map(({ label, desc, tip, val, set }) => (
            <div key={label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="flex-1 pr-4">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {label}
                  <InfoTip content={tip} />
                </p>
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
            { label: 'GDPR / NDPR right-to-erasure', desc: 'Allow candidates to request full deletion of their personal data.', tip: 'When enabled, candidates can trigger a deletion request from their settings. PII is removed; anonymised decision records are retained.', val: gdprMode, set: setGdprMode },
            { label: 'Immutable audit log', desc: 'Prevent any user from editing or deleting audit entries.', tip: 'This should always be on. Disabling it is recorded as a super-admin action and cannot be undone retroactively.', val: auditImmutable, set: setAuditImmutable },
            { label: 'Candidate decision explanations', desc: 'Allow candidates to view their SHAP-backed score breakdown.', tip: 'When off, candidates can still see their outcome but not the detailed breakdown. Turning this off may conflict with GDPR Article 22 rights.', val: candidateExplain, set: setCandidateExplain },
          ].map(({ label, desc, tip, val, set }) => (
            <div key={label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="flex-1 pr-4">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {label}
                  <InfoTip content={tip} />
                </p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Toggle enabled={val} onToggle={() => set(!val)} />
            </div>
          ))}
          <div className="flex items-center justify-between py-3">
            <div className="flex-1 pr-4">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                Audit log retention
                <InfoTip content="How long audit records are kept before being eligible for archival. Minimum 2 years recommended for compliance. PII erasure requests are honoured before this period ends." />
              </p>
              <p className="text-xs text-muted-foreground">Days to retain audit records.</p>
            </div>
            <Input
              type="number"
              min={365}
              max={3650}
              value={retentionDays}
              onChange={(e) => setRetentionDays(+e.target.value)}
              className="w-24 text-right"
            />
          </div>
        </CardContent>
      </Card>

      {/* Provider Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4 text-amber-500" />
            Provider Keys
            <InfoTip content="These keys are stored server-side in environment variables. This panel shows their status only — values are never exposed in the UI." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { name: 'GEMINI_API_KEY', label: 'Gemini AI', status: true },
            { name: 'LIVEKIT_API_KEY', label: 'LiveKit (video)', status: true },
            { name: 'SMTP_HOST', label: 'Email (SMTP)', status: true },
            { name: 'BLOB_ACCESS_KEY', label: 'S3 / Blob storage', status: true },
            { name: 'ML_SERVICE_URL', label: 'ML scoring service', status: true },
          ].map(({ label, status }) => (
            <div key={label} className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5 text-sm">
              <span className="font-medium">{label}</span>
              <span className={`flex items-center gap-1.5 text-xs font-medium ${status ? 'text-emerald-600' : 'text-destructive'}`}>
                <span className={`h-2 w-2 rounded-full ${status ? 'bg-emerald-500' : 'bg-destructive'}`} />
                {status ? 'Configured' : 'Missing'}
              </span>
            </div>
          ))}
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

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <Trash2 className="h-4 w-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: 'Purge all expired assessments', desc: 'Permanently delete assessment records past the expiry date.' },
            { label: 'Reset all AI caches', desc: 'Clear Gemini question cache and ML model caches across all companies.' },
            { label: 'Archive closed jobs', desc: 'Move all closed-status jobs and their applications to cold storage.' },
          ].map(({ label, desc }) => (
            <div key={label} className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Button size="sm" variant="outline" className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10">
                Run
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
