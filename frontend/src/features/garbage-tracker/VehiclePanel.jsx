import { Truck } from 'lucide-react'
import { Badge, Card, CardHeader, EmptyState, DemoTag, cn } from '../../components/ui'
import { timeAgo, titleCase } from '../../lib/format'
import { num } from './shared'

export function ProgressBar({ pct, className }) {
  const p = Math.max(0, Math.min(100, num(pct)))
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-line', className)} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-civic" style={{ width: `${p}%` }} />
    </div>
  )
}

/** Compact vehicle list. Never shows driver information (citizen safe). */
export function VehicleList({ vehicles, selectedId, onSelect }) {
  if (!vehicles.length) {
    return <EmptyState icon={Truck} title="No simulated vehicles yet" hint="The demo simulator may not be running. Vehicles will appear here as soon as it starts." />
  }
  return (
    <ul className="divide-y divide-line">
      {vehicles.map((v) => (
        <li key={v.id}>
          <button type="button" onClick={() => onSelect?.(v)} aria-pressed={selectedId === v.id}
            className={cn('w-full px-4 py-3 text-left hover:bg-paper', selectedId === v.id && 'bg-civic-50')}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-sm font-bold text-ink">{v.code}</span>
              <Badge tone="civic">{titleCase(v.current_task || v.status || 'unknown')}</Badge>
            </div>
            <p className="mt-0.5 text-[13px] text-muted">{v.route?.name || 'No route assigned'}</p>
            <div className="mt-2 flex items-center gap-2">
              <ProgressBar pct={v.route_progress_pct} />
              <span className="w-10 shrink-0 text-right text-xs font-semibold text-ink">{Math.round(num(v.route_progress_pct))}%</span>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              Next: {v.next_stop || '-'}
              {v.eta_minutes != null && <> - ETA ~{Math.round(v.eta_minutes)} min</>}
              {v.speed_kmh != null && <> - {Math.round(v.speed_kmh)} km/h</>}
              <span className="ml-1 font-semibold text-saffron">(simulated)</span>
            </p>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Row({ k, children }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-medium text-ink">{children}</dd>
    </div>
  )
}

/** Selected vehicle information panel (spec section 8 table). `staff` reveals the fictional driver label. */
export default function VehiclePanel({ vehicle, route, staff = false, onClose }) {
  if (!vehicle) return null
  const v = vehicle
  return (
    <Card>
      <CardHeader
        title={`Vehicle ${v.code}`}
        subtitle="Fictional vehicle with simulated GPS"
        action={<div className="flex items-center gap-2"><DemoTag kind="simulated" />{onClose && <button type="button" onClick={onClose} className="text-xs font-semibold text-muted hover:text-ink">Close</button>}</div>}
      />
      <dl className="px-4 py-2 sm:px-5">
        <Row k="Vehicle ID">{v.code}</Row>
        <Row k="City Corporation">Not resolved (demo)</Row>
        <Row k="Ward">{route?.ward_label ? `${route.ward_label} (demo label)` : 'Demo label'}</Row>
        {staff && v.driver_label && <Row k="Driver">{v.driver_label} <span className="text-[10px] font-bold uppercase text-saffron">fictional</span></Row>}
        <Row k="Route">{v.route?.name || route?.name || '-'}</Row>
        <Row k="Current task">{titleCase(v.current_task || v.status || '-')}</Row>
        <Row k="Speed">{v.speed_kmh != null ? `${Math.round(v.speed_kmh)} km/h (simulated)` : '-'}</Row>
        <Row k="Route progress">
          <span className="flex items-center justify-end gap-2"><ProgressBar pct={v.route_progress_pct} className="w-20" />{Math.round(num(v.route_progress_pct))}%</span>
        </Row>
        <Row k="Next stop">{v.next_stop || '-'}</Row>
        <Row k="Estimated arrival">{v.eta_minutes != null ? `${Math.round(v.eta_minutes)} min (simulated)` : '-'}</Row>
        <Row k="Schedule window">{v.route?.schedule_window || route?.schedule_window || '-'}</Row>
        <Row k="Last location update">{v.recorded_at ? timeAgo(v.recorded_at) : '-'}</Row>
      </dl>
    </Card>
  )
}
