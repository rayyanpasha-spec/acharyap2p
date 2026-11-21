// Selected-feature ring for complaints and bins (vehicles highlight their own label + a ground ring in the 3D scene).
import { useEffect } from 'react'
import { emptyFC } from '../utils/geojson'
import { LYR, SRC } from '../utils/mapConfig'

export default function SelectionRing({ map, point }) {
  useEffect(() => {
    try {
      map.addSource(SRC.selected, { type: 'geojson', data: emptyFC() })
      map.addLayer({
        id: LYR.selected, type: 'circle', source: SRC.selected,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 17, 16, 24],
          'circle-color': 'rgba(255,255,255,0)',
          'circle-stroke-color': '#303630',
          'circle-stroke-width': 2.5,
        },
      })
    } catch (e) { console.warn('[city-in-motion] selection ring failed', e) }
    return () => {
      try {
        if (map.getLayer(LYR.selected)) map.removeLayer(LYR.selected)
        if (map.getSource(SRC.selected)) map.removeSource(SRC.selected)
      } catch { /* map already removed */ }
    }
  }, [map])

  useEffect(() => {
    try {
      map.getSource(SRC.selected)?.setData(point
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: point }, properties: {} }] }
        : emptyFC())
    } catch { /* ignore */ }
  }, [map, point])

  return null
}
