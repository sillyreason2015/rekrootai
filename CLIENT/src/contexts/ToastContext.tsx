import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '../lib/utils'

type ToastVariant = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  title: string
  description?: string
  variant: ToastVariant
}

type ToastOptions = {
  title: string
  description?: string
  variant?: ToastVariant
}

type ToastContextValue = {
  toast: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const variantStyles: Record<ToastVariant, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-slate-200 bg-background text-foreground',
}

const variantIcons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
} satisfies Record<ToastVariant, typeof Info>

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const toast = useCallback(({ title, description, variant = 'info' }: ToastOptions) => {
    const id = ++idRef.current
    setToasts((current) => [...current, { id, title, description, variant }])
    window.setTimeout(() => dismiss(id), 3200)
  }, [dismiss])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,24rem)] flex-col gap-2">
        {toasts.map((item) => {
          const Icon = variantIcons[item.variant]
          return (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto rounded-xl border shadow-lg backdrop-blur-sm',
                variantStyles[item.variant],
              )}
            >
              <div className="flex items-start gap-3 p-4">
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{item.title}</p>
                  {item.description && <p className="mt-1 text-xs opacity-80">{item.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="rounded-md p-1 opacity-60 transition hover:bg-black/5 hover:opacity-100"
                  aria-label="Dismiss notification"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
