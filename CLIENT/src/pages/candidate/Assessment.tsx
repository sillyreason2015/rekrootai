import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Clock, CheckCircle2, AlertTriangle, Loader2, ChevronRight, ShieldAlert, X } from 'lucide-react'
import { assessmentService } from '../../services/assessment.service'
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

function getAssessmentStorageKey(assessmentId: string, moduleIndex: number) {
  return `assessment-session:${assessmentId}:${moduleIndex}`
}

export default function Assessment() {
  const { applicationId } = useParams<{ applicationId: string }>()
  const navigate = useNavigate()
  const [activeModule, setActiveModule] = useState<number | null>(null)
  const [answers, setAnswers] = useState<Record<string, number | string>>({})
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [started, setStarted] = useState(false)
  const [showProctoringModal, setShowProctoringModal] = useState(false)
  const [autoSubmitting, setAutoSubmitting] = useState(false)

  const { data: assessment, isLoading, refetch } = useQuery({
    queryKey: ['assessment', applicationId],
    queryFn: () => assessmentService.getMine(applicationId!),
    enabled: !!applicationId,
  })

  useEffect(() => {
    if (!assessment) return
    if (assessment.status === 'in_progress') {
      setStarted(true)
      const savedActiveModule = sessionStorage.getItem(`assessment-active-module:${assessment._id}`)
      if (savedActiveModule !== null) {
        const index = Number(savedActiveModule)
        setActiveModule(Number.isInteger(index) && index >= 0 ? index : null)
      } else {
        setActiveModule(null)
      }
    }
  }, [assessment])

  useEffect(() => {
    if (!assessment) return
    if (activeModule === null) {
      sessionStorage.removeItem(`assessment-active-module:${assessment._id}`)
    } else {
      sessionStorage.setItem(`assessment-active-module:${assessment._id}`, String(activeModule))
    }
  }, [assessment, activeModule])

  const startMutation = useMutation({
    mutationFn: () => assessmentService.start(assessment!._id),
    onSuccess: () => {
      setStarted(true)
      setActiveModule(null)
      setAutoSubmitting(false)
    },
  })

  const submitModule = useMutation({
    mutationFn: ({ type, ans }: { type: string; ans: unknown[] }) =>
      assessmentService.submitModule(assessment!._id, type, ans),
    onSuccess: async () => {
      if (!assessment || activeModule === null) return
      localStorage.removeItem(getAssessmentStorageKey(assessment._id, activeModule))
      const refreshed = await refetch()
      const latest = refreshed.data
      const hasRemainingModules = latest?.modules.some((module) => !module.completedAt)

      if (!hasRemainingModules) {
        void assessmentService.complete(assessment._id).finally(() => {
          assessment.modules.forEach((_module, index) => localStorage.removeItem(getAssessmentStorageKey(assessment._id, index)))
          sessionStorage.removeItem(`assessment-active-module:${assessment._id}`)
          setAutoSubmitting(false)
          navigate('/candidate/applications')
        })
        return
      }
      setAnswers({})
      setAutoSubmitting(false)
      setActiveModule(null)
    },
  })

  // Auto-submit current module answers (called on max violations or timer expiry)
  const forceSubmit = () => {
    if (!assessment || activeModule === null || submitModule.isPending || autoSubmitting) return
    setAutoSubmitting(true)
    const mod = assessment.modules[activeModule]
    const questions: Question[] = mod.questions
    const ans = questions.map((q) => ({
      questionId: q._id,
      selected: typeof answers[q._id] === 'number' ? answers[q._id] as number : undefined,
      text: typeof answers[q._id] === 'string' ? answers[q._id] as string : undefined,
    }))
    submitModule.mutate({ type: mod.type, ans })
  }

  // Proctoring monitor — only active once assessment is started
  const { violations, lastViolationReason, showWarning, dismissWarning } = useProctoringMonitor({
    enabled: started && activeModule !== null,
    maxViolations: MAX_VIOLATIONS,
    onMaxViolations: forceSubmit,
  })

  // Timer
  useEffect(() => {
    if (!started || activeModule === null || !assessment) return
    const mod = assessment.modules[activeModule]
    const timeLimit = (assessment.job as { assessmentModules?: Array<{ timeLimit: number }> })?.assessmentModules?.[activeModule]?.timeLimit ?? 20
    const saved = localStorage.getItem(getAssessmentStorageKey(assessment._id, activeModule))
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { answers?: Record<string, number | string>; timeLeft?: number }
        setAnswers(parsed.answers ?? {})
        setTimeLeft(typeof parsed.timeLeft === 'number' ? parsed.timeLeft : (mod.timeSpent ? 0 : 60 * timeLimit))
      } catch {
        setAnswers({})
        setTimeLeft(mod.timeSpent ? 0 : 60 * timeLimit)
      }
    } else {
      setAnswers({})
      setTimeLeft(mod.timeSpent ? 0 : 60 * timeLimit)
    }
    const id = setInterval(() => setTimeLeft((t) => {
      if (t <= 1) { forceSubmit(); return 0 }
      return t - 1
    }), 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, activeModule, assessment])

  useEffect(() => {
    if (!assessment || activeModule === null || !started) return
    localStorage.setItem(
      getAssessmentStorageKey(assessment._id, activeModule),
      JSON.stringify({ answers, timeLeft }),
    )
  }, [assessment, activeModule, answers, timeLeft, started])

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

      <div className="flex justify-end">
        <Button
          disabled={Object.keys(answers).length < questions.length || submitModule.isPending || autoSubmitting}
          onClick={() => {
            const ans = questions.map((q) => ({
              questionId: q._id,
              selected: typeof answers[q._id] === 'number' ? answers[q._id] as number : undefined,
              text: typeof answers[q._id] === 'string' ? answers[q._id] as string : undefined,
            }))
            submitModule.mutate({ type: mod.type, ans })
          }}
        >
          {submitModule.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Submit Module <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
