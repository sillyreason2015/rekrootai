import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'

export interface TourStep {
  target: string        // CSS selector for the element to highlight
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

const CANDIDATE_TOUR: TourStep[] = [
  {
    target: '[data-tour="candidate-dashboard"]',
    title: 'Your Dashboard',
    body: 'This is your control centre. Your next action — assessment, interview, or decision — always appears here as a card.',
    placement: 'right',
  },
  {
    target: '[data-tour="candidate-jobs"]',
    title: 'Job Board',
    body: 'Browse all open positions and apply in one click. Your CV is pre-attached from your profile.',
    placement: 'right',
  },
  {
    target: '[data-tour="candidate-applications"]',
    title: 'Track Applications',
    body: 'Follow each application stage: Applied → Screening → Assessment → Interview → Decision.',
    placement: 'right',
  },
]

const RECRUITER_TOUR: TourStep[] = [
  {
    target: '[data-tour="recruiter-dashboard"]',
    title: 'Recruiter Dashboard',
    body: 'A live overview of all your active roles, pending actions, and pipeline health.',
    placement: 'right',
  },
  {
    target: '[data-tour="recruiter-jobs"]',
    title: 'Post a Job',
    body: 'Create a role in 4 steps: details, requirements, assessment config, and publish. Make sure your Question Bank has questions first.',
    placement: 'right',
  },
  {
    target: '[data-tour="recruiter-shortlist"]',
    title: 'Shortlist Pipeline',
    body: 'Advance candidates stage by stage: Shortlist → Send Assessment → Run Fairness Gate → Schedule Interview. Every step is audited.',
    placement: 'right',
  },
  {
    target: '[data-tour="recruiter-final-selection"]',
    title: 'Final Selection',
    body: 'Make Hire / Hold / Reject decisions here after interviews complete. Add personal feedback that candidates see in their explanation.',
    placement: 'right',
  },
  {
    target: '[data-tour="recruiter-question-bank"]',
    title: 'Question Bank',
    body: 'AI-generate questions by type and difficulty, or upload a PDF/DOCX of your own. Questions are drawn randomly for assessments.',
    placement: 'right',
  },
  {
    target: '[data-tour="recruiter-correspondence"]',
    title: 'Correspondence',
    body: 'Send templated or custom emails to candidates at any stage. Full audit log of every email sent.',
    placement: 'right',
  },
]

const ADMIN_TOUR: TourStep[] = [
  {
    target: '[data-tour="admin-dashboard"]',
    title: 'Admin Dashboard',
    body: 'Company-wide hiring metrics, pipeline funnel, and bias indicators at a glance.',
    placement: 'right',
  },
  {
    target: '[data-tour="admin-ai-validation"]',
    title: 'AI Validation Panel',
    body: 'Run the full AI pipeline live: fairness gate, SHAP scores, composite scoring, and narrative generation. Essential for compliance demos.',
    placement: 'right',
  },
  {
    target: '[data-tour="admin-candidates"]',
    title: 'All Candidates',
    body: 'View every candidate across all jobs in your company. Filter by stage, score, or role.',
    placement: 'right',
  },
  {
    target: '[data-tour="admin-livekit-test"]',
    title: 'LiveKit Smoke Test',
    body: 'Verify your video interview infrastructure is live: token issuance, room creation, and artifact endpoints.',
    placement: 'right',
  },
]

const SUPER_ADMIN_TOUR: TourStep[] = [
  { target: '[data-tour="super-platform"]', title: 'Platform', body: 'Global platform metrics and health across all companies.', placement: 'right' },
  { target: '[data-tour="super-users"]', title: 'Users', body: 'Manage all users in the system.', placement: 'right' },
  { target: '[data-tour="super-companies"]', title: 'Companies', body: 'Verify companies and review onboarding quality.', placement: 'right' },
  { target: '[data-tour="super-audit"]', title: 'Audit Log', body: 'Platform-wide immutable audit history.', placement: 'right' },
  { target: '[data-tour="super-bias"]', title: 'Bias Audit', body: 'Run and review fairness audits by job.', placement: 'right' },
  { target: '[data-tour="super-settings"]', title: 'Settings', body: 'Global maintenance and policy controls.', placement: 'right' },
]

const TOUR_KEY = 'airs_tour_done'

interface TourContextValue {
  active: boolean
  step: number
  steps: TourStep[]
  next: () => void
  prev: () => void
  skip: () => void
  restart: () => void
}

const TourContext = createContext<TourContextValue | null>(null)

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [steps, setSteps] = useState<TourStep[]>([])

  useEffect(() => {
    if (!user) return
    const key = `${TOUR_KEY}_${user._id}`
    if (localStorage.getItem(key)) return

    const roleSteps =
      user.role === 'candidate' ? CANDIDATE_TOUR :
      user.role === 'recruiter' ? RECRUITER_TOUR :
      user.role === 'super_admin' ? SUPER_ADMIN_TOUR :
      user.role === 'admin' ? ADMIN_TOUR : []

    if (roleSteps.length) {
      setSteps(roleSteps)
      setStep(0)
      // Short delay so layout renders first
      const t = setTimeout(() => setActive(true), 1200)
      return () => clearTimeout(t)
    }
  }, [user])

  const finish = useCallback(() => {
    if (!user) return
    localStorage.setItem(`${TOUR_KEY}_${user._id}`, '1')
    setActive(false)
  }, [user])

  const next = useCallback(() => {
    setStep((s) => {
      if (s >= steps.length - 1) { finish(); return s }
      return s + 1
    })
  }, [steps.length, finish])

  const prev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1))
  }, [])

  const skip = useCallback(() => finish(), [finish])

  const restart = useCallback(() => {
    if (!user) return
    localStorage.removeItem(`${TOUR_KEY}_${user._id}`)
    setStep(0)
    setActive(true)
  }, [user])

  return (
    <TourContext.Provider value={{ active, step, steps, next, prev, skip, restart }}>
      {children}
    </TourContext.Provider>
  )
}

export function useTour() {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used inside TourProvider')
  return ctx
}
