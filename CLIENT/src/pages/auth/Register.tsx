import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, Briefcase, User } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { cn } from '../../lib/utils'
import { authService } from '../../services/auth.service'

const schema = z.object({
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().min(2, 'Last name is required'),
  email: z.string().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/[0-9]/, 'Include a number'),
  role: z.enum(['candidate', 'recruiter']),
})
type FormData = z.infer<typeof schema>

function strengthLevel(pw: string) {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score
}

const strengthMeta: Record<number, { label: string; color: string }> = {
  0: { label: 'Too short', color: 'bg-muted' },
  1: { label: 'Weak', color: 'bg-destructive' },
  2: { label: 'Fair', color: 'bg-amber-400' },
  3: { label: 'Good', color: 'bg-emerald-400' },
  4: { label: 'Strong', color: 'bg-emerald-600' },
}

export default function Register() {
  const { register: authRegister, user } = useAuth()
  const navigate = useNavigate()
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [pw, setPw] = useState('')
  const strength = strengthLevel(pw)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'candidate' },
  })

  const role = watch('role')

  const onSubmit = async (data: FormData) => {
    setError('')
    try {
      await authRegister(data)
      const me = await authService.me()
      if (!me.isVerified) {
        navigate('/check-email', { replace: true })
        return
      }
      if (me.role === 'candidate') navigate(me.onboardingComplete ? '/candidate/dashboard' : '/onboarding', { replace: true })
      else navigate(me.onboardingComplete ? '/recruiter/dashboard' : '/recruiter/onboarding', { replace: true })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Registration failed. Try again.')
    }
  }

  useEffect(() => {
    if (user) navigate('/redirect', { replace: true })
  }, [user, navigate])

  return (
    <div className="auth-doodle-bg flex min-h-screen">
      {/* Left panel */}
      <div className="auth-brand-panel hidden w-1/2 flex-col justify-between bg-primary p-12 lg:flex">
        <span className="font-serif text-2xl font-bold text-primary-foreground">RekrootAI</span>
        <div>
          <h1 className="font-serif text-4xl font-semibold leading-tight text-primary-foreground">
            Your next great<br />hire starts here.
          </h1>
          <p className="mt-4 text-primary-foreground/70">
            Join thousands of companies and candidates using AI-assisted recruitment.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/50">© {new Date().getFullYear()} Integra-Hire</p>
      </div>

      {/* Right panel */}
      <div className="auth-split-right flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6">
            <h2 className="font-serif text-3xl font-semibold">Create account</h2>
            <p className="mt-1 text-sm text-muted-foreground">Get started in under 2 minutes</p>
          </div>

          {/* Role toggle */}
          <div className="mb-6 flex rounded-xl border bg-card p-1">
            {(['candidate', 'recruiter'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setValue('role', r)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors',
                  role === r
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r === 'candidate' ? <User className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
                {r === 'candidate' ? 'Job Seeker' : 'Recruiter'}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input placeholder="Ada" {...register('firstName')} />
                {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input placeholder="Lovelace" {...register('lastName')} />
                {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Email address</Label>
              <Input type="email" placeholder="you@example.com" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...register('password', { onChange: (e) => setPw(e.target.value) })}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Strength bar */}
              {pw.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={cn('h-1 flex-1 rounded-full transition-colors', i <= strength ? strengthMeta[strength].color : 'bg-muted')}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{strengthMeta[strength].label}</p>
                </div>
              )}
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting} size="lg">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
