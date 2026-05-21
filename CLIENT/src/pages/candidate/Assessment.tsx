import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, CheckCircle2, AlertTriangle, Loader2, ChevronRight, ShieldAlert, X } from 'lucide-react'
import { assessmentService } from '../../services/assessment.service'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Progress } from '../../components/ui/progress'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import AiBadge from '../../components/shared/AiBadge'
import ProctoringModal from '../../components/shared/ProctoringModal'
import { useProctoringMonitor } from '../../hooks/useProctoringMonitor'
import { cn } from '../../lib/utils'
import type { Question } from '../../types'

const MAX_VIOLATIONS = 3
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function getAssessmentStorageKey(assessmentId: string, moduleIndex: number, userId: string) {
  return `assessment-session:${userId}:${assessmentId}:${moduleIndex}`
}

function readStorageEntry(key: string): { answers?: Record<string, number | string>; deadline?: number; timeLeft?: number } | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { answers?: Record<string, number | string>; deadline?: number; timeLeft?: number; savedAt?: number }
    // Expire entries older than 7 days
    if (parsed.savedAt && Date.now() - parsed.savedAt > SEVEN_DAYS_MS) {
      localStorage.removeItem(key)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export default function Assessment() {
  const { applicationId } = useParams<{ applicationId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?._id ?? 'anon'
  const [activeModule, setActiveModule] = useState<number | null>(null)
  const activeModuleRef = useRef<number | null>(null)
  const [answers, setAnswers] = useState<Record<string, number | string>>({})
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [started, setStarted] = useState(false)
  const [showProctoringModal, setShowProctoringModal] = useState(false)
  const [autoSubmitting, setAutoSubmitting] = useState(false)
  const autoSubmittingRef = useRef(false) // ref so forceSubmit guard is never stale
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Keep refs in sync
  useEffect(() => { activeModuleRef.current = activeModule }, [activeModule])
  useEffect(() => { autoSubmittingRef.current = autoSubmitting }, [autoSubmitting])

  const finishAssessmentSession = (assessmentId: string, moduleCount: number) => {
    Array.from({ length: moduleCount }).forEach((_, index) => localStorage.removeItem(getAssessmentStorageKey(assessmentId, index, userId)))
    setAnswers({})
    autoSubmittingRef.current = false
    setAutoSubmitting(false)
    setActiveModule(null)
  }

  const { data: assessment, isLoading } = useQuery({
    queryKey: ['assessment', applicationId],
    queryFn: () => assessmentService.getMine(applicationId!),
    enabled: !!applicationId,
  })

  useEffect(() => {
    if (!assessment) return
    if (assessment.status === 'in_progress') {
      setStarted(true)
      // Always land on the lobby — never restore a saved module index.
      // Completed modules are locked; the candidate picks the next one themselves.
      setActiveModule(null)
    }
  }, [assessment])

  const startMutation = useMutation({
    mutationFn: () => assessmentService.start(assessment!._id),
    onSuccess: () => {
      setStarted(true)
      setActiveModule(null)
      setAutoSubmitting(false)
    },
  })

  const submitModule = useMutation({
    mutationFn: ({ moduleIndex, ans }: { moduleIndex: number; ans: unknown[] }) =>
      assessmentService.submitModule(assessment!._id, moduleIndex, ans),
    onSuccess: (updatedAssessment, variables) => {
      if (!assessment) return
      setSubmitError('')
      localStorage.removeItem(getAssessmentStorageKey(assessment._id, variables.moduleIndex, userId))
      queryClient.setQueryData(['assessment', applicationId], updatedAssessment)

      if (updatedAssessment.status === 'completed') {
        finishAssessmentSession(assessment._id, assessment.modules.length)
        navigate('/candidate/applications')
        return
      }

      // More modules remain — return to lobby
      setAnswers({})
      autoSubmittingRef.current = false
      setAutoSubmitting(false)
      setActiveModule(null)
    },
    onError: (err: unknown, variables) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      // Clear stale localStorage so an expired deadline can't re-trigger on next open
      if (assessment) localStorage.removeItem(getAssessmentStorageKey(assessment._id, variables.moduleIndex, userId))
      autoSubmittingRef.current = false
      setAutoSubmitting(false)
      // If auto-submitted (no user confirmation dialog), go back to lobby so they can retry
      if (!showSubmitConfirm) {
        setActiveModule(null)
      }
      setSubmitError(msg ?? 'Failed to submit module. Please try again.')
    },
  })

  // Auto-submit current module answers (called on max violations or timer expiry)
  const forceSubmit = () => {
    const currentModule = activeModuleRef.current
    if (!assessment || currentModule === null || submitModule.isPending || autoSubmittingRef.current) return
    autoSubmittingRef.current = true
    setAutoSubmitting(true)
    const mod = assessment.modules[currentModule]
    const questions: Question[] = mod.questions
    const ans = questions.map((q) => ({
      questionId: q._id,
      selected: typeof answers[q._id] === 'number' ? answers[q._id] as number : undefined,
      text: typeof answers[q._id] === 'string' ? answers[q._id] as string : undefined,
    }))
    submitModule.mutate({ moduleIndex: currentModule, ans })
  }

  // Proctoring monitor — only active while inside a module (not in lobby)
  // Pass activeModule as key so violations reset fresh for each module
  const { violations, lastViolationReason, showWarning, dismissWarning } = useProctoringMonitor({
    enabled: started && activeModule !== null,
    maxViolations: MAX_VIOLATIONS,
    onMaxViolations: forceSubmit,
    resetKey: activeModule ?? -1,
  })

  // Timer — uses an absolute deadline so background-throttled intervals don't slow the clock
  useEffect(() => {
    if (!started || activeModule === null || !assessment) return
    const timeLimit = (assessment.job as { assessmentModules?: Array<{ timeLimit: number }> })?.assessmentModules?.[activeModule]?.timeLimit ?? 20
    const totalSeconds = 60 * timeLimit // always use the full time limit; never zero

    const parsed = readStorageEntry(getAssessmentStorageKey(assessment._id, activeModule, userId))
    let deadline: number
    const savedAnswers: Record<string, number | string> = parsed?.answers ?? {}
    if (parsed) {
      if (typeof parsed.deadline === 'number' && parsed.deadline > Date.now() + 2000) {
        deadline = parsed.deadline
      } else if (typeof parsed.timeLeft === 'number' && parsed.timeLeft > 2) {
        deadline = Date.now() + parsed.timeLeft * 1000
      } else {
        deadline = Date.now() + totalSeconds * 1000
      }
    } else {
      deadline = Date.now() + totalSeconds * 1000
    }
    setAnswers(savedAnswers)

    // Don't call forceSubmit on the very first tick — give the UI a moment to settle
    let ticked = false
    const tick = () => {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining <= 0 && ticked) { forceSubmit() }
      ticked = true
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, activeModule, assessment])

  useEffect(() => {
    if (!assessment || activeModule === null || !started) return
    const key = getAssessmentStorageKey(assessment._id, activeModule, userId)
    const existing = readStorageEntry(key)
    localStorage.setItem(key, JSON.stringify({
      answers,
      timeLeft,
      deadline: existing?.deadline,
      savedAt: Date.now(),
    }))
  }, [assessment, activeModule, answers, timeLeft, started, userId])

  if (isLoading) return <LoadingSpinner />
  if (!assessment) return <p className="text-muted-foreground">Assessment not found.</p>

  const isExpired = new Date(assessment.expiresAt) < new Date()

  if (assessment.status === 'completed') {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-emerald-500" />
        <h1 className="font-serif text-2xl font-semibold">Assessment Complete</h1>
        <p className="mt-2 text-muted-foreground">Your responses have been submitted. Results will be reflected in your application.</p>
        <Button className="mt-6" onClick={() => navigate('/candidate/applications')}>Back to Applications</Button>
      </div>
    )
  }

  if (isExpired) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <AlertTriangle className="mx-auto mb-4 h-16 w-16 text-amber-500" />
        <h1 className="font-serif text-2xl font-semibold">Assessment Expired</h1>
        <p className="mt-2 text-muted-foreground">This assessment window has closed. Please contact the recruiter if you believe this is an error.</p>
      </div>
    )
  }

  // Overview / module picker
  if (!started || activeModule === null) {
    return (
      <>
        {showProctoringModal && (
          <ProctoringModal
            type="assessment"
            onAccept={() => {
              setShowProctoringModal(false)
              startMutation.mutate()
            }}
          />
        )}
        <div className="mx-auto max-w-2xl space-y-6">
          <h1 className="font-serif text-2xl font-semibold">Assessment</h1>

          {/* Proctoring notice banner */}
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">This assessment is proctored</p>
              <p className="mt-0.5 text-amber-700">Tab switches and window focus loss are monitored. After {MAX_VIOLATIONS} violations your assessment will be auto-submitted. Do not exit during the session.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <Clock className="h-4 w-4 shrink-0" />
            Expires {new Date(assessment.expiresAt).toLocaleDateString()}. Complete all modules in one session.
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {assessment.modules.map((mod, i) => (
              <Card
                key={i}
                className={cn(
                  mod.completedAt ? 'border-emerald-200 bg-emerald-50 opacity-70' : started ? 'cursor-pointer hover:border-primary/40' : '',
                )}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  {mod.completedAt ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{i + 1}</div>
                  )}
                  <div>
                    <p className="font-medium capitalize">{mod.type}</p>
                    <p className="text-xs text-muted-foreground">{mod.questions.length} questions</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {mod.type === 'aptitude' && 'Numerical and logical reasoning'}
                      {mod.type === 'technical' && 'Role-specific technical knowledge'}
                      {mod.type === 'situational' && 'Workplace scenario judgement'}
                      {mod.type === 'personality' && 'Working style and traits'}
                      {mod.type === 'values' && 'Alignment with company culture and ethics — unscored, for recruiter review'}
                    </p>
                  </div>
                  {started && !mod.completedAt && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() => {
                        setAnswers({})
                        setActiveModule(i)
                      }}
                    >
                      Open
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {!started ? (
            <Button
              size="lg"
              onClick={() => setShowProctoringModal(true)}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Begin Assessment
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Completed modules are locked. Choose any remaining module to continue your assessment.
            </p>
          )}
        </div>
      </>
    )
  }

  const mod = assessment.modules[activeModule]
  const questions: Question[] = mod.questions
  const progress = (Object.keys(answers).length / questions.length) * 100

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Violation warning banner */}
      {showWarning && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>
              <strong>Proctoring violation ({violations}/{MAX_VIOLATIONS}):</strong> {lastViolationReason}.
              {violations >= MAX_VIOLATIONS
                ? ' Assessment is being submitted automatically.'
                : ` ${MAX_VIOLATIONS - violations} more will trigger automatic submission.`}
            </span>
          </div>
          <button onClick={dismissWarning} className="shrink-0 rounded p-0.5 hover:bg-red-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Auto-submitting overlay */}
      {autoSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-xl border bg-card p-8 text-center shadow-2xl max-w-sm">
            <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-destructive" />
            <h2 className="font-serif text-xl font-semibold">Assessment Auto-Submitted</h2>
            <p className="mt-2 text-sm text-muted-foreground">Maximum proctoring violations reached. Your answers have been submitted automatically.</p>
            <Loader2 className="mx-auto mt-4 h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-xl font-semibold capitalize">{mod.type} Module</h2>
          <p className="text-sm text-muted-foreground">Module {activeModule + 1} of {assessment.modules.length}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Violation counter */}
          {violations > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">
              <ShieldAlert className="h-3.5 w-3.5" />
              {violations}/{MAX_VIOLATIONS} violations
            </div>
          )}
          <AiBadge label="AI Scored" />
          <div className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold', timeLeft < 60 ? 'bg-destructive/10 text-destructive' : 'bg-muted')}>
            <Clock className="h-4 w-4" />
            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
          </div>
        </div>
      </div>

      <Progress value={progress} />

      <div className="space-y-6">
        {questions.map((q, qi) => (
          <Card key={q._id} className={answers[q._id] !== undefined ? 'border-primary/30' : ''}>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Q{qi + 1}. {q.text}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {q.type === 'mcq' && q.options?.map((opt, oi) => (
                <button
                  key={oi}
                  onClick={() => setAnswers((p) => ({ ...p, [q._id]: oi }))}
                  className={cn(
                    'w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors',
                    answers[q._id] === oi
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'hover:border-primary/40 hover:bg-accent',
                  )}
                >
                  {String.fromCharCode(65 + oi)}. {opt}
                </button>
              ))}
              {q.type === 'open' && (
                <textarea
                  rows={4}
                  className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Type your answer here..."
                  value={(answers[q._id] as string) ?? ''}
                  onChange={(e) => setAnswers((p) => ({ ...p, [q._id]: e.target.value }))}
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-xl border bg-card p-8 text-center shadow-2xl max-w-sm w-full mx-4">
            <h2 className="font-serif text-xl font-semibold">Submit this module?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Your answers will be saved and you cannot return to this module. You can then continue with the remaining modules.</p>
            <div className="mt-6 flex gap-3 justify-center">
              <Button variant="outline" onClick={() => setShowSubmitConfirm(false)}>Go Back</Button>
              <Button
                disabled={submitModule.isPending}
                onClick={() => {
                  setShowSubmitConfirm(false)
                  const ans = questions.map((q) => ({
                    questionId: q._id,
                    selected: typeof answers[q._id] === 'number' ? answers[q._id] as number : undefined,
                    text: typeof answers[q._id] === 'string' ? answers[q._id] as string : undefined,
                  }))
                  submitModule.mutate({ moduleIndex: activeModule, ans })
                }}
              >
                Yes, Submit
              </Button>
            </div>
          </div>
        </div>
      )}

      {submitError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {Object.keys(answers).length} / {questions.length} answered
        </p>
        <Button
          disabled={Object.keys(answers).length < questions.length || submitModule.isPending || autoSubmitting}
          onClick={() => { setSubmitError(''); setShowSubmitConfirm(true) }}
        >
          {submitModule.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Submit Module <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
