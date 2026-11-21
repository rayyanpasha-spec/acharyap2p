// Accessible language select. Kannada first (local language), saved preference respected, never forced.
import { Languages } from 'lucide-react'
import { LANGS, useT } from '../lib/i18n'
import { cn } from './ui'

export default function LanguageSwitcher({ className }) {
  const { lang, setLang, t } = useT()
  return (
    <label className={cn('relative inline-flex items-center', className)}>
      <span className="sr-only">{t('lang.label', 'Language')}</span>
      <Languages className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted" aria-hidden />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        aria-label={t('lang.label', 'Language')}
        className="h-9 appearance-none rounded-[10px] border border-line-strong bg-surface pl-8 pr-7 text-sm font-medium text-ink hover:bg-paper"
      >
        {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
      <span className="pointer-events-none absolute right-2.5 text-[10px] text-muted" aria-hidden>▾</span>
    </label>
  )
}
