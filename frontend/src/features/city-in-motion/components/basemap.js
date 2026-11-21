// Basemap helpers: Civic Minimalism recolouring (paper land, muted green parks, soft water, warm grey buildings)
// and glyph-font detection. Everything is best-effort: a layer id that does not exist is simply skipped.
import { LYR } from '../utils/mapConfig'

const safe = (fn) => { try { fn() } catch { /* layer missing or property not applicable */ } }

export function restyleBasemap(map) {
  const layers = map.getStyle()?.layers || []
  const firstSymbol = layers.find((l) => l.type === 'symbol')?.id
  for (const l of layers) {
    const id = l.id
    if (l.type === 'background') {
      safe(() => map.setPaintProperty(id, 'background-color', '#F3F2EC'))
    } else if (l.type === 'fill') {
      if (/water/i.test(id)) safe(() => map.setPaintProperty(id, 'fill-color', '#C8DAE1'))
      else if (/(^|_|-)(park|wood|forest|grass|garden|golf|pitch)/i.test(id)) safe(() => map.setPaintProperty(id, 'fill-color', '#DCE6D5'))
      else if (id === 'building') {
        safe(() => map.setPaintProperty(id, 'fill-color', '#E4E3DC'))
        safe(() => map.setPaintProperty(id, 'fill-outline-color', '#D3D2C9'))
      }
    } else if (l.type === 'line' && /waterway|river|stream/i.test(id)) {
      safe(() => map.setPaintProperty(id, 'line-color', '#B9CED6'))
    } else if (l.type === 'symbol' && /^poi/i.test(id)) {
      safe(() => map.setLayoutProperty(id, 'visibility', 'none')) // calmer map: points of interest add noise to an operations view
    }
  }

  // 3D buildings: retune the style's own extrusion layer (muted warm grey, no vertical gradient), visible from zoom 14.
  if (map.getLayer('building-3d')) {
    safe(() => map.setPaintProperty('building-3d', 'fill-extrusion-color', '#CDD0C6'))
    safe(() => map.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.92))
    safe(() => map.setPaintProperty('building-3d', 'fill-extrusion-vertical-gradient', true))   // engine lighting for depth
    // exaggerated height so the 3D city reads clearly at city zoom
    safe(() => map.setPaintProperty('building-3d', 'fill-extrusion-height', ['*', 1.8, ['coalesce', ['get', 'render_height'], ['get', 'height'], 9]]))
    safe(() => map.setPaintProperty('building-3d', 'fill-extrusion-base', ['*', 1.8, ['coalesce', ['get', 'render_min_height'], 0]]))
    safe(() => map.setLayerZoomRange('building-3d', 13, 24))
    return 'building-3d'
  }
  if (map.getSource('openmaptiles')) {
    try {
      map.addLayer({
        id: LYR.buildingsFallback,
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': '#D8DAD3',
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 8],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.88,
          'fill-extrusion-vertical-gradient': false,
        },
      }, firstSymbol)
      return LYR.buildingsFallback
    } catch { /* no building data: the basemap simply stays flat */ }
  }
  return null
}

/** Pick glyph font stacks that the loaded style's glyph server actually serves. */
export function detectFonts(map) {
  let regular = null
  let bold = null
  for (const l of map.getStyle()?.layers || []) {
    let tf = l.layout?.['text-font']
    if (Array.isArray(tf) && tf[0] === 'literal' && Array.isArray(tf[1])) tf = tf[1]
    if (!Array.isArray(tf) || !tf.length || !tf.every((x) => typeof x === 'string')) continue
    if (/bold/i.test(tf[0])) bold = bold || tf
    else regular = regular || tf
  }
  const r = regular || ['Noto Sans Regular']
  return { regular: r, bold: bold || r }
}

export function setBuildingsVisible(map, visible) {
  for (const id of ['building-3d', LYR.buildingsFallback]) {
    safe(() => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none') })
  }
}
