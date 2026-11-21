import { Badge, Button, Card, CardBody, CategoryChip, Notice, SeverityBadge, Spinner } from '../../components/ui'
import { useT } from '../../lib/i18n'
import { useMeta } from '../../store/meta'

export default function StepReview({ s, onRetry }) {
  const { t } = useT()
  const meta = useMeta((x) => x.meta)
  const catName = useMeta((x) => x.categoryName)
  const subName = useMeta((x) => x.subcategoryName)
  const { status, data, error } = s.preview

  if (status === 'loading' || status === 'idle') return <Spinner label={t('report.prev.loading', 'Reading your report...')} />

  if (status === 'error') {
    return (
      <Notice tone="warning" title={t('report.prev.unavailable', 'AI preview unavailable - your report will still be triaged on submit')}>
        <p className="text-muted">{error}</p>
        <div className="mt-3"><Button size="sm" variant="secondary" onClick={onRetry}>{t('report.retry', 'Try again')}</Button></div>
      </Notice>
    )
  }

  const tri = data?.triage || {}
  const cat = tri.category || ''
  const sub = tri.subcategory || ''
  const catLabel = data?.category_name || (cat && catName(cat)) || ''
  const subLabel = data?.subcategory_name || (cat && sub && subName(cat, sub)) || ''
  const dept = data?.department_name || tri.department_code || ''
  const sev = tri.severity
  const urgent = sev === 'critical' || sev === 'high'
  const photo = tri.photo_analysis
  const notes = Array.isArray(tri.notes) ? tri.notes : []
  const obs = Array.isArray(tri.image_observations) ? tri.image_observations : []
  const emergency = meta?.emergency_notice

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('report.prev.summary', 'AI summary')}</p>
            <p className="mt-1 text-[15px] text-ink">{tri.summary || t('report.prev.no_summary', 'No summary was produced.')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {cat && <CategoryChip category={cat} label={catLabel} />}
            {subLabel && <CategoryChip category={cat} label={subLabel} />}
            <SeverityBadge severity={sev} />
          </div>
          {tri.reason && <p className="text-sm text-ink/90"><span className="font-semibold">{t('report.prev.why', 'Why this severity')}:</span> {tri.reason}</p>}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {dept && (
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">{t('report.prev.dept', 'Likely department')}</dt><dd className="mt-0.5 font-medium">{dept}</dd></div>
            )}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{t('report.prev.review', 'Human review')}</dt>
              <dd className="mt-0.5">
                {tri.requires_human_review
                  ? <Badge tone="saffron">{t('report.prev.review_yes', 'A person will review this report')}</Badge>
                  : <span className="text-muted">{t('report.prev.review_no', 'Routed automatically, officers can still change it')}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{t('report.prev.photo', 'Photo analysis')}</dt>
              <dd className="mt-0.5">
                {photo === 'analysed' ? t('report.prev.photo_analysed', 'Photos were analysed')
                  : photo === 'unavailable' ? t('report.prev.photo_unavailable', 'Photo analysis was not available - your photos are still attached')
                    : t('report.prev.photo_none', 'No photos provided')}
              </dd>
            </div>
          </dl>
          {obs.length > 0 && (
            <div className="rounded-[10px] border border-line bg-paper p-3">
              <p className="text-xs font-semibold text-muted">{t('report.prev.obs', 'AI observations - may be wrong')}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{obs.map((o, i) => <li key={i}>{o}</li>)}</ul>
            </div>
          )}
          <p className="text-sm text-muted">{t('report.prev.correct', 'This is an AI suggestion. Officers can correct the category, severity and department.')}</p>
          {(tri.provider || notes.length > 0) && (
            <p className="text-xs text-muted">
              {tri.provider && `${t('report.prev.provider', 'Suggested by')}: ${tri.provider}${tri.model ? ` (${tri.model})` : ''}.`} {notes.join(' ')}
            </p>
          )}
        </CardBody>
      </Card>
      {urgent && (
        <Notice tone="critical" title={t('report.prev.danger_title', 'Safety')}>
          {t('report.prev.danger', 'If someone is in immediate danger, call your local emergency service. CivicLens is not an emergency service.')}
          {emergency && <p className="mt-1 text-xs">{emergency}</p>}
        </Notice>
      )}
    </div>
  )
}
