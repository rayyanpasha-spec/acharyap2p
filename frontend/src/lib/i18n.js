// Lightweight i18n. Six languages: en, kn, hi, ta, te, ml.
// Dictionaries live in src/i18n/*.js — each exports { en:{key:'..'}, kn:{...}, hi:{...}, ta:{...}, te:{...}, ml:{...} }.
//   common.js  (owner: citizen-core agent)  navigation, auth, dashboard, statuses, severities, timeline
//   report.js  (owner: report-flow agent)   the whole "Report an issue" wizard
// Usage:  const { t, lang, setLang } = useT();  t('report.title', 'Report an issue')   // 2nd arg = English fallback
import { useCallback, useMemo } from 'react'
import { create } from 'zustand'
import common from '../i18n/common'
import report from '../i18n/report'

export const LANGS = [
  { code: 'kn', label: 'ಕನ್ನಡ' }, { code: 'en', label: 'English' }, { code: 'hi', label: 'हिन्दी' },
  { code: 'ta', label: 'தமிழ்' }, { code: 'te', label: 'తెలుగు' }, { code: 'ml', label: 'മലയാളം' },
]
const DICTS = [common, report]
const KEY = 'civiclens.lang'

function detect() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && LANGS.some((l) => l.code === saved)) return saved
  } catch { /* ignore */ }
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase()
  return LANGS.some((l) => l.code === nav) ? nav : 'en'   // respect browser locale; never force Kannada
}

export const useLang = create((set) => ({
  lang: detect(),
  setLang(lang) {
    try { localStorage.setItem(KEY, lang) } catch { /* ignore */ }
    document.documentElement.lang = lang
    set({ lang })
  },
}))

export function translate(lang, key, fallback) {
  for (const d of DICTS) {
    const v = d?.[lang]?.[key]
    if (v != null) return v
  }
  for (const d of DICTS) {
    const v = d?.en?.[key]
    if (v != null) return v
  }
  return fallback ?? key
}

export function useT() {
  const lang = useLang((s) => s.lang)
  const setLang = useLang((s) => s.setLang)
  // `t` and the returned object keep the SAME identity until the language changes. Pages list `t` in useCallback/useEffect
  // dependencies; a new function on every render made those effects refetch on every render (an endless "Loading..." loop).
  const t = useCallback((key, fallback) => translate(lang, key, fallback), [lang])
  return useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
}
