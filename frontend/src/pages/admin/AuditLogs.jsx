import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react'
import { Badge, Button, EmptyState, ErrorState, Input, Page, Panel, Spinner } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'
import { ADMIN_CTRL, RoleChip, Scroll, useApi } from '../../features/admin/shared'
import { Cell, HCell } from '../../features/staff/common'

const PAGE_SIZE = 25
const show = (v) => (v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 2))

function parseMaybe(v) {
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return v } }
  return v
}

function Diff({ before, after }) {
  const b = parseMaybe(before)
  const a = parseMaybe(after)
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x)
  if (isObj(b) || isObj(a)) {
    const bo = isObj(b) ? b : {}
    const ao = isObj(a) ? a : {}
    const keys = [...new Set([...Object.keys(bo), ...Object.keys(ao)])].filter((k) => JSON.stringify(bo[k]) !== JSON.stringify(ao[k]))
    if (!keys.length) return <p className="text-sm text-muted">No field-level changes recorded.</p>
    return (
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-left text-xs">
          <thead><tr className="bg-paper text-muted"><th className="px-3 py-1.5">Field</th><th className="px-3 py-1.5">Before</th><th className="px-3 py-1.5">After</th></tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k} className="border-t border-line align-top">
                <td className="px-3 py-1.5 font-semibold">{k}</td>
                <td className="whitespace-pre-wrap break-all bg-critical-100/60 px-3 py-1.5 font-mono">{show(bo[k]) || '-'}</td>
                <td className="whitespace-pre-wrap break-all bg-success-100/60 px-3 py-1.5 font-mono">{show(ao[k]) || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <pre className="overflow-x-auto rounded-md border border-line bg-surface p-2 text-xs">{show(b) || 'No data'}</pre>
      <pre className="overflow-x-auto rounded-md border border-line bg-surface p-2 text-xs">{show(a) || 'No data'}</pre>
    </div>
  )
}

export default function AuditLogs() {
  const [draft, setDraft] = useState({ action: '', actor: '', entity: '' })
  const [filters, setFilters] = useState({ action: '', actor: '', entity: '' })
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(null)
  const { data, loading, error, reload } = useApi('/admin/audit-logs', {
    action: filters.action || undefined, actor: filters.actor || undefined, entity: filters.entity || undefined, page, page_size: PAGE_SIZE,
  })
  const items = Array.isArray(data) ? data : data?.items || []
  const total = data?.total ?? items.length
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const apply = (e) => { e.preventDefault(); setPage(1); setFilters(draft) }
  const entityOf = (l) => l.entity || [l.entity_type, l.entity_id].filter((x) => x != null && x !== '').join(' ') || '-'
  const clear = () => { const z = { action: '', actor: '', entity: '' }; setDraft(z); setFilters(z); setPage(1) }

  return (
    <Page title="Audit log" subtitle="Every admin and staff mutation with before and after values. Append-only.">
      <Panel
        className="flex-1"
        title="Entries"
        subtitle="Click a row to see before / after values"
        icon={ScrollText}
        tone="saffron"
        scroll={false}
        bodyClassName="flex flex-col p-0"
        action={data ? <Badge tone="plum">{total} total</Badge> : null}
        footer={items.length ? (
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted">{total} entries - page {page} of {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        ) : null}
      >
        <form className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-paper/60 px-3 py-2" onSubmit={apply}>
          <Input aria-label="Action" className={`${ADMIN_CTRL} !w-44`} placeholder="Action, e.g. user.update" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} />
          <Input aria-label="Actor" className={`${ADMIN_CTRL} !w-44`} placeholder="Actor name or id" value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })} />
          <Input aria-label="Entity" className={`${ADMIN_CTRL} !w-44`} placeholder="Entity, e.g. complaint" value={draft.entity} onChange={(e) => setDraft({ ...draft, entity: e.target.value })} />
          <Button type="submit" variant="secondary" size="sm">Apply filters</Button>
          <Button type="button" variant="ghost" size="sm" onClick={clear}>Clear</Button>
        </form>
        <Scroll>
          {loading && !data ? <Spinner /> : error ? <ErrorState message={error} onRetry={reload} /> : !items.length ? <EmptyState title="No audit entries" hint="No entries match these filters." /> : (
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead><tr><HCell className="w-8" /><HCell>When</HCell><HCell>Actor</HCell><HCell>Action</HCell><HCell>Entity</HCell><HCell>Reason</HCell></tr></thead>
              <tbody>
                {items.map((l, i) => {
                  const id = l.id ?? i
                  const isOpen = open === id
                  return (
                    <Fragment key={id}>
                      <tr className="cursor-pointer transition-colors hover:bg-paper" onClick={() => setOpen(isOpen ? null : id)}>
                        <Cell>{isOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}</Cell>
                        <Cell className="whitespace-nowrap text-muted">{fmtDateTime(l.created_at)}</Cell>
                        <Cell><span className="font-medium">{l.actor_name || l.actor || l.actor_user_id || 'system'}</span> {l.actor_role && <RoleChip role={l.actor_role} />}</Cell>
                        <Cell><Badge tone="plum">{l.action}</Badge></Cell>
                        <Cell>{entityOf(l)}</Cell>
                        <Cell className="max-w-[240px] truncate text-muted" title={l.reason || ''}>{l.reason || '-'}</Cell>
                      </tr>
                      {isOpen && (
                        <tr><td colSpan={6} className="border-b border-line bg-paper px-4 py-3">
                          <button type="button" className="sr-only" onClick={() => setOpen(null)}>Collapse</button>
                          <Diff before={l.before ?? l.before_json} after={l.after ?? l.after_json} />
                        </td></tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </Scroll>
      </Panel>
    </Page>
  )
}
