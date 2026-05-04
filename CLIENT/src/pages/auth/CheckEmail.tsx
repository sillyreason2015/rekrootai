import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MailCheck, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../lib/axios'
import { Button } from '../../components/ui/button'

const OTP_LENGTH = 6

export default function CheckEmail() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // If user is already verified, skip ahead
  useEffect(() => {
    if (user?.isVerified) {
      const dest =
        user.role === 'recruiter'
          ? '/recruiter/onboarding'
          : user.role === 'admin'
            ? '/admin/dashboard'
            : user.role === 'super_admin'
              ? '/internal/super-admin/audit-log'
              : '/onboarding'
      navigate(dest, { replace: true })
    }
  }, [user, navigate])

  // Countdown ticker for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setInterval(() => setResendCooldown((t) => Math.max(0, t - 1)), 1000)
    return () => clearInterval(id)
  }, [resendCooldown])

  const handleDigitChange = (index: number, value: string) => {
    // Allow paste of full OTP
    if (value.length > 1) {
      const cleaned = value.replace(/\D/g, '').slice(0, OTP_LENGTH)
      const next = Array(OTP_LENGTH).fill('')
      cleaned.split('').forEach((ch, i) => { next[i] = ch })
      setDigits(next)
      inputRefs.current[Math.min(cleaned.length, OTP_LENGTH - 1)]?.focus()
      return
    }
    if (value && !/^\d$/.test(value)) return
    const next = [...digits]
    next[index] = value
    setDigits(next)
    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const otp = digits.join('')

  const handleVerify = async () => {
    if (otp.length < OTP_LENGTH) return
    setError('')
    setVerifying(true)
    try {
      await api.post('/auth/verify-email', { otp })
      await refreshUser()
      // refreshUser will update user.isVerified → useEffect above handles redirect
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg === 'Invalid or expired code' ? 'That code is incorrect or has expired.' : (msg ?? 'Verification failed.'))
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } finally {
      setVerifying(false)
    }
  }

  const handleResend = async () => {
    setError('')
    setResending(true)
    try {
      await api.post('/auth/resend-verification')
      setResendCooldown(60)
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Could not resend. Please try again.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="auth-doodle-bg flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="h-10 w-10 text-primary" />
        </div>

        <h1 className="font-serif text-3xl font-semibold">Check your email</h1>
        <p className="mt-3 text-muted-foreground">
          We sent a 6-digit code to{' '}
          <span className="font-medium text-foreground">{user?.email ?? 'your email address'}</span>.
          Enter it below to verify your account.
        </p>

        {/* OTP boxes */}
        <div className="mt-8 flex justify-center gap-3">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el }}
              type="text"
              inputMode="numeric"
              maxLength={OTP_LENGTH}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onFocus={(e) => e.target.select()}
              className={`h-14 w-12 rounded-xl border-2 text-center text-xl font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                error ? 'border-destructive bg-destructive/5' : digit ? 'border-primary bg-primary/5' : 'border-input bg-background'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        <Button
          className="mt-6 w-full"
          size="lg"
          onClick={handleVerify}
          disabled={otp.length < OTP_LENGTH || verifying}
        >
          {verifying ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</>
          ) : (
            <><CheckCircle2 className="h-4 w-4" /> Verify email</>
          )}
        </Button>

        <p className="mt-6 text-sm text-muted-foreground">
          Didn't receive it? Check your spam folder or{' '}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
            className="font-medium text-primary hover:underline disabled:opacity-50"
          >
            {resending
              ? 'Sending…'
              : resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : 'resend the code'}
          </button>
          .
        </p>
      </div>
    </div>
  )
}
