// "Civic reward" card: progress towards the next reward (every N resolved + verified reports) and the rewards earned so far.
// Data: GET /rewards/me. Honest about the rule: only the citizen's OWN reports that were resolved AND verified count.
import { useEffect, useState } from 'react'
import { Gift, Check } from 'lucide-react'
import { api } from '../../lib/api'
import { Badge, cn } from '../../components/ui'
import { fmtDate } from '../../lib/format'

export default function RewardCard({ className }) {
  const [p, setP] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let off = false
    api.get('/rewards/me').then((r) => { if (!off) setP(r.data) }).catch(() => { if (!off) setErr(true) })
    return () => { off = true }
  }, [])

  if (err) return null                                  // the rest of the page works without it
  if (!p) return <div className={cn('h-[148px] animate-pulse rounded-[14px] border border-line bg-surface', className)} aria-hidden />
  if (!p.enabled) return null

  const need = p.reports_required
  const done = p.progress_in_block
  const pct = Math.round((done / need) * 100)
  return (
    <section aria-label="Civic reward" className={cn('rounded-[14px] border border-saffron/40 bg-saffron-100/40 p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-saffron text-white"><Gift className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0">
            <h2 className="font-display text-[15px] font-bold leading-tight text-ink">Civic reward: {p.reward_display}</h2>
            <p className="text-xs text-muted">For every {need} of your reports that are resolved</p>
          </div>
        </div>
        {p.rewards_earned > 0 && <Badge tone="success">{p.rewards_earned} earned</Badge>}
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-semibold text-ink">{done} of {need} resolved{p.rewards_earned > 0 ? ' for the next reward' : ''}</span>
          <span className="text-muted">{p.remaining} more to go</span>
        </div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={need} aria-valuenow={done} aria-label="Resolved reports towards the next reward">
          <div className="h-full rounded-full bg-saffron transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs leading-snug text-muted">
          {p.resolved_count} of your reports {p.resolved_count === 1 ? 'is' : 'are'} resolved in total. {p.open_count > 0 ?`${p.open_count} of your reports ${p.open_count === 1 ? 'is' : 'are'} still open. ` : ''}
          Only reports that are resolved and verified count; open, rejected or duplicate reports do not.
        </p>
      </div>

      {p.rewards.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-saffron/30 pt-3">
          {p.rewards.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="flex items-center gap-1.5 font-semibold text-ink"><Check className="h-4 w-4 text-success" aria-hidden />{r.display} reward #{r.milestone}</span>
              <span className="text-xs text-muted">{r.status === 'fulfilled' ? `Given ${fmtDate(r.fulfilled_at)}` : 'Earned, being arranged'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
