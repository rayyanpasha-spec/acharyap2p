// Defensive normalisers: the map never trusts a response shape and never invents records.
import { SEVERITY, UNDER_REVIEW_STATUSES } from './mapConfig'

export const emptyFC = () => ({ type: 'FeatureCollection', features: [] })

export const validLngLat = (c) =>
  Array.isArray(c) && c.length >= 2 && Number.isFinite(+c[0]) && Number.isFinite(+c[1]) &&
  Math.abs(+c[0]) <= 180 && Math.abs(+c[1]) <= 90 && !(+c[0] === 0 && +c[1] === 0)

/** Accepts `[...]`, `{items:[...]}` or `{features:[...]}`. */
export function asItems(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.features)) return payload.features
  return []
}

/* ---------------- complaints ---------------- */
export function iconForComplaint(p) {
  if (p.status === 'resolved') return 'cl-resolved'
  const sev = SEVERITY[p.severity] ? p.severity : 'medium'
  return `cl-${sev}${p.is_review ? '-review' : ''}`
}

/** Adds the derived display properties used by the style expressions. Returns null for unusable features. */
export function decorateComplaint(f) {
  if (!f || f.type !== 'Feature' || f.geometry?.type !== 'Point' || !validLngLat(f.geometry.coordinates)) return null
  const p = { ...(f.properties || {}) }
  if (!p.ticket_id) return null
  p.severity = SEVERITY[p.severity] ? p.severity : 'medium'
  p.sev_rank = SEVERITY[p.severity].rank
  p.is_review = UNDER_REVIEW_STATUSES.includes(p.status) || p.requires_review === true
  p.is_resolved = p.status === 'resolved'
  p.icon = iconForComplaint(p)
  p.sort = p.sev_rank * 1000 + Math.min(999, Math.round(Number(p.priority_score) || 0))
  return { type: 'Feature', id: undefined, geometry: { type: 'Point', coordinates: [+f.geometry.coordinates[0], +f.geometry.coordinates[1]] }, properties: p }
}

export function normalizeComplaints(raw) {
  const feats = (Array.isArray(raw?.features) ? raw.features : []).map(decorateComplaint).filter(Boolean)
  feats.sort((a, b) => (b.properties.priority_score || 0) - (a.properties.priority_score || 0))
  return { type: 'FeatureCollection', features: feats }
}

/** Active (clustered) and resolved (history) complaint collections. */
export function splitComplaints(fc) {
  const active = []
  const resolved = []
  for (const f of fc?.features || []) (f.properties.is_resolved ? resolved : active).push(f)
  return { active: { type: 'FeatureCollection', features: active }, resolved: { type: 'FeatureCollection', features: resolved } }
}

/**
 * Apply a websocket complaint event to the collection.
 * `keep(props)` decides whether the resulting feature belongs in the current filtered view.
 * Event coordinates are public (3 dp): they are only used for features we do not already have (never to degrade exact ones).
 */
export function applyComplaintEvent(fc, data, { keep, categoryName } = {}) {
  const ticket = data?.ticket_id
  if (!ticket) return { fc, changed: false }
  const feats = fc?.features || []
  const idx = feats.findIndex((f) => f.properties.ticket_id === ticket)
  const rejected = data.status === 'rejected'

  if (idx >= 0) {
    const old = feats[idx]
    const merged = decorateComplaint({
      type: 'Feature',
      geometry: old.geometry,
      properties: {
        ...old.properties,
        status: data.status ?? old.properties.status,
        severity: data.severity ?? old.properties.severity,
        category: data.category ?? old.properties.category,
        public_summary: data.public_summary ?? old.properties.public_summary,
        updated_at: data.updated_at ?? old.properties.updated_at,
        resolved_at: data.status === 'resolved' ? data.updated_at : old.properties.resolved_at,
      },
    })
    const next = feats.slice()
    if (!merged || rejected || (keep && !keep(merged.properties))) next.splice(idx, 1)
    else next[idx] = merged
    return { fc: { type: 'FeatureCollection', features: next }, changed: true, ticket, kind: 'updated', color: merged?.properties?.severity }
  }

  if (rejected || !validLngLat([data.longitude, data.latitude])) return { fc, changed: false }
  const created = decorateComplaint({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [+data.longitude, +data.latitude] },
    properties: {
      ticket_id: ticket,
      category: data.category,
      category_name: categoryName ? categoryName(data.category) : data.category,
      severity: data.severity,
      status: data.status,
      public_summary: data.public_summary,
      priority_score: 0,
      created_at: data.updated_at,
      updated_at: data.updated_at,
      is_mine: false,
    },
  })
  if (!created || (keep && !keep(created.properties))) return { fc, changed: false }
  return { fc: { type: 'FeatureCollection', features: [created, ...feats] }, changed: true, ticket, kind: 'created' }
}

/** Client-side mirror of the server filters, used only to decide whether a live event belongs in the current view. */
export function makeKeepPredicate(filters, includeResolved) {
  return (p) => {
    if (!includeResolved && p.status === 'resolved') return false
    if (filters.severity && p.severity !== filters.severity) return false
    if (filters.category && p.category !== filters.category) return false
    if (filters.status && p.status !== filters.status) return false
    if (filters.department && p.department_code && p.department_code !== filters.department) return false
    if (filters.mine && !p.is_mine) return false
    return true
  }
}

/* ---------------- vehicles / bins / routes ---------------- */
export function normalizeVehicles(payload) {
  return asItems(payload)
    .filter((v) => v && v.vehicle_id != null && validLngLat([v.longitude, v.latitude]))
    .map((v) => ({ ...v, vehicle_id: String(v.vehicle_id) }))
}

export function normalizeBins(payload) {
  return asItems(payload)
    .filter((b) => b && b.bin_id != null && validLngLat([b.longitude, b.latitude]))
    .map((b) => ({ ...b, bin_id: String(b.bin_id), fill_percentage: Math.max(0, Math.min(100, Number(b.fill_percentage) || 0)) }))
}

export function normalizeRoutes(raw) {
  const feats = (Array.isArray(raw?.features) ? raw.features : []).filter(
    (f) => f?.geometry?.type === 'LineString' && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2,
  )
  return { type: 'FeatureCollection', features: feats }
}

export function binsToFC(bins) {
  return {
    type: 'FeatureCollection',
    features: bins.map((b) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [+b.longitude, +b.latitude] },
      properties: {
        bin_id: b.bin_id,
        bin_code: b.bin_code,
        status: b.status,
        fill: Math.round(b.fill_percentage),
        label: `${Math.round(b.fill_percentage)}%`,
        icon: `cl-bin-${b.status in { normal: 1, filling_up: 1, collection_recommended: 1, overflow_risk: 1 } ? b.status : 'normal'}`,
        sort: Math.round(b.fill_percentage),
      },
    })),
  }
}

export const lineFC = (features) => ({ type: 'FeatureCollection', features })

/** Merge an incoming item into a list keyed by `key`, stamping the local receive time. */
export function mergeItems(list, incoming, key, now = Date.now()) {
  const map = new Map(list.map((x) => [x[key], x]))
  for (const it of incoming) {
    if (!it || it[key] == null) continue
    const id = String(it[key])
    map.set(id, { ...(map.get(id) || {}), ...it, [key]: id, _seen: now })
  }
  return [...map.values()]
}

/** Local staleness: the server flag, or no position for > 30 s by server age + local elapsed time. */
export function isVehicleStale(v, now = Date.now(), thresholdS = 30) {
  if (!v) return true
  if (v.stale) return true
  const age = (Number(v.stale_seconds) || 0) + (v._seen ? (now - v._seen) / 1000 : 0)
  return age > thresholdS
}
