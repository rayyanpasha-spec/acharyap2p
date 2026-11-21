// Bell with unread count. Polls GET /notifications?unread_only=true every 60 s.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import { cn } from './ui'

export default function NotificationBell({ className }) {
  const { t } = useT()
  const [count, setCount] = useState(0)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications', { params: { unread_only: true, page_size: 1 } })
      const n = data?.unread_count ?? data?.total ?? data?.items?.length ?? 0
      setCount(Number(n) || 0)
    } catch { /* keep the previous count; the bell must never break the layout */ }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 60000)
    const onFocus = () => load()
    window.addEventListener('civiclens:notifications-changed', onFocus)
    return () => { clearInterval(id); window.removeEventListener('civiclens:notifications-changed', onFocus) }
  }, [load])

  const label = count > 0
    ? `${t('nav.notifications', 'Notifications')} (${count} ${t('notif.unread', 'unread')})`
    : t('nav.notifications', 'Notifications')

  return (
    <Link to="/app/notifications" aria-label={label} title={label}
      className={cn('relative inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-line-strong bg-surface text-forest transition-colors hover:bg-paper', className)}>
      <Bell className="h-[18px] w-[18px]" aria-hidden />
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-saffron px-1 text-[10px] font-bold text-white box-content">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
