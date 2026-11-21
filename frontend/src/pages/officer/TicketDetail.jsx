import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Badge, Button, Card, ErrorState, SeverityBadge, Spinner, StatusBadge } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'
import { PriorityMeter, SlaChip, useFetch } from '../../features/staff/common'
import { ActionColumn } from '../../features/staff/ActionPanels'
import {
  AiPanel, DuplicatesCard, EvidenceCard, ImageGallery, InternalNotes, LocationCard, PublicTimeline, ReportCard,
} from '../../features/staff/DetailSections'

export default function TicketDetail() {
  const { ticketId } = useParams()
  const { data: t, loading, error, reload } = useFetch(`/officer/complaints/${encodeURIComponent(ticketId)}`)

  if (loading && !t) return <Spinner label="Loading ticket…" />
  if (error || !t) {
    return (
      <div className="space-y-3">
        <Link to="/staff/queue" className="inline-flex items-center gap-1 text-sm font-semibold text-civic hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden /> Back to queue</Link>
        <Card><ErrorState message={error || 'Ticket not found.'} onRetry={reload} /></Card>
      </div>
    )
  }

  return (
    <div>
      <Link to="/staff/queue" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-civic hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden /> Back to queue</Link>

      <Card className="mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-xl font-extrabold text-ink sm:text-2xl">{t.ticket_number}</h1>
              <StatusBadge status={t.status} />
              <SeverityBadge severity={t.severity} />
              {t.reopen_requested && <Badge tone="saffron">Reopen requested</Badge>}
              {t.is_demo && <Badge tone="saffron">Demo data</Badge>}
            </div>
            <p className="mt-1.5 max-w-3xl text-sm text-ink">{t.summary}</p>
            <p className="mt-1 text-xs text-muted">Opened {fmtDateTime(t.created_at)} · Updated {fmtDateTime(t.updated_at)}{t.resolved_at ? ` · Resolved ${fmtDateTime(t.resolved_at)}` : ''}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Priority</p>
              <PriorityMeter score={t.priority_score} severity={t.severity} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">SLA</p>
              <SlaChip due={t.sla_due_at} status={t.status} />
            </div>
            <Button variant="secondary" size="sm" onClick={reload} aria-label="Refresh ticket"><RefreshCw className="h-4 w-4" aria-hidden /></Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <ReportCard t={t} submissions={t.submissions} />
          <ImageGallery images={t.images} />
          <LocationCard t={t} />
          <AiPanel t={t} detail={t} />
          <DuplicatesCard detail={t} />
          <PublicTimeline detail={t} />
          <InternalNotes detail={t} />
          <EvidenceCard detail={t} />
        </div>
        <aside className="min-w-0 lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-88px)] lg:self-start lg:overflow-y-auto" aria-label="Ticket actions">
          <ActionColumn ticket={t} detail={t} onDone={reload} />
        </aside>
      </div>
    </div>
  )
}
