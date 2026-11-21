// Municipal command-centre shell. Desktop (>= lg): fixed-size app shell, no page scroll; the main area hosts <Page>/<Panel>s
// that scroll internally. Sidebar is icon-only between lg and xl, full width from xl. Mobile: slide-down menu.
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3, ClipboardList, Gift, LayoutDashboard, ListChecks, LogOut, Menu, ScrollText, SlidersHorizontal, Truck, Users, X, Landmark, Map as MapIcon,
} from 'lucide-react'
import { useAuth } from '../store/auth'
import { useMeta } from '../store/meta'
import { DemoTag, IconTile, cn } from '../components/ui'
import PageBoundary from '../components/PageBoundary'
import { Avatar, accentFor } from '../features/staff/common'

function navFor(role) {
  const items = []
  if (role !== 'worker') items.push({ to: '/staff', label: 'Dashboard', icon: LayoutDashboard, end: true, tone: 'civic' })
  if (role !== 'worker') items.push({ to: '/staff/queue', label: 'Priority queue', icon: ListChecks, tone: 'teal' })
  if (role === 'worker') items.push({ to: '/staff/worker', label: 'My tasks', icon: ClipboardList, tone: 'civic' })
  if (role !== 'worker') items.push({ to: '/staff/analytics', label: 'Analytics', icon: BarChart3, tone: 'plum' })
  items.push({ to: '/staff/cleanroute', label: 'CleanRoute', icon: Truck, tone: 'forest' })
  items.push({ to: '/city-in-motion', label: 'City in Motion (3D)', icon: MapIcon, tone: 'saffron' })
  if (role === 'admin') {
    items.push({ to: '/staff/admin/users', label: 'Users', icon: Users, group: 'Administration', tone: 'plum' })
    items.push({ to: '/staff/admin/config', label: 'Configuration', icon: SlidersHorizontal, tone: 'civic' })
    items.push({ to: '/staff/admin/rewards', label: 'Rewards', icon: Gift, tone: 'forest' })
    items.push({ to: '/staff/admin/audit', label: 'Audit log', icon: ScrollText, tone: 'saffron' })
  }
  return items
}

function titleFor(pathname) {
  if (pathname.startsWith('/staff/tickets')) return 'Ticket detail'
  if (pathname.startsWith('/staff/queue')) return 'Priority queue'
  if (pathname.startsWith('/staff/analytics')) return 'Analytics'
  if (pathname.startsWith('/staff/worker')) return 'My tasks'
  if (pathname.startsWith('/staff/cleanroute')) return 'CleanRoute operations'
  if (pathname.startsWith('/staff/admin/users')) return 'Users'
  if (pathname.startsWith('/staff/admin/config')) return 'Configuration'
  if (pathname.startsWith('/staff/admin/rewards')) return 'Rewards'
  if (pathname.startsWith('/staff/admin/audit')) return 'Audit log'
  return 'Command centre'
}

/** `compact` = icon-only (lg..xl); labels reappear from xl. Mobile menu always shows labels. */
function NavList({ items, accent, onNavigate, compact }) {
  return (
    <nav aria-label="Staff navigation" className="space-y-0.5">
      {items.map((it) => (
        <div key={it.to}>
          {it.group && (
            <>
              <p className={cn('px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-muted', compact && 'hidden xl:block')}>{it.group}</p>
              {compact && <div className="mx-2 my-2 border-t border-line xl:hidden" aria-hidden />}
            </>
          )}
          <NavLink
            to={it.to}
            end={it.end}
            onClick={onNavigate}
            title={it.label}
            className={({ isActive }) => cn(
              'group flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-[13px] font-semibold transition-colors',
              compact && 'justify-center xl:justify-start',
              isActive ? `${accent.soft} ${accent.text}` : 'text-ink/80 hover:bg-paper hover:text-ink',
            )}
          >
            {({ isActive }) => (
              <>
                {isActive
                  ? <span className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white', accent.bg)}><it.icon className="h-3.5 w-3.5" aria-hidden /></span>
                  : <IconTile icon={it.icon} tone={it.tone} size="sm" />}
                <span className={cn('truncate', compact && 'hidden xl:inline')}>{it.label}</span>
              </>
            )}
          </NavLink>
        </div>
      ))}
    </nav>
  )
}

export default function StaffLayout() {
  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)
  const meta = useMeta((s) => s.meta)
  const departmentName = useMeta((s) => s.departmentName)
  const loc = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  useEffect(() => { setOpen(false) }, [loc.pathname])

  const role = user?.role || 'officer'
  const accent = accentFor(role)
  const items = useMemo(() => navFor(role), [role])
  const dept = user?.department_code && meta ? departmentName(user.department_code) : user?.department_code
  const scopeLabel = dept || 'All departments'
  const who = user?.display_name || user?.email || 'Staff'

  const signOut = () => { logout(); navigate('/login', { replace: true }) }

  return (
    <div className="app-shell">
      <a href="#staff-main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[5000] focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>

      {/* Top bar */}
      <header className="relative z-30 shrink-0 border-b border-line bg-surface">
        <div className="flex h-12 items-center gap-3 px-3 lg:px-4">
          <div className="flex shrink-0 items-center gap-2.5 xl:w-[200px]">
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-[10px] text-white', accent.bg)}><Landmark className="h-4 w-4" aria-hidden /></span>
            <div className="hidden leading-tight sm:block">
              <p className="font-display text-[15px] font-extrabold text-ink">CivicLens</p>
              <p className={cn('text-[10px] font-bold uppercase tracking-wide', accent.text)}>Command centre</p>
            </div>
          </div>
          <div className="hidden min-w-0 items-center gap-2 border-l border-line pl-4 lg:flex">
            <h2 className="truncate font-display text-[15px] font-bold text-ink">{titleFor(loc.pathname)}</h2>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <DemoTag className="hidden sm:inline-flex" />
            <div className="hidden min-w-0 text-right leading-tight md:block">
              <p className="max-w-[180px] truncate text-[13px] font-semibold text-ink">{who}</p>
              <p className="max-w-[180px] truncate text-[11px] text-muted"><span className={cn('font-semibold', accent.text)}>{accent.name}</span> · {scopeLabel}</p>
            </div>
            <Avatar name={who} solid={cn(accent.bg, 'text-white')} />
            <button onClick={signOut} title="Sign out" aria-label="Sign out" className="hidden h-8 w-8 items-center justify-center rounded-lg border border-line-strong text-ink hover:bg-paper lg:inline-flex">
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="staff-mobile-menu"
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="rounded-lg border border-line-strong p-1.5 text-ink hover:bg-paper lg:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {/* Mobile slide-down menu */}
        <div id="staff-mobile-menu" className={cn('absolute inset-x-0 top-full z-40 overflow-y-auto border-b border-line bg-surface shadow-[0_8px_16px_rgba(0,0,0,0.06)] transition-[max-height] duration-200 lg:hidden', open ? 'max-h-[80vh]' : 'max-h-0 border-b-0')}>
          <div className="space-y-3 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">{who}</p>
              <p className="text-xs text-muted">{accent.name} · {scopeLabel}</p>
            </div>
            <NavList items={items} accent={accent} onNavigate={() => setOpen(false)} />
            <div className="flex items-center justify-between border-t border-line pt-3">
              <DemoTag />
              <button onClick={signOut} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-sm font-semibold hover:bg-paper">
                <LogOut className="h-4 w-4" aria-hidden /> Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-14 shrink-0 flex-col border-r border-line bg-surface lg:flex xl:w-56">
          <div className="flex-1 overflow-y-auto px-2 py-3"><NavList items={items} accent={accent} compact /></div>
          <div className="hidden border-t border-line px-3 py-2.5 text-[11px] leading-snug text-muted xl:block">
            <DemoTag />
            <p className="mt-1.5">Prototype with sample data. SLA targets are sample configuration, not official commitments.</p>
          </div>
        </aside>

        <main id="staff-main" className="shell-main min-w-0 p-3 lg:p-4">
          <PageBoundary><Outlet /></PageBoundary>
        </main>
      </div>
    </div>
  )
}
