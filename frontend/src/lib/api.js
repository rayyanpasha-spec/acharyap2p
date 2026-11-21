// Single axios instance for the FastAPI backend. Adds the JWT, refreshes it once on 401.
import axios from 'axios'

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8010/api/v1').replace(/\/$/, '')
export const WS_BASE = (import.meta.env.VITE_WS_BASE_URL || API_BASE.replace(/^http/, 'ws').replace(/\/api\/v1$/, '')).replace(/\/$/, '')

const KEY = 'civiclens.auth'
export const tokenStore = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)) || null } catch { return null } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* ignore */ } },
  clear() { try { localStorage.removeItem(KEY) } catch { /* ignore */ } },
}

export const api = axios.create({ baseURL: API_BASE, timeout: 60000 })

api.interceptors.request.use((config) => {
  const t = tokenStore.get()
  if (t?.access_token) config.headers.Authorization = `Bearer ${t.access_token}`
  return config
})

let refreshing = null
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config
    const t = tokenStore.get()
    if (error.response?.status === 401 && t?.refresh_token && original && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true
      try {
        refreshing = refreshing || axios.post(`${API_BASE}/auth/refresh`, { refresh_token: t.refresh_token }).finally(() => { refreshing = null })
        const { data } = await refreshing
        tokenStore.set({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user })
        original.headers.Authorization = `Bearer ${data.access_token}`
        return api(original)
      } catch {
        tokenStore.clear()
        window.dispatchEvent(new Event('civiclens:logout'))
      }
    }
    return Promise.reject(error)
  },
)

/** Human readable message from an axios error (FastAPI returns {detail: string | [{msg}]}). */
export function errMsg(e, fallback = 'Something went wrong. Please try again.') {
  const d = e?.response?.data?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) return d.map((x) => x.msg).filter(Boolean).join('; ') || fallback
  if (e?.code === 'ECONNABORTED') return 'The request timed out. Please try again.'
  if (!e?.response) return 'Cannot reach the server. Check your connection and try again.'
  return fallback
}

/** Fetch a protected binary (image / PDF) as an object URL. Caller should URL.revokeObjectURL when done. */
export async function fetchBlobUrl(path) {
  const r = await api.get(path, { responseType: 'blob' })
  return URL.createObjectURL(r.data)
}
