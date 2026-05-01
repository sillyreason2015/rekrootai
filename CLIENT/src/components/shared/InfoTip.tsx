import * as Tooltip from '@radix-ui/react-tooltip'
import { Info } from 'lucide-react'
import { cn } from '../../lib/utils'

interface InfoTipProps {
  content: string
  className?: string
  size?: 'sm' | 'md'
}

export default function InfoTip({ content, className, size = 'sm' }: InfoTipProps) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none',
              size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
              className,
            )}
            aria-label="More information"
          >
            <Info className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="center"
            sideOffset={6}
            className="z-50 max-w-xs rounded-lg border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-md"
          >
            {content}
            <Tooltip.Arrow className="fill-popover" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
