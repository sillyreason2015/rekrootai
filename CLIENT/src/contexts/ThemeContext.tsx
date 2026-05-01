import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type ThemeMode = 'system' | 'light' | 'dark'
type ThemeResolved = 'light' | 'dark'

type ThemeContextValue = {
  mode: ThemeMode
  resolved: ThemeResolved
  setMode: (mode: ThemeMode) => void
  toggleResolved: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): ThemeResolved {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const hasExplicitChoice = localStorage.getItem('theme_explicit_choice') === '1'
  const [mode, setMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('theme_mode')
    if (!hasExplicitChoice) return 'system'
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
    return 'system'
  })
  const [resolved, setResolved] = useState<ThemeResolved>(() => (mode === 'system' ? getSystemTheme() : mode))

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setResolved(mode === 'system' ? getSystemTheme() : mode)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [mode])

  useEffect(() => {
    localStorage.setItem('theme_mode', mode)
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    document.documentElement.dataset.themeMode = mode
  }, [mode, resolved])

  const setModeWithPersist = (next: ThemeMode) => {
    localStorage.setItem('theme_explicit_choice', '1')
    setMode(next)
  }

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    resolved,
    setMode: setModeWithPersist,
    toggleResolved: () => setModeWithPersist(resolved === 'dark' ? 'light' : 'dark'),
  }), [mode, resolved])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
