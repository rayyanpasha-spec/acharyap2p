// CivicBot: a small optional helper that shares generic civic tips and navigation shortcuts.
// It is NOT a government official and never reports ticket statuses.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, ChevronLeft, ChevronRight, FilePlus2, ListChecks, Trash2, Trophy, Award } from 'lucide-react'
import { IconTile, cn } from '../../components/ui'

// Short, generic, factual tips. No statistics, no local laws.
export const CIVIC_TIPS = [
  'Keep wet waste (food scraps, peels) separate from dry waste (paper, plastic, metal) right at home.',
  'Rinse bottles and containers before putting them with recyclables. Food residue can spoil a whole batch.',
  'When reporting a pothole, name a nearby landmark or shop. It helps the field team find the exact spot.',
  'Never touch a fallen or hanging electric wire. Stay well away, warn others, and report it from a safe distance.',
  'Take photos from a safe distance. Do not step onto a busy road or near live equipment for a picture.',
  'Avoid capturing faces and vehicle number plates in your photos. Frame the issue, not the people.',
  'A running tap or a small leak wastes a surprising amount of water over time. Fix drips early.',
  'Keep batteries, old phones and chargers out of the regular bin. They belong with e-waste collection.',
  'Tell the truth in a report and add only what you saw. Accurate reports get resolved faster.',
  'If a similar issue is already reported nearby, follow it or add evidence instead of filing it again.',
  'Do not dump garden waste or construction debris on the roadside. It blocks drains when it rains.',
  'Trees need room: avoid cementing over the base of a tree, and never nail notices onto trunks.',
  'In an emergency involving danger to life, call the local emergency number first. Use this app for non-emergency civic issues.',
]

const SHORTCUTS = [
  { to: '/app/report', label: 'Report an issue', icon: FilePlus2 },
  { to: '/app/complaints', label: 'My reports', icon: ListChecks },
  { to: '/app/cleanroute', label: 'CleanRoute', icon: Trash2 },
  { to: '/app/achievements', label: 'Achievements', icon: Trophy },
  { to: '/app/certificates', label: 'Certificates', icon: Award },
]

export default function CivicBot({ className, compact = false }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * CIVIC_TIPS.length))
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return undefined
    const id = setInterval(() => setI((n) => (n + 1) % CIVIC_TIPS.length), 14000)
    return () => clearInterval(id)
  }, [paused])

  const step = (d) => setI((n) => (n + d + CIVIC_TIPS.length) % CIVIC_TIPS.length)

  return (
    <section className={cn('flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-teal/30 bg-surface shadow-[0_1px_2px_rgba(36,76,57,0.05)]', className)} aria-label="CivicBot">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-teal/20 bg-teal-100/60 px-4 py-2.5">
        <IconTile icon={Bot} tone="teal" />
        <div className="min-w-0">
          <h3 className="font-display text-[14px] font-bold text-ink">CivicBot</h3>
          <p className="truncate text-[11px] text-muted" title="A friendly helper for civic tips and shortcuts. Not a government official; it cannot tell you the status of a ticket.">Civic tips and shortcuts. Not a government official; cannot give ticket status.</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 p-3 lg:overflow-y-auto">
        <div
          className="rounded-xl border border-teal/25 bg-teal-100/50 p-3"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-teal">Civic tip {i + 1} of {CIVIC_TIPS.length}</p>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => step(-1)} aria-label="Previous tip" className="flex h-8 w-8 items-center justify-center rounded-lg border border-teal/30 bg-surface text-teal hover:bg-paper">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" onClick={() => step(1)} aria-label="Next tip" className="flex h-8 w-8 items-center justify-center rounded-lg border border-teal/30 bg-surface text-teal hover:bg-paper">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
          <p className={cn('mt-1.5 text-sm text-ink', compact ? 'min-h-[3.5rem]' : 'min-h-[4.5rem]')} aria-live="polite">{CIVIC_TIPS[i]}</p>
        </div>

        {!compact && (
          <nav aria-label="CivicBot shortcuts" className="flex flex-wrap gap-1.5">
            {SHORTCUTS.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line-strong bg-surface px-2.5 text-[13px] font-semibold text-ink transition-colors hover:border-teal/40 hover:bg-teal-100/40">
                <Icon className="h-4 w-4 text-teal" aria-hidden /> {label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </section>
  )
}
