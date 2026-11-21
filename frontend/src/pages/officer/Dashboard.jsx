import { Link, Navigate } from 'react-router-dom'
import {
  AlertOctagon, AlertTriangle, BarChart3, CheckCircle2, ClipboardCheck, Clock, Flag, Hammer, Inbox, ListTree, RotateCcw, Timer, UserX, Building2,
} from 'lucide-react'
import { Card, CategoryChip, DemoTag, EmptyState, ErrorState, Page, Panel, SeverityBadge, Spinner, StatusBadge } from '../../components/ui'
import { useAuth } from '../../store/auth'
import { useMeta } from '../../store/meta'
import { titleCase } from '../../lib/format'
import { MetricTile, PriorityMeter, SEV_COLOR, SlaChip, hoursLabel, ratePct, useFetch } from '../../features/staff/common'

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
    <Page
      title="Overview"
      subtitle={`Scope: ${scope}. Counts update each time you open this page.`}
      actions={<><span className="hidden text-[12px] text-muted md:inline">SLA targets are sample configuration.</span><DemoTag /></>}
    >
      {/* Metric strip: 10 compact tinted tiles, two rows of five on desktop */}
      <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
        <MetricTile label="Total tickets" value={n(t.total)} tone="ink" icon={Inbox} />
        <MetricTile label="Critical" value={n(t.critical)} tone="critical" icon={AlertOctagon} />
        <MetricTile label="High" value={n(t.high)} tone="high" icon={AlertTriangle} />
        <MetricTile label="Unassigned" value={n(t.unassigned)} tone="civic" icon={UserX} />
        <MetricTile label="In progress" value={n(t.in_progress)} tone="teal" icon={Hammer} />
        <MetricTile label="Awaiting verification" value={n(t.awaiting_verification)} tone="plum" icon={ClipboardCheck} />
        <MetricTile label="Resolved" value={n(t.resolved)} tone="success" icon={CheckCircle2} />
        <MetricTile label="Overdue" value={n(t.overdue)} tone="warning" icon={Clock} hint="Past the sample SLA target" />
        <MetricTile label="Needs review" value={n(t.needs_review)} tone="saffron" icon={Flag} hint="Flagged for a human" />
        <MetricTile label="Reopen requests" value={n(t.reopen_requests)} tone="high" icon={RotateCcw} />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.45fr)] lg:grid-rows-[minmax(0,1fr)]">
        <Panel title="Status breakdown" subtitle="Open and closed tickets by status" icon={BarChart3} tone="civic" bodyClassName="p-0">
          <div className="flex items-center gap-3 border-b border-line bg-forest-50 px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest-100 text-forest"><Timer className="h-5 w-5" aria-hidden /></span>
            <div className="min-w-0">
              <p className="font-display text-[26px] font-extrabold leading-none text-forest">{hoursLabel(data.median_resolution_hours)}</p>
              <p className="mt-1 text-[12px] text-muted">{data.median_resolution_hours == null ? 'Median resolution time: no verified resolutions yet.' : 'Median resolution time, report to verified resolution.'}</p>
            </div>
          </div>
          <div className="space-y-1.5 px-4 py-3">
            {byStatus.length === 0 ? <p className="text-[13px] text-muted">No tickets yet.</p> : byStatus.map(([s, c]) => (
              <div key={s} className="flex items-center gap-2.5 text-[13px]">
                <span className="w-[150px] shrink-0"><StatusBadge status={s} /></span>
                <div className="h-2 flex-1 rounded-full bg-line" aria-hidden><div className="h-full rounded-full bg-civic" style={{ width: `${(c / maxStatus) * 100}%` }} /></div>
                <span className="w-8 text-right font-semibold tabular-nums">{c}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Resolution rate by department" subtitle="Verified resolved / total" icon={Building2} tone="forest">
          <div className="space-y-3">
            {depts.length === 0 ? <p className="text-[13px] text-muted">No department data yet.</p> : depts.map((d) => {
              const r = Number(d.rate) <= 1 ? Number(d.rate) * 100 : Number(d.rate)
              return (
                <div key={d.department_code}>
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="truncate font-medium">{d.department_name || d.department_code}</span>
                    <span className="shrink-0 text-[12px] text-muted">{d.resolved}/{d.total} · <b className="text-ink">{ratePct(d.rate)}</b></span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-line" aria-hidden><div className="h-full rounded-full bg-forest" style={{ width: `${Math.max(0, Math.min(100, r || 0))}%` }} /></div>
                </div>
              )
            })}
          </div>
        </Panel>

        <Panel
          title="Top priority"
          subtitle="Highest operational priority right now"
          icon={AlertOctagon}
          tone="critical"
          bodyClassName="p-0"
          action={<Link to="/staff/queue" className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-civic hover:underline"><ListTree className="h-4 w-4" aria-hidden /> Full queue</Link>}
        >
          {top.length === 0 ? <EmptyState title="Nothing urgent" hint="No open tickets in your scope." /> : (
            <ul>
              {top.map((x) => (
                <li key={x.ticket_number} className="border-b border-line last:border-b-0">
                  <Link to={`/staff/tickets/${x.ticket_number}`} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-civic-50">
                    <span className="w-1 self-stretch rounded-full" style={{ background: SEV_COLOR[x.severity] || 'var(--color-muted)' }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-[13px] font-semibold text-civic">{x.ticket_number}</span>
                        <SeverityBadge severity={x.severity} />
                        <CategoryChip category={x.category} label={x.category_name} />
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-ink">{x.summary}</p>
                      <p className="truncate text-[11.5px] text-muted">{x.location?.locality || 'Locality not resolved'} · {x.assigned_worker?.name || titleCase('unassigned')}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <PriorityMeter score={x.priority_score} severity={x.severity} />
                      <div className="flex items-center gap-1.5"><StatusBadge status={x.status} /><SlaChip due={x.sla_due_at} status={x.status} /></div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </Page>
  )
}
