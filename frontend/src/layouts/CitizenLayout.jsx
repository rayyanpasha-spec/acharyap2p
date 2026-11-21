// Citizen app shell (fixed-size): compact top bar, scrolling-free <main> on desktop (pages scroll inside their panels),
// 1-line emergency strip at the very bottom, and a bottom tab bar + "More" sheet on mobile.
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, FilePlus2, ClipboardList, Truck, MoreHorizontal, Gamepad2, Trophy, Award, Bell, User, LogOut, ShieldAlert, ChevronDown, X, Map as MapIcon,
} from 'lucide-react'
import Logo from '../components/Logo'
import LanguageSwitcher from '../components/LanguageSwitcher'
import NotificationBell from '../components/NotificationBell'
import { IconTile, cn } from '../components/ui'
import { useAuth } from '../store/auth'
import { useMeta } from '../store/meta'
import { useT } from '../lib/i18n'

const initials = (u) => {
  const src = (u?.display_name || u?.email || '?').trim()
  const parts = src.split(/\s+/).filter(Boolean)
  const s = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : src.slice(0, 2)
  return s.toUpperCase()
}

export default function CitizenLayout() {
  const { t } = useT()
  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)
  const meta = useMeta((s) => s.meta)
  const navigate = useNavigate()
  const loc = useLocation()
  const [menu, setMenu] = useState(false)
  const [more, setMore] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => { setMenu(false); setMore(false) }, [loc.pathname])
  useEffect(() => {
    if (!menu) return
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false) }
    const k = (e) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [menu])

  const signOut = () => { logout(); navigate('/', { replace: true }) }
  const emergency = meta?.emergency_notice || t('footer.emergency', 'CivicLens is not an emergency service. In an emergency, call 112.')

  const main = [
    { to: '/app', end: true, label: t('nav.home', 'Home'), icon: Home },
    { to: '/app/report', label: t('nav.report', 'Report'), icon: FilePlus2 },
    { to: '/app/complaints', label: t('nav.reports', 'My reports'), icon: ClipboardList },
    { to: '/app/cleanroute', label: t('nav.cleanroute', 'CleanRoute'), icon: Truck },
  ]
  const cim = { to: '/city-in-motion', label: t('nav.cityInMotion', 'City in Motion'), icon: MapIcon }
  const verse = { to: '/app/civicverse', label: t('nav.civicverse', 'CivicVerse'), icon: Gamepad2 }
  const extra = [
    { ...cim, tone: 'civic' },
    { ...verse, tone: 'teal' },
    { to: '/app/achievements', label: t('nav.achievements', 'Achievements'), icon: Trophy, tone: 'saffron' },
    { to: '/app/certificates', label: t('nav.certificates', 'Certificates'), icon: Award, tone: 'forest' },
    { to: '/app/notifications', label: t('nav.notifications', 'Notifications'), icon: Bell, tone: 'plum' },
    { to: '/app/profile', label: t('nav.profile', 'Profile'), icon: User, tone: 'civic' },
  ]
  const desktopLinks = [...main, cim, verse]
  const moreActive = extra.some((e) => e.to !== '/city-in-motion' && loc.pathname.startsWith(e.to))

  const deskCls = ({ isActive }) => cn(
    'inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition-colors xl:px-3',
    isActive ? 'bg-forest text-white' : 'text-ink/75 hover:bg-forest-50 hover:text-forest',
  )

  return (
    <div className="app-shell">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        {t('a11y.skip', 'Skip to content')}
      </a>

      <header className="z-40 h-14 shrink-0 border-b border-line bg-surface">
        <div className="flex h-full items-center gap-2 px-3 lg:gap-3 lg:px-4">
          <Link to="/app" aria-label="CivicLens home" className="shrink-0"><Logo /></Link>
          <nav className="ml-2 hidden items-center gap-0.5 lg:flex" aria-label="Primary">
            {desktopLinks.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={deskCls}>
                <l.icon className="hidden h-4 w-4 xl:block" aria-hidden />{l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <NotificationBell />
            <div className="relative" ref={menuRef}>
              <button type="button" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}
                aria-label={`${t('nav.profile', 'Profile')}: ${user?.display_name || ''}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line-strong bg-surface pl-1 pr-1.5 transition-colors hover:bg-paper">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-forest text-[11px] font-bold text-white" aria-hidden>{initials(user)}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
              </button>
              {menu && (
                <div role="menu" className="absolute right-0 z-50 mt-2 w-64 rounded-[12px] border border-line bg-surface p-1.5 shadow-[0_8px_24px_rgba(36,76,57,0.12)]">
                  <div className="flex items-center gap-2.5 border-b border-line px-2.5 py-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-forest text-xs font-bold text-white" aria-hidden>{initials(user)}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{user?.display_name}</p>
                      <p className="truncate text-xs text-muted">{user?.email}</p>
                    </div>
                  </div>
                  <div className="py-1">
                    <Link role="menuitem" to="/app/profile" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-forest-50"><IconTile icon={User} tone="civic" size="sm" />{t('nav.profile', 'Profile')}</Link>
                    <Link role="menuitem" to="/app/achievements" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-forest-50"><IconTile icon={Trophy} tone="saffron" size="sm" />{t('nav.achievements', 'Achievements')}</Link>
                    <Link role="menuitem" to="/app/certificates" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-forest-50"><IconTile icon={Award} tone="forest" size="sm" />{t('nav.certificates', 'Certificates')}</Link>
                  </div>
                  <button role="menuitem" type="button" onClick={signOut} className="flex w-full items-center gap-2.5 rounded-lg border-t border-line px-2.5 py-2 pt-2.5 text-left text-sm hover:bg-forest-50"><IconTile icon={LogOut} tone="critical" size="sm" />{t('btn.signout', 'Sign out')}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main id="main" className="shell-main p-3 lg:p-4"><Outlet /></main>

      {/* 1-line emergency notice (desktop). On mobile it lives in the More sheet. */}
      <div className="hidden h-7 shrink-0 items-center justify-between gap-4 border-t border-line bg-surface px-4 text-xs text-muted lg:flex">
        <p className="flex min-w-0 items-center gap-1.5 text-ink/80"><ShieldAlert className="h-3.5 w-3.5 shrink-0 text-critical" aria-hidden /><span className="truncate">{emergency}</span></p>
        <p className="shrink-0">{t('footer.pilot', 'Bengaluru, Karnataka pilot')}</p>
      </div>

      {/* mobile bottom tab bar */}
      <nav className="shrink-0 border-t border-line bg-surface lg:hidden" aria-label="Primary mobile">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {main.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} end={l.end}
                className={({ isActive }) => cn('flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-forest' : 'text-muted')}>
                {({ isActive }) => (
                  <>
                    <span className={cn('flex h-6 w-11 items-center justify-center rounded-full', isActive && 'bg-forest-100')}><l.icon className="h-[18px] w-[18px]" aria-hidden /></span>
                    <span className="max-w-full truncate px-1">{l.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more}
              className={cn('flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', moreActive ? 'text-forest' : 'text-muted')}>
              <span className={cn('flex h-6 w-11 items-center justify-center rounded-full', moreActive && 'bg-forest-100')}><MoreHorizontal className="h-[18px] w-[18px]" aria-hidden /></span>
              {t('nav.more', 'More')}
            </button>
          </li>
        </ul>
      </nav>

      {more && (
        <div className="fixed inset-0 z-[60] flex items-end bg-ink/40 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setMore(false)}>
          <div role="dialog" aria-modal="true" aria-label={t('nav.more', 'More')} className="max-h-[85vh] w-full overflow-y-auto rounded-t-[14px] border-t border-line bg-surface p-4 pb-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-bold">{t('nav.more', 'More')}</h2>
              <button type="button" onClick={() => setMore(false)} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-paper"><X className="h-5 w-5" /></button>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {extra.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="flex items-center gap-2.5 rounded-[12px] border border-line px-3 py-2.5 text-sm font-semibold hover:bg-forest-50">
                    <IconTile icon={l.icon} tone={l.tone} size="sm" />{l.label}
                  </Link>
                </li>
              ))}
              <li className="col-span-2">
                <button type="button" onClick={signOut} className="flex w-full items-center gap-2.5 rounded-[12px] border border-line px-3 py-2.5 text-sm font-semibold hover:bg-forest-50">
                  <IconTile icon={LogOut} tone="critical" size="sm" />{t('btn.signout', 'Sign out')}
                </button>
              </li>
            </ul>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-ink/80"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical" aria-hidden />{emergency}</p>
          </div>
        </div>
      )}
    </div>
  )
}
