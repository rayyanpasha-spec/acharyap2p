import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClipboardList, FilePlus2, Search, ChevronLeft, ChevronRight, MapPin, ArrowRight, Eye } from 'lucide-react'
import { Button, CategoryChip, DemoTag, EmptyState, ErrorState, IconTile, Input, Page, Panel, Segmented, Select, Spinner, Td, Th, cn } from '../../components/ui'
import { ComplaintRow, SEV_BAR, TSeverityBadge, TStatusBadge } from '../../components/StatusTimeline'
import { api, errMsg } from '../../lib/api'
import { useMeta } from '../../store/meta'
import { useT } from '../../lib/i18n'
import { fmtDateTime, timeAgo, titleCase } from '../../lib/format'

const PAGE_SIZE = 15
const STATUSES = ['submitted', 'ai_review', 'verified', 'assigned', 'in_progress', 'awaiting_verification', 'resolved', 'reopened', 'rejected', 'duplicate_linked']

export default function MyComplaints() {
  const { t } = useT()
  const navigate = useNavigate()
  const meta = useMeta((s) => s.meta)
  const categoryName = useMeta((s) => s.categoryName)
  const [scope, setScope] = useState('all')
  const [status, setStatus] = useState('')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sel, setSel] = useState(null)

  useEffect(() => { const id = setTimeout(() => { setQ(qInput.trim()); setPage(1) }, 350); return () => clearTimeout(id) }, [qInput])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = { scope, page, page_size: PAGE_SIZE }
      if (status) params.status = status
      if (q) params.q = q
      const r = await api.get('/complaints', { params })
      setData(r.data)
    } catch (e) { setError(errMsg(e)); setData(null) }
    setLoading(false)
  }, [scope, status, q, page])
  useEffect(() => { load() }, [load])

  const items = data?.items || []
  const total = data?.total ?? items.length
  const pages = Math.max(1, Math.ceil(total / (data?.page_size || PAGE_SIZE)))
  const statuses = meta?.statuses?.length ? meta.statuses : STATUSES
  const filtered = Boolean(status || q)
  const selected = items.find((c) => c.ticket_number === sel) || items[0] || null

  // wide screens: select into the preview pane; narrower: open the report
  const openRow = (c) => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1280px)').matches) setSel(c.ticket_number)
    else navigate(`/app/complaints/${c.ticket_number}`)
  }

  const emptyTitle = filtered ? t('list.noMatch', 'No reports match these filters') : scope === 'following' ? t('list.noFollowing', 'You are not following any reports') : t('list.none', 'No reports yet')

  return (
    <Page title={t('nav.reports', 'My reports')} subtitle={t('list.sub', 'Reports you filed and reports you follow.')}
      actions={<Button as={Link} to="/app/report" size="sm"><FilePlus2 className="h-4 w-4" aria-hidden />{t('btn.report', 'Report an issue')}</Button>}>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel scroll={false} bodyClassName="flex flex-col p-0">
          {/* fixed toolbar */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-paper/60 p-2.5">
            <Segmented ariaLabel={t('list.scope', 'Show')} value={scope} onChange={(v) => { setScope(v); setPage(1) }}
              options={[{ value: 'all', label: t('list.all', 'All') }, { value: 'mine', label: t('list.mine', 'Mine') }, { value: 'following', label: t('list.following', 'Following') }]} />
            <div className="relative min-w-[160px] flex-1">
              <label htmlFor="mc-q" className="sr-only">{t('list.search', 'Search reports')}</label>
              <Search className="pointer-events-none absolute left-3 top-[11px] h-4 w-4 text-muted" aria-hidden />
              <Input id="mc-q" type="search" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t('list.search', 'Search reports')} className="h-9 pl-9" />
            </div>
            <div className="w-full sm:w-48">
              <label htmlFor="mc-status" className="sr-only">{t('list.status', 'Status')}</label>
              <Select id="mc-status" className="!h-9" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
                <option value="">{t('list.anyStatus', 'Any status')}</option>
                {statuses.map((s) => <option key={s} value={s}>{t('status.' + s, titleCase(s))}</option>)}
              </Select>
            </div>
          </div>

          {/* scrolling list */}
          <div className="min-h-0 flex-1 lg:overflow-y-auto">
            {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : items.length === 0 ? (
              <EmptyState icon={ClipboardList} title={emptyTitle}
                hint={filtered ? t('list.noMatchD', 'Try clearing the search or status filter.') : t('list.noneD', 'When you report an issue it will be listed here with its progress.')}
                action={!filtered && <Button as={Link} to="/app/report" size="sm">{t('btn.report', 'Report an issue')}</Button>} />
            ) : (
              <>
                <div className="divide-y divide-line md:hidden">{items.map((c) => <ComplaintRow key={c.ticket_number} c={c} />)}</div>
                <table className="hidden w-full border-collapse text-left text-sm md:table">
                  <thead>
                    <tr>
                      <Th className="w-[1%]">{t('list.colTicket', 'Ticket')}</Th>
                      <Th>{t('list.colReport', 'Report')}</Th>
                      <Th>{t('list.status', 'Status')}</Th>
                      <Th>{t('list.colSeverity', 'Severity')}</Th>
                      <Th className="hidden 2xl:table-cell">{t('list.colLocation', 'Location')}</Th>
                      <Th className="text-right">{t('list.colWhen', 'Reported')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => {
                      const on = selected?.ticket_number === c.ticket_number
                      return (
                        <tr key={c.ticket_number} onClick={() => openRow(c)} className={cn('cursor-pointer transition-colors hover:bg-forest-50/70', on && 'bg-forest-50')}>
                          <Td className={cn('whitespace-nowrap border-l-[3px] font-mono text-xs font-semibold', SEV_BAR[c.severity] || 'border-l-transparent')}>
                            <Link to={`/app/complaints/${c.ticket_number}`} onClick={(e) => e.stopPropagation()} className="text-civic hover:underline">{c.ticket_number}</Link>
                            {c.is_demo && <DemoTag className="ml-1.5" />}
                          </Td>
                          <Td className="max-w-0">
                            <p className="truncate text-ink">{c.summary || c.original_description || '—'}</p>
                            <div className="mt-0.5"><CategoryChip category={c.category} label={c.category_name || categoryName(c.category)} /></div>
                          </Td>
                          <Td className="whitespace-nowrap"><TStatusBadge status={c.status} /></Td>
                          <Td className="whitespace-nowrap"><TSeverityBadge severity={c.severity} /></Td>
                          <Td className="hidden whitespace-nowrap text-xs text-muted 2xl:table-cell">{c.location?.locality || '—'}</Td>
                          <Td className="whitespace-nowrap text-right text-xs text-muted">{timeAgo(c.created_at)}</Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>

          {/* fixed pager */}
          {!loading && !error && items.length > 0 && (
            <div className="flex shrink-0 items-center justify-between border-t border-line bg-paper/60 px-3 py-1.5 text-[13px]">
              <span className="text-muted">{total} {t('list.reportsCount', 'reports')}{total > PAGE_SIZE ? ` · ${t('list.page', 'Page')} ${page} / ${pages}` : ''}</span>
              {total > PAGE_SIZE && (
                <div className="flex gap-1.5">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label={t('list.prev', 'Previous page')}><ChevronLeft className="h-4 w-4" aria-hidden /></Button>
                  <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label={t('list.next', 'Next page')}><ChevronRight className="h-4 w-4" aria-hidden /></Button>
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* preview of the selected row (wide screens) */}
        <div className="hidden min-h-0 flex-col xl:flex">
        <Panel title={t('list.preview', 'Preview')} icon={Eye} tone="civic" className="flex-1" bodyClassName="p-4">
          {!selected ? (
            <p className="text-sm text-muted">{t('list.previewNone', 'Select a report to preview it here.')}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <IconTile icon={ClipboardList} tone="civic" />
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold text-civic">{selected.ticket_number}</p>
                  <p className="text-xs text-muted">{fmtDateTime(selected.created_at)}</p>
                </div>
                {selected.is_demo && <DemoTag className="ml-auto" />}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <CategoryChip category={selected.category} label={selected.category_name || categoryName(selected.category)} />
                <TStatusBadge status={selected.status} />
                <TSeverityBadge severity={selected.severity} />
              </div>
              <p className="text-sm leading-relaxed text-ink">{selected.summary || selected.original_description || '—'}</p>
              {selected.location?.locality && <p className="flex items-center gap-1.5 text-[13px] text-muted"><MapPin className="h-4 w-4 text-forest" aria-hidden />{selected.location.locality}</p>}
              <Button as={Link} to={`/app/complaints/${selected.ticket_number}`} className="w-full">{t('list.openReport', 'Open report')}<ArrowRight className="h-4 w-4" aria-hidden /></Button>
            </div>
          )}
        </Panel>
        </div>
      </div>
    </Page>
  )
}
