import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, FileText, MapPinned, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { Badge, Button, Card, ErrorState, Page, Panel, Segmented, SeverityBadge, Spinner, StatusBadge } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'
import { PriorityMeter, SlaChip, useFetch } from '../../features/staff/common'
import { ActionColumn } from '../../features/staff/ActionPanels'
import {
  AiBlock, DuplicatesBlock, EvidenceBlock, InternalBlock, LocationBlock, PhotosBlock, ReportBlock, TimelineBlock, internalCount,
} from '../../features/staff/DetailSections'

export default function TicketDetail() {
  const { ticketId } = useParams()
  const { data: t, loading, error, reload } = useFetch(`/officer/complaints/${encodeURIComponent(ticketId)}`)
  const [activity, setActivity] = useState('timeline')

  if (loading && !t) return <Spinner label="Loading ticket…" />
  if (error || !t) {
    return (
      <div className="space-y-3">
        <Link to="/staff/queue" className="inline-flex items-center gap-1 text-sm font-semibold text-civic hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden /> Back to queue</Link>
        <Card><ErrorState message={error || 'Ticket not found.'} onRetry={reload} /></Card>
      </div>
    )
  }

  const hasEvidence = (t.resolution_evidence || []).length > 0
  const nInternal = internalCount(t)

  return (
    <Page>
      {/* Header strip */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] border border-line bg-surface px-3.5 py-2.5 shadow-[0_1px_2px_rgba(36,76,57,0.05)]">
        <Link to="/staff/queue" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line-strong px-2 py-1 text-[13px] font-semibold text-civic hover:bg-civic-50">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to queue
        </Link>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="font-mono text-lg font-extrabold text-ink">{t.ticket_number}</h1>
          <StatusBadge status={t.status} />
          <SeverityBadge severity={t.severity} />
          {t.reopen_requested && <Badge tone="saffron">Reopen requested</Badge>}
          {t.is_demo && <Badge tone="saffron">Demo data</Badge>}
        </div>
        <div className="min-w-[200px] flex-1">
          <p className="line-clamp-1 text-[13px] font-medium text-ink" title={t.summary}>{t.summary}</p>
          <p className="truncate text-[11.5px] text-muted">Opened {fmtDateTime(t.created_at)} · Updated {fmtDateTime(t.updated_at)}{t.resolved_at ? ` · Resolved ${fmtDateTime(t.resolved_at)}` : ''}</p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Priority</p>
            <PriorityMeter score={t.priority_score} severity={t.severity} />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">SLA</p>
            <SlaChip due={t.sla_due_at} status={t.status} />
          </div>
          <Button variant="secondary" size="sm" onClick={reload} aria-label="Refresh ticket"><RefreshCw className="h-4 w-4" aria-hidden /></Button>
        </div>
      </div>

      {/* Three columns on desktop, each scrolls inside its panel; stacked (page scrolls) below lg */}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,0.9fr)] lg:grid-rows-[minmax(0,1fr)]">
        <Panel title="Case file" subtitle="Report, translation and photos" icon={FileText} tone="civic" bodyClassName="p-0">
          <ReportBlock t={t} submissions={t.submissions} />
          <PhotosBlock images={t.images} />
          {hasEvidence && <EvidenceBlock detail={t} />}
        </Panel>

        <div className="grid min-h-0 gap-3 lg:grid-rows-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Panel title="Location and AI triage" subtitle="Where it is and what the AI suggested" icon={MapPinned} tone="teal" bodyClassName="p-0">
            <LocationBlock t={t} />
            <AiBlock t={t} detail={t} />
            <DuplicatesBlock detail={t} />
          </Panel>
          <Panel
            title="Activity"
            icon={Clock}
            tone="saffron"
            bodyClassName="p-0"
            action={<Segmented ariaLabel="Activity view" value={activity} onChange={setActivity} options={[{ value: 'timeline', label: 'Timeline' }, { value: 'internal', label: nInternal ? `Internal (${nInternal})` : 'Internal' }]} />}
          >
            {activity === 'timeline' ? <TimelineBlock detail={t} /> : <InternalBlock detail={t} />}
          </Panel>
        </div>

        <Panel title="Actions" subtitle="One form open at a time" icon={SlidersHorizontal} tone="forest" bodyClassName="p-3">
          <ActionColumn key={t.ticket_number} ticket={t} detail={t} onDone={reload} />
        </Panel>
      </div>
    </Page>
  )
}
