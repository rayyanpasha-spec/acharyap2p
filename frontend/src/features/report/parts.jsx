// Small layout pieces shared by the report wizard steps (fixed-height wizard: heads are fixed, bodies scroll inside on desktop).
import { IconTile, cn } from '../../components/ui'

/** Uppercase micro label used above values. */
export const LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-muted'

/** Step heading row: title (+ optional subtitle) on the left, step-specific controls on the right. Never scrolls. */
export function StepHead({ title, subtitle, right }) {
  return (
    <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="font-display text-[17px] font-extrabold leading-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {right && <div className="flex min-w-0 flex-wrap items-center gap-2">{right}</div>}
    </div>
  )
}

/** A bordered card with an IconTile header and a body that scrolls inside on desktop (scroll=false to disable). */
export function MiniCard({ icon, tone = 'forest', title, right, children, className, bodyClassName, scroll = true }) {
  return (
    <section className={cn('flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(36,76,57,0.05)]', className)}>
      <header className="flex shrink-0 items-center gap-2.5 border-b border-line px-3 py-2">
        {icon && <IconTile icon={icon} tone={tone} size="sm" />}
        <h3 className="min-w-0 flex-1 truncate font-display text-[14px] font-bold text-ink">{title}</h3>
        {right}
      </header>
      <div className={cn('min-h-0 flex-1', scroll && 'lg:overflow-y-auto', bodyClassName ?? 'p-3')}>{children}</div>
    </section>
  )
}

const CALLOUT = {
  civic: 'border-civic/25 bg-civic-50',
  forest: 'border-forest/20 bg-forest-50',
  warning: 'border-warning/40 bg-warning-100',
  critical: 'border-critical/30 bg-critical-100',
  success: 'border-success/30 bg-success-100',
  neutral: 'border-line bg-paper',
}
/** Dense notice (smaller padding than ui.Notice) for use inside fixed-height panels. */
export function Callout({ tone = 'civic', title, children, className, role }) {
  return (
    <div role={role} className={cn('rounded-[10px] border px-3 py-2 text-[13px] leading-snug', CALLOUT[tone], className)}>
      {title && <p className="mb-0.5 font-semibold text-ink">{title}</p>}
      <div className="text-ink/90">{children}</div>
    </div>
  )
}

/** Icon + label + value tile. */
export function Tile({ icon, tone = 'forest', label, children, className }) {
  return (
    <div className={cn('flex min-w-0 items-start gap-2.5 rounded-[14px] border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(36,76,57,0.05)]', className)}>
      <IconTile icon={icon} tone={tone} />
      <div className="min-w-0">
        <p className={LABEL}>{label}</p>
        <div className="mt-0.5 break-words text-sm font-semibold text-ink">{children}</div>
      </div>
    </div>
  )
}
