import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import type { Role } from '../../types'

interface Props {
  allowedRoles?: Role[]
  requireOnboarding?: boolean
}

export default function ProtectedRoute({ allowedRoles, requireOnboarding = true }: Props) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (!user.isVerified && user.role !== 'admin') {
    return <Navigate to="/check-email" replace />
  }

  if (requireOnboarding && !user.onboardingComplete && user.role !== 'admin') {
    const dest = user.role === 'recruiter' ? '/recruiter/onboarding' : '/onboarding'
    return <Navigate to={dest} replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const dest = user.role === 'candidate' ? '/candidate/dashboard' : '/recruiter/dashboard'
    return <Navigate to={dest} replace />
  }

  return <Outlet />
}
