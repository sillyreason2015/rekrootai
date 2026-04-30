import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../lib/axios'
import type { User } from '../types'

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

  const refreshUser = useCallback(async () => {
    try {
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
    const { data } = await api.post<{ accessToken: string; user: User }>('/auth/login', { email, password })
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
