import { Sparkles } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Props {
  label?: string
  className?: string
  size?: 'sm' | 'md'
}

export default function AiBadge({ label = 'AI', className, size = 'sm' }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 font-medium text-primary',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
        className,
      )}
    >
      <Sparkles className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {label}
    </span>
  )
}
