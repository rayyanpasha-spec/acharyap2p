// Civic Quiz Arena: one question at a time. The server scores the answers.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Send } from 'lucide-react'
import { Button, Card, CardBody, cn } from '../../components/ui'

export function normaliseQuestions(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((q, idx) => {
      if (!q || typeof q !== 'object') return null
      const opts = Array.isArray(q.options) ? q.options.map((o) => (typeof o === 'string' ? o : o?.text || o?.label || '')).filter(Boolean) : []
      const text = q.text || q.question
      if (!text || opts.length < 2) return null
      return { id: q.id ?? idx, text: String(text), options: opts }
    })
    .filter(Boolean)
}

export default function QuizGame({ config, onSubmit, submitting }) {
  const questions = useMemo(() => normaliseQuestions(config?.questions), [config])
  const [pos, setPos] = useState(0)
  const [choice, setChoice] = useState({}) // question id -> option index
  const startedAt = useRef(Date.now())

  useEffect(() => { startedAt.current = Date.now(); setPos(0); setChoice({}) }, [questions])

  const q = questions[pos]
  const last = pos === questions.length - 1
  const selected = q ? choice[q.id] : undefined

  useEffect(() => {
    const onKey = (e) => {
      if (!q || e.metaKey || e.ctrlKey || e.altKey) return
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1 && n <= q.options.length) { e.preventDefault(); setChoice((c) => ({ ...c, [q.id]: n - 1 })) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [q])

  if (!questions.length) {
    return (
      <Card><CardBody>
        <p className="text-sm text-muted">This quiz could not be displayed because its questions were not in the expected format. Please go back and try again later.</p>
      </CardBody></Card>
    )
  }

  const submit = () => {
    const duration = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000))
    onSubmit(
      questions.filter((x) => choice[x.id] != null).map((x) => ({ id: x.id, answer: choice[x.id] })),
      duration,
    )
  }
  const answered = Object.keys(choice).length
  const pct = Math.round(((pos + (selected != null ? 1 : 0)) / questions.length) * 100)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-ink">Question {pos + 1} of {questions.length}</span>
        <span className="text-muted">{answered} answered</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Quiz progress">
        <div className="h-full rounded-full bg-civic transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>

      <Card className="border-civic/30">
        <CardBody>
          <h2 className="font-display text-lg font-extrabold text-ink" id="quiz-question">{q.text}</h2>
          <div className="mt-3 grid gap-2" role="radiogroup" aria-labelledby="quiz-question">
            {q.options.map((opt, i) => {
              const on = selected === i
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-keyshortcuts={String(i + 1)}
                  onClick={() => setChoice((c) => ({ ...c, [q.id]: i }))}
                  className={cn(
                    'flex min-h-[48px] items-center gap-3 rounded-[10px] border-2 px-3.5 py-2 text-left text-[15px] transition-all duration-150',
                    on ? 'border-civic bg-civic-100 font-semibold text-civic' : 'border-line-strong bg-surface text-ink hover:bg-civic-50',
                  )}
                >
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-sm font-bold transition-colors', on ? 'border-civic bg-civic text-white' : 'border-line-strong text-muted')} aria-hidden>{i + 1}</span>
                  <span>{opt}</span>
                </button>
              )
            })}
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => setPos((p) => Math.max(0, p - 1))} disabled={pos === 0 || submitting}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Previous
        </Button>
        {last ? (
          <Button size="lg" variant="civic" onClick={submit} loading={submitting} disabled={answered === 0}>
            <Send className="h-4 w-4" aria-hidden /> Submit answers
          </Button>
        ) : (
          <Button size="lg" variant="civic" onClick={() => setPos((p) => p + 1)} disabled={selected == null}>
            Next <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>
      {last && answered < questions.length && (
        <p className="text-xs text-muted">{questions.length - answered} question(s) unanswered. Use Previous to go back, or submit anyway.</p>
      )}
      <p className="hidden text-xs text-muted sm:block">Tip: press keys 1 to {q.options.length} to choose an option.</p>
    </div>
  )
}
