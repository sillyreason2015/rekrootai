/**
 * AiSuggestion — contextual AI recommendation card for a candidate at a given stage.
 *
 * Generates a suggestion locally from the application data (scores, stage, fairness)
 * so it works without an extra network call and is instant.
 */
import { Sparkles, TrendingUp, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ScoreSet {
  resume?: number
  assessment?: number
  interview?: number
  penalty?: number
  final?: number
}

interface AiSuggestionProps {
  stage: string
  scores?: ScoreSet
  fairnessComputedAt?: string
  decision?: string
  assessmentStatus?: string
  className?: string
}

interface Suggestion {
  icon: React.ElementType
  label: string
  text: string
  color: string
}

function buildSuggestion(props: AiSuggestionProps): Suggestion {
  const { stage, scores, fairnessComputedAt, decision, assessmentStatus } = props
  const final = scores?.final ?? 0
  const resume = scores?.resume ?? 0
  const assessment = scores?.assessment ?? 0

  if (decision) {
    if (decision === 'hire') return {
      icon: CheckCircle2, label: 'Hired', color: 'text-emerald-600',
      text: 'This candidate has been selected. Consider sending an offer letter via Correspondence.',
    }
    if (decision === 'reject') return {
      icon: AlertTriangle, label: 'Not Selected', color: 'text-red-500',
      text: 'Candidate was not progressed. Ensure a feedback note is added so they receive a meaningful explanation.',
    }
    return {
      icon: Clock, label: 'On Hold', color: 'text-amber-600',
      text: 'Candidate is on hold. Revisit within 2 weeks or they may accept another offer.',
    }
  }

  if (stage === 'applied') {
    if (resume >= 70) return {
      icon: TrendingUp, label: 'Strong CV match', color: 'text-emerald-600',
      text: `CV score of ${resume.toFixed(0)}% is above threshold. Recommend shortlisting to proceed to screening.`,
    }
    if (resume >= 50) return {
      icon: Sparkles, label: 'Review recommended', color: 'text-amber-600',
      text: `CV score of ${resume.toFixed(0)}% is borderline. Review manually before shortlisting.`,
    }
    return {
      icon: AlertTriangle, label: 'Low CV match', color: 'text-red-500',
      text: `CV score of ${resume.toFixed(0)}% is below 50%. Consider rejecting unless the role is hard to fill.`,
    }
  }

  if (stage === 'screening') {
    if (assessmentStatus === 'completed') return {
      icon: CheckCircle2, label: 'Assessment completed', color: 'text-emerald-600',
      text: `Assessment finished. Advance to interview to continue the evaluation.`,
    }
    if (assessmentStatus === 'in_progress') return {
      icon: Clock, label: 'Assessment in progress', color: 'text-blue-600',
      text: 'The candidate is currently working through their assessment modules.',
    }
    if (assessmentStatus === 'expired') return {
      icon: AlertTriangle, label: 'Assessment expired', color: 'text-red-500',
      text: 'The assessment window closed before the candidate completed it. Consider resending or rejecting.',
    }
    if (assessmentStatus === 'pending') return {
      icon: Clock, label: 'Assessment sent', color: 'text-blue-600',
      text: 'Assessment has been sent. Waiting for the candidate to begin.',
    }
    return {
      icon: Sparkles, label: 'Awaiting assessment', color: 'text-blue-600',
      text: 'Send the assessment to evaluate technical and situational competencies before making a shortlist decision.',
    }
  }

  if (stage === 'assessment') {
    if (fairnessComputedAt) return {
      icon: CheckCircle2, label: 'Fairness gate passed', color: 'text-emerald-600',
      text: `Assessment score: ${assessment.toFixed(0)}%. Fairness gate already run. Schedule an interview to progress.`,
    }
    if (assessment >= 65) return {
      icon: TrendingUp, label: 'Good assessment score', color: 'text-emerald-600',
      text: `Assessment score of ${assessment.toFixed(0)}%. Run the fairness gate to validate and progress to interview.`,
    }
    return {
      icon: AlertTriangle, label: 'Below average', color: 'text-amber-600',
      text: `Assessment score of ${assessment.toFixed(0)}% is below 65%. Run fairness gate — a low score may still pass with demographic correction.`,
    }
  }

  if (stage === 'interview') return {
    icon: Sparkles, label: 'Interview stage', color: 'text-purple-600',
    text: 'Schedule or join the live interview. Use the evaluation rubric to score communication, technical skills, and culture fit.',
  }

  if (stage === 'decision') {
    if (final >= 75) return {
      icon: TrendingUp, label: 'Top candidate', color: 'text-emerald-600',
      text: `Composite score of ${final.toFixed(0)}% — strong performer across all dimensions. Recommend hiring.`,
    }
    if (final >= 55) return {
      icon: Sparkles, label: 'Solid candidate', color: 'text-blue-600',
      text: `Composite score of ${final.toFixed(0)}%. Meets baseline requirements. Consider role urgency when deciding.`,
    }
    return {
      icon: AlertTriangle, label: 'Marginal score', color: 'text-amber-600',
      text: `Composite score of ${final.toFixed(0)}% is below 55%. Use your judgement — consider holding until stronger candidates are evaluated.`,
    }
  }

  return {
    icon: Sparkles, label: 'AI Insight', color: 'text-muted-foreground',
    text: 'No specific recommendation at this stage.',
  }
}

export default function AiSuggestion({ stage, scores, fairnessComputedAt, decision, assessmentStatus, className }: AiSuggestionProps) {
  const s = buildSuggestion({ stage, scores, fairnessComputedAt, decision, assessmentStatus })
  const Icon = s.icon

  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5', className)}>
      <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', s.color)} />
      <div className="min-w-0">
        <p className={cn('text-[11px] font-semibold uppercase tracking-wide', s.color)}>{s.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{s.text}</p>
      </div>
    </div>
  )
}
