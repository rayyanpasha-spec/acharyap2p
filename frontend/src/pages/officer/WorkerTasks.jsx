import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertOctagon, Camera, CheckCircle2, ClipboardList, Clock, ExternalLink, Hammer, MapPin, Play, ShieldCheck } from 'lucide-react'
import { Button, CategoryChip, EmptyState, ErrorState, Modal, Page, Panel, SeverityBadge, Spinner, StatusBadge, toast } from '../../components/ui'
import { parseDate } from '../../lib/format'
import { CLOSED_STATUSES, MetricTile, PriorityMeter, SEV_COLOR, SlaChip, useFetch } from '../../features/staff/common'
import { EvidenceForm, HandoverForm, patchStatus, useAction } from '../../features/staff/ActionPanels'

function TaskCard({ t, onChanged }) {
  const [modal, setModal] = useState(null) // 'photo' | 'handover'
  const { busy, run } = useAction(onChanged)
  const startable = ['assigned', 'reopened', 'verified'].includes(t.status)
  const working = t.status === 'in_progress'
  const hasAfter = false // the queue payload does not include evidence; the server enforces the rule and we ask for a note/photo
  const close = () => setModal(null)
  const done = async () => { close(); await onChanged() }

  return (
    <article className="flex flex-col rounded-[14px] border border-line border-l-4 bg-surface p-3 shadow-[0_1px_2px_rgba(36,76,57,0.05)]" style={{ borderLeftColor: SEV_COLOR[t.severity] || 'var(--color-line-strong)' }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge severity={t.severity} />
        <StatusBadge status={t.status} />
        <CategoryChip category={t.category} label={t.category_name} />
        <span className="ml-auto"><SlaChip due={t.sla_due_at} status={t.status} /></span>
      </div>
      <Link to={`/staff/tickets/${t.ticket_number}`} className="mt-2 block font-mono text-[13px] font-bold text-civic hover:underline">{t.ticket_number}</Link>
      <p className="mt-0.5 line-clamp-2 text-[13px] text-ink">{t.summary || t.original_description}</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{t.location?.locality || 'Locality not resolved'}{t.location?.address ? ` · ${t.location.address}` : ''}</span></p>
      <div className="mt-1.5"><PriorityMeter score={t.priority_score} severity={t.severity} /></div>

      <div className="mt-2.5 flex flex-wrap gap-2 border-t border-line pt-2.5">
        {startable && (
          <Button size="sm" variant="civic" loading={busy} onClick={() => run(() => patchStatus(t.ticket_number, 'in_progress', 'Work started', true), 'Work started')}>
            <Play className="h-4 w-4" aria-hidden /> Start work
          </Button>
        )}
        {(working || startable) && (
          <Button size="sm" variant="secondary" onClick={() => setModal('photo')}><Camera className="h-4 w-4" aria-hidden /> After photo</Button>
        )}
        {working && (
          <Button size="sm" variant="primary" onClick={() => setModal('handover')}><ShieldCheck className="h-4 w-4" aria-hidden /> Awaiting verification</Button>
        )}
        <Link to={`/staff/tickets/${t.ticket_number}`} className="ml-auto inline-flex h-8 items-center gap-1 rounded-[10px] px-2 text-sm font-semibold text-civic hover:bg-civic-50">
          Details <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <Modal open={modal === 'photo'} onClose={close} title={`After-work photo - ${t.ticket_number}`}>
        <EvidenceForm ticketNumber={t.ticket_number} defaultKind="after" lockKind submitLabel="Upload after photo" onDone={done} />
      </Modal>
      <Modal open={modal === 'handover'} onClose={close} title={`Send for verification - ${t.ticket_number}`}>
        <HandoverForm ticketNumber={t.ticket_number} hasAfter={hasAfter} onDone={done} />
      </Modal>
    </article>
  )
}

export default function WorkerTasks() {
  const { data, loading, error, reload } = useFetch('/officer/queue', { page_size: 100 })
  const items = (data?.items || []).filter((t) => !CLOSED_STATUSES.includes(t.status))
  const closedCount = (data?.items || []).length - items.length
  const urgent = items.filter((t) => t.severity === 'critical' || t.severity === 'high').length
  const inProgress = items.filter((t) => t.status === 'in_progress').length
  const overdue = items.filter((t) => { const d = parseDate(t.sla_due_at); return d && d.getTime() < Date.now() }).length

  return (
    <Page title="My tasks" subtitle="Tickets assigned to you, highest priority first. A supervisor verifies completed work.">
      <div className="grid shrink-0 grid-cols-2 gap-2.5 lg:grid-cols-4">
        <MetricTile label="Open tasks" value={items.length} tone="civic" icon={ClipboardList} />
        <MetricTile label="Critical or high" value={urgent} tone="critical" icon={AlertOctagon} />
        <MetricTile label="In progress" value={inProgress} tone="teal" icon={Hammer} />
        <MetricTile label="Past SLA" value={overdue} tone="warning" icon={Clock} hint="Past the sample SLA target" />
      </div>
      <Panel
        className="flex-1"
        title="Assigned tickets"
        subtitle={closedCount > 0 ? `${closedCount} closed ticket(s) hidden` : 'Highest priority first'}
        icon={CheckCircle2}
        tone="civic"
        bodyClassName="bg-paper/60 p-3"
      >
        {loading && !data ? <Spinner label="Loading your tasks…" /> : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : items.length === 0 ? (
          <EmptyState title="No open tasks assigned to you" hint="New assignments will appear here." action={<Button variant="secondary" size="sm" onClick={() => { reload(); toast.info('Refreshed') }}>Refresh</Button>} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((t) => <TaskCard key={t.ticket_number} t={t} onChanged={reload} />)}
          </div>
        )}
      </Panel>
    </Page>
  )
}
