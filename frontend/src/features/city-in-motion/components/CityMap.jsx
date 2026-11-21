// The single MapLibre map. Created once (dynamic import so maplibre-gl stays out of the main bundle), removed on unmount.
// Layers are separate logic components mounted after the style loads; filters/data never rebuild the map.
import 'maplibre-gl/dist/maplibre-gl.css'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { ATTRIBUTION_TEXT, FLAT_PITCH, IS_DEFAULT_STYLE, STYLE_URL } from '../utils/mapConfig'
import { detectFonts, restyleBasemap, setBuildingsVisible } from './basemap'
import { registerIcons } from './mapIcons'
import BinLayer from './BinLayer'
import ComplaintMarkerLayer from './ComplaintMarkerLayer'
import MapErrorState from './MapErrorState'
import RouteLayer from './RouteLayer'
import SelectionRing from './SelectionRing'
import VehicleLayer from './VehicleLayer'

const MAP_CSS = `
.ct-vlabel{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px 0 7px;border-radius:999px;border:1px solid #d4d6cc;background:#fff;color:#303630;font:600 11px/1 Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}
.ct-vlabel .dot{width:8px;height:8px;border-radius:50%;flex:none}
.ct-vlabel:hover{border-color:#2f5f8f}
.ct-vlabel.is-selected{border-color:#2f5f8f;outline:2px solid #2f5f8f;outline-offset:1px}
.ct-vlabel.is-stale{color:#737a72;border-style:dashed}
.ct-map .maplibregl-ctrl-attrib{font:11px/1.4 Inter,system-ui,sans-serif;border-radius:8px 0 0 0}
.ct-map .maplibregl-ctrl-scale{border-radius:0 6px 0 0;font:10px/1.4 Inter,system-ui,sans-serif}
.ct-map .maplibregl-canvas{outline:none}
`

const CityMap = forwardRef(function CityMap(
  { data, layers, selection, selectedPoint, onSelect, onClear, defaultView, flatStart, flash, loading, onVehicleMode, onCamera, onReady, fallback, reducedMotion },
  ref,
) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const pickersRef = useRef(new Map())
  const userMoved = useRef(false)
  const [ready, setReady] = useState(null) // { map, maplibregl, fonts }
  const [rendered, setRendered] = useState(false)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  const cb = useRef({})
  cb.current = { onSelect, onClear, onCamera, onReady, reducedMotion, defaultView, flatStart }

  const registerPicker = useCallback((name, priority, fn) => {
    pickersRef.current.set(name, { priority, fn })
    return () => { if (pickersRef.current.get(name)?.fn === fn) pickersRef.current.delete(name) }
  }, [])

  /* ---------- create the map once (re-created only by Retry) ---------- */
  useEffect(() => {
    let disposed = false
    let map = null
    let ro = null
    let idleTimer = null
    let loadTimer = null
    let hoverRaf = 0
    const container = containerRef.current

    const fail = (message, err) => {
      if (disposed) return
      console.warn('[city-in-motion] map failed:', message, err)
      clearTimeout(idleTimer)
      clearTimeout(loadTimer)
      try { ro?.disconnect() } catch { /* ignore */ }
      try { map?.remove() } catch { /* ignore */ }
      map = null
      mapRef.current = null
      setReady(null)
      setError({ message })
    }

    const run = async () => {
      let maplibregl
      try {
        const mod = await import('maplibre-gl')
        maplibregl = mod.default || mod
      } catch (e) { fail('The map library could not be loaded.', e); return }
      if (disposed || !container) return

      const view = cb.current.defaultView
      const rm = !!cb.current.reducedMotion
      try {
        map = new maplibregl.Map({
          container,
          style: STYLE_URL,
          center: view.center, zoom: view.zoom, bearing: view.bearing,
          pitch: cb.current.flatStart ? FLAT_PITCH : view.pitch,
          maxPitch: 75, minZoom: 9, attributionControl: false, fadeDuration: rm ? 0 : 250,
          localIdeographFontFamily: false,
        })
      } catch (e) { fail('WebGL is not available in this browser.', e); return }
      mapRef.current = map
      if (import.meta.env.DEV) window.__cityMap = map   // dev-only debug handle

      map.addControl(new maplibregl.AttributionControl({ compact: window.innerWidth < 640, customAttribution: IS_DEFAULT_STYLE ? undefined : ATTRIBUTION_TEXT }), 'bottom-right')
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left')

      let loaded = false
      // style/provider failures surface as errors without a sourceId before `load`; individual tile errors never abort the map
      map.on('error', (ev) => {
        if (!loaded && !ev?.sourceId && !ev?.tile) fail('The map style or tiles could not be loaded.', ev?.error)
      })
      loadTimer = setTimeout(() => { if (!loaded) fail('The map took too long to load.') }, 90000)   // slow GPUs / first load: do not drop to 2D early

      map.once('load', () => {
        if (disposed) return
        loaded = true
        clearTimeout(loadTimer)
        try {
          restyleBasemap(map)
          registerIcons(map)
          setReady({ map, maplibregl, fonts: detectFonts(map) })
          cb.current.onReady?.(map)
        } catch (e) { fail('The map could not be initialised.', e); return }
        idleTimer = setTimeout(() => setRendered(true), 8000)
        map.once('idle', () => { clearTimeout(idleTimer); setRendered(true) })
      })

      /* interaction: one click handler for every layer, resolved by picker priority (vehicles > bins > complaints) */
      const runPickers = (pt) => {
        const list = [...pickersRef.current.values()].sort((a, b) => a.priority - b.priority)
        for (const p of list) {
          try { const hit = p.fn(pt); if (hit) return hit } catch { /* a layer may be mid-teardown */ }
        }
        return null
      }
      map.on('click', (e) => {
        const hit = runPickers(e.point)
        if (!hit) cb.current.onClear?.()
        else if (hit.activate) hit.activate()
        else cb.current.onSelect?.(hit.type, hit.id, hit)
      })
      let lastPt = null
      map.on('mousemove', (e) => {
        lastPt = e.point
        if (hoverRaf || map.isMoving()) return
        hoverRaf = requestAnimationFrame(() => {
          hoverRaf = 0
          if (!map) return
          const c = map.getCanvas()
          if (c) c.style.cursor = lastPt && runPickers(lastPt) ? 'pointer' : ''
        })
      })
      map.on('movestart', (e) => { if (e.originalEvent) userMoved.current = true })
      map.on('moveend', () => cb.current.onCamera?.({ pitch: map.getPitch(), bearing: map.getBearing(), zoom: map.getZoom() }))

      ro = new ResizeObserver(() => { try { map?.resize() } catch { /* ignore */ } })
      ro.observe(container)
    }
    run()

    return () => {
      disposed = true
      clearTimeout(idleTimer)
      clearTimeout(loadTimer)
      cancelAnimationFrame(hoverRaf)
      try { ro?.disconnect() } catch { /* ignore */ }
      try { map?.remove() } catch { /* ignore */ }
      map = null
      mapRef.current = null
    }
  }, [attempt])

  /* late server camera (summary.map_default): only applied if the user has not touched the map yet */
  const viewKey = `${defaultView.center[0]},${defaultView.center[1]},${defaultView.zoom}`
  useEffect(() => {
    if (!ready || userMoved.current) return
    try { ready.map.jumpTo({ center: defaultView.center, zoom: defaultView.zoom, bearing: defaultView.bearing }) } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, viewKey])

  useEffect(() => { if (ready) setBuildingsVisible(ready.map, layers.buildings) }, [ready, layers.buildings])

  useImperativeHandle(ref, () => {
    const m = () => mapRef.current
    const dur = (ms) => (cb.current.reducedMotion ? 0 : ms)
    return {
      zoomIn: () => m()?.zoomIn({ duration: dur(250) }),
      zoomOut: () => m()?.zoomOut({ duration: dur(250) }),
      resetNorth: () => m()?.easeTo({ bearing: 0, duration: dur(500) }),
      setPitch: (pitch) => m()?.easeTo({ pitch, duration: dur(600) }),
      resetCamera: () => { const v = cb.current.defaultView; m()?.easeTo({ center: v.center, zoom: v.zoom, bearing: v.bearing, pitch: cb.current.flatStart ? FLAT_PITCH : v.pitch, duration: dur(900) }) },
      flyTo: (lngLat, zoom = 16) => {
        const map = m()
        if (!map || !lngLat) return
        userMoved.current = true
        const z = Math.max(map.getZoom(), zoom)
        if (cb.current.reducedMotion) map.jumpTo({ center: lngLat, zoom: z })
        else map.flyTo({ center: lngLat, zoom: z, speed: 1.3, essential: false })
      },
    }
  }, [])

  const retry = () => { setError(null); setRendered(false); setAttempt((a) => a + 1) }

  if (error) return <MapErrorState message={error.message} onRetry={retry}>{fallback}</MapErrorState>

  const selVehicle = selection?.type === 'vehicle' ? selection.id : null
  return (
    <div className="ct-map bg-paper" style={{ position: 'absolute', inset: 0 }}>
      <style>{MAP_CSS}</style>
      {/* NOTE: maplibre-gl.css sets `.maplibregl-map{position:relative}` unlayered, which beats Tailwind's layered
          `absolute inset-0` and collapsed this box to 0 px. Size it explicitly instead. */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} role="region" aria-label="Interactive map of Bengaluru. Use the list view for a keyboard-friendly alternative." />
      {ready && (
        <>
          <RouteLayer map={ready.map} fonts={ready.fonts} routes={data.routes} vehicles={data.vehicles} bins={data.bins} visible={layers.routes} />
          <ComplaintMarkerLayer map={ready.map} fonts={ready.fonts} registerPicker={registerPicker} active={data.active} resolved={data.resolved}
            showActive={layers.complaints} showResolved={layers.resolved} flash={flash} reducedMotion={reducedMotion} />
          <BinLayer map={ready.map} fonts={ready.fonts} registerPicker={registerPicker} bins={data.bins} visible={layers.bins} />
          <SelectionRing map={ready.map} point={selection && selection.type !== 'vehicle' ? selectedPoint : null} />
          <VehicleLayer map={ready.map} maplibregl={ready.maplibregl} registerPicker={registerPicker} vehicles={data.vehicles} visible={layers.vehicles}
            selectedId={selVehicle} onSelect={onSelect} onMode={onVehicleMode} prefer3D />
        </>
      )}
      {(!rendered || loading) && (
        <div role="status" aria-live="polite" className="absolute inset-0 z-[5] flex items-center justify-center bg-paper">
          <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 gap-3 p-6 opacity-60" aria-hidden>
            {Array.from({ length: 24 }).map((_, i) => <div key={i} className="animate-pulse rounded-[10px] border border-line bg-surface/70" style={{ animationDelay: `${(i % 6) * 90}ms` }} />)}
          </div>
          <p className="relative rounded-[10px] border border-line bg-surface px-4 py-2 text-sm font-medium text-ink">Loading the Bengaluru map...</p>
        </div>
      )}
    </div>
  )
})

export default CityMap
