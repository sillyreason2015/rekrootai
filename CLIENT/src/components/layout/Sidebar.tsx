import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Search, FileText,
  Video, Users, Briefcase, MessageSquare,
  UserCog, CreditCard, BookOpen, Building2, ShieldCheck, BarChart3,
  Brain, Wifi, CheckSquare, RotateCcw, PlusCircle, HelpCircle, ClipboardList,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'
import { useTour } from '../../contexts/TourContext'
import { applicationService } from '../../services/application.service'
import type { Application } from '../../types'

const candidateNav = [
  { to: '/candidate/dashboard', label: 'Dashboard', icon: LayoutDashboard, tour: 'candidate-dashboard' },
  { to: '/candidate/jobs', label: 'Job Board', icon: Search, tour: 'candidate-jobs' },
  { to: '/candidate/applications', label: 'Applications', icon: FileText, tour: 'candidate-applications' },
  { to: '/settings', label: 'My Profile', icon: UserCog },
  { to: '/help', label: 'Help & Docs', icon: HelpCircle },
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
  { to: '/help', label: 'Help & Docs', icon: HelpCircle },
]

const adminNav = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, tour: 'admin-dashboard' },
  { to: '/admin/jobs', label: 'Manage Jobs', icon: Briefcase },
  { to: '/admin/jobs/create', label: 'Post a Job', icon: PlusCircle },
  { to: '/admin/candidates', label: 'Candidates', icon: Users, tour: 'admin-candidates' },
  { to: '/admin/team', label: 'Team', icon: UserCog },
  { to: '/admin/audit-log', label: 'Audit Log', icon: FileText },
  { to: '/admin/bias-audit', label: 'Bias Audit', icon: BarChart3 },
  { to: '/admin/ai-validation', label: 'AI Validation', icon: Brain, tour: 'admin-ai-validation' },
  { to: '/admin/livekit-test', label: 'LiveKit Test', icon: Wifi, tour: 'admin-livekit-test' },
  { to: '/admin/company-settings', label: 'Company', icon: Building2 },
  { to: '/admin/billing', label: 'Billing', icon: CreditCard },
  { to: '/settings', label: 'My Profile', icon: UserCog },
  { to: '/help', label: 'Help & Docs', icon: HelpCircle },
]

const superAdminNav = [
  { to: '/internal/super-admin/dashboard', label: 'Platform', icon: LayoutDashboard, tour: 'super-platform' },
  { to: '/internal/super-admin/users', label: 'Users', icon: Users, tour: 'super-users' },
  { to: '/internal/super-admin/companies', label: 'Companies', icon: Building2, tour: 'super-companies' },
  { to: '/internal/super-admin/audit-log', label: 'Audit Log', icon: FileText, tour: 'super-audit' },
  { to: '/internal/super-admin/settings', label: 'Settings', icon: ShieldCheck, tour: 'super-settings' },
]

type NavItem = { to: string; label: string; icon: React.ElementType; tour?: string }
type NavGroup = { title: string; items: NavItem[] }

export default function Sidebar() {
  const { user } = useAuth()
  const { restart } = useTour()

  // For candidates: fetch their applications to find any active assessment
  const { data: myApps } = useQuery<Application[]>({
    queryKey: ['my-applications'],
    queryFn: applicationService.myApplications,
    enabled: user?.role === 'candidate',
    staleTime: 30_000,
  })
  const activeAssessmentApp = myApps?.find(
    (a) =>
      a.stage === 'assessment' &&
      (a.assessmentStatus === 'pending' || a.assessmentStatus === 'in_progress') &&
      a.assessmentExpiresAt &&
      new Date(a.assessmentExpiresAt) > new Date(),
  )

  const navBase =
    user?.role === 'super_admin' ? superAdminNav :
    user?.role === 'admin' ? adminNav :
    user?.role === 'recruiter' ? recruiterNav : candidateNav
  const nav = navBase.filter((item) => {
    if (item.to === '/admin/jobs/create') return Boolean((user?.permissions?.canCreateJobs) ?? (user?.role === 'admin' || user?.role === 'super_admin'))
    if (item.to === '/admin/team') return Boolean((user?.permissions?.canManageTeam) ?? (user?.role === 'admin' || user?.role === 'super_admin'))
    if (item.to === '/admin/billing') return Boolean((user?.permissions?.canManageBilling) ?? (user?.role === 'admin' || user?.role === 'super_admin'))
    return true
  })
  const navGroups: NavGroup[] =
    user?.role === 'admin'
      ? [
          { title: 'Workspace', items: nav.filter((item) => ['/admin/dashboard', '/admin/jobs', '/admin/jobs/create', '/admin/candidates'].includes(item.to)) },
          { title: 'Operations', items: nav.filter((item) => ['/admin/team', '/admin/audit-log', '/admin/bias-audit', '/admin/ai-validation', '/admin/livekit-test', '/admin/company-settings', '/admin/billing'].includes(item.to)) },
          { title: 'Support', items: nav.filter((item) => ['/settings', '/help'].includes(item.to)) },
        ]
      : user?.role === 'recruiter'
        ? [
            { title: 'Hiring Workspace', items: nav.filter((item) => ['/recruiter/dashboard', '/recruiter/jobs', '/recruiter/shortlist', '/recruiter/final-selection', '/recruiter/interviews'].includes(item.to)) },
            { title: 'Tools', items: nav.filter((item) => ['/recruiter/question-bank', '/recruiter/correspondence', '/recruiter/audit-log'].includes(item.to)) },
            { title: 'Support', items: nav.filter((item) => ['/settings', '/help'].includes(item.to)) },
          ]
        : user?.role === 'super_admin'
          ? [{ title: 'Platform', items: nav }]
          : [{ title: 'Workspace', items: nav }]

  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-card md:flex md:flex-col">
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3 pt-4">
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-1">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {group.title}
            </p>
            {group.items.map(({ to, label, icon: Icon, tour }) => (
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
            {/* Active assessment entry — injected into the candidate Workspace group only */}
            {group.title === 'Workspace' && activeAssessmentApp && (
              <NavLink
                to={`/candidate/assessment/${activeAssessmentApp._id}`}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-amber-600 hover:bg-amber-50 hover:text-amber-700',
                  )
                }
              >
                <div className="relative">
                  <ClipboardList className="h-4 w-4" />
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                </div>
                Assessment
              </NavLink>
            )}
          </div>
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
