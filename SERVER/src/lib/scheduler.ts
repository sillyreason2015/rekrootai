import { reconcileExpiredInterviews } from './interview-automation.js'
import { startInterviewAnalysisWorker, stopInterviewAnalysisWorker } from './interview-analysis-queue.js'

let interviewSweepTimer: NodeJS.Timeout | null = null

export function startSchedulers() {
  if (interviewSweepTimer) return

  const intervalMs = 60_000
  interviewSweepTimer = setInterval(() => {
    void reconcileExpiredInterviews().catch((err) => {
      console.error('[scheduler] interview reconciliation failed:', err)
    })
  }, intervalMs)

  if (typeof interviewSweepTimer.unref === 'function') interviewSweepTimer.unref()

  void reconcileExpiredInterviews().catch((err) => {
    console.error('[scheduler] initial interview reconciliation failed:', err)
  })
  startInterviewAnalysisWorker()
}

export function stopSchedulers() {
  if (interviewSweepTimer) {
    clearInterval(interviewSweepTimer)
    interviewSweepTimer = null
  }
  stopInterviewAnalysisWorker()
}
