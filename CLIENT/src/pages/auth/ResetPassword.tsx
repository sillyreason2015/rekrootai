import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, ArrowLeft, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react'
import { authService } from '../../services/auth.service'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  otp: z.string().length(6, 'Code must be 6 digits').regex(/^\d+$/, 'Digits only'),
  password: z.string().min(8, 'At least 8 characters'),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] })
type FormData = z.infer<typeof schema>

export default function ResetPassword() {
  const navigate = useNavigate()
  const [showPw, setShowPw] = useState(false)
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState('')

  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async ({ email, otp, password }: FormData) => {
    setServerError('')
    try {
      await authService.resetPassword(email, otp, password)
      setDone(true)
      setTimeout(() => navigate('/login'), 3000)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setServerError(msg ?? 'Reset failed. The code may have expired.')
    }
  }

  return (
    <div className="auth-doodle-bg flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link to="/login" className="mb-8 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Link>

        {done ? (
          <div className="text-center space-y-4">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h1 className="font-serif text-2xl font-semibold">Password updated</h1>
            <p className="text-sm text-muted-foreground">Your password has been reset. Redirecting you to sign in…</p>
            <Link to="/login" className="text-sm text-primary hover:underline">Sign in now</Link>
          </div>
        ) : (
          <>
            <h1 className="font-serif text-3xl font-semibold">Set new password</h1>
            <p className="mt-1 text-sm text-muted-foreground">Enter the 6-digit code we sent to your email, then choose a new password.</p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label>Email address</Label>
                <Input type="email" placeholder="you@example.com" {...register('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Reset code</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit code"
                  maxLength={6}
                  {...register('otp')}
                />
                {errors.otp && <p className="text-xs text-destructive">{errors.otp.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>New password</Label>
                <div className="relative">
                  <Input
                    type={showPw ? 'text' : 'password'}
                    placeholder="Min. 8 characters"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Confirm password</Label>
                <Input type={showPw ? 'text' : 'password'} placeholder="Repeat password" {...register('confirm')} />
                {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
              </div>

              {serverError && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {serverError}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Update password
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              Need a new code?{' '}
              <Link to="/forgot-password" className="text-primary hover:underline">Resend reset code</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
