import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Info, UserPlus } from 'lucide-react'
import { Button, Card, Field, Input, Select } from '../../components/ui'
import GoogleSignInButton from '../../components/GoogleSignInButton'
import { AuthShell } from '../../layouts/PublicLayout'
import { errMsg } from '../../lib/api'
import { useAuth, homeFor } from '../../store/auth'
import { LANGS, useT } from '../../lib/i18n'

export default function Register() {
  const { t, lang } = useT()
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const register = useAuth((s) => s.register)
  const [f, setF] = useState({ display_name: '', email: '', password: '', phone: '', preferred_language: lang })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errs, setErrs] = useState({})

  if (user && !busy) return <Navigate to={homeFor(user.role)} replace />
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const v = {}
    if (f.display_name.trim().length < 2) v.display_name = t('auth.errName', 'Enter your name.')
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) v.email = t('auth.errEmail', 'Enter a valid email address.')
    if (f.password.length < 8) v.password = t('auth.errPassword', 'Password must be at least 8 characters.')
    setErrs(v)
    if (Object.keys(v).length) return
    setBusy(true)
    try {
      const payload = { email: f.email.trim(), password: f.password, display_name: f.display_name.trim(), preferred_language: f.preferred_language }
      if (f.phone.trim()) payload.phone = f.phone.trim()
      await register(payload)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(errMsg(err))
      setBusy(false)
    }
  }

  return (
    <AuthShell lead={t('pub.registerLead', 'Join the people moving Bengaluru forward.')}>
      <Card className="p-6 sm:p-7">
        <h1 className="font-display text-[26px] font-extrabold leading-tight text-forest">{t('auth.registerTitle', 'Create a citizen account')}</h1>

        <GoogleSignInButton mode="signup" divider className="mt-4" />

        <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
          {error && <div role="alert" className="rounded-[10px] border border-critical/30 bg-critical-100 px-3 py-2 text-sm font-medium text-critical">{error}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('auth.name', 'Full name')} htmlFor="reg-name" error={errs.display_name}>
              <Input id="reg-name" autoComplete="name" value={f.display_name} onChange={set('display_name')} required />
            </Field>
            <Field label={t('auth.email', 'Email')} htmlFor="reg-email" error={errs.email}>
              <Input id="reg-email" type="email" autoComplete="email" value={f.email} onChange={set('email')} required />
            </Field>
          </div>
          <Field label={t('auth.password', 'Password')} htmlFor="reg-password" hint={t('auth.passwordHint', 'At least 8 characters.')} error={errs.password}>
            <div className="relative">
              <Input id="reg-password" type={show ? 'text' : 'password'} autoComplete="new-password" value={f.password} onChange={set('password')} className="pr-11" required minLength={8} />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? t('auth.hide', 'Hide') : t('auth.show', 'Show')} aria-pressed={show}
                className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-paper">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('auth.language', 'Preferred language')} htmlFor="reg-lang">
              <Select id="reg-lang" value={f.preferred_language} onChange={set('preferred_language')}>
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </Select>
            </Field>
            <Field label={t('auth.phone', 'Phone (optional)')} htmlFor="reg-phone">
              <Input id="reg-phone" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} />
            </Field>
          </div>
          <Button type="submit" loading={busy} className="w-full" size="lg"><UserPlus className="h-4 w-4" aria-hidden />{t('btn.register', 'Register')}</Button>
        </form>

        <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-civic-50 px-3 py-2 text-xs text-ink/90">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-civic" aria-hidden />
          <span>{t('auth.staffNote', 'This creates a citizen account. Officer, field worker, supervisor and administrator accounts are created by a CivicLens administrator.')}</span>
        </p>
        <p className="mt-3 text-center text-sm text-muted">
          {t('auth.haveAccount', 'Already registered?')} <Link to="/login" className="font-semibold text-civic hover:underline">{t('btn.login', 'Log in')}</Link>
        </p>
      </Card>
    </AuthShell>
  )
}
