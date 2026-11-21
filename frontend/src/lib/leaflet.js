// Import once from any map component: `import '../lib/leaflet'`.
// Fixes Leaflet's default marker icons under bundlers and exposes helpers.
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow })

export const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
export const DEFAULT_CENTER = [
  Number(import.meta.env.VITE_DEFAULT_MAP_LATITUDE) || 12.9716,
  Number(import.meta.env.VITE_DEFAULT_MAP_LONGITUDE) || 77.5946,
]
export const DEFAULT_ZOOM = Number(import.meta.env.VITE_DEFAULT_MAP_ZOOM) || 12

/** Small coloured circle marker as a divIcon (no image files needed). */
export function dotIcon(color = '#244C39', size = 16, ring = '#fff') {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid ${ring};box-shadow:0 0 0 1px rgba(0,0,0,.25)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}
export default L
