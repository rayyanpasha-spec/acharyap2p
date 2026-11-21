// CivicBot: a small optional helper that shares generic civic tips and navigation shortcuts.
// It is NOT a government official and never reports ticket statuses.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, ChevronLeft, ChevronRight, FilePlus2, ListChecks, Trash2, Trophy, Award } from 'lucide-react'
import { Card, CardBody, cn } from '../../components/ui'

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

export default function CivicBot({ className }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * CIVIC_TIPS.length))
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return undefined
    const id = setInterval(() => setI((n) => (n + 1) % CIVIC_TIPS.length), 14000)
    return () => clearInterval(id)
  }, [paused])

  const step = (d) => setI((n) => (n + d + CIVIC_TIPS.length) % CIVIC_TIPS.length)

  return (
    <Card className={cn('border-teal/30', className)} aria-label="CivicBot">
      <CardBody className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal text-white" aria-hidden>
            <Bot className="h-6 w-6" />
          </span>
          <div>
            <h3 className="font-display text-[15px] font-bold text-ink">CivicBot</h3>
            <p className="text-xs text-muted">A friendly helper for civic tips and shortcuts. Not a government official; it cannot tell you the status of a ticket.</p>
          </div>
        </div>

        <div
          className="rounded-[10px] border border-teal/25 bg-teal-100 p-3"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-teal">Civic tip {i + 1} of {CIVIC_TIPS.length}</p>
          <p className="mt-1 min-h-[3.5rem] text-sm text-ink" aria-live="polite">{CIVIC_TIPS[i]}</p>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => step(-1)} aria-label="Previous tip" className="flex h-9 w-9 items-center justify-center rounded-lg border border-teal/30 bg-surface text-teal hover:bg-paper">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Next tip" className="flex h-9 w-9 items-center justify-center rounded-lg border border-teal/30 bg-surface text-teal hover:bg-paper">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <nav aria-label="CivicBot shortcuts" className="flex flex-wrap gap-2">
          {SHORTCUTS.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-paper">
              <Icon className="h-4 w-4 text-teal" aria-hidden /> {label}
            </Link>
          ))}
        </nav>
      </CardBody>
    </Card>
  )
}
