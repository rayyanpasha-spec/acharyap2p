// "Waking up the server" card. Shown while the free-tier backend boots (see lib/wake.js). Pops up over the page with a
// small animated server (sleeping "z"s, blinking lights), an elapsed timer, honest step states and rotating civic tips.
import { useEffect, useState } from 'react'
import { Check, CircleAlert, Loader2, RefreshCw } from 'lucide-react'
import { useServer, continueAnyway, retryWake } from '../lib/wake'
import { LogoMark } from './Logo'
import { useT } from '../lib/i18n'
import { cn } from './ui'

const TIPS = [
  ['wake.tip1', 'You can report an issue in Kannada, English, Hindi, Tamil, Telugu or Malayalam.'],
  ['wake.tip2', 'Add a photo and a few words. AI suggests the category and the right department.'],
  ['wake.tip3', 'No time to type? Speak your complaint and CivicLens will write it down for you.'],
  ['wake.tip4', 'Reports that are resolved and verified earn certificates, points and rewards.'],
  ['wake.tip5', 'City in Motion shows complaints and the (simulated) CleanRoute trucks on a 3D map.'],
]

function Server({ ready }) {
  return (
    <div className="relative mx-auto flex h-28 w-28 items-center justify-center" aria-hidden>
      {!ready && <>
        <span className="cl-ring absolute inset-0 rounded-full bg-saffron/25" />
        <span className="cl-ring absolute inset-0 rounded-full bg-civic/20" style={{ animationDelay: '0.9s' }} />
      </>}
      <svg viewBox="0 0 96 96" className={cn('relative h-24 w-24', ready ? 'cl-pop-ok' : 'cl-bob')}>
        <rect x="14" y="14" width="68" height="22" rx="7" fill="#244c39" />
        <rect x="14" y="40" width="68" height="22" rx="7" fill="#2d5e47" />
        <rect x="14" y="66" width="68" height="16" rx="7" fill="#244c39" />
        {[
          [26, 25, '#f2b678'], [26, 51, '#8fb8dc'], [26, 74, '#9bd0b0'],
        ].map(([x, y, c], i) => (
          <circle key={i} cx={x} cy={y} r="3.6" fill={ready ? '#9bd0b0' : c} className={ready ? '' : 'cl-led'} style={{ animationDelay: `${i * 0.35}s` }} />
        ))}
        <rect x="40" y="22" width="30" height="6" rx="3" fill="#e3ede6" opacity=".85" />
        <rect x="40" y="48" width="22" height="6" rx="3" fill="#e3ede6" opacity=".85" />
        <rect x="40" y="72" width="26" height="4" rx="2" fill="#e3ede6" opacity=".7" />
      </svg>
      {!ready && ['z', 'Z', 'z'].map((z, i) => (
        <span key={i} className="cl-zzz absolute font-display text-lg font-extrabold text-saffron" style={{ right: 4 + i * 6, top: 6, animationDelay: `${i * 0.8}s` }}>{z}</span>
      ))}
      {ready && <span className="absolute -right-1 -top-1 flex h-9 w-9 items-center justify-center rounded-full bg-success text-white shadow"><Check className="h-5 w-5" strokeWidth={3} /></span>}
    </div>
  )
}

function Step({ state, children }) {
  return (
    <li className="flex items-center gap-2.5 text-[13px]">
      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
        state === 'done' ? 'bg-success text-white' : state === 'active' ? 'bg-saffron-100 text-saffron' : 'bg-line text-muted')}>
        {state === 'done' ? <Check className="h-3 w-3" strokeWidth={3} /> : state === 'active' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </span>
      <span className={cn(state === 'pending' ? 'text-muted' : 'font-medium text-ink')}>{children}</span>
    </li>
  )
}

export default function ServerWakeCard() {
  const { t } = useT()
  const status = useServer((s) => s.status)
  const startedAt = useServer((s) => s.startedAt)
  const [now, setNow] = useState(() => Date.now())
  const [tip, setTip] = useState(0)

  const visible = status === 'waking' || status === 'failed' || status === 'awake'
  useEffect(() => {
    if (status !== 'waking') return undefined
    const a = setInterval(() => setNow(Date.now()), 1000)
    const b = setInterval(() => setTip((x) => (x + 1) % TIPS.length), 6000)
    return () => { clearInterval(a); clearInterval(b) }
  }, [status])
  if (!visible) return null

  const failed = status === 'failed'
  const ready = status === 'awake'
  const secs = Math.max(0, Math.round((now - startedAt) / 1000))
  const [tk, tf] = TIPS[tip]

  return (
    <div className="cl-fade fixed inset-0 z-[200] flex overflow-y-auto bg-[rgba(20,32,26,0.5)] p-4 backdrop-blur-[3px]">
      <div role="dialog" aria-modal="true" aria-live="polite" aria-label={t('wake.title', 'Waking up the server')}
        className="cl-card m-auto w-full max-w-[420px] overflow-hidden rounded-[22px] border border-line bg-surface shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between border-b border-line bg-paper px-5 py-3">
          <span className="inline-flex items-center gap-2"><LogoMark className="h-7 w-7" /><span className="font-display text-[15px] font-extrabold text-forest">Civic<span className="text-saffron">Lens</span></span></span>
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', failed ? 'bg-critical-100 text-critical' : ready ? 'bg-success-100 text-success' : 'bg-saffron-100 text-saffron')}>
            {failed ? t('wake.badge_failed', 'No answer') : ready ? t('wake.badge_ready', 'Awake') : t('wake.badge_waking', 'Starting up')}
          </span>
        </div>

        <div className="px-6 pb-6 pt-5 text-center">
          {failed ? (
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-critical-100 text-critical"><CircleAlert className="h-10 w-10" aria-hidden /></span>
          ) : <Server ready={ready} />}

          <h2 className="mt-3 font-display text-[22px] font-extrabold leading-tight text-ink">
            {failed ? t('wake.failed_title', 'The server is not answering yet')
              : ready ? t('wake.ready_title', 'The server is awake!') : t('wake.title', 'Waking up the server')}
          </h2>
          <p className="mx-auto mt-2 max-w-[340px] text-[14px] leading-relaxed text-muted">
            {failed ? t('wake.failed_body', 'It is taking longer than usual. Check your internet connection and try again.')
              : ready ? t('wake.ready_body', 'Thanks for waiting. Opening CivicLens now.')
                : t('wake.body', 'CivicLens runs on a free hosting plan, so the server naps when nobody is using it. Waking it up takes about 30 to 60 seconds, only the first time.')}
          </p>

          {!failed && (
            <>
              <div className="mx-auto mt-4 h-2 w-full max-w-[300px] overflow-hidden rounded-full bg-forest-100" role="progressbar" aria-label={t('wake.progress', 'Waiting for the server')}>
                {ready ? <div className="h-full w-full rounded-full bg-success" /> : <div className="cl-slide h-full w-2/5 rounded-full bg-saffron" />}
              </div>
              <p className="mt-2 text-xs font-semibold tabular-nums text-muted">
                {ready ? t('wake.done_in', 'Ready') : `${t('wake.waiting', 'Waiting')} ${secs} s`}
              </p>

              <ul className="mx-auto mt-4 w-full max-w-[300px] space-y-2 text-left">
                <Step state="done">{t('wake.s1', 'Request sent to the server')}</Step>
                <Step state={ready ? 'done' : 'active'}>{t('wake.s2', 'Server is starting up')}</Step>
                <Step state={ready ? 'active' : 'pending'}>{t('wake.s3', 'Opening CivicLens')}</Step>
              </ul>

              {!ready && (
                <div key={tip} className="cl-fade mt-5 rounded-[12px] border border-civic/15 bg-civic-50 px-3.5 py-2.5 text-left">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-civic">{t('wake.didyouknow', 'While you wait')}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-ink">{t(tk, tf)}</p>
                </div>
              )}
            </>
          )}

          {failed && (
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button type="button" onClick={retryWake} className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-forest px-4 text-sm font-semibold text-white hover:bg-forest-600">
                <RefreshCw className="h-4 w-4" aria-hidden />{t('wake.retry', 'Try again')}
              </button>
              <button type="button" onClick={continueAnyway} className="inline-flex h-10 items-center justify-center rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-paper">
                {t('wake.continue', 'Continue anyway')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
