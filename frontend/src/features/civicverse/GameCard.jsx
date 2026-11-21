import { Link } from 'react-router-dom'
import { CheckCircle2, Recycle, HelpCircle, Gamepad2, Play, Trophy, Star } from 'lucide-react'
import { Badge, IconTile } from '../../components/ui'

const ACCENTS = {
  clean_city: { icon: Recycle, tone: 'forest', bar: 'bg-forest', panel: 'border-forest/20 bg-forest-50/60', btn: 'bg-forest hover:bg-forest-600' },
  civic_quiz: { icon: HelpCircle, tone: 'civic', bar: 'bg-civic', panel: 'border-civic/20 bg-civic-50', btn: 'bg-civic hover:bg-[#274f78]' },
}
const FALLBACK = { icon: Gamepad2, tone: 'saffron', bar: 'bg-saffron', panel: 'border-saffron/25 bg-saffron-100/50', btn: 'bg-saffron hover:bg-[#a96624]' }

export const gameAccent = (code) => ACCENTS[code] || FALLBACK

export default function GameCard({ game }) {
  if (!game || !game.code) return null
  const a = gameAccent(game.code)
  return (
    <article className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(36,76,57,0.05)] transition-shadow hover:shadow-[0_4px_14px_rgba(36,76,57,0.10)]">
      <div className={`h-1.5 shrink-0 ${a.bar}`} aria-hidden />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <IconTile icon={a.icon} tone={a.tone} size="lg" />
          <div className="min-w-0">
            <h3 className="font-display text-lg font-extrabold leading-tight text-ink">{game.title || game.code}</h3>
            {game.description && <p className="mt-1 text-[13px] text-muted">{game.description}</p>}
          </div>
        </div>

        <div className={`grid flex-1 content-center gap-2 rounded-xl border p-3 text-[13px] ${a.panel}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted">Today</span>
            {game.played_today
              ? <Badge tone="success"><CheckCircle2 className="h-3 w-3" aria-hidden /> Played today</Badge>
              : <Badge tone="neutral">Not played today</Badge>}
          </div>
          {game.best_score != null && (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-muted"><Trophy className="h-3.5 w-3.5" aria-hidden />Best score</span>
              <span className="font-display font-bold text-ink">{game.best_score}{game.max_score ? ` / ${game.max_score}` : ''}</span>
            </div>
          )}
          {game.daily_points != null && (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-muted"><Star className="h-3.5 w-3.5" aria-hidden />First play each day</span>
              <span className="font-display font-bold text-saffron">{game.daily_points} points</span>
            </div>
          )}
        </div>

        <Link
          to={`/app/civicverse/${game.code}`}
          className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold text-white transition-colors ${a.btn}`}
        >
          <Play className="h-4 w-4" aria-hidden /> {game.played_today ? 'Play again (points are once per day)' : 'Play now'}
        </Link>
      </div>
    </article>
  )
}
