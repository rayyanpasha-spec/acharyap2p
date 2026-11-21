import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Map as MapIcon, Trash2, Truck } from 'lucide-react'
import { Badge, Button, Card, CardBody, CardHeader, DemoTag, EmptyState, ErrorState, Field, Input, Notice, Page, Panel, Select, Spinner, cn, toast } from '../../components/ui'
import { api, errMsg } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { timeAgo } from '../../lib/format'
import { useGarbageLive } from '../../features/garbage-tracker/useGarbageLive'
import GarbageMap from '../../features/garbage-tracker/GarbageMap'
import VehiclePanel, { ProgressBar } from '../../features/garbage-tracker/VehiclePanel'
import BinList from '../../features/garbage-tracker/BinList'
import { BIN_STATES, BIN_STATE_ORDER, DEMO_TEXT, asList, binState, fmtClock, fmtClockSec, num } from '../../features/garbage-tracker/shared'
import { MetricTile } from '../../features/staff/common'

function SimControls() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const load = useCallback(async () => {
    try { const { data } = await api.get('/demo/garbage/status'); setStatus(data); setErr(null) } catch (e) { setErr(errMsg(e)) }
  }, [])
  useEffect(() => { load() }, [load])
  const running = !!(status?.running ?? status?.is_running ?? status?.active)
  const act = async (what) => {
    setBusy(true)
    try { const { data } = await api.post(`/demo/garbage/${what}`); setStatus(data); toast.success(`Simulator ${what === 'start' ? 'started' : 'stopped'}`); load() } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <Card>
      <CardHeader title="Demo simulator" subtitle="Admin only. Drives the fictional vehicles and bins." action={<Badge tone={running ? 'success' : 'neutral'} dot>{status ? (running ? 'Running' : 'Stopped') : 'Unknown'}</Badge>} />
      <CardBody className="flex flex-wrap items-center gap-2">
        <Button variant="civic" size="sm" loading={busy} disabled={running} onClick={() => act('start')}>Start simulator</Button>
        <Button variant="secondary" size="sm" loading={busy} disabled={!running} onClick={() => act('stop')}>Stop simulator</Button>
        {err && <p className="text-xs text-critical">{err}</p>}
      </CardBody>
    </Card>
  )
}

function ReadingForm({ bins, onDone }) {
  const [binId, setBinId] = useState('')
  const [fill, setFill] = useState('')
  const [source, setSource] = useState('worker')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    const f = Number(fill)
    if (!binId) return toast.error('Choose a bin.')
    if (!Number.isFinite(f) || f < 0 || f > 100) return toast.error('Fill level must be between 0 and 100.')
    setBusy(true)
    try { await api.post(`/garbage/bins/${binId}/reading`, { fill_pct: f, source }); toast.success('Reading recorded'); setFill(''); onDone?.() } catch (er) { toast.error(errMsg(er)) } finally { setBusy(false) }
  }
  return (
    <Card>
      <CardHeader title="Record a bin reading" subtitle="Worker or sensor update for a simulated bin" />
      <form onSubmit={submit} className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        <Field label="Bin" htmlFor="rd-bin" className="sm:col-span-2">
          <Select id="rd-bin" value={binId} onChange={(e) => setBinId(e.target.value)}>
            <option value="">Select a bin</option>
            {bins.map((b) => <option key={b.id} value={b.id}>{b.code}{b.name ? ` - ${b.name}` : ''} ({Math.round(num(b.fill_pct))}%)</option>)}
          </Select>
        </Field>
        <Field label="Fill level (%)" htmlFor="rd-fill"><Input id="rd-fill" type="number" min={0} max={100} step={1} value={fill} onChange={(e) => setFill(e.target.value)} /></Field>
        <Field label="Source" htmlFor="rd-src">
          <Select id="rd-src" value={source} onChange={(e) => setSource(e.target.value)}><option value="worker">Worker</option><option value="sensor">Sensor</option></Select>
        </Field>
        <div className="sm:col-span-2"><Button type="submit" variant="civic" loading={busy}>Record reading</Button></div>
      </form>
    </Card>
  )
}

function CollectionForm({ bins, vehicles, onDone }) {
  const [binId, setBinId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (!binId) return toast.error('Choose a bin.')
    setBusy(true)
    try {
      const body = { bin_id: Number.isNaN(Number(binId)) ? binId : Number(binId) }
      if (vehicleId) body.vehicle_id = Number.isNaN(Number(vehicleId)) ? vehicleId : Number(vehicleId)
      await api.post('/garbage/collections', body)
      toast.success('Collection recorded'); setBinId(''); onDone?.()
    } catch (er) { toast.error(errMsg(er)) } finally { setBusy(false) }
  }
  return (
    <Card>
      <CardHeader title="Record a collection" subtitle="Marks the bin as collected and resets its fill level" />
      <form onSubmit={submit} className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        <Field label="Bin" htmlFor="col-bin">
          <Select id="col-bin" value={binId} onChange={(e) => setBinId(e.target.value)}>
            <option value="">Select a bin</option>
            {bins.map((b) => <option key={b.id} value={b.id}>{b.code} ({Math.round(num(b.fill_pct))}%)</option>)}
          </Select>
        </Field>
        <Field label="Vehicle (optional)" htmlFor="col-veh">
          <Select id="col-veh" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">None</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.code}</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-2"><Button type="submit" variant="civic" loading={busy}>Record collection</Button></div>
      </form>
    </Card>
  )
}


const TABS = [
  { value: 'alerts', label: 'Alerts' },
  { value: 'vehicles', label: 'Vehicles' },
  { value: 'bins', label: 'Bins' },
  { value: 'events', label: 'Events' },
  { value: 'record', label: 'Record' },
]

const n0 = (v) => (v == null ? 0 : v)

/** One-line legend for the map footer (built from the shared bin-state table). */
function MiniLegend({ roadSnapped = true }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink" aria-label="Map legend">
      <li className="flex items-center gap-1.5">
        <span className="flex h-4 w-4 items-center justify-center rounded bg-civic" aria-hidden><Truck className="h-2.5 w-2.5 text-white" /></span>
        Vehicle (simulated)
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="24" height="6" aria-hidden><line x1="0" y1="3" x2="24" y2="3" stroke="#2f5f8f" strokeWidth="3" strokeDasharray={roadSnapped ? undefined : '5 4'} /></svg>
        {roadSnapped ? 'Truck route (follows real roads)' : 'Demo route (straight line: road routing unavailable)'}
      </li>
      {BIN_STATE_ORDER.map((st) => (
        <li key={st} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-white" style={{ background: BIN_STATES[st].color, boxShadow: '0 0 0 1px rgba(0,0,0,.3)' }} aria-hidden />
          {BIN_STATES[st].label}
        </li>
      ))}
    </ul>
  )
}

export default function CleanRouteOps() {
  const user = useAuth((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const live = useGarbageLive()
  const [selV, setSelV] = useState(null)
  const [selB, setSelB] = useState(null)
  const [focus, setFocus] = useState(null)
  const [filter, setFilter] = useState('all')
  const [tab, setTab] = useState('alerts')
  const [alerts, setAlerts] = useState(null)
  const [alertsErr, setAlertsErr] = useState(null)
  const [collections, setCollections] = useState(null)
  const [colErr, setColErr] = useState(null)

  const loadSide = useCallback(async () => {
    const [a, c] = await Promise.allSettled([api.get('/garbage/alerts'), api.get('/garbage/collections', { params: { limit: 20 } })])
    if (a.status === 'fulfilled') { setAlerts(a.value.data); setAlertsErr(null) } else setAlertsErr(errMsg(a.reason))
    if (c.status === 'fulfilled') { setCollections(asList(c.value.data)); setColErr(null) } else setColErr(errMsg(c.reason))
  }, [])
  useEffect(() => {
    loadSide()
    const t = setInterval(loadSide, 15000)
    return () => clearInterval(t)
  }, [loadSide])

  const afterWrite = () => { live.refresh(); loadSide() }

  const vehicle = selV != null ? live.vehicles[selV] : null
  const route = useMemo(() => (vehicle ? live.routes.find((r) => r.id === vehicle.route?.id) : null), [vehicle, live.routes])
  const hasData = live.vehicleList.length > 0 || live.binList.length > 0
  const binById = live.bins
  const focusOn = (o) => { if (Number.isFinite(Number(o.latitude))) setFocus({ lat: Number(o.latitude), lng: Number(o.longitude), k: Math.random() }) }
  const pickVehicle = (id) => { setSelV(id); if (id != null) setTab('vehicles') }
  const pickBin = (id) => { setSelB(id); if (id != null) setTab('bins') }

  const overflow = asList(alerts?.overflow_risk).length ? asList(alerts?.overflow_risk) : live.binList.filter((b) => binState(b) === 'overflow_risk')
  const recommended = live.binList.filter((b) => binState(b) === 'collection_recommended')
  const missed = asList(alerts?.missed_collection)
  const routeProgress = live.routes.map((r) => ({ r, vs: live.vehicleList.filter((v) => v.route?.id === r.id) }))
  const alertCount = overflow.length + recommended.length + missed.length
  const sum = live.summary
  const connTone = live.conn === 'live' ? 'success' : live.conn === 'reconnecting' ? 'saffron' : 'neutral'
  const connLabel = live.conn === 'live' ? 'Live' : live.conn === 'reconnecting' ? 'Reconnecting' : 'Offline'

  return (
    <Page
      title="CleanRoute operations"
      subtitle={DEMO_TEXT}
      actions={(
        <>
          <Badge tone={connTone} dot>{connLabel}</Badge>
          <span className="hidden text-[12px] text-muted md:inline">Updated {fmtClockSec(live.lastUpdated)}{live.polling ? ' · refreshing every 5 s (socket unavailable)' : ''} · source: simulated ({live.sourceLabel})</span>
          {live.stale && <Badge tone="warning">Data may be stale</Badge>}
          <DemoTag kind="simulated" />
        </>
      )}
    >
      {live.loading && !hasData ? <Spinner label="Loading CleanRoute demo data..." />
        : live.error && !hasData ? <Card><ErrorState message={live.error} onRetry={live.refresh} /></Card>
        : (
          <>
            {live.error && <Notice tone="critical" className="!px-3 !py-2 !text-[13px]">Could not refresh CleanRoute data: {live.error} <button type="button" onClick={live.refresh} className="font-semibold underline">Try again</button></Notice>}
            <div className="grid shrink-0 grid-cols-2 gap-2.5 lg:grid-cols-4">
              <MetricTile label="Vehicles active" value={n0(sum.vehicles_active)} tone="civic" icon={Truck} hint="Simulated" />
              <MetricTile label="Bins tracked" value={n0(sum.bins_total)} tone="forest" icon={Trash2} hint="Simulated" />
              <MetricTile label={`Overflow risk (${n0(sum.bins_collection_recommended)} to collect)`} value={n0(sum.bins_overflow_risk)} tone={sum.bins_overflow_risk ? 'critical' : 'ink'} icon={AlertTriangle} />
              <MetricTile label="Collections today" value={n0(sum.collections_today)} tone="success" icon={CheckCircle2} hint="Simulated events" />
            </div>

            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,370px)] lg:grid-rows-[minmax(0,1fr)]">
              <Panel title="Live map" subtitle="Simulated vehicles, routes and bins" icon={MapIcon} tone="forest" scroll={false} bodyClassName="flex flex-col p-0" footer={<MiniLegend roadSnapped={live.routes.length > 0 && live.routes.every((r) => r.road_snapped)} />}>
                <div className="relative h-[55vh] min-h-[320px] lg:h-auto lg:min-h-0 lg:flex-1">
                  <div className="absolute inset-0">
                    <GarbageMap vehicles={live.vehicleList} bins={live.binList} routes={live.routes} selectedVehicleId={selV} selectedBinId={selB}
                      onSelectVehicle={pickVehicle} onSelectBin={pickBin} staff focus={focus} className="!h-full !min-h-0 !rounded-none !border-0" />
                  </div>
                </div>
              </Panel>

              <Panel scroll={false} bodyClassName="flex flex-col p-0">
                <div role="tablist" aria-label="CleanRoute panels" className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-line bg-paper px-1.5">
                  {TABS.map((tb) => (
                    <button key={tb.value} role="tab" aria-selected={tab === tb.value} onClick={() => setTab(tb.value)}
                      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[12.5px] font-semibold', tab === tb.value ? 'border-forest text-forest' : 'border-transparent text-muted hover:text-ink')}>
                      {tb.label}
                      {tb.value === 'alerts' && alertCount > 0 && <span className="rounded-full bg-critical-100 px-1.5 text-[11px] font-bold text-critical">{alertCount}</span>}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {tab === 'alerts' && (
                    <div className="p-3">
                      {alertsErr && <Notice tone="critical" className="mb-2 !px-3 !py-2 !text-[13px]">{alertsErr}</Notice>}
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-critical">Overflow risk ({overflow.length})</p>
                      {overflow.length ? (
                        <ul className="space-y-1">{overflow.map((b) => (
                          <li key={b.id}><button type="button" className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[13px] hover:bg-critical-100" onClick={() => { setSelB(b.id); focusOn(b) }}>
                            <span className="font-semibold">{b.code} <span className="font-normal text-muted">{b.locality}</span></span><span className="font-bold text-critical">{Math.round(num(b.fill_pct))}%</span></button></li>
                        ))}</ul>
                      ) : <p className="text-[13px] text-muted">None right now.</p>}
                      <p className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wide text-[#8a6118]">Collection recommended ({recommended.length})</p>
                      {recommended.length ? (
                        <ul className="space-y-1">{recommended.map((b) => (
                          <li key={b.id}><button type="button" className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[13px] hover:bg-warning-100" onClick={() => { setSelB(b.id); focusOn(b) }}>
                            <span className="font-semibold">{b.code} <span className="font-normal text-muted">{b.locality}</span></span>
                            <span className="text-right text-xs"><strong className="text-[13px]">{Math.round(num(b.fill_pct))}%</strong>{b.predicted_full_at && <span className="block text-muted">est. full ~{fmtClock(b.predicted_full_at)}</span>}</span></button></li>
                        ))}</ul>
                      ) : <p className="text-[13px] text-muted">None right now.</p>}
                      {missed.length > 0 && (
                        <>
                          <p className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wide text-muted">Missed collection ({missed.length})</p>
                          <ul className="space-y-1 text-[13px]">{missed.map((b) => <li key={b.id || b.code}><span className="font-semibold">{b.code}</span> <span className="text-muted">{b.reason || ''}</span></li>)}</ul>
                        </>
                      )}
                      <p className="mt-3 text-[11.5px] text-muted">Predicted full times are estimates from recent simulated readings.</p>
                    </div>
                  )}

                  {tab === 'vehicles' && (
                    <div className="space-y-3 p-3">
                      {vehicle && <VehiclePanel vehicle={vehicle} route={route} staff onClose={() => setSelV(null)} />}
                      <p className="text-[11px] text-muted">Driver labels are fictional and visible to staff only.</p>
                      {live.vehicleList.length ? (
                        <ul className="space-y-1.5">
                          {live.vehicleList.map((v) => (
                            <li key={v.id}>
                              <button type="button" onClick={() => { setSelV(v.id); focusOn(v) }}
                                className={cn('w-full rounded-[10px] border p-2.5 text-left transition-colors hover:bg-paper', selV === v.id ? 'border-civic bg-civic-50' : 'border-line')}>
                                <div className="flex items-center justify-between gap-2 text-[13px]">
                                  <span className="font-bold">{v.code}</span>
                                  <span className="truncate text-[12px] text-muted">{v.driver_label ? <>{v.driver_label} <span className="text-[10px] font-bold uppercase text-saffron">fictional</span></> : '-'}</span>
                                </div>
                                <p className="mt-0.5 truncate text-[12px] text-muted">{v.route?.name || '-'} · {v.current_task || v.status || '-'}</p>
                                <div className="mt-1.5 flex items-center gap-2 text-[12px]"><ProgressBar pct={v.route_progress_pct} /><span className="w-9 text-right">{Math.round(num(v.route_progress_pct))}%</span></div>
                                <p className="mt-1 truncate text-[11.5px] text-muted">Next: {v.next_stop || '-'}{v.eta_minutes != null ? ` (~${Math.round(v.eta_minutes)} min)` : ''} · {v.speed_kmh != null ? `${Math.round(v.speed_kmh)} km/h` : '-'} · {v.recorded_at ? timeAgo(v.recorded_at) : '-'}</p>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : <EmptyState title="No simulated vehicles" hint="Start the simulator (admin) to see vehicles move." />}

                      <div>
                        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">Route progress</p>
                        {routeProgress.length ? (
                          <ul className="divide-y divide-line rounded-[10px] border border-line">
                            {routeProgress.map(({ r, vs }) => (
                              <li key={r.id} className="px-3 py-2">
                                <div className="flex items-center justify-between text-[13px]"><span className="font-semibold">{r.name}</span><span className="text-[12px] text-muted">{r.schedule_window || 'No window'}</span></div>
                                {vs.length ? vs.map((v) => (
                                  <div key={v.id} className="mt-1 flex items-center gap-2 text-xs"><span className="w-14 font-medium">{v.code}</span><ProgressBar pct={v.route_progress_pct} /><span className="w-10 text-right">{Math.round(num(v.route_progress_pct))}%</span></div>
                                )) : <p className="mt-1 text-xs text-muted">No vehicle on this route right now.</p>}
                              </li>
                            ))}
                          </ul>
                        ) : <p className="text-[13px] text-muted">No routes loaded.</p>}
                      </div>
                    </div>
                  )}

                  {tab === 'bins' && <BinList bins={live.binList} selectedId={selB} onSelect={(b) => { setSelB(b.id); focusOn(b) }} filter={filter} onFilter={setFilter} />}

                  {tab === 'events' && (
                    <div>
                      {colErr && <div className="p-3"><Notice tone="critical" className="!px-3 !py-2 !text-[13px]">{colErr}</Notice></div>}
                      <p className="px-4 pt-3 text-[11px] text-muted">Last 20 events, simulated or staff recorded.</p>
                      {collections == null && !colErr ? <Spinner />
                        : collections?.length ? (
                          <ul className="divide-y divide-line">
                            {collections.map((c, i) => {
                              const bin = c.bin_code || c.bin?.code || binById[c.bin_id]?.code || `Bin ${c.bin_id ?? ''}`
                              const veh = c.vehicle_code || c.vehicle?.code || (c.vehicle_id != null ? live.vehicles[c.vehicle_id]?.code : null)
                              return (
                                <li key={c.id ?? i} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
                                  <span><span className="font-semibold">{bin}</span>{veh && <span className="text-muted"> by {veh}</span>}</span>
                                  <span className="text-xs text-muted">{timeAgo(c.collected_at || c.recorded_at || c.created_at || c.ts)}</span>
                                </li>
                              )
                            })}
                          </ul>
                        ) : <p className="px-4 py-3 text-[13px] text-muted">No collection events yet.</p>}
                    </div>
                  )}

                  {tab === 'record' && (
                    <div className="space-y-3 p-3">
                      {isAdmin && <SimControls />}
                      <ReadingForm bins={live.binList} onDone={afterWrite} />
                      <CollectionForm bins={live.binList} vehicles={live.vehicleList} onDone={afterWrite} />
                    </div>
                  )}
                </div>
              </Panel>
            </div>
          </>
        )}
    </Page>
  )
}
