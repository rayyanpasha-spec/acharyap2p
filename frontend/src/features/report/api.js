// REPORT-FLOW api helpers. Everything the wizard sends to the backend goes through here.
import { api } from '../../lib/api'

export const MIN_TEXT = 5
export const MAX_TEXT = 4000
export const DEFAULT_LIMITS = { max_image_size_mb: 8, max_images_per_report: 5, max_audio_seconds: 90, max_audio_size_mb: 10 }
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const LONG = { timeout: 120000 }

/** Address text sent to the backend: the (editable) address plus an optional landmark appended to it. */
export function fullAddress(s) {
  const a = (s.address || '').trim()
  const l = (s.landmark || '').trim()
  if (a && l) return `${a} (Landmark: ${l})`
  if (l) return `Landmark: ${l}`
  return a
}

/** Signature of the inputs the nearby/preview results depend on, used to detect stale results. */
export function inputSignature(s) {
  return JSON.stringify([s.text.trim(), s.language, s.loc?.lat, s.loc?.lng, s.images.map((i) => `${i.file.name}:${i.file.size}`)])
}

function appendCommon(fd, s) {
  fd.append('description', s.text.trim())
  fd.append('original_language', s.language)
  fd.append('latitude', String(s.loc.lat))
  fd.append('longitude', String(s.loc.lng))
  if (s.loc.accuracy != null) fd.append('location_accuracy_m', String(Math.round(s.loc.accuracy)))
  fd.append('location_source', s.loc.source || 'map_pin')
  if (s.loc.capturedAt) fd.append('location_captured_at', s.loc.capturedAt)
  const addr = fullAddress(s)
  if (addr) fd.append('location_address', addr)
  if (s.locality) fd.append('locality', s.locality)
  s.images.forEach((i) => fd.append('images', i.file, i.file.name))
}

/** Multipart body for POST /complaints/preview (create fields minus the duplicate fields). */
export function previewForm(s) {
  const fd = new FormData()
  appendCommon(fd, s)
  fd.append('via', s.via)
  return fd
}

/** Multipart body for POST /complaints. Never sends category / severity / department. */
export function createForm(s) {
  const fd = new FormData()
  appendCommon(fd, s)
  fd.append('via', s.via)
  if (s.via === 'voice' && s.voiceTranscriptId) fd.append('voice_transcript_id', String(s.voiceTranscriptId))
  const c = s.dup?.choice
  if (c?.action === 'follow' || c?.action === 'add_evidence') {
    fd.append('existing_incident_action', c.action)
    fd.append('existing_ticket_id', c.ticket)
  } else if (c?.action === 'new' && c.reason?.trim()) {
    fd.append('duplicate_override_reason', c.reason.trim())
  }
  return fd
}

export const createComplaint = (s) => api.post('/complaints', createForm(s), LONG).then((r) => r.data)
export const previewComplaint = (s) => api.post('/complaints/preview', previewForm(s), LONG).then((r) => r.data)

export function duplicateCheck(s, hint = {}) {
  const body = {
    description: s.text.trim(),
    language: s.language,
    latitude: s.loc.lat,
    longitude: s.loc.lng,
    location_source: s.loc.source || 'map_pin',
  }
  if (s.loc.accuracy != null) body.location_accuracy_m = Math.round(s.loc.accuracy)
  const addr = fullAddress(s)
  if (addr) body.location_address = addr
  if (hint.category) body.category_hint = hint.category
  if (hint.subcategory) body.subcategory_hint = hint.subcategory
  return api.post('/complaints/duplicate-check', body, { timeout: 30000 }).then((r) => r.data)
}

export const serviceAreaCheck = (lat, lng) => api.get('/locations/service-area-check', { params: { lat, lng } }).then((r) => r.data)
export const reverseGeocode = (lat, lng) => api.get('/locations/reverse-geocode', { params: { lat, lng } }).then((r) => r.data)
export const searchLocations = (q, signal) => api.get('/locations/search', { params: { q }, signal }).then((r) => r.data)

export function transcribeAudio(file, language, durationSeconds) {
  const fd = new FormData()
  fd.append('audio', file, file.name)
  if (language) fd.append('language', language)
  if (durationSeconds != null) fd.append('duration_seconds', String(durationSeconds))
  return api.post('/voice/transcribe', fd, LONG).then((r) => r.data)
}
export const confirmTranscript = (id, text) => api.patch(`/voice/transcripts/${id}`, { confirmed_transcript: text }).then((r) => r.data)

/** Replace {name} placeholders. */
export const fill = (str, vars = {}) => String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m))
