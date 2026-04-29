import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(date),
  )
}

export function formatRelative(date: string | Date) {
  const diff = Date.now() - new Date(date).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return formatDate(date)
}

export function scoreColor(score: number) {
  if (score >= 75) return 'text-emerald-600'
  if (score >= 50) return 'text-amber-600'
  return 'text-red-600'
}

export function scoreBg(score: number) {
  if (score >= 75) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (score >= 50) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

export function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
}
