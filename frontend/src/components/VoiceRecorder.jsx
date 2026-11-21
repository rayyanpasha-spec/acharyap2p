// Voice complaint recorder. Microphone is requested ONLY after the citizen clicks. Never auto-submits.
// Props: language, maxSeconds, onUse({text, transcriptId, language}), onTypeInstead(), disabled
import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Square, Trash2, RotateCcw, Check, Keyboard } from 'lucide-react'
import { Button, Notice, Spinner, Textarea, cn } from './ui'
import { errMsg } from '../lib/api'
import { useT } from '../lib/i18n'
import { confirmTranscript, fill, transcribeAudio } from '../features/report/api'

const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
const pickMime = () => {
  if (typeof MediaRecorder === 'undefined') return null
  const ok = MIMES.find((m) => { try { return MediaRecorder.isTypeSupported(m) } catch { return false } })
  return ok || ''
}
const extFor = (mime) => (mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm')
const fmtClock = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

export default function VoiceRecorder({ language, maxSeconds = 90, onUse, onTypeInstead, disabled, className }) {
  const { t } = useT()
  // phase: idle | recording | uploading | review | used | error
  const [phase, setPhase] = useState('idle')
  const [elapsed, setElapsed] = useState(0)
  const [audioUrl, setAudioUrl] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [transcriptId, setTranscriptId] = useState(null)
  const [original, setOriginal] = useState('')
  const [error, setError] = useState(null) // {kind, message}
  const [busy, setBusy] = useState(false)

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
  const recRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const startRef = useRef(0)
  const fileRef = useRef(null)
  const durRef = useRef(0)
  const mountedRef = useRef(true)
  const discardRef = useRef(false)

  const stopStream = () => { streamRef.current?.getTracks().forEach((tr) => tr.stop()); streamRef.current = null }
  const clearTimer = () => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimer()
      discardRef.current = true
      try { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop() } catch { /* ignore */ }
      stopStream()
    }
  }, [])
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl) }, [audioUrl])

  const upload = useCallback(async (file, seconds) => {
    setPhase('uploading'); setError(null)
    try {
      const data = await transcribeAudio(file, language, seconds)
      if (!mountedRef.current) return
      const text = data?.text || ''
      setTranscript(text); setOriginal(text); setTranscriptId(data?.transcript_id ?? null)
      setPhase('review')
    } catch (e) {
      if (!mountedRef.current) return
      const status = e?.response?.status
      const kind = status === 503 ? 'unavailable' : 'upload'
      setError({ kind, message: errMsg(e, t('report.voice.failed', 'We could not turn the recording into text.')) })
      setPhase('error')
    }
  }, [language, t])

  const resetAudio = () => { setAudioUrl(null); fileRef.current = null; setTranscript(''); setOriginal(''); setTranscriptId(null); setElapsed(0) }

  const start = async () => {
    setError(null)
    if (!supported) { setError({ kind: 'unsupported', message: t('report.voice.unsupported', 'This browser cannot record audio.') }); setPhase('error'); return }
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      const n = e?.name
      const kind = n === 'NotAllowedError' || n === 'SecurityError' ? 'denied' : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'nomic' : 'other'
      const msg = kind === 'denied'
        ? t('report.voice.denied', 'Microphone permission was blocked. Allow the microphone in your browser settings, or type your complaint instead.')
        : kind === 'nomic'
          ? t('report.voice.nomic', 'No microphone was found on this device. You can type your complaint instead.')
          : t('report.voice.other', 'The microphone could not be started. Please try again or type your complaint.')
      setError({ kind, message: msg }); setPhase('error')
      return
    }
    streamRef.current = stream
    const mime = pickMime()
    let rec
    try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream) } catch {
      stopStream()
      setError({ kind: 'unsupported', message: t('report.voice.unsupported', 'This browser cannot record audio.') }); setPhase('error')
      return
    }
    recRef.current = rec
    chunksRef.current = []
    discardRef.current = false
    resetAudio()
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data) }
    rec.onstop = () => {
      clearTimer(); stopStream()
      if (discardRef.current || !mountedRef.current) return
      const type = (rec.mimeType || mime || 'audio/webm').split(';')[0]
      const blob = new Blob(chunksRef.current, { type })
      if (!blob.size) {
        setError({ kind: 'other', message: t('report.voice.empty', 'Nothing was recorded. Please try again.') }); setPhase('error'); return
      }
      const file = new File([blob], `complaint.${extFor(type)}`, { type })
      fileRef.current = file
      setAudioUrl(URL.createObjectURL(blob))
      upload(file, durRef.current)
    }
    startRef.current = Date.now()
    setElapsed(0); setPhase('recording')
    rec.start(1000)
    timerRef.current = setInterval(() => {
      const sec = (Date.now() - startRef.current) / 1000
      setElapsed(sec)
      if (sec >= maxSeconds) stop()
    }, 250)
  }

  function stop() {
    const sec = Math.min(maxSeconds, (Date.now() - startRef.current) / 1000)
    durRef.current = Math.max(1, Math.round(sec))
    clearTimer()
    try { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop() } catch { /* ignore */ }
  }

  const discard = () => {
    discardRef.current = true
    clearTimer()
    try { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop() } catch { /* ignore */ }
    stopStream(); resetAudio(); setError(null); setPhase('idle')
  }

  const use = async () => {
    const text = transcript.trim()
    if (text.length < 1) return
    setBusy(true)
    if (transcriptId && text !== original.trim()) { try { await confirmTranscript(transcriptId, text) } catch { /* ignore: citizen-approved text is still used */ } }
    setBusy(false)
    onUse?.({ text, transcriptId, language })
    setPhase('used')
  }

  const player = audioUrl && (
    <div className="w-full">
      <p className="mb-1 text-xs font-semibold text-muted">{t('report.voice.listen', 'Listen to your recording')}</p>
      <audio controls src={audioUrl} className="h-10 w-full" />
    </div>
  )
  const pct = Math.min(100, (elapsed / Math.max(1, maxSeconds)) * 100)

  // `my-auto` centres the recorder inside a flex-column card body and falls back to top-aligned when the content is taller.
  return (
    <div className={cn('my-auto flex w-full flex-col items-center gap-3 text-center', className)} aria-live="polite">
      {phase === 'idle' && (
        <>
          <button type="button" onClick={start} disabled={disabled} aria-label={t('report.speak.button', 'Speak your complaint')}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-saffron text-white shadow-[0_2px_6px_rgba(193,120,46,0.35)] transition-colors hover:bg-[#a96624] disabled:opacity-50">
            <Mic className="h-9 w-9" aria-hidden />
          </button>
          <p className="font-display text-[15px] font-bold text-ink">{t('report.speak.button', 'Speak your complaint')}</p>
          <p className="max-w-[260px] text-xs text-muted">{fill(t('report.speak.hint', 'Record up to {n} seconds. You can listen back and fix the words before using them.'), { n: maxSeconds })}</p>
          {!supported && <p className="text-xs font-medium text-high">{t('report.voice.unsupported', 'This browser cannot record audio.')}</p>}
        </>
      )}

      {phase === 'recording' && (
        <>
          <div className="relative flex h-20 w-20 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-critical/30" aria-hidden />
            <button type="button" onClick={stop} aria-label={t('report.voice.stop', 'Stop')}
              className="relative flex h-20 w-20 items-center justify-center rounded-full bg-critical text-white shadow-[0_2px_6px_rgba(185,74,72,0.35)] hover:bg-[#a13f3d]">
              <Square className="h-7 w-7 fill-current" aria-hidden />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="cl-pulse h-2.5 w-2.5 rounded-full bg-critical" aria-hidden />
            <span className="text-sm font-semibold text-critical">{t('report.voice.recording', 'Recording')}</span>
          </div>
          <span className="font-mono text-lg font-bold text-ink" aria-label="elapsed time">{fmtClock(elapsed)} / {fmtClock(maxSeconds)}</span>
          <div className="h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="h-full rounded-full bg-critical" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={stop}><Square className="h-3.5 w-3.5" aria-hidden /> {t('report.voice.stop', 'Stop')}</Button>
            <Button size="sm" variant="secondary" onClick={discard}><Trash2 className="h-4 w-4" aria-hidden /> {t('report.voice.discard', 'Discard')}</Button>
          </div>
        </>
      )}

      {phase === 'uploading' && (
        <div className="w-full space-y-3 rounded-[10px] border border-civic/30 bg-civic-50 p-3">
          <Spinner className="py-2" label={t('report.voice.uploading', 'Uploading for transcription...')} />
          {player}
        </div>
      )}

      {phase === 'review' && (
        <div className="w-full space-y-2.5 rounded-[10px] border border-line-strong bg-surface p-3 text-left">
          {player}
          <div>
            <label htmlFor="voice-transcript" className="mb-1 block text-[13px] font-semibold">{t('report.voice.transcript', 'Transcript (you can edit it)')}</label>
            <Textarea id="voice-transcript" rows={4} value={transcript} onChange={(e) => setTranscript(e.target.value)} maxLength={4000} />
            {!transcript.trim() && <p className="mt-1 text-xs text-high">{t('report.voice.blank', 'No words were detected. Please type what you said, or record again.')}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={use} loading={busy} disabled={!transcript.trim()}><Check className="h-4 w-4" aria-hidden /> {t('report.voice.use', 'Use this as my complaint')}</Button>
            <Button size="sm" variant="secondary" onClick={start}><RotateCcw className="h-4 w-4" aria-hidden /> {t('report.voice.rerecord', 'Record again')}</Button>
            <Button size="sm" variant="ghost" onClick={discard}><Trash2 className="h-4 w-4" aria-hidden /> {t('report.voice.discard', 'Discard')}</Button>
          </div>
        </div>
      )}

      {phase === 'used' && (
        <div className="w-full space-y-2 rounded-[10px] border border-success/30 bg-success-100 p-3">
          <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-success"><Check className="h-4 w-4" aria-hidden /> {t('report.voice.used', 'Your words were added to the description.')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="secondary" onClick={start}><RotateCcw className="h-4 w-4" aria-hidden /> {t('report.voice.rerecord', 'Record again')}</Button>
            <Button size="sm" variant="ghost" onClick={discard}><Trash2 className="h-4 w-4" aria-hidden /> {t('report.voice.discard', 'Discard')}</Button>
          </div>
        </div>
      )}

      {phase === 'error' && error && (
        <Notice tone={error.kind === 'unavailable' ? 'warning' : 'critical'} title={t('report.voice.problem', 'Voice recording problem')} className="w-full text-left">
          <p>{error.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {error.kind === 'upload' && fileRef.current && <Button size="sm" variant="secondary" onClick={() => upload(fileRef.current, durRef.current)}>{t('report.voice.retry', 'Try again')}</Button>}
            {error.kind !== 'unsupported' && error.kind !== 'unavailable' && error.kind !== 'nomic' && error.kind !== 'denied' && <Button size="sm" variant="secondary" onClick={discard}>{t('report.voice.rerecord', 'Record again')}</Button>}
            <Button size="sm" onClick={() => { discard(); onTypeInstead?.() }}><Keyboard className="h-4 w-4" aria-hidden /> {t('report.voice.typeinstead', 'Type instead')}</Button>
          </div>
        </Notice>
      )}
    </div>
  )
}
