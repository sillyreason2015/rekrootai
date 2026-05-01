import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Search, FileText,
  Video, Users, Briefcase, MessageSquare,
  UserCog, CreditCard, BookOpen, Building2, ShieldCheck, BarChart3,
  Brain, Wifi, CheckSquare, RotateCcw, PlusCircle,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'
import { useTour } from '../../contexts/TourContext'

const candidateNav = [
  { to: '/candidate/dashboard', label: 'Dashboard', icon: LayoutDashboard, tour: 'candidate-dashboard' },
  { to: '/candidate/jobs', label: 'Job Board', icon: Search, tour: 'candidate-jobs' },
  { to: '/candidate/applications', label: 'Applications', icon: FileText, tour: 'candidate-applications' },
]

const recruiterNav = [
  { to: '/recruiter/dashboard', label: 'Dashboard', icon: LayoutDashboard, tour: 'recruiter-dashboard' },
  { to: '/recruiter/jobs', label: 'My Jobs', icon: Briefcase, tour: 'recruiter-jobs' },
  { to: '/recruiter/shortlist', label: 'Shortlist', icon: Users, tour: 'recruiter-shortlist' },
  { to: '/recruiter/final-selection', label: 'Final Selection', icon: CheckSquare, tour: 'recruiter-final-selection' },
  { to: '/recruiter/interviews', label: 'Interviews', icon: Video },
  { to: '/recruiter/question-bank', label: 'Question Bank', icon: BookOpen, tour: 'recruiter-question-bank' },
  { to: '/recruiter/correspondence', label: 'Correspondence', icon: MessageSquare, tour: 'recruiter-correspondence' },
  { to: '/recruiter/audit-log', label: 'Audit Log', icon: FileText },
  { to: '/settings', label: 'Settings', icon: UserCog },
]

const adminNav = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, tour: 'admin-dashboard' },
  { to: '/admin/jobs/create', label: 'Post a Job', icon: PlusCircle },
  { to: '/admin/candidates', label: 'Candidates', icon: Users, tour: 'admin-candidates' },
  { to: '/admin/team', label: 'Team', icon: UserCog },
  { to: '/admin/audit-log', label: 'Audit Log', icon: FileText },
  { to: '/admin/ai-validation', label: 'AI Validation', icon: Brain, tour: 'admin-ai-validation' },
  { to: '/admin/livekit-test', label: 'LiveKit Test', icon: Wifi, tour: 'admin-livekit-test' },
  { to: '/settings', label: 'Company', icon: Building2 },
  { to: '/admin/billing', label: 'Billing', icon: CreditCard },
]

const superAdminNav = [
  { to: '/internal/super-admin/dashboard', label: 'Platform', icon: LayoutDashboard },
  { to: '/internal/super-admin/users', label: 'Users', icon: Users },
  { to: '/internal/super-admin/companies', label: 'Companies', icon: Building2 },
  { to: '/internal/super-admin/audit-log', label: 'Audit Log', icon: FileText },
  { to: '/internal/super-admin/bias-audit', label: 'Bias Audit', icon: BarChart3 },
  { to: '/internal/super-admin/settings', label: 'Settings', icon: ShieldCheck },
]

export default function Sidebar() {
  const { user } = useAuth()
  const { restart } = useTour()
  const nav =
    user?.role === 'super_admin' ? superAdminNav :
    user?.role === 'admin' ? adminNav :
    user?.role === 'recruiter' ? recruiterNav : candidateNav

  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-card md:flex md:flex-col">
      <nav className="flex flex-1 flex-col gap-1 p-3 pt-4">
        {nav.map(({ to, label, icon: Icon, tour }: { to: string; label: string; icon: React.ElementType; tour?: string }) => (
          <NavLink
            key={to}
            to={to}
            data-tour={tour}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground/70 hover:bg-accent hover:text-foreground',
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Restart tour button */}
      <div className="border-t p-3">
        <button
          onClick={restart}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Replay tour
        </button>
      </div>
    </aside>
  )
}
