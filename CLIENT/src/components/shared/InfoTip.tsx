import * as Tooltip from '@radix-ui/react-tooltip'
import { Info } from 'lucide-react'
import { cn } from '../../lib/utils'

interface InfoTipProps {
  content: string
  className?: string
  size?: 'sm' | 'md'
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export default function InfoTip({ content, className, size = 'sm', side = 'top' }: InfoTipProps) {
  return (
    <Tooltip.Root delayDuration={150}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
            className,
          )}
          aria-label="More information"
          onClick={(e) => e.stopPropagation()}
        >
          <Info className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          align="center"
          sideOffset={8}
          avoidCollisions
          collisionPadding={12}
          className={cn(
            'z-[99999] max-w-[280px] rounded-lg border bg-popover px-3 py-2.5 text-xs leading-relaxed text-popover-foreground shadow-xl',
            'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
        >
          {content}
          <Tooltip.Arrow className="fill-popover" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
