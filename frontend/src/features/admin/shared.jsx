import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errMsg } from '../../lib/api'
import { Badge } from '../../components/ui'
import { titleCase } from '../../lib/format'

export const ROLE_TONE = { citizen: 'forest', officer: 'civic', worker: 'low', supervisor: 'teal', admin: 'plum' }
export const STAFF_ROLES = ['officer', 'worker', 'supervisor', 'admin', 'citizen']

export function RoleChip({ role }) {
  return <Badge tone={ROLE_TONE[role] || 'neutral'}>{titleCase(role || 'unknown')}</Badge>
}

export const toList = (d) => (Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [])

/** GET helper with loading/error/reload. `params` changes re-fetch (compared via JSON). */
export function useApi(path, params) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const key = JSON.stringify(params || {})
  const seq = useRef(0)
  const load = useCallback(async () => {
    const my = ++seq.current
    setLoading(true)
    try {
      const { data: d } = await api.get(path, { params: JSON.parse(key) })
      if (my === seq.current) { setData(d); setError(null) }
    } catch (e) {
      if (my === seq.current) setError(errMsg(e))
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }, [path, key])
  useEffect(() => { load() }, [load])
  return { data, loading, error, reload: load, setData }
}

export function genPassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const arr = new Uint32Array(len)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(arr)
  else for (let i = 0; i < len; i += 1) arr[i] = Math.floor(Math.random() * 4294967295)
  let out = ''
  for (let i = 0; i < len; i += 1) out += chars[arr[i] % chars.length]
  return `${out}9a`
}
