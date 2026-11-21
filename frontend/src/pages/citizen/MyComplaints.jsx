import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, FilePlus2, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, Select, Spinner, Tabs } from '../../components/ui'
import { ComplaintRow } from '../../components/StatusTimeline'
import { api, errMsg } from '../../lib/api'
import { useMeta } from '../../store/meta'
import { useT } from '../../lib/i18n'
import { titleCase } from '../../lib/format'

const PAGE_SIZE = 15
const STATUSES = ['submitted', 'ai_review', 'verified', 'assigned', 'in_progress', 'awaiting_verification', 'resolved', 'reopened', 'rejected', 'duplicate_linked']

export default function MyComplaints() {
  const { t } = useT()
  const meta = useMeta((s) => s.meta)
  const [scope, setScope] = useState('all')
  const [status, setStatus] = useState('')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  return (
    <div>
      <PageHeader title={t('nav.reports', 'My reports')} subtitle={t('list.sub', 'Reports you filed and reports you follow.')}
        actions={<Button as={Link} to="/app/report"><FilePlus2 className="h-4 w-4" aria-hidden />{t('btn.report', 'Report an issue')}</Button>} />
      <Card>
        <div className="px-3 pt-2">
          <Tabs value={scope} onChange={(v) => { setScope(v); setPage(1) }}
            tabs={[{ value: 'all', label: t('list.all', 'All') }, { value: 'mine', label: t('list.mine', 'Mine') }, { value: 'following', label: t('list.following', 'Following') }]} />
        </div>
        <div className="grid gap-2 border-b border-line p-3 sm:grid-cols-[1fr_220px]">
          <div className="relative">
            <label htmlFor="mc-q" className="sr-only">{t('list.search', 'Search reports')}</label>
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" aria-hidden />
            <Input id="mc-q" type="search" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t('list.search', 'Search reports')} className="pl-9" />
          </div>
          <div>
            <label htmlFor="mc-status" className="sr-only">{t('list.status', 'Status')}</label>
            <Select id="mc-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
              <option value="">{t('list.anyStatus', 'Any status')}</option>
              {statuses.map((s) => <option key={s} value={s}>{t('status.' + s, titleCase(s))}</option>)}
            </Select>
          </div>
        </div>

        {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : items.length === 0 ? (
          <EmptyState icon={ClipboardList}
            title={filtered ? t('list.noMatch', 'No reports match these filters') : scope === 'following' ? t('list.noFollowing', 'You are not following any reports') : t('list.none', 'No reports yet')}
            hint={filtered ? t('list.noMatchD', 'Try clearing the search or status filter.') : t('list.noneD', 'When you report an issue it will be listed here with its progress.')}
            action={!filtered && <Button as={Link} to="/app/report" size="sm">{t('btn.report', 'Report an issue')}</Button>} />
        ) : (
          <div className="divide-y divide-line">{items.map((c) => <ComplaintRow key={c.ticket_number} c={c} />)}</div>
        )}

        {!loading && !error && total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
            <span className="text-muted">{t('list.page', 'Page')} {page} / {pages} · {total}</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label={t('list.prev', 'Previous page')}><ChevronLeft className="h-4 w-4" aria-hidden /></Button>
              <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label={t('list.next', 'Next page')}><ChevronRight className="h-4 w-4" aria-hidden /></Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
