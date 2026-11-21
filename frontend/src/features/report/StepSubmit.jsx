import { Link } from 'react-router-dom'
import { CheckCircle2, Pencil } from 'lucide-react'
import { Badge, Button, Card, CardBody, CardHeader, Notice, SeverityBadge, StatusBadge } from '../../components/ui'
import { useT, LANGS } from '../../lib/i18n'
import { useMeta } from '../../store/meta'
import { errMsg } from '../../lib/api'
import { fullAddress, fill } from './api'

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
    <div className="flex items-start justify-between gap-3 border-b border-line py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <div className="mt-1 text-sm">{children}</div>
      </div>
      {onEdit && <button type="button" onClick={onEdit} className="inline-flex min-h-10 items-center gap-1 px-1 text-sm font-semibold text-civic hover:underline"><Pencil className="h-3.5 w-3.5" aria-hidden />{editLabel}</button>}
    </div>
  )
}

export function StepSubmit({ s, goto, onSubmit }) {
  const { t } = useT()
  const meta = useMeta((x) => x.meta)
  const choice = s.dup.choice
  const busy = s.submit.status === 'loading'
  const edit = t('report.edit', 'Edit')
  const langLabel = LANGS.find((l) => l.code === s.language)?.label || s.language
  const addr = fullAddress(s)
  const srcLabel = { gps: t('report.loc.src_gps', 'From GPS'), map_pin: t('report.loc.src_pin', 'Map pin'), address_search: t('report.loc.src_search', 'Address search') }[s.loc?.source] || ''
  const follow = choice?.action === 'follow'
  const evidence = choice?.action === 'add_evidence'

  return (
    <div className="space-y-4">
      {follow && <Notice tone="civic" title={fill(t('report.sub.follow_title', 'You are about to follow {t}'), { t: choice.ticket })}>{t('report.sub.follow_body', 'No new ticket will be created. You will get updates on the existing report.')}</Notice>}
      {evidence && <Notice tone="civic" title={fill(t('report.sub.evidence_title', 'You are about to add to {t}'), { t: choice.ticket })}>{t('report.sub.evidence_body', 'Your description and photos will be added to the existing report. No new ticket will be created.')}</Notice>}
      <Card>
        <CardHeader title={t('report.sub.title', 'Check your report')} />
        <CardBody className="py-1 sm:py-1">
          <Row label={t('report.sub.desc', 'Description')} onEdit={() => goto(0)} editLabel={edit}>
            <p className="whitespace-pre-wrap">{s.text}</p>
            <p className="mt-1 text-xs text-muted">{langLabel}{s.via === 'voice' ? ` - ${t('report.sub.via_voice', 'spoken, then edited by you')}` : ''}</p>
          </Row>
          <Row label={t('report.sub.photos', 'Photos')} onEdit={() => goto(0)} editLabel={edit}>
            {s.images.length ? (
              <ul className="flex flex-wrap gap-2">{s.images.map((i) => <li key={i.id}><img src={i.url} alt={i.file.name} className="h-16 w-16 rounded-md border border-line object-cover" /></li>)}</ul>
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
        </CardBody>
      </Card>

      <p className="text-sm text-muted">{t('report.loc.consent', 'CivicLens uses the location of the issue to find nearby reports and send it to the correct municipal team. Your precise location is not shown publicly.')} {t('report.sub.consent', 'By submitting, you agree that this location and description are used for that purpose.')}</p>
      {meta?.emergency_notice && <p className="text-xs text-muted">{meta.emergency_notice}</p>}

      {s.submit.status === 'error' && <Notice tone="critical" title={t('report.sub.failed', 'Your report was not submitted')}>{s.submit.error}</Notice>}

      <Button size="lg" className="w-full sm:w-auto" onClick={onSubmit} loading={busy} disabled={busy}>
        {busy ? t('report.sub.sending', 'Submitting...') : follow ? t('report.sub.follow_btn', 'Follow report') : evidence ? t('report.sub.evidence_btn', 'Add to existing report') : t('report.sub.btn', 'Submit report')}
      </Button>
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
    <Card>
      <CardBody className="space-y-4 text-center sm:py-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-100 text-success"><CheckCircle2 className="h-8 w-8" aria-hidden /></span>
        <h2 className="font-display text-xl font-extrabold">{title}</h2>
        {ticket && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('report.done.ticket', 'Ticket number')}</p>
            <p className="font-mono text-2xl font-bold text-forest">{ticket}</p>
          </div>
        )}
        {action === 'created' && (
          <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-sm">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <SeverityBadge severity={sev} />
              {c.status && <StatusBadge status={c.status} />}
            </div>
            {reason && <p className="text-ink/90">{reason}</p>}
            {dept && <p className="text-muted">{t('report.prev.dept', 'Likely department')}: <span className="font-medium text-ink">{dept}</span></p>}
            <p className="text-xs text-muted">{t('report.done.note', 'An officer will review it and can correct the AI suggestion. You will be notified when its status changes.')}</p>
          </div>
        )}
        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          {ticket && <Button as={Link} to={`/app/complaints/${ticket}`} size="lg">{t('report.done.view', 'View my report')}</Button>}
          <Button variant="secondary" size="lg" onClick={onAnother}>{t('report.done.another', 'Report another')}</Button>
        </div>
      </CardBody>
    </Card>
  )
}
