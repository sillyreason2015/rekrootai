import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Search, FileText, ClipboardList,
  Video, Users, Briefcase, MessageSquare,
  ShieldCheck, BarChart3, UserCog, CreditCard, BookOpen,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'

const candidateNav = [
  { to: '/candidate/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/candidate/jobs', label: 'Job Board', icon: Search },
  { to: '/candidate/applications', label: 'Applications', icon: FileText },
]

const recruiterNav = [
  { to: '/recruiter/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/recruiter/jobs', label: 'My Jobs', icon: Briefcase },
  { to: '/recruiter/shortlist', label: 'Shortlist', icon: Users },
  { to: '/recruiter/interviews', label: 'Interviews', icon: Video },
  { to: '/recruiter/question-bank', label: 'Question Bank', icon: BookOpen },
  { to: '/recruiter/correspondence', label: 'Correspondence', icon: MessageSquare },
]

const adminNav = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/audit-log', label: 'Audit Log', icon: ClipboardList },
  { to: '/admin/bias-audit', label: 'Bias Audit', icon: BarChart3 },
  { to: '/admin/team', label: 'Team', icon: UserCog },
  { to: '/admin/billing', label: 'Billing', icon: CreditCard },
  { to: '/admin/compliance', label: 'Compliance', icon: ShieldCheck },
]

export default function Sidebar() {
  const { user } = useAuth()
  const nav =
    user?.role === 'admin' ? adminNav : user?.role === 'recruiter' ? recruiterNav : candidateNav

  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-card md:flex md:flex-col">
      <nav className="flex flex-1 flex-col gap-1 p-3 pt-4">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
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
    </aside>
  )
}
