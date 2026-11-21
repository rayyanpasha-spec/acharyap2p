// Complaint filters. Changes are applied by refetching GeoJSON (never by rebuilding the map).
import { Input, Select, cn } from '../../../components/ui'
import { titleCase } from '../../../lib/format'
import { EMPTY_FILTERS, SEVERITY, SEVERITY_ORDER } from '../utils/mapConfig'

const norm = (list, fallbackName = titleCase) =>
  (Array.isArray(list) ? list : []).map((o) => (typeof o === 'string' ? { code: o, name: fallbackName(o) } : { code: o.code ?? o.id, name: o.name ?? o.label ?? fallbackName(String(o.code ?? '')) })).filter((o) => o.code)

/** Build option lists from /city-twin/layers/config, falling back to the taxonomy store. */
export function filterOptions(layersConfig, meta) {
  const f = layersConfig?.filters || {}
  return {
    severities: norm(f.severities).length ? norm(f.severities) : SEVERITY_ORDER.map((s) => ({ code: s, name: SEVERITY[s].label })),
    categories: norm(f.categories).length ? norm(f.categories) : norm(meta?.categories),
    statuses: norm(f.statuses).length ? norm(f.statuses) : norm(meta?.statuses),
    departments: norm(f.departments).length ? norm(f.departments) : norm(meta?.departments),
  }
}

function Row({ id, label, children }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-semibold text-muted">{label}</label>
      {children}
    </div>
  )
}

export default function ComplaintFilters({ filters, onChange, options, signedIn, disabled }) {
  const dirty = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS)
  const sel = 'h-9 text-[13px]'
  const opt = (list) => list.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)
  return (
    <div className={cn('space-y-2.5', disabled && 'pointer-events-none opacity-50')} aria-disabled={disabled || undefined}>
      <Row id="cm-sev" label="Severity">
        <Select id="cm-sev" className={sel} value={filters.severity} onChange={(e) => onChange({ severity: e.target.value })}>
          <option value="">All severities</option>{opt(options.severities)}
        </Select>
      </Row>
      <Row id="cm-cat" label="Category">
        <Select id="cm-cat" className={sel} value={filters.category} onChange={(e) => onChange({ category: e.target.value })}>
          <option value="">All categories</option>{opt(options.categories)}
        </Select>
      </Row>
      <Row id="cm-status" label="Status">
        <Select id="cm-status" className={sel} value={filters.status} onChange={(e) => onChange({ status: e.target.value })}>
          <option value="">Active statuses</option>{opt(options.statuses)}
        </Select>
      </Row>
      <Row id="cm-dept" label="Department">
        <Select id="cm-dept" className={sel} value={filters.department} onChange={(e) => onChange({ department: e.target.value })}>
          <option value="">All departments</option>{opt(options.departments)}
        </Select>
      </Row>
      <div className="grid grid-cols-2 gap-2">
        <Row id="cm-from" label="From">
          <Input id="cm-from" type="date" className={sel} value={filters.date_from} max={filters.date_to || undefined} onChange={(e) => onChange({ date_from: e.target.value })} />
        </Row>
        <Row id="cm-to" label="To">
          <Input id="cm-to" type="date" className={sel} value={filters.date_to} min={filters.date_from || undefined} onChange={(e) => onChange({ date_to: e.target.value })} />
        </Row>
      </div>
      {signedIn && (
        <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-1 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 accent-[#244c39]" checked={filters.mine} onChange={(e) => onChange({ mine: e.target.checked })} />
          Show only my reports
        </label>
      )}
      {dirty && (
        <button type="button" onClick={() => onChange({ ...EMPTY_FILTERS })} className="text-[13px] font-semibold text-civic underline-offset-2 hover:underline">
          Reset filters
        </button>
      )}
    </div>
  )
}
