import axios from 'axios'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? 'https://rekroot-ai-bck.onrender.com' : '/api')

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

// attach access token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  const teamScope = localStorage.getItem('selectedTeamScope')
  if (teamScope) config.headers['X-Team-Scope'] = teamScope
  return config
})

// silent refresh on 401
let refreshing = false
type errConfig = {
  _retry?: boolean
  url?: string
  headers: Record<string, string>
}

type QueueItem = {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  original: errConfig
}

let queue: QueueItem[] = []

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = (err.config ?? {}) as errConfig
    const url = String(original.url ?? '')
    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/refresh') ||
      url.includes('/auth/forgot-password') ||
      url.includes('/auth/reset-password')

    if (err.response?.status !== 401 || original._retry || isAuthEndpoint) {
      return Promise.reject(err)
    }
    if (refreshing) {
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject, original })
      })
    }
    original._retry = true
    refreshing = true
    try {
      const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      const newToken: string = data.accessToken
      localStorage.setItem('accessToken', newToken)
      queue.forEach(({ resolve, original: queuedOriginal }) => {
        queuedOriginal.headers = queuedOriginal.headers ?? {}
        queuedOriginal.headers.Authorization = `Bearer ${newToken}`
        resolve(api(queuedOriginal))
      })
      queue = []
      original.headers = original.headers ?? {}
      original.headers.Authorization = `Bearer ${newToken}`
      return api(original)
    } catch (refreshError) {
      queue.forEach(({ reject }) => reject(refreshError))
      queue = []
      localStorage.removeItem('accessToken')
      window.location.href = '/login'
      return Promise.reject(err)
    } finally {
      refreshing = false
    }
  },
)

export default api
