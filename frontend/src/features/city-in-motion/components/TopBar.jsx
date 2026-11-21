// Slim top bar: logo, view switch (Civic issues | CleanRoute), role-aware links, language switcher.
import { Link } from 'react-router-dom'
import { LayoutDashboard, LogIn, PanelLeft, PlusCircle } from 'lucide-react'
import Logo from '../../../components/Logo'
import LanguageSwitcher from '../../../components/LanguageSwitcher'
import { cn } from '../../../components/ui'

const VIEWS = [{ id: 'issues', label: 'Civic issues' }, { id: 'cleanroute', label: 'CleanRoute' }]

export default function TopBar({ view, onView, user, homePath, railOpen, onToggleRail }) {
  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-2.5 sm:gap-3 sm:px-4">
      <button
        type="button"
        onClick={onToggleRail}
        aria-label="Layers and filters"
        aria-expanded={railOpen}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-paper lg:hidden"
      >
        <PanelLeft className="h-5 w-5" aria-hidden />
      </button>
      <Link to="/" aria-label="CivicLens home" className="shrink-0 rounded-lg">
        <Logo className="hidden sm:inline-flex" />
        <Logo compact className="sm:hidden" />
      </Link>
      <span className="hidden font-display text-sm font-bold text-muted md:inline" aria-hidden>/&nbsp; City in Motion</span>

      <div role="group" aria-label="Map view" className="ml-1 inline-flex rounded-[10px] border border-line-strong bg-paper p-0.5 sm:ml-3">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onView(v.id)}
            aria-pressed={view === v.id}
            className={cn('h-8 whitespace-nowrap rounded-[8px] px-2.5 text-[13px] font-semibold transition-colors sm:px-3.5', view === v.id ? 'bg-forest text-white' : 'text-ink hover:bg-surface')}
          >
            {v.label}
          </button>
        ))}
      </div>

      <nav aria-label="Account" className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {user?.role === 'citizen' && (
          <Link to="/app/report" className="hidden h-9 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-ink hover:bg-paper md:inline-flex">
            <PlusCircle className="h-4 w-4" aria-hidden /> Report an issue
          </Link>
        )}
        <LanguageSwitcher className="hidden sm:inline-flex" />
        {user ? (
          <Link to={homePath()} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-paper">
            <LayoutDashboard className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Dashboard</span><span className="sm:hidden">Home</span>
          </Link>
        ) : (
          <Link to="/login" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-forest px-3.5 text-sm font-semibold text-white hover:bg-forest-600">
            <LogIn className="h-4 w-4" aria-hidden /> Sign in
          </Link>
        )}
      </nav>
    </header>
  )
}
