import { Link } from 'react-router-dom'
import { CheckCircle2, Recycle, HelpCircle, Gamepad2, Play } from 'lucide-react'
import { Badge, Card } from '../../components/ui'

const ACCENTS = {
  clean_city: { icon: Recycle, bar: 'bg-forest', text: 'text-forest', chip: 'bg-forest-100', btn: 'bg-forest hover:bg-forest-600' },
  civic_quiz: { icon: HelpCircle, bar: 'bg-civic', text: 'text-civic', chip: 'bg-civic-100', btn: 'bg-civic hover:bg-[#274f78]' },
}
const FALLBACK = { icon: Gamepad2, bar: 'bg-saffron', text: 'text-saffron', chip: 'bg-saffron-100', btn: 'bg-saffron hover:bg-[#a96624]' }

export const gameAccent = (code) => ACCENTS[code] || FALLBACK

export default function GameCard({ game }) {
  if (!game || !game.code) return null
  const a = gameAccent(game.code)
  const Icon = a.icon
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className={`h-1.5 ${a.bar}`} aria-hidden />
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] ${a.chip} ${a.text}`} aria-hidden>
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-lg font-extrabold text-ink">{game.title || game.code}</h3>
            {game.description && <p className="mt-1 text-sm text-muted">{game.description}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {game.played_today
            ? <Badge tone="success"><CheckCircle2 className="h-3 w-3" aria-hidden /> Played today</Badge>
            : <Badge tone="neutral">Not played today</Badge>}
          {game.best_score != null && <Badge tone="civic">Best score {game.best_score}{game.max_score ? ` / ${game.max_score}` : ''}</Badge>}
          {game.daily_points != null && <Badge tone="saffron">{game.daily_points} points for the first play each day</Badge>}
        </div>

        <div className="mt-auto pt-1">
          <Link
            to={`/app/civicverse/${game.code}`}
            className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] px-6 text-base font-semibold text-white transition-colors ${a.btn}`}
          >
            <Play className="h-4 w-4" aria-hidden /> {game.played_today ? 'Play again (points are once per day)' : 'Play now'}
          </Link>
        </div>
      </div>
    </Card>
  )
}
