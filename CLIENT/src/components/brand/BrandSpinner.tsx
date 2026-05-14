import BrandMark from './BrandMark'
import { cn } from '../../lib/utils'

export default function BrandSpinner({ className, label = 'Loading...' }: { className?: string; label?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-12', className)}>
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 rounded-full border border-primary/20" />
        <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-primary border-r-primary/70 animate-spin" />
        <div className="absolute inset-[10px] flex items-center justify-center rounded-full bg-card shadow-[0_0_0_1px_rgba(255,255,255,0.05)]">
          <BrandMark className="gap-0" />
        </div>
      </div>
      <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
    </div>
  )
}
