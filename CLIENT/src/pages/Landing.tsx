import { Link } from 'react-router-dom'
import { ArrowRight, Shield, Zap, BarChart3, Users, Brain, FileCheck, ChevronRight } from 'lucide-react'

const pipelineSteps = [
  { stage: 'CV Screen',     score: 82, color: 'text-emerald-400', bar: 82 },
  { stage: 'Assessment',    score: 74, color: 'text-blue-400',    bar: 74 },
  { stage: 'Fairness Gate', score: '✓ Pass', color: 'text-purple-400', bar: 100 },
  { stage: 'Interview',     score: 88, color: 'text-emerald-400', bar: 88 },
  { stage: 'Final Score',   score: '83.2%', color: 'text-white font-bold', bar: 83 },
]

const features = [
  {
    icon: Brain,
    title: 'AI-Scored Assessments',
    desc: 'Aptitude, technical, situational, and personality modules — scored by XGBoost, weighted by role requirements.',
  },
  {
    icon: Shield,
    title: 'Fairness Gate',
    desc: 'Every candidate passes through a bias-detection layer before interview decisions are made. Powered by Fairlearn.',
  },
  {
    icon: BarChart3,
    title: 'SHAP Explainability',
    desc: 'Every score comes with a feature-importance breakdown. Candidates see exactly why they were evaluated the way they were.',
  },
  {
    icon: Users,
    title: 'Human in the Loop',
    desc: 'Recruiters review AI scores, override decisions, add personal notes, and approve every offer before it is sent.',
  },
  {
    icon: FileCheck,
    title: 'Audit Trail',
    desc: 'Every action — shortlist, rejection, assessment send — is logged with actor, timestamp, and decision rationale.',
  },
  {
    icon: Zap,
    title: 'Structured Interviews',
    desc: 'AI-proctored video interviews with rubric scoring. Recruiters join live or review recordings with auto-generated notes.',
  },
]

const steps = [
  { n: '01', title: 'Post a role', desc: 'Define requirements, salary band, and assessment modules. The system builds the evaluation pipeline automatically.' },
  { n: '02', title: 'Candidates apply', desc: 'Applicants complete structured assessments — aptitude, technical, and situational — timed and proctored.' },
  { n: '03', title: 'AI evaluates', desc: 'XGBoost scores each candidate. The fairness gate checks for demographic bias before surfacing results.' },
  { n: '04', title: 'Recruiter decides', desc: 'You see ranked candidates with explainable AI scores. Override, shortlist, or reject — every action is logged.' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="font-serif text-xl font-bold text-white">RekrootAI</span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/60">Beta</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-white/60 md:flex">
            <Link to="/jobs" className="hover:text-white transition-colors">Browse Jobs</Link>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how" className="hover:text-white transition-colors">How it works</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="rounded-md px-3 py-1.5 text-sm text-white/70 hover:text-white transition-colors">Sign in</Link>
            <Link to="/register" className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-white/90 transition-colors">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/10">
        {/* Background grid */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,#ffffff18,transparent)]" />

        <div className="relative mx-auto grid max-w-6xl gap-16 px-6 py-24 lg:grid-cols-2 lg:py-32 lg:items-center">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Fair hiring infrastructure — dissertation project
            </div>
            <h1 className="font-serif text-5xl font-semibold leading-tight tracking-tight lg:text-6xl">
              Hiring decisions<br />
              <span className="text-white/40">that explain themselves.</span>
            </h1>
            <p className="max-w-md text-lg text-white/60 leading-relaxed">
              RekrootAI combines structured assessments, XGBoost scoring, demographic fairness gates, and SHAP explainability — so every hiring decision is auditable by design.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
              >
                Start hiring <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/jobs"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-5 py-2.5 text-sm text-white/70 hover:text-white hover:border-white/40 transition-colors"
              >
                Browse open roles
              </Link>
            </div>
            <div className="flex items-center gap-6 text-xs text-white/40">
              <span className="flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-white/40" />SHAP-backed scores</span>
              <span className="flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-white/40" />Fairlearn bias gate</span>
              <span className="flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-white/40" />Full audit log</span>
            </div>
          </div>

          {/* Pipeline visualisation */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 font-mono text-sm backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500/60" />
              <div className="h-3 w-3 rounded-full bg-amber-500/60" />
              <div className="h-3 w-3 rounded-full bg-emerald-500/60" />
              <span className="ml-2 text-xs text-white/30">rekroot · evaluation pipeline</span>
            </div>

            <div className="space-y-3">
              <p className="text-white/30 text-xs">{'// Candidate: Sarah Chen  |  Role: Senior Engineer'}</p>
              <div className="h-px bg-white/10" />
              {pipelineSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-white/40 text-xs">{step.stage}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all"
                      style={{ width: `${step.bar}%` }}
                    />
                  </div>
                  <span className={`text-xs w-16 text-right ${step.color}`}>{step.score}{typeof step.score === 'number' ? '%' : ''}</span>
                </div>
              ))}
              <div className="h-px bg-white/10" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/30">decision</span>
                <span className="rounded-full bg-emerald-500/20 px-3 py-0.5 text-emerald-400">SHORTLIST ✓</span>
              </div>
              <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 px-3 py-2.5 text-xs text-purple-300">
                <span className="text-purple-400 font-semibold">AI Summary: </span>
                Strong technical and assessment performance. Resume alignment above 80th percentile. No fairness flags detected.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-b border-white/10 bg-white/[0.02]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-white/10 px-6 py-8 md:grid-cols-4">
          {[
            { value: '4',        label: 'Assessment module types' },
            { value: 'SHAP',     label: 'Explainability engine' },
            { value: '3-mode',   label: 'AI oversight: Veto / Assist / Override' },
            { value: '100%',     label: 'Decisions auditable' },
          ].map(({ value, label }) => (
            <div key={label} className="px-6 py-2 text-center first:pl-0 last:pr-0">
              <p className="font-serif text-2xl font-bold text-white">{value}</p>
              <p className="mt-1 text-xs text-white/40">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-b border-white/10 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 max-w-xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">Features</p>
            <h2 className="font-serif text-3xl font-semibold">Everything the hiring pipeline needs.</h2>
            <p className="mt-3 text-white/50">From first application to final offer — every step is scored, audited, and explainable.</p>
          </div>
          <div className="grid gap-px border border-white/10 rounded-2xl overflow-hidden md:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="group bg-[#0a0a0a] p-6 hover:bg-white/[0.03] transition-colors">
                <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                  <Icon className="h-4 w-4 text-white/70" />
                </div>
                <h3 className="mb-2 font-medium text-white">{title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-b border-white/10 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 max-w-xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">How it works</p>
            <h2 className="font-serif text-3xl font-semibold">From posting to offer in four steps.</h2>
          </div>
          <div className="relative grid gap-8 md:grid-cols-4">
            {steps.map(({ n, title, desc }, i) => (
              <div key={n} className="relative">
                {i < steps.length - 1 && (
                  <div className="absolute right-0 top-4 hidden h-px w-full translate-x-1/2 bg-white/10 md:block" style={{ width: 'calc(100% - 2rem)' }} />
                )}
                <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/5 font-mono text-xs text-white/50">
                  {n}
                </div>
                <h3 className="mb-2 font-medium text-white">{title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="font-serif text-4xl font-semibold">Start hiring fairly, today.</h2>
          <p className="mx-auto mt-4 max-w-md text-white/50">
            Create your account, post a role, and let the AI pipeline handle the heavy lifting — with you in control of every decision.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-black hover:bg-white/90 transition-colors"
            >
              Create account <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              to="/jobs"
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-6 py-3 text-white/70 hover:text-white hover:border-white/40 transition-colors"
            >
              Explore open roles
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
          <span className="font-serif text-lg font-bold text-white/60">RekrootAI</span>
          <p className="text-xs text-white/30">
            Final Year Dissertation Project · Fair Hiring with Explainable AI
          </p>
        </div>
      </footer>
    </div>
  )
}
