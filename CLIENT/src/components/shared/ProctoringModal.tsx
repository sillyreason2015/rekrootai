import { useState } from 'react'
import { ShieldAlert, Eye, MonitorOff, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

interface ProctoringModalProps {
  type: 'assessment' | 'interview'
  onAccept: () => void
}

const RULES = {
  assessment: [
    { icon: Eye, text: 'This assessment is AI-proctored. All activity is monitored.' },
    { icon: MonitorOff, text: 'Do not switch tabs, minimise, or open other windows during the assessment.' },
    { icon: AlertTriangle, text: 'Each tab switch is recorded as a violation. After 3 violations your assessment will be automatically submitted.' },
    { icon: ShieldAlert, text: 'Right-clicking and text selection are disabled during the assessment.' },
    { icon: CheckCircle2, text: 'Ensure you are in a quiet, well-lit location before you begin.' },
  ],
  interview: [
    { icon: Eye, text: 'This interview session is proctored and recorded via LiveKit.' },
    { icon: MonitorOff, text: 'Do not switch tabs, minimise, or navigate away during the interview.' },
    { icon: AlertTriangle, text: 'Tab switches are logged and reported to the recruiter.' },
    { icon: ShieldAlert, text: 'Keep your camera and microphone on throughout the session.' },
    { icon: CheckCircle2, text: 'Ensure you are in a quiet, well-lit location before you begin.' },
  ],
}

export default function ProctoringModal({ type, onAccept }: ProctoringModalProps) {
  const [agreed, setAgreed] = useState(false)
  const rules = RULES[type]
  const title = type === 'assessment' ? 'Assessment Proctoring Notice' : 'Interview Proctoring Notice'
  const btnLabel = type === 'assessment' ? 'Begin Assessment' : 'Enter Interview Room'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-6 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-serif text-lg font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">Please read carefully before proceeding</p>
          </div>
        </div>

        {/* Rules */}
        <div className="space-y-3 px-6 py-5">
          {rules.map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-sm text-foreground/80">{text}</p>
            </div>
          ))}
        </div>

        {/* Consent */}
        <div className="border-t px-6 py-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
            />
            <span className="text-sm text-foreground/80">
              I understand this {type} is proctored. I agree not to switch tabs, open other windows, or attempt to circumvent monitoring. I acknowledge that violations will be recorded.
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <Button
            disabled={!agreed}
            onClick={onAccept}
            className={cn(!agreed && 'opacity-50 cursor-not-allowed')}
          >
            {btnLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
