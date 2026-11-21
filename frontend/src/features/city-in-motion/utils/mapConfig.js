// Shared constants for the City in Motion map. No React, no MapLibre/Three imports (keeps the main chunk small).

/** Basemap style. Default: OpenFreeMap "liberty" (vector, no API key). Override with VITE_CITY_MAP_STYLE_URL. */
export const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
export const STYLE_URL = import.meta.env.VITE_CITY_MAP_STYLE_URL || DEFAULT_STYLE_URL
export const IS_DEFAULT_STYLE = STYLE_URL === DEFAULT_STYLE_URL
export const ATTRIBUTION_TEXT = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap'

/** Pilot camera. MapLibre order is [longitude, latitude]. The server may override it via /city-twin/summary.map_default. */
export const DEFAULT_VIEW = { center: [77.5946, 12.9716], zoom: 12, pitch: 55, bearing: -15 }
export const FLAT_PITCH = 0
export const TILT_PITCH = 55

/**
 * 3D MODEL ORIENTATION CONVENTION (documented once, used everywhere):
 *   Local model space is metres, +X = right, +Y = FORWARD, +Z = UP, origin = centre of the ground footprint.
 *   (MODEL_FORWARD = '+Y'.)  Heading from the server is a compass bearing in degrees, clockwise from north.
 *   A model facing +Y is therefore rotated about Z by -heading to face its direction of travel.
 *   A GLB (glTF is +Y up, +Z front) is converted into this convention exactly once, in truckModel.js.
 */
export const MODEL_FORWARD = '+Y'
export const GLB_URL = '/models/vehicles/garbage-truck.glb'

/** Trucks are exaggerated on screen so they stay readable at zoom 12-17. */
export const TRUCK_LENGTH_M = 7.6
export const VEHICLE_TARGET_PX = 34
export const VEHICLE_SCALE_MIN = 1.6
export const VEHICLE_SCALE_MAX = 60

export const POLL_MS = 5000
export const STALE_AFTER_S = 30

/* ---------- identifiers ---------- */
export const SRC = {
  complaints: 'ct-complaints',
  resolved: 'ct-resolved',
  bins: 'ct-bins',
  routesDone: 'ct-routes-done',
  routesRemaining: 'ct-routes-remaining',
  nextStop: 'ct-next-stop',
  selected: 'ct-selected',
  flash: 'ct-flash',
  vehicles2d: 'ct-vehicles-2d',
}
export const LYR = {
  cluster: 'ct-cluster',
  clusterCount: 'ct-cluster-count',
  complaint: 'ct-complaint',
  complaintLabel: 'ct-complaint-label',
  resolved: 'ct-resolved-icon',
  bin: 'ct-bin',
  binLabel: 'ct-bin-label',
  routeCasing: 'ct-route-casing',
  routeDone: 'ct-route-done',
  routeRemaining: 'ct-route-remaining',
  routeLabel: 'ct-route-label',
  nextStop: 'ct-next-stop-ring',
  nextStopLabel: 'ct-next-stop-label',
  selected: 'ct-selected-ring',
  flash: 'ct-flash-ring',
  vehicles3d: 'ct-vehicles-3d',
  vehicles2d: 'ct-vehicles-2d-icon',
  buildingsFallback: 'civiclens-3d-buildings',
}

/* ---------- severity / status semantics (colour is never the only cue: size + glyph + ring) ---------- */
export const SEVERITY = {
  critical: { label: 'Critical', color: '#B94A48', rank: 3, size: 32, glyph: '!' },
  high: { label: 'High', color: '#C2603A', rank: 2, size: 28, glyph: '^' },
  medium: { label: 'Medium', color: '#2F5F8F', rank: 1, size: 24, glyph: '.' },
  low: { label: 'Low', color: '#7B8A93', rank: 0, size: 20, glyph: '' },
}
export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low']
export const RESOLVED_COLOR = '#397A56'
export const UNDER_REVIEW_STATUSES = ['submitted', 'ai_review']

export const BIN_STATUS = {
  normal: { label: 'Normal', range: '0-50%', color: '#2E6B4F' },
  filling_up: { label: 'Filling up', range: '51-80%', color: '#D9A441' },
  collection_recommended: { label: 'Collection recommended', range: '81-95%', color: '#C1782E' },
  overflow_risk: { label: 'Overflow risk', range: '96-100%', color: '#B94A48' },
}

export const VEHICLE_STATUS = {
  moving: { label: 'En route', tone: 'forest', color: '#2E6B4F' },
  collecting: { label: 'Collecting', tone: 'civic', color: '#2F5F8F' },
  idle: { label: 'Idle', tone: 'neutral', color: '#737A72' },
  delayed: { label: 'Delayed', tone: 'warning', color: '#C18B36' },
  completed: { label: 'Route completed', tone: 'success', color: '#397A56' },
  offline: { label: 'Location unavailable', tone: 'critical', color: '#B94A48' },
}

export const ROUTE_COLORS = { remaining: '#2F5F8F', done: '#7FA58E', casing: '#FFFFFF' }

export const DATA_SOURCE = {
  simulated: { vehicle: 'Simulated GPS', bin: 'Simulated sensor', complaint: 'Demo record', fallback: 'Simulated', simulated: true },
  gps_device: { vehicle: 'Vehicle GPS', fallback: 'Vehicle GPS' },
  manual: { vehicle: 'Manual entry', bin: 'Manual entry', fallback: 'Manual entry' },
  worker: { bin: 'Worker update', fallback: 'Worker update' },
  worker_update: { bin: 'Worker update', fallback: 'Worker update' },
  sensor: { bin: 'IoT sensor', fallback: 'IoT sensor' },
  iot_sensor: { bin: 'IoT sensor', fallback: 'IoT sensor' },
  civiclens_database: { complaint: 'CivicLens database', fallback: 'CivicLens database' },
}

export const DEFAULT_SIM_LABEL = 'DEMO MODE — Vehicle locations and bin readings are simulated.'

export const EMPTY_FILTERS = { severity: '', category: '', status: '', department: '', date_from: '', date_to: '', mine: false }

/** Presets applied when the user switches between the two views. Users can still toggle layers individually. */
export const VIEW_PRESETS = {
  issues: { complaints: true, resolved: false, vehicles: false, routes: false, bins: false, buildings: true },
  cleanroute: { complaints: false, resolved: false, vehicles: true, routes: true, bins: true, buildings: true },
}

export const STAFF_ROLES = ['officer', 'worker', 'supervisor', 'admin']
