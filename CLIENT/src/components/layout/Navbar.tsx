import { Link, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, LogOut, Settings, User, CheckCheck, X, Moon, Sun, HelpCircle } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Popover from '@radix-ui/react-popover'
import { useAuth } from '../../contexts/AuthContext'
import { initials, cn } from '../../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationService, type Notification } from '../../services/notification.service'
import { formatDistanceToNow } from 'date-fns'
import { useTheme } from '../../contexts/ThemeContext'
import BrandMark from '../brand/BrandMark'

function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: notificationService.getMine,
    refetchInterval: 30_000,
  })
}

const typeIcon: Record<string, string> = {
  application_received: '📥',
  shortlisted: '⭐',
  assessment_sent: '📝',
  assessment_completed: '✅',
  assessment_result: '📊',
  assessment_failed: '⚠️',
  fairness_passed: '🛡️',
  fairness_rejected: '🚫',
  recruiter_feedback: '💬',
  interview_completed: '🎙️',
  interview_scored: '📈',
  decision_made: '🏆',
  offer_extended: '🎉',
}

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data } = useNotifications()
  const unreadCount = data?.unreadCount ?? 0
  const notifications = data?.notifications ?? []

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => notificationService.markRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const dismiss = useMutation({
    mutationFn: (id: string) => notificationService.dismiss(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const { mode, resolved, setMode, toggleResolved } = useTheme()

  const handleNotifClick = (n: Notification) => {
    if (!n.read) markRead.mutate([n._id])
    if (n.link) navigate(n.link)
  }

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="flex h-full items-center justify-between px-6">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2">
          <BrandMark withWordmark />
          <span className="hidden rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary sm:inline">
            Beta
          </span>
        </Link>

        {/* Right */}
        <div className="flex items-center gap-2">
          <button
            aria-label="Toggle theme"
            onClick={toggleResolved}
            className="rounded-full p-2 hover:bg-accent"
            title={`Theme: ${mode} (${resolved})`}
          >
            {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            aria-label="Use system theme"
            onClick={() => setMode(mode === 'system' ? (resolved === 'dark' ? 'dark' : 'light') : 'system')}
            className={cn('rounded-full px-2 py-1 text-xs', mode === 'system' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent')}
            title="Follow device theme"
          >
            Auto
          </button>
          {/* Notification Bell */}
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                aria-label="Notifications"
                className="relative rounded-full p-2 hover:bg-accent"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </Popover.Trigger>

            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={8}
                className="z-50 w-[min(92vw,34rem)] rounded-xl border bg-card shadow-xl"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <span className="text-sm font-semibold">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markRead.mutate(undefined)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="max-h-[32rem] overflow-y-auto divide-y">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n._id}
                        className={cn(
                          'group flex items-start gap-3 px-4 py-3 transition-colors',
                          n.link ? 'cursor-pointer hover:bg-accent' : '',
                          !n.read ? 'bg-primary/5' : '',
                        )}
                        onClick={() => handleNotifClick(n)}
                      >
                        <span className="mt-0.5 text-base">{typeIcon[n.type] ?? '🔔'}</span>
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-sm', !n.read ? 'font-medium' : '')}>{n.title}</p>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">{n.body}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); dismiss.mutate(n._id) }}
                          className="mt-0.5 hidden rounded p-0.5 hover:bg-accent group-hover:flex"
                        >
                          <X className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          {/* User Menu */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-accent">
                <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {user?.avatarPreviewUrl ? (
                    <img src={user.avatarPreviewUrl} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <>{user ? initials(user.firstName ?? '', user.lastName ?? '') : '?'}</>
                  )}
                </span>
                <span className="hidden text-sm sm:inline">
                  {user?.firstName} {user?.lastName}
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                className="z-50 min-w-48 rounded-lg border bg-card p-1 shadow-lg"
                sideOffset={6}
              >
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {user?.email}
                </div>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item asChild>
                  <Link
                    to="/settings"
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Settings className="h-4 w-4" /> Settings
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item asChild>
                  <Link
                    to="/settings"
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <User className="h-4 w-4" /> Profile
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item asChild>
                  <Link
                    to="/help"
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <HelpCircle className="h-4 w-4" /> Help & Docs
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                  onSelect={() => logout()}
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  )
}
