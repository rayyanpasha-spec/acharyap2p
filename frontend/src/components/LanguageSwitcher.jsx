// Accessible language select. Kannada first (local language), saved preference respected, never forced.
import { ChevronDown, Languages } from 'lucide-react'
import { LANGS, useT } from '../lib/i18n'
import { cn } from './ui'

export default function LanguageSwitcher({ className }) {
  const { lang, setLang, t } = useT()
  return (
    <label className={cn('relative inline-flex items-center', className)}>
      <span className="sr-only">{t('lang.label', 'Language')}</span>
      <Languages className="pointer-events-none absolute left-2.5 h-4 w-4 text-forest" aria-hidden />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        aria-label={t('lang.label', 'Language')}
        className="h-9 cursor-pointer appearance-none rounded-[10px] border border-line-strong bg-surface pl-8 pr-7 text-[13px] font-semibold text-ink transition-colors hover:bg-paper"
      >
        {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted" aria-hidden />
    </label>
  )
}
