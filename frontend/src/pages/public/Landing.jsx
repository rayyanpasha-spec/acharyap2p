import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Mic, MapPin, Sparkles, ClipboardCheck, BadgeCheck, Construction, Trash2, Droplets, Zap, TreePine, Waves, Building2, CircleHelp,
  Users, Landmark, HardHat, ShieldCheck, Settings2, ArrowRight, Truck, CheckCircle2, ArrowUpRight, AlertTriangle, Activity, Trash,
} from 'lucide-react'
import { IconTile, Spinner, cn } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { useMeta } from '../../store/meta'
import { useT } from '../../lib/i18n'
import { CTA_ACCENT, CTA_OUTLINE, HERO_IMG, SCRIM } from '../../layouts/PublicLayout'

const CAT_ICON = { roads: Construction, waste: Trash2, water: Droplets, electricity: Zap, trees: TreePine, drainage: Waves, public_infrastructure: Building2, other: CircleHelp }

// Subtle entrance only; fully disabled for prefers-reduced-motion.
const MOTION_CSS = `
@keyframes cl-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.cl-rise { animation: cl-rise .6s ease-out both; }
.cl-d1 { animation-delay: .08s; } .cl-d2 { animation-delay: .16s; } .cl-d3 { animation-delay: .24s; } .cl-d4 { animation-delay: .34s; }
@media (prefers-reduced-motion: reduce) { .cl-rise { animation: none; } }
`

export default function Landing() {
  const { t } = useT()
  const user = useAuth((s) => s.user)
  const meta = useMeta((s) => s.meta)
  const metaError = useMeta((s) => s.error)
  const loc = useLocation()

  useEffect(() => {
    if (!loc.hash) return
    const el = document.getElementById(loc.hash.slice(1))
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }, [loc.hash])

  const reportTo = user?.role === 'citizen' ? '/app/report' : '/login'
  const cats = (meta?.categories || []).filter((c) => c.code !== 'other')
  const deptName = (code) => meta?.departments?.find((d) => d.code === code)?.name || code

  const features = [
    { icon: MapPin, tone: 'forest', title: t('feat.1', 'Reports with context'), text: t('feat.1d', 'Every report is tied to a citizen-confirmed issue location.') },
    { icon: Truck, tone: 'civic', title: t('feat.2', 'Sanitation in motion'), text: t('feat.2d', 'View collection routes, vehicles and public-bin status.') },
    { icon: CheckCircle2, tone: 'success', title: t('feat.3', 'Visible outcomes'), text: t('feat.3d', 'Follow work through assignment, evidence and verification.') },
  ]
  const steps = [
    { icon: Mic, tone: 'forest', title: t('how.s1', 'Speak or type'), text: t('how.s1d', 'Describe the problem in Kannada, English, Hindi, Tamil, Telugu or Malayalam.') },
    { icon: MapPin, tone: 'civic', title: t('how.s2', 'Pin the location'), text: t('how.s2d', 'Use GPS or drop a pin so the right team can find it.') },
    { icon: Sparkles, tone: 'teal', title: t('how.s3', 'AI triage'), text: t('how.s3d', 'AI proposes the category and severity with a one-line reason. Officers can correct it.') },
    { icon: ClipboardCheck, tone: 'saffron', title: t('how.s4', 'Officer action'), text: t('how.s4d', 'The department verifies the report and assigns a field worker.') },
    { icon: BadgeCheck, tone: 'plum', title: t('how.s5', 'Verified resolution'), text: t('how.s5d', 'A supervisor checks the fix before the report is marked resolved.') },
  ]
  const roles = [
    { icon: Users, name: t('who.citizen', 'Citizens'), text: t('who.citizenD', 'Report issues, track progress and earn recognition for verified improvements.'), tone: 'forest' },
    { icon: Landmark, name: t('who.officer', 'Municipal officers'), text: t('who.officerD', 'Review a priority queue, confirm AI triage and assign work.'), tone: 'civic' },
    { icon: HardHat, name: t('who.worker', 'Field workers'), text: t('who.workerD', 'See assigned tasks and upload before and after evidence.'), tone: 'saffron' },
    { icon: ShieldCheck, name: t('who.supervisor', 'Supervisors'), text: t('who.supervisorD', 'Verify resolutions and decide on reopen requests.'), tone: 'teal' },
    { icon: Settings2, name: t('who.admin', 'Administrators'), text: t('who.adminD', 'Manage staff accounts, routing rules, SLAs and audit logs.'), tone: 'plum' },
  ]

  return (
    <>
      <style>{MOTION_CSS}</style>

      {/* ============ HERO: the photo is the background ============ */}
      <section className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-forest text-white">
        <img src={HERO_IMG} alt="" aria-hidden="true" fetchPriority="high" decoding="async"
          className="absolute inset-0 -z-20 h-full w-full object-cover" style={{ objectPosition: '70% center' }} />
        <div className="absolute inset-0 -z-10" style={{ background: SCRIM }} aria-hidden />

        <div className="mx-auto flex w-full max-w-7xl flex-1 items-center px-4 pb-20 pt-24 sm:px-6 sm:pb-24">
          <div className="grid w-full items-end gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center xl:grid-cols-[minmax(0,1fr)_430px] xl:gap-14">
            <div className="max-w-[660px]">
              <p className="cl-rise inline-flex items-center rounded-full border border-white/40 bg-black/30 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white sm:text-xs">
                {t('landing.eyebrow', 'Built for Bengaluru · Civic intelligence')}
              </p>
              <h1 className="cl-rise cl-d1 mt-4 font-display text-[36px] font-extrabold leading-[1.06] tracking-[-0.025em] text-white sm:text-5xl lg:text-[54px]">
                {t('landing.headline', 'See the city. Understand the problem. Move it forward.')}
              </h1>
              <p className="cl-rise cl-d2 mt-4 max-w-[560px] text-base leading-relaxed text-white/95 sm:text-lg">
                {t('landing.desc', 'CivicLens connects citizen reports, AI-powered triage and municipal sanitation operations in one living view of Bengaluru.')}
              </p>
              <div className="cl-rise cl-d3 mt-6 flex flex-wrap gap-3">
                <Link to={reportTo} className={cn(CTA_ACCENT, 'h-12 px-7 text-base shadow-sm')}>
                  {t('landing.cta', 'Report an issue')} <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link to="/city-in-motion" className={cn(CTA_OUTLINE, 'h-12 px-6 text-base')}>
                  {t('landing.cta2', 'Explore City in Motion')}
                </Link>
              </div>
              <p className="cl-rise cl-d4 mt-5 text-[13px] font-medium leading-relaxed text-white/90">
                {t('landing.trust', 'Multilingual reporting · Location-aware tickets · Transparent resolution tracking')}
              </p>
            </div>

            <div className="w-full lg:justify-self-end">
              <Snapshot t={t} />
            </div>
          </div>
        </div>

        <p className="absolute bottom-4 right-4 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white">
          {t('pub.photoCredit', 'Vidhana Soudha, Bengaluru')}
        </p>
      </section>

      {/* ============ Feature strip ============ */}
      <section className="border-b border-line bg-paper" aria-label={t('pub.features', 'What CivicLens does')}>
        <ul className="mx-auto grid max-w-6xl gap-3 px-4 py-6 md:grid-cols-3">
          {features.map((f) => (
            <li key={f.title} className="flex items-start gap-3 rounded-[14px] border border-line bg-surface p-4">
              <IconTile icon={f.icon} tone={f.tone} size="lg" />
              <div>
                <h3 className="font-display text-[15px] font-bold text-ink">{f.title}</h3>
                <p className="mt-0.5 text-sm text-muted">{f.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ============ How it works (compact row) ============ */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-9">
        <h2 className="font-display text-2xl font-extrabold text-ink">{t('nav.howItWorks', 'How it works')}</h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-[14px] border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <IconTile icon={s.icon} tone={s.tone} />
                <span className="font-display text-sm font-extrabold text-muted">0{i + 1}</span>
              </div>
              <h3 className="mt-3 font-display text-[15px] font-bold text-ink">{s.title}</h3>
              <p className="mt-1 text-[13px] leading-snug text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ============ Category -> department grid ============ */}
      <section id="categories" className="scroll-mt-20 border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-9">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-display text-2xl font-extrabold text-ink">{t('nav.categories', 'What you can report')}</h2>
            <p className="text-sm text-muted">{t('cat.sub', 'Each category is routed to the department that normally handles it.')}</p>
          </div>
          {!meta && !metaError && <Spinner />}
          {metaError && !meta && <p className="mt-4 text-sm text-muted">{t('cat.unavailable', 'Categories could not be loaded right now.')}</p>}
          <ul className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {cats.map((c) => {
              const Icon = CAT_ICON[c.code] || CircleHelp
              return (
                <li key={c.code} className="flex items-center gap-3 rounded-[14px] border border-line bg-paper p-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-white" style={{ background: `var(--color-cat-${c.code})` }}><Icon className="h-5 w-5" aria-hidden /></span>
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-sm font-bold text-ink">{c.name}</h3>
                    <p className="truncate text-xs text-muted">{t('cat.routes', 'Routes to')}: <span className="font-semibold text-civic">{deptName(c.default_department_code)}</span></p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      {/* ============ Role strip ============ */}
      <section id="who" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-9">
        <h2 className="font-display text-2xl font-extrabold text-ink">{t('nav.whoFor', 'Who it is for')}</h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {roles.map((r) => (
            <li key={r.name} className="rounded-[14px] border border-line bg-surface p-4">
              <IconTile icon={r.icon} tone={r.tone} size="sm" />
              <h3 className="mt-2.5 font-display text-[15px] font-bold text-ink">{r.name}</h3>
              <p className="mt-1 text-[13px] leading-snug text-muted">{r.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

/** Compact white "live snapshot" of GET /city-twin/summary. Renders nothing if the request fails. */
function Snapshot({ t }) {
  const [s, setS] = useState(null)
  useEffect(() => {
    let off = false
    const ctl = new AbortController()
    api.get('/city-twin/summary', { signal: ctl.signal })
      .then((r) => { if (!off && r.data?.counts) setS(r.data) })
      .catch(() => { /* hidden on failure */ })
    return () => { off = true; ctl.abort() }
  }, [])
  if (!s) return null

  const c = s.counts || {}
  const simulatedGps = s.data_sources?.vehicles !== 'gps_device'
  const items = [
    { icon: Activity, tone: 'civic', label: t('pub.active', 'Active issues'), value: c.complaints_active },
    { icon: AlertTriangle, tone: 'critical', label: t('pub.critical', 'Critical'), value: c.critical },
    { icon: Truck, tone: 'forest', label: t('pub.vehicles', 'Vehicles'), value: c.vehicles_active },
    { icon: Trash, tone: 'saffron', label: t('pub.bins', 'Bins'), value: c.bins_total },
  ]
  return (
    <aside aria-label={t('pub.snapshot', 'Live snapshot')} className="cl-rise cl-d4 w-full rounded-[16px] border border-line bg-surface p-5 text-ink shadow-[0_12px_32px_rgba(0,0,0,0.22)] sm:max-w-[430px] sm:p-6 lg:max-w-none">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold">{t('pub.snapshot', 'Live snapshot')}</h2>
        <span className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success-100 px-3 py-1 text-sm font-bold text-success"><span className="cl-pulse h-2 w-2 rounded-full bg-success" aria-hidden />Live</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        {items.map((it) => (
          <div key={it.label} className="flex min-h-[7.5rem] flex-col justify-between rounded-[12px] border border-line bg-paper p-4">
            <div className="flex items-center justify-between gap-2">
              <IconTile icon={it.icon} tone={it.tone} size="md" />
              <dd className="font-display text-4xl font-bold leading-none">{it.value ?? '-'}</dd>
            </div>
            <dt className="mt-3 text-sm font-semibold text-muted">{it.label}</dt>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {s.demo_mode && <span className="inline-flex items-center rounded-md border border-dashed border-saffron/60 bg-saffron-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-saffron">{t('pub.demoData', 'Demo data')}</span>}
        {simulatedGps && <span className="inline-flex items-center rounded-md border border-dashed border-saffron/60 bg-saffron-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-saffron">{t('pub.simGps', 'Simulated GPS')}</span>}
      </div>
      <Link to="/city-in-motion" className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-forest text-base font-semibold text-white transition-colors hover:bg-forest-600">
        {t('pub.openMap', 'Open City in Motion')} <ArrowUpRight className="h-4 w-4" aria-hidden />
      </Link>
    </aside>
  )
}
