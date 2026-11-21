// Vertical status timeline. rows: [{id, from_status, to_status, note, actor_role, created_at}]
import { CheckCircle2, Circle } from 'lucide-react'
import { fmtDateTime, titleCase } from '../lib/format'
import { useT } from '../lib/i18n'
import { cn } from './ui'

const DOT = {
  resolved: 'text-success', reopened: 'text-high', rejected: 'text-muted', duplicate_linked: 'text-muted',
  in_progress: 'text-saffron', awaiting_verification: 'text-plum', assigned: 'text-civic', verified: 'text-teal', ai_review: 'text-civic',
}

export default function StatusTimeline({ rows = [], className }) {
  const { t } = useT()
  const list = Array.isArray(rows) ? rows : []
  if (list.length === 0) {
    return <p className="text-sm text-muted">{t('timeline.empty', 'No status updates yet.')}</p>
  }
  return (
    <ol className={cn('relative space-y-0', className)} aria-label={t('timeline.title', 'Status timeline')}>
      {list.map((r, i) => {
        const last = i === list.length - 1
        const Icon = last ? CheckCircle2 : Circle
        return (
          <li key={r.id ?? i} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span className="absolute left-[9px] top-5 h-[calc(100%-12px)] w-px bg-line-strong" aria-hidden />}
            <Icon className={cn('relative z-[1] mt-0.5 h-5 w-5 shrink-0 bg-surface', DOT[r.to_status] || 'text-forest')} aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                {t('status.' + r.to_status, titleCase(r.to_status || ''))}
                {r.actor_role && <span className="ml-2 text-xs font-normal text-muted">{titleCase(r.actor_role)}</span>}
              </p>
              {r.note && <p className="mt-0.5 text-sm text-ink/80">{r.note}</p>}
              <p className="mt-0.5 text-xs text-muted">{fmtDateTime(r.created_at)}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/* ---- Shared citizen helpers (translated badges + compact complaint row) ---- */
import { Link } from 'react-router-dom'
import { Badge, CategoryChip, DemoTag } from './ui'
import { timeAgo } from '../lib/format'
import { useMeta } from '../store/meta'

const STATUS_TONE = {
  submitted: 'neutral', ai_review: 'civic', verified: 'teal', assigned: 'civic', in_progress: 'saffron',
  awaiting_verification: 'plum', resolved: 'success', reopened: 'high', rejected: 'neutral', duplicate_linked: 'neutral',
}
const SEV_TONE = { low: 'low', medium: 'warning', high: 'high', critical: 'critical' }

export function TStatusBadge({ status }) {
  const { t } = useT()
  return status ? <Badge tone={STATUS_TONE[status] || 'neutral'}>{t('status.' + status, titleCase(status))}</Badge> : null
}
export function TSeverityBadge({ severity }) {
  const { t } = useT()
  return severity ? <Badge tone={SEV_TONE[severity] || 'neutral'} dot>{t('severity.' + severity, titleCase(severity))}</Badge> : null
}

export function ComplaintRow({ c, showSeverity = true }) {
  const categoryName = useMeta((s) => s.categoryName)
  if (!c) return null
  return (
    <Link to={`/app/complaints/${c.ticket_number}`} className="block px-4 py-3 hover:bg-forest-50/60 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-xs font-semibold text-civic">{c.ticket_number}</span>
        <CategoryChip category={c.category} label={c.category_name || categoryName(c.category)} />
        {c.is_demo && <DemoTag />}
        <span className="ml-auto text-xs text-muted">{timeAgo(c.created_at)}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-ink">{c.summary || c.original_description || '—'}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <TStatusBadge status={c.status} />
        {showSeverity && <TSeverityBadge severity={c.severity} />}
        {c.location?.locality && <span className="text-xs text-muted">{c.location.locality}</span>}
      </div>
    </Link>
  )
}
