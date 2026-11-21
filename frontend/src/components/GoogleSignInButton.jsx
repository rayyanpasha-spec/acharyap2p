// "Continue with Google" / "Sign up with Google" via Google Identity Services (GIS).
// The OAuth client id is NOT in source: it comes from GET /auth/config. The ID token (credential) is handed straight to
// useAuth().googleSignIn and is never stored or logged here.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { api, errMsg } from '../lib/api'
import { useAuth } from '../store/auth'
import { useT } from '../lib/i18n'
import { toast } from './ui'

const GIS_SRC = 'https://accounts.google.com/gsi/client'

/* ---- module-scope caches: /auth/config is fetched once, the GIS script is loaded once ---- */
let configPromise = null
function loadConfig() {
  if (!configPromise) {
    configPromise = api.get('/auth/config').then((r) => r.data || {}).catch((e) => { configPromise = null; throw e })
  }
  return configPromise
}

let gisPromise = null
function loadGis() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const fail = (s) => { gisPromise = null; s?.remove(); reject(new Error('gis-load-failed')) }
      let s = document.querySelector(`script[src="${GIS_SRC}"]`)
      if (s) s.remove()                       // a previous failed/blocked tag: start clean
      s = document.createElement('script')
      s.src = GIS_SRC
      s.async = true
      s.defer = true
      s.onload = () => (window.google?.accounts?.id ? resolve(window.google) : fail(s))
      s.onerror = () => fail(s)
      document.head.appendChild(s)
    })
  }
  return gisPromise
}

function OrDivider({ label }) {
  return (
    <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-muted" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-line-strong" /><span>{label}</span><span className="h-px flex-1 bg-line-strong" />
    </div>
  )
}

/**
 * mode: 'signin' | 'signup' (button wording).  redirectTo: where to go afterwards (default: the user's home).
 * divider: also render the "or" separator below the block (only when Google is actually available, so no orphan divider).
 */
export default function GoogleSignInButton({ mode = 'signin', redirectTo, divider = false, className = '' }) {
  const { t, lang } = useT()
  const navigate = useNavigate()
  const googleSignIn = useAuth((s) => s.googleSignIn)
  const slotRef = useRef(null)
  const handlerRef = useRef(null)
  const [cfg, setCfg] = useState(null)        // null = loading
  const [phase, setPhase] = useState('loading') // loading | off | ready | blocked
  const [width, setWidth] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // keep the latest credential handler without re-initialising GIS
  handlerRef.current = async (credential) => {
    if (!credential) return
    setError('')
    setBusy(true)
    try {
      const { is_new } = await googleSignIn(credential, lang)
      if (is_new) toast.success(t('pub.welcome', 'Welcome to CivicLens'))
      navigate(redirectTo || useAuth.getState().homePath(), { replace: true })
    } catch (e) {
      setError(errMsg(e, t('pub.googleFailed', 'Google sign-in failed. Please try again.')))
      setBusy(false)
    }
  }

  // 1) config
  useEffect(() => {
    let off = false
    loadConfig()
      .then((c) => { if (off) return; setCfg(c); setPhase(c.google_enabled && c.google_client_id ? 'ready' : 'off') })
      .catch(() => { if (!off) setPhase('off') })
    return () => { off = true }
  }, [])

  // 2) track the slot width (GIS wants a pixel width between 200 and 400)
  useEffect(() => {
    const el = slotRef.current
    if (!el || phase === 'off') return undefined
    const measure = () => setWidth(Math.max(200, Math.min(400, Math.round(el.getBoundingClientRect().width))))
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase])

  // 3) load GIS and render the official button
  const clientId = cfg?.google_client_id
  useEffect(() => {
    if (phase !== 'ready' || !clientId || !width) return undefined
    let off = false
    const host = slotRef.current?.querySelector('[data-gis-host]')
    loadGis()
      .then((google) => {
        if (off || !host) return
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => handlerRef.current?.(resp?.credential),
          ux_mode: 'popup',
          auto_select: false,
        })
        host.innerHTML = ''
        google.accounts.id.renderButton(host, {
          theme: 'outline', size: 'large', shape: 'rectangular', logo_alignment: 'left', width,
          text: mode === 'signup' ? 'signup_with' : 'signin_with',
        })
      })
      .catch(() => { if (!off) setPhase('blocked') })
    return () => {
      off = true
      if (host) host.innerHTML = ''
    }
  }, [phase, clientId, width, mode, lang])

  if (phase === 'off') return null

  return (
    <div className={className}>
      <div ref={slotRef} className="relative">
        {phase === 'loading' && <div className="h-10 w-full animate-pulse rounded-[4px] bg-paper" aria-hidden />}
        {phase === 'ready' && (
          <div className={busy ? 'pointer-events-none opacity-50' : ''}>
            <div data-gis-host className="flex min-h-10 justify-center" />
          </div>
        )}
        {phase === 'blocked' && (
          <p role="alert" className="rounded-[10px] border border-warning/40 bg-warning-100 px-3 py-2 text-xs font-medium text-ink">
            {t('pub.googleBlocked', 'Google sign-in could not be loaded - check your connection or ad blocker')}
          </p>
        )}
        {busy && (
          <span role="status" className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-semibold text-ink">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t('pub.signingIn', 'Signing you in...')}
          </span>
        )}
      </div>
      {error && <p role="alert" className="mt-2 rounded-[10px] border border-critical/30 bg-critical-100 px-3 py-2 text-xs font-medium text-critical">{error}</p>}
      <p className="mt-2 text-center text-xs text-muted">
        {t('pub.googleNote', 'Google sign-in creates a citizen account. Staff accounts are issued by an administrator.')}
      </p>
      {divider && <div className="mt-3"><OrDivider label={t('pub.or', 'or')} /></div>}
    </div>
  )
}
