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

/* ---------- Compact table cells (own padding: the ui Td/Th are roomier than the dense staff tables) ---------- */
export const HCell = ({ className, children, ...p }) => (
  <th className={cn('sticky top-0 z-10 whitespace-nowrap border-b border-line bg-paper px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted', className)} {...p}>{children}</th>
)
export const Cell = ({ className, children, ...p }) => (
  <td className={cn('border-b border-line px-2.5 py-1.5 align-middle text-[13px]', className)} {...p}>{children}</td>
)
/** Compact control sizing for toolbars (the ui inputs default to h-10). */
export const CTRL = '!h-8 !text-[13px]'

/* ---------- Tone maps (static class strings so Tailwind keeps them) ---------- */
export const TONE = {
  ink: { tile: 'border-line bg-paper', icon: 'bg-line text-ink', num: 'text-ink', soft: 'bg-paper text-muted' },
  forest: { tile: 'border-forest/15 bg-forest-50', icon: 'bg-forest-100 text-forest', num: 'text-forest', soft: 'bg-forest-100 text-forest' },
  civic: { tile: 'border-civic/15 bg-civic-50', icon: 'bg-civic-100 text-civic', num: 'text-civic', soft: 'bg-civic-100 text-civic' },
  teal: { tile: 'border-teal/15 bg-teal-100/40', icon: 'bg-teal-100 text-teal', num: 'text-teal', soft: 'bg-teal-100 text-teal' },
  plum: { tile: 'border-plum/15 bg-plum-100/40', icon: 'bg-plum-100 text-plum', num: 'text-plum', soft: 'bg-plum-100 text-plum' },
  saffron: { tile: 'border-saffron/20 bg-saffron-100/40', icon: 'bg-saffron-100 text-saffron', num: 'text-saffron', soft: 'bg-saffron-100 text-saffron' },
  success: { tile: 'border-success/15 bg-success-100/40', icon: 'bg-success-100 text-success', num: 'text-success', soft: 'bg-success-100 text-success' },
  warning: { tile: 'border-warning/25 bg-warning-100/50', icon: 'bg-warning-100 text-[#8a6118]', num: 'text-[#8a6118]', soft: 'bg-warning-100 text-[#8a6118]' },
  high: { tile: 'border-high/20 bg-high-100/40', icon: 'bg-high-100 text-high', num: 'text-high', soft: 'bg-high-100 text-high' },
  critical: { tile: 'border-critical/20 bg-critical-100/40', icon: 'bg-critical-100 text-critical', num: 'text-critical', soft: 'bg-critical-100 text-critical' },
  low: { tile: 'border-low/20 bg-low-100/40', icon: 'bg-low-100 text-low', num: 'text-low', soft: 'bg-low-100 text-low' },
}

/** Compact tinted metric tile: coloured icon + big number + label. */
export function MetricTile({ icon: Icon, label, value, tone = 'ink', hint, className }) {
  const t = TONE[tone] || TONE.ink
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5 rounded-[14px] border px-3 py-2 shadow-[0_1px_2px_rgba(36,76,57,0.05)]', t.tile, className)} title={hint ? `${label} - ${hint}` : label}>
      {Icon && <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]', t.icon)}><Icon className="h-[18px] w-[18px]" aria-hidden /></span>}
      <div className="min-w-0 leading-tight">
        <p className={cn('font-display text-[22px] font-extrabold leading-none tabular-nums', t.num)}>{value}</p>
        <p className="mt-1 truncate text-[12px] font-medium text-muted">{label}</p>
      </div>
    </div>
  )
}

/** Round avatar with initials. */
export function Avatar({ name, tone = 'civic', solid, className }) {
  const parts = String(name || '?').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  const ini = ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
  const t = TONE[tone] || TONE.civic
  return (
    <span aria-hidden className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold', solid || t.soft, className)}>{ini}</span>
  )
}
