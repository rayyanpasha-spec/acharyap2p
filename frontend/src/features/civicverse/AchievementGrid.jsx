import { Award, Lock, HelpCircle } from 'lucide-react'
import { Badge, cn } from '../../components/ui'
import { fmtDate } from '../../lib/format'

export default function AchievementGrid({ achievements }) {
  const list = Array.isArray(achievements) ? achievements : []
  if (!list.length) return <p className="text-sm text-muted">No achievements to show yet.</p>

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((a, i) => {
        const earned = !!a.earned
        const hidden = !!a.secret && !earned
        const Icon = earned ? Award : hidden ? HelpCircle : Lock
        return (
          <li
            key={a.code || i}
            className={cn('flex gap-3 rounded-[10px] border p-3', earned ? 'border-saffron/40 bg-saffron-100/40' : 'border-line bg-surface')}
          >
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', earned ? 'bg-saffron text-white' : 'bg-paper text-muted')} aria-hidden>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className={cn('text-sm font-bold', earned ? 'text-ink' : 'text-muted')}>{hidden ? 'Secret achievement' : a.title || a.code}</p>
              <p className="mt-0.5 text-xs text-muted">{hidden ? 'Keep contributing to discover it.' : a.description}</p>
              <div className="mt-1.5">
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
