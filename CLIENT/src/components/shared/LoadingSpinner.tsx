import { cn } from '../../lib/utils'

export default function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-full items-center justify-center py-12', className)}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}
