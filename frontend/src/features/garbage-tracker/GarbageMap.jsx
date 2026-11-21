import { memo, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L, { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_ATTRIBUTION, TILE_URL } from '../../lib/leaflet'
import { useMeta } from '../../store/meta'
import { timeAgo, titleCase } from '../../lib/format'
import { BIN_STATES, DEMO_LABEL, binState, fmtClock, num, reportLink, validPos } from './shared'

const MAP_CSS = `
.gt-vehicle{transition:transform 1s linear}
.gt-truck{width:30px;height:30px;border-radius:8px;background:#2f5f8f;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center}
.gt-truck.sel{box-shadow:0 0 0 3px #244c39}
.gt-bin{display:block;width:16px;height:16px;border-radius:50%;border:2.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3);position:relative}
.gt-bin.sel{box-shadow:0 0 0 3px #303630}
.gt-bin.risk::after{content:'';position:absolute;inset:-7px;border-radius:50%;border:2px solid #b94a48;animation:gt-ring 1.4s ease-out infinite}
@keyframes gt-ring{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.3);opacity:0}}
`

const TRUCK_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 6h12v10H2z" fill="#fff"/><path d="M14 9h4l4 4v3h-8z" fill="#fff"/><circle cx="7" cy="17.5" r="2.2" fill="#fff" stroke="#2f5f8f" stroke-width="1.5"/><circle cx="17.5" cy="17.5" r="2.2" fill="#fff" stroke="#2f5f8f" stroke-width="1.5"/></svg>'

const iconCache = new Map()
function truckIcon(selected) {
  const k = `t${selected ? 1 : 0}`
  if (!iconCache.has(k)) {
    iconCache.set(k, L.divIcon({ className: 'gt-vehicle', html: `<div class="gt-truck${selected ? ' sel' : ''}">${TRUCK_SVG}</div>`, iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -16] }))
  }
  return iconCache.get(k)
}
function binIcon(state, selected) {
  const k = `b${state}${selected ? 1 : 0}`
  if (!iconCache.has(k)) {
    const cls = `gt-bin${state === 'overflow_risk' ? ' risk' : ''}${selected ? ' sel' : ''}`
    iconCache.set(k, L.divIcon({ className: '', html: `<span class="${cls}" style="background:${BIN_STATES[state].color}"></span>`, iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -10] }))
  }
  return iconCache.get(k)
}

function Resizer() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize()) : null
    ro?.observe(el)
    const t = setTimeout(() => map.invalidateSize(), 250)
    return () => { ro?.disconnect(); clearTimeout(t) }
  }, [map])
  return null
}

function Focus({ focus }) {
  const map = useMap()
  useEffect(() => {
    if (focus && Number.isFinite(focus.lat) && Number.isFinite(focus.lng)) map.panTo([focus.lat, focus.lng])
  }, [focus, map])
  return null
}

function FitButton({ routes }) {
  const map = useMap()
  const fit = () => {
    const pts = routes.flatMap((r) => (r.waypoints || []).filter((p) => Array.isArray(p) && p.length >= 2))
    if (pts.length) map.fitBounds(pts, { padding: [30, 30] })
  }
  if (!routes.length) return null
  return (
    <button type="button" onClick={fit} className="absolute bottom-6 left-3 z-[1000] rounded-md border border-line-strong bg-white px-2.5 py-1 text-xs font-semibold text-ink hover:bg-paper">
      Fit to routes
    </button>
  )
}

const VehicleMarker = memo(function VehicleMarker({ v, selected, onSelect, staff }) {
  return (
    <Marker position={[num(v.latitude), num(v.longitude)]} icon={truckIcon(selected)} zIndexOffset={1000} eventHandlers={{ click: () => onSelect?.(v.id) }}>
      <Popup>
        <div className="space-y-0.5 text-[13px]">
          <p className="font-bold">{v.code} <span className="text-[10px] font-bold text-saffron">SIMULATED</span></p>
          <p>{v.route?.name || 'No route'}</p>
          <p>Task: {titleCase(v.current_task || v.status || 'unknown')}</p>
          <p>Speed: {v.speed_kmh != null ? `${Math.round(v.speed_kmh)} km/h (simulated)` : '-'}</p>
          <p>Progress: {v.route_progress_pct != null ? `${Math.round(v.route_progress_pct)}%` : '-'}</p>
          <p>Next stop: {v.next_stop || '-'}{v.eta_minutes != null ? ` (ETA ~${Math.round(v.eta_minutes)} min, simulated)` : ''}</p>
          {staff && v.driver_label && <p>Driver: {v.driver_label}</p>}
        </div>
      </Popup>
    </Marker>
  )
})

const BinMarker = memo(function BinMarker({ b, selected, onSelect, showReport }) {
  const st = binState(b)
  const s = BIN_STATES[st]
  const full = b.predicted_full_at ? fmtClock(b.predicted_full_at) : null
  return (
    <Marker position={[num(b.latitude), num(b.longitude)]} icon={binIcon(st, selected)} eventHandlers={{ click: () => onSelect?.(b.id) }}>
      <Popup>
        <div className="space-y-0.5 text-[13px]">
          <p className="font-bold">{b.code}{b.name ? ` - ${b.name}` : ''}</p>
          {b.locality && <p>{b.locality}</p>}
          <p>Fill: <strong>{Math.round(num(b.fill_pct))}%</strong> - {s.label}</p>
          <p className="text-muted">Source: {b.source || 'simulated'}{b.recorded_at ? `, ${timeAgo(b.recorded_at)}` : ''}</p>
          {full && <p className="text-muted">Estimated full around {full} (estimate only)</p>}
          {showReport && (
            <Link to={reportLink(b)} className="mt-1 inline-block rounded-md bg-forest px-2.5 py-1 text-xs font-semibold !text-white">Report overflowing bin</Link>
          )}
        </div>
      </Popup>
    </Marker>
  )
})

export default function GarbageMap({ vehicles = [], bins = [], routes = [], selectedVehicleId, selectedBinId, onSelectVehicle, onSelectBin, showReport = false, staff = false, focus, className = '', fill = false }) {
  const meta = useMeta((s) => s.meta)
  const center = meta?.map?.center?.length === 2 ? meta.map.center : DEFAULT_CENTER
  const zoom = DEFAULT_ZOOM
  const lines = useMemo(() => routes.map((r) => ({ id: r.id, name: r.name, snapped: !!r.road_snapped, pts: (r.waypoints || []).filter((p) => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))) })).filter((r) => r.pts.length > 1), [routes])

  return (
    <div className={fill ? `absolute inset-0 overflow-hidden ${className}` : `relative h-[60vh] min-h-[360px] overflow-hidden rounded-[10px] border border-line ${className}`}>
      <style>{MAP_CSS}</style>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom className="h-full w-full">
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <Resizer />
        <Focus focus={focus} />
        <FitButton routes={routes} />
        {lines.map((r) => (
          <Polyline key={r.id} positions={r.pts.map((p) => [Number(p[0]), Number(p[1])])} pathOptions={r.snapped ? { color: '#2f5f8f', weight: 4, opacity: 0.9 } : { color: '#2f5f8f', weight: 3, dashArray: '8 8', opacity: 0.85 }}>
            <Popup><p className="text-[13px] font-semibold">{r.name}</p><p className="text-xs text-muted">{r.snapped ? 'Follows real roads (OpenStreetMap routing).' : 'Straight demo line: road routing was unavailable.'}</p></Popup>
          </Polyline>
        ))}
        {bins.filter(validPos).map((b) => (
          <BinMarker key={`b${b.id}`} b={b} selected={selectedBinId === b.id} onSelect={onSelectBin} showReport={showReport} />
        ))}
        {vehicles.filter(validPos).map((v) => (
          <VehicleMarker key={`v${v.id}`} v={v} selected={selectedVehicleId === v.id} onSelect={onSelectVehicle} staff={staff} />
        ))}
      </MapContainer>
      <div className="pointer-events-none absolute right-3 top-3 z-[1000] rounded-md border border-dashed border-saffron/60 bg-saffron-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-saffron">
        {DEMO_LABEL}
      </div>
    </div>
  )
}
