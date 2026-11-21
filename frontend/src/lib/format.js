// Backend sends naive-UTC ISO strings WITHOUT a timezone suffix; treat them as UTC.
export function parseDate(v) {
  if (!v) return null
  const s = typeof v === 'string' && !/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v + 'Z' : v
  const d = new Date(s)
  return isNaN(d) ? null : d
}
export function fmtDateTime(v) {
  const d = parseDate(v)
  return d ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}
export function fmtDate(v) {
  const d = parseDate(v)
  return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}
export function timeAgo(v) {
  const d = parseDate(v)
  if (!d) return '—'
  const s = Math.round((Date.now() - d.getTime()) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`
  return fmtDate(v)
}
/** Time remaining until `due` (or overdue). Returns {label, overdue}. */
export function slaRemaining(due) {
  const d = parseDate(due)
  if (!d) return { label: '—', overdue: false }
  const ms = d.getTime() - Date.now()
  const h = Math.abs(ms) / 3600000
  const txt = h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`
  return ms < 0 ? { label: `Overdue ${txt}`, overdue: true } : { label: `${txt} left`, overdue: false }
}
export const titleCase = (s = '') => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
export const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 }
export const fmtDistance = (m) => (m == null ? '' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`)
