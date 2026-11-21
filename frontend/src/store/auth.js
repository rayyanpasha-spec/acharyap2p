import { create } from 'zustand'
import { api, tokenStore } from '../lib/api'

const homeFor = (role) => (role === 'citizen' ? '/app' : role === 'worker' ? '/staff/worker' : '/staff')

export const useAuth = create((set, get) => ({
  user: tokenStore.get()?.user || null,
  ready: false,

  homePath: () => homeFor(get().user?.role),

  /** Validate the stored token on app start. */
  async init() {
    if (!tokenStore.get()?.access_token) return set({ ready: true, user: null })
    try {
      const { data } = await api.get('/users/me')
      set({ user: data, ready: true })
    } catch {
      tokenStore.clear()
      set({ user: null, ready: true })
    }
  },

  async login(email, password) {
    const { data } = await api.post('/auth/login', { email, password })
    tokenStore.set({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user })
    set({ user: data.user })
    return data.user
  },

  async register(payload) {
    const { data } = await api.post('/auth/register', payload)
    tokenStore.set({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user })
    set({ user: data.user })
    return data.user
  },

  setUser(user) {
    const t = tokenStore.get()
    if (t) tokenStore.set({ ...t, user })
    set({ user })
  },

  logout() {
    tokenStore.clear()
    set({ user: null })
  },
}))

if (typeof window !== 'undefined') {
  window.addEventListener('civiclens:logout', () => useAuth.setState({ user: null }))
}

export { homeFor }
