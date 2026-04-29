import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, ArrowLeft } from 'lucide-react'
import { authService } from '../../services/auth.service'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'

const schema = z.object({ email: z.string().email() })
type FormData = z.infer<typeof schema>

export default function ForgotPassword() {
  const [sent, setSent] = useState(false)
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async ({ email }: FormData) => {
    await authService.forgotPassword(email)
    setSent(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <Link to="/login" className="mb-8 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Link>
        <h1 className="font-serif text-3xl font-semibold">Reset password</h1>
        {sent ? (
          <p className="mt-4 text-muted-foreground">
            If that email is in our system you'll receive a reset link shortly.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">Enter your email and we'll send a reset link.</p>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label>Email address</Label>
                <Input type="email" placeholder="you@example.com" {...register('email')} />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
