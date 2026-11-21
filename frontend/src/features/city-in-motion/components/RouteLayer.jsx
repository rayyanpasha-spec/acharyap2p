// Collection routes: thin, calm lines. Completed part muted green, remaining part civic blue, next stop highlighted.
// The split is computed client-side from the server's route_progress (0-100) by simple along-line maths.
import { useEffect, useMemo } from 'react'
import { emptyFC, lineFC } from '../utils/geojson'
import { LYR, ROUTE_COLORS, SRC } from '../utils/mapConfig'
import { prepareRoute, progressFraction, splitRoute } from '../utils/routeMath'

const IDS = [LYR.routeCasing, LYR.routeDone, LYR.routeRemaining, LYR.routeLabel, LYR.nextStop, LYR.nextStopLabel]

/** Resolve the vehicle's next stop (a text label from the server) to a bin location. Never guesses: no match, no highlight. */
export function findNextStop(vehicle, bins) {
  const label = String(vehicle?.next_stop || '').trim().toLowerCase()
  if (!label) return null
  const hit = (bins || []).find((b) => {
    const code = String(b.bin_code || '').toLowerCase()
    const name = String(b.public_label || '').toLowerCase()
    return (code && label.includes(code)) || (name && (label.includes(name) || name.includes(label)))
  })
  return hit ? { lngLat: [+hit.longitude, +hit.latitude], label: hit.public_label || hit.bin_code, code: hit.bin_code } : null
}

export default function RouteLayer({ map, fonts, routes, vehicles, bins, visible }) {
  const prepared = useMemo(() => {
    const out = []
    for (const f of routes?.features || []) {
      const prep = prepareRoute(f.geometry.coordinates)
      if (prep) out.push({ props: f.properties || {}, id: String(f.properties?.route_id ?? f.id ?? out.length), prep })
    }
    return out
  }, [routes])

  useEffect(() => {
    try {
      map.addSource(SRC.routesRemaining, { type: 'geojson', data: emptyFC() })
      map.addSource(SRC.routesDone, { type: 'geojson', data: emptyFC() })
      map.addSource(SRC.nextStop, { type: 'geojson', data: emptyFC() })
      const w = ['interpolate', ['linear'], ['zoom'], 10, 1.4, 15, 3, 18, 5]
      map.addLayer({ id: LYR.routeCasing, type: 'line', source: SRC.routesRemaining, layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' }, paint: { 'line-color': ROUTE_COLORS.casing, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 5.5, 18, 8], 'line-opacity': 0.75 } })
      map.addLayer({ id: LYR.routeDone, type: 'line', source: SRC.routesDone, layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' }, paint: { 'line-color': ROUTE_COLORS.done, 'line-width': w, 'line-opacity': 0.95 } })
      map.addLayer({ id: LYR.routeRemaining, type: 'line', source: SRC.routesRemaining, layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' }, paint: { 'line-color': ROUTE_COLORS.remaining, 'line-width': w, 'line-opacity': 0.85 } })
      map.addLayer({
        id: LYR.routeLabel, type: 'symbol', source: SRC.routesRemaining, minzoom: 13,
        layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': fonts.regular, 'text-size': 11, 'symbol-spacing': 420, visibility: 'none' },
        paint: { 'text-color': '#2F5F8F', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.6 },
      })
      map.addLayer({ id: LYR.nextStop, type: 'circle', source: SRC.nextStop, layout: { visibility: 'none' }, paint: { 'circle-radius': 15, 'circle-color': 'rgba(193,120,46,0.12)', 'circle-stroke-color': '#C1782E', 'circle-stroke-width': 2.5 } })
      map.addLayer({
        id: LYR.nextStopLabel, type: 'symbol', source: SRC.nextStop, minzoom: 12,
        layout: { 'text-field': 'Next stop', 'text-font': fonts.bold, 'text-size': 11, 'text-offset': [0, -2.1], 'text-anchor': 'bottom', 'text-allow-overlap': true, visibility: 'none' },
        paint: { 'text-color': '#8A4F13', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.6 },
      })
    } catch (e) { console.warn('[city-in-motion] route layers failed', e) }
    return () => {
      try {
        IDS.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id) })
        ;[SRC.routesRemaining, SRC.routesDone, SRC.nextStop].forEach((id) => { if (map.getSource(id)) map.removeSource(id) })
      } catch { /* map already removed */ }
    }
  }, [map, fonts])

  // split by progress of the vehicle currently driving each route
  useEffect(() => {
    const done = []
    const remaining = []
    const stops = []
    for (const r of prepared) {
      const veh = (vehicles || []).find((v) => String(v.route_id) === r.id && v.route_progress != null)
      const frac = veh ? progressFraction(veh.route_progress) : null
      const base = { route_id: r.id, name: r.props.name || r.props.route_code || '', route_code: r.props.route_code || '' }
      if (frac == null) {
        remaining.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: r.prep.coords }, properties: base })
      } else {
        const { completed, remaining: rem } = splitRoute(r.prep, frac)
        if (completed.length > 1) done.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: completed }, properties: base })
        if (rem.length > 1) remaining.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: rem }, properties: base })
      }
      if (veh) {
        const ns = findNextStop(veh, bins)
        if (ns) stops.push({ type: 'Feature', geometry: { type: 'Point', coordinates: ns.lngLat }, properties: { label: ns.label } })
      }
    }
    try {
      map.getSource(SRC.routesDone)?.setData(lineFC(done))
      map.getSource(SRC.routesRemaining)?.setData(lineFC(remaining))
      map.getSource(SRC.nextStop)?.setData(lineFC(stops))
    } catch { /* ignore */ }
  }, [map, prepared, vehicles, bins])

  useEffect(() => {
    IDS.forEach((id) => { try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none') } catch { /* ignore */ } })
  }, [map, visible])

  return null
}
