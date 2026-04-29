import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../lib/axios'
import type { User } from '../types'

const MOCK_USERS: Record<string, User> = {
  'candidate@rekroot.local': {
    _id: 'mock-candidate',
    email: 'candidate@rekroot.local',
    role: 'candidate',
    firstName: 'Maya',
    lastName: 'Cole',
    isVerified: true,
    onboardingComplete: true,
    createdAt: new Date().toISOString(),
  },
  'recruiter@rekroot.local': {
    _id: 'mock-recruiter',
    email: 'recruiter@rekroot.local',
    role: 'recruiter',
    firstName: 'Noah',
    lastName: 'Grant',
    isVerified: true,
    onboardingComplete: true,
    createdAt: new Date().toISOString(),
  },
}

const MOCK_PASSWORD = 'demo1234'
const MOCK_TOKEN_PREFIX = 'mock-token:'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

interface RegisterPayload {
  firstName: string
  lastName: string
  email: string
  password: string
  role: 'candidate' | 'recruiter'
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const setMockSession = useCallback((mockUser: User) => {
    localStorage.setItem('accessToken', `${MOCK_TOKEN_PREFIX}${mockUser._id}`)
    localStorage.setItem('mockUser', JSON.stringify(mockUser))
    setUser(mockUser)
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken')
      if (token?.startsWith(MOCK_TOKEN_PREFIX)) {
        const stored = localStorage.getItem('mockUser')
        if (stored) {
          setUser(JSON.parse(stored) as User)
          return
        }
      }

      const { data } = await api.get<User>('/auth/me')
      setUser(data)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (token) {
      refreshUser().finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [refreshUser])

  const login = async (email: string, password: string) => {
    const mockUser = MOCK_USERS[email.toLowerCase()]
    if (mockUser && password === MOCK_PASSWORD) {
      setMockSession(mockUser)
      return
    }

    const { data } = await api.post<{ accessToken: string; user: User }>('/auth/login', {
      email,
      password,
    })
    localStorage.setItem('accessToken', data.accessToken)
    setUser(data.user)
  }

  const register = async (payload: RegisterPayload) => {
    const { data } = await api.post<{ accessToken: string; user: User }>('/auth/register', payload)
    localStorage.setItem('accessToken', data.accessToken)
    setUser(data.user)
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // best effort
    }
    localStorage.removeItem('accessToken')
    localStorage.removeItem('mockUser')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export const MOCK_AUTH = {
  password: MOCK_PASSWORD,
  users: MOCK_USERS,
}
