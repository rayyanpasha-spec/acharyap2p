import { useState } from 'react'
import { ArrowRight, Check, CheckCircle2, ExternalLink, HelpCircle, Plus, SearchCheck, UserCheck, Users } from 'lucide-react'
import { Badge, Button, CategoryChip, IconTile, Spinner, StatusBadge, Textarea, cn } from '../../components/ui'
import { useT } from '../../lib/i18n'
import { useMeta } from '../../store/meta'
import { fmtDistance } from '../../lib/format'
import { fill } from './api'
import { Callout, MiniCard, StepHead } from './parts'

/** One selectable existing report (radio card). */
function MatchItem({ m, active, onSelect }) {
  const { t } = useT()
  const catName = useMeta((x) => x.categoryName)
  const subName = useMeta((x) => x.subcategoryName)
  const mine = !!m.same_reporter
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onSelect}
      className={cn('flex w-full items-start gap-3 rounded-[14px] border p-3 text-left transition-colors',
        active ? 'border-forest bg-forest-50 shadow-[0_0_0_1px_var(--color-forest)]' : 'border-line bg-surface hover:border-line-strong hover:bg-paper')}>
      <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', active ? 'border-forest bg-forest text-white' : 'border-line-strong bg-surface')} aria-hidden>
        {active && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-sm font-bold text-ink">{m.ticket_number}</span>
          <StatusBadge status={m.status} />
          {mine && <Badge tone="forest">{t('report.dup.mine', 'You reported this')}</Badge>}
          {m.supporting_count > 0 && <Badge tone="civic">{fill(t('report.dup.supporting', '{n} supporting'), { n: m.supporting_count })}</Badge>}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <CategoryChip category={m.category} label={[catName(m.category), m.subcategory && subName(m.category, m.subcategory)].filter(Boolean).join(' / ')} />
          {m.distance_m != null && <span className="text-muted">{fill(t('report.dup.away', '{d} away'), { d: fmtDistance(m.distance_m) })}</span>}
          {m.locality && <span className="text-muted">{m.locality}</span>}
        </span>
        {m.summary && <span className="line-clamp-2 block text-[13px] text-ink/90">{m.summary}</span>}
      </span>
    </button>
  )
}

/** A radio option in the action column. */
function Choice({ icon, tone, active, disabled, title, hint, onClick }) {
  return (
    <button type="button" role="radio" aria-checked={active} disabled={disabled} onClick={onClick}
      className={cn('flex w-full items-start gap-2.5 rounded-[10px] border p-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        active ? 'border-forest bg-forest-50 shadow-[0_0_0_1px_var(--color-forest)]' : 'border-line-strong bg-surface hover:bg-paper')}>
      <IconTile icon={icon} tone={tone} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
      <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', active ? 'border-forest bg-forest' : 'border-line-strong')} aria-hidden>
        {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
    </button>
  )
}

function Centered({ children }) {
  return <div className="flex min-h-[200px] flex-1 items-center justify-center"><div className="w-full max-w-lg">{children}</div></div>
}

export default function StepNearby({ s, set, onChoose, onRetry, onNewAnyway, title }) {
  const { t } = useT()
  const { status, data, error, unsure, choice } = s.dup
  const matches = Array.isArray(data?.matches) ? data.matches : []
  const [selTicket, setSelTicket] = useState(null)
  const [picked, setPicked] = useState(null) // 'follow' | 'add_evidence' | 'new' (null = not chosen yet)
  const [reason, setReason] = useState('')

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <StepHead title={title} />
        <Centered><Spinner label={t('report.dup.checking', 'Looking for similar reports nearby...')} /></Centered>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <StepHead title={title} />
        <Centered>
          <Callout tone="warning" role="alert" title={t('report.dup.error_title', 'We could not check for similar reports')}>
            <p>{error}</p>
            <p className="mt-1 text-muted">{t('report.dup.error_body', 'You can still continue and submit a new report.')}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={onRetry}>{t('report.retry', 'Try again')}</Button>
              <Button size="sm" onClick={onNewAnyway}>{t('report.dup.continue_new', 'Continue with a new report')}</Button>
            </div>
          </Callout>
        </Centered>
      </div>
    )
  }
  if (!matches.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <StepHead title={title} />
        <Centered>
          <div className="flex flex-col items-center gap-2 rounded-[14px] border border-success/30 bg-success-100 px-6 py-8 text-center">
            <IconTile icon={SearchCheck} tone="success" size="lg" />
            <p className="font-display text-[16px] font-bold text-ink">{t('report.dup.none', 'No similar reports found nearby')}</p>
            <p className="text-sm text-ink/90">{t('report.dup.none_body', 'Nothing close to this spot matches your description, so this will be a new report.')}</p>
          </div>
        </Centered>
      </div>
    )
  }

  const sel = matches.find((m) => m.ticket_number === selTicket) || matches.find((m) => m.same_reporter) || matches[0]
  const mine = !!sel.same_reporter
  const savedForSel = choice && (choice.action === 'new' || choice.ticket === sel.ticket_number) ? choice.action : null
  const cur = picked ?? savedForSel ?? (mine ? 'add_evidence' : null)
  const canGo = !!cur && !(cur === 'follow' && sel.i_follow)

  const go = () => {
    if (!canGo) return
    if (cur === 'new') onChoose({ action: 'new', reason })
    else onChoose({ action: cur, ticket: sel.ticket_number })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StepHead title={title} subtitle={t('report.dup.intro', 'We found earlier reports close to the location you selected. You are free to continue with a new report - nothing is blocked.')}
        right={<Badge tone="civic">{matches.length} {t('report.dup.count', 'similar')}</Badge>} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_350px] lg:grid-rows-[minmax(0,1fr)]">
        {/* LEFT: matching reports (scrolls inside) */}
        <div role="radiogroup" aria-label={t('report.dup.title', 'You may have reported this issue before')} className="flex min-h-0 flex-col gap-2 lg:overflow-y-auto lg:pr-1">
          {matches.map((m) => (
            <MatchItem key={m.ticket_number} m={m} active={m.ticket_number === sel.ticket_number}
              onSelect={() => { setSelTicket(m.ticket_number); setPicked(null) }} />
          ))}
        </div>

        {/* RIGHT: what to do with the selected report */}
        <MiniCard icon={Users} tone="civic" title={t('report.dup.what', 'What would you like to do?')} bodyClassName="flex flex-col gap-2.5 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm font-bold text-ink">{sel.ticket_number}</span>
            <Button as="a" size="sm" variant="secondary" href={`/app/complaints/${sel.ticket_number}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden /> {t('report.dup.view', 'View existing report')}
            </Button>
          </div>

          <div role="radiogroup" aria-label={t('report.dup.what', 'What would you like to do?')} className="flex flex-col gap-2">
            <Choice icon={Users} tone="civic" active={cur === 'follow'} disabled={!!sel.i_follow} onClick={() => setPicked('follow')}
              title={sel.i_follow ? t('report.dup.following', 'You already follow this report') : t('report.dup.follow', 'Follow this report')} />
            <Choice icon={UserCheck} tone="forest" active={cur === 'add_evidence'} onClick={() => setPicked('add_evidence')}
              title={mine ? t('report.dup.continue_existing', 'Continue existing report') : t('report.dup.add', 'Add photo or information')}
              hint={mine ? t('report.dup.recommended', 'Recommended: continue your existing report instead of creating a second ticket.') : t('report.dup.add_hint', 'Your description and photos will be added to that report instead of creating a new ticket.')} />
            <Choice icon={Plus} tone="saffron" active={cur === 'new'} onClick={() => setPicked('new')}
              title={t('report.dup.different', 'This is a different issue - continue')} />
          </div>

          {cur === 'new' && (
            <div className="space-y-1.5">
              <label htmlFor="dup-reason" className="block text-[13px] font-semibold text-ink">{t('report.dup.reason', 'Why is it different? (optional)')}</label>
              <Textarea id="dup-reason" className="min-h-[72px]" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)}
                placeholder={t('report.dup.reason_ph', 'For example: a new pothole a few metres further down the road')} />
            </div>
          )}

          <div className="mt-auto space-y-2 pt-1">
            {unsure && <Callout tone="forest">{t('report.dup.unsure_note', 'Take your time. Open the existing report in a new tab to review it, then come back and choose.')}</Callout>}
            {savedForSel && <p className="flex items-center gap-1.5 text-[13px] font-semibold text-success"><CheckCircle2 className="h-4 w-4" aria-hidden /> {t('report.dup.chosen', 'Your choice is saved.')}</p>}
            <Button className="w-full" onClick={go} disabled={!canGo}>
              {cur === 'new' ? t('report.dup.new_btn', 'Continue with a new report') : t('report.next', 'Next')} <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            <button type="button" onClick={() => set((c) => ({ dup: { ...c.dup, unsure: true } }))}
              className="inline-flex min-h-9 items-center gap-1.5 text-[13px] font-semibold text-civic hover:underline">
              <HelpCircle className="h-4 w-4" aria-hidden /> {t('report.dup.unsure', 'Not sure')}
            </button>
          </div>
        </MiniCard>
      </div>
    </div>
  )
}
