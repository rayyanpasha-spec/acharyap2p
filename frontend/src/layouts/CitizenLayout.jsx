// Citizen app shell: sticky top bar (desktop nav), mobile bottom nav, outlet, footer emergency notice.
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, FilePlus2, ClipboardList, Truck, MoreHorizontal, Gamepad2, Trophy, Award, Bell, User, LogOut, ShieldAlert, ChevronDown, X, Map as MapIcon,
} from 'lucide-react'
import Logo from '../components/Logo'
import LanguageSwitcher from '../components/LanguageSwitcher'
import NotificationBell from '../components/NotificationBell'
import { cn } from '../components/ui'
import { useAuth } from '../store/auth'
import { useMeta } from '../store/meta'
import { useT } from '../lib/i18n'

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

  const main = [
    { to: '/app', end: true, label: t('nav.home', 'Home'), icon: Home },
    { to: '/app/report', label: t('nav.report', 'Report'), icon: FilePlus2 },
    { to: '/app/complaints', label: t('nav.reports', 'My reports'), icon: ClipboardList },
    { to: '/app/cleanroute', label: t('nav.cleanroute', 'CleanRoute'), icon: Truck },
  ]
  const extra = [
    { to: '/city-in-motion', label: t('nav.cityInMotion', 'City in Motion'), icon: MapIcon },
    { to: '/app/civicverse', label: t('nav.civicverse', 'CivicVerse'), icon: Gamepad2 },
    { to: '/app/achievements', label: t('nav.achievements', 'Achievements'), icon: Trophy },
    { to: '/app/certificates', label: t('nav.certificates', 'Certificates'), icon: Award },
    { to: '/app/notifications', label: t('nav.notifications', 'Notifications'), icon: Bell },
    { to: '/app/profile', label: t('nav.profile', 'Profile'), icon: User },
  ]
  const desktopLinks = [...main, extra[0], extra[1], extra[3]]
  const moreActive = extra.some((e) => loc.pathname.startsWith(e.to))

  const deskCls = ({ isActive }) => cn(
    'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors',
    isActive ? 'bg-forest-100 text-forest' : 'text-ink/75 hover:bg-forest-50 hover:text-forest',
  )

  return (
    <div className="flex min-h-screen flex-col bg-paper pb-16 md:pb-0">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        {t('a11y.skip', 'Skip to content')}
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to="/app" aria-label="CivicLens home" className="shrink-0"><Logo /></Link>
          <nav className="ml-3 hidden items-center gap-0.5 md:flex" aria-label="Primary">
            {desktopLinks.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={(st) => cn(deskCls(st), l.to === '/app/certificates' && 'hidden lg:inline-flex')}>
                <l.icon className="h-4 w-4" aria-hidden /> {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <NotificationBell />
            <div className="relative" ref={menuRef}>
              <button type="button" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}
                aria-label={`${t('nav.profile', 'Profile')}: ${user?.display_name || ''}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line-strong bg-surface pl-1.5 pr-2 hover:bg-paper">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-forest text-xs font-bold text-white" aria-hidden>
                  {(user?.display_name || user?.email || '?').trim().charAt(0).toUpperCase()}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
              </button>
              {menu && (
                <div role="menu" className="absolute right-0 mt-2 w-60 rounded-[10px] border border-line bg-surface p-1.5">
                  <div className="border-b border-line px-3 py-2">
                    <p className="truncate text-sm font-semibold">{user?.display_name}</p>
                    <p className="truncate text-xs text-muted">{user?.email}</p>
                  </div>
                  <Link role="menuitem" to="/app/achievements" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-forest-50"><Trophy className="h-4 w-4 text-saffron" aria-hidden />{t('nav.achievements', 'Achievements')}</Link>
                  <Link role="menuitem" to="/app/certificates" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-forest-50"><Award className="h-4 w-4 text-forest" aria-hidden />{t('nav.certificates', 'Certificates')}</Link>
                  <Link role="menuitem" to="/app/profile" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-forest-50"><User className="h-4 w-4 text-forest" aria-hidden />{t('nav.profile', 'Profile')}</Link>
                  <button role="menuitem" type="button" onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-forest-50"><LogOut className="h-4 w-4 text-muted" aria-hidden />{t('btn.signout', 'Sign out')}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:py-7"><Outlet /></main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-1.5 text-ink/80"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical" aria-hidden />{meta?.emergency_notice || t('footer.emergency', 'CivicLens is not an emergency service. In an emergency, call 112.')}</p>
          <p>{t('footer.pilot', 'Bengaluru, Karnataka pilot')}</p>
        </div>
      </footer>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface md:hidden" aria-label="Primary mobile">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {main.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} end={l.end}
                className={({ isActive }) => cn('flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-forest' : 'text-muted')}>
                {({ isActive }) => (
                  <>
                    <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', isActive && 'bg-forest-100')}><l.icon className="h-5 w-5" aria-hidden /></span>
                    <span className="max-w-full truncate px-1">{l.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more}
              className={cn('flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', moreActive ? 'text-forest' : 'text-muted')}>
              <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', moreActive && 'bg-forest-100')}><MoreHorizontal className="h-5 w-5" aria-hidden /></span>
              {t('nav.more', 'More')}
            </button>
          </li>
        </ul>
      </nav>

      {more && (
        <div className="fixed inset-0 z-[60] flex items-end bg-ink/40 md:hidden" onMouseDown={(e) => e.target === e.currentTarget && setMore(false)}>
          <div role="dialog" aria-modal="true" aria-label={t('nav.more', 'More')} className="w-full rounded-t-[14px] border-t border-line bg-surface p-4 pb-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-base font-bold">{t('nav.more', 'More')}</h2>
              <button type="button" onClick={() => setMore(false)} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-paper"><X className="h-5 w-5" /></button>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {extra.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="flex items-center gap-2 rounded-[10px] border border-line px-3 py-3 text-sm font-semibold hover:bg-forest-50">
                    <l.icon className="h-4 w-4 text-forest" aria-hidden />{l.label}
                  </Link>
                </li>
              ))}
              <li>
                <button type="button" onClick={signOut} className="flex w-full items-center gap-2 rounded-[10px] border border-line px-3 py-3 text-sm font-semibold hover:bg-forest-50">
                  <LogOut className="h-4 w-4 text-muted" aria-hidden />{t('btn.signout', 'Sign out')}
                </button>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
