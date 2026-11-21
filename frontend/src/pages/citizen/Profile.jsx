import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Save, ShieldCheck } from 'lucide-react'
import { Button, Card, CardBody, CardHeader, Field, Input, Notice, PageHeader, Select, toast } from '../../components/ui'
import { api, errMsg } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { LANGS, useT } from '../../lib/i18n'
import { fmtDate } from '../../lib/format'

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

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('nav.profile', 'Profile')} subtitle={user?.email} />
      <Card>
        <CardHeader title={t('profile.details', 'Your details')} subtitle={user?.created_at ? `${t('profile.since', 'Member since')} ${fmtDate(user.created_at)}` : undefined} />
        <CardBody>
          <form onSubmit={save} className="space-y-4" noValidate>
            {err && <div role="alert" className="rounded-[10px] border border-critical/30 bg-critical-100 px-3 py-2 text-sm font-medium text-critical">{err}</div>}
            <Field label={t('auth.name', 'Full name')} htmlFor="pf-name"><Input id="pf-name" value={f.display_name} onChange={set('display_name')} autoComplete="name" /></Field>
            <Field label={t('auth.email', 'Email')} htmlFor="pf-email" hint={t('profile.emailHint', 'Email cannot be changed here.')}><Input id="pf-email" value={user?.email || ''} disabled readOnly /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('auth.phone', 'Phone (optional)')} htmlFor="pf-phone"><Input id="pf-phone" type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" /></Field>
              <Field label={t('auth.language', 'Preferred language')} htmlFor="pf-lang">
                <Select id="pf-lang" value={f.preferred_language} onChange={set('preferred_language')}>
                  {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy}><Save className="h-4 w-4" aria-hidden />{t('btn.save', 'Save changes')}</Button>
              <Button type="button" variant="secondary" onClick={signOut}><LogOut className="h-4 w-4" aria-hidden />{t('btn.signout', 'Sign out')}</Button>
            </div>
          </form>
        </CardBody>
      </Card>
      <Notice tone="forest" className="mt-5" title={t('profile.privacyTitle', 'Your privacy')}>
        <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
          <span>{t('profile.privacy', 'Other citizens never see your name, email, phone or exact location. Officers see your name on your own reports to follow up. Public certificates show only your first name and last initial.')}</span></p>
      </Notice>
    </div>
  )
}
