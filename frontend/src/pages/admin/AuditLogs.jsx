import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Spinner, Table, Td, Th } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'
import { RoleChip, useApi } from '../../features/admin/shared'

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

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every admin and staff mutation with before and after values. Append-only." />
      <Card className="mb-4 p-3">
        <form className="flex flex-wrap items-end gap-3" onSubmit={apply}>
          <Field label="Action" htmlFor="al-a"><Input id="al-a" placeholder="e.g. user.update" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} /></Field>
          <Field label="Actor" htmlFor="al-actor"><Input id="al-actor" placeholder="Name or id" value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })} /></Field>
          <Field label="Entity" htmlFor="al-e"><Input id="al-e" placeholder="e.g. complaint" value={draft.entity} onChange={(e) => setDraft({ ...draft, entity: e.target.value })} /></Field>
          <Button type="submit" variant="secondary">Apply filters</Button>
          <Button type="button" variant="ghost" onClick={() => { const z = { action: '', actor: '', entity: '' }; setDraft(z); setFilters(z); setPage(1) }}>Clear</Button>
        </form>
      </Card>
      <Card>
        {loading && !data ? <Spinner /> : error ? <ErrorState message={error} onRetry={reload} /> : !items.length ? <EmptyState title="No audit entries" hint="No entries match these filters." /> : (
          <>
            <Table>
              <thead><tr><Th className="w-8" /><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>Reason</Th></tr></thead>
              <tbody>
                {items.map((l, i) => {
                  const id = l.id ?? i
                  const isOpen = open === id
                  return (
                    <Fragment key={id}>
                      <tr className="cursor-pointer hover:bg-paper" onClick={() => setOpen(isOpen ? null : id)}>
                        <Td>{isOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}</Td>
                        <Td className="whitespace-nowrap text-muted">{fmtDateTime(l.created_at)}</Td>
                        <Td><span className="font-medium">{l.actor_name || l.actor || l.actor_user_id || 'system'}</span> {l.actor_role && <RoleChip role={l.actor_role} />}</Td>
                        <Td><Badge tone="plum">{l.action}</Badge></Td>
                        <Td>{entityOf(l)}</Td>
                        <Td className="max-w-[240px] truncate text-muted" title={l.reason || ''}>{l.reason || '-'}</Td>
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
            </Table>
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
              <span className="text-muted">{total} entries - page {page} of {pages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
