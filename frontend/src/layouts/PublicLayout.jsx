// Public shell.
//  /            transparent header floating over the hero photo, turns white + 1px border after ~40px of scroll
//  /login,/register   no header/footer: those pages render <AuthShell> (full-screen split: photo left, form right)
//  others       solid sticky header + slim footer
import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ArrowLeft, Check, Menu, ShieldAlert, X } from 'lucide-react'
import Logo from '../components/Logo'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { Button, cn } from '../components/ui'
import { useAuth } from '../store/auth'
import { useMeta } from '../store/meta'
import { useT } from '../lib/i18n'

export const HERO_IMG = '/images/vidhana-soudha.jpg'
/** One flat dark scrim colour used over the photo everywhere (no gradients). White text on it is >= 4.5:1. */
export const SCRIM = 'rgba(14, 32, 24, 0.64)'
/** Saffron CTA tuned for >= 4.5:1 with white text (the stock `accent` Button variant is ~3.5:1). */
export const CTA_ACCENT = 'inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#a45f20] font-semibold text-white transition-colors hover:bg-[#8f511a]'
export const CTA_OUTLINE = 'inline-flex items-center justify-center gap-2 rounded-[10px] border-2 border-white font-semibold text-white transition-colors hover:bg-white/15'

export default function PublicLayout() {
  const { t } = useT()
  const { pathname } = useLocation()
  const user = useAuth((s) => s.user)
  const homePath = useAuth((s) => s.homePath)
  const meta = useMeta((s) => s.meta)
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const isHome = pathname === '/'
  const isAuth = pathname === '/login' || pathname === '/register'

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useEffect(() => { setOpen(false) }, [pathname])

  const skip = (
    <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
      {t('a11y.skip', 'Skip to content')}
    </a>
  )

  if (isAuth) {
    return (<>{skip}<main id="main"><Outlet /></main></>)
  }

  const solid = !isHome || scrolled || open
  const links = [
    { to: { pathname: '/', hash: '#how' }, label: t('nav.howItWorks', 'How it works') },
    { to: { pathname: '/', hash: '#categories' }, label: t('nav.categories', 'What you can report') },
    { to: { pathname: '/', hash: '#who' }, label: t('nav.whoFor', 'Who it is for') },
    { to: '/city-in-motion', label: t('nav.cityInMotion', 'City in Motion') },
  ]
  const linkCls = cn('rounded-md px-3 py-2 text-sm font-semibold transition-colors',
    solid ? 'text-ink/80 hover:bg-forest-50 hover:text-forest' : 'text-white hover:bg-white/15')

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper">
      {skip}
      <header className={cn('z-40 border-b transition-colors duration-200', isHome ? 'fixed inset-x-0 top-0' : 'sticky top-0', solid ? 'border-line bg-surface' : 'border-transparent bg-transparent')}>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link to="/" aria-label="CivicLens home" className="shrink-0 rounded-md"><Logo light={!solid} /></Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Primary">
            {links.map((l) => <Link key={l.label} to={l.to} className={linkCls}>{l.label}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <div className="hidden items-center gap-2 sm:flex">
              {user ? (
                solid
                  ? <Button as={Link} to={homePath()}>{t('nav.dashboard', 'Open my dashboard')}</Button>
                  : <Link to={homePath()} className={cn(CTA_ACCENT, 'h-10 px-4 text-sm')}>{t('nav.dashboard', 'Open my dashboard')}</Link>
              ) : solid ? (
                <>
                  <Button as={Link} to="/login" variant="secondary">{t('btn.login', 'Log in')}</Button>
                  <Button as={Link} to="/register">{t('btn.register', 'Register')}</Button>
                </>
              ) : (
                <>
                  <Link to="/login" className={cn(CTA_OUTLINE, 'h-10 px-4 text-sm')}>{t('btn.login', 'Log in')}</Link>
                  <Link to="/register" className={cn(CTA_ACCENT, 'h-10 px-4 text-sm')}>{t('btn.register', 'Register')}</Link>
                </>
              )}
            </div>
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'}
              className={cn('inline-flex h-9 w-9 items-center justify-center rounded-[10px] border md:hidden', solid ? 'border-line-strong bg-surface text-ink' : 'border-white/70 text-white')}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open && (
          <div className="border-t border-line bg-surface px-4 pb-4 pt-2 md:hidden">
            <nav className="flex flex-col" aria-label="Mobile">
              {links.map((l) => <Link key={l.label} to={l.to} onClick={() => setOpen(false)} className={cn(linkCls, 'py-3')}>{l.label}</Link>)}
            </nav>
            <div className="mt-3 flex gap-2 sm:hidden">
              {user ? (
                <Button as={Link} to={homePath()} className="flex-1" onClick={() => setOpen(false)}>{t('nav.dashboard', 'Open my dashboard')}</Button>
              ) : (
                <>
                  <Button as={Link} to="/login" variant="secondary" className="flex-1" onClick={() => setOpen(false)}>{t('btn.login', 'Log in')}</Button>
                  <Button as={Link} to="/register" className="flex-1" onClick={() => setOpen(false)}>{t('btn.register', 'Register')}</Button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main id="main" className="flex-1"><Outlet /></main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Logo />
            <span className="text-sm font-semibold text-ink">{t('footer.pilot', 'Bengaluru, Karnataka pilot')}</span>
            <span className="text-xs text-muted">{t('pub.footerNote', 'Prototype: demo data and simulated CleanRoute GPS are labelled.')}</span>
          </div>
          <div className="flex items-start gap-2 rounded-[10px] border border-critical/25 bg-critical-100 px-3 py-2 text-xs text-ink md:max-w-md">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden />
            <p>{meta?.emergency_notice || t('footer.emergency', 'CivicLens is not an emergency service. In an emergency, call 112.')}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

/** Full-screen split used by /login and /register: photo + value statement on the left (lg+), form card on the right.
 *  Fits one screen on desktop; the right column only scrolls as a fallback on very short windows. */
export function AuthShell({ lead, children }) {
  const { t } = useT()
  const bullets = [t('pub.b1', 'Report in Kannada, English, Hindi, Tamil, Telugu or Malayalam'), t('pub.b2', 'AI-assisted triage, routed to the right department'), t('pub.b3', 'Track every ticket until the fix is verified')]
  return (
    <div className="grid min-h-[100dvh] grid-rows-[auto_1fr] lg:h-[100dvh] lg:grid-cols-2 lg:grid-rows-1 lg:overflow-hidden">
      {/* photo side (full panel on lg+, slim brand bar on small screens) */}
      <aside className="relative overflow-hidden bg-forest text-white">
        <img src={HERO_IMG} alt="" aria-hidden="true" className="absolute inset-0 hidden h-full w-full object-cover lg:block" style={{ objectPosition: '72% center' }} />
        <div className="absolute inset-0 hidden lg:block" style={{ background: SCRIM }} aria-hidden />
        <div className="relative flex h-full flex-col justify-between gap-6 px-4 py-3 lg:px-10 lg:py-9">
          <div className="flex items-center justify-between">
            <Link to="/" aria-label="CivicLens home" className="rounded-md"><Logo light size="lg" /></Link>
            <div className="lg:hidden"><LanguageSwitcher /></div>
          </div>
          <div className="hidden max-w-md lg:block">
            <h2 className="font-display text-[34px] font-extrabold leading-[1.12] tracking-tight">{lead}</h2>
            <ul className="mt-6 space-y-3">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-[15px] leading-snug">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-saffron text-white"><Check className="h-3 w-3" strokeWidth={3} aria-hidden /></span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <p className="hidden self-start rounded-full bg-black/45 px-3 py-1 text-xs font-semibold text-white lg:block">{t('pub.photoCredit', 'Vidhana Soudha, Bengaluru')}</p>
        </div>
      </aside>

      {/* form side */}
      <div className="flex min-h-0 flex-col overflow-y-auto bg-paper">
        <div className="flex shrink-0 items-center justify-between px-4 pt-4 sm:px-8 lg:pt-5">
          <Link to="/" className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-civic hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />{t('pub.authBack', 'Back to home')}</Link>
          <div className="hidden lg:block"><LanguageSwitcher /></div>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-4 sm:px-8">
          <div className="w-full max-w-[440px]">{children}</div>
        </div>
      </div>
    </div>
  )
}
