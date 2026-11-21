import { Link, Navigate } from 'react-router-dom'
import {
  AlertOctagon, AlertTriangle, CheckCircle2, ClipboardCheck, Clock, Flag, Hammer, Inbox, ListTree, RotateCcw, UserX,
} from 'lucide-react'
import { Card, CardBody, CardHeader, CategoryChip, EmptyState, ErrorState, PageHeader, SeverityBadge, Spinner, Stat, StatusBadge } from '../../components/ui'
import { useAuth } from '../../store/auth'
import { useMeta } from '../../store/meta'
import { titleCase } from '../../lib/format'
import { PriorityMeter, SlaChip, hoursLabel, ratePct, useFetch } from '../../features/staff/common'

const n = (v) => (v == null ? '—' : v)

export default function Dashboard() {
  const role = useAuth((s) => s.user?.role)
  const meta = useMeta((s) => s.meta)
  const departmentName = useMeta((s) => s.departmentName)
  const isWorker = role === 'worker'
  const { data, loading, error, reload } = useFetch('/officer/dashboard', undefined, !isWorker)

  if (isWorker) return <Navigate to="/staff/worker" replace />
  if (loading && !data) return <Spinner label="Loading dashboard…" />
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>
  if (!data) return null

  const t = data.totals || {}
  const byStatus = Object.entries(data.by_status || {}).sort((a, b) => b[1] - a[1])
  const maxStatus = Math.max(1, ...byStatus.map(([, c]) => c))
  const depts = data.resolution_rate_by_department || []
  const top = data.top_priority || []
  const scope = data.scope?.department_code ? (meta ? departmentName(data.scope.department_code) : data.scope.department_code) : 'All departments'

  return (
    <div>
      <PageHeader title="Overview" subtitle={`Scope: ${scope}. Counts update each time you open this page.`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Total tickets" value={n(t.total)} accent="ink" icon={Inbox} />
        <Stat label="Critical" value={n(t.critical)} accent="critical" icon={AlertOctagon} />
        <Stat label="High" value={n(t.high)} accent="high" icon={AlertTriangle} />
        <Stat label="Unassigned" value={n(t.unassigned)} accent="civic" icon={UserX} />
        <Stat label="In progress" value={n(t.in_progress)} accent="civic" icon={Hammer} />
        <Stat label="Awaiting verification" value={n(t.awaiting_verification)} accent="plum" icon={ClipboardCheck} />
        <Stat label="Resolved" value={n(t.resolved)} accent="success" icon={CheckCircle2} />
        <Stat label="Overdue" value={n(t.overdue)} accent="warning" icon={Clock} hint="Past the sample SLA target" />
        <Stat label="Needs review" value={n(t.needs_review)} accent="civic" icon={Flag} hint="Flagged for a human" />
        <Stat label="Reopen requests" value={n(t.reopen_requests)} accent="high" icon={RotateCcw} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Median resolution time" />
          <CardBody>
            <p className="font-display text-4xl font-extrabold text-forest">{hoursLabel(data.median_resolution_hours)}</p>
            <p className="mt-1 text-xs text-muted">{data.median_resolution_hours == null ? 'No verified resolutions yet.' : 'From report to verified resolution.'}</p>
          </CardBody>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader title="Status breakdown" />
          <CardBody className="space-y-2">
            {byStatus.length === 0 ? <p className="text-sm text-muted">No tickets yet.</p> : byStatus.map(([s, c]) => (
              <div key={s} className="flex items-center gap-3 text-sm">
                <span className="w-40 shrink-0"><StatusBadge status={s} /></span>
                <div className="h-2 flex-1 rounded-full bg-line" aria-hidden><div className="h-full rounded-full bg-civic" style={{ width: `${(c / maxStatus) * 100}%` }} /></div>
                <span className="w-8 text-right font-semibold tabular-nums">{c}</span>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader title="Resolution rate by department" subtitle="Verified resolved / total" />
          <CardBody className="space-y-3">
            {depts.length === 0 ? <p className="text-sm text-muted">No department data yet.</p> : depts.map((d) => {
              const r = Number(d.rate) <= 1 ? Number(d.rate) * 100 : Number(d.rate)
              return (
                <div key={d.department_code}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{d.department_name || d.department_code}</span>
                    <span className="shrink-0 text-xs text-muted">{d.resolved}/{d.total} · <b className="text-ink">{ratePct(d.rate)}</b></span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-line" aria-hidden><div className="h-full rounded-full bg-forest" style={{ width: `${Math.max(0, Math.min(100, r || 0))}%` }} /></div>
                </div>
              )
            })}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Top priority"
          subtitle="Highest operational priority right now"
          action={<Link to="/staff/queue" className="inline-flex items-center gap-1 text-sm font-semibold text-civic hover:underline"><ListTree className="h-4 w-4" aria-hidden /> Open full queue</Link>}
        />
        {top.length === 0 ? <EmptyState title="Nothing urgent" hint="No open tickets in your scope." /> : (
          <ul className="divide-y divide-line">
            {top.map((x) => (
              <li key={x.ticket_number}>
                <Link to={`/staff/tickets/${x.ticket_number}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-civic-50 sm:px-5">
                  <PriorityMeter score={x.priority_score} severity={x.severity} />
                  <SeverityBadge severity={x.severity} />
                  <span className="font-mono text-[13px] font-semibold text-civic">{x.ticket_number}</span>
                  <CategoryChip category={x.category} label={x.category_name} />
                  <span className="min-w-[200px] flex-1 truncate text-sm text-ink">{x.summary}</span>
                  <span className="text-xs text-muted">{x.location?.locality || ''}</span>
                  <StatusBadge status={x.status} />
                  <SlaChip due={x.sla_due_at} status={x.status} />
                  {x.assigned_worker?.name ? <span className="text-xs text-muted">{x.assigned_worker.name}</span> : <span className="text-xs font-semibold text-civic">{titleCase('unassigned')}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
