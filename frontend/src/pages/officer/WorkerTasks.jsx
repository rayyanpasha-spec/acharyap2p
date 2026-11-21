import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, ExternalLink, MapPin, Play, ShieldCheck } from 'lucide-react'
import { Button, Card, CategoryChip, EmptyState, ErrorState, Modal, PageHeader, SeverityBadge, Spinner, StatusBadge, toast } from '../../components/ui'
import { CLOSED_STATUSES, PriorityMeter, SlaChip, useFetch } from '../../features/staff/common'
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
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={t.severity} />
        <StatusBadge status={t.status} />
        <CategoryChip category={t.category} label={t.category_name} />
        <span className="ml-auto"><SlaChip due={t.sla_due_at} status={t.status} /></span>
      </div>
      <Link to={`/staff/tickets/${t.ticket_number}`} className="mt-2 block font-mono text-sm font-bold text-civic hover:underline">{t.ticket_number}</Link>
      <p className="mt-1 line-clamp-3 text-sm text-ink">{t.summary || t.original_description}</p>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><MapPin className="h-3.5 w-3.5" aria-hidden /> {t.location?.locality || 'Locality not resolved'}{t.location?.address ? ` · ${t.location.address}` : ''}</p>
      <div className="mt-2"><PriorityMeter score={t.priority_score} severity={t.severity} /></div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
        {startable && (
          <Button size="sm" variant="civic" loading={busy} onClick={() => run(() => patchStatus(t.ticket_number, 'in_progress', 'Work started', true), 'Work started')}>
            <Play className="h-4 w-4" aria-hidden /> Start work
          </Button>
        )}
        {(working || startable) && (
          <Button size="sm" variant="secondary" onClick={() => setModal('photo')}><Camera className="h-4 w-4" aria-hidden /> Upload after photo</Button>
        )}
        {working && (
          <Button size="sm" variant="primary" onClick={() => setModal('handover')}><ShieldCheck className="h-4 w-4" aria-hidden /> Mark awaiting verification</Button>
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
    </Card>
  )
}

export default function WorkerTasks() {
  const { data, loading, error, reload } = useFetch('/officer/queue', { page_size: 100 })
  const items = (data?.items || []).filter((t) => !CLOSED_STATUSES.includes(t.status))
  const closedCount = (data?.items || []).length - items.length

  return (
    <div>
      <PageHeader title="My tasks" subtitle="Tickets assigned to you, highest priority first. A supervisor verifies completed work." />
      {loading && !data ? <Spinner label="Loading your tasks…" /> : error ? (
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      ) : items.length === 0 ? (
        <Card><EmptyState title="No open tasks assigned to you" hint="New assignments will appear here." action={<Button variant="secondary" size="sm" onClick={() => { reload(); toast.info('Refreshed') }}>Refresh</Button>} /></Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((t) => <TaskCard key={t.ticket_number} t={t} onChanged={reload} />)}
          </div>
          {closedCount > 0 && <p className="mt-3 text-xs text-muted">{closedCount} closed ticket(s) hidden.</p>}
        </>
      )}
    </div>
  )
}
