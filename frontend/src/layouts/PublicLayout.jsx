// Public shell: header (logo, anchors, language, auth buttons) + footer with the emergency notice.
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Menu, X, ShieldAlert } from 'lucide-react'
import Logo from '../components/Logo'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { Button, cn } from '../components/ui'
import { useAuth } from '../store/auth'
import { useMeta } from '../store/meta'
import { useT } from '../lib/i18n'

export default function PublicLayout() {
  const { t } = useT()
  const user = useAuth((s) => s.user)
  const homePath = useAuth((s) => s.homePath)
  const meta = useMeta((s) => s.meta)
  const [open, setOpen] = useState(false)

  const links = [
    { to: { pathname: '/', hash: '#how' }, label: t('nav.howItWorks', 'How it works') },
    { to: { pathname: '/', hash: '#categories' }, label: t('nav.categories', 'What you can report') },
    { to: { pathname: '/', hash: '#who' }, label: t('nav.whoFor', 'Who it is for') },
    { to: '/city-in-motion', label: t('nav.cityInMotion', 'City in Motion') },
  ]
  const linkCls = 'rounded-md px-3 py-2 text-sm font-medium text-ink/80 hover:bg-forest-50 hover:text-forest'

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        {t('a11y.skip', 'Skip to content')}
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link to="/" aria-label="CivicLens home" className="shrink-0"><Logo /></Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Primary">
            {links.map((l) => <Link key={l.label} to={l.to} className={linkCls}>{l.label}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <div className="hidden items-center gap-2 sm:flex">
              {user ? (
                <Button as={Link} to={homePath()} size="md">{t('nav.dashboard', 'Open my dashboard')}</Button>
              ) : (
                <>
                  <Button as={Link} to="/login" variant="secondary">{t('btn.login', 'Log in')}</Button>
                  <Button as={Link} to="/register">{t('btn.register', 'Register')}</Button>
                </>
              )}
            </div>
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-line-strong md:hidden">
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
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="max-w-md">
              <Logo />
              <p className="mt-2 text-sm text-muted">{t('footer.pilot', 'Bengaluru, Karnataka pilot')}</p>
              <p className="mt-1 text-xs text-muted">{t('footer.prototype', 'Prototype: demo data and simulated CleanRoute GPS are labelled.')}</p>
            </div>
            <div className="flex max-w-md items-start gap-2 rounded-[10px] border border-critical/25 bg-critical-100 px-4 py-3 text-sm text-ink">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden />
              <p>{meta?.emergency_notice || t('footer.emergency', 'CivicLens is not an emergency service. In an emergency, call 112.')}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-4 text-xs text-muted">
            <span>{t('footer.pilot', 'Bengaluru, Karnataka pilot')}</span>
            <NavLink to="/login" className="hover:text-forest">{t('btn.login', 'Log in')}</NavLink>
            <NavLink to="/register" className="hover:text-forest">{t('btn.register', 'Register')}</NavLink>
          </div>
        </div>
      </footer>
    </div>
  )
}
