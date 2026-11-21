import { useState } from 'react'
import { ExternalLink, UserCheck, Users, Plus, HelpCircle, Check } from 'lucide-react'
import { Badge, Button, Card, CardBody, CategoryChip, Notice, Spinner, StatusBadge, Textarea } from '../../components/ui'
import { useT } from '../../lib/i18n'
import { useMeta } from '../../store/meta'
import { fmtDistance } from '../../lib/format'
import { fill } from './api'

function MatchCard({ m, s, onChoose, onUnsure }) {
  const { t } = useT()
  const catName = useMeta((x) => x.categoryName)
  const subName = useMeta((x) => x.subcategoryName)
  const [diffOpen, setDiffOpen] = useState(false)
  const [reason, setReason] = useState('')
  const mine = !!m.same_reporter
  const ticket = m.ticket_number
  const ch = s.dup.choice

  return (
    <Card className={mine ? 'border-forest/40' : ''}>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold">{ticket}</span>
          <StatusBadge status={m.status} />
          {mine && <Badge tone="forest">{t('report.dup.mine', 'You reported this')}</Badge>}
          {m.supporting_count > 0 && <Badge tone="civic">{fill(t('report.dup.supporting', '{n} supporting'), { n: m.supporting_count })}</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CategoryChip category={m.category} label={[catName(m.category), m.subcategory && subName(m.category, m.subcategory)].filter(Boolean).join(' / ')} />
          {m.distance_m != null && <span className="text-muted">{fill(t('report.dup.away', '{d} away'), { d: fmtDistance(m.distance_m) })}</span>}
          {m.locality && <span className="text-muted">{m.locality}</span>}
        </div>
        {m.summary && <p className="text-sm text-ink/90">{m.summary}</p>}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button as="a" variant="secondary" href={`/app/complaints/${ticket}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" aria-hidden /> {t('report.dup.view', 'View existing report')}
          </Button>
          <Button variant="secondary" disabled={m.i_follow} onClick={() => onChoose({ action: 'follow', ticket })}>
            <Users className="h-4 w-4" aria-hidden /> {m.i_follow ? t('report.dup.following', 'You already follow this report') : t('report.dup.follow', 'Follow this report')}
          </Button>
          <Button variant={mine ? 'primary' : 'secondary'} onClick={() => onChoose({ action: 'add_evidence', ticket })}>
            <UserCheck className="h-4 w-4" aria-hidden /> {mine ? t('report.dup.continue_existing', 'Continue existing report') : t('report.dup.add', 'Add photo or information')}
          </Button>
          <Button variant="secondary" onClick={() => setDiffOpen((v) => !v)} aria-expanded={diffOpen}>
            <Plus className="h-4 w-4" aria-hidden /> {t('report.dup.different', 'This is a different issue - continue')}
          </Button>
        </div>
        {mine && <p className="text-xs font-semibold text-forest">{t('report.dup.recommended', 'Recommended: continue your existing report instead of creating a second ticket.')}</p>}
        {!mine && <p className="text-xs text-muted">{t('report.dup.add_hint', 'Your description and photos will be added to that report instead of creating a new ticket.')}</p>}

        {diffOpen && (
          <div className="space-y-2 rounded-[10px] border border-line bg-paper p-3">
            <label htmlFor={`reason-${ticket}`} className="block text-[13px] font-semibold">{t('report.dup.reason', 'Why is it different? (optional)')}</label>
            <Textarea id={`reason-${ticket}`} className="min-h-[72px]" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)}
              placeholder={t('report.dup.reason_ph', 'For example: a new pothole a few metres further down the road')} />
            <Button onClick={() => onChoose({ action: 'new', reason })}>{t('report.dup.new_btn', 'Continue with a new report')}</Button>
          </div>
        )}

        <button type="button" onClick={onUnsure} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-civic hover:underline">
          <HelpCircle className="h-4 w-4" aria-hidden /> {t('report.dup.unsure', 'Not sure')}
        </button>
        {ch && ch.ticket === ticket && <p className="flex items-center gap-1.5 text-sm font-semibold text-success"><Check className="h-4 w-4" aria-hidden /> {t('report.dup.chosen', 'Your choice is saved.')}</p>}
      </CardBody>
    </Card>
  )
}

export default function StepNearby({ s, set, onChoose, onRetry, onNewAnyway }) {
  const { t } = useT()
  const { status, data, error, unsure, choice } = s.dup
  const matches = Array.isArray(data?.matches) ? data.matches : []

  if (status === 'loading' || status === 'idle') return <Spinner label={t('report.dup.checking', 'Looking for similar reports nearby...')} />
  if (status === 'error') {
    return (
      <Notice tone="warning" title={t('report.dup.error_title', 'We could not check for similar reports')}>
        <p>{error}</p>
        <p className="mt-1 text-muted">{t('report.dup.error_body', 'You can still continue and submit a new report.')}</p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="secondary" onClick={onRetry}>{t('report.retry', 'Try again')}</Button>
          <Button size="sm" onClick={onNewAnyway}>{t('report.dup.continue_new', 'Continue with a new report')}</Button>
        </div>
      </Notice>
    )
  }
  if (!matches.length) {
    return (
      <Notice tone="forest" title={t('report.dup.none', 'No similar reports found nearby')}>
        {t('report.dup.none_body', 'Nothing close to this spot matches your description, so this will be a new report.')}
      </Notice>
    )
  }
  return (
    <div className="space-y-4">
      <Notice tone="civic" title={t('report.dup.title', 'You may have reported this issue before')}>
        {t('report.dup.intro', 'We found earlier reports close to the location you selected. You are free to continue with a new report - nothing is blocked.')}
      </Notice>
      {unsure && <Notice tone="forest">{t('report.dup.unsure_note', 'Take your time. Open the existing report in a new tab to review it, then come back and choose.')}</Notice>}
      {choice && <Notice tone="success">{t('report.dup.choice_made', 'You already made a choice here. You can change it by choosing again.')}</Notice>}
      {matches.map((m) => <MatchCard key={m.ticket_number} m={m} s={s} onChoose={(c) => onChoose(c)} onUnsure={() => set((cur) => ({ dup: { ...cur.dup, unsure: true } }))} />)}
    </div>
  )
}
