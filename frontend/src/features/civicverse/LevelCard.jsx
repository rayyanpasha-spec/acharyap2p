import { Medal } from 'lucide-react'
import { IconTile } from '../../components/ui'

/** level: {code,title,verified_contributions,next_title,next_threshold} (or a plain string title). */
export default function LevelCard({ level, pointsTotal, verified, className = '' }) {
  const lv = typeof level === 'string' ? { title: level } : (level || {})
  const count = Number(lv.verified_contributions ?? verified ?? 0) || 0
  const next = lv.next_threshold != null ? Number(lv.next_threshold) : null
  const pct = next ? Math.min(100, Math.round((count / Math.max(1, next)) * 100)) : 100

  return (
    <section className={`overflow-hidden rounded-[14px] border border-forest/25 bg-forest-50/50 p-4 shadow-[0_1px_2px_rgba(36,76,57,0.05)] ${className}`}>
      <div className="flex items-center gap-3">
        <IconTile icon={Medal} tone="forest" size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Current level</p>
          <h2 className="font-display text-xl font-extrabold leading-tight text-forest">{lv.title || 'Getting started'}</h2>
        </div>
        {pointsTotal != null && (
          <div className="shrink-0 rounded-xl border border-saffron/25 bg-saffron-100 px-3 py-1.5 text-right">
            <p className="font-display text-xl font-extrabold leading-none text-saffron">{pointsTotal}</p>
            <p className="text-[11px] font-medium text-ink/70">civic points</p>
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress to the next level">
          <div className="h-full rounded-full bg-forest transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted">
          <span className="font-semibold text-ink">{count} verified contribution{count === 1 ? '' : 's'}.</span>{' '}
          {next && lv.next_title
            ? `${Math.max(0, next - count)} more to reach ${lv.next_title} (${count} of ${next})`
            : lv.title ? 'You have reached the highest level.' : 'Levels come from verified contributions: reports that an authorised officer confirmed as resolved.'}
        </p>
      </div>
    </section>
  )
}
