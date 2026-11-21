// Count chips (active, critical, high, vehicles, bins at overflow risk) + live-connection status.
import { cn } from '../../../components/ui'
import { SEVERITY } from '../utils/mapConfig'

function Chip({ label, value, color, onClick, pressed, title }) {
  const body = (
    <>
      {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />}
      <span className="font-bold tabular-nums">{value ?? '-'}</span>
      <span className="text-muted">{label}</span>
    </>
  )
  const cls = 'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border bg-surface px-3 text-xs text-ink'
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={pressed} title={title} className={cn(cls, 'hover:bg-paper', pressed ? 'border-civic' : 'border-line-strong')}>{body}</button>
  ) : (
    <span className={cn(cls, 'border-line-strong')} title={title}>{body}</span>
  )
}

export function LiveChip({ state, polling }) {
  const live = state === 'live'
  const paused = state === 'paused'
  return (
    <span
      role="status"
      className={cn('inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold',
        live ? 'border-forest/25 bg-forest-100 text-forest' : paused ? 'border-warning/40 bg-warning-100 text-[#8a6118]' : 'border-line-strong bg-surface text-muted')}
    >
      <span className={cn('h-2 w-2 rounded-full', live ? 'bg-forest cl-pulse' : paused ? 'bg-warning' : 'bg-muted')} aria-hidden />
      {live ? 'Live' : paused ? `Live updates paused${polling ? ' - refreshing every 5 s' : ''}` : 'Connecting...'}
    </span>
  )
}

export default function StatusChips({ counts, severityFilter, onSeverity, liveState, polling }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Map counts and live status" style={{ scrollbarWidth: 'none' }}>
      <Chip label="active issues" value={counts.active} />
      <Chip label="critical" value={counts.critical} color={SEVERITY.critical.color} onClick={() => onSeverity('critical')} pressed={severityFilter === 'critical'} title="Filter to critical issues" />
      <Chip label="high" value={counts.high} color={SEVERITY.high.color} onClick={() => onSeverity('high')} pressed={severityFilter === 'high'} title="Filter to high-severity issues" />
      <Chip label="vehicles" value={counts.vehicles} color="#244C39" />
      <Chip label="bins at overflow risk" value={counts.binsRisk} color="#B94A48" />
      <LiveChip state={liveState} polling={polling} />
    </div>
  )
}
