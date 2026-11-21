import { Building2, Camera, Gauge, ScanSearch, Sparkles, Tag, UserCheck } from 'lucide-react'
import { Badge, Button, CategoryChip, IconTile, SeverityBadge, Spinner } from '../../components/ui'
import { useT } from '../../lib/i18n'
import { useMeta } from '../../store/meta'
import { Callout, LABEL, MiniCard, StepHead, Tile } from './parts'

function Centered({ children }) {
  return <div className="flex min-h-[200px] flex-1 items-center justify-center"><div className="w-full max-w-lg">{children}</div></div>
}

export default function StepReview({ s, onRetry, title }) {
  const { t } = useT()
  const meta = useMeta((x) => x.meta)
  const catName = useMeta((x) => x.categoryName)
  const subName = useMeta((x) => x.subcategoryName)
  const { status, data, error } = s.preview

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <StepHead title={title} />
        <Centered>
          <div className="flex flex-col items-center gap-1 text-center">
            <IconTile icon={Sparkles} tone="civic" size="lg" />
            <Spinner label={t('report.prev.loading', 'Reading your report...')} className="py-3" />
          </div>
        </Centered>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <StepHead title={title} />
        <Centered>
          <Callout tone="warning" role="alert" title={t('report.prev.unavailable', 'AI preview unavailable - your report will still be triaged on submit')}>
            <p className="text-muted">{error}</p>
            <div className="mt-3"><Button size="sm" variant="secondary" onClick={onRetry}>{t('report.retry', 'Try again')}</Button></div>
          </Callout>
        </Centered>
      </div>
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
    <div className="flex min-h-0 flex-1 flex-col">
      <StepHead title={title} subtitle={t('report.prev.correct', 'This is an AI suggestion. Officers can correct the category, severity and department.')} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)]">
        {/* LEFT: summary + category / severity / department */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1">
          <MiniCard icon={Sparkles} tone="civic" title={t('report.prev.summary', 'AI summary')} scroll={false}>
            <p className="text-[15px] leading-relaxed text-ink">{tri.summary || t('report.prev.no_summary', 'No summary was produced.')}</p>
            {tri.reason && <p className="mt-2 text-[13px] text-ink/90"><span className="font-semibold">{t('report.prev.why', 'Why this severity')}:</span> {tri.reason}</p>}
          </MiniCard>

          <div className="grid gap-3 sm:grid-cols-3">
            <Tile icon={Tag} tone="forest" label={t('report.prev.cat', 'Category')}>
              <div className="flex flex-col items-start gap-1">
                {cat ? <CategoryChip category={cat} label={catLabel} /> : <span className="text-muted">-</span>}
                {subLabel && <CategoryChip category={cat} label={subLabel} />}
              </div>
            </Tile>
            <Tile icon={Gauge} tone={urgent ? 'high' : 'civic'} label={t('report.prev.sev', 'Severity')}>
              {sev ? <SeverityBadge severity={sev} /> : <span className="text-muted">-</span>}
            </Tile>
            <Tile icon={Building2} tone="plum" label={t('report.prev.dept', 'Likely department')}>
              {dept || <span className="text-muted">-</span>}
            </Tile>
          </div>

          {urgent && (
            <Callout tone="critical" role="note" title={t('report.prev.danger_title', 'Safety')}>
              {t('report.prev.danger', 'If someone is in immediate danger, call your local emergency service. CivicLens is not an emergency service.')}
              {emergency && <p className="mt-1 text-xs">{emergency}</p>}
            </Callout>
          )}
        </div>

        {/* RIGHT: photo observations, human review, provider notes */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1">
          <MiniCard icon={Camera} tone="saffron" title={t('report.prev.photo', 'Photo analysis')} scroll={false}>
            <p className="text-sm">
              {photo === 'analysed' ? t('report.prev.photo_analysed', 'Photos were analysed')
                : photo === 'unavailable' ? t('report.prev.photo_unavailable', 'Photo analysis was not available - your photos are still attached')
                  : t('report.prev.photo_none', 'No photos provided')}
            </p>
            {obs.length > 0 && (
              <div className="mt-2 rounded-[10px] border border-line bg-paper p-2.5">
                <p className={LABEL}>{t('report.prev.obs', 'AI observations - may be wrong')}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{obs.map((o, i) => <li key={i}>{o}</li>)}</ul>
              </div>
            )}
          </MiniCard>

          <MiniCard icon={UserCheck} tone="teal" title={t('report.prev.review', 'Human review')} scroll={false}>
            {tri.requires_human_review
              ? <Badge tone="saffron">{t('report.prev.review_yes', 'A person will review this report')}</Badge>
              : <span className="text-sm text-muted">{t('report.prev.review_no', 'Routed automatically, officers can still change it')}</span>}
          </MiniCard>

          {(tri.provider || notes.length > 0) && (
            <MiniCard icon={ScanSearch} tone="plum" title={t('report.prev.provider', 'Suggested by')} scroll={false}>
              <p className="text-[13px] text-muted">
                {tri.provider && `${tri.provider}${tri.model ? ` (${tri.model})` : ''}.`} {notes.join(' ')}
              </p>
            </MiniCard>
          )}
        </div>
      </div>
    </div>
  )
}
