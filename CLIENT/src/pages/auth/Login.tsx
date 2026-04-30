import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { MOCK_AUTH, useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { authService } from '../../services/auth.service'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type FormData = z.infer<typeof schema>

export default function Login() {
  const { login, refreshUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setError('')
    try {
      await login(data.email, data.password)
      const from = (location.state as { from?: string })?.from
      navigate(from ?? '/', { replace: true })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Invalid email or password')
    }
  }

  const quickLogin = async (email: string) => {
    setError('')
    try {
      await login(email, MOCK_AUTH.password)
      const from = (location.state as { from?: string })?.from
      navigate(from ?? '/', { replace: true })
    } catch {
      setError('Unable to use the mock session right now.')
    }
  }

  const oauthLogin = (provider: 'google' | 'microsoft') => {
    const url = provider === 'google' ? authService.oauthGoogleUrl() : authService.oauthMicrosoftUrl()
    window.location.href = url
  }

  useEffect(() => {
    const tokenFromQuery = new URLSearchParams(location.search).get('accessToken')
    if (!tokenFromQuery) return
    localStorage.setItem('accessToken', tokenFromQuery)
    void refreshUser().then(() => navigate('/', { replace: true }))
  }, [location.search, navigate, refreshUser])

  return (
    <div className="flex min-h-screen">
      {/* Left panel — branding */}
      <div className="hidden w-1/2 flex-col justify-between bg-primary p-12 lg:flex">
        <span className="font-serif text-2xl font-bold text-primary-foreground">RekrootAI</span>
        <div>
          <h1 className="font-serif text-4xl font-semibold leading-tight text-primary-foreground">
            Hire with clarity,<br />not guesswork.
          </h1>
          <p className="mt-4 text-primary-foreground/70">
            AI-powered recruitment that surfaces the best talent fairly and transparently.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/50">© {new Date().getFullYear()} Integra-Hire</p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="font-serif text-3xl font-semibold">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to your account to continue</p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input id="email" type="email" placeholder="you@example.com" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting} size="lg">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => oauthLogin('google')}>
              Google
            </Button>
            <Button type="button" variant="outline" onClick={() => oauthLogin('microsoft')}>
              Microsoft
            </Button>
          </div>

          <div className="mt-6 rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Mock login
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use these demo accounts to enter the app without a backend.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => quickLogin('candidate@rekroot.local')}
                className="rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <div className="font-medium">Candidate</div>
                <div className="text-xs text-muted-foreground">candidate@rekroot.local</div>
              </button>
              <button
                type="button"
                onClick={() => quickLogin('recruiter@rekroot.local')}
                className="rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <div className="font-medium">Recruiter</div>
                <div className="text-xs text-muted-foreground">recruiter@rekroot.local</div>
              </button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Password for both: <span className="font-medium text-foreground">demo1234</span>
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
