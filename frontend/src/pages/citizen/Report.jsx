// "Report an issue" wizard (owner: REPORT-FLOW). One page, one reducer, five steps:
// describe -> location -> nearby reports -> AI review -> confirm & submit.
// Layout: ONE fixed-height panel on desktop (header + stepper, emergency strip, body that scrolls inside, pinned footer).
// Below lg it is a normal stacked, scrolling page. State machine / API calls are unchanged.
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, ClipboardList, Info, MapPin, PenLine, Send, ShieldAlert, Sparkles, Users } from 'lucide-react'
import { Button, IconTile, cn } from '../../components/ui'
import { useAuth } from '../../store/auth'
import { useMeta } from '../../store/meta'
import { useT, LANGS } from '../../lib/i18n'
import { errMsg } from '../../lib/api'
import { MAX_TEXT, MIN_TEXT, createComplaint, duplicateCheck, fill, inputSignature, previewComplaint } from '../../features/report/api'
import { LANG_CODES, STEPS, initState, readPrefill, reducer } from '../../features/report/state'
import useLocationLookups from '../../features/report/useLocationLookups'
import StepDescribe from '../../features/report/StepDescribe'
import StepLocation from '../../features/report/StepLocation'
import StepNearby from '../../features/report/StepNearby'
import StepReview from '../../features/report/StepReview'
import { StepSubmit, Success, submitError, submitLabel } from '../../features/report/StepSubmit'

const STEP_ICONS = [PenLine, MapPin, Users, Sparkles, Send]

/** Compact horizontal stepper: icon circles with done / current / upcoming states and connecting lines. */
function Stepper({ step, maxStep, labels, onJump }) {
  const { t } = useT()
  return (
    <nav aria-label={t('report.stepper', 'Report steps')} className="min-w-0 flex-1">
      <p className="mb-1.5 text-[13px] font-semibold text-forest md:hidden">
        {fill(t('report.step_of', 'Step {n} of {total}'), { n: step + 1, total: labels.length })}: {labels[step]}
      </p>
      <ol className="flex items-center">
        {labels.map((label, i) => {
          const done = i < step
          const cur = i === step
          const Icon = STEP_ICONS[i]
          const last = i === labels.length - 1
          return (
            <li key={label} className={cn('flex min-w-0 items-center', !last && 'flex-1')}>
              <button type="button" disabled={!done || i > maxStep} onClick={() => onJump(i)} aria-current={cur ? 'step' : undefined} title={label}
                className={cn('flex shrink-0 items-center gap-2 rounded-full border p-0.5 transition-colors md:pr-3',
                  cur ? 'border-forest/25 bg-forest-50' : 'border-transparent', done ? 'cursor-pointer hover:bg-forest-50' : 'cursor-default')}>
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold',
                  cur ? 'border-forest bg-forest text-white' : done ? 'border-forest/30 bg-forest-100 text-forest' : 'border-line-strong bg-paper text-muted')}>
                  {done ? <Check className="h-4 w-4" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
                </span>
                <span className={cn('whitespace-nowrap text-[13px] font-semibold', cur ? 'hidden text-ink md:inline' : 'hidden text-muted lg:inline')}>{label}</span>
              </button>
              {!last && <span className={cn('mx-2 h-px min-w-3 flex-1', done ? 'bg-forest' : 'bg-line-strong')} aria-hidden />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default function Report() {
  const { t, lang: uiLang } = useT()
  const user = useAuth((x) => x.user)
  const meta = useMeta((x) => x.meta)
  const catName = useMeta((x) => x.categoryName)
  const subName = useMeta((x) => x.subcategoryName)
  const navigate = useNavigate()
  const { search } = useLocation()
  const prefill = useMemo(() => readPrefill(search), [search])

  const [s, dispatch] = useReducer(reducer, null, () => {
    const pref = user?.preferred_language
    const language = LANG_CODES.includes(pref) ? pref : LANG_CODES.includes(uiLang) ? uiLang : 'en'
    return initState(language, prefill)
  })
  const set = useCallback((patch) => dispatch({ type: 'set', patch }), [])
  const rootRef = useRef(null)
  const toTop = useCallback(() => { window.scrollTo?.({ top: 0 }); rootRef.current?.scrollIntoView?.({ block: 'start' }) }, [])
  const goto = useCallback((step) => { dispatch({ type: 'goto', step }); toTop() }, [toTop])

  const sRef = useRef(s)
  sRef.current = s
  const inflight = useRef({ dup: null, preview: null })
  const submitting = useRef(false)

  useLocationLookups(s, set)

  // Release photo preview URLs when leaving the page.
  useEffect(() => () => { sRef.current.images.forEach((i) => URL.revokeObjectURL(i.url)) }, [])

  const sig = s.step >= 2 && s.loc ? inputSignature(s) : null

  /* ---- step 3: duplicate check ---- */
  const runDup = useCallback(async () => {
    const cur = sRef.current
    const key = inputSignature(cur)
    inflight.current.dup = key
    set({ dup: { status: 'loading', key, data: null, error: null, choice: null, unsure: false } })
    try {
      const data = await duplicateCheck(cur, { category: prefill?.category, subcategory: prefill?.subcategory })
      if (inflight.current.dup !== key) return
      set((x) => ({ dup: { ...x.dup, status: 'done', key, data } }))
    } catch (e) {
      if (inflight.current.dup !== key) return
      set((x) => ({ dup: { ...x.dup, status: 'error', key, error: errMsg(e, t('report.dup.failed', 'The similar-report check failed.')) } }))
    }
  }, [set, prefill, t])

  /* ---- step 4: AI preview ---- */
  const runPreview = useCallback(async () => {
    const cur = sRef.current
    const key = inputSignature(cur)
    inflight.current.preview = key
    set({ preview: { status: 'loading', key, data: null, error: null } })
    try {
      const data = await previewComplaint(cur)
      if (inflight.current.preview !== key) return
      set({ preview: { status: 'done', key, data, error: null } })
    } catch (e) {
      if (inflight.current.preview !== key) return
      set({ preview: { status: 'error', key, data: null, error: submitError(e, t) } })
    }
  }, [set, t])

  useEffect(() => {
    if (s.step === 2 && sig && s.dup.key !== sig && inflight.current.dup !== sig) runDup()
    if (s.step === 3 && sig && s.preview.key !== sig && inflight.current.preview !== sig) runPreview()
  }, [s.step, sig, s.dup.key, s.preview.key, runDup, runPreview])

  /* ---- navigation ---- */
  const len = s.text.trim().length
  const area = s.area.data
  const outside = !!area && (area.service_area_status === 'outside_service_area' || area.inside_service_area === false)
  const dupMatches = Array.isArray(s.dup.data?.matches) ? s.dup.data.matches : []
  const chosen = s.dup.choice

  const canNext = (() => {
    if (s.step === 0) return len >= MIN_TEXT && len <= MAX_TEXT
    if (s.step === 1) return !!s.loc && s.loc.confirmed && (!outside || s.outsideAck)
    if (s.step === 2) return s.dup.status === 'done' && dupMatches.length === 0
    if (s.step === 3) return s.preview.status === 'done' || s.preview.status === 'error'
    return false
  })()

  const next = () => {
    if (!canNext) return
    if (s.step === 2) set((x) => ({ dup: { ...x.dup, choice: null } }))
    goto(s.step + 1)
  }
  const back = () => {
    if (s.step === 4 && (chosen?.action === 'follow' || chosen?.action === 'add_evidence')) return goto(2)
    goto(Math.max(0, s.step - 1))
  }
  const choose = (c) => {
    set((x) => ({ dup: { ...x.dup, choice: c } }))
    goto(c.action === 'new' ? 3 : 4)
  }

  const submit = async () => {
    if (submitting.current) return
    submitting.current = true
    set({ submit: { status: 'loading', error: null, result: null } })
    try {
      const data = await createComplaint(sRef.current)
      set({ submit: { status: 'done', error: null, result: data } })
      toTop()
    } catch (e) {
      set({ submit: { status: 'error', error: submitError(e, t), result: null } })
    } finally {
      submitting.current = false
    }
  }

  const another = () => {
    s.images.forEach((i) => URL.revokeObjectURL(i.url))
    dispatch({ type: 'reset', state: initState(s.language, null) })
    if (search) navigate('/app/report', { replace: true })
    toTop()
  }

  const labels = [
    t('report.step.describe', 'Describe'),
    t('report.step.location', 'Location'),
    t('report.step.nearby', 'Nearby reports'),
    t('report.step.review', 'AI review'),
    t('report.step.submit', 'Submit'),
  ]
  const titles = [
    t('report.title.describe', 'Tell us what is wrong'),
    t('report.title.location', 'Where is the issue?'),
    t('report.title.nearby', 'Similar reports nearby'),
    t('report.prev.title', 'Review before you submit'),
    t('report.title.submit', 'Confirm and submit'),
  ]

  const emergency = meta?.emergency_notice || t('report.emergency', 'If someone is in immediate danger, call your local emergency service. CivicLens is not an emergency service.')

  const bannerText = prefill && (prefill.bin
    ? fill(t('report.prefill.banner_bin', 'Reporting an overflowing bin near {bin}'), { bin: prefill.bin })
    : prefill.category
      ? fill(t('report.prefill.banner_cat', 'Reporting: {cat}'), { cat: [catName(prefill.category), prefill.subcategory && subName(prefill.category, prefill.subcategory)].filter(Boolean).join(' / ') })
      : null)

  if (s.submit.status === 'done') {
    return (
      <div ref={rootRef} className="mx-auto flex min-h-full w-full max-w-3xl flex-col lg:h-full lg:min-h-0">
        <Success result={s.submit.result} onAnother={another} />
      </div>
    )
  }

  const hint = s.step === 0 && len < MIN_TEXT
    ? (s.images.length ? t('report.photo.needtext', 'A photo on its own is not enough. Please also type or say a few words so we know what the problem is.') : t('report.type.min', 'Please write at least 5 characters.'))
    : s.step === 1 && s.loc && !s.loc.confirmed ? t('report.loc.confirm_first', 'Confirm the location to continue.')
      : s.step === 1 && !s.loc ? t('report.loc.pin_needed', 'Place a pin on the map to continue.')
        : s.step === 1 && outside && !s.outsideAck ? t('report.loc.ack_first', 'Adjust the pin, or tick the box to continue anyway.') : ''

  /* mini summary shown in the pinned footer (what the citizen has so far) */
  const langLabel = LANGS.find((l) => l.code === s.language)?.label || s.language
  const tri = s.preview.data?.triage
  const summary = (() => {
    if (s.step === 0) return [langLabel, `${len} / ${MAX_TEXT}`, s.images.length ? `${s.images.length} ${t('report.input.photo', 'Photo').toLowerCase()}` : ''].filter(Boolean).join(' · ')
    if (s.step === 1) return s.loc ? (s.locality || s.address || `${s.loc.lat.toFixed(4)}, ${s.loc.lng.toFixed(4)}`) : ''
    if (s.step === 2) {
      if (s.dup.status !== 'done') return ''
      return dupMatches.length ? fill(t('report.dup.n_found', '{n} similar report(s) nearby'), { n: dupMatches.length }) : t('report.dup.none', 'No similar reports found nearby')
    }
    if (s.step === 3) return s.preview.status === 'done' && tri ? [tri.severity && tri.severity.charAt(0).toUpperCase() + tri.severity.slice(1), s.preview.data.category_name || tri.category].filter(Boolean).join(' · ') : ''
    return t('report.sub.ready', 'Ready to submit')
  })()

  const busy = s.submit.status === 'loading'
  const showNext = s.step < 4 && (s.step !== 2 || (s.dup.status === 'done' && dupMatches.length === 0))

  return (
    <div ref={rootRef} className="mx-auto flex min-h-full w-full max-w-6xl flex-col lg:h-full lg:min-h-0">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(36,76,57,0.05)]">
        {/* fixed top strip: title + stepper */}
        <header className="shrink-0 border-b border-line px-4 py-2.5">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-6">
            <div className="flex min-w-0 items-center gap-2.5 lg:w-60 lg:shrink-0">
              <IconTile icon={ClipboardList} tone="forest" />
              <div className="min-w-0">
                <h1 className="font-display text-[17px] font-extrabold leading-tight text-ink">{t('report.title', 'Report an issue')}</h1>
                {bannerText ? (
                  <span className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded-full border border-civic/20 bg-civic-50 px-2 py-0.5 text-[11px] font-semibold text-civic">
                    <Info className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{bannerText}</span>
                  </span>
                ) : (
                  <p className="truncate text-xs text-muted" title={t('report.subtitle', 'Tell us what is wrong and where. We will help find the right team.')}>{t('report.subtitle', 'Tell us what is wrong and where. We will help find the right team.')}</p>
                )}
              </div>
            </div>
            <Stepper step={s.step} maxStep={s.maxStep} labels={labels} onJump={goto} />
          </div>
        </header>

        {/* slim emergency strip */}
        <div role="note" className="flex shrink-0 items-center gap-2 border-b border-critical/20 bg-critical-100 px-4 py-1.5 text-xs leading-snug text-ink">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-critical" aria-hidden />
          <p>{emergency}</p>
        </div>

        {/* body: fills the remaining height; each step scrolls its own panes */}
        <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4 lg:overflow-hidden">
          {STEPS[s.step] === 'describe' && <StepDescribe s={s} set={set} meta={meta} prefill={prefill} title={titles[0]} />}
          {STEPS[s.step] === 'location' && <StepLocation s={s} set={set} meta={meta} title={titles[1]} />}
          {STEPS[s.step] === 'nearby' && <StepNearby s={s} set={set} onChoose={choose} onRetry={runDup} onNewAnyway={() => choose({ action: 'new', reason: '' })} title={titles[2]} />}
          {STEPS[s.step] === 'review' && <StepReview s={s} onRetry={runPreview} title={titles[3]} />}
          {STEPS[s.step] === 'submit' && <StepSubmit s={s} goto={goto} title={titles[4]} />}
        </div>

        {/* pinned footer: Back / mini summary / Next or Submit */}
        <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-paper px-4 py-2.5">
          <Button variant="secondary" onClick={back} disabled={s.step === 0 || busy}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> {t('report.back', 'Back')}
          </Button>
          <div className="order-first min-w-0 basis-full text-[13px] sm:order-none sm:basis-auto sm:flex-1" aria-live="polite">
            {hint && !canNext && s.step < 4 ? (
              <p className="flex items-center gap-1.5 font-medium text-ink"><Info className="h-4 w-4 shrink-0 text-civic" aria-hidden /><span className="sm:truncate" title={hint}>{hint}</span></p>
            ) : summary ? (
              <p className="text-muted sm:truncate" title={summary}>{summary}</p>
            ) : null}
          </div>
          {showNext && (
            <Button onClick={next} disabled={!canNext}>
              {t('report.next', 'Next')} <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
          {s.step === 4 && (
            <Button onClick={submit} loading={busy} disabled={busy}>
              {submitLabel(s, t)} {!busy && <Send className="h-4 w-4" aria-hidden />}
            </Button>
          )}
        </footer>
      </section>
    </div>
  )
}
