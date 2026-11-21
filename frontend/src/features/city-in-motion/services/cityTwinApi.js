// Thin wrappers over the City Twin REST API (docs/CITY_TWIN_CONTRACT.md). All calls go through the shared axios instance,
// so the optional bearer token is attached when the viewer is signed in.
import { api } from '../../../lib/api'

const clean = (params = {}) => {
  const out = {}
  for (const [k, v] of Object.entries(params)) {
    if (v === '' || v == null || v === false) continue
    out[k] = v
  }
  return out
}

export const getSummary = (signal) => api.get('/city-twin/summary', { signal }).then((r) => r.data)
export const getLayersConfig = (signal) => api.get('/city-twin/layers/config', { signal }).then((r) => r.data)
export const getComplaints = (params, signal) =>
  api.get('/city-twin/complaints', { params: clean({ limit: 1000, ...params }), signal }).then((r) => r.data)
export const getComplaint = (ticket, signal) => api.get(`/city-twin/complaints/${encodeURIComponent(ticket)}`, { signal }).then((r) => r.data)
export const getVehicles = (signal) => api.get('/city-twin/vehicles', { signal }).then((r) => r.data)
export const getVehicle = (id, signal) => api.get(`/city-twin/vehicles/${encodeURIComponent(id)}`, { signal }).then((r) => r.data)
export const getRoutes = (signal) => api.get('/city-twin/routes', { signal }).then((r) => r.data)
export const getBins = (signal) => api.get('/city-twin/bins', { signal }).then((r) => r.data)
export const getBin = (id, signal) => api.get(`/city-twin/bins/${encodeURIComponent(id)}`, { signal }).then((r) => r.data)

/** Place search reuses the existing signed-in-only endpoint. */
export const searchPlaces = (q, signal) => api.get('/locations/search', { params: { q }, signal }).then((r) => r.data)

/* Staff actions reuse existing endpoints (never duplicated here). */
export const recordCollection = (binId, vehicleId) =>
  api.post('/garbage/collections', { bin_id: Number(binId), ...(vehicleId != null && Number.isFinite(Number(vehicleId)) ? { vehicle_id: Number(vehicleId) } : {}) }).then((r) => r.data)
export const recordReading = (binId, fillPct) =>
  api.post(`/garbage/bins/${encodeURIComponent(binId)}/reading`, { fill_pct: Number(fillPct), source: 'worker' }).then((r) => r.data)
export const startSimulation = () => api.post('/demo/garbage/start').then((r) => r.data)
export const stopSimulation = () => api.post('/demo/garbage/stop').then((r) => r.data)

export const isCancel = (e) => e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError'
