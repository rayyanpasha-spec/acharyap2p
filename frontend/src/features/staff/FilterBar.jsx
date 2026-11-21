// Queue filter toolbar: ONE line (search + 4 key filters), the rest in a "More filters" popover.
// State lives in the URL query string (owned by the page); this component only renders + patches it.
import { useEffect, useRef, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Button, Input, Select, cn } from '../../components/ui'
import { titleCase } from '../../lib/format'
import { CTRL, SEVERITIES, STATUS_LIST } from './common'

const CONF_PRESETS = [
  { value: '', label: 'Any confidence' },
  { value: 'low', label: 'Low (under 60%)', min: '', max: '0.6' },
  { value: 'mid', label: 'Medium (60-80%)', min: '0.6', max: '0.8' },
  { value: 'high', label: 'High (80%+)', min: '0.8', max: '' },
]
const MORE_KEYS = ['department', 'min_confidence', 'max_confidence', 'date_from', 'date_to', 'review', 'overdue']

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

const sel = cn(CTRL, '!w-auto min-w-[108px] max-w-[150px] !pl-2.5')

export default function FilterBar({ params, onPatch, onReset, meta }) {
  const [q, setQ] = useState(params.get('q') || '')
  const [more, setMore] = useState(false)
  const wrap = useRef(null)
  const urlQ = params.get('q') || ''
  useEffect(() => { setQ(urlQ) }, [urlQ])
  useEffect(() => {
    if (q === urlQ) return undefined
    const t = setTimeout(() => onPatch({ q: q.trim() }), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  // close the popover on outside click / Escape
  useEffect(() => {
    if (!more) return undefined
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setMore(false) }
    const onKey = (e) => { if (e.key === 'Escape') setMore(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [more])

  const g = (k) => params.get(k) || ''
  const categories = meta?.categories || []
  const departments = meta?.departments || []
  const conf = presetFromParams(params)
  const active = [...params.keys()].filter((k) => k !== 'page').length > 0
  const moreCount = MORE_KEYS.filter((k) => params.get(k)).length - (params.get('min_confidence') && params.get('max_confidence') ? 1 : 0)

  return (
    <div ref={wrap} className="relative z-20 shrink-0 rounded-[14px] border border-line bg-surface px-2.5 py-2 shadow-[0_1px_2px_rgba(36,76,57,0.05)]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted" aria-hidden />
          <Input className={cn(CTRL, '!pl-8')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticket no. or text" aria-label="Search tickets" />
        </div>
        <Select className={sel} aria-label="Severity" value={g('severity')} onChange={(e) => onPatch({ severity: e.target.value })}>
          <option value="">All severities</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </Select>
        <Select className={sel} aria-label="Status" value={g('status')} onChange={(e) => onPatch({ status: e.target.value })}>
          <option value="">All statuses</option>
          {(meta?.statuses?.length && typeof meta.statuses[0] === 'string' ? meta.statuses : STATUS_LIST).map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </Select>
        <Select className={sel} aria-label="Category" value={g('category')} onChange={(e) => onPatch({ category: e.target.value })}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </Select>
        <Select className={sel} aria-label="Assigned" value={g('assigned')} onChange={(e) => onPatch({ assigned: e.target.value })}>
          <option value="">Any assignee</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </Select>
        <Button variant={moreCount > 0 ? 'civic' : 'secondary'} size="sm" aria-expanded={more} aria-haspopup="dialog" onClick={() => setMore((m) => !m)}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden /> More filters{moreCount > 0 ? ` (${moreCount})` : ''}
        </Button>
        {active && <Button variant="ghost" size="sm" onClick={onReset}><X className="h-4 w-4" aria-hidden /> Clear</Button>}
      </div>

      {more && (
        <div role="dialog" aria-label="More filters" className="absolute right-2 top-full z-30 mt-1.5 w-[min(94vw,440px)] rounded-[14px] border border-line bg-surface p-3.5 shadow-[0_8px_24px_rgba(36,76,57,0.14)]">
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <F label="Department" className="col-span-2">
              <Select className={CTRL} value={g('department')} onChange={(e) => onPatch({ department: e.target.value })}>
                <option value="">All departments</option>
                {departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
              </Select>
            </F>
            <F label="AI confidence" className="col-span-2">
              <Select
                className={CTRL}
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
            <F label="From date"><Input type="date" className={CTRL} value={g('date_from')} onChange={(e) => onPatch({ date_from: e.target.value })} /></F>
            <F label="To date"><Input type="date" className={CTRL} value={g('date_to')} onChange={(e) => onPatch({ date_to: e.target.value })} /></F>
            <div className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="inline-flex items-center gap-2 text-[13px] font-medium text-ink">
                <input type="checkbox" className="h-4 w-4 accent-[#2f5f8f]" checked={g('review') === 'true'} onChange={(e) => onPatch({ review: e.target.checked ? 'true' : '' })} />
                Needs human review
              </label>
              <label className="inline-flex items-center gap-2 text-[13px] font-medium text-ink">
                <input type="checkbox" className="h-4 w-4 accent-[#2f5f8f]" checked={g('overdue') === 'true'} onChange={(e) => onPatch({ overdue: e.target.checked ? 'true' : '' })} />
                Overdue only
              </label>
            </div>
          </div>
          <div className="mt-3 flex justify-end border-t border-line pt-2.5">
            <Button size="sm" variant="secondary" onClick={() => setMore(false)}>Done</Button>
          </div>
        </div>
      )}
    </div>
  )
}
