// Clean City Challenge: assign each waste item to a bin. The score is computed by the server, never here.
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Send, Timer } from 'lucide-react'
import { Button, Card, CardBody, cn } from '../../components/ui'
import { titleCase } from '../../lib/format'

const DEFAULT_BINS = ['wet', 'dry', 'recyclable', 'e_waste', 'hazardous']
const BIN_STYLES = [
  'border-forest bg-forest-50 text-forest hover:bg-forest-100',
  'border-civic bg-civic-50 text-civic hover:bg-civic-100',
  'border-teal bg-teal-100/60 text-teal hover:bg-teal-100',
  'border-plum bg-plum-100/60 text-plum hover:bg-plum-100',
  'border-saffron bg-saffron-100/60 text-saffron hover:bg-saffron-100',
]
const BIN_HELP = {
  wet: 'Food scraps, peels',
  dry: 'Paper, cloth, plastic wrappers',
  recyclable: 'Clean bottles, tins, cardboard',
  e_waste: 'Batteries, chargers, devices',
  hazardous: 'Paint, chemicals, sharps',
}

export function normaliseBins(raw) {
  const list = Array.isArray(raw) && raw.length ? raw : DEFAULT_BINS
  return list
    .map((b) => {
      if (typeof b === 'string') return { code: b, label: titleCase(b) }
      if (b && typeof b === 'object') {
        const code = b.code ?? b.id ?? b.value ?? b.key
        if (code == null) return null
        return { code: String(code), label: b.label || b.name || b.title || titleCase(String(code)) }
      }
      return null
    })
    .filter(Boolean)
}

export function normaliseItems(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((it, idx) => {
      if (typeof it === 'string') return { id: String(idx), name: it }
      if (!it || typeof it !== 'object') return null
      const id = it.id ?? it.item_id ?? idx
      const name = it.name || it.emoji_free_label || it.label || it.text
      return name ? { id, name: String(name) } : null
    })
    .filter(Boolean)
}

export const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function CleanCityGame({ config, onSubmit, submitting }) {
  const items = useMemo(() => normaliseItems(config?.items), [config])
  const bins = useMemo(() => normaliseBins(config?.bins), [config])
  const [pos, setPos] = useState(0)
  const [answers, setAnswers] = useState({}) // item id -> bin code
  const [picked, setPicked] = useState(null) // bin just chosen, for feedback
  const [editing, setEditing] = useState(false) // true when changing one answer from the review screen
  const startedAt = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const done = items.length > 0 && pos >= items.length

  useEffect(() => {
    startedAt.current = Date.now()
    setElapsed(0)
    setPos(0)
    setAnswers({})
  }, [items])

  useEffect(() => {
    if (done || submitting) return undefined
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 500)
    return () => clearInterval(id)
  }, [done, submitting])

  const choose = useCallback((code) => {
    if (done || submitting) return
    const item = items[pos]
    if (!item) return
    setAnswers((a) => ({ ...a, [item.id]: code }))
    setPicked(code)
    // brief visual confirmation, then advance
    const back = editing
    setTimeout(() => { setPicked(null); setEditing(false); setPos((p) => (back ? items.length : p + 1)) }, 180)
  }, [done, submitting, items, pos, editing])

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1 && n <= bins.length) { e.preventDefault(); choose(bins[n - 1].code) }
      if (e.key === 'Backspace' && pos > 0 && !submitting) { e.preventDefault(); setPos((p) => Math.max(0, p - 1)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bins, choose, pos, submitting])

  if (!items.length || !bins.length) {
    return (
      <Card><CardBody>
        <p className="text-sm text-muted">This game could not be displayed because its content was not in the expected format. Please go back and try again later.</p>
      </CardBody></Card>
    )
  }

  const submit = () => {
    const duration = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000))
    onSubmit(items.map((it) => ({ id: it.id, answer: answers[it.id] })).filter((a) => a.answer != null), duration)
  }

  const item = items[pos]
  const pct = Math.round((Math.min(pos, items.length) / items.length) * 100)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-ink">{done ? 'All items sorted' : `Item ${pos + 1} of ${items.length}`}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1 font-mono text-sm text-ink" aria-label={`Time elapsed ${fmtClock(elapsed)}`}>
          <Timer className="h-4 w-4 text-saffron" aria-hidden /> {fmtClock(elapsed)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Sorting progress">
        <div className="h-full rounded-full bg-forest transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>

      {!done && item && (
        <>
          <Card className="border-forest/30">
            <CardBody className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Which bin does this go in?</p>
              <p className="mt-2 font-display text-3xl font-extrabold text-ink" aria-live="polite">{item.name}</p>
            </CardBody>
          </Card>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label="Choose a bin">
            {bins.map((b, i) => (
              <button
                key={b.code}
                type="button"
                onClick={() => choose(b.code)}
                aria-keyshortcuts={String(i + 1)}
                className={cn(
                  'flex min-h-[64px] items-center gap-3 rounded-[10px] border-2 px-4 py-3 text-left transition-transform duration-150',
                  BIN_STYLES[i % BIN_STYLES.length],
                  picked === b.code && 'scale-[0.97] ring-2 ring-ink/30',
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-current bg-surface font-mono text-sm font-bold" aria-hidden>{i + 1}</span>
                <span>
                  <span className="block text-base font-bold">{b.label}</span>
                  {BIN_HELP[b.code] && <span className="block text-xs opacity-80">{BIN_HELP[b.code]}</span>}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setPos((p) => Math.max(0, p - 1))} disabled={pos === 0}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Previous item
            </Button>
            <p className="hidden text-xs text-muted sm:block">Tip: press keys 1 to {bins.length} to choose a bin, Backspace to go back.</p>
          </div>
        </>
      )}

      {done && (
        <Card>
          <CardBody className="space-y-4">
            <p className="text-sm text-ink">Review your choices, then submit. The score is worked out on the server.</p>
            <ul className="divide-y divide-line rounded-[10px] border border-line">
              {items.map((it, idx) => (
                <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="text-ink">{it.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-forest">{bins.find((b) => b.code === answers[it.id])?.label || 'Not sorted'}</span>
                    <button type="button" onClick={() => { setEditing(true); setPos(idx) }} className="rounded-md px-2 py-1 text-xs font-semibold text-civic hover:bg-civic-50">Change</button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={submit} loading={submitting}><Send className="h-4 w-4" aria-hidden /> Submit answers</Button>
              <Button size="lg" variant="secondary" onClick={() => { setEditing(false); setPos(items.length - 1) }} disabled={submitting}>Back</Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
