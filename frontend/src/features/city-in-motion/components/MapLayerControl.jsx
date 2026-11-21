// Layer toggles with colour keys. Plain checkboxes: keyboard and screen-reader friendly.
import { cn } from '../../../components/ui'
import { BIN_STATUS, RESOLVED_COLOR, ROUTE_COLORS, SEVERITY } from '../utils/mapConfig'

const ROWS = [
  { id: 'complaints', label: 'Civic issues', swatch: SEVERITY.high.color, shape: 'rounded-full' },
  { id: 'resolved', label: 'Resolved issues', swatch: RESOLVED_COLOR, shape: 'rounded-full' },
  { id: 'vehicles', label: 'Collection vehicles', swatch: '#244C39', shape: 'rounded-[3px]' },
  { id: 'routes', label: 'Collection routes', swatch: ROUTE_COLORS.remaining, shape: 'rounded h-[3px]' },
  { id: 'bins', label: 'Waste bins', swatch: BIN_STATUS.filling_up.color, shape: 'rounded-[4px]' },
  { id: 'buildings', label: '3D buildings', swatch: '#D8DAD3', shape: 'rounded-[3px]' },
]

export default function MapLayerControl({ layers, onToggle, counts = {} }) {
  return (
    <fieldset className="space-y-0.5">
      <legend className="sr-only">Map layers</legend>
      {ROWS.map((r) => (
        <label key={r.id} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1 text-sm text-ink hover:bg-paper">
          <input
            type="checkbox"
            checked={!!layers[r.id]}
            onChange={(e) => onToggle(r.id, e.target.checked)}
            className="h-4 w-4 shrink-0 accent-[#244c39]"
          />
          <span className={cn('inline-block w-3.5 shrink-0 border border-line-strong', r.shape.includes('h-[3px]') ? '' : 'h-3.5', r.shape)} style={{ background: r.swatch }} aria-hidden />
          <span className="flex-1">{r.label}</span>
          {counts[r.id] != null && <span className="text-xs tabular-nums text-muted">{counts[r.id]}</span>}
        </label>
      ))}
    </fieldset>
  )
}
