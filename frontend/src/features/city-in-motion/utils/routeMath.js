// Along-line maths for route rendering. Coordinates are [lng, lat] (GeoJSON order).
const R = 6371008.8
const rad = (d) => (d * Math.PI) / 180

export function haversineM(a, b) {
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** Initial compass bearing (degrees clockwise from north) from a to b. */
export function bearingDeg(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]))
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

const isPt = (p) => Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1])

/** Pre-compute cumulative lengths once per route. Returns null for unusable lines. */
export function prepareRoute(coords) {
  const pts = (Array.isArray(coords) ? coords : []).filter(isPt).map((p) => [+p[0], +p[1]])
  if (pts.length < 2) return null
  const cum = [0]
  for (let i = 1; i < pts.length; i += 1) cum.push(cum[i - 1] + haversineM(pts[i - 1], pts[i]))
  return { coords: pts, cum, total: cum[cum.length - 1] }
}

/** Split a prepared route at `fraction` (0..1) of its length. Returns {completed, remaining, point}. */
export function splitRoute(route, fraction) {
  if (!route) return { completed: [], remaining: [], point: null }
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0))
  if (route.total <= 0) return { completed: [], remaining: route.coords.slice(), point: route.coords[0] }
  const d = f * route.total
  let i = 1
  while (i < route.cum.length - 1 && route.cum[i] < d) i += 1
  const segLen = route.cum[i] - route.cum[i - 1] || 1
  const t = Math.min(1, Math.max(0, (d - route.cum[i - 1]) / segLen))
  const a = route.coords[i - 1]
  const b = route.coords[i]
  const point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  const completed = f <= 0 ? [] : [...route.coords.slice(0, i), point]
  const remaining = f >= 1 ? [] : [point, ...route.coords.slice(i)]
  return { completed, remaining, point }
}

/** Server sends route_progress as a 0-100 percentage. Returns a 0..1 fraction or null. */
export function progressFraction(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.min(1, Math.max(0, n / 100))
}

/** Shortest signed angular difference b-a in degrees, result in (-180, 180]. */
export function angleDelta(a, b) {
  return ((((b - a) % 360) + 540) % 360) - 180
}

/** Approximate ground metres per CSS pixel at a MapLibre zoom (512 px tiles) and latitude. */
export function metersPerPixel(zoom, lat) {
  return (78271.517 * Math.cos(rad(lat))) / 2 ** zoom
}
