import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function NotFound() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const home = user?.role === 'admin' ? '/admin/dashboard'
    : user?.role === 'recruiter' ? '/recruiter/dashboard'
    : user ? '/candidate/dashboard'
    : '/login'

  useEffect(() => {
    if (user) {
      const t = setTimeout(() => navigate(home, { replace: true }), 900)
      return () => clearTimeout(t)
    }
  }, [user, home, navigate])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <h1 className="font-serif text-8xl font-bold text-primary/20">404</h1>
      <h2 className="mt-2 font-serif text-2xl font-semibold">Page not found</h2>
      <p className="mt-2 text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p>
      <Link
        to={home}
        className="mt-8 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Go back home
      </Link>
    </div>
  )
}
