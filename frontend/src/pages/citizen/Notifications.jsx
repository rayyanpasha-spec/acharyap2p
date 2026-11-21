import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellRing, CheckCheck, ChevronLeft, ChevronRight, ClipboardList, Inbox } from 'lucide-react'
import { Button, EmptyState, ErrorState, IconTile, Page, Panel, Spinner, cn, toast } from '../../components/ui'
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
    <Page title={t('nav.notifications', 'Notifications')} subtitle={unread > 0 ? `${unread} ${t('notif.unread', 'unread')}` : t('notif.allRead', 'You are all caught up.')}
      actions={<Button variant="secondary" size="sm" onClick={markAll} loading={busy} disabled={unread === 0}><CheckCheck className="h-4 w-4" aria-hidden />{t('btn.markAll', 'Mark all as read')}</Button>}>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_280px] lg:grid-rows-[minmax(0,1fr)]">
        <Panel title={t('nav.notifications', 'Notifications')} icon={Bell} tone="plum" bodyClassName="p-0"
          footer={!loading && !error && total > PAGE_SIZE ? (
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted">{t('list.page', 'Page')} {page} / {pages}</span>
              <div className="flex gap-1.5">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label={t('list.prev', 'Previous page')}><ChevronLeft className="h-4 w-4" aria-hidden /></Button>
                <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label={t('list.next', 'Next page')}><ChevronRight className="h-4 w-4" aria-hidden /></Button>
              </div>
            </div>
          ) : null}>
          {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={() => load()} /> : items.length === 0 ? (
            <EmptyState icon={Bell} title={t('notif.none', 'No notifications yet')} hint={t('notif.noneD', 'Updates about your reports will appear here.')} />
          ) : (
            <ul className="divide-y divide-line">
              {items.map((n) => (
                <li key={n.id} className={cn('flex gap-3 px-4 py-2.5 transition-colors', !n.read ? 'bg-civic-50 hover:bg-civic-100/60' : 'hover:bg-paper')}>
                  <IconTile icon={n.read ? Inbox : BellRing} tone={n.read ? 'forest' : 'saffron'} size="sm" className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', n.read ? 'font-medium' : 'font-bold')}>{n.title}</p>
                    {n.body && <p className="mt-0.5 text-[13px] text-ink/80">{n.body}</p>}
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
        </Panel>

        <div className="flex min-h-0 flex-col gap-3">
          <Panel title={t('notif.summary', 'Summary')} icon={BellRing} tone="saffron" className="shrink-0" bodyClassName="grid grid-cols-2 gap-2 p-3">
            <div className="rounded-xl border border-saffron/25 bg-saffron-100/60 p-3">
              <p className="font-display text-2xl font-extrabold leading-none text-saffron">{unread}</p>
              <p className="mt-1 text-xs font-medium text-ink/70">{t('notif.unread', 'unread')}</p>
            </div>
            <div className="rounded-xl border border-forest/15 bg-forest-50 p-3">
              <p className="font-display text-2xl font-extrabold leading-none text-forest">{total}</p>
              <p className="mt-1 text-xs font-medium text-ink/70">{t('notif.total', 'total')}</p>
            </div>
          </Panel>
          <Panel className="shrink-0" bodyClassName="p-3">
            <Link to="/app/complaints" className="flex items-center gap-2.5 rounded-xl border border-line p-2.5 text-sm font-semibold transition-colors hover:bg-forest-50">
              <IconTile icon={ClipboardList} tone="civic" size="sm" />{t('nav.reports', 'My reports')}
            </Link>
          </Panel>
        </div>
      </div>
    </Page>
  )
}
