import { useEffect, useState } from 'react'
import { Badge, Button, EmptyState, ErrorState, Field, Input, Modal, Notice, Page, Panel, Select, Spinner, Tabs, Textarea, toast } from '../../components/ui'
import { api, errMsg } from '../../lib/api'
import { useMeta } from '../../store/meta'
import { titleCase } from '../../lib/format'
import { ADMIN_CTRL, NoteStrip, Scroll, toList, useApi } from '../../features/admin/shared'
import { Cell as Td, HCell as Th } from '../../features/staff/common'

const SEVERITIES = ['low', 'medium', 'high', 'critical']

function Load({ state, children, empty }) {
  if (state.loading && !state.data) return <Spinner />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />
  if (empty) return <EmptyState title={empty} />
  return children
}

/* ---------- Departments ---------- */
function DepartmentRow({ d, onSaved }) {
  const [name, setName] = useState(d.name || '')
  const [active, setActive] = useState(d.active !== false && d.is_active !== false)
  const [busy, setBusy] = useState(false)
  const dirty = name !== (d.name || '') || active !== (d.active !== false && d.is_active !== false)
  const save = async () => {
    setBusy(true)
    try { await api.patch(`/admin/departments/${d.code}`, { name: name.trim(), active }); toast.success('Department saved'); onSaved() } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <tr>
      <Td className="font-mono text-xs">{d.code}</Td>
      <Td><Input aria-label={`Name for ${d.code}`} className={ADMIN_CTRL} value={name} onChange={(e) => setName(e.target.value)} /></Td>
      <Td>{d.agency_kind ? <Badge tone="civic">{titleCase(d.agency_kind)}</Badge> : '-'}</Td>
      <Td><label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label></Td>
      <Td className="text-right"><Button size="sm" variant="secondary" className="!h-7 !px-2.5 !text-[12px]" disabled={!dirty || !name.trim()} loading={busy} onClick={save}>Save</Button></Td>
    </tr>
  )
}
function Departments() {
  const s = useApi('/admin/departments')
  const list = toList(s.data)
  return (
    <Scroll>
      <Load state={s} empty={!s.loading && !list.length ? 'No departments' : null}>
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead><tr><Th>Code</Th><Th>Name</Th><Th>Agency kind</Th><Th>State</Th><Th /></tr></thead>
          <tbody>{list.map((d) => <DepartmentRow key={d.code} d={d} onSaved={s.reload} />)}</tbody>
        </table>
      </Load>
    </Scroll>
  )
}

/* ---------- Categories ---------- */
function CategoryCard({ c, departments, onSaved }) {
  const [name, setName] = useState(c.name || '')
  const [dept, setDept] = useState(c.default_department_code || '')
  const [active, setActive] = useState(c.active !== false && c.is_active !== false)
  const [subs, setSubs] = useState(() => (c.subcategories || []).map((x) => ({ ...x, active: x.active !== false && x.is_active !== false })))
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await api.patch(`/admin/categories/${c.code}`, { name: name.trim(), default_department_code: dept || null, active, subcategories: subs.map((x) => ({ code: x.code, name: x.name, active: x.active })) })
      toast.success('Category saved'); onSaved()
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <div className="border-b border-line px-4 py-2.5 hover:bg-paper/50">
      <div className="grid items-end gap-3 md:grid-cols-[110px_1fr_1fr_auto_auto]">
        <p className="pb-1.5 font-mono text-xs text-muted">{c.code}</p>
        <Field label="Name" htmlFor={`cn-${c.code}`}><Input id={`cn-${c.code}`} className={ADMIN_CTRL} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Default department" htmlFor={`cd-${c.code}`}>
          <Select id={`cd-${c.code}`} className={ADMIN_CTRL} value={dept} onChange={(e) => setDept(e.target.value)}><option value="">None</option>{departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</Select>
        </Field>
        <label className="flex h-8 items-center gap-2 text-[13px]"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
        <Button variant="secondary" size="sm" loading={busy} onClick={save}>Save</Button>
      </div>
      {subs.length > 0 && (
        <div className="mt-2">
          <button type="button" className="text-xs font-semibold text-plum" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} {subs.length} subcategories</button>
          {open && (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {subs.map((x, i) => (
                <li key={x.code} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate font-mono text-[11px] text-muted" title={x.code}>{x.code}</span>
                  <Input aria-label={`Name for ${x.code}`} className={ADMIN_CTRL} value={x.name || ''} onChange={(e) => setSubs((p) => p.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                  <input type="checkbox" aria-label={`${x.code} active`} checked={x.active} onChange={(e) => setSubs((p) => p.map((y, j) => (j === i ? { ...y, active: e.target.checked } : y)))} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
function Categories() {
  const s = useApi('/admin/categories')
  const departments = useMeta((m) => m.meta?.departments) || []
  const list = toList(s.data)
  return (
    <Scroll>
      <Load state={s} empty={!s.loading && !list.length ? 'No categories' : null}>
        {list.map((c) => <CategoryCard key={c.code} c={c} departments={departments} onSaved={s.reload} />)}
      </Load>
    </Scroll>
  )
}

/* ---------- Routing rules ---------- */
function RuleModal({ rule, onClose, onDone }) {
  const meta = useMeta((m) => m.meta)
  const cats = meta?.categories || []
  const depts = meta?.departments || []
  const kinds = [...new Set(['corporation', 'bwssb', 'bescom', ...depts.map((d) => d.agency_kind).filter(Boolean)])]
  const [f, setF] = useState({
    category: rule?.category || '', subcategory: rule?.subcategory || '', department_code: rule?.department_code || '', agency_kind: rule?.agency_kind || '',
    requires_review: !!rule?.requires_review, min_severity: rule?.min_severity || '', note: rule?.note || '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const subs = cats.find((c) => c.code === f.category)?.subcategories || []
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    if (!f.category) return setErr('Choose a category.')
    if (!f.department_code) return setErr('Choose a department.')
    setBusy(true); setErr(null)
    const body = { category: f.category, subcategory: f.subcategory || null, department_code: f.department_code, agency_kind: f.agency_kind || null, requires_review: f.requires_review, min_severity: f.min_severity || null, note: f.note.trim() || null }
    try {
      if (rule?.id != null) await api.patch(`/admin/routing-rules/${rule.id}`, body); else await api.post('/admin/routing-rules', body)
      toast.success('Routing rule saved'); onDone()
    } catch (er) { setErr(errMsg(er)) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} wide title={rule?.id != null ? 'Edit routing rule' : 'New routing rule'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="rule-form" loading={busy}>Save rule</Button></>}>
      <form id="rule-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {err && <div className="sm:col-span-2"><Notice tone="critical">{err}</Notice></div>}
        <Field label="Category" htmlFor="rr-cat"><Select id="rr-cat" value={f.category} onChange={(e) => setF((p) => ({ ...p, category: e.target.value, subcategory: '' }))}><option value="">Select</option>{cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</Select></Field>
        <Field label="Subcategory (optional)" htmlFor="rr-sub"><Select id="rr-sub" value={f.subcategory} onChange={(e) => set('subcategory', e.target.value)}><option value="">Whole category</option>{subs.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</Select></Field>
        <Field label="Department" htmlFor="rr-dept"><Select id="rr-dept" value={f.department_code} onChange={(e) => set('department_code', e.target.value)}><option value="">Select</option>{depts.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</Select></Field>
        <Field label="Agency kind" htmlFor="rr-kind"><Select id="rr-kind" value={f.agency_kind} onChange={(e) => set('agency_kind', e.target.value)}><option value="">Not set</option>{kinds.map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</Select></Field>
        <Field label="Minimum severity" htmlFor="rr-sev" hint="Floor applied to tickets matching this rule."><Select id="rr-sev" value={f.min_severity} onChange={(e) => set('min_severity', e.target.value)}><option value="">No floor</option>{SEVERITIES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
        <label className="flex items-center gap-2 pt-6 text-sm font-medium"><input type="checkbox" checked={f.requires_review} onChange={(e) => set('requires_review', e.target.checked)} /> Requires human review</label>
        <Field label="Note" htmlFor="rr-note" className="sm:col-span-2"><Textarea id="rr-note" className="!min-h-[70px]" value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
      </form>
    </Modal>
  )
}
function RoutingRules() {
  const s = useApi('/admin/routing-rules')
  const [editing, setEditing] = useState(undefined) // undefined closed, null new, object edit
  const list = toList(s.data)
  const del = async (r) => {
    if (!window.confirm('Delete this routing rule?')) return
    try { await api.delete(`/admin/routing-rules/${r.id}`); toast.success('Rule deleted'); s.reload() } catch (e) { toast.error(errMsg(e)) }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NoteStrip tone="civic" title="Starting rules - verify before real deployment">
        These routing rules are starting assumptions for the pilot. Confirm each department and agency mapping with the responsible authority before using them for real complaints.
      </NoteStrip>
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2"><span className="text-[12.5px] text-muted">{list.length} rule(s)</span><Button size="sm" onClick={() => setEditing(null)} className="!bg-plum">Add rule</Button></div>
      <Scroll>
        <Load state={s} empty={!s.loading && !list.length ? 'No routing rules' : null}>
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead><tr><Th>Category</Th><Th>Subcategory</Th><Th>Department</Th><Th>Agency</Th><Th>Review</Th><Th>Min severity</Th><Th>Note</Th><Th /></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <Td>{titleCase(r.category)}</Td><Td>{r.subcategory ? titleCase(r.subcategory) : <span className="text-muted">Any</span>}</Td>
                  <Td>{r.department_code}</Td><Td>{r.agency_kind ? titleCase(r.agency_kind) : '-'}</Td>
                  <Td>{r.requires_review ? <Badge tone="plum">Required</Badge> : '-'}</Td><Td>{r.min_severity ? titleCase(r.min_severity) : '-'}</Td>
                  <Td className="max-w-[220px] truncate text-muted" title={r.note || ''}>{r.note || '-'}</Td>
                  <Td><div className="flex justify-end gap-1.5"><Button size="sm" variant="secondary" className="!h-7 !px-2 !text-[12px]" onClick={() => setEditing(r)}>Edit</Button><Button size="sm" variant="secondary" className="!h-7 !px-2 !text-[12px]" onClick={() => del(r)}>Delete</Button></div></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Load>
      </Scroll>
      {editing !== undefined && <RuleModal rule={editing} onClose={() => setEditing(undefined)} onDone={() => { setEditing(undefined); s.reload() }} />}
    </div>
  )
}

/* ---------- SLA ---------- */
function SLA() {
  const s = useApi('/admin/sla')
  const cats = useMeta((m) => m.meta?.categories) || []
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [add, setAdd] = useState({ category: '*', severity: 'medium', target_hours: '' })
  useEffect(() => { if (s.data) setRows(toList(s.data).map((r) => ({ category: r.category, severity: r.severity, target_hours: r.target_hours }))) }, [s.data])
  const save = async () => {
    for (const r of rows) if (!(Number(r.target_hours) > 0)) return toast.error('Every target needs hours greater than 0.')
    setBusy(true)
    try { await api.put('/admin/sla', rows.map((r) => ({ ...r, target_hours: Number(r.target_hours) }))); toast.success('SLA targets saved'); s.reload() } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }
  const addRow = () => {
    if (!(Number(add.target_hours) > 0)) return toast.error('Enter target hours greater than 0.')
    setRows((p) => [...p.filter((r) => !(r.category === add.category && r.severity === add.severity)), { ...add, target_hours: Number(add.target_hours) }])
    setAdd({ ...add, target_hours: '' })
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NoteStrip tone="warning" title="Sample targets - not official municipal commitments">These hours are illustrative defaults for the prototype. Replace them with targets approved by the responsible authority.</NoteStrip>
      <Scroll>
        <Load state={s} empty={rows && !rows.length ? 'No SLA targets yet' : null}>
          {rows && (
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead><tr><Th>Category</Th><Th>Severity</Th><Th>Target (hours)</Th><Th /></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.category}-${r.severity}`}>
                    <Td>{r.category === '*' ? 'All categories (*)' : titleCase(r.category)}</Td><Td>{titleCase(r.severity)}</Td>
                    <Td><Input type="number" min={1} className={`${ADMIN_CTRL} !w-28`} aria-label={`Target hours ${r.category} ${r.severity}`} value={r.target_hours} onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, target_hours: e.target.value } : x)))} /></Td>
                    <Td className="text-right"><Button size="sm" variant="ghost" className="!h-7 !px-2 !text-[12px]" onClick={() => setRows((p) => p.filter((_, j) => j !== i))}>Remove</Button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Load>
      </Scroll>
      {rows && (
          <div className="flex shrink-0 flex-wrap items-end gap-3 border-t border-line bg-paper px-4 py-2.5">
            <Field label="Category" htmlFor="sl-c"><Select id="sl-c" className={ADMIN_CTRL} value={add.category} onChange={(e) => setAdd({ ...add, category: e.target.value })}><option value="*">All (*)</option>{cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</Select></Field>
            <Field label="Severity" htmlFor="sl-s"><Select id="sl-s" className={ADMIN_CTRL} value={add.severity} onChange={(e) => setAdd({ ...add, severity: e.target.value })}>{SEVERITIES.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}</Select></Field>
            <Field label="Hours" htmlFor="sl-h"><Input id="sl-h" type="number" min={1} className={`${ADMIN_CTRL} !w-28`} value={add.target_hours} onChange={(e) => setAdd({ ...add, target_hours: e.target.value })} /></Field>
            <Button variant="secondary" size="sm" onClick={addRow}>Add / replace</Button>
            <Button size="sm" className="ml-auto !bg-plum" loading={busy} onClick={save}>Save all targets</Button>
          </div>
      )}
    </div>
  )
}

/* ---------- Settings ---------- */
function SettingRow({ k, value, description, onSaved }) {
  const initial = JSON.stringify(value, null, 2)
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  useEffect(() => { setText(JSON.stringify(value, null, 2)) }, [value])
  const save = async () => {
    let parsed
    try { parsed = JSON.parse(text) } catch (e) { return setErr(`Invalid JSON: ${e.message}`) }
    setErr(null); setBusy(true)
    try { await api.put(`/admin/settings/${encodeURIComponent(k)}`, { value: parsed }); toast.success(`Saved ${k}`); onSaved() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <div className="border-b border-line px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-mono text-sm font-bold">{k}</p>{description && <p className="text-xs text-muted">{description}</p>}</div>
        <Button size="sm" variant="secondary" loading={busy} disabled={text === initial} onClick={save}>Save</Button>
      </div>
      <Textarea aria-label={`Value for ${k}`} className="mt-1.5 !min-h-[72px] font-mono text-xs" value={text} onChange={(e) => { setText(e.target.value); setErr(null) }} spellCheck={false} />
      {err && <p role="alert" className="mt-1 text-xs font-medium text-critical">{err}</p>}
    </div>
  )
}
function Settings() {
  const s = useApi('/admin/settings')
  const d = s.data
  const arr = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : null
  const entries = arr
    ? arr.map((x) => ({ key: x.key, value: x.value, description: x.description }))
    : d && typeof d === 'object' ? Object.entries(d.settings || d).map(([key, value]) => ({ key, value })) : []
  return (
    <Scroll>
      <Load state={s} empty={!s.loading && !entries.length ? 'No settings' : null}>
        {entries.map((e) => <SettingRow key={e.key} k={e.key} value={e.value} description={e.description} onSaved={s.reload} />)}
      </Load>
    </Scroll>
  )
}

/* ---------- System ---------- */
function KV({ title, obj }) {
  const entries = obj && typeof obj === 'object' ? Object.entries(obj) : []
  return (
    <section className="rounded-[14px] border border-line bg-surface">
      <h3 className="border-b border-line bg-paper px-4 py-2 font-display text-[13px] font-bold text-ink">{title}</h3>
      <dl className="px-4 py-1.5">
        {entries.length ? entries.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-line py-1.5 text-[13px] last:border-0">
            <dt className="text-muted">{titleCase(k)}</dt>
            <dd className="max-w-[60%] break-words text-right font-medium">{typeof v === 'object' && v !== null ? <code className="text-xs">{JSON.stringify(v)}</code> : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v ?? '-')}</dd>
          </div>
        )) : <p className="py-3 text-sm text-muted">No data.</p>}
      </dl>
    </section>
  )
}
function System() {
  const s = useApi('/admin/system')
  const d = s.data || {}
  return (
    <Scroll className="p-3">
    <Load state={s}>
      <div className="grid gap-3 md:grid-cols-2">
        <KV title="Backend" obj={{ sql_backend: d.sql_backend, user_store: d.user_store, demo_mode: d.demo_mode }} />
        <KV title="Record counts" obj={d.counts} />
        <div className="md:col-span-2"><KV title="AI providers" obj={d.ai && !Array.isArray(d.ai) ? d.ai : Array.isArray(d.ai) ? Object.fromEntries(d.ai.map((p, i) => [p.name || i, p])) : d.ai?.providers} /></div>
      </div>
    </Load>
    </Scroll>
  )
}

const TABS = [
  { value: 'departments', label: 'Departments' }, { value: 'categories', label: 'Categories' }, { value: 'routing', label: 'Routing rules' },
  { value: 'sla', label: 'SLA targets' }, { value: 'settings', label: 'Settings' }, { value: 'system', label: 'System' },
]

export default function Config() {
  const [tab, setTab] = useState('departments')
  return (
    <Page title="Configuration" subtitle="Departments, taxonomy, routing, SLA targets and system settings. Admin only.">
      <Panel className="flex-1" scroll={false} bodyClassName="flex flex-col p-0">
        <div className="shrink-0 px-2"><Tabs tabs={TABS} value={tab} onChange={setTab} /></div>
        {tab === 'departments' && <Departments />}
        {tab === 'categories' && <Categories />}
        {tab === 'routing' && <RoutingRules />}
        {tab === 'sla' && <SLA />}
        {tab === 'settings' && <Settings />}
        {tab === 'system' && <System />}
      </Panel>
    </Page>
  )
}
