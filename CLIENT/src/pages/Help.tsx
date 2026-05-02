import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Search, Brain, Shield, BarChart3, Users, FileCheck, HelpCircle } from 'lucide-react'
import { cn } from '../lib/utils'

interface FAQItem {
  q: string
  a: string
}

interface Section {
  id: string
  icon: React.ElementType
  title: string
  intro: string
  faqs: FAQItem[]
}

const sections: Section[] = [
  {
    id: 'scores',
    icon: Brain,
    title: 'How scores work',
    intro: 'Every candidate receives a composite score built from multiple weighted assessment stages.',
    faqs: [
      {
        q: 'What is the Final Score?',
        a: 'The Final Score is a weighted average across all completed pipeline stages: CV/resume match, assessment performance (aptitude, technical, situational), and interview score. Each stage weight is configured per role by the recruiter when the job is posted.',
      },
      {
        q: 'What does the CV Match score measure?',
        a: 'CV Match compares keywords, skills, years of experience, and role-relevant credentials in the uploaded resume against the job requirements. It uses TF-IDF similarity and skill-set overlap. A score above 70% means strong alignment.',
      },
      {
        q: 'How is the Assessment score calculated?',
        a: 'Candidates complete up to five module types: aptitude (numerical/verbal reasoning), technical (role-specific questions), situational judgement (scenario-based), personality, and values. All modules except values are scored and combined into a single assessment composite. The values module is unscored — responses are shared with the recruiter for qualitative review only and do not affect the candidate\'s ranking.',
      },
      {
        q: 'What is the Interview score?',
        a: 'Interviewers score each structured question on a rubric (0–5). The average rubric score is normalised to a percentage. Where AI proctoring is enabled, engagement signals (camera, audio presence) are factored in as a small modifier — they cannot reject a candidate on their own.',
      },
      {
        q: 'What threshold must a candidate pass to reach interview stage?',
        a: 'Progression criteria are configured per role by company admins and recruiters. Candidate-facing screens do not disclose raw threshold values unless the company explicitly enables threshold visibility in policy settings.',
      },
    ],
  },
  {
    id: 'fairness',
    icon: Shield,
    title: 'Fairness gate',
    intro: 'The fairness gate is a bias-detection layer that runs before any shortlist or rejection is confirmed.',
    faqs: [
      {
        q: 'What is the fairness gate?',
        a: 'Before a shortlist or rejection decision is finalised, the system checks whether demographic parity holds across protected groups (gender, ethnicity, age band). If a statistically significant disparity is detected, the decision is flagged for recruiter review rather than confirmed automatically.',
      },
      {
        q: 'What protected attributes are checked?',
        a: 'The system checks attributes declared as protected in the company settings. Common examples include gender, ethnicity, age band, and disability status. Candidates provide this data voluntarily and it is never used as a ranking input — only as a fairness check output.',
      },
      {
        q: 'What does "Fairness Pass" mean on a candidate card?',
        a: 'It means the AI ran a parity check and found no statistically significant disparity between this candidate\'s demographic group and the broader applicant pool at the same score band. The shortlist recommendation is cleared.',
      },
      {
        q: 'What happens if the fairness gate flags a decision?',
        a: 'The decision is held and the recruiter is notified. They can review the candidate manually, override with a written rationale, or escalate to the compliance admin. All flagged decisions are logged in the audit trail regardless of outcome.',
      },
      {
        q: 'Can the fairness gate be turned off?',
        a: 'Admins can configure the sensitivity threshold (how large a disparity triggers a flag) but the gate cannot be fully disabled. This is by design — the audit trail would record any attempt to bypass it.',
      },
    ],
  },
  {
    id: 'ai-modes',
    icon: Users,
    title: 'AI oversight modes',
    intro: 'Recruiters choose how much autonomy the AI has at the shortlist stage. The mode can be changed at any time.',
    faqs: [
      {
        q: 'What is Assist mode?',
        a: 'The AI shows ranked candidates with score breakdowns and a shortlist recommendation. The recruiter approves or rejects each candidate individually. Nothing happens automatically.',
      },
      {
        q: 'What is Veto mode?',
        a: 'The AI shortlists all candidates above the threshold automatically. The recruiter reviews the resulting shortlist and can veto (remove) any individual. Useful when the applicant pool is large.',
      },
      {
        q: 'What is Override mode?',
        a: 'Full manual control. AI scores are displayed as advisory information only. The recruiter makes every decision without AI prompting. All manual decisions are still logged.',
      },
      {
        q: 'Which mode should I use?',
        a: 'Assist is recommended for most roles — it keeps the human in every decision loop. Veto is useful for high-volume roles where you need to process 50+ applicants quickly. Override is appropriate for senior or niche roles where contextual judgement outweighs quantitative scoring.',
      },
    ],
  },
  {
    id: 'explainability',
    icon: BarChart3,
    title: 'Explainability & SHAP',
    intro: 'Every score has a breakdown showing which factors drove it up or down.',
    faqs: [
      {
        q: 'What is a SHAP explanation?',
        a: 'SHAP (SHapley Additive exPlanations) is a method from cooperative game theory that assigns each input feature a contribution value. For each candidate, it tells you exactly how much each factor (e.g. Python skill match, assessment speed, interview rubric) added to or subtracted from the final score.',
      },
      {
        q: 'Can candidates see their explanation?',
        a: 'Yes. Candidates have access to a Decision Explanation page that shows their score breakdown in plain language — without exposing other candidates\' data. They can see which stages they performed strongly in and which pulled the score down.',
      },
      {
        q: 'What does a negative SHAP value mean?',
        a: 'A negative SHAP value for a feature means that feature reduced the candidate\'s score relative to the baseline. For example, a low aptitude percentile might show a negative contribution. It does not mean the candidate failed that section — it means it pulled the composite score below what it would otherwise have been.',
      },
      {
        q: 'Why does the AI summary sometimes say "no fairness penalty"?',
        a: 'It means the fairness gate found no statistically significant demographic disparity for this candidate\'s group at this score band. Their score reflects purely performance-based factors.',
      },
    ],
  },
  {
    id: 'audit',
    icon: FileCheck,
    title: 'Audit trail',
    intro: 'Every action taken by any user or AI is recorded with a timestamp, actor, and rationale.',
    faqs: [
      {
        q: 'What is logged in the audit trail?',
        a: 'Shortlists, rejections, assessment sends, interview schedules, fairness gate runs, AI decision runs, manual overrides, recruiter notes, and any change to job or company settings. Logs are immutable — they cannot be edited or deleted.',
      },
      {
        q: 'Who can see the audit log?',
        a: 'Recruiters see their own job-level logs. Admins see all logs for the company. Super-admins see cross-company logs. Candidates can request a record of decisions affecting them in line with GDPR/NDPR subject access rights.',
      },
      {
        q: 'How long are logs retained?',
        a: 'Logs are retained for a minimum of 2 years by default. Company admins can extend this in billing/compliance settings. Deletion requests under right-to-erasure remove candidate PII but preserve the anonymised decision record for compliance.',
      },
    ],
  },
  {
    id: 'decisions',
    icon: HelpCircle,
    title: 'Decision states explained',
    intro: 'Each application moves through a pipeline of stages. Here is what each one means.',
    faqs: [
      {
        q: 'Applied',
        a: 'The candidate has submitted their application. No evaluation has started yet.',
      },
      {
        q: 'Screening',
        a: 'The recruiter has shortlisted the candidate for initial review. They may be sent an assessment.',
      },
      {
        q: 'Assessment',
        a: 'The candidate has been sent an assessment link and is expected to complete it. Scores are only available after submission.',
      },
      {
        q: 'Interview',
        a: 'The candidate passed the assessment threshold (or was manually advanced) and has been scheduled or invited for a structured video interview.',
      },
      {
        q: 'Decision',
        a: 'The pipeline is complete. The recruiter is reviewing the full candidate profile before making a final offer or rejection.',
      },
      {
        q: 'Rejected',
        a: 'The candidate has been removed from the pipeline. If a reason was recorded, it appears in the audit trail. Candidates receive an automated notification.',
      },
    ],
  },
]

function FAQAccordion({ faqs }: { faqs: FAQItem[] }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="divide-y rounded-xl border">
      {faqs.map((item, i) => (
        <div key={i}>
          <button
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium hover:bg-accent/50 transition-colors"
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span>{item.q}</span>
            {open === i ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
          </button>
          {open === i && (
            <div className="border-t bg-muted/30 px-5 py-4 text-sm leading-7 text-muted-foreground">
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function Help() {
  const [query, setQuery] = useState('')
  const [activeSection, setActiveSection] = useState<string | null>(null)

  const filtered = query.trim()
    ? sections.map((s) => ({
        ...s,
        faqs: s.faqs.filter(
          (f) =>
            f.q.toLowerCase().includes(query.toLowerCase()) ||
            f.a.toLowerCase().includes(query.toLowerCase()),
        ),
      })).filter((s) => s.faqs.length > 0)
    : activeSection
    ? sections.filter((s) => s.id === activeSection)
    : sections

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="font-serif text-3xl font-semibold">Help & Documentation</h1>
        <p className="text-muted-foreground">
          Understand how RekrootAI scores candidates, what each metric means, and how every decision is reached.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search questions…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveSection(null) }}
          className="h-10 w-full rounded-lg border bg-background pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Section nav */}
      {!query && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveSection(null)}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', activeSection === null ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent')}
          >
            All topics
          </button>
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id === activeSection ? null : s.id)}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', activeSection === s.id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent')}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}

      {/* Sections */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No results for "{query}".</p>
      ) : (
        filtered.map((section) => {
          const Icon = section.icon
          return (
            <div key={section.id} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-serif text-xl font-semibold">{section.title}</h2>
                  <p className="text-sm text-muted-foreground">{section.intro}</p>
                </div>
              </div>
              <FAQAccordion faqs={section.faqs} />
            </div>
          )
        })
      )}

      {/* Footer note */}
      <div className="rounded-xl border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
        Still have questions? Every score in the app has an{' '}
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold">i</span>{' '}
        tooltip with a quick explanation. You can also view the{' '}
        <Link to="/candidate/applications" className="text-primary underline underline-offset-2">
          Applications
        </Link>{' '}
        page for a full per-candidate breakdown.
      </div>
    </div>
  )
}

