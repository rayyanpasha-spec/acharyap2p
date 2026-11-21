// Public bins: icon layer coloured by status (forest / amber / saffron / red) with a fill-% label from zoom 14.
import { useEffect } from 'react'
import { binsToFC, emptyFC } from '../utils/geojson'
import { binTowers } from '../utils/solids'
import useZoomBucket from '../hooks/useZoomBucket'
import { LYR, SRC } from '../utils/mapConfig'

const IDS = [LYR.binTowers, LYR.bin, LYR.binLabel]

export default function BinLayer({ map, fonts, registerPicker, bins, visible }) {
  const zoomBucket = useZoomBucket(map)
  useEffect(() => {
    try {
      map.addSource(SRC.bins, { type: 'geojson', data: emptyFC() })
      map.addSource(SRC.binTowers, { type: 'geojson', data: emptyFC() })
      // 3D bin towers: height = fill level, colour = status
      map.addLayer({
        id: LYR.binTowers, type: 'fill-extrusion', source: SRC.binTowers, minzoom: 8,
        layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.95, 'fill-extrusion-vertical-gradient': true },
      })
      map.addLayer({
        id: LYR.bin, type: 'symbol', source: SRC.bins,
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 14, 0.8, 18, 1.1],
          'icon-allow-overlap': true, 'icon-ignore-placement': true,
          'symbol-sort-key': ['get', 'sort'],
          visibility: 'none',
        },
      })
      map.addLayer({
        id: LYR.binLabel, type: 'symbol', source: SRC.bins, minzoom: 14,
        layout: {
          'text-field': ['get', 'label'], 'text-font': fonts.bold, 'text-size': 11,
          'text-offset': [0, 1.45], 'text-anchor': 'top', 'text-allow-overlap': true, visibility: 'none',
        },
        paint: { 'text-color': '#303630', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.6 },
      })
    } catch (e) { console.warn('[city-in-motion] bin layers failed', e) }
    return () => {
      try {
        IDS.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id) })
        if (map.getSource(SRC.bins)) map.removeSource(SRC.bins)
        if (map.getSource(SRC.binTowers)) map.removeSource(SRC.binTowers)
      } catch { /* map already removed */ }
    }
  }, [map, fonts])

  useEffect(() => {
    try { map.getSource(SRC.bins)?.setData(binsToFC(bins || [])) } catch { /* ignore */ }
    try { map.getSource(SRC.binTowers)?.setData(binTowers(bins || [], zoomBucket)) } catch { /* ignore */ }
  }, [map, bins, zoomBucket])
  useEffect(() => {
    IDS.forEach((id) => { try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none') } catch { /* ignore */ } })
  }, [map, visible])

  useEffect(() => registerPicker('bins', 1, (pt) => {
    if (!map.getLayer(LYR.bin) || map.getLayoutProperty(LYR.bin, 'visibility') === 'none') return null
    const f = map.queryRenderedFeatures([[pt.x - 9, pt.y - 9], [pt.x + 9, pt.y + 9]], { layers: [LYR.bin] })[0]
    return f ? { type: 'bin', id: String(f.properties.bin_id), lngLat: f.geometry.coordinates } : null
  }), [map, registerPicker])

  return null
}
