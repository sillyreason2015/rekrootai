import { useEffect, useState, useRef } from 'react'
import { useTour } from '../../contexts/TourContext'
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 8

export default function TourOverlay() {
  const { active, step, steps, next, prev, skip } = useTour()
  const [targetRect, setTargetRect] = useState<Rect | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const current = steps[step]

  useEffect(() => {
    if (!active || !current) { setTargetRect(null); setTooltipPos(null); return }

    const measure = () => {
      const el = document.querySelector(current.target)
      if (!el) { setTargetRect(null); setTooltipPos(null); return }

      const r = el.getBoundingClientRect()
      const rect: Rect = {
        top: r.top + window.scrollY,
        left: r.left + window.scrollX,
        width: r.width,
        height: r.height,
      }
      setTargetRect(rect)

      // Calculate tooltip position
      const TW = 280
      const TH = 160

      const placement = current.placement ?? 'bottom'
      let top = 0
      let left = 0

      if (placement === 'right') {
        top = rect.top + rect.height / 2 - TH / 2
        left = rect.left + rect.width + PAD + 12
      } else if (placement === 'left') {
        top = rect.top + rect.height / 2 - TH / 2
        left = rect.left - TW - PAD - 12
      } else if (placement === 'top') {
        top = rect.top - TH - PAD - 12
        left = rect.left + rect.width / 2 - TW / 2
      } else {
        top = rect.top + rect.height + PAD + 12
        left = rect.left + rect.width / 2 - TW / 2
      }

      // Clamp within viewport
      const vw = window.innerWidth
      left = Math.max(PAD, Math.min(left, vw - TW - PAD))
      top = Math.max(PAD, top)

      setTooltipPos({ top, left })

      // Scroll element into view
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    // Retry a couple times in case the DOM hasn't painted yet
    const t1 = setTimeout(measure, 50)
    const t2 = setTimeout(measure, 300)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [active, step, current])

  if (!active || !current) return null

  return (
    <>
      {/* Dark backdrop with cutout */}
      <div
        className="fixed inset-0 z-[9998]"
        style={{ background: 'rgba(0,0,0,0.55)' }}
        onClick={skip}
      />

      {/* Highlight cutout */}
      {targetRect && (
        <div
          className="fixed z-[9999] rounded-lg ring-2 ring-primary ring-offset-2 pointer-events-none"
          style={{
            top: targetRect.top - PAD,
            left: targetRect.left - PAD,
            width: targetRect.width + PAD * 2,
            height: targetRect.height + PAD * 2,
            background: 'transparent',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
          }}
        />
      )}

      {/* Tooltip card */}
      {tooltipPos && (
        <div
          ref={tooltipRef}
          className="fixed z-[10000] w-72 rounded-xl border bg-card shadow-2xl"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2 p-4 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-semibold">{current.title}</p>
            </div>
            <button onClick={skip} className="text-muted-foreground hover:text-foreground transition-colors -mt-0.5">
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
            {current.body}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {step + 1} / {steps.length}
            </span>
            <div className="flex gap-2">
              {step > 0 && (
                <button
                  onClick={prev}
                  className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                >
                  <ChevronLeft className="h-3 w-3" /> Back
                </button>
              )}
              <button
                onClick={next}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  step >= steps.length - 1
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                {step >= steps.length - 1 ? 'Done' : <>Next <ChevronRight className="h-3 w-3" /></>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
