import { Card } from '../../components/ui'
import { BIN_STATES, BIN_STATE_ORDER } from './shared'

export default function Legend({ compact = false }) {
  if (compact) {
    return (
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-civic" aria-hidden>
            <svg width="11" height="11" viewBox="0 0 24 24"><path d="M2 6h12v10H2z M14 9h4l4 4v3h-8z" fill="#fff" /></svg>
          </span>
          Vehicle (simulated)
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke="#2f5f8f" strokeWidth="3" strokeDasharray="5 4" /></svg>
          Demo route (not road-snapped)
        </li>
        {BIN_STATE_ORDER.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-white" style={{ background: BIN_STATES[s].color, boxShadow: '0 0 0 1px rgba(0,0,0,.3)' }} aria-hidden />
            {BIN_STATES[s].label} <span className="text-muted">({BIN_STATES[s].range})</span>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <Card className="px-4 py-3">
      <p className="mb-2 text-[13px] font-semibold text-ink">Legend</p>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink">
        <li className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-civic" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24"><path d="M2 6h12v10H2z M14 9h4l4 4v3h-8z" fill="#fff" /></svg>
          </span>
          Vehicle (simulated)
        </li>
        <li className="flex items-center gap-2">
          <svg width="28" height="6" aria-hidden><line x1="0" y1="3" x2="28" y2="3" stroke="#2f5f8f" strokeWidth="3" strokeDasharray="6 5" /></svg>
          Demo route (straight line, not road-snapped)
        </li>
        {BIN_STATE_ORDER.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-white" style={{ background: BIN_STATES[s].color, boxShadow: '0 0 0 1px rgba(0,0,0,.3)' }} aria-hidden />
            {BIN_STATES[s].label} <span className="text-muted">({BIN_STATES[s].range})</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
