import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ListChecks, RefreshCw } from 'lucide-react'
import { Badge, Button, EmptyState, ErrorState, Page, Panel, Spinner } from '../../components/ui'
import { useMeta } from '../../store/meta'
import { useAuth } from '../../store/auth'
import FilterBar from '../../features/staff/FilterBar'
import TicketTable from '../../features/staff/TicketTable'
import { useFetch } from '../../features/staff/common'

const PAGE_SIZE = 25
const FILTER_KEYS = ['severity', 'status', 'category', 'department', 'assigned', 'review', 'overdue', 'q', 'date_from', 'date_to', 'min_confidence', 'max_confidence']

export default function Queue() {
  const [params, setParams] = useSearchParams()
  const meta = useMeta((s) => s.meta)
  const role = useAuth((s) => s.user?.role)
  const page = Math.max(1, Number(params.get('page')) || 1)

  const query = useMemo(() => {
    const q = { page, page_size: PAGE_SIZE }
    FILTER_KEYS.forEach((k) => { const v = params.get(k); if (v) q[k] = v })
    return q
  }, [params, page])

  const { data, loading, error, reload } = useFetch('/officer/queue', query)

  const patch = useCallback((changes) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      Object.entries(changes).forEach(([k, v]) => { if (v === '' || v == null) next.delete(k); else next.set(k, v) })
      next.delete('page')
      return next
    }, { replace: true })
  }, [setParams])

  const reset = () => setParams(new URLSearchParams(), { replace: true })
  const goPage = (p) => setParams((prev) => { const n = new URLSearchParams(prev); if (p <= 1) n.delete('page'); else n.set('page', String(p)); return n })

  const items = data?.items || []
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / (data?.page_size || PAGE_SIZE)))
  const hasRows = !!data && items.length > 0

  return (
    <Page
      title={role === 'worker' ? 'My assigned tickets' : 'Priority queue'}
      subtitle="Sorted by operational priority, then SLA risk and age. Priority never changes the AI severity label."
      actions={<Button variant="secondary" size="sm" onClick={reload}><RefreshCw className="h-4 w-4" aria-hidden /> Refresh</Button>}
    >
      <FilterBar params={params} onPatch={patch} onReset={reset} meta={meta} />
      <Panel
        className="flex-1"
        title="Tickets"
        subtitle="Click a row to open the ticket"
        icon={ListChecks}
        tone="teal"
        action={data ? <Badge tone="teal">{total} match{total === 1 ? '' : 'es'}</Badge> : null}
        bodyClassName="overflow-x-auto p-0"
        footer={hasRows ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
            <span aria-live="polite">{loading ? 'Updating…' : `${(page - 1) * PAGE_SIZE + 1}-${(page - 1) * PAGE_SIZE + items.length} of ${total} tickets`}</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => goPage(page - 1)}><ChevronLeft className="h-4 w-4" aria-hidden /> Previous</Button>
              <span className="tabular-nums">Page {page} / {pages}</span>
              <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => goPage(page + 1)}>Next <ChevronRight className="h-4 w-4" aria-hidden /></Button>
            </div>
          </div>
        ) : null}
      >
        {loading && !data ? <Spinner label="Loading the queue…" /> : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : items.length === 0 ? (
          <EmptyState title="No tickets match these filters" hint="Try clearing a filter or widening the date range." action={<Button variant="secondary" size="sm" onClick={reset}>Clear filters</Button>} />
        ) : (
          <TicketTable items={items} />
        )}
      </Panel>
    </Page>
  )
}
