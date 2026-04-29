import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { Button } from '../../components/ui/button'

export default function CheckEmail() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="h-10 w-10 text-primary" />
        </div>
        <h1 className="font-serif text-3xl font-semibold">Check your email</h1>
        <p className="mt-3 text-muted-foreground">
          We've sent a verification link to your email address. Click the link to activate your
          account and get started.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Didn't receive it? Check your spam folder or{' '}
          <button className="text-primary hover:underline">resend the email</button>.
        </p>
        <div className="mt-8">
          <Button asChild variant="outline">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
