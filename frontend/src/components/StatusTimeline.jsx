// Vertical status timeline + shared citizen helpers (translated badges, compact complaint row).
// rows: [{id, from_status, to_status, note, actor_role, created_at}]
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { fmtDateTime, timeAgo, titleCase } from '../lib/format'
import { useT } from '../lib/i18n'
import { useMeta } from '../store/meta'
import { Badge, CategoryChip, DemoTag, cn } from './ui'

const DOT = {
  resolved: 'bg-success', reopened: 'bg-high', rejected: 'bg-muted', duplicate_linked: 'bg-muted',
  in_progress: 'bg-saffron', awaiting_verification: 'bg-plum', assigned: 'bg-civic', verified: 'bg-teal', ai_review: 'bg-civic', submitted: 'bg-forest',
}

export default function StatusTimeline({ rows = [], className }) {
  const { t } = useT()
  const list = Array.isArray(rows) ? rows : []
  if (list.length === 0) {
    return <p className="text-sm text-muted">{t('timeline.empty', 'No status updates yet.')}</p>
  }
  return (
    <ol className={cn('relative', className)} aria-label={t('timeline.title', 'Status timeline')}>
      {list.map((r, i) => {
        const last = i === list.length - 1
        return (
          <li key={r.id ?? i} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && <span className="absolute left-[10px] top-6 h-[calc(100%-14px)] w-px bg-line-strong" aria-hidden />}
            <span className={cn('relative z-[1] mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white', DOT[r.to_status] || 'bg-forest', last && 'ring-4 ring-forest-100')} aria-hidden>
              {last ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <div className={cn('min-w-0 flex-1 rounded-[10px] px-2.5 py-1.5', last && 'bg-forest-50')}>
              <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm font-semibold text-ink">
                <span>{t('status.' + r.to_status, titleCase(r.to_status || ''))}{r.actor_role && <span className="ml-2 text-xs font-normal text-muted">{titleCase(r.actor_role)}</span>}</span>
                <span className="text-[11px] font-normal text-muted">{fmtDateTime(r.created_at)}</span>
              </p>
              {r.note && <p className="mt-0.5 text-[13px] text-ink/80">{r.note}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/* ---- Shared citizen helpers (translated badges + compact complaint row) ---- */
const STATUS_TONE = {
  submitted: 'neutral', ai_review: 'civic', verified: 'teal', assigned: 'civic', in_progress: 'saffron',
  awaiting_verification: 'plum', resolved: 'success', reopened: 'high', rejected: 'neutral', duplicate_linked: 'neutral',
}
const SEV_TONE = { low: 'low', medium: 'warning', high: 'high', critical: 'critical' }
export const SEV_BAR = { low: 'border-l-low', medium: 'border-l-warning', high: 'border-l-high', critical: 'border-l-critical' }

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
    <Link to={`/app/complaints/${c.ticket_number}`} className={cn('block border-l-[3px] px-4 py-2.5 transition-colors hover:bg-forest-50/70', SEV_BAR[c.severity] || 'border-l-transparent')}>
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
