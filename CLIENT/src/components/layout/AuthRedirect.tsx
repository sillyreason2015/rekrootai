import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function AuthRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/" replace />
  const recruiterReady = Boolean(user.onboardingComplete || (user.role === 'recruiter' && user.companyName))
  if (!user.isVerified && user.role !== 'admin' && user.role !== 'super_admin') return <Navigate to="/check-email" replace />
  if (user.role === 'candidate') return <Navigate to={user.onboardingComplete ? '/candidate/dashboard' : '/onboarding'} replace />
  if (user.role === 'recruiter') return <Navigate to={recruiterReady ? '/recruiter/dashboard' : '/recruiter/onboarding'} replace />
  if (user.role === 'super_admin') return <Navigate to="/internal/super-admin/audit-log" replace />
  return <Navigate to="/admin/dashboard" replace />
}
