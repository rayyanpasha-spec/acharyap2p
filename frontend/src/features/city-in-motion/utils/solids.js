// Real 3D solids for the MapLibre scene (fill-extrusion): complaint pillars and bin towers.
// Pure functions, no React / MapLibre imports. Heights are visual encodings, not measurements:
//   complaint pillar height = severity (tall = more severe);  bin tower height = fill level.
// Both are ZOOM-ADAPTIVE: real-world size when zoomed in, and a constant on-screen size when zoomed out, so the 3D
// data skyline stays visible across the whole city (OpenStreetMap has no building data below zoom 13).
import { BIN_STATUS, SEVERITY } from './mapConfig'

const M_PER_DEG_LAT = 111320
const EQUATOR_M_PER_PX_Z0 = 156543.03 * Math.cos((12.97 * Math.PI) / 180) // Bengaluru latitude

export const metersPerPixel = (zoom) => EQUATOR_M_PER_PX_Z0 / Math.pow(2, zoom)

/** Square footprint (GeoJSON ring) of `sideM` metres centred on [lng, lat]. */
export function squarePolygon([lng, lat], sideM) {
  const dLat = sideM / 2 / M_PER_DEG_LAT
  const dLng = sideM / 2 / (M_PER_DEG_LAT * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))
  return [[[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]]]
}

const SEVERITY_HEIGHT_M = { critical: 180, high: 125, medium: 85, low: 50 }
const SEVERITY_HEIGHT_PX = { critical: 58, high: 44, medium: 32, low: 22 }

export function complaintPillars(fc, zoom = 14) {
  const mpp = metersPerPixel(zoom)
  const side = Math.max(18, 9 * mpp)                 // at least 9 px wide on screen
  const features = []
  for (const f of fc?.features || []) {
    const c = f?.geometry?.coordinates
    if (!Array.isArray(c) || !Number.isFinite(+c[0]) || !Number.isFinite(+c[1])) continue
    const sev = f.properties?.severity
    const real = SEVERITY_HEIGHT_M[sev] ?? 60
    const screen = (SEVERITY_HEIGHT_PX[sev] ?? 26) * 2 * mpp   // x2 compensates the camera tilt
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: squarePolygon([+c[0], +c[1]], side) },
      properties: { ticket_id: f.properties?.ticket_id, severity: sev, h: Math.max(real, screen), color: SEVERITY[sev]?.color || '#7B8A93' },
    })
  }
  return { type: 'FeatureCollection', features }
}

export function binTowers(bins, zoom = 14) {
  const mpp = metersPerPixel(zoom)
  const side = Math.max(10, 7 * mpp)
  const features = []
  for (const b of bins || []) {
    const lng = +b.longitude, lat = +b.latitude
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    const fill = Math.max(0, Math.min(100, Number(b.fill_percentage) || 0))
    const real = 6 + fill * 0.7
    const screen = (8 + fill * 0.28) * 2 * mpp
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: squarePolygon([lng, lat], side) },
      properties: { bin_id: String(b.bin_id), h: Math.max(real, screen), color: BIN_STATUS[b.status]?.color || '#2E6B4F' },
    })
  }
  return { type: 'FeatureCollection', features }
}
