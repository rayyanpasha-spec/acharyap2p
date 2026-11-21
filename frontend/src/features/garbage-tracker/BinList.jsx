import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, Select, cn } from '../../components/ui'
import { timeAgo } from '../../lib/format'
import { BIN_STATES, BIN_STATE_ORDER, binState, fmtClock, num, reportLink } from './shared'

export function BinStateBadge({ state }) {
  const s = BIN_STATES[state] || BIN_STATES.normal
  return <Badge tone={s.tone} dot>{s.label}</Badge>
}

export function FillBar({ pct, state }) {
  const p = Math.max(0, Math.min(100, num(pct)))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${p}%`, background: BIN_STATES[state]?.color }} />
    </div>
  )
}

/** Bins sorted by fill (highest first) with a state filter. `showReport` adds the citizen "Report overflowing bin" link. */
export default function BinList({ bins, selectedId, onSelect, showReport = false, filter = 'all', onFilter }) {
  const rows = bins
    .map((b) => ({ ...b, _state: binState(b) }))
    .filter((b) => filter === 'all' || b._state === filter)
    .sort((a, b) => num(b.fill_pct) - num(a.fill_pct))

  return (
    <div>
      <div className="border-b border-line px-4 py-2.5">
        <label className="sr-only" htmlFor="bin-filter">Filter bins by state</label>
        <Select id="bin-filter" className="!h-9" value={filter} onChange={(e) => onFilter?.(e.target.value)}>
          <option value="all">All states ({bins.length})</option>
          {BIN_STATE_ORDER.map((s) => <option key={s} value={s}>{BIN_STATES[s].label} ({bins.filter((b) => binState(b) === s).length})</option>)}
        </Select>
      </div>
      {!rows.length ? (
        <EmptyState icon={Trash2} title="No bins to show" hint={bins.length ? 'No bins match this filter.' : 'No simulated bin data has been loaded yet.'} />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((b) => (
            <li key={b.id} className={cn('px-4 py-3', selectedId === b.id && 'bg-forest-50')}>
              <button type="button" className="w-full text-left" onClick={() => onSelect?.(b)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-ink">{b.code}{b.name ? <span className="font-medium text-muted"> - {b.name}</span> : null}</span>
                  <span className="text-sm font-bold text-ink">{Math.round(num(b.fill_pct))}%</span>
                </div>
                <div className="mt-1.5"><FillBar pct={b.fill_pct} state={b._state} /></div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <BinStateBadge state={b._state} />
                  {b.locality && <span className="text-xs text-muted">{b.locality}</span>}
                </div>
                <p className="mt-1 text-xs text-muted">
                  Source: {b.source || 'simulated'}{b.recorded_at ? `, ${timeAgo(b.recorded_at)}` : ''}
                  {b.predicted_full_at && <> - estimated full ~{fmtClock(b.predicted_full_at)} (estimate)</>}
                </p>
              </button>
              {showReport && (
                <Button as={Link} to={reportLink(b)} variant="secondary" size="sm" className="mt-2">Report overflowing bin</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
