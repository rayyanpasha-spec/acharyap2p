import { Medal } from 'lucide-react'
import { Card, CardBody } from '../../components/ui'

/** level: {code,title,verified_contributions,next_title,next_threshold} (or a plain string title). */
export default function LevelCard({ level, pointsTotal, verified }) {
  const lv = typeof level === 'string' ? { title: level } : (level || {})
  const count = Number(lv.verified_contributions ?? verified ?? 0) || 0
  const next = lv.next_threshold != null ? Number(lv.next_threshold) : null
  const pct = next ? Math.min(100, Math.round((count / Math.max(1, next)) * 100)) : 100

  return (
    <Card className="border-forest/30">
      <CardBody>
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-forest-100 text-forest" aria-hidden><Medal className="h-7 w-7" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Current level</p>
            <h2 className="font-display text-2xl font-extrabold text-forest">{lv.title || 'Getting started'}</h2>
            <p className="mt-1 text-sm text-ink">
              {count} verified contribution{count === 1 ? '' : 's'}
              {pointsTotal != null && <span className="text-muted"> &middot; {pointsTotal} civic points</span>}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="h-3 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress to the next level">
            <div className="h-full rounded-full bg-forest transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {next && lv.next_title
              ? `${Math.max(0, next - count)} more verified contribution${next - count === 1 ? '' : 's'} to reach ${lv.next_title} (${count} of ${next})`
              : lv.title ? 'You have reached the highest level.' : 'Levels come from verified contributions: reports that an authorised officer confirmed as resolved.'}
          </p>
        </div>
      </CardBody>
    </Card>
  )
}
