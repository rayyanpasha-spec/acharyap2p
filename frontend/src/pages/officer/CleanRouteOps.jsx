import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, CardBody, CardHeader, DemoTag, EmptyState, ErrorState, Field, Input, Notice, PageHeader, Select, Spinner, Table, Td, Th, toast } from '../../components/ui'
import { api, errMsg } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { timeAgo } from '../../lib/format'
import { useGarbageLive } from '../../features/garbage-tracker/useGarbageLive'
import GarbageMap from '../../features/garbage-tracker/GarbageMap'
import VehiclePanel, { ProgressBar } from '../../features/garbage-tracker/VehiclePanel'
import BinList from '../../features/garbage-tracker/BinList'
import Legend from '../../features/garbage-tracker/Legend'
import { DemoBanner, LiveStatusBar, SummaryStats } from '../../features/garbage-tracker/StatusBits'
import { asList, binState, fmtClock, num } from '../../features/garbage-tracker/shared'

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

export default function CleanRouteOps() {
  const user = useAuth((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const live = useGarbageLive()
  const [selV, setSelV] = useState(null)
  const [selB, setSelB] = useState(null)
  const [focus, setFocus] = useState(null)
  const [filter, setFilter] = useState('all')
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

  const overflow = asList(alerts?.overflow_risk).length ? asList(alerts?.overflow_risk) : live.binList.filter((b) => binState(b) === 'overflow_risk')
  const recommended = live.binList.filter((b) => binState(b) === 'collection_recommended')
  const missed = asList(alerts?.missed_collection)
  const routeProgress = live.routes.map((r) => ({ r, vs: live.vehicleList.filter((v) => v.route?.id === r.id) }))

  return (
    <div>
      <PageHeader title="CleanRoute operations" subtitle="Simulated vehicle, route and bin monitoring for staff." actions={<DemoTag kind="simulated" />} />
      <DemoBanner />
      <LiveStatusBar conn={live.conn} polling={live.polling} lastUpdated={live.lastUpdated} stale={live.stale} sourceLabel={live.sourceLabel} error={hasData ? null : live.error} onRetry={live.refresh} />

      {live.loading && !hasData ? <Spinner label="Loading CleanRoute demo data..." />
        : live.error && !hasData ? <Card><ErrorState message={live.error} onRetry={live.refresh} /></Card>
        : (
          <>
            <SummaryStats summary={live.summary} />
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-4">
                <GarbageMap vehicles={live.vehicleList} bins={live.binList} routes={live.routes} selectedVehicleId={selV} selectedBinId={selB}
                  onSelectVehicle={setSelV} onSelectBin={setSelB} staff focus={focus} />
                <Legend />
                {vehicle && <VehiclePanel vehicle={vehicle} route={route} staff onClose={() => setSelV(null)} />}

                <Card>
                  <CardHeader title="Active vehicles" subtitle="Driver labels are fictional and visible to staff only" />
                  {live.vehicleList.length ? (
                    <Table>
                      <thead><tr><Th>Vehicle</Th><Th>Driver</Th><Th>Route</Th><Th>Task</Th><Th>Progress</Th><Th>Next stop</Th><Th>Speed</Th><Th>Updated</Th></tr></thead>
                      <tbody>
                        {live.vehicleList.map((v) => (
                          <tr key={v.id} className="cursor-pointer hover:bg-paper" onClick={() => { setSelV(v.id); focusOn(v) }}>
                            <Td className="font-bold">{v.code}</Td>
                            <Td>{v.driver_label ? <>{v.driver_label} <span className="text-[10px] font-bold uppercase text-saffron">fictional</span></> : '-'}</Td>
                            <Td>{v.route?.name || '-'}</Td>
                            <Td>{v.current_task || v.status || '-'}</Td>
                            <Td className="min-w-[120px]"><div className="flex items-center gap-2"><ProgressBar pct={v.route_progress_pct} /><span className="text-xs">{Math.round(num(v.route_progress_pct))}%</span></div></Td>
                            <Td>{v.next_stop || '-'}{v.eta_minutes != null ? ` (~${Math.round(v.eta_minutes)} min)` : ''}</Td>
                            <Td>{v.speed_kmh != null ? `${Math.round(v.speed_kmh)} km/h` : '-'}</Td>
                            <Td className="text-muted">{v.recorded_at ? timeAgo(v.recorded_at) : '-'}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  ) : <EmptyState title="No simulated vehicles" hint="Start the simulator (admin) to see vehicles move." />}
                </Card>

                <Card>
                  <CardHeader title="Route progress" subtitle="Per route, from simulated vehicle positions" />
                  {routeProgress.length ? (
                    <ul className="divide-y divide-line">
                      {routeProgress.map(({ r, vs }) => (
                        <li key={r.id} className="px-4 py-3 sm:px-5">
                          <div className="flex items-center justify-between text-sm"><span className="font-semibold">{r.name}</span><span className="text-muted">{r.schedule_window || 'No window'}</span></div>
                          {vs.length ? vs.map((v) => (
                            <div key={v.id} className="mt-1.5 flex items-center gap-2 text-xs"><span className="w-16 font-medium">{v.code}</span><ProgressBar pct={v.route_progress_pct} /><span className="w-10 text-right">{Math.round(num(v.route_progress_pct))}%</span></div>
                          )) : <p className="mt-1 text-xs text-muted">No vehicle on this route right now.</p>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="px-5 py-4 text-sm text-muted">No routes loaded.</p>}
                </Card>
              </div>

              <div className="space-y-4">
                {isAdmin && <SimControls />}

                <Card>
                  <CardHeader title="Bin alerts" subtitle="Overflow risk and collection recommended" />
                  {alertsErr && <div className="px-4 pt-3"><Notice tone="critical">{alertsErr}</Notice></div>}
                  <div className="px-4 py-3 sm:px-5">
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-critical">Overflow risk ({overflow.length})</p>
                    {overflow.length ? (
                      <ul className="space-y-1">{overflow.map((b) => (
                        <li key={b.id}><button type="button" className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm hover:bg-critical-100" onClick={() => { setSelB(b.id); focusOn(b) }}>
                          <span className="font-semibold">{b.code} <span className="font-normal text-muted">{b.locality}</span></span><span className="font-bold text-critical">{Math.round(num(b.fill_pct))}%</span></button></li>
                      ))}</ul>
                    ) : <p className="text-sm text-muted">None right now.</p>}
                    <p className="mb-1 mt-3 text-xs font-bold uppercase tracking-wide text-[#8a6118]">Collection recommended ({recommended.length})</p>
                    {recommended.length ? (
                      <ul className="space-y-1">{recommended.map((b) => (
                        <li key={b.id}><button type="button" className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm hover:bg-warning-100" onClick={() => { setSelB(b.id); focusOn(b) }}>
                          <span className="font-semibold">{b.code} <span className="font-normal text-muted">{b.locality}</span></span>
                          <span className="text-right text-xs"><strong className="text-sm">{Math.round(num(b.fill_pct))}%</strong>{b.predicted_full_at && <span className="block text-muted">est. full ~{fmtClock(b.predicted_full_at)}</span>}</span></button></li>
                      ))}</ul>
                    ) : <p className="text-sm text-muted">None right now.</p>}
                    {missed.length > 0 && (
                      <>
                        <p className="mb-1 mt-3 text-xs font-bold uppercase tracking-wide text-muted">Missed collection ({missed.length})</p>
                        <ul className="space-y-1 text-sm">{missed.map((b) => <li key={b.id || b.code}><span className="font-semibold">{b.code}</span> <span className="text-muted">{b.reason || ''}</span></li>)}</ul>
                      </>
                    )}
                    <p className="mt-3 text-xs text-muted">Predicted full times are estimates from recent simulated readings.</p>
                  </div>
                </Card>

                <Card>
                  <CardHeader title="Recent collection events" subtitle="Last 20, simulated or staff recorded" />
                  {colErr && <div className="p-4"><Notice tone="critical">{colErr}</Notice></div>}
                  {collections == null && !colErr ? <Spinner />
                    : collections?.length ? (
                      <ul className="max-h-72 divide-y divide-line overflow-y-auto">
                        {collections.map((c, i) => {
                          const bin = c.bin_code || c.bin?.code || binById[c.bin_id]?.code || `Bin ${c.bin_id ?? ''}`
                          const veh = c.vehicle_code || c.vehicle?.code || (c.vehicle_id != null ? live.vehicles[c.vehicle_id]?.code : null)
                          return (
                            <li key={c.id ?? i} className="flex items-center justify-between gap-2 px-4 py-2 text-sm sm:px-5">
                              <span><span className="font-semibold">{bin}</span>{veh && <span className="text-muted"> by {veh}</span>}</span>
                              <span className="text-xs text-muted">{timeAgo(c.collected_at || c.recorded_at || c.created_at || c.ts)}</span>
                            </li>
                          )
                        })}
                      </ul>
                    ) : <p className="px-5 py-4 text-sm text-muted">No collection events yet.</p>}
                </Card>

                <ReadingForm bins={live.binList} onDone={afterWrite} />
                <CollectionForm bins={live.binList} vehicles={live.vehicleList} onDone={afterWrite} />

                <Card className="overflow-hidden">
                  <CardHeader title="All bins" subtitle="Sorted by fill level" />
                  <div className="max-h-[50vh] overflow-y-auto">
                    <BinList bins={live.binList} selectedId={selB} onSelect={(b) => { setSelB(b.id); focusOn(b) }} filter={filter} onFilter={setFilter} />
                  </div>
                </Card>
              </div>
            </div>
          </>
        )}
    </div>
  )
}
