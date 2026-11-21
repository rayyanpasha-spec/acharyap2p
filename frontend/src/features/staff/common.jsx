// Shared bits for the staff command centre: data hook, priority meter, SLA chip, role accents.
import { useEffect, useState } from 'react'
import { Flag } from 'lucide-react'
import { api, errMsg } from '../../lib/api'
import { parseDate, slaRemaining } from '../../lib/format'
import { Badge, cn } from '../../components/ui'

export const CLOSED_STATUSES = ['resolved', 'rejected', 'duplicate_linked']
export const SEVERITIES = ['low', 'medium', 'high', 'critical']
export const STATUS_LIST = ['submitted', 'ai_review', 'verified', 'assigned', 'in_progress', 'awaiting_verification', 'resolved', 'reopened', 'rejected', 'duplicate_linked']

/** Solid severity colours (CSS variables from index.css). */
export const SEV_COLOR = {
  low: 'var(--color-low)',
  medium: 'var(--color-warning)',
  high: 'var(--color-high)',
  critical: 'var(--color-critical)',
}
/** Same colours as hex for chart libraries / Leaflet that cannot resolve CSS variables. */
export const SEV_HEX = { low: '#4f7a8f', medium: '#c18b36', high: '#c2603a', critical: '#b94a48' }
export const CAT_HEX = {
  roads: '#8a6d3b', waste: '#4f7a3a', water: '#2f6fa3', electricity: '#a87b00', trees: '#2f7d4f',
  drainage: '#2a7f86', public_infrastructure: '#6b4c7a', other: '#737a72',
}

/** Role accent classes (static strings so Tailwind keeps them). */
export const ROLE_ACCENT = {
  officer: { name: 'Officer', tone: 'civic', text: 'text-civic', bg: 'bg-civic', soft: 'bg-civic-100', softText: 'text-civic', border: 'border-civic' },
  worker: { name: 'Field worker', tone: 'civic', text: 'text-civic', bg: 'bg-civic', soft: 'bg-civic-100', softText: 'text-civic', border: 'border-civic' },
  supervisor: { name: 'Supervisor', tone: 'teal', text: 'text-teal', bg: 'bg-teal', soft: 'bg-teal-100', softText: 'text-teal', border: 'border-teal' },
  admin: { name: 'Administrator', tone: 'plum', text: 'text-plum', bg: 'bg-plum', soft: 'bg-plum-100', softText: 'text-plum', border: 'border-plum' },
}
export const accentFor = (role) => ROLE_ACCENT[role] || ROLE_ACCENT.officer

/** GET helper: { data, loading, error, reload }. Data is cleared when url/params change, kept across reload(). */
export function useFetch(url, params, enabled = true) {
  const key = JSON.stringify([url, params])
  const [state, setState] = useState({ key: null, data: null, loading: true, error: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!enabled || !url) return undefined
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    api.get(url, { params })
      .then((r) => { if (!cancelled) setState({ key, data: r.data, loading: false, error: null }) })
      .catch((e) => { if (!cancelled) setState({ key, data: null, loading: false, error: errMsg(e, 'Could not load this data.') }) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick, enabled])
  const fresh = state.key === key
  return {
    data: fresh ? state.data : null,
    loading: !fresh || state.loading,
    error: fresh ? state.error : null,
    reload: () => setTick((t) => t + 1),
  }
}

export function PriorityMeter({ score, severity, className }) {
  const n = Number(score)
  if (!isFinite(n)) return <span className="text-muted">—</span>
  const pct = Math.max(2, Math.min(100, n))
  return (
    <div className={cn('flex items-center gap-2', className)} title={`Operational priority ${n.toFixed(1)} / 100`}>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: SEV_COLOR[severity] || 'var(--color-muted)' }} />
      </div>
      <span className="w-7 text-right text-xs font-semibold tabular-nums text-ink">{n.toFixed(0)}</span>
    </div>
  )
}

export function SlaChip({ due, status }) {
  if (CLOSED_STATUSES.includes(status)) return <span className="text-xs text-muted">Closed</span>
  if (!due) return <span className="text-xs text-muted">No SLA</span>
  const { label, overdue } = slaRemaining(due)
  const hours = ((parseDate(due)?.getTime() || 0) - Date.now()) / 3600000
  const tone = overdue ? 'critical' : hours < 8 ? 'warning' : 'neutral'
  return <Badge tone={tone}>{label}</Badge>
}

export function ReviewFlag({ item }) {
  if (!item?.requires_human_review) return null
  const why = (item.review_reasons || []).join('; ') || 'Needs human review'
  return <span title={why} className="inline-flex text-saffron"><Flag className="h-4 w-4" aria-label={`Needs human review: ${why}`} /></span>
}

export const pct = (v) => (v == null || !isFinite(Number(v)) ? '—' : `${Math.round(Number(v) <= 1 ? Number(v) * 100 : Number(v))}%`)
export const ratePct = (v) => (v == null || !isFinite(Number(v)) ? '—' : `${(Number(v) <= 1 ? Number(v) * 100 : Number(v)).toFixed(1)}%`)
export const hoursLabel = (h) => (h == null ? '—' : h < 48 ? `${Number(h).toFixed(1)} h` : `${(h / 24).toFixed(1)} d`)
