import { Award, Lock, HelpCircle } from 'lucide-react'
import { Badge, cn } from '../../components/ui'
import { fmtDate } from '../../lib/format'

export default function AchievementGrid({ achievements, className }) {
  const list = Array.isArray(achievements) ? achievements : []
  if (!list.length) return <p className="text-sm text-muted">No achievements to show yet.</p>

  return (
    <ul className={cn('grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2', className)}>
      {list.map((a, i) => {
        const earned = !!a.earned
        const hidden = !!a.secret && !earned
        const Icon = earned ? Award : hidden ? HelpCircle : Lock
        return (
          <li
            key={a.code || i}
            className={cn('flex gap-2.5 rounded-xl border p-2.5 transition-colors', earned ? 'border-saffron/40 bg-saffron-100/50' : 'border-line bg-surface hover:bg-paper')}
          >
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]', earned ? 'bg-saffron text-white' : 'bg-paper text-muted')} aria-hidden>
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className={cn('text-[13px] font-bold leading-snug', earned ? 'text-ink' : 'text-muted')}>{hidden ? 'Secret achievement' : a.title || a.code}</p>
              <p className="mt-0.5 text-xs text-muted">{hidden ? 'Keep contributing to discover it.' : a.description}</p>
              <div className="mt-1">
                {earned
                  ? <Badge tone="saffron">Earned{a.earned_at ? ` ${fmtDate(a.earned_at)}` : ''}</Badge>
                  : <Badge tone="neutral">Locked</Badge>}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
