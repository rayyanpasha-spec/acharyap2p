import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Card, EmptyState, ErrorState, PageHeader, Spinner, cn, toast } from '../../components/ui'
import { api, errMsg } from '../../lib/api'
import { useT } from '../../lib/i18n'
import { timeAgo } from '../../lib/format'

const PAGE_SIZE = 20
const ping = () => window.dispatchEvent(new Event('civiclens:notifications-changed'))

export default function Notifications() {
  const { t } = useT()
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/notifications', { params: { page, page_size: PAGE_SIZE } })
      setData(data)
    } catch (e) { setError(errMsg(e)) }
    setLoading(false)
  }, [page])
  useEffect(() => { load() }, [load])

  const items = data?.items || []
  const unread = data?.unread_count ?? items.filter((n) => !n.read).length
  const total = data?.total ?? items.length
  const pages = Math.max(1, Math.ceil(total / (data?.page_size || PAGE_SIZE)))

  const markRead = async (n) => {
    if (n.read) return
    setData((d) => d && { ...d, items: d.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)), unread_count: Math.max(0, (d.unread_count ?? 1) - 1) })
    try { await api.post(`/notifications/${n.id}/read`); ping() } catch { load(true) }
  }
  const markAll = async () => {
    setBusy(true)
    try { await api.post('/notifications/read-all'); await load(true); ping() } catch (e) { toast.error(errMsg(e)) }
    setBusy(false)
  }

  return (
    <div>
      <PageHeader title={t('nav.notifications', 'Notifications')} subtitle={unread > 0 ? `${unread} ${t('notif.unread', 'unread')}` : t('notif.allRead', 'You are all caught up.')}
        actions={<Button variant="secondary" onClick={markAll} loading={busy} disabled={unread === 0}><CheckCheck className="h-4 w-4" aria-hidden />{t('btn.markAll', 'Mark all as read')}</Button>} />
      <Card>
        {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={() => load()} /> : items.length === 0 ? (
          <EmptyState icon={Bell} title={t('notif.none', 'No notifications yet')} hint={t('notif.noneD', 'Updates about your reports will appear here.')} />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className={cn('flex gap-3 px-4 py-3 sm:px-5', !n.read && 'bg-civic-50')}>
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-line-strong' : 'bg-saffron')} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm', n.read ? 'font-medium' : 'font-bold')}>{n.title}</p>
                  {n.body && <p className="mt-0.5 text-sm text-ink/80">{n.body}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{timeAgo(n.created_at)}</span>
                    {n.ticket_number && <Link to={`/app/complaints/${n.ticket_number}`} onClick={() => markRead(n)} className="font-mono font-semibold text-civic hover:underline">{n.ticket_number}</Link>}
                    {!n.read && <button type="button" onClick={() => markRead(n)} className="font-semibold text-forest hover:underline">{t('notif.markRead', 'Mark as read')}</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!loading && !error && total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
            <span className="text-muted">{t('list.page', 'Page')} {page} / {pages}</span>
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
