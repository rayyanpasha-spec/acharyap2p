// Real 3D solids for the MapLibre scene (fill-extrusion): complaint pillars and bin towers.
// Pure functions, no React / MapLibre imports. Heights are visual encodings, not measurements:
//   complaint pillar height = severity (tall = more severe);  bin tower height = fill level.
import { BIN_STATUS, SEVERITY } from './mapConfig'

const M_PER_DEG_LAT = 111320

/** Square footprint (GeoJSON ring) of `sideM` metres centred on [lng, lat]. */
export function squarePolygon([lng, lat], sideM) {
  const dLat = sideM / 2 / M_PER_DEG_LAT
  const dLng = sideM / 2 / (M_PER_DEG_LAT * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))
  return [[[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]]]
}

const SEVERITY_HEIGHT_M = { critical: 180, high: 125, medium: 85, low: 50 }

export function complaintPillars(fc) {
  const features = []
  for (const f of fc?.features || []) {
    const c = f?.geometry?.coordinates
    if (!Array.isArray(c) || !Number.isFinite(+c[0]) || !Number.isFinite(+c[1])) continue
    const sev = f.properties?.severity
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: squarePolygon([+c[0], +c[1]], 18) },
      properties: { ticket_id: f.properties?.ticket_id, severity: sev, h: SEVERITY_HEIGHT_M[sev] ?? 60, color: SEVERITY[sev]?.color || '#7B8A93' },
    })
  }
  return { type: 'FeatureCollection', features }
}

export function binTowers(bins) {
  const features = []
  for (const b of bins || []) {
    const lng = +b.longitude, lat = +b.latitude
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    const fill = Math.max(0, Math.min(100, Number(b.fill_percentage) || 0))
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: squarePolygon([lng, lat], 10) },
      properties: { bin_id: String(b.bin_id), h: 6 + fill * 0.7, color: BIN_STATUS[b.status]?.color || '#2E6B4F' },
    })
  }
  return { type: 'FeatureCollection', features }
}
