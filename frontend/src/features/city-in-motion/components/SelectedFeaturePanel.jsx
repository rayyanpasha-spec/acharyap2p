// Details panel (desktop right column / mobile bottom sheet) with complaint, vehicle and bin variants.
// Complaint detail is fetched from GET /city-twin/complaints/{ticket}; vehicle and bin cards read the live store and
// lazily load their detail endpoint. Staff-only fields appear only when the server sends them.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Clock, ImageOff, Lock, MapPin, Route as RouteIcon, X } from 'lucide-react'
import { AuthImage, Badge, Button, CategoryChip, DemoTag, Input, Notice, SeverityBadge, StatusBadge, cn, toast } from '../../../components/ui'
import StatusTimeline from '../../../components/StatusTimeline'
import { errMsg } from '../../../lib/api'
import { fmtDateTime, timeAgo, titleCase } from '../../../lib/format'
import * as svc from '../services/cityTwinApi'
import { BIN_STATUS, STAFF_ROLES, VEHICLE_STATUS } from '../utils/mapConfig'
import DataSourceBadge from './DataSourceBadge'

/* ---------- small building blocks ---------- */
function Fact({ label, children }) {
  if (children == null || children === '') return null
  return (
    <div className="grid grid-cols-[104px_1fr] gap-3 py-1.5 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  )
}
const Section = ({ title, children, className }) => (
  <section className={cn('border-t border-line px-4 py-3.5', className)}>
    {title && <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">{title}</h3>}
    {children}
  </section>
)

function PanelSkeleton() {
  return (
    <div className="space-y-3 p-4" role="status" aria-label="Loading details">
      <div className="h-5 w-2/3 animate-pulse rounded bg-paper" />
      <div className="h-4 w-1/3 animate-pulse rounded bg-paper" />
      <div className="h-16 animate-pulse rounded-[10px] bg-paper" />
      <div className="h-24 animate-pulse rounded-[10px] bg-paper" />
    </div>
  )
}

function useDetail(loader, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null, notFound: false })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const ac = new AbortController()
    setState((s) => ({ ...s, loading: true, error: null, notFound: false }))
    loader(ac.signal)
      .then((data) => setState({ data, loading: false, error: null, notFound: false }))
      .catch((e) => {
        if (svc.isCancel(e)) return
        setState((s) => ({ data: null, loading: false, error: errMsg(e, 'Could not load details.'), notFound: e?.response?.status === 404 && !!s }))
      })
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt])
  return { ...state, retry: useCallback(() => setAttempt((a) => a + 1), []), reload: useCallback(() => setAttempt((a) => a + 1), []) }
}

/* ---------- complaint ---------- */
function ComplaintCard({ ticket, user, refreshKey }) {
  const { data: raw, loading, error, notFound, retry } = useDetail((signal) => svc.getComplaint(ticket, signal), [ticket, refreshKey, user?.id])
  if (loading && !raw) return <PanelSkeleton />
  if (notFound) return <div className="p-4"><Notice tone="warning" title="Report not available">This report is no longer shown on the public map.</Notice></div>
  if (error) return <div className="p-4"><Notice tone="critical" title="Could not load this report">{error} <button type="button" onClick={retry} className="font-semibold text-civic underline">Try again</button></Notice></div>
  if (!raw) return null
  const d = { ...(raw.properties || {}), ...raw }
  const staff = STAFF_ROLES.includes(user?.role)
  const resolved = d.status === 'resolved'
  const ba = d.before_after || {}
  const hasBA = resolved && (ba.before_image_id || ba.after_image_id)
  const photos = (Array.isArray(d.images) ? d.images : []).filter((i) => i?.id != null)
  const fullPath = d.view_full_report_path || (staff ? `/staff/tickets/${ticket}` : user && d.is_mine ? `/app/complaints/${ticket}` : null)
  const timeline = Array.isArray(d.timeline) ? d.timeline : []

  return (
    <div>
      <div className="px-4 pb-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={d.severity} />
          <StatusBadge status={d.status} />
          {d.is_demo && <DemoTag />}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CategoryChip category={d.category} label={d.category_name} />
          {d.subcategory && <span className="text-xs text-muted">{titleCase(d.subcategory)}</span>}
        </div>
        {d.public_summary && <p className="mt-3 text-sm leading-relaxed text-ink">{d.public_summary}</p>}
      </div>

      <Section title="Details">
        <dl className="divide-y divide-line">
          <Fact label="Severity">{d.severity_reason || null}</Fact>
          <Fact label="Location">
            <span className="inline-flex items-start gap-1"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              <span>{d.locality || 'Bengaluru'}{!staff && !d.is_mine ? <span className="text-muted"> (approximate public location)</span> : null}</span></span>
          </Fact>
          <Fact label="Reported">{d.created_at ? `${fmtDateTime(d.created_at)} (${timeAgo(d.created_at)})` : null}</Fact>
          <Fact label="Last update">{d.updated_at ? timeAgo(d.updated_at) : null}</Fact>
          <Fact label="Department">{d.department_name}</Fact>
          <Fact label="Linked reports">{Number(d.supporting_count) > 0 ? `${d.supporting_count} citizens support this report` : null}</Fact>
          {resolved && <Fact label="Resolved">{d.resolved_at ? fmtDateTime(d.resolved_at) : null}</Fact>}
          {resolved && (d.ward_name || d.ward || d.corporation_name || d.corporation) && <Fact label="Area">{[d.ward_name || d.ward, d.corporation_name || d.corporation].filter(Boolean).join(', ')}</Fact>}
        </dl>
      </Section>

      {(hasBA || photos.length > 0 || d.images_require_login) && (
        <Section title={hasBA ? 'Before and after' : 'Photos'}>
          {!user ? (
            <p className="flex items-center gap-2 rounded-[10px] border border-dashed border-line-strong bg-paper px-3 py-3 text-[13px] text-muted">
              <Lock className="h-4 w-4 shrink-0" aria-hidden /> <span><Link to="/login" className="font-semibold text-civic hover:underline">Sign in</Link> to view photos.</span>
            </p>
          ) : hasBA ? (
            <div className="grid grid-cols-2 gap-2">
              {[['Before', ba.before_image_id], ['After', ba.after_image_id]].map(([label, id]) => (
                <figure key={label} className="overflow-hidden rounded-[10px] border border-line">
                  {id ? <AuthImage imageId={id} alt={`${label} photo of ${ticket}`} className="h-28 w-full" />
                    : <div className="flex h-28 items-center justify-center bg-paper text-xs text-muted"><ImageOff className="mr-1 h-4 w-4" aria-hidden /> No photo</div>}
                  <figcaption className="border-t border-line bg-paper px-2 py-1 text-xs font-semibold text-ink">{label}</figcaption>
                </figure>
              ))}
              {ba.verified && <p className="col-span-2 text-xs text-success">Verified by a supervisor{ba.verified_at ? ` on ${fmtDateTime(ba.verified_at)}` : ''}.</p>}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.slice(0, 6).map((p) => <AuthImage key={p.id} imageId={p.id} alt={`${p.kind || 'Report'} photo`} className="h-20 w-full rounded-lg border border-line" />)}
            </div>
          )}
        </Section>
      )}

      {timeline.length > 0 && <Section title="Public timeline"><StatusTimeline rows={timeline} /></Section>}

      {staff && (d.ai_confidence != null || d.routing_note || d.sla_due_at || d.assigned_worker_name || (d.review_reasons || []).length > 0) && (
        <Section title="Staff details">
          <dl className="divide-y divide-line">
            <Fact label="AI confidence">{d.ai_confidence != null ? `${Math.round(Number(d.ai_confidence) * (Number(d.ai_confidence) <= 1 ? 100 : 1))}%` : null}</Fact>
            <Fact label="Review reasons">{(d.review_reasons || []).length ? d.review_reasons.map((r) => titleCase(String(r))).join(', ') : null}</Fact>
            <Fact label="Routing">{d.routing_note}</Fact>
            <Fact label="SLA due">{d.sla_due_at ? fmtDateTime(d.sla_due_at) : null}</Fact>
            <Fact label="Assigned to">{d.assigned_worker_name}</Fact>
            <Fact label="Language">{d.original_language ? d.original_language.toUpperCase() : null}</Fact>
          </dl>
        </Section>
      )}

      <div className="border-t border-line px-4 py-3.5">
        {fullPath ? (
          <Link to={fullPath} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-forest px-4 text-sm font-semibold text-white hover:bg-forest-600">
            {staff ? 'Open ticket screen' : 'View full report'} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <p className="text-[13px] text-muted"><Link to="/login" className="font-semibold text-civic hover:underline">Sign in</Link> to follow this report or see your own reports.</p>
        )}
      </div>
    </div>
  )
}

/* ---------- vehicle ---------- */
function ProgressBar({ value, label }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted"><span>{label}</span><span className="font-semibold tabular-nums text-ink">{Math.round(v)}%</span></div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label} className="h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-forest" style={{ width: `${v}%` }} />
      </div>
    </div>
  )
}

function VehicleCard({ vehicle, user }) {
  const { data: detail } = useDetail((signal) => (vehicle ? svc.getVehicle(vehicle.vehicle_id, signal) : Promise.resolve(null)), [vehicle?.vehicle_id, user?.id])
  if (!vehicle) return <div className="p-4"><Notice tone="warning" title="Vehicle not available">This vehicle is no longer in the live feed.</Notice></div>
  const v = { ...(detail || {}), ...vehicle }
  const st = VEHICLE_STATUS[v.status] || VEHICLE_STATUS.idle
  const staff = STAFF_ROLES.includes(user?.role)
  return (
    <div>
      <div className="px-4 pb-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={v.stale ? 'neutral' : st.tone} dot>{v.stale && v.status !== 'offline' ? `${st.label} (stale)` : st.label}</Badge>
          <DataSourceBadge source={v.data_source} kind="vehicle" />
        </div>
        {v.stale && (
          <Notice tone="warning" className="mt-3 !px-3 !py-2 text-[13px]">
            <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <span><b>Location may be outdated.</b> {v.recorded_at ? `Last update ${timeAgo(v.recorded_at)}.` : 'No recent position.'} The vehicle is shown at its last known point and is not animated.</span></span>
          </Notice>
        )}
      </div>
      <Section title="Route">
        <dl className="divide-y divide-line">
          <Fact label="Route">{[v.route_name, v.route_code].filter(Boolean).join(' - ') || 'Not assigned'}</Fact>
          <Fact label="Schedule">{v.route?.schedule_window}</Fact>
          <Fact label="Task">{v.current_task}</Fact>
          <Fact label="Next stop">{v.next_stop ? <span className="inline-flex items-center gap-1"><RouteIcon className="h-3.5 w-3.5 text-saffron" aria-hidden />{v.next_stop}</span> : null}</Fact>
          <Fact label="Last update"><span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-muted" aria-hidden />{v.recorded_at ? `${fmtDateTime(v.recorded_at)} (${timeAgo(v.recorded_at)})` : 'Unknown'}</span></Fact>
        </dl>
        {v.route_progress != null && <div className="mt-3"><ProgressBar value={v.route_progress} label="Route progress" /></div>}
      </Section>
      {staff && (v.eta_minutes != null || v.speed_kmh != null || v.driver_label) && (
        <Section title="Staff details">
          <dl className="divide-y divide-line">
            <Fact label="Demo ETA">{v.eta_minutes != null ? <>{v.eta_minutes} min <span className="text-muted">(demo estimate)</span></> : null}</Fact>
            <Fact label="Speed">{v.speed_kmh != null ? <>{v.speed_kmh} km/h <span className="text-muted">(demo estimate)</span></> : null}</Fact>
            <Fact label="Driver">{v.driver_label}</Fact>
          </dl>
        </Section>
      )}
      <Section><p className="text-xs text-muted">{v.data_source === 'simulated' ? 'This vehicle is part of a simulation and is not an actual municipal vehicle.' : 'Position reported by the vehicle GPS device.'}</p></Section>
    </div>
  )
}

/* ---------- bin ---------- */
function FillGauge({ value, status }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  const color = (BIN_STATUS[status] || BIN_STATUS.normal).color
  return (
    <div>
      <div className="relative h-3 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label="Bin fill level">
        <div className="h-full rounded-full" style={{ width: `${v}%`, background: color }} />
        {[50, 80, 95].map((t) => <span key={t} className="absolute top-0 h-full w-px bg-white" style={{ left: `${t}%` }} aria-hidden />)}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted"><span>0</span><span>50</span><span>80</span><span>95</span><span>100</span></div>
    </div>
  )
}

function BinCard({ bin, user, onChanged }) {
  const { data: detail, reload } = useDetail((signal) => (bin ? svc.getBin(bin.bin_id, signal) : Promise.resolve(null)), [bin?.bin_id])
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState('')
  if (!bin) return <div className="p-4"><Notice tone="warning" title="Bin not available">This bin is no longer in the live feed.</Notice></div>
  const b = { ...(detail || {}), ...bin }
  const st = BIN_STATUS[b.status] || BIN_STATUS.normal
  const staff = STAFF_ROLES.includes(user?.role)
  const history = Array.isArray(detail?.history) ? detail.history : []

  const act = async (fn, okMsg) => {
    setBusy(true)
    try { await fn(); toast.success(okMsg); await onChanged?.(); reload() } catch (e) { toast.error(errMsg(e, 'That action could not be completed.')) } finally { setBusy(false) }
  }
  return (
    <div>
      <div className="px-4 pb-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={b.status === 'overflow_risk' ? 'critical' : b.status === 'collection_recommended' ? 'saffron' : b.status === 'filling_up' ? 'warning' : 'forest'} dot>{st.label}</Badge>
          <DataSourceBadge source={b.data_source} kind="bin" />
        </div>
        <div className="mt-3 flex items-end justify-between">
          <span className="font-display text-3xl font-extrabold tabular-nums text-ink">{Math.round(b.fill_percentage)}<span className="text-lg">%</span></span>
          <span className="text-xs text-muted">{st.range} band</span>
        </div>
        <div className="mt-2"><FillGauge value={b.fill_percentage} status={b.status} /></div>
      </div>
      <Section title="Bin">
        <dl className="divide-y divide-line">
          <Fact label="Code">{b.bin_code}</Fact>
          <Fact label="Location">{[b.public_label, detail?.locality].filter(Boolean).join(', ')}</Fact>
          <Fact label="Last collected">{b.last_collected_at ? `${fmtDateTime(b.last_collected_at)} (${timeAgo(b.last_collected_at)})` : 'No collection recorded'}</Fact>
          <Fact label="Last reading">{b.last_reading_at ? timeAgo(b.last_reading_at) : null}</Fact>
          <Fact label="Predicted full">{b.predicted_full_at ? <>{fmtDateTime(b.predicted_full_at)} <span className="text-muted">(estimate)</span></> : null}</Fact>
        </dl>
      </Section>
      {history.length > 0 && (
        <Section title="Recent collections">
          <ul className="space-y-1.5 text-[13px]">
            {history.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-ink">
                <span>{titleCase(h.event_type || 'collected')}{h.vehicle_code ? ` by ${h.vehicle_code}` : ''}</span>
                <span className="shrink-0 text-xs text-muted">{timeAgo(h.recorded_at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {staff && (
        <Section title="Staff actions">
          <div className="space-y-3">
            <Button variant="civic" size="sm" className="w-full" loading={busy} onClick={() => act(() => svc.recordCollection(b.bin_id), 'Collection recorded.')}>Record collection</Button>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const n = Number(reading)
                if (!Number.isFinite(n) || n < 0 || n > 100) { toast.error('Enter a fill level between 0 and 100.'); return }
                act(() => svc.recordReading(b.bin_id, n), 'Reading recorded.').then(() => setReading(''))
              }}
            >
              <label htmlFor="cm-reading" className="sr-only">Fill level percent</label>
              <Input id="cm-reading" type="number" min="0" max="100" step="1" inputMode="numeric" placeholder="Fill %" value={reading} onChange={(e) => setReading(e.target.value)} className="h-9 w-24 text-[13px]" />
              <Button variant="secondary" size="sm" type="submit" disabled={busy || reading === ''}>Record reading</Button>
            </form>
          </div>
        </Section>
      )}
    </div>
  )
}

/* ---------- shell ---------- */
const TITLES = { complaint: 'Civic issue', vehicle: 'Collection vehicle', bin: 'Waste bin' }

export default function SelectedFeaturePanel({ selection, user, vehicles, bins, refreshKey, onClose, onRefreshLive, className }) {
  if (!selection) return null
  const vehicle = selection.type === 'vehicle' ? vehicles.find((v) => String(v.vehicle_id) === selection.id) : null
  const bin = selection.type === 'bin' ? bins.find((b) => String(b.bin_id) === selection.id) : null
  const heading = selection.type === 'complaint' ? selection.id : selection.type === 'vehicle' ? (vehicle?.vehicle_code || selection.id) : (bin?.bin_code || selection.id)
  return (
    <aside aria-label={`${TITLES[selection.type]} details`} className={cn('flex min-h-0 flex-col bg-surface', className)}>
      <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{TITLES[selection.type]}</p>
          <h2 className={cn('truncate text-lg font-extrabold text-ink', selection.type === 'complaint' && 'font-mono text-base')}>{heading}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close details" className="-mr-1 rounded-lg p-1.5 text-muted hover:bg-paper hover:text-ink"><X className="h-5 w-5" aria-hidden /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {selection.type === 'complaint' && <ComplaintCard ticket={selection.id} user={user} refreshKey={refreshKey} />}
        {selection.type === 'vehicle' && <VehicleCard vehicle={vehicle} user={user} />}
        {selection.type === 'bin' && <BinCard bin={bin} user={user} onChanged={onRefreshLive} />}
      </div>
    </aside>
  )
}
