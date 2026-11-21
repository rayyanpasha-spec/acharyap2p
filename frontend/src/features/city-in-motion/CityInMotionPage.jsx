// City in Motion: a visual layer on top of the existing CivicLens data (complaints, CleanRoute vehicles, routes, bins).
// Orchestrates data hooks, the single MapLibre map, the rail, the details panel and the list alternative. No records are invented here.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { List, Map as MapIcon, Play, Square, X } from 'lucide-react'
import { Button, Notice, cn, toast } from '../../components/ui'
import { errMsg } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { useMeta } from '../../store/meta'
import CityMap from './components/CityMap'
import ComplaintFilters, { filterOptions } from './components/ComplaintFilters'
import DataSourceBadge from './components/DataSourceBadge'
import LeafletFallbackMap from './components/LeafletFallbackMap'
import ListView from './components/ListView'
import MapLayerControl from './components/MapLayerControl'
import MapLegend from './components/MapLegend'
import MapToolbar from './components/MapToolbar'
import PlaceSearch from './components/PlaceSearch'
import SelectedFeaturePanel from './components/SelectedFeaturePanel'
import StatusChips from './components/StatusChips'
import TopBar from './components/TopBar'
import { useCityMapData } from './hooks/useCityMapData'
import { useGarbageLiveFeed } from './hooks/useGarbageLiveFeed'
import { useMapSelection } from './hooks/useMapSelection'
import { useMedia } from './hooks/useMedia'
import * as svc from './services/cityTwinApi'
import { isVehicleStale, splitComplaints } from './utils/geojson'
import { DEFAULT_SIM_LABEL, DEFAULT_VIEW, EMPTY_FILTERS, TILT_PITCH, VIEW_PRESETS } from './utils/mapConfig'

/* ---------- helpers ---------- */
function Section({ title, children, action }) {
  return (
    <section className="border-b border-line px-4 py-3.5 last:border-b-0">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function mergeView(md) {
  const c = md?.center
  const ok = Array.isArray(c) && Number.isFinite(+c[0]) && Number.isFinite(+c[1]) && Math.abs(+c[0]) <= 180 && Math.abs(+c[1]) <= 90
  return {
    center: ok ? [+c[0], +c[1]] : DEFAULT_VIEW.center,
    // zoom/pitch/bearing are fixed to the close 3D camera: the server's zoom 12 is the report-form default and shows no 3D
    zoom: DEFAULT_VIEW.zoom,
    pitch: DEFAULT_VIEW.pitch,
    bearing: DEFAULT_VIEW.bearing,
  }
}

export default function CityInMotionPage() {
  const user = useAuth((s) => s.user)
  const homePath = useAuth((s) => s.homePath)
  const meta = useMeta((s) => s.meta)
  const [params, setParams] = useSearchParams()
  const isDesktop = useMedia('(min-width: 1024px)')
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)')
  const flatStart = useRef(typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches).current

  const view = params.get('view') === 'cleanroute' ? 'cleanroute' : 'issues'
  const [layers, setLayers] = useState(() => ({ ...VIEW_PRESETS[view] }))
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [tab, setTab] = useState('map') // 'map' | 'list'
  const [railOpen, setRailOpen] = useState(false)
  const [cam, setCam] = useState({ pitch: flatStart ? 0 : DEFAULT_VIEW.pitch, bearing: DEFAULT_VIEW.bearing })
  const [vehicleMode, setVehicleMode] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [staleTick, setStaleTick] = useState(0)

  const rootRef = useRef(null)
  const mapRef = useRef(null)
  const { selection, select, clear } = useMapSelection()

  useEffect(() => { document.title = 'City in Motion | CivicLens' }, [])

  /* ---------- data ---------- */
  const includeResolved = layers.resolved || filters.status === 'resolved'
  const data = useCityMapData({ filters, includeResolved })
  const { summary, status } = data

  const pollCount = useRef(0)
  const { refreshLive, reloadComplaints } = data
  const handlers = useMemo(() => ({
    snapshot: data.live.snapshot,
    vehicle: data.live.vehicle,
    bin: data.live.bin,
    complaint: data.live.complaint,
    poll: () => { refreshLive(); pollCount.current += 1; if (pollCount.current % 6 === 0) reloadComplaints() },
  }), [data.live, refreshLive, reloadComplaints])
  const feed = useGarbageLiveFeed({ enabled: true, handlers })

  // local staleness clock (no animation of stale vehicles; label "Location may be outdated")
  useEffect(() => {
    const t = setInterval(() => setStaleTick((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [])
  const vehicles = useMemo(() => {
    const now = Date.now()
    return data.vehicles.map((v) => ({ ...v, stale: isVehicleStale(v, now) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.vehicles, staleTick])
  const bins = data.bins
  const split = useMemo(() => splitComplaints(data.complaints), [data.complaints])

  /* ---------- derived ---------- */
  const defaultView = useMemo(() => mergeView(summary?.map_default), [summary?.map_default])
  const options = useMemo(() => filterOptions(data.layersConfig, meta), [data.layersConfig, meta])
  const c = summary?.counts || {}
  const counts = {
    active: c.complaints_active ?? (status.complaints === 'ok' ? split.active.features.length : null),
    critical: c.critical,
    high: c.high,
    vehicles: vehicles.length ? vehicles.filter((v) => !v.stale && v.status !== 'offline').length : c.vehicles_active,
    binsRisk: bins.length ? bins.filter((b) => b.status === 'overflow_risk').length : c.bins_overflow_risk,
  }
  const layerCounts = { complaints: counts.active, resolved: c.complaints_resolved, vehicles: vehicles.length || null, bins: bins.length || null }
  const simulated = !!(summary?.demo_mode || data.sources.vehicles?.simulated || data.sources.bins?.simulated)
  const sources = summary?.data_sources || {
    complaints: 'civiclens_database',
    vehicles: data.sources.vehicles?.simulated ? 'simulated' : null,
    bins: data.sources.bins?.simulated ? 'simulated' : null,
  }
  const anyError = Object.values(status).some((s) => s === 'error')
  const pitched = cam.pitch > 20

  const coordsFor = useCallback((type, id) => {
    if (type === 'complaint') return data.complaints.features.find((f) => f.properties.ticket_id === id)?.geometry.coordinates || null
    if (type === 'bin') { const b = bins.find((x) => String(x.bin_id) === id); return b ? [+b.longitude, +b.latitude] : null }
    if (type === 'vehicle') { const v = vehicles.find((x) => String(x.vehicle_id) === id); return v ? [+v.longitude, +v.latitude] : null }
    return null
  }, [data.complaints, bins, vehicles])
  const selectedPoint = useMemo(() => (selection ? coordsFor(selection.type, selection.id) : null), [selection, coordsFor])

  const flash = useMemo(() => {
    const ch = data.lastComplaintChange
    return ch ? { ticket: ch.ticket, status: ch.status, severity: ch.severity, nonce: ch.nonce } : null
  }, [data.lastComplaintChange])
  const panelRefreshKey = data.lastComplaintChange && selection?.type === 'complaint' && data.lastComplaintChange.ticket === selection.id ? data.lastComplaintChange.nonce : 0

  /* ---------- actions ---------- */
  const setView = (v) => {
    if (v === view) return
    setParams((p) => { const n = new URLSearchParams(p); n.set('view', v); return n }, { replace: true })
    setLayers({ ...VIEW_PRESETS[v] })
    clear()
  }
  const toggleLayer = (id, on) => setLayers((l) => ({ ...l, [id]: on }))
  const changeFilters = (patch) => {
    setFilters((f) => ({ ...f, ...patch }))
    if (patch.status === 'resolved') setLayers((l) => ({ ...l, resolved: true }))
  }
  const toggleSeverity = (sev) => changeFilters({ severity: filters.severity === sev ? '' : sev })

  const onMapSelect = useCallback((type, id) => select(type, id), [select])
  const onListSelect = (type, id) => {
    select(type, id)
    setTab('map')
    const pt = coordsFor(type, String(id))
    if (pt) requestAnimationFrame(() => mapRef.current?.flyTo(pt, type === 'vehicle' ? 15.5 : 16))
  }
  const onCamera = useCallback((c2) => setCam({ pitch: c2.pitch, bearing: c2.bearing }), [])
  const togglePitch = () => mapRef.current?.setPitch(pitched ? 0 : TILT_PITCH)
  const mapApi = useCallback(() => mapRef.current, [])

  const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled
  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else rootRef.current?.requestFullscreen?.().catch(() => {})
  }

  const onPlace = ({ lat, lng }) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    setTab('map'); setRailOpen(false)
    mapRef.current?.flyTo([lng, lat], 15)
  }

  const [simBusy, setSimBusy] = useState(false)
  const runSim = async (start) => {
    setSimBusy(true)
    try {
      await (start ? svc.startSimulation() : svc.stopSimulation())
      toast.success(start ? 'Simulation started.' : 'Simulation stopped.')
      setTimeout(() => refreshLive(), 1500)
    } catch (e) { toast.error(errMsg(e, 'Could not change the simulation state.')) } finally { setSimBusy(false) }
  }

  /* ---------- rail ---------- */
  const rail = (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <Section title="Find a place"><PlaceSearch signedIn={!!user} onPick={onPlace} /></Section>
      <Section title="Layers"><MapLayerControl layers={layers} onToggle={toggleLayer} counts={layerCounts} /></Section>
      {(view === 'issues' || layers.complaints) && (
        <Section title="Filters">
          <ComplaintFilters filters={filters} onChange={changeFilters} options={options} signedIn={!!user} />
        </Section>
      )}
      <Section title="Legend"><MapLegend layers={layers} /></Section>
      {user?.role === 'admin' && view === 'cleanroute' && (
        <Section title="Simulation (admin)">
          <p className="mb-2 text-xs text-muted">Starts or stops the demo vehicle simulator. Positions remain simulated.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" loading={simBusy} onClick={() => runSim(true)}><Play className="h-3.5 w-3.5" aria-hidden /> Start</Button>
            <Button size="sm" variant="secondary" disabled={simBusy} onClick={() => runSim(false)}><Square className="h-3.5 w-3.5" aria-hidden /> Stop</Button>
          </div>
        </Section>
      )}
      <p className="mt-auto px-4 py-3 text-[11px] leading-relaxed text-muted">
        Map data: OpenFreeMap, &copy; OpenMapTiles, data from OpenStreetMap. Issue locations are approximate for public viewers.
      </p>
    </div>
  )

  const panel = selection && (
    <SelectedFeaturePanel
      selection={selection} user={user} vehicles={vehicles} bins={bins}
      refreshKey={panelRefreshKey} onClose={clear} onRefreshLive={refreshLive}
      className="min-h-0 flex-1"
    />
  )

  const mapFallback = (
    <LeafletFallbackMap active={split.active} resolved={split.resolved} routes={data.routes} bins={bins} vehicles={vehicles}
      layers={layers} selection={selection} onSelect={onMapSelect} />
  )

  return (
    <div ref={rootRef} className="fixed inset-0 flex flex-col bg-paper text-ink">
      <h1 className="sr-only">City in Motion: live map of civic issues and sanitation operations in Bengaluru</h1>
      <TopBar view={view} onView={setView} user={user} homePath={homePath} railOpen={railOpen} onToggleRail={() => setRailOpen((o) => !o)} />

      {simulated && (
        <div role="status" className="z-20 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-saffron/30 bg-saffron-100 px-3 py-1.5 sm:px-4">
          <p className="text-[13px] font-semibold text-[#8A4F13]">{summary?.simulation_label || DEFAULT_SIM_LABEL}</p>
          <div className="hidden items-center gap-1.5 md:flex" aria-label="Data sources">
            <span className="text-xs text-muted">Sources:</span>
            <DataSourceBadge source={sources.complaints} kind="complaint" />
            <DataSourceBadge source={sources.vehicles} kind="vehicle" />
            <DataSourceBadge source={sources.bins} kind="bin" />
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* left rail: fixed on desktop, slide-over drawer on tablet/mobile */}
        {isDesktop ? (
          <aside aria-label="Layers, filters and legend" className="flex w-[290px] shrink-0 flex-col border-r border-line bg-paper">{rail}</aside>
        ) : railOpen && (
          <>
            <div className="absolute inset-0 z-30 bg-ink/30" onClick={() => setRailOpen(false)} aria-hidden />
            <aside aria-label="Layers, filters and legend" className="absolute inset-y-0 left-0 z-40 flex w-[310px] max-w-[88vw] flex-col border-r border-line bg-paper">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <p className="font-display text-sm font-bold">Layers and filters</p>
                <button type="button" onClick={() => setRailOpen(false)} aria-label="Close layers and filters" className="rounded-lg p-1.5 text-muted hover:bg-surface"><X className="h-5 w-5" aria-hidden /></button>
              </div>
              {rail}
            </aside>
          </>
        )}

        <main className="relative min-w-0 flex-1" aria-label="Map">
          <CityMap
            ref={mapRef}
            data={{ active: split.active, resolved: split.resolved, routes: data.routes, bins, vehicles }}
            layers={layers} selection={selection} selectedPoint={selectedPoint}
            onSelect={onMapSelect} onClear={clear}
            defaultView={defaultView} flatStart={flatStart} flash={flash}
            loading={data.initialLoading}
            onVehicleMode={(mode) => setVehicleMode(mode)} onCamera={onCamera}
            fallback={mapFallback} reducedMotion={reducedMotion}
          />

          {tab === 'list' && (
            <ListView
              view={view} complaints={split.active} resolved={split.resolved} layers={layers} vehicles={vehicles} bins={bins}
              selection={selection} onSelect={onListSelect} status={status} onRetry={data.reload}
            />
          )}

          {/* overlays: map/list switch + counts + notices */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-3 pr-16">
            <div className="pointer-events-auto inline-flex w-fit rounded-[10px] border border-line-strong bg-surface p-0.5" role="group" aria-label="Map or list">
              {[['map', 'Map', MapIcon], ['list', 'List', List]].map(([id, label, Icon]) => (
                <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}
                  className={cn('inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-semibold', tab === id ? 'bg-forest text-white' : 'text-ink hover:bg-paper')}>
                  <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
                </button>
              ))}
            </div>
            <div className="pointer-events-auto max-w-full">
              <StatusChips counts={counts} severityFilter={filters.severity} onSeverity={toggleSeverity} liveState={feed.state} polling={feed.polling} />
            </div>
            {anyError && (
              <div className="pointer-events-auto max-w-md">
                <Notice tone="warning" className="!px-3 !py-2 text-[13px]">
                  <span className="flex flex-wrap items-center gap-2">Some map data could not be loaded.
                    <button type="button" onClick={data.reload} className="font-semibold text-civic underline">Retry</button></span>
                </Notice>
              </div>
            )}
            {vehicleMode === '2d' && layers.vehicles && (
              <p className="pointer-events-auto w-fit rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-xs text-muted">3D vehicle rendering is unavailable on this device. Showing 2D vehicle symbols.</p>
            )}
            {status.complaints === 'ok' && layers.complaints && split.active.features.length === 0 && (
              <p className="pointer-events-auto w-fit rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-xs text-muted">No civic issues match the current filters.</p>
            )}
          </div>

          {tab === 'map' && (
            <div className="absolute right-3 top-3 z-20">
              <MapToolbar api={mapApi} pitched={pitched} bearing={cam.bearing} fullscreen={fullscreen}
                onToggleFullscreen={canFullscreen ? toggleFullscreen : null} onTogglePitch={togglePitch} />
            </div>
          )}

          {/* mobile / tablet: bottom sheet */}
          {!isDesktop && selection && (
            <div className="absolute inset-x-0 bottom-0 z-30 flex max-h-[68%] flex-col overflow-hidden rounded-t-[14px] border border-b-0 border-line-strong bg-surface">
              <span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden />
              {panel}
            </div>
          )}
        </main>

        {isDesktop && selection && (
          <div className="flex w-[380px] shrink-0 flex-col border-l border-line bg-surface">{panel}</div>
        )}
      </div>
    </div>
  )
}
