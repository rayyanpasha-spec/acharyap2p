// Shared UI primitives (shadcn-style, hand written with Tailwind). Import from '../../components/ui'.
import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, Inbox, X } from 'lucide-react'
import { fetchBlobUrl } from '../lib/api'
import { titleCase } from '../lib/format'

export const cn = (...a) => a.filter(Boolean).join(' ')

/* ---------- Button ---------- */
const BTN = {
  primary: 'bg-forest text-white hover:bg-forest-600 disabled:bg-forest/50',
  civic: 'bg-civic text-white hover:bg-[#274f78] disabled:bg-civic/50',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-paper disabled:text-muted',
  ghost: 'text-ink hover:bg-forest-50 disabled:text-muted',
  danger: 'bg-critical text-white hover:bg-[#a13f3d] disabled:bg-critical/50',
  accent: 'bg-saffron text-white hover:bg-[#a96624] disabled:bg-saffron/50',
}
const BTN_SIZE = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' }
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, as: As = 'button', ...p }) {
  return (
    <As
      className={cn('inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition-colors disabled:cursor-not-allowed', BTN[variant], BTN_SIZE[size], className)}
      disabled={disabled || loading}
      {...p}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </As>
  )
}

/* ---------- Card ---------- */
export function Card({ className, children, ...p }) {
  return <div className={cn('rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(36,76,57,0.05)]', className)} {...p}>{children}</div>
}
export function CardHeader({ title, subtitle, action, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5', className)}>
      <div className="min-w-0">
        <h3 className="font-display text-[15px] font-bold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
export const CardBody = ({ className, children }) => <div className={cn('p-4 sm:p-5', className)}>{children}</div>

/* ---------- Badges ---------- */
const TONES = {
  neutral: 'bg-paper text-muted border-line-strong',
  forest: 'bg-forest-100 text-forest border-forest/20',
  civic: 'bg-civic-100 text-civic border-civic/20',
  teal: 'bg-teal-100 text-teal border-teal/20',
  plum: 'bg-plum-100 text-plum border-plum/20',
  saffron: 'bg-saffron-100 text-saffron border-saffron/25',
  success: 'bg-success-100 text-success border-success/20',
  warning: 'bg-warning-100 text-[#8a6118] border-warning/30',
  high: 'bg-high-100 text-high border-high/25',
  critical: 'bg-critical-100 text-critical border-critical/25',
  low: 'bg-low-100 text-low border-low/25',
}
export function Badge({ tone = 'neutral', className, children, dot }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}
const SEV_TONE = { low: 'low', medium: 'warning', high: 'high', critical: 'critical' }
export const SeverityBadge = ({ severity }) => (severity ? <Badge tone={SEV_TONE[severity] || 'neutral'} dot>{titleCase(severity)}</Badge> : null)
const STATUS_TONE = {
  submitted: 'neutral', ai_review: 'civic', verified: 'teal', assigned: 'civic', in_progress: 'saffron',
  awaiting_verification: 'plum', resolved: 'success', reopened: 'high', rejected: 'neutral', duplicate_linked: 'neutral',
}
export const StatusBadge = ({ status }) => (status ? <Badge tone={STATUS_TONE[status] || 'neutral'}>{titleCase(status)}</Badge> : null)
export function CategoryChip({ category, label }) {
  const color = `var(--color-cat-${category || 'other'})`
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} aria-hidden />
      {label || titleCase(category || 'other')}
    </span>
  )
}
/** Honest labelling of fictional / simulated content (README section 22). kind: 'demo' | 'simulated' */
export function DemoTag({ kind = 'demo', className }) {
  return (
    <span className={cn('inline-flex items-center rounded border border-dashed border-saffron/60 bg-saffron-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-saffron', className)}>
      {kind === 'simulated' ? 'Simulated' : 'Demo data'}
    </span>
  )
}

/* ---------- Form controls ---------- */
const FIELD = 'w-full rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted/70 focus:border-civic disabled:bg-paper'
export function Field({ label, hint, error, htmlFor, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-ink">{label}</label>}
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs font-medium text-critical">{error}</p>}
    </div>
  )
}
export const Input = ({ className, ...p }) => <input className={cn(FIELD, 'h-10', className)} {...p} />
export const Textarea = ({ className, ...p }) => <textarea className={cn(FIELD, 'min-h-[110px] py-2.5', className)} {...p} />
export const Select = ({ className, children, ...p }) => <select className={cn(FIELD, 'h-10 pr-8', className)} {...p}>{children}</select>

/* ---------- Feedback states ---------- */
export const Spinner = ({ label = 'Loading…', className }) => (
  <div role="status" className={cn('flex items-center justify-center gap-2 py-10 text-sm text-muted', className)}>
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
  </div>
)
export function EmptyState({ title = 'Nothing here yet', hint, action, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-forest-50 text-forest"><Icon className="h-5 w-5" aria-hidden /></span>
      <p className="font-display text-[15px] font-bold">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action}
    </div>
  )
}
export function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-critical-100 text-critical"><AlertTriangle className="h-5 w-5" aria-hidden /></span>
      <p className="text-sm text-ink">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  )
}
export function Notice({ tone = 'civic', title, children, className }) {
  const t = { civic: 'border-civic/30 bg-civic-50', warning: 'border-warning/40 bg-warning-100', critical: 'border-critical/30 bg-critical-100', success: 'border-success/30 bg-success-100', forest: 'border-forest/20 bg-forest-50' }[tone]
  return (
    <div className={cn('rounded-[10px] border px-4 py-3 text-sm', t, className)}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="text-ink/90">{children}</div>
    </div>
  )
}

/* ---------- Layout bits ---------- */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-xl font-extrabold text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
const STAT_ACCENT = { forest: 'text-forest', civic: 'text-civic', critical: 'text-critical', high: 'text-high', warning: 'text-warning', success: 'text-success', plum: 'text-plum', teal: 'text-teal', ink: 'text-ink' }
export function Stat({ label, value, hint, accent = 'ink', icon: Icon }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {Icon && <Icon className={cn('h-4 w-4', STAT_ACCENT[accent])} aria-hidden />}
      </div>
      <p className={cn('mt-1.5 font-display text-[28px] font-extrabold leading-none', STAT_ACCENT[accent])}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </Card>
  )
}
export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return
    const h = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cn('max-h-[92vh] w-full overflow-y-auto rounded-t-[14px] border border-line bg-surface sm:rounded-[12px]', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-base font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:bg-paper"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-paper px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- Tables ---------- */
export const Table = ({ className, children }) => (
  <div className="overflow-x-auto"><table className={cn('w-full border-collapse text-left text-sm', className)}>{children}</table></div>
)
export const Th = ({ className, children, ...p }) => <th className={cn('sticky top-0 z-10 border-b border-line bg-paper px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted', className)} {...p}>{children}</th>
export const Td = ({ className, children, ...p }) => <td className={cn('border-b border-line px-3 py-2.5 align-middle', className)} {...p}>{children}</td>

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cn('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold', value === t.value ? 'border-forest text-forest' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Toasts (tiny global store, no dependency) ---------- */
const listeners = new Set()
let toasts = []
const push = (kind, msg) => {
  const t = { id: Math.random().toString(36).slice(2), kind, msg }
  toasts = [...toasts, t]
  listeners.forEach((l) => l(toasts))
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); listeners.forEach((l) => l(toasts)) }, 4500)
}
export const toast = { success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }
export function Toaster() {
  const [list, setList] = useState(toasts)
  useEffect(() => { listeners.add(setList); return () => listeners.delete(setList) }, [])
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[3000] flex w-[min(92vw,360px)] flex-col gap-2" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={cn('pointer-events-auto rounded-[10px] border px-4 py-3 text-sm font-medium shadow-sm', t.kind === 'error' ? 'border-critical/30 bg-critical-100 text-critical' : t.kind === 'success' ? 'border-success/30 bg-success-100 text-success' : 'border-civic/30 bg-civic-50 text-civic')}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

/* ---------- Protected image (GET /images/{id} needs the JWT, so fetch as blob) ---------- */
export function AuthImage({ imageId, src, alt = '', className }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let revoked = false, u
    setUrl(null); setFailed(false)
    fetchBlobUrl(src || `/images/${imageId}`).then((x) => { if (revoked) URL.revokeObjectURL(x); else { u = x; setUrl(x) } }).catch(() => setFailed(true))
    return () => { revoked = true; if (u) URL.revokeObjectURL(u) }
  }, [imageId, src])
  if (failed) return <div className={cn('flex items-center justify-center bg-paper text-xs text-muted', className)}>Image unavailable</div>
  if (!url) return <div className={cn('animate-pulse bg-paper', className)} aria-label="Loading image" />
  return <img src={url} alt={alt} className={cn('object-cover', className)} />
}


/* =====================================================================================================
   FIXED-SIZE APP-SHELL PRIMITIVES (desktop >= 1024px: no page-level scrolling; each Panel scrolls inside)
   ===================================================================================================== */

/** Full-height page body. Put inside a layout's <main>. On desktop it fills the viewport (no page scroll);
 *  below lg it is a normal scrolling page. Children: use <Panel/> / grids with `min-h-0`. */
export function Page({ title, subtitle, actions, children, className }) {
  return (
    <div className={cn('flex min-h-full flex-col lg:h-full lg:min-h-0', className)}>
      {(title || actions) && (
        <div className="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            {title && <h1 className="font-display text-xl font-extrabold leading-tight text-ink sm:text-2xl">{title}</h1>}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-3">{children}</div>
    </div>
  )
}

/** A card with a fixed header and a body that scrolls INSIDE it on desktop (scroll=false -> body does not scroll). */
export function Panel({ title, subtitle, action, icon: Icon, tone = 'forest', children, className, bodyClassName, scroll = true, footer }) {
  const tones = { forest: 'bg-forest-100 text-forest', civic: 'bg-civic-100 text-civic', teal: 'bg-teal-100 text-teal', plum: 'bg-plum-100 text-plum', saffron: 'bg-saffron-100 text-saffron', critical: 'bg-critical-100 text-critical' }
  return (
    <section className={cn('flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(36,76,57,0.05)]', className)}>
      {(title || action) && (
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', tones[tone])}><Icon className="h-4 w-4" aria-hidden /></span>}
            <div className="min-w-0">
              <h2 className="truncate font-display text-[14px] font-bold text-ink">{title}</h2>
              {subtitle && <p className="truncate text-[12px] text-muted">{subtitle}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className={cn('min-h-0 flex-1', scroll && 'lg:overflow-y-auto', bodyClassName ?? 'p-4')}>{children}</div>
      {footer && <footer className="shrink-0 border-t border-line bg-paper px-4 py-2.5">{footer}</footer>}
    </section>
  )
}

/** Coloured rounded icon tile (used for stats, features, nav). */
export function IconTile({ icon: Icon, tone = 'forest', size = 'md', className }) {
  const tones = { forest: 'bg-forest-100 text-forest', civic: 'bg-civic-100 text-civic', teal: 'bg-teal-100 text-teal', plum: 'bg-plum-100 text-plum', saffron: 'bg-saffron-100 text-saffron', critical: 'bg-critical-100 text-critical', high: 'bg-high-100 text-high', success: 'bg-success-100 text-success' }
  const sz = { sm: 'h-7 w-7 rounded-lg [&>svg]:h-3.5 [&>svg]:w-3.5', md: 'h-9 w-9 rounded-[10px] [&>svg]:h-[18px] [&>svg]:w-[18px]', lg: 'h-12 w-12 rounded-xl [&>svg]:h-6 [&>svg]:w-6' }[size]
  return <span className={cn('inline-flex shrink-0 items-center justify-center', tones[tone], sz, className)}><Icon aria-hidden /></span>
}

/** Segmented control (view switchers, filters). options: [{value,label}] */
export function Segmented({ options, value, onChange, className, ariaLabel }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('inline-flex rounded-[10px] border border-line-strong bg-paper p-0.5', className)}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn('rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors', value === o.value ? 'bg-surface text-forest shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
