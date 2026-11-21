import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Mail, Save, ShieldCheck, UserRound, CalendarDays, KeyRound } from 'lucide-react'
import GoogleSignInButton from '../../components/GoogleSignInButton'
import { Button, Field, IconTile, Input, Page, Panel, Select, toast } from '../../components/ui'
import { api, errMsg } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { LANGS, useT } from '../../lib/i18n'
import { fmtDate, titleCase } from '../../lib/format'

function PasswordPanel({ t }) {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const post = async (extra) => {
    setErr('')
    if (next.length < 8) { setErr(t('profile.pwShort', 'The new password must be at least 8 characters.')); return }
    setBusy(true)
    try {
      await api.post('/users/me/password', { new_password: next, ...extra })
      toast.success(t('profile.pwSaved', 'Password saved. You can now sign in with your email and password.'))
      setCur(''); setNext('')
    } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }
  return (
    <Panel title={t('profile.pwTitle', 'Password')} icon={KeyRound} tone="saffron" className="shrink-0" bodyClassName="space-y-3 p-4">
      <p className="text-[13px] text-muted">{t('profile.pwHelp', 'Signed up with Google? Choose a new password and confirm with Google, so you can also sign in with email and password.')}</p>
      {err && <div role="alert" className="rounded-[10px] border border-critical/30 bg-critical-100 px-3 py-2 text-sm font-medium text-critical">{err}</div>}
      <Field label={t('profile.pwNew', 'New password')} htmlFor="pf-newpw" hint={t('profile.pwHint', 'At least 8 characters.')}>
        <Input id="pf-newpw" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label={t('profile.pwCurrent', 'Current password (if you have one)')} htmlFor="pf-curpw">
        <Input id="pf-curpw" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
      </Field>
      <Button type="button" size="sm" loading={busy} disabled={!cur} onClick={() => post({ current_password: cur })}>{t('profile.pwSave', 'Save password')}</Button>
      <div className="border-t border-line pt-3">
        <p className="mb-2 text-[13px] font-semibold text-ink">{t('profile.pwGoogle', 'No current password? Confirm it is you with Google:')}</p>
        <GoogleSignInButton mode="signin" note={false} onCredential={(credential) => post({ google_credential: credential })} />
      </div>
    </Panel>
  )
}

export default function Profile() {
  const { t, setLang } = useT()
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const setUser = useAuth((s) => s.setUser)
  const logout = useAuth((s) => s.logout)
  const [f, setF] = useState({ display_name: '', phone: '', preferred_language: 'en' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (user) setF({ display_name: user.display_name || '', phone: user.phone || '', preferred_language: user.preferred_language || 'en' })
  }, [user])

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const save = async (e) => {
    e.preventDefault()
    setErr('')
    if (f.display_name.trim().length < 2) { setErr(t('auth.errName', 'Enter your name.')); return }
    setBusy(true)
    try {
      const { data } = await api.patch('/users/me', { display_name: f.display_name.trim(), phone: f.phone.trim() || null, preferred_language: f.preferred_language })
      setUser(data)
      if (data?.preferred_language && data.preferred_language !== user?.preferred_language) setLang(data.preferred_language)
      toast.success(t('profile.saved', 'Profile saved.'))
    } catch (e2) { setErr(errMsg(e2)) }
    setBusy(false)
  }
  const signOut = () => { logout(); navigate('/', { replace: true }) }

  const src = (user?.display_name || user?.email || '?').trim()
  const parts = src.split(/\s+/).filter(Boolean)
  const initials = (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : src.slice(0, 2)).toUpperCase()

  return (
    <Page title={t('nav.profile', 'Profile')} subtitle={user?.email}>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <Panel title={t('profile.details', 'Your details')} icon={UserRound} tone="forest"
          subtitle={user?.created_at ? `${t('profile.since', 'Member since')} ${fmtDate(user.created_at)}` : undefined}
          footer={
            <div className="flex flex-wrap gap-2">
              <Button type="submit" form="pf-form" size="sm" loading={busy}><Save className="h-4 w-4" aria-hidden />{t('btn.save', 'Save changes')}</Button>
              <Button type="button" size="sm" variant="secondary" onClick={signOut}><LogOut className="h-4 w-4" aria-hidden />{t('btn.signout', 'Sign out')}</Button>
            </div>
          }>
          <form id="pf-form" onSubmit={save} className="space-y-4" noValidate>
            {err && <div role="alert" className="rounded-[10px] border border-critical/30 bg-critical-100 px-3 py-2 text-sm font-medium text-critical">{err}</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('auth.name', 'Full name')} htmlFor="pf-name"><Input id="pf-name" value={f.display_name} onChange={set('display_name')} autoComplete="name" /></Field>
              <Field label={t('auth.email', 'Email')} htmlFor="pf-email" hint={t('profile.emailHint', 'Email cannot be changed here.')}><Input id="pf-email" value={user?.email || ''} disabled readOnly /></Field>
              <Field label={t('auth.phone', 'Phone (optional)')} htmlFor="pf-phone"><Input id="pf-phone" type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" /></Field>
              <Field label={t('auth.language', 'Preferred language')} htmlFor="pf-lang">
                <Select id="pf-lang" value={f.preferred_language} onChange={set('preferred_language')}>
                  {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </Select>
              </Field>
            </div>
          </form>
          <div className="mt-5 flex items-start gap-3 rounded-[12px] border border-line bg-paper p-4">
            <IconTile icon={ShieldCheck} tone="teal" />
            <div>
              <p className="font-display text-sm font-bold">{t('profile.privacyTitle', 'Your privacy')}</p>
              <p className="mt-1 text-sm text-ink/85">{t('profile.privacy', 'Other citizens never see your name, email, phone or exact location. Officers see your name on your own reports to follow up. Public certificates show only your first name and last initial.')}</p>
            </div>
          </div>
        </Panel>

        <div className="flex min-h-0 flex-col gap-3">
          <Panel className="shrink-0" bodyClassName="flex items-center gap-3 p-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-forest font-display text-xl font-extrabold text-white" aria-hidden>{initials}</span>
            <div className="min-w-0">
              <p className="truncate font-display text-base font-bold">{user?.display_name}</p>
              <p className="flex items-center gap-1.5 truncate text-[13px] text-muted"><Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />{user?.email}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted"><CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />{titleCase(user?.role || 'citizen')}{user?.created_at ? ` · ${fmtDate(user.created_at)}` : ''}</p>
            </div>
          </Panel>
          <PasswordPanel t={t} />
        </div>
      </div>
    </Page>
  )
}
