// Queue filter bar. State lives in the URL query string (owned by the page); this component only renders + patches it.
import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button, Input, Select, cn } from '../../components/ui'
import { titleCase } from '../../lib/format'
import { SEVERITIES, STATUS_LIST } from './common'

const CONF_PRESETS = [
  { value: '', label: 'Any confidence' },
  { value: 'low', label: 'Low (under 60%)', min: '', max: '0.6' },
  { value: 'mid', label: 'Medium (60-80%)', min: '0.6', max: '0.8' },
  { value: 'high', label: 'High (80%+)', min: '0.8', max: '' },
]

function presetFromParams(p) {
  const min = p.get('min_confidence') || '', max = p.get('max_confidence') || ''
  const hit = CONF_PRESETS.find((c) => c.value && (c.min || '') === min && (c.max || '') === max)
  return hit ? hit.value : (min || max ? 'custom' : '')
}

function F({ label, children, className }) {
  return (
    <label className={cn('block text-[11px] font-semibold uppercase tracking-wide text-muted', className)}>
      {label}
      <div className="mt-1 normal-case tracking-normal">{children}</div>
    </label>
  )
}

const sm = 'h-9'

export default function FilterBar({ params, onPatch, onReset, meta }) {
  const [q, setQ] = useState(params.get('q') || '')
  const urlQ = params.get('q') || ''
  useEffect(() => { setQ(urlQ) }, [urlQ])
  useEffect(() => {
    if (q === urlQ) return undefined
    const t = setTimeout(() => onPatch({ q: q.trim() }), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const g = (k) => params.get(k) || ''
  const categories = meta?.categories || []
  const departments = meta?.departments || []
  const conf = presetFromParams(params)
  const active = [...params.keys()].filter((k) => k !== 'page').length > 0

  return (
    <div className="rounded-[10px] border border-line bg-surface p-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 md:grid-cols-4 xl:grid-cols-8">
        <F label="Search" className="col-span-2 md:col-span-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
            <Input className={cn(sm, 'pl-8')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ticket no. or text" aria-label="Search tickets" />
          </div>
        </F>
        <F label="Severity">
          <Select className={sm} value={g('severity')} onChange={(e) => onPatch({ severity: e.target.value })}>
            <option value="">All</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </Select>
        </F>
        <F label="Status">
          <Select className={sm} value={g('status')} onChange={(e) => onPatch({ status: e.target.value })}>
            <option value="">All</option>
            {(meta?.statuses?.length && typeof meta.statuses[0] === 'string' ? meta.statuses : STATUS_LIST).map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </Select>
        </F>
        <F label="Category">
          <Select className={sm} value={g('category')} onChange={(e) => onPatch({ category: e.target.value })}>
            <option value="">All</option>
            {categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </Select>
        </F>
        <F label="Department">
          <Select className={sm} value={g('department')} onChange={(e) => onPatch({ department: e.target.value })}>
            <option value="">All</option>
            {departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
          </Select>
        </F>
        <F label="Assigned">
          <Select className={sm} value={g('assigned')} onChange={(e) => onPatch({ assigned: e.target.value })}>
            <option value="">Any</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </Select>
        </F>
        <F label="AI confidence">
          <Select
            className={sm}
            value={conf}
            onChange={(e) => {
              const p = CONF_PRESETS.find((c) => c.value === e.target.value)
              onPatch({ min_confidence: p?.min || '', max_confidence: p?.max || '' })
            }}
          >
            {CONF_PRESETS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            {conf === 'custom' && <option value="custom">Custom range</option>}
          </Select>
        </F>
        <F label="From date"><Input type="date" className={sm} value={g('date_from')} onChange={(e) => onPatch({ date_from: e.target.value })} /></F>
        <F label="To date"><Input type="date" className={sm} value={g('date_to')} onChange={(e) => onPatch({ date_to: e.target.value })} /></F>
        <div className="col-span-2 flex flex-wrap items-end gap-x-4 gap-y-2 pb-1.5 md:col-span-2">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-ink">
            <input type="checkbox" className="h-4 w-4 accent-[#2f5f8f]" checked={g('review') === 'true'} onChange={(e) => onPatch({ review: e.target.checked ? 'true' : '' })} />
            Needs human review
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-ink">
            <input type="checkbox" className="h-4 w-4 accent-[#2f5f8f]" checked={g('overdue') === 'true'} onChange={(e) => onPatch({ overdue: e.target.checked ? 'true' : '' })} />
            Overdue only
          </label>
        </div>
        <div className="col-span-2 flex items-end justify-end md:col-span-2 xl:col-span-2">
          {active && <Button variant="ghost" size="sm" onClick={onReset}><X className="h-4 w-4" aria-hidden /> Clear filters</Button>}
        </div>
      </div>
    </div>
  )
}
