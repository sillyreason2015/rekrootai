import { useEffect, useRef, useState, useCallback } from 'react'

interface Options {
  /** Whether monitoring is active (set true once the session actually starts) */
  enabled: boolean
  /** Max violations before onMaxViolations fires. Default 3 */
  maxViolations?: number
  /** Called each time a violation is detected, with the current count */
  onViolation?: (count: number) => void
  /** Called when violations reach maxViolations */
  onMaxViolations?: () => void
  /** Called with reason details whenever a violation is detected */
  onViolationReason?: (reason: string, count: number) => void
}

interface ProctoringState {
  violations: number
  lastViolationReason: string
  /** True while the warning banner should be visible */
  showWarning: boolean
  dismissWarning: () => void
}

export function useProctoringMonitor({
  enabled,
  maxViolations = 3,
  onViolation,
  onMaxViolations,
  onViolationReason,
}: Options): ProctoringState {
  const [violations, setViolations] = useState(0)
  const [lastViolationReason, setLastViolationReason] = useState('')
  const [showWarning, setShowWarning] = useState(false)
  const violationsRef = useRef(0)
  const onViolationRef = useRef(onViolation)
  const onMaxRef = useRef(onMaxViolations)
  const onViolationReasonRef = useRef(onViolationReason)
  const cooldownRef = useRef(0)
  onViolationRef.current = onViolation
  onMaxRef.current = onMaxViolations
  onViolationReasonRef.current = onViolationReason

  const recordViolation = useCallback((reason: string) => {
    const now = Date.now()
    if (now - cooldownRef.current < 1500) return
    cooldownRef.current = now
    violationsRef.current += 1
    const count = violationsRef.current
    setViolations(count)
    setLastViolationReason(reason)
    setShowWarning(true)
    onViolationRef.current?.(count)
    onViolationReasonRef.current?.(reason, count)
    if (count >= maxViolations) {
      onMaxRef.current?.()
    }
  }, [maxViolations])

  const dismissWarning = useCallback(() => setShowWarning(false), [])

  useEffect(() => {
    if (!enabled) {
      violationsRef.current = 0
      cooldownRef.current = 0
      setViolations(0)
      setLastViolationReason('')
      setShowWarning(false)
      return
    }

    // Tab visibility change (most reliable cross-browser signal)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        recordViolation('Tab switch detected')
      }
    }

    // Window blur — catches Alt+Tab, clicking outside browser, etc.
    const handleBlur = () => {
      // Only fire if the document itself is still visible (not a tab switch, which fires visibilitychange)
      if (document.visibilityState === 'visible') {
        recordViolation('Window focus lost')
      }
    }

    // Block right-click during proctored session
    const blockContextMenu = (e: MouseEvent) => e.preventDefault()

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('contextmenu', blockContextMenu)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('contextmenu', blockContextMenu)
    }
  }, [enabled, recordViolation])

  return { violations, lastViolationReason, showWarning, dismissWarning }
}
