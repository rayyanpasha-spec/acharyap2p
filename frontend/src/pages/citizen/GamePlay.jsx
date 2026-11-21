// Plays one CivicVerse game: start session -> play -> submit answers (server scores) -> result.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api, errMsg } from '../../lib/api'
import { Button, Card, CardBody, Notice, PageHeader, Spinner } from '../../components/ui'
import CleanCityGame, { normaliseItems } from '../../features/civicverse/CleanCityGame'
import QuizGame, { normaliseQuestions } from '../../features/civicverse/QuizGame'
import ResultPanel from '../../features/civicverse/ResultPanel'

const TITLES = { clean_city: 'Clean City Challenge', civic_quiz: 'Civic Quiz Arena' }
const BLURBS = {
  clean_city: 'Sort each item into the right bin. Use the big buttons, or press the number keys.',
  civic_quiz: 'Answer short questions about everyday civic responsibility.',
}

export default function GamePlay() {
  const { gameCode } = useParams()
  const [phase, setPhase] = useState('starting') // starting | playing | result | error
  const [session, setSession] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState('')
  const [result, setResult] = useState(null)
  const startedFor = useRef(null)

  const start = useCallback(async () => {
    setPhase('starting'); setError(''); setSubmitErr(''); setResult(null); setSession(null)
    try {
      const { data } = await api.post('/games/sessions', { game_code: gameCode })
      setSession(data); setPhase('playing')
    } catch (e) {
      setError(errMsg(e, 'Could not start this game.')); setPhase('error')
    }
  }, [gameCode])

  useEffect(() => {
    if (startedFor.current === gameCode) return
    startedFor.current = gameCode
    start()
  }, [gameCode, start])

  const submit = async (answers, duration) => {
    if (!session?.session_id) return
    setSubmitting(true); setSubmitErr('')
    try {
      const { data } = await api.post(`/games/sessions/${session.session_id}/score`, { answers, duration_seconds: duration })
      setResult(data); setPhase('result')
    } catch (e) {
      const st = e?.response?.status
      if (st === 409) setSubmitErr('This game session was already completed. Choose "Start a new round" to play again.')
      else if (st === 422 || st === 400) setSubmitErr(errMsg(e, 'Those answers could not be accepted. Please try a new round.'))
      else setSubmitErr(errMsg(e))
    } finally { setSubmitting(false) }
  }

  // id -> label for the result review list
  const labels = useMemo(() => {
    const m = {}
    const cfg = session?.config
    if (gameCode === 'clean_city') normaliseItems(cfg?.items).forEach((i) => { m[i.id] = i.name })
    if (gameCode === 'civic_quiz') normaliseQuestions(cfg?.questions).forEach((q) => { m[q.id] = q.text })
    return m
  }, [session, gameCode])

  const title = TITLES[gameCode] || 'CivicVerse game'
  const known = gameCode === 'clean_city' || gameCode === 'civic_quiz'

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/app/civicverse" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-civic hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> CivicVerse
      </Link>
      <PageHeader title={title} subtitle={BLURBS[gameCode]} />

      {phase === 'starting' && <Spinner label="Getting your game ready…" />}

      {phase === 'error' && (
        <Card><CardBody className="space-y-3">
          <Notice tone="warning" title="We could not start this game">{error}</Notice>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={start}>Try again</Button>
            <Link to="/app/civicverse" className="inline-flex h-10 items-center rounded-[10px] px-4 text-sm font-semibold text-civic hover:bg-civic-50">Back to hub</Link>
          </div>
        </CardBody></Card>
      )}

      {phase === 'playing' && session && (
        <div className="space-y-3">
          {submitErr && (
            <Notice tone="critical" title="Could not submit">
              <p>{submitErr}</p>
              <Button className="mt-2" size="sm" variant="secondary" onClick={start}>Start a new round</Button>
            </Notice>
          )}
          {gameCode === 'clean_city' && <CleanCityGame config={session.config} onSubmit={submit} submitting={submitting} />}
          {gameCode === 'civic_quiz' && <QuizGame config={session.config} onSubmit={submit} submitting={submitting} />}
          {!known && (
            <Card><CardBody>
              <p className="text-sm text-muted">This game is not supported in this version of the app yet.</p>
            </CardBody></Card>
          )}
        </div>
      )}

      {phase === 'result' && <ResultPanel result={result} labels={labels} gameTitle={title} onPlayAgain={start} />}
    </div>
  )
}
