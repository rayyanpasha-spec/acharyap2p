import { Link } from 'react-router-dom'
import { CheckCircle2, Pencil, ShieldCheck } from 'lucide-react'
import { Badge, Button, IconTile, SeverityBadge, StatusBadge } from '../../components/ui'
import { useT, LANGS } from '../../lib/i18n'
import { useMeta } from '../../store/meta'
import { errMsg } from '../../lib/api'
import { fullAddress, fill } from './api'
import { Callout, LABEL, MiniCard, StepHead } from './parts'

/** Human message for a failed submit/preview call. */
export function submitError(e, t) {
  const st = e?.response?.status
  const base = errMsg(e, '')
  if (st === 413) return t('report.err.413', 'A photo is too large. Remove it or choose a smaller one, then submit again.')
  if (st === 429) return t('report.err.429', 'You have sent too many reports in a short time. Please wait a little and try again.')
  if (st === 503) return base || t('report.err.503', 'The service is busy right now. Your report is kept here - please try again in a moment.')
  if (st === 400 || st === 422) return base || t('report.err.400', 'Some details need fixing. Please check your report and try again.')
  return base || t('report.err.generic', 'Something went wrong. Your report is kept here - please try again.')
}

function Row({ label, onEdit, editLabel, children }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className={LABEL}>{label}</p>
        <div className="mt-1 text-sm">{children}</div>
      </div>
      {onEdit && <button type="button" onClick={onEdit} className="inline-flex min-h-9 items-center gap-1 px-1 text-[13px] font-semibold text-civic hover:underline"><Pencil className="h-3.5 w-3.5" aria-hidden />{editLabel}</button>}
    </div>
  )
}

/** Label of the final action button (rendered in the wizard's pinned footer). */
export function submitLabel(s, t) {
  const a = s.dup.choice?.action
  if (s.submit.status === 'loading') return t('report.sub.sending', 'Submitting...')
  if (a === 'follow') return t('report.sub.follow_btn', 'Follow report')
  if (a === 'add_evidence') return t('report.sub.evidence_btn', 'Add to existing report')
  return t('report.sub.btn', 'Submit report')
}

export function StepSubmit({ s, goto, title }) {
  const { t } = useT()
  const meta = useMeta((x) => x.meta)
  const choice = s.dup.choice
  const edit = t('report.edit', 'Edit')
  const langLabel = LANGS.find((l) => l.code === s.language)?.label || s.language
  const addr = fullAddress(s)
  const srcLabel = { gps: t('report.loc.src_gps', 'From GPS'), map_pin: t('report.loc.src_pin', 'Map pin'), address_search: t('report.loc.src_search', 'Address search') }[s.loc?.source] || ''
  const follow = choice?.action === 'follow'
  const evidence = choice?.action === 'add_evidence'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StepHead title={title} />
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-[minmax(0,1fr)]">
        {/* LEFT: the report as it will be sent (scrolls inside) */}
        <MiniCard icon={CheckCircle2} tone="forest" title={t('report.sub.title', 'Check your report')} bodyClassName="px-3 py-1">
          <Row label={t('report.sub.desc', 'Description')} onEdit={() => goto(0)} editLabel={edit}>
            <p className="whitespace-pre-wrap">{s.text}</p>
            <p className="mt-1 text-xs text-muted">{langLabel}{s.via === 'voice' ? ` - ${t('report.sub.via_voice', 'spoken, then edited by you')}` : ''}</p>
          </Row>
          <Row label={t('report.sub.photos', 'Photos')} onEdit={() => goto(0)} editLabel={edit}>
            {s.images.length ? (
              <ul className="flex flex-wrap gap-2">{s.images.map((i) => <li key={i.id}><img src={i.url} alt={i.file.name} className="h-14 w-14 rounded-md border border-line object-cover" /></li>)}</ul>
            ) : <span className="text-muted">{t('report.sub.no_photos', 'No photos')}</span>}
          </Row>
          <Row label={t('report.step.location', 'Location')} onEdit={() => goto(1)} editLabel={edit}>
            {addr && <p>{addr}</p>}
            {s.locality && <p className="text-muted">{s.locality}</p>}
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{s.loc.lat.toFixed(5)}, {s.loc.lng.toFixed(5)}</span>
              {srcLabel && <Badge tone="civic">{srcLabel}</Badge>}
              {s.loc.accuracy != null && <span>{fill(t('report.loc.accuracy', 'GPS accuracy: about {m} m.'), { m: Math.round(s.loc.accuracy) })}</span>}
            </p>
          </Row>
          {s.preview.status === 'done' && s.preview.data?.triage && !follow && !evidence && (
            <Row label={t('report.sub.ai', 'AI suggestion')} onEdit={() => goto(3)} editLabel={edit}>
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={s.preview.data.triage.severity} />
                <span>{s.preview.data.category_name || s.preview.data.triage.category}</span>
              </div>
            </Row>
          )}
        </MiniCard>

        {/* RIGHT: what happens on submit + consent */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1">
          {follow && <Callout tone="civic" title={fill(t('report.sub.follow_title', 'You are about to follow {t}'), { t: choice.ticket })}>{t('report.sub.follow_body', 'No new ticket will be created. You will get updates on the existing report.')}</Callout>}
          {evidence && <Callout tone="civic" title={fill(t('report.sub.evidence_title', 'You are about to add to {t}'), { t: choice.ticket })}>{t('report.sub.evidence_body', 'Your description and photos will be added to the existing report. No new ticket will be created.')}</Callout>}

          <MiniCard icon={ShieldCheck} tone="civic" title={t('report.sub.consent_title', 'Location and consent')} scroll={false}>
            <p className="text-[13px] text-ink/90">{t('report.loc.consent', 'CivicLens uses the location of the issue to find nearby reports and send it to the correct municipal team. Your precise location is not shown publicly.')} {t('report.sub.consent', 'By submitting, you agree that this location and description are used for that purpose.')}</p>
            {meta?.emergency_notice && <p className="mt-2 text-xs text-muted">{meta.emergency_notice}</p>}
          </MiniCard>

          {s.submit.status === 'error' && <Callout tone="critical" role="alert" title={t('report.sub.failed', 'Your report was not submitted')}>{s.submit.error}</Callout>}
        </div>
      </div>
    </div>
  )
}

export function Success({ result, onAnother }) {
  const { t } = useT()
  const ticket = result?.ticket_number || result?.complaint?.ticket_number
  const c = result?.complaint || {}
  const tri = result?.triage || {}
  const action = result?.action || 'created'
  const sev = c.severity || tri.severity
  const reason = c.severity_reason || tri.reason
  const dept = c.department_name || ''
  const title = action === 'followed' ? t('report.done.followed', 'You are now following this report')
    : action === 'evidence_added' ? t('report.done.evidence', 'Your information was added to the existing report')
      : t('report.done.title', 'Report submitted')
  return (
    <section className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto rounded-[14px] border border-line bg-surface px-4 py-6 text-center shadow-[0_1px_2px_rgba(36,76,57,0.05)]">
      <IconTile icon={CheckCircle2} tone="success" size="lg" />
      <h2 className="mt-3 font-display text-xl font-extrabold text-ink">{title}</h2>
      {ticket && (
        <div className="mt-3 rounded-[10px] border border-forest/20 bg-forest-50 px-5 py-2">
          <p className={LABEL}>{t('report.done.ticket', 'Ticket number')}</p>
          <p className="font-mono text-2xl font-bold text-forest">{ticket}</p>
        </div>
      )}
      {action === 'created' && (
        <div className="mx-auto mt-3 flex max-w-md flex-col items-center gap-2 text-sm">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <SeverityBadge severity={sev} />
            {c.status && <StatusBadge status={c.status} />}
          </div>
          {reason && <p className="line-clamp-3 text-ink/90">{reason}</p>}
          {dept && <p className="text-muted">{t('report.prev.dept', 'Likely department')}: <span className="font-medium text-ink">{dept}</span></p>}
          <p className="text-xs text-muted">{t('report.done.note', 'An officer will review it and can correct the AI suggestion. You will be notified when its status changes.')}</p>
        </div>
      )}
      <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
        {ticket && <Button as={Link} to={`/app/complaints/${ticket}`}>{t('report.done.view', 'View my report')}</Button>}
        <Button variant="secondary" onClick={onAnother}>{t('report.done.another', 'Report another')}</Button>
      </div>
    </section>
  )
}
