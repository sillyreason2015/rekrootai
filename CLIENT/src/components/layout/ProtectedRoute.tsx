import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import type { Role } from '../../types'

interface Props {
  allowedRoles?: Role[]
  requireOnboarding?: boolean
}

export default function ProtectedRoute({ allowedRoles, requireOnboarding = true }: Props) {
  const { user, loading } = useAuth()
  const onboardingComplete = Boolean(user?.onboardingComplete || (user?.role === 'recruiter' && user.companyName))

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (!user.isVerified && user.role !== 'admin' && user.role !== 'super_admin') {
    return <Navigate to="/check-email" replace />
  }

  if (requireOnboarding && !onboardingComplete && user.role !== 'admin' && user.role !== 'super_admin') {
    const dest = user.role === 'recruiter' ? '/recruiter/onboarding' : '/onboarding'
    return <Navigate to={dest} replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const dest =
      user.role === 'candidate'
        ? '/candidate/dashboard'
        : user.role === 'admin'
          ? '/admin/dashboard'
          : user.role === 'super_admin'
            ? '/internal/super-admin/audit-log'
          : '/recruiter/dashboard'
    return <Navigate to={dest} replace />
  }

  return <Outlet />
}
