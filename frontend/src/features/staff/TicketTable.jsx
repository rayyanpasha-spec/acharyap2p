// Dense priority table shared by the queue (and reusable elsewhere).
import { Link, useNavigate } from 'react-router-dom'
import { SeverityBadge, StatusBadge, CategoryChip, Th, Td } from '../../components/ui'
import { useMeta } from '../../store/meta'
import { PriorityMeter, ReviewFlag, SlaChip, pct } from './common'

export const ticketHref = (t) => `/staff/tickets/${t.ticket_number}`

export default function TicketTable({ items }) {
  const navigate = useNavigate()
  const departmentName = useMeta((s) => s.departmentName)
  useMeta((s) => s.meta)

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
        <thead>
          <tr>
            <Th>Priority</Th>
            <Th>Severity</Th>
            <Th>Ticket</Th>
            <Th>Category</Th>
            <Th className="w-[26%]">Summary</Th>
            <Th>Locality</Th>
            <Th>Department</Th>
            <Th>Status</Th>
            <Th>Assignee</Th>
            <Th>SLA</Th>
            <Th className="text-right">AI conf.</Th>
            <Th className="text-center">Review</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr
              key={t.ticket_number}
              onClick={() => navigate(ticketHref(t))}
              className="cursor-pointer hover:bg-civic-50"
            >
              <Td className="py-2"><PriorityMeter score={t.priority_score} severity={t.severity} /></Td>
              <Td className="py-2"><SeverityBadge severity={t.severity} /></Td>
              <Td className="whitespace-nowrap py-2">
                <Link to={ticketHref(t)} onClick={(e) => e.stopPropagation()} className="font-mono text-[13px] font-semibold text-civic hover:underline">{t.ticket_number}</Link>
              </Td>
              <Td className="py-2">
                <div className="flex flex-col items-start gap-0.5">
                  <CategoryChip category={t.category} label={t.category_name} />
                  {t.subcategory_name && <span className="text-xs text-muted">{t.subcategory_name}</span>}
                </div>
              </Td>
              <Td className="py-2">
                <p className="line-clamp-2 max-w-md text-[13px] leading-snug text-ink">{t.summary || t.original_description || '—'}</p>
                {t.original_language && <span className="text-[11px] font-semibold uppercase text-muted">{t.original_language}</span>}
              </Td>
              <Td className="py-2 text-[13px]">{t.location?.locality || <span className="text-muted">—</span>}</Td>
              <Td className="py-2 text-[13px]">{t.department_name || (t.department_code ? departmentName(t.department_code) : <span className="text-muted">—</span>)}</Td>
              <Td className="py-2"><StatusBadge status={t.status} /></Td>
              <Td className="whitespace-nowrap py-2 text-[13px]">{t.assigned_worker?.name || <span className="text-muted">Unassigned</span>}</Td>
              <Td className="whitespace-nowrap py-2"><SlaChip due={t.sla_due_at} status={t.status} /></Td>
              <Td className="py-2 text-right text-[13px] tabular-nums">{pct(t.ai_confidence)}</Td>
              <Td className="py-2 text-center"><ReviewFlag item={t} /></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
