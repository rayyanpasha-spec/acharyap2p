// Municipal command centre shell: fixed sidebar on desktop, top bar with slide-down menu on mobile.
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3, ClipboardList, LayoutDashboard, ListChecks, LogOut, Menu, ScrollText, SlidersHorizontal, Truck, Users, X, Landmark, Map as MapIcon,
} from 'lucide-react'
import { useAuth } from '../store/auth'
import { useMeta } from '../store/meta'
import { Badge, DemoTag, cn } from '../components/ui'
import { accentFor } from '../features/staff/common'

function navFor(role) {
  const items = []
  if (role !== 'worker') items.push({ to: '/staff', label: 'Dashboard', icon: LayoutDashboard, end: true })
  if (role !== 'worker') items.push({ to: '/staff/queue', label: 'Priority queue', icon: ListChecks })
  if (role === 'worker') items.push({ to: '/staff/worker', label: 'My tasks', icon: ClipboardList })
  if (role !== 'worker') items.push({ to: '/staff/analytics', label: 'Analytics', icon: BarChart3 })
  items.push({ to: '/staff/cleanroute', label: 'CleanRoute', icon: Truck })
  items.push({ to: '/city-in-motion', label: 'City in Motion (3D)', icon: MapIcon })
  if (role === 'admin') {
    items.push({ to: '/staff/admin/users', label: 'Users', icon: Users, group: 'Administration' })
    items.push({ to: '/staff/admin/config', label: 'Configuration', icon: SlidersHorizontal })
    items.push({ to: '/staff/admin/audit', label: 'Audit log', icon: ScrollText })
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
  if (pathname.startsWith('/staff/admin/audit')) return 'Audit log'
  return 'Command centre'
}

function NavList({ items, accent, onNavigate }) {
  return (
    <nav aria-label="Staff navigation" className="space-y-0.5">
      {items.map((it) => (
        <div key={it.to}>
          {it.group && <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-muted">{it.group}</p>}
          <NavLink
            to={it.to}
            end={it.end}
            onClick={onNavigate}
            className={({ isActive }) => cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
              isActive ? `${accent.soft} ${accent.text}` : 'text-ink/80 hover:bg-paper hover:text-ink',
            )}
          >
            <it.icon className="h-4 w-4 shrink-0" aria-hidden />
            {it.label}
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
  const scopeLabel = dept || (role === 'officer' ? 'All departments' : 'All departments')

  const signOut = () => { logout(); navigate('/login', { replace: true }) }

  const Logo = (
    <div className="flex items-center gap-2.5">
      <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-white', accent.bg)}><Landmark className="h-4 w-4" aria-hidden /></span>
      <div className="leading-tight">
        <p className="font-display text-[15px] font-extrabold text-ink">CivicLens</p>
        <p className={cn('text-[11px] font-bold uppercase tracking-wide', accent.text)}>Command centre</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-paper">
      <a href="#staff-main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[5000] focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className={cn('flex h-14 items-center border-b border-line border-t-[3px] px-4', accent.border)}>{Logo}</div>
        <div className="flex-1 overflow-y-auto px-3 py-4"><NavList items={items} accent={accent} /></div>
        <div className="border-t border-line p-4 text-xs text-muted">
          <DemoTag />
          <p className="mt-2 leading-snug">Prototype with sample data. SLA targets are sample configuration, not official commitments.</p>
        </div>
      </aside>

      {/* Top bar (mobile: logo + menu button; desktop: page title + user) */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface lg:ml-60">
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="lg:hidden">{Logo}</div>
            <h2 className="hidden truncate font-display text-base font-bold text-ink lg:block">{titleFor(loc.pathname)}</h2>
          </div>
          <div className="flex items-center gap-3">
            <DemoTag className="hidden sm:inline-flex" />
            <div className="hidden min-w-0 text-right leading-tight md:block">
              <p className="truncate text-sm font-semibold text-ink">{user?.display_name || user?.email}</p>
              <p className="truncate text-xs text-muted">{scopeLabel}</p>
            </div>
            <Badge tone={accent.tone}>{accent.name}</Badge>
            <button onClick={signOut} className="hidden items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper lg:inline-flex">
              <LogOut className="h-4 w-4" aria-hidden /> Sign out
            </button>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="staff-mobile-menu"
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="rounded-lg border border-line-strong p-2 text-ink hover:bg-paper lg:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {/* Mobile slide-down menu */}
        <div id="staff-mobile-menu" className={cn('overflow-hidden border-t border-line bg-surface transition-[max-height] duration-200 lg:hidden', open ? 'max-h-[80vh]' : 'max-h-0 border-t-0')}>
          <div className="space-y-3 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">{user?.display_name || user?.email}</p>
              <p className="text-xs text-muted">{scopeLabel}</p>
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

      <main id="staff-main" className="lg:ml-60">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
