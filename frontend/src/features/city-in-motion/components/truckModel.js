// Procedural low-poly garbage truck built in code (no third-party model is bundled).
// `T` is the three namespace, passed in so this module never statically imports three (it stays out of the main chunk).
// Orientation convention (see utils/mapConfig.js): metres, +X right, +Y FORWARD, +Z up, origin = centre of ground footprint.
import { GLB_URL, TRUCK_LENGTH_M } from '../utils/mapConfig'

export const PALETTES = {
  normal: { cab: '#2F7D4F', body: '#F4F4EF', stripe: '#C1782E', hopper: '#8E968F', chassis: '#2B302C', glass: '#2F3F4A', tire: '#1F2321', hub: '#B8BCB4', patch: '#244C39' },
  stale: { cab: '#8C938D', body: '#D9DBD5', stripe: '#B5B8B0', hopper: '#B0B5AF', chassis: '#7A807B', glass: '#6C777E', tire: '#5C625E', hub: '#C9CCC6', patch: '#8C938D' },
}

export function buildProceduralTruck(T, palette = PALETTES.normal) {
  const g = new T.Group()
  g.name = 'civiclens-garbage-truck'
  const lambert = (color) => new T.MeshLambertMaterial({ color })
  const basic = (color) => new T.MeshBasicMaterial({ color })
  const add = (geo, mat, x, y, z) => {
    const m = new T.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.frustumCulled = false
    g.add(m)
    return m
  }
  const box = (w, l, h, mat, x, y, z) => add(new T.BoxGeometry(w, l, h), mat, x, y, z)

  const mBody = lambert(palette.body)
  const mCab = lambert(palette.cab)
  const mChassis = lambert(palette.chassis)
  const mGlass = lambert(palette.glass)
  const mStripe = lambert(palette.stripe)
  const mHopper = lambert(palette.hopper)

  // chassis + cab
  box(2.2, 6.9, 0.4, mChassis, 0, 0, 0.85)
  box(2.4, 2.1, 2.0, mCab, 0, 2.55, 2.05)
  box(2.0, 0.08, 0.9, mGlass, 0, 3.62, 2.5) // windscreen
  box(2.42, 0.06, 0.7, mGlass, 0, 3.0, 2.55).scale.set(1, 12, 1) // side glazing band (reads as door windows)
  box(2.4, 0.3, 0.35, mChassis, 0, 3.7, 1.15) // bumper
  // compaction body: box + rounded roof
  box(2.5, 4.3, 1.2, mBody, 0, -1.15, 1.65)
  const roof = add(new T.CylinderGeometry(1.25, 1.25, 4.3, 14, 1, false, -Math.PI / 2, Math.PI), mBody, 0, -1.15, 2.25)
  roof.rotation.y = 0
  // livery: saffron band + forest patches on both sides
  box(2.56, 4.3, 0.16, mStripe, 0, -1.15, 1.32)
  const patch = lambert(palette.patch)
  box(0.03, 1.5, 0.55, patch, 1.265, -1.15, 2.35)
  box(0.03, 1.5, 0.55, patch, -1.265, -1.15, 2.35)
  // rear hopper
  box(2.3, 0.9, 1.5, mHopper, 0, -3.35, 1.8)
  box(2.4, 0.18, 0.3, mChassis, 0, -3.84, 1.2)
  // wheels (6) + hubs
  const wheelGeo = new T.CylinderGeometry(0.55, 0.55, 0.42, 14)
  const hubGeo = new T.CylinderGeometry(0.28, 0.28, 0.46, 10)
  const mTire = lambert(palette.tire)
  const mHub = lambert(palette.hub)
  ;[2.5, -1.3, -2.7].forEach((y) => {
    ;[-1.12, 1.12].forEach((x) => {
      const w = add(wheelGeo, mTire, x, y, 0.55)
      w.rotation.z = Math.PI / 2
      const h = add(hubGeo, mHub, x, y, 0.55)
      h.rotation.z = Math.PI / 2
    })
  })
  // lights + roof beacon (unlit materials so they stay readable)
  const mHead = basic('#FFF3C4')
  const mTail = basic('#B94A48')
  const mBeacon = basic('#D9A441')
  box(0.4, 0.06, 0.22, mHead, -0.8, 3.86, 1.45)
  box(0.4, 0.06, 0.22, mHead, 0.8, 3.86, 1.45)
  box(0.34, 0.06, 0.2, mTail, -0.9, -3.95, 1.5)
  box(0.34, 0.06, 0.2, mTail, 0.9, -3.95, 1.5)
  const beacon = add(new T.CylinderGeometry(0.16, 0.16, 0.2, 8), mBeacon, 0, 2.6, 3.15)
  beacon.rotation.x = 0
  // soft ground shadow
  const shadow = add(new T.CircleGeometry(1, 24), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0, 0, 0.04)
  shadow.scale.set(1.75, 4.3, 1)
  shadow.renderOrder = -1
  return g
}

/** Flat ring used to mark the selected vehicle (shared geometry/material across all vehicles). */
export function buildSelectionRing(T) {
  const ring = new T.Mesh(
    new T.RingGeometry(5.2, 6.1, 40),
    new T.MeshBasicMaterial({ color: 0x2f5f8f, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  )
  ring.position.z = 0.06
  ring.frustumCulled = false
  ring.visible = false
  return ring
}

export function disposeObject(root) {
  if (!root) return
  const geos = new Set()
  const mats = new Set()
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry)
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m))
  })
  geos.forEach((g) => g.dispose())
  mats.forEach((m) => m.dispose())
}

/**
 * Optional: if `/models/vehicles/garbage-truck.glb` exists it is used instead of the procedural truck.
 * Vite's dev server and SPA hosts answer unknown paths with index.html (HTTP 200), so we check the "glTF" magic bytes.
 * Returns a Group in the project convention, or null when no usable GLB is present.
 */
export async function loadGlbTruck(T, url = GLB_URL) {
  let buf
  try {
    const res = await fetch(url, { cache: 'force-cache' })
    if (!res.ok) return null
    buf = await res.arrayBuffer()
  } catch {
    return null
  }
  if (buf.byteLength < 12 || new DataView(buf).getUint32(0, true) !== 0x46546c67) return null
  try {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buf, '', resolve, reject))
    const inner = gltf.scene
    // glTF is +Y up, +Z front. Convert once: Rx(+90deg) maps up to +Z (front becomes -Y), Rz(180deg) makes the front +Y.
    const root = new T.Group()
    inner.rotation.set(Math.PI / 2, 0, 0)
    root.rotation.set(0, 0, Math.PI)
    root.add(inner)
    root.updateMatrixWorld(true)
    // normalise: ground-centred, scaled so the longest horizontal side equals TRUCK_LENGTH_M
    const box = new T.Box3().setFromObject(root)
    const size = box.getSize(new T.Vector3())
    const long = Math.max(size.x, size.y) || 1
    const k = TRUCK_LENGTH_M / long
    const wrap = new T.Group()
    wrap.add(root)
    root.scale.multiplyScalar(k)
    root.updateMatrixWorld(true)
    const b2 = new T.Box3().setFromObject(root)
    const c = b2.getCenter(new T.Vector3())
    root.position.set(-c.x, -c.y, -b2.min.z)
    wrap.traverse((o) => { o.frustumCulled = false })
    wrap.name = 'civiclens-garbage-truck-glb'
    return wrap
  } catch {
    return null
  }
}
