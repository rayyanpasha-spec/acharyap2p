// 2D fallback (react-leaflet) showing the SAME API data when MapLibre/WebGL is unavailable.
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_ATTRIBUTION, TILE_URL } from '../../../lib/leaflet'
import { BIN_STATUS, RESOLVED_COLOR, SEVERITY, VEHICLE_STATUS } from '../utils/mapConfig'

export default function LeafletFallbackMap({ active, resolved, routes, bins, vehicles, layers, selection, onSelect }) {
  const sel = (type, id) => selection?.type === type && selection?.id === String(id)
  return (
    <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom className="h-full w-full" aria-label="2D fallback map">
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
      {layers.routes && (routes?.features || []).map((f, i) => (
        <Polyline key={`r${i}`} positions={f.geometry.coordinates.map(([lng, lat]) => [lat, lng])} pathOptions={{ color: '#2F5F8F', weight: 3, opacity: 0.8 }} />
      ))}
      {layers.complaints && (active?.features || []).map((f) => {
        const p = f.properties
        const c = SEVERITY[p.severity] || SEVERITY.medium
        const [lng, lat] = f.geometry.coordinates
        return (
          <CircleMarker key={p.ticket_id} center={[lat, lng]} radius={sel('complaint', p.ticket_id) ? c.size / 2 + 4 : c.size / 2 - 2}
            pathOptions={{ color: sel('complaint', p.ticket_id) ? '#303630' : '#FFFFFF', weight: 2, fillColor: p.is_review ? '#FFFFFF' : c.color, fillOpacity: 0.95 }}
            eventHandlers={{ click: () => onSelect('complaint', p.ticket_id) }}>
            <Tooltip>{p.ticket_id} - {c.label}{p.is_review ? ' (under review)' : ''}</Tooltip>
          </CircleMarker>
        )
      })}
      {layers.resolved && (resolved?.features || []).map((f) => {
        const [lng, lat] = f.geometry.coordinates
        return (
          <CircleMarker key={f.properties.ticket_id} center={[lat, lng]} radius={7} pathOptions={{ color: '#FFFFFF', weight: 2, fillColor: RESOLVED_COLOR, fillOpacity: 0.85 }}
            eventHandlers={{ click: () => onSelect('complaint', f.properties.ticket_id) }}>
            <Tooltip>{f.properties.ticket_id} - Resolved</Tooltip>
          </CircleMarker>
        )
      })}
      {layers.bins && (bins || []).map((b) => (
        <CircleMarker key={`b${b.bin_id}`} center={[b.latitude, b.longitude]} radius={sel('bin', b.bin_id) ? 11 : 8}
          pathOptions={{ color: sel('bin', b.bin_id) ? '#303630' : '#FFFFFF', weight: 2, fillColor: (BIN_STATUS[b.status] || BIN_STATUS.normal).color, fillOpacity: 0.95 }}
          eventHandlers={{ click: () => onSelect('bin', b.bin_id) }}>
          <Tooltip>{b.bin_code} - {Math.round(b.fill_percentage)}% full</Tooltip>
        </CircleMarker>
      ))}
      {layers.vehicles && (vehicles || []).map((v) => (
        <CircleMarker key={`v${v.vehicle_id}`} center={[v.latitude, v.longitude]} radius={sel('vehicle', v.vehicle_id) ? 12 : 9}
          pathOptions={{ color: sel('vehicle', v.vehicle_id) ? '#303630' : '#FFFFFF', weight: 3, fillColor: v.stale ? '#9AA19B' : (VEHICLE_STATUS[v.status] || VEHICLE_STATUS.idle).color, fillOpacity: 1 }}
          eventHandlers={{ click: () => onSelect('vehicle', v.vehicle_id) }}>
          <Tooltip permanent direction="top" offset={[0, -8]}>{v.vehicle_code}{v.stale ? ' (location may be outdated)' : ''}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
