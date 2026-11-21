import { create } from 'zustand'
import { api } from '../lib/api'

/** Taxonomy / map defaults from GET /meta/taxonomy, loaded once. Components use `useMeta(s => s.meta)`. */
export const useMeta = create((set, get) => ({
  meta: null,
  loading: false,
  error: null,
  async load() {
    if (get().meta || get().loading) return
    set({ loading: true, error: null })
    try {
      const { data } = await api.get('/meta/taxonomy')
      set({ meta: data, loading: false })
    } catch (e) {
      set({ error: e, loading: false })
    }
  },
  categoryName(code) {
    return get().meta?.categories.find((c) => c.code === code)?.name || code
  },
  subcategoryName(cat, sub) {
    const c = get().meta?.categories.find((x) => x.code === cat)
    return c?.subcategories.find((s) => s.code === sub)?.name || sub
  },
  departmentName(code) {
    return get().meta?.departments.find((d) => d.code === code)?.name || code
  },
}))
