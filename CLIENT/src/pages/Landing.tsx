import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Shield, Brain, BarChart3, Users, Sparkles, ChevronRight, Workflow, Moon, Sun } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

const rails = [
  { label: 'CV Match', value: '82%', width: '82%' },
  { label: 'Assessment', value: '74%', width: '74%' },
  { label: 'Fairness', value: 'Pass', width: '100%' },
  { label: 'Interview', value: '88%', width: '88%' },
]

const highlights = [
  { icon: Brain, title: 'Explainable scoring', text: 'XGBoost scoring with stage-by-stage rationale visible to both recruiter and candidate.' },
  { icon: Shield, title: 'Fairness by design', text: 'Protected attributes stay out of ranking, while the fairness gate checks downstream outcomes.' },
  { icon: Users, title: 'Human control', text: 'Assist, veto, and override modes keep recruiters accountable without hiding AI judgement.' },
  { icon: BarChart3, title: 'Full auditability', text: 'Every shortlist, rejection, interview score, and final decision is logged and reviewable.' },
]

const strips = [
  'Public job board',
  'Structured assessments',
  'Live interviews',
  'Candidate explanations',
  'Company governance',
  'Right-to-erasure ready',
]

export default function Landing() {
  const { resolved, mode, setMode, toggleResolved } = useTheme()
  const isDark = resolved === 'dark'
  const rotatingRoles = [
    'Senior Platform Engineer',
    'Graduate Product Designer',
    'Customer Success Lead',
    'Finance Operations Analyst',
    'DevOps Engineer',
    'Sales Development Representative',
  ]
  const [roleIndex, setRoleIndex] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setRoleIndex((prev) => (prev + 1) % rotatingRoles.length)
    }, 2200)
    return () => window.clearInterval(id)
  }, [rotatingRoles.length])

  return (
    <div className={`min-h-screen overflow-x-hidden ${isDark ? 'bg-[#120d0a] text-white' : 'bg-[#f7efe8] text-[#2d1a14]'}`}>
      <div className={`relative isolate overflow-hidden border-b ${isDark ? 'border-white/10' : 'border-[#d7c0af]'}`}>
        <div className="landing-orb left-[-8rem] top-[-5rem] h-64 w-64 bg-[#ff9b54]" />
        <div className="landing-orb right-[-4rem] top-24 h-72 w-72 bg-[#6f8cff]" />
        <div className="landing-orb bottom-[-6rem] left-1/3 h-80 w-80 bg-[#d97757]" />
        <div className="hero-grid absolute inset-0 opacity-40" />
        <div className={`absolute inset-0 ${isDark ? 'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.2),transparent_38%),linear-gradient(180deg,#120d0a_0%,#120d0a_54%,#f7efe8_54%,#f7efe8_100%)]' : 'bg-[radial-gradient(circle_at_top,rgba(139,58,30,0.08),transparent_42%),linear-gradient(180deg,#f7efe8_0%,#f7efe8_60%,#eedfd1_100%)]'}`} />

        <header className="relative z-10">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
            <div className="flex items-center gap-3">
              <span className="font-serif text-2xl font-semibold">RekrootAI</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.24em] ${isDark ? 'border border-white/15 bg-white/10 text-white/65' : 'border border-[#d7c0af] bg-white text-[#8b3a1e]'}`}>beta</span>
            </div>
            <nav className={`hidden items-center gap-6 text-sm md:flex ${isDark ? 'text-white/70' : 'text-[#6b4b3d]'}`}>
              <a href="#platform" className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-[#2d1a14]'}`}>Platform</a>
              <a href="#flow" className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-[#2d1a14]'}`}>Flow</a>
              <Link to="/jobs" className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-[#2d1a14]'}`}>Jobs</Link>
            </nav>
            <div className="flex items-center gap-2">
              <button onClick={toggleResolved} className={`rounded-full p-2 ${isDark ? 'border border-white/20 bg-white/10 text-white/85 hover:bg-white/20' : 'border border-[#d7c0af] bg-white text-[#8b3a1e] hover:bg-[#f8eee5]'}`}>
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setMode(mode === 'system' ? (isDark ? 'dark' : 'light') : 'system')}
                className={`rounded-full px-3 py-1 text-xs ${isDark ? (mode === 'system' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/75') : (mode === 'system' ? 'bg-[#f2dfcf] text-[#8b3a1e]' : 'bg-white text-[#8b3a1e]')}`}
              >
                Auto
              </button>
              <Link to="/login" className={`rounded-full px-4 py-2 text-sm transition-colors ${isDark ? 'text-white/75 hover:bg-white/10 hover:text-white' : 'text-[#6b4b3d] hover:bg-white hover:text-[#2d1a14]'}`}>Sign in</Link>
              <Link to="/register" className="pulse-border rounded-full bg-[#f4e4d4] px-4 py-2 text-sm font-medium text-[#37180d] transition-transform hover:scale-[1.02]">Get started</Link>
            </div>
          </div>
        </header>

        <section className="relative z-10 mx-auto grid max-w-7xl gap-14 px-6 pb-20 pt-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:pb-28">
          <div className={`space-y-8 fade-rise rounded-3xl p-5 backdrop-blur-[2px] md:p-7 ${isDark ? 'bg-[#120d0a]/90' : 'bg-white/75'}`}>
            <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs uppercase tracking-[0.18em] ${isDark ? 'border border-white/15 bg-white/10 text-white/70' : 'border border-[#d7c0af] bg-white text-[#7b5343]'}`}>
              <Workflow className="h-3.5 w-3.5" />
              Explainable hiring operating system
            </div>
            <div className="space-y-5">
              <h1 className={`max-w-3xl font-serif text-5xl leading-[0.94] text-balance md:text-6xl lg:text-7xl ${isDark ? 'font-bold text-white' : 'font-semibold text-[#2d1a14]'} hero-float-in`}>
                Recruit with an AI pipeline that shows its work.
              </h1>
              <p className={`max-w-2xl text-lg leading-8 md:text-xl ${isDark ? 'text-white/90' : 'text-[#5f463c]'} hero-float-in`} style={{ animationDelay: '0.12s' }}>
                Public hiring pages, structured assessments, fairness checks, live interviews, and candidate-facing explanations all in one system that feels decisive instead of mysterious.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/jobs" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-[#2f160d] transition-transform hover:scale-[1.02]">
                Explore open roles <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/register" className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-colors ${isDark ? 'border border-white/15 bg-white/10 text-white/80 hover:bg-white/15 hover:text-white' : 'border-2 border-[#8b3a1e] bg-[#f8eee5] text-[#8b3a1e] hover:bg-white'}`}>
                Create recruiter workspace
              </Link>
            </div>
            <div className={`flex flex-wrap gap-2 text-xs ${isDark ? 'text-white/65' : 'text-[#7a5a4b]'}`}>
              {strips.map((item) => (
                <span key={item} className={`rounded-full px-3 py-1.5 ${isDark ? 'border border-white/10 bg-white/5' : 'border border-[#dcc7b9] bg-white/80'}`}>
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="relative fade-rise" style={{ animationDelay: '0.15s' }}>
            <div className={`glass-panel drift-card rounded-[28px] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] ${isDark ? 'border border-white/12' : 'border border-[#d7c0af] bg-white/90'}`}>
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-white/45' : 'text-[#8b6a5b]'}`}>Live candidate view</p>
                  <p className={`mt-1 font-serif text-2xl ${isDark ? 'text-white' : 'text-[#2d1a14]'}`}>{rotatingRoles[roleIndex]}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs ${isDark ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>Shortlist recommended</span>
              </div>
              <div className={`space-y-4 rounded-[22px] p-5 ${isDark ? 'border border-white/10 bg-[#160f0b]/80' : 'border border-[#dcc7b9] bg-[#fffaf5]'}`}>
                {rails.map((rail) => (
                  <div key={rail.label} className="space-y-1.5">
                    <div className={`flex items-center justify-between text-xs ${isDark ? 'text-white/60' : 'text-[#6b4b3d]'}`}>
                      <span>{rail.label}</span>
                      <span>{rail.value}</span>
                    </div>
                    <div className={`h-2 overflow-hidden rounded-full ${isDark ? 'bg-white/10' : 'bg-[#ead8ca]'}`}>
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#f6e0c9_0%,#d26a3d_45%,#8b3a1e_100%)]"
                        style={{ width: rail.width }}
                      />
                    </div>
                  </div>
                ))}
                <div className={`rounded-2xl p-4 ${isDark ? 'border border-[#f5d7c3]/15 bg-[#f5d7c3]/8' : 'border border-[#e4cdbc] bg-[#f8eee5]'}`}>
                  <div className={`mb-2 flex items-center gap-2 text-sm ${isDark ? 'text-[#f7d1b7]' : 'text-[#8b3a1e]'}`}>
                    <Sparkles className="h-4 w-4" />
                    AI summary
                  </div>
                  <p className={`text-sm leading-6 ${isDark ? 'text-white/78' : 'text-[#5a3f34]'}`}>
                    Strong resume alignment, solid technical signal, and no fairness penalty. Interview next because the assessment already clears the threshold comfortably.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section id="platform" className={`${isDark ? 'bg-[#1a110d] text-[#f5e8dd]' : 'bg-[#f7efe8] text-[#2d1a14]'} py-20`}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-10 flex items-end justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.18em] text-[#8b3a1e]/70">Platform</p>
              <h2 className="mt-3 font-serif text-4xl font-semibold leading-tight">Designed to feel like one continuous hiring system.</h2>
            </div>
            <Link to="/jobs" className="hidden items-center gap-2 text-sm text-[#8b3a1e] md:inline-flex">
              Browse public roles <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {highlights.map(({ icon: Icon, title, text }, index) => (
              <div
                key={title}
                className="fade-rise rounded-[24px] border border-[#d7c0af] bg-white p-6 shadow-[0_18px_50px_rgba(86,42,24,0.08)]"
                style={{ animationDelay: `${0.08 * index}s` }}
              >
                <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f5e2d3] text-[#8b3a1e]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-serif text-2xl font-semibold text-[#2d1a14]">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-[#6d554b]">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="flow" className={`${isDark ? 'bg-[#221610] text-[#f5e8dd]' : 'bg-[#f1e4d8] text-[#2d1a14]'} py-20`}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-[28px] bg-[#2a1610] p-8 text-white">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">Flow</p>
              <h3 className="mt-4 font-serif text-3xl font-semibold">Public entry, governed core.</h3>
              <p className="mt-4 text-sm leading-7 text-white/70">
                Candidates discover roles publicly, but once they apply the system keeps every stage traceable: screening, assessment, fairness, interview, decision.
              </p>
            </div>
            <div className="rounded-[28px] border border-[#d7c0af] bg-white p-8 lg:col-span-2">
              <div className="grid gap-6 md:grid-cols-4">
                {[
                  ['01', 'Discover role', 'Public board with structured job pages and sign-up gate on apply.'],
                  ['02', 'Complete evaluation', 'Candidates move only when each stage has actually been completed.'],
                  ['03', 'Review with AI', 'Recruiters see recommendations, fairness state, and explanations inline.'],
                  ['04', 'Audit every action', 'Decisions, notes, messages, and outcomes stay visible after the fact.'],
                ].map(([num, title, text]) => (
                  <div key={num} className="space-y-3">
                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f4e0d1] text-sm font-medium text-[#8b3a1e]">{num}</div>
                    <h4 className="font-serif text-xl font-semibold text-[#2d1a14]">{title}</h4>
                    <p className="text-sm leading-6 text-[#6d554b]">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className={`${isDark ? 'bg-[#130d09] text-[#d8c4b6] border-t border-white/10' : 'bg-[#ead8ca] text-[#5f463c] border-t border-[#d7c0af]'} py-10`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 text-sm">
          <p>RekrootAI - Explainable hiring for every company.</p>
          <div className="flex items-center gap-4">
            <Link to="/jobs" className="hover:underline">Jobs</Link>
            <Link to="/help" className="hover:underline">Help & Docs</Link>
            <Link to="/login" className="hover:underline">Sign in</Link>
            <Link to="/register" className="hover:underline">Create workspace</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
