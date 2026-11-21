import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle, Award, RotateCcw, ArrowLeft } from 'lucide-react'
import { Badge, Button, Card, CardBody, CardHeader, Notice } from '../../components/ui'

/** result: response of POST /games/sessions/{id}/score. labels: {id: display text} for the review list. */
export default function ResultPanel({ result, labels = {}, onPlayAgain, gameTitle }) {
  if (!result) return null
  const review = Array.isArray(result.review) ? result.review : []
  const unlocked = Array.isArray(result.achievements_unlocked) ? result.achievements_unlocked : []
  const awarded = Number(result.points_awarded) || 0

  return (
    <div className="space-y-4">
      <Card className="border-forest/30">
        <CardBody className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{gameTitle || 'Result'}</p>
          <p className="mt-2 font-display text-5xl font-extrabold text-forest" aria-label={`Score ${result.score} out of ${result.max_score}`}>
            {result.score ?? '-'}<span className="text-2xl text-muted"> / {result.max_score ?? '-'}</span>
          </p>
          <p className="mt-1 text-sm text-ink">{result.correct ?? '-'} correct out of {result.total ?? '-'}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {awarded > 0 && <Badge tone="saffron">+{awarded} civic points</Badge>}
            {awarded === 0 && result.daily_cap_reached && <Badge tone="warning">Daily game points cap reached</Badge>}
            {awarded === 0 && !result.daily_cap_reached && <Badge tone="neutral">No points this time</Badge>}
          </div>
          {awarded === 0 && (
            <p className="mx-auto mt-2 max-w-md text-xs text-muted">
              Points are earned once per game per day and game points are capped each day. You can still play again to practise.
            </p>
          )}
        </CardBody>
      </Card>

      {unlocked.length > 0 && (
        <Notice tone="success" title="Achievement unlocked">
          <ul className="mt-1 space-y-1">
            {unlocked.map((a, i) => (
              <li key={a.code || i} className="flex items-center gap-2 font-semibold text-success"><Award className="h-4 w-4" aria-hidden /> {a.title || a.code}</li>
            ))}
          </ul>
        </Notice>
      )}

      {review.length > 0 && (
        <Card>
          <CardHeader title="Review" subtitle="What was right, and why" />
          <ul className="divide-y divide-line">
            {review.map((r, i) => (
              <li key={r.id ?? i} className="flex gap-3 px-4 py-3 sm:px-5">
                {r.correct
                  ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-label="Correct" />
                  : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-critical" aria-label="Incorrect" />}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{labels[r.id] || `Item ${i + 1}`}</p>
                  {r.explanation && <p className="mt-0.5 text-sm text-muted">{r.explanation}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={onPlayAgain}><RotateCcw className="h-4 w-4" aria-hidden /> Play again</Button>
        <Link to="/app/civicverse" className="inline-flex h-12 items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-surface px-6 text-base font-semibold text-ink hover:bg-paper">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to CivicVerse
        </Link>
      </div>
    </div>
  )
}
