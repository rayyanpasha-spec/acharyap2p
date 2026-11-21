// Wizard state: one reducer, kept local to the Report page.
import { translate } from '../../lib/i18n'
import { fill } from './api'

export const STEPS = ['describe', 'location', 'nearby', 'review', 'submit']
export const LANG_CODES = ['kn', 'en', 'hi', 'ta', 'te', 'ml']

/** Starter description for the query-prefill flow (e.g. CleanRoute 'Report overflowing bin'). Editable by the citizen. */
export function starterText(lang, prefill) {
  if (!prefill) return ''
  if (prefill.subcategory === 'overflowing_bin' || prefill.bin) {
    return fill(translate(lang, 'report.prefill.bin', 'Overflowing public bin near {bin}.'), { bin: prefill.bin || translate(lang, 'report.prefill.here', 'this location') })
  }
  return ''
}

export function readPrefill(search) {
  const q = new URLSearchParams(search)
  const lat = parseFloat(q.get('lat'))
  const lng = parseFloat(q.get('lng'))
  const p = {
    category: q.get('category') || '',
    subcategory: q.get('subcategory') || '',
    bin: q.get('bin') || '',
    lat: Number.isFinite(lat) && Math.abs(lat) <= 90 && lat !== 0 ? lat : null,
    lng: Number.isFinite(lng) && Math.abs(lng) <= 180 && lng !== 0 ? lng : null,
  }
  const any = p.category || p.subcategory || p.bin || (p.lat != null && p.lng != null)
  return any ? p : null
}

export function initState(language, prefill) {
  const text = starterText(language, prefill)
  const hasPin = prefill && prefill.lat != null && prefill.lng != null
  return {
    step: 0,
    maxStep: 0,
    language,
    text,
    starter: text,            // last auto-generated starter; replaced only while the citizen has not edited it
    via: 'text',
    voiceTranscriptId: null,
    images: [],               // [{id, file, url}]
    loc: hasPin ? { lat: prefill.lat, lng: prefill.lng, source: 'map_pin', accuracy: null, capturedAt: new Date().toISOString(), confirmed: false, prefilled: true } : null,
    focus: hasPin ? { lat: prefill.lat, lng: prefill.lng, n: Date.now() } : null,
    address: '',
    addressEdited: false,
    landmark: '',
    locality: '',
    geoKey: null,
    area: { status: 'idle', data: null },
    geo: { status: 'idle', data: null },
    outsideAck: false,
    dup: { status: 'idle', key: null, data: null, error: null, choice: null, unsure: false },
    preview: { status: 'idle', key: null, data: null, error: null },
    submit: { status: 'idle', error: null, result: null },
  }
}

export function reducer(s, a) {
  switch (a.type) {
    case 'set': return { ...s, ...(typeof a.patch === 'function' ? a.patch(s) : a.patch) }
    case 'goto': return { ...s, step: a.step, maxStep: Math.max(s.maxStep, a.step) }
    case 'reset': return a.state
    default: return s
  }
}
