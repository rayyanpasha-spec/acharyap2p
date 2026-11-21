// "Report an issue" wizard (owner: REPORT-FLOW). One page, one reducer, five steps:
// describe -> location -> nearby reports -> AI review -> confirm & submit.
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Info, ShieldAlert } from 'lucide-react'
import { Button, Notice, PageHeader } from '../../components/ui'
import { useAuth } from '../../store/auth'
import { useMeta } from '../../store/meta'
import { useT } from '../../lib/i18n'
import { errMsg } from '../../lib/api'
import { MAX_TEXT, MIN_TEXT, createComplaint, duplicateCheck, fill, inputSignature, previewComplaint } from '../../features/report/api'
import { LANG_CODES, STEPS, initState, readPrefill, reducer } from '../../features/report/state'
import useLocationLookups from '../../features/report/useLocationLookups'
import StepDescribe from '../../features/report/StepDescribe'
import StepLocation from '../../features/report/StepLocation'
import StepNearby from '../../features/report/StepNearby'
import StepReview from '../../features/report/StepReview'
import { StepSubmit, Success, submitError } from '../../features/report/StepSubmit'

function Stepper({ step, maxStep, labels, onJump }) {
  const { t } = useT()
  return (
    <nav aria-label={t('report.stepper', 'Report steps')} className="mb-5">
      <p className="mb-2 text-sm font-semibold text-forest sm:hidden">
        {fill(t('report.step_of', 'Step {n} of {total}'), { n: step + 1, total: labels.length })}: {labels[step]}
      </p>
      <ol className="flex items-center gap-1.5">
        {labels.map((label, i) => {
          const done = i < step
          const cur = i === step
          return (
            <li key={label} className="flex flex-1 items-center gap-1.5">
              <button type="button" disabled={!done || i > maxStep} onClick={() => onJump(i)} aria-current={cur ? 'step' : undefined}
                className={`flex min-h-10 items-center gap-2 rounded-full ${done ? 'cursor-pointer' : 'cursor-default'}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${cur ? 'border-forest bg-forest text-white' : done ? 'border-forest bg-forest-100 text-forest' : 'border-line-strong bg-surface text-muted'}`}>
                  {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                </span>
                <span className={`hidden text-sm font-semibold sm:inline ${cur ? 'text-ink' : 'text-muted'}`}>{label}</span>
              </button>
              {i < labels.length - 1 && <span className={`h-px flex-1 ${done ? 'bg-forest' : 'bg-line-strong'}`} aria-hidden />}
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
  const goto = useCallback((step) => { dispatch({ type: 'goto', step }); window.scrollTo?.({ top: 0 }) }, [])

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
      window.scrollTo?.({ top: 0 })
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
    window.scrollTo?.({ top: 0 })
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
      <div className="mx-auto max-w-2xl">
        <Success result={s.submit.result} onAnother={another} />
      </div>
    )
  }

  const hint = s.step === 0 && len < MIN_TEXT
    ? (s.images.length ? t('report.photo.needtext', 'A photo on its own is not enough. Please also type or say a few words so we know what the problem is.') : t('report.type.min', 'Please write at least 5 characters.'))
    : s.step === 1 && s.loc && !s.loc.confirmed ? t('report.loc.confirm_first', 'Confirm the location to continue.')
      : s.step === 1 && !s.loc ? t('report.loc.pin_needed', 'Place a pin on the map to continue.')
        : s.step === 1 && outside && !s.outsideAck ? t('report.loc.ack_first', 'Adjust the pin, or tick the box to continue anyway.') : ''

  return (
    <div className="mx-auto max-w-4xl pb-6">
      <PageHeader title={t('report.title', 'Report an issue')} subtitle={t('report.subtitle', 'Tell us what is wrong and where. We will help find the right team.')} />

      <div className="mb-4 flex items-start gap-2 rounded-[10px] border border-critical/25 bg-critical-100 px-3 py-2.5 text-sm" role="note">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden />
        <p>{emergency}</p>
      </div>

      {bannerText && (
        <Notice tone="civic" className="mb-4">
          <p className="flex items-center gap-2"><Info className="h-4 w-4 shrink-0 text-civic" aria-hidden />{bannerText}</p>
        </Notice>
      )}

      <Stepper step={s.step} maxStep={s.maxStep} labels={labels} onJump={goto} />

      <h2 className="mb-3 font-display text-lg font-bold">{titles[s.step]}</h2>

      <div>
        {STEPS[s.step] === 'describe' && <StepDescribe s={s} set={set} meta={meta} prefill={prefill} />}
        {STEPS[s.step] === 'location' && <StepLocation s={s} set={set} meta={meta} />}
        {STEPS[s.step] === 'nearby' && <StepNearby s={s} set={set} onChoose={choose} onRetry={runDup} onNewAnyway={() => choose({ action: 'new', reason: '' })} />}
        {STEPS[s.step] === 'review' && <StepReview s={s} onRetry={runPreview} />}
        {STEPS[s.step] === 'submit' && <StepSubmit s={s} goto={goto} onSubmit={submit} />}
      </div>

      {s.step < 4 && (
        <div className="sticky bottom-0 -mx-4 mt-6 border-t border-line bg-paper px-4 py-3 sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
          {hint && !canNext && <p className="mb-2 text-sm text-muted">{hint}</p>}
          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" size="lg" onClick={back} disabled={s.step === 0}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> {t('report.back', 'Back')}
            </Button>
            {(s.step !== 2 || (s.dup.status === 'done' && dupMatches.length === 0)) && (
              <Button size="lg" onClick={next} disabled={!canNext}>
                {t('report.next', 'Next')} <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        </div>
      )}
      {s.step === 4 && (
        <div className="mt-4">
          <Button variant="secondary" size="lg" onClick={back} disabled={s.submit.status === 'loading'}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> {t('report.back', 'Back')}
          </Button>
        </div>
      )}
    </div>
  )
}
