// Complaint markers: clustered GeoJSON source (clusters coloured by the worst severity inside) + icon layer
// (severity colour + size + glyph, hollow ring for "under review") + resolved history layer + restrained status flash.
// Logic-only component: renders nothing, manages MapLibre layers in effects.
import { useEffect, useRef } from 'react'
import { emptyFC } from '../utils/geojson'
import { complaintPillars } from '../utils/solids'
import useZoomBucket from '../hooks/useZoomBucket'
import { LYR, SEVERITY, SRC } from '../utils/mapConfig'

const ALL = [LYR.complaintPillars, LYR.cluster, LYR.clusterCount, LYR.complaint, LYR.complaintLabel, LYR.resolved]
const setVis = (map, ids, visible) => ids.forEach((id) => { try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none') } catch { /* ignore */ } })
const IDS_ACTIVE = [LYR.complaintPillars, LYR.cluster, LYR.clusterCount, LYR.complaint, LYR.complaintLabel]

export function addComplaintLayers(map, fonts) {
  map.addSource(SRC.complaints, {
    type: 'geojson', data: emptyFC(), cluster: true, clusterRadius: 46, clusterMaxZoom: 14,
    clusterProperties: { sev_max: ['max', ['get', 'sev_rank']] },
  })
  map.addSource(SRC.resolved, { type: 'geojson', data: emptyFC() })
  map.addSource(SRC.flash, { type: 'geojson', data: emptyFC() })
  map.addSource(SRC.complaintPillars, { type: 'geojson', data: emptyFC() })

  // 3D pillars: height = severity (critical tallest). Real extruded solids, drawn under the icons.
  map.addLayer({
    id: LYR.complaintPillars, type: 'fill-extrusion', source: SRC.complaintPillars, minzoom: 8,
    paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.93, 'fill-extrusion-vertical-gradient': true },
  })

  map.addLayer({
    id: LYR.resolved, type: 'symbol', source: SRC.resolved,
    layout: { 'icon-image': 'cl-resolved', 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 16, 0.95], 'icon-allow-overlap': true, 'icon-ignore-placement': true, visibility: 'none' },
    paint: { 'icon-opacity': 0.9 },
  })
  map.addLayer({
    id: LYR.cluster, type: 'circle', source: SRC.complaints, filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['match', ['get', 'sev_max'], 3, SEVERITY.critical.color, 2, SEVERITY.high.color, '#244C39'],
      'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 50, 25],
      'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3, 'circle-opacity': 0.94,
    },
  })
  map.addLayer({
    id: LYR.clusterCount, type: 'symbol', source: SRC.complaints, filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': fonts.bold, 'text-size': 13, 'text-allow-overlap': true },
    paint: { 'text-color': '#FFFFFF' },
  })
  map.addLayer({
    id: LYR.complaint, type: 'symbol', source: SRC.complaints, filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.72, 14, 0.95, 17, 1.2],
      'icon-allow-overlap': true, 'icon-ignore-placement': true,
      'symbol-sort-key': ['get', 'sort'],
    },
  })
  map.addLayer({
    id: LYR.complaintLabel, type: 'symbol', source: SRC.complaints, minzoom: 16, filter: ['!', ['has', 'point_count']],
    layout: { 'text-field': ['get', 'ticket_id'], 'text-font': fonts.regular, 'text-size': 11, 'text-offset': [0, 1.7], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'text-color': '#303630', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.5 },
  })
  map.addLayer({
    id: LYR.flash, type: 'circle', source: SRC.flash,
    paint: { 'circle-radius': 12, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 3, 'circle-stroke-color': '#2F5F8F', 'circle-stroke-opacity': 0 },
  })
}

export default function ComplaintMarkerLayer({ map, fonts, registerPicker, active, resolved, showActive, showResolved, flash, reducedMotion }) {
  const indexRef = useRef(new Map())
  const zoomBucket = useZoomBucket(map)

  // create once
  useEffect(() => {
    try { addComplaintLayers(map, fonts) } catch (e) { console.warn('[city-in-motion] complaint layers failed', e) }
    return () => {
      try {
        [LYR.flash, ...ALL].forEach((id) => { if (map.getLayer(id)) map.removeLayer(id) })
        ;[SRC.complaints, SRC.resolved, SRC.flash, SRC.complaintPillars].forEach((id) => { if (map.getSource(id)) map.removeSource(id) })
      } catch { /* map already removed */ }
    }
  }, [map, fonts])

  // data (cluster source re-clusters on setData; no map rebuild)
  useEffect(() => {
    try { map.getSource(SRC.complaints)?.setData(active || emptyFC()) } catch { /* ignore */ }
    try { map.getSource(SRC.complaintPillars)?.setData(complaintPillars(active, zoomBucket)) } catch { /* ignore */ }
    // keep coordinates of features that just left the view (e.g. resolved) so their status flash can still be placed
    const idx = indexRef.current
    for (const f of active?.features || []) idx.set(f.properties.ticket_id, f.geometry.coordinates)
  }, [map, active, zoomBucket])
  useEffect(() => {
    try { map.getSource(SRC.resolved)?.setData(resolved || emptyFC()) } catch { /* ignore */ }
    const idx = indexRef.current
    for (const f of resolved?.features || []) idx.set(f.properties.ticket_id, f.geometry.coordinates)
  }, [map, resolved])

  useEffect(() => { setVis(map, IDS_ACTIVE, showActive) }, [map, showActive])
  useEffect(() => { setVis(map, [LYR.resolved], showResolved) }, [map, showResolved])

  // picking (click + hover cursor): clusters zoom in, markers select
  useEffect(() => {
    return registerPicker('complaints', 2, (pt) => {
      const layers = [LYR.complaint, LYR.cluster, LYR.resolved].filter((id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none')
      if (!layers.length) return null
      const feats = map.queryRenderedFeatures([[pt.x - 7, pt.y - 7], [pt.x + 7, pt.y + 7]], { layers })
      const f = feats[0]
      if (!f) return null
      if (f.properties.point_count) {
        const cid = f.properties.cluster_id
        const center = f.geometry.coordinates
        return {
          type: 'cluster', id: String(cid), lngLat: center,
          activate: () => {
            Promise.resolve(map.getSource(SRC.complaints).getClusterExpansionZoom(cid))
              .then((z) => map.easeTo({ center, zoom: Math.min(Number(z) + 0.5, 18), duration: reducedMotion ? 0 : 450 }))
              .catch(() => map.easeTo({ center, zoom: map.getZoom() + 2 }))
          },
        }
      }
      return { type: 'complaint', id: f.properties.ticket_id, lngLat: f.geometry.coordinates }
    })
  }, [map, registerPicker, reducedMotion])

  // status-change flash: a ring that expands and fades over ~450 ms (skipped for reduced motion; no confetti)
  useEffect(() => {
    if (!flash || reducedMotion) return undefined
    const c = indexRef.current.get(flash.ticket)
    if (!c) return undefined
    const color = SEVERITY[flash.severity]?.color || '#2F5F8F'
    let raf = 0
    const t0 = performance.now()
    try {
      map.getSource(SRC.flash)?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} }] })
      map.setPaintProperty(LYR.flash, 'circle-stroke-color', flash.status === 'resolved' ? '#397A56' : color)
    } catch { return undefined }
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 450)
      try {
        map.setPaintProperty(LYR.flash, 'circle-radius', 12 + 22 * p)
        map.setPaintProperty(LYR.flash, 'circle-stroke-opacity', 0.9 * (1 - p))
      } catch { return }
      if (p < 1) raf = requestAnimationFrame(step)
      else { try { map.getSource(SRC.flash)?.setData(emptyFC()) } catch { /* ignore */ } }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [map, flash, reducedMotion])

  return null
}
