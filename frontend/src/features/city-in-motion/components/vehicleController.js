// Vehicle rendering engine: a MapLibre custom 3D layer drawn with Three.js, plus HTML label markers, plus a 2D symbol fallback.
// All animation state lives here (plain objects + one rAF loop); React only receives selection events - never per-frame state.
import { LYR, SRC, TRUCK_LENGTH_M, VEHICLE_SCALE_MAX, VEHICLE_SCALE_MIN, VEHICLE_STATUS, VEHICLE_TARGET_PX } from '../utils/mapConfig'
import { validLngLat } from '../utils/geojson'
import { angleDelta, bearingDeg, haversineM, metersPerPixel } from '../utils/routeMath'
import { buildProceduralTruck, buildSelectionRing, disposeObject, loadGlbTruck, PALETTES } from './truckModel'

const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const MOVING = new Set(['moving', 'collecting'])
const JUMP_SNAP_M = 800
const PUSH_2D_MS = 66

/* ------------------------------------------------------------------------------------------------------------------ */
/* Three.js scene wrapped as a MapLibre custom layer (v4 API: onAdd(map, gl), render(gl, matrix), onRemove(map, gl))   */
/* ------------------------------------------------------------------------------------------------------------------ */
class ThreeScene {
  constructor(T, ctl) {
    this.T = T
    this.ctl = ctl
    this.failed = false
    this.disposed = false
    this.protoVersion = 0
    this.layer = {
      id: LYR.vehicles3d,
      type: 'custom',
      renderingMode: '3d',
      onAdd: (map, gl) => this.onAdd(map, gl),
      render: (gl, matrix) => this.render(gl, matrix),
      onRemove: () => this.dispose(),
    }
  }

  onAdd(map, gl) {
    const T = this.T
    this.map = map
    if (import.meta.env.DEV) window.__threeScene = this   // dev-only debug handle
    this.camera = new T.Camera()
    this.scene = new T.Scene()
    this.m = new T.Matrix4()
    this.l = new T.Matrix4()
    this.vec = new T.Vector3()
    this.scene.add(new T.HemisphereLight(0xffffff, 0xb9b6aa, 1.5))
    const sun = new T.DirectionalLight(0xffffff, 2.0)
    sun.position.set(-40, -70, 90) // from the south-west, above (local frame: +X east, +Y north, +Z up)
    this.scene.add(sun)
    // Share the map's GL context and canvas; MapLibre owns clearing, so autoClear is off.
    this.renderer = new T.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
    this.renderer.autoClear = false
    this.proto = buildProceduralTruck(T, PALETTES.normal)
    this.protoStale = buildProceduralTruck(T, PALETTES.stale)
    this.ringProto = buildSelectionRing(T)
  }

  /** Swap the procedural truck for a user-supplied GLB (already converted to the project convention). */
  setGlbPrototype(group) {
    if (this.disposed) return
    const T = this.T
    const grey = new T.MeshLambertMaterial({ color: 0xa9aea8 })
    const staleGroup = group.clone(true)
    staleGroup.traverse((o) => { if (o.isMesh) o.material = grey })
    const oldA = this.proto
    const oldB = this.protoStale
    this.proto = group
    this.protoStale = staleGroup
    this.protoVersion += 1
    // old clones are swapped out before the next draw; free their GPU buffers now
    disposeObject(oldA)
    disposeObject(oldB)
    this.ctl.map.triggerRepaint()
  }

  _ensureHolder(v) {
    const T = this.T
    let h = v.holder
    if (!h) {
      h = new T.Group()
      h.visible = false
      h.userData.ring = this.ringProto.clone()
      h.add(h.userData.ring)
      this.scene.add(h)
      v.holder = h
    }
    if (!h.userData.model || h.userData.stale !== v.stale || h.userData.ver !== this.protoVersion) {
      if (h.userData.model) h.remove(h.userData.model)
      const model = (v.stale ? this.protoStale : this.proto).clone()
      h.add(model)
      h.userData.model = model
      h.userData.stale = v.stale
      h.userData.ver = this.protoVersion
    }
    return h
  }

  removeHolder(v) {
    if (v.holder) { this.scene?.remove(v.holder); v.holder = null }
  }

  render(gl, arg) {
    if (this.failed || this.disposed || !this.renderer) return
    const ctl = this.ctl
    if (!ctl.visible || ctl.v.size === 0) return
    try {
      const mat = Array.isArray(arg) || ArrayBuffer.isView(arg) ? arg : arg?.defaultProjectionData?.mainMatrix
      if (!mat) return
      this.m.fromArray(mat)
      const r = this.renderer
      r.resetState()
      // three caches the viewport from construction time; re-assert it every frame so map resizes never break the overlay
      r.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
      const zoom = this.map.getZoom()
      const MC = ctl.maplibregl.MercatorCoordinate
      let prev = null
      for (const v of ctl.v.values()) {
        const h = this._ensureHolder(v)
        const k = clamp((VEHICLE_TARGET_PX * metersPerPixel(zoom, v.cur.lat)) / TRUCK_LENGTH_M, VEHICLE_SCALE_MIN, VEHICLE_SCALE_MAX)
        const merc = MC.fromLngLat([v.cur.lng, v.cur.lat], 0)
        const s = merc.meterInMercatorCoordinateUnits() * k
        // projection = mapMatrix * T(mercator position) * S(s, -s, s): done in doubles to avoid float32 jitter at high zoom.
        this.l.makeTranslation(merc.x, merc.y, merc.z).scale(this.vec.set(s, -s, s))
        this.camera.projectionMatrix.multiplyMatrices(this.m, this.l)
        h.rotation.z = -(v.cur.hdg * Math.PI) / 180 // heading is clockwise from north; model faces +Y
        h.userData.ring.visible = ctl.selectedId === v.id
        if (prev) prev.visible = false
        h.visible = true
        prev = h
        r.render(this.scene, this.camera)
      }
      if (prev) prev.visible = false
    } catch (err) {
      this.failed = true
      setTimeout(() => ctl.onThreeFailure(err), 0)
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    try {
      disposeObject(this.proto)
      disposeObject(this.protoStale)
      disposeObject(this.ringProto)
      this.scene?.clear()
      this.renderer?.dispose()
    } catch { /* ignore */ }
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Controller                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */
export class VehicleController {
  constructor({ map, maplibregl, onSelect, onMode, prefer3D = true }) {
    this.map = map
    this.maplibregl = maplibregl
    this.onSelect = onSelect
    this.onMode = onMode
    this.prefer3D = prefer3D
    this.v = new Map()
    this.visible = true
    this.mode = null
    this.selectedId = null
    this.destroyed = false
    this.raf = 0
    this.lastPush = 0
    this.three = null
    this.layerAdded = false
    this._tick = this._tick.bind(this)
  }

  async init() {
    try {
      if (!this.prefer3D) throw new Error('3D vehicle layer disabled')
      const T = await import('three')
      if (this.destroyed) return
      this.three = new ThreeScene(T, this)
      this.map.addLayer(this.three.layer) // onAdd runs synchronously; any WebGL/three failure throws here
      this.layerAdded = true
      this._setMode('3d')
      loadGlbTruck(T).then((g) => { if (g && !this.destroyed && this.three) this.three.setGlbPrototype(g) }).catch(() => {})
    } catch (err) {
      this._fallback2D(err)
    }
    this._kick()
  }

  onThreeFailure(err) { this._fallback2D(err) }

  _setMode(mode, err) {
    this.mode = mode
    this.onMode?.(mode, err)
  }

  _fallback2D(err) {
    if (this.destroyed) return
    try { if (this.layerAdded && this.map.getLayer(LYR.vehicles3d)) this.map.removeLayer(LYR.vehicles3d) } catch { /* ignore */ }
    this.layerAdded = false
    if (this.three) { this.three.dispose(); this.three = null }
    this.v.forEach((v) => { v.holder = null })
    try {
      if (!this.map.getSource(SRC.vehicles2d)) this.map.addSource(SRC.vehicles2d, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      if (!this.map.getLayer(LYR.vehicles2d)) {
        this.map.addLayer({
          id: LYR.vehicles2d, type: 'symbol', source: SRC.vehicles2d,
          layout: {
            'icon-image': ['case', ['get', 'stale'], 'cl-vehicle-stale', 'cl-vehicle'],
            'icon-rotate': ['get', 'hdg'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map',
            'icon-allow-overlap': true, 'icon-ignore-placement': true,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 14, 0.85, 17, 1.1],
            visibility: this.visible ? 'visible' : 'none',
          },
        })
      }
    } catch { /* if even 2D symbols fail, the HTML labels remain as the vehicle markers */ }
    this._setMode('2d', err)
    this._push2D()
  }

  /* ---------- data ---------- */
  setVehicles(list) {
    if (this.destroyed) return
    const now = performance.now()
    const seen = new Set()
    for (const item of list || []) {
      const lng = Number(item.longitude)
      const lat = Number(item.latitude)
      if (item.vehicle_id == null || !validLngLat([lng, lat])) continue
      const id = String(item.vehicle_id)
      seen.add(id)
      const stale = !!item.stale
      const hdgIn = item.heading_degrees != null && Number.isFinite(Number(item.heading_degrees)) ? Number(item.heading_degrees) : null
      let v = this.v.get(id)
      if (!v) {
        const h0 = hdgIn ?? 0
        v = { id, code: item.vehicle_code || id, status: item.status, stale, cur: { lng, lat, hdg: h0 }, from: null, to: { lng, lat, hdg: h0 }, t0: 0, dur: 2000, anim: false, lastChange: now, marker: null, holder: null, dirty: true }
        v.marker = this._makeMarker(v, lng, lat)
        this.v.set(id, v)
        continue
      }
      const coordsChanged = Math.abs(v.to.lng - lng) > 1e-8 || Math.abs(v.to.lat - lat) > 1e-8
      v.code = item.vehicle_code || v.code
      if (coordsChanged) {
        const dist = haversineM([v.cur.lng, v.cur.lat], [lng, lat])
        const hdg = hdgIn ?? (dist > 1 ? bearingDeg([v.to.lng, v.to.lat], [lng, lat]) : v.to.hdg)
        v.dur = clamp(now - v.lastChange || 2000, 800, 3500)
        v.from = { ...v.cur }
        v.to = { lng, lat, hdg }
        v.t0 = now
        v.lastChange = now
        // never animate stale/offline vehicles, and snap on large jumps (simulator restart)
        v.anim = !stale && MOVING.has(item.status) && dist < JUMP_SNAP_M
        if (!v.anim) v.cur = { ...v.to }
        v.dirty = true
      } else if (hdgIn != null && Math.abs(angleDelta(v.to.hdg, hdgIn)) > 0.5) {
        v.to.hdg = hdgIn
        v.cur.hdg = hdgIn
        v.dirty = true
      }
      if (stale && v.anim) { v.anim = false; v.cur = { ...v.to }; v.dirty = true }
      if (v.status !== item.status || v.stale !== stale) {
        v.status = item.status
        v.stale = stale
        this._styleLabel(v)
        v.dirty = true
      }
    }
    for (const [id, v] of this.v) {
      if (seen.has(id)) continue
      v.marker?.remove()
      this.three?.removeHolder(v)
      this.v.delete(id)
    }
    this._applyVisibility()
    this._kick()
  }

  setVisible(visible) {
    this.visible = !!visible
    this._applyVisibility()
    try { if (this.map.getLayer(LYR.vehicles2d)) this.map.setLayoutProperty(LYR.vehicles2d, 'visibility', this.visible ? 'visible' : 'none') } catch { /* ignore */ }
    if (this.visible) this._kick()
    try { this.map.triggerRepaint() } catch { /* ignore */ }
  }

  setSelected(id) {
    this.selectedId = id == null ? null : String(id)
    this.v.forEach((v) => this._styleLabel(v))
    try { this.map.triggerRepaint() } catch { /* ignore */ }
  }

  /** Nearest vehicle to a screen point (within a readable hit radius), for click + hover. */
  pick(point) {
    if (!this.visible) return null
    let best = null
    let bestD = 26
    for (const v of this.v.values()) {
      const p = this.map.project([v.cur.lng, v.cur.lat])
      const d = Math.hypot(p.x - point.x, p.y - point.y)
      if (d < bestD) { bestD = d; best = v }
    }
    return best ? { type: 'vehicle', id: best.id, lngLat: [best.cur.lng, best.cur.lat] } : null
  }

  /* ---------- labels ---------- */
  _makeMarker(v, lng, lat) {
    const el = document.createElement('button')
    el.type = 'button'
    const dot = document.createElement('span')
    dot.className = 'dot'
    const txt = document.createElement('span')
    txt.className = 'txt'
    el.append(dot, txt)
    ;['click', 'mousedown', 'dblclick', 'touchstart'].forEach((evt) => el.addEventListener(evt, (e) => {
      e.stopPropagation()
      if (evt === 'click') this.onSelect?.(v.id)
    }, evt === 'touchstart' ? { passive: true } : undefined))
    v.el = el
    this._styleLabel(v)
    return new this.maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -14] }).setLngLat([lng, lat]).addTo(this.map)
  }

  _styleLabel(v) {
    const el = v.el
    if (!el) return
    const st = VEHICLE_STATUS[v.status] || VEHICLE_STATUS.idle
    el.className = `ct-vlabel${this.selectedId === v.id ? ' is-selected' : ''}${v.stale ? ' is-stale' : ''}`
    el.firstChild.style.background = v.stale ? '#9AA19B' : st.color
    el.lastChild.textContent = v.code
    el.setAttribute('aria-label', `Vehicle ${v.code}, ${st.label}${v.stale ? ', location may be outdated' : ''}. Open details`)
    el.title = v.stale ? 'Location may be outdated' : `${v.code} - ${st.label}`
  }

  _applyVisibility() {
    this.v.forEach((v) => { if (v.el) v.el.style.display = this.visible ? '' : 'none' })
  }

  /* ---------- animation loop (only runs while something is moving or marked dirty) ---------- */
  _kick() {
    if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(this._tick)
  }

  _tick(now) {
    this.raf = 0
    if (this.destroyed) return
    let animating = false
    let changed = false
    for (const v of this.v.values()) {
      if (v.anim) {
        const p = clamp((now - v.t0) / v.dur, 0, 1)
        v.cur.lng = v.from.lng + (v.to.lng - v.from.lng) * p
        v.cur.lat = v.from.lat + (v.to.lat - v.from.lat) * p
        v.cur.hdg = (v.from.hdg + angleDelta(v.from.hdg, v.to.hdg) * p + 360) % 360
        if (p >= 1) { v.anim = false; v.cur = { ...v.to } } else animating = true
        v.dirty = true
      }
      if (v.dirty) {
        v.dirty = false
        changed = true
        v.marker?.setLngLat([v.cur.lng, v.cur.lat])
      }
    }
    if (changed) {
      if (this.mode === '3d') { try { this.map.triggerRepaint() } catch { /* ignore */ } }
      else if (this.mode === '2d' && (!animating || now - this.lastPush > PUSH_2D_MS)) { this.lastPush = now; this._push2D() }
    }
    if (animating && this.visible) this._kick()
  }

  _push2D() {
    try {
      const src = this.map.getSource(SRC.vehicles2d)
      if (!src) return
      src.setData({
        type: 'FeatureCollection',
        features: [...this.v.values()].map((v) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [v.cur.lng, v.cur.lat] },
          properties: { id: v.id, code: v.code, hdg: v.cur.hdg, stale: v.stale },
        })),
      })
    } catch { /* ignore */ }
  }

  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    this.v.forEach((v) => v.marker?.remove())
    try { if (this.layerAdded && this.map.getLayer(LYR.vehicles3d)) this.map.removeLayer(LYR.vehicles3d) } catch { /* ignore */ }
    try { if (this.map.getLayer(LYR.vehicles2d)) this.map.removeLayer(LYR.vehicles2d) } catch { /* ignore */ }
    try { if (this.map.getSource(SRC.vehicles2d)) this.map.removeSource(SRC.vehicles2d) } catch { /* ignore */ }
    if (this.three) { this.three.dispose(); this.three = null }
    this.v.clear()
  }
}
