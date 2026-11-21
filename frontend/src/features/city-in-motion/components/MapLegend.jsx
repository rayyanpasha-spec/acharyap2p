// Legend: severity (colour + size + glyph), under-review ring, resolved, bins, route and vehicle. Entries follow the visible layers.
import { Check } from 'lucide-react'
import { BIN_STATUS, RESOLVED_COLOR, ROUTE_COLORS, SEVERITY, SEVERITY_ORDER } from '../utils/mapConfig'

const GLYPH = { critical: '!', high: '^', medium: '', low: '' }

function Dot({ color, size, glyph, hollow }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold leading-none"
      style={{ width: size, height: size, background: hollow ? '#fff' : color, border: hollow ? `3px solid ${color}` : '2px solid #fff', outline: '1px solid #d4d6cc', color: hollow ? color : '#fff', fontSize: size * 0.6 }}
      aria-hidden
    >
      {glyph === '^' ? <span style={{ fontSize: size * 0.55, marginTop: 1 }}>&#9650;</span> : glyph}
    </span>
  )
}

function Row({ icon, label, note }) {
  return (
    <li className="flex items-center gap-2.5 py-[3px] text-[13px] text-ink">
      <span className="flex w-8 shrink-0 justify-center">{icon}</span>
      <span>{label}{note && <span className="text-muted"> {note}</span>}</span>
    </li>
  )
}

export default function MapLegend({ layers }) {
  const showIssues = layers.complaints
  const showResolved = layers.resolved
  return (
    <div className="text-sm">
      {(showIssues || showResolved) && (
        <ul aria-label="Civic issues legend" className="mb-2">
          {showIssues && SEVERITY_ORDER.map((s) => (
            <Row key={s} icon={<Dot color={SEVERITY[s].color} size={SEVERITY[s].size - 6} glyph={GLYPH[s]} />} label={SEVERITY[s].label} note={s === 'critical' ? '(warning mark)' : s === 'high' ? '(chevron)' : ''} />
          ))}
          {showIssues && <Row icon={<Dot color="#2F5F8F" size={18} hollow />} label="Under review" note="(hollow ring)" />}
          {showResolved && <Row icon={<span className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-white" style={{ background: RESOLVED_COLOR, outline: '1px solid #d4d6cc' }}><Check className="h-3 w-3" strokeWidth={3} aria-hidden /></span>} label="Resolved (verified)" />}
          {showIssues && <Row icon={<span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-forest text-[11px] font-bold text-white" style={{ outline: '2px solid #fff' }} aria-hidden>9</span>} label="Cluster" note="(zoom in to expand)" />}
        </ul>
      )}
      {layers.bins && (
        <ul aria-label="Bin legend" className="mb-2 border-t border-line pt-2">
          {Object.entries(BIN_STATUS).map(([k, b]) => (
            <Row key={k} icon={<span className="h-4 w-4 rounded-[5px]" style={{ background: b.color, outline: '1px solid #d4d6cc' }} aria-hidden />} label={b.label} note={`(${b.range})`} />
          ))}
        </ul>
      )}
      {(layers.routes || layers.vehicles) && (
        <ul aria-label="Fleet legend" className="border-t border-line pt-2">
          {layers.routes && <Row icon={<span className="h-[3px] w-7 rounded" style={{ background: ROUTE_COLORS.remaining }} aria-hidden />} label="Route ahead" />}
          {layers.routes && <Row icon={<span className="h-[3px] w-7 rounded" style={{ background: ROUTE_COLORS.done }} aria-hidden />} label="Route completed" />}
          {layers.vehicles && <Row icon={<span className="h-3 w-6 rounded-[3px] border border-forest bg-white" aria-hidden><span className="block h-full w-2 rounded-l-[2px] bg-forest" /></span>} label="Collection vehicle" note="(simulated)" />}
        </ul>
      )}
    </div>
  )
}
