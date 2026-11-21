import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { Badge, Button, Card, CardBody, DemoTag, Field, Input, Notice } from '../../components/ui'
import { api, errMsg } from '../../lib/api'
import { useAuth, homeFor } from '../../store/auth'
import { useT } from '../../lib/i18n'
import { titleCase } from '../../lib/format'

const ROLE_ORDER = ['citizen', 'officer', 'worker', 'supervisor', 'admin']
const ROLE_TONE = { citizen: 'forest', officer: 'civic', worker: 'civic', supervisor: 'teal', admin: 'plum' }

export default function Login() {
  const { t } = useT()
  const loc = useLocation()
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const login = useAuth((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [demo, setDemo] = useState(null)

  useEffect(() => {
    let off = false
    api.get('/meta/demo-accounts').then((r) => { if (!off) setDemo(r.data) }).catch(() => { if (!off) setDemo(null) })
    return () => { off = true }
  }, [])

  const from = loc.state?.from
  if (user && !busy) return <Navigate to={from || homeFor(user.role)} replace />

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) { setError(t('auth.required', 'Enter your email and password.')); return }
    setBusy(true)
    try {
      const u = await login(email.trim(), password)
      navigate(from || homeFor(u?.role), { replace: true })
    } catch (err) {
      setError(errMsg(err, t('auth.failed', 'Could not log in. Check your email and password.')))
      setBusy(false)
    }
  }

  const accounts = Array.isArray(demo?.accounts) ? demo.accounts : []
  const grouped = ROLE_ORDER.map((r) => [r, accounts.filter((a) => a.role === r)]).filter(([, l]) => l.length)

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:py-12 md:grid-cols-2 md:items-start">
      <Card>
        <CardBody>
          <h1 className="font-display text-2xl font-extrabold text-forest">{t('auth.loginTitle', 'Log in to CivicLens')}</h1>
          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            {error && <div role="alert" className="rounded-[10px] border border-critical/30 bg-critical-100 px-3 py-2 text-sm font-medium text-critical">{error}</div>}
            <Field label={t('auth.email', 'Email')} htmlFor="login-email">
              <Input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label={t('auth.password', 'Password')} htmlFor="login-password">
              <div className="relative">
                <Input id="login-password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-11" required />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? t('auth.hide', 'Hide') : t('auth.show', 'Show')} aria-pressed={show}
                  className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-paper">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <Button type="submit" loading={busy} className="w-full" size="lg"><LogIn className="h-4 w-4" aria-hidden />{t('btn.login', 'Log in')}</Button>
          </form>
          <p className="mt-4 text-sm text-muted">
            {t('auth.noAccount', 'New here?')} <Link to="/register" className="font-semibold text-civic hover:underline">{t('auth.createLink', 'Create a citizen account')}</Link>
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold">{t('auth.demo', 'Try a demo account')}</h2>
            <DemoTag />
          </div>
          {demo?.enabled && grouped.length > 0 ? (
            <>
              <p className="mt-1 text-sm text-muted">
                {t('auth.demoHint', 'Click an account to fill the form. Demo password:')} <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-xs text-ink">{demo.password}</code>
              </p>
              <div className="mt-4 space-y-4">
                {grouped.map(([role, list]) => (
                  <div key={role}>
                    <Badge tone={ROLE_TONE[role]}>{titleCase(role)}</Badge>
                    <ul className="mt-2 space-y-1.5">
                      {list.map((a) => (
                        <li key={a.email}>
                          <button type="button" onClick={() => { setEmail(a.email); setPassword(demo.password || ''); setError('') }}
                            className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-line px-3 py-2 text-left hover:border-forest/40 hover:bg-forest-50">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">{a.name}</span>
                              <span className="block truncate text-xs text-muted">{a.email}{a.department_code ? ` · ${titleCase(a.department_code)}` : ''}</span>
                            </span>
                            <span className="shrink-0 text-xs font-semibold text-civic">{t('auth.fill', 'Fill')}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Notice tone="civic" className="mt-3">{t('auth.demoOff', 'Demo accounts are not enabled on this server, or could not be loaded.')}</Notice>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
