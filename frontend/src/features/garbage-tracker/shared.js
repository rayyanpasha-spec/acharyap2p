// Shared constants/helpers for the CleanRoute (garbage tracker) feature. Everything here is SIMULATED data.
import { parseDate } from '../../lib/format'

export const DEMO_LABEL = 'DEMO / SIMULATED GPS'
export const DEMO_TEXT = 'DEMO / SIMULATED GPS - fictional vehicles, routes and bins. Not real municipal data.'

export const BIN_STATES = {
  normal: { label: 'Normal', color: '#244c39', tone: 'forest', range: '0-50%' },
  filling_up: { label: 'Filling up', color: '#c1782e', tone: 'saffron', range: '51-80%' },
  collection_recommended: { label: 'Collection recommended', color: '#e0a800', tone: 'warning', range: '81-95%' },
  overflow_risk: { label: 'Overflow risk', color: '#b94a48', tone: 'critical', range: '96-100%' },
}
export const BIN_STATE_ORDER = ['normal', 'filling_up', 'collection_recommended', 'overflow_risk']

export function binState(bin) {
  if (bin?.state && BIN_STATES[bin.state]) return bin.state
  const f = Number(bin?.fill_pct)
  if (!Number.isFinite(f)) return 'normal'
  if (f >= 96) return 'overflow_risk'
  if (f >= 81) return 'collection_recommended'
  if (f >= 51) return 'filling_up'
  return 'normal'
}

export const asList = (d) => (Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [])

export function fmtClock(v) {
  const d = parseDate(v)
  return d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '-'
}
export function fmtClockSec(ms) {
  if (!ms) return '-'
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
export const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)
export const validPos = (o) => Number.isFinite(Number(o?.latitude)) && Number.isFinite(Number(o?.longitude))

export function reportLink(bin) {
  const q = new URLSearchParams({
    category: 'waste', subcategory: 'overflowing_bin', lat: String(bin.latitude), lng: String(bin.longitude), bin: bin.code || '',
  })
  return `/app/report?${q.toString()}`
}
