// Canvas-drawn marker icons registered with map.addImage. Drawing them here (instead of relying on font glyphs) keeps
// the "!" / check / bin glyphs crisp and independent of the basemap's glyph server.
import { BIN_STATUS, RESOLVED_COLOR, SEVERITY } from '../utils/mapConfig'

const RATIO = 2

function make(size, draw) {
  const px = Math.ceil(size * RATIO)
  const c = document.createElement('canvas')
  c.width = px
  c.height = px
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.scale(RATIO, RATIO)
  draw(ctx, size)
  return ctx.getImageData(0, 0, px, px)
}

function disc(ctx, cx, cy, r, fill, stroke, lw = 0) {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke() }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function glyph(ctx, kind, cx, cy, s, color) {
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (kind === '!') {
    roundRect(ctx, cx - s * 0.09, cy - s * 0.32, s * 0.18, s * 0.42, s * 0.08)
    ctx.fill()
    disc(ctx, cx, cy + s * 0.27, s * 0.1, color)
  } else if (kind === '^') {
    ctx.lineWidth = s * 0.16
    ctx.beginPath()
    ctx.moveTo(cx - s * 0.24, cy + s * 0.1)
    ctx.lineTo(cx, cy - s * 0.16)
    ctx.lineTo(cx + s * 0.24, cy + s * 0.1)
    ctx.stroke()
  } else if (kind === '.') {
    disc(ctx, cx, cy, s * 0.13, color)
  } else if (kind === 'check') {
    ctx.lineWidth = s * 0.15
    ctx.beginPath()
    ctx.moveTo(cx - s * 0.26, cy + s * 0.02)
    ctx.lineTo(cx - s * 0.07, cy + s * 0.22)
    ctx.lineTo(cx + s * 0.28, cy - s * 0.2)
    ctx.stroke()
  }
}

function complaintIcon(sev, review) {
  const cfg = SEVERITY[sev]
  return make(cfg.size + 4, (ctx, size) => {
    const c = size / 2
    disc(ctx, c, c, c - 0.5, 'rgba(255,255,255,0.96)')
    const r = c - 2.5
    if (review) {
      // under review = hollow ring in the severity colour
      disc(ctx, c, c, r - 1, '#FFFFFF', cfg.color, 3)
      glyph(ctx, cfg.glyph, c, c, size * 0.7, cfg.color)
    } else {
      disc(ctx, c, c, r, cfg.color)
      glyph(ctx, cfg.glyph, c, c, size * 0.7, '#FFFFFF')
    }
  })
}

function resolvedIcon() {
  return make(26, (ctx, size) => {
    const c = size / 2
    disc(ctx, c, c, c - 0.5, 'rgba(255,255,255,0.96)')
    disc(ctx, c, c, c - 2.5, RESOLVED_COLOR)
    glyph(ctx, 'check', c, c, size * 0.8, '#FFFFFF')
  })
}

function binIcon(color, urgent) {
  return make(30, (ctx, size) => {
    ctx.fillStyle = 'rgba(255,255,255,0.97)'
    roundRect(ctx, 0.5, 0.5, size - 1, size - 1, 8)
    ctx.fill()
    ctx.fillStyle = color
    roundRect(ctx, 3, 3, size - 6, size - 6, 6)
    ctx.fill()
    // bin pictogram: lid + tapered body
    ctx.fillStyle = '#FFFFFF'
    roundRect(ctx, size * 0.28, size * 0.26, size * 0.44, size * 0.08, 1)
    ctx.fill()
    roundRect(ctx, size * 0.44, size * 0.2, size * 0.12, size * 0.07, 1)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(size * 0.31, size * 0.38)
    ctx.lineTo(size * 0.69, size * 0.38)
    ctx.lineTo(size * 0.65, size * 0.76)
    ctx.lineTo(size * 0.35, size * 0.76)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.2
    ;[0.43, 0.5, 0.57].forEach((x) => { ctx.beginPath(); ctx.moveTo(size * x, size * 0.45); ctx.lineTo(size * x, size * 0.69); ctx.stroke() })
    if (urgent) {
      disc(ctx, size - 4.5, 4.5, 4.5, '#FFFFFF')
      disc(ctx, size - 4.5, 4.5, 3.3, color)
      glyph(ctx, '!', size - 4.5, 4.5, 7, '#FFFFFF')
    }
  })
}

/** Top-down truck pictogram pointing north (icon-rotate = heading). Used by the 2D vehicle fallback. */
function vehicleIcon(stale) {
  const body = stale ? '#9AA19B' : '#244C39'
  return make(40, (ctx, size) => {
    const c = size / 2
    disc(ctx, c, c, c - 0.5, 'rgba(255,255,255,0.97)')
    disc(ctx, c, c, c - 3, stale ? '#E4E6E0' : '#E3EDE6')
    ctx.fillStyle = '#F7F7F2'
    ctx.strokeStyle = body
    ctx.lineWidth = 1.6
    roundRect(ctx, c - 5.5, c - 4, 11, 15, 2)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = body
    roundRect(ctx, c - 5.5, c - 12, 11, 8, 2.5)
    ctx.fill()
    ctx.fillStyle = '#F7F7F2'
    roundRect(ctx, c - 3.6, c - 10.6, 7.2, 3.2, 1)
    ctx.fill()
    ctx.fillStyle = '#C1782E'
    ctx.fillRect(c - 5.5, c + 2, 11, 2)
  })
}

/** Register every icon once (idempotent). Failures are swallowed per icon: layers then simply render without that image. */
export function registerIcons(map) {
  const add = (id, build) => {
    try {
      if (map.hasImage(id)) return
      map.addImage(id, build(), { pixelRatio: RATIO })
    } catch { /* ignore a single bad icon */ }
  }
  Object.keys(SEVERITY).forEach((sev) => {
    add(`cl-${sev}`, () => complaintIcon(sev, false))
    add(`cl-${sev}-review`, () => complaintIcon(sev, true))
  })
  add('cl-resolved', resolvedIcon)
  Object.entries(BIN_STATUS).forEach(([k, v]) => add(`cl-bin-${k}`, () => binIcon(v.color, k === 'overflow_risk')))
  add('cl-vehicle', () => vehicleIcon(false))
  add('cl-vehicle-stale', () => vehicleIcon(true))
}
