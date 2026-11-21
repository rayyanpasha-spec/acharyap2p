// Dense priority table for the queue. The scroll container is the parent <Panel> body, so the sticky header sticks.
import { Link, useNavigate } from 'react-router-dom'
import { SeverityBadge, StatusBadge, CategoryChip } from '../../components/ui'
import { useMeta } from '../../store/meta'
import { Cell, HCell, PriorityMeter, ReviewFlag, SlaChip, pct } from './common'

export const ticketHref = (t) => `/staff/tickets/${t.ticket_number}`

export default function TicketTable({ items }) {
  const navigate = useNavigate()
  const departmentName = useMeta((s) => s.departmentName)
  useMeta((s) => s.meta)

  return (
    <table className="w-full min-w-[900px] border-collapse text-left text-[13px]">
      <thead>
        <tr>
          <HCell>Priority</HCell>
          <HCell>Severity</HCell>
          <HCell>Ticket</HCell>
          <HCell>Category</HCell>
          <HCell className="w-full">Summary</HCell>
          <HCell>Locality</HCell>
          <HCell className="hidden 2xl:table-cell">Department</HCell>
          <HCell>Status</HCell>
          <HCell>Assignee</HCell>
          <HCell>SLA</HCell>
          <HCell className="hidden text-right 2xl:table-cell">AI</HCell>
          <HCell className="text-center">Rev.</HCell>
        </tr>
      </thead>
      <tbody>
        {items.map((t) => (
          <tr key={t.ticket_number} onClick={() => navigate(ticketHref(t))} className="cursor-pointer transition-colors hover:bg-civic-50">
            <Cell><PriorityMeter score={t.priority_score} severity={t.severity} /></Cell>
            <Cell><SeverityBadge severity={t.severity} /></Cell>
            <Cell className="whitespace-nowrap">
              <Link to={ticketHref(t)} onClick={(e) => e.stopPropagation()} className="font-mono text-[13px] font-semibold text-civic hover:underline">{t.ticket_number}</Link>
            </Cell>
            <Cell className="whitespace-nowrap"><span title={t.subcategory_name || undefined}><CategoryChip category={t.category} label={t.category_name} /></span></Cell>
            <Cell className="max-w-0">
              <p className="truncate text-ink" title={t.summary || t.original_description || ''}>
                {t.original_language && t.original_language !== 'en' && <span className="mr-1.5 rounded bg-paper px-1 text-[10px] font-semibold uppercase text-muted">{t.original_language}</span>}
                {t.summary || t.original_description || '—'}
              </p>
            </Cell>
            <Cell className="whitespace-nowrap">{t.location?.locality || <span className="text-muted">—</span>}</Cell>
            <Cell className="hidden whitespace-nowrap 2xl:table-cell">{t.department_name || (t.department_code ? departmentName(t.department_code) : <span className="text-muted">—</span>)}</Cell>
            <Cell className="whitespace-nowrap"><StatusBadge status={t.status} /></Cell>
            <Cell className="whitespace-nowrap">{t.assigned_worker?.name || <span className="text-muted">Unassigned</span>}</Cell>
            <Cell className="whitespace-nowrap"><SlaChip due={t.sla_due_at} status={t.status} /></Cell>
            <Cell className="hidden text-right tabular-nums 2xl:table-cell">{pct(t.ai_confidence)}</Cell>
            <Cell className="text-center"><ReviewFlag item={t} /></Cell>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
