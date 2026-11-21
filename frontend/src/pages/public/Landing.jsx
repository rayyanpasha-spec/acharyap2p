import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Mic, MapPin, Sparkles, ClipboardCheck, BadgeCheck, Construction, Trash2, Droplets, Zap, TreePine, Waves, Building2, CircleHelp,
  Users, Landmark, HardHat, ShieldCheck, Settings2, ArrowRight, Info, Truck, CheckCircle2,
} from 'lucide-react'
import { Button, Card, DemoTag, Spinner, cn } from '../../components/ui'
import { useAuth } from '../../store/auth'
import { useMeta } from '../../store/meta'
import { LANGS, useT } from '../../lib/i18n'

const CAT_ICON = { roads: Construction, waste: Trash2, water: Droplets, electricity: Zap, trees: TreePine, drainage: Waves, public_infrastructure: Building2, other: CircleHelp }

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

  const steps = [
    { icon: Mic, title: t('how.s1', 'Speak or type'), text: t('how.s1d', 'Describe the problem in Kannada, English, Hindi, Tamil, Telugu or Malayalam.'), tone: 'text-forest bg-forest-100' },
    { icon: MapPin, title: t('how.s2', 'Pin the location'), text: t('how.s2d', 'Use GPS or drop a pin so the right team can find it.'), tone: 'text-civic bg-civic-100' },
    { icon: Sparkles, title: t('how.s3', 'AI triage'), text: t('how.s3d', 'AI proposes the category and severity with a one-line reason. Officers can correct it.'), tone: 'text-teal bg-teal-100' },
    { icon: ClipboardCheck, title: t('how.s4', 'Officer action'), text: t('how.s4d', 'The department verifies the report and assigns a field worker.'), tone: 'text-saffron bg-saffron-100' },
    { icon: BadgeCheck, title: t('how.s5', 'Verified resolution'), text: t('how.s5d', 'A supervisor checks the fix before the report is marked resolved.'), tone: 'text-plum bg-plum-100' },
  ]
  const features = [
    { icon: MapPin, title: t('feat.1', 'Reports with context'), text: t('feat.1d', 'Every report is tied to a citizen-confirmed issue location.'), tone: 'text-forest bg-forest-100' },
    { icon: Truck, title: t('feat.2', 'Sanitation in motion'), text: t('feat.2d', 'View collection routes, vehicles and public-bin status.'), tone: 'text-civic bg-civic-100' },
    { icon: CheckCircle2, title: t('feat.3', 'Visible outcomes'), text: t('feat.3d', 'Follow work through assignment, evidence and verification.'), tone: 'text-success bg-success-100' },
  ]
  const roles = [
    { icon: Users, name: t('who.citizen', 'Citizens'), text: t('who.citizenD', 'Report issues, track progress and earn recognition for verified improvements.'), tone: 'border-forest/30 bg-forest-50 text-forest' },
    { icon: Landmark, name: t('who.officer', 'Municipal officers'), text: t('who.officerD', 'Review a priority queue, confirm AI triage and assign work.'), tone: 'border-civic/30 bg-civic-50 text-civic' },
    { icon: HardHat, name: t('who.worker', 'Field workers'), text: t('who.workerD', 'See assigned tasks and upload before and after evidence.'), tone: 'border-civic/30 bg-civic-50 text-civic' },
    { icon: ShieldCheck, name: t('who.supervisor', 'Supervisors'), text: t('who.supervisorD', 'Verify resolutions and decide on reopen requests.'), tone: 'border-teal/30 bg-teal-100 text-teal' },
    { icon: Settings2, name: t('who.admin', 'Administrators'), text: t('who.adminD', 'Manage staff accounts, routing rules, SLAs and audit logs.'), tone: 'border-plum/30 bg-plum-100 text-plum' },
  ]

  return (
    <>
      {/* Hero */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:py-14 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-saffron/30 bg-saffron-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-saffron">
              {t('landing.eyebrow', 'Built for Bengaluru · Civic intelligence')}
            </p>
            <h1 className="font-display text-[32px] font-extrabold leading-[1.1] text-forest sm:text-5xl">
              {t('landing.headline', 'See the city. Understand the problem. Move it forward.')}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink/80 sm:text-lg">
              {t('landing.desc', 'CivicLens connects citizen reports, AI-powered triage and municipal sanitation operations in one living view of Bengaluru.')}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button as={Link} to={reportTo} size="lg">{t('landing.cta', 'Report an issue')} <ArrowRight className="h-4 w-4" aria-hidden /></Button>
              <Button as={Link} to="/city-in-motion" variant="secondary" size="lg">{t('landing.cta2', 'Explore City in Motion')}</Button>
            </div>
            <p className="mt-4 text-xs text-muted">{t('landing.trust', 'Multilingual reporting · Location-aware tickets · Transparent resolution tracking')}</p>
          </div>
          <MapPreview t={t} />
        </div>
      </section>

      {/* Feature strip */}
      <section className="border-b border-line bg-paper">
        <ul className="mx-auto grid max-w-6xl gap-3 px-4 py-6 sm:grid-cols-3">
          {features.map((f) => (
            <li key={f.title} className="flex items-start gap-3 rounded-[10px] border border-line bg-surface p-4">
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', f.tone)}><f.icon className="h-[18px] w-[18px]" aria-hidden /></span>
              <div>
                <h3 className="font-display text-[15px] font-bold">{f.title}</h3>
                <p className="mt-0.5 text-sm text-muted">{f.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-10 sm:py-14">
        <h2 className="font-display text-2xl font-extrabold text-ink">{t('nav.howItWorks', 'How it works')}</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Card className="h-full p-4">
                <div className="flex items-center gap-2">
                  <span className={cn('flex h-9 w-9 items-center justify-center rounded-full', s.tone)}><s.icon className="h-[18px] w-[18px]" aria-hidden /></span>
                  <span className="text-xs font-bold text-muted">{i + 1}</span>
                </div>
                <h3 className="mt-3 font-display text-[15px] font-bold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.text}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* Categories */}
      <section id="categories" className="scroll-mt-20 border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
          <h2 className="font-display text-2xl font-extrabold text-ink">{t('nav.categories', 'What you can report')}</h2>
          <p className="mt-1 text-sm text-muted">{t('cat.sub', 'Each category is routed to the department that normally handles it.')}</p>
          {!meta && !metaError && <Spinner />}
          {metaError && !meta && <p className="mt-4 text-sm text-muted">{t('cat.unavailable', 'Categories could not be loaded right now.')}</p>}
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cats.map((c) => {
              const Icon = CAT_ICON[c.code] || CircleHelp
              return (
                <li key={c.code}>
                  <Card className="flex h-full gap-3 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-white" style={{ background: `var(--color-cat-${c.code})` }}><Icon className="h-5 w-5" aria-hidden /></span>
                    <div className="min-w-0">
                      <h3 className="font-display text-[15px] font-bold">{c.name}</h3>
                      <p className="mt-0.5 text-xs text-muted">{(c.subcategories || []).slice(0, 4).map((s) => s.name).join(', ')}</p>
                      <p className="mt-2 text-xs font-semibold text-civic">{t('cat.routes', 'Routes to')}: <span className="font-medium text-ink">{deptName(c.default_department_code)}</span></p>
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      {/* Who is it for */}
      <section id="who" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-10 sm:py-14">
        <h2 className="font-display text-2xl font-extrabold text-ink">{t('nav.whoFor', 'Who it is for')}</h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {roles.map((r) => (
            <li key={r.name} className={cn('rounded-[10px] border p-4', r.tone)}>
              <r.icon className="h-5 w-5" aria-hidden />
              <h3 className="mt-2 font-display text-[15px] font-bold">{r.name}</h3>
              <p className="mt-1 text-sm text-ink/80">{r.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Languages + pilot note */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-2">
          <div>
            <h2 className="font-display text-xl font-extrabold">{t('lang.title', 'In your language')}</h2>
            <p className="mt-1 text-sm text-muted">{t('lang.sub', 'Kannada, English, Hindi, Tamil, Telugu and Malayalam. Your language is never forced; choose it at any time.')}</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {LANGS.map((l) => <li key={l.code} lang={l.code} className="rounded-full border border-line-strong bg-paper px-3 py-1.5 text-sm font-medium">{l.label}</li>)}
            </ul>
          </div>
          <div className="rounded-[10px] border border-saffron/30 bg-saffron-100 p-4">
            <div className="flex items-center gap-2"><Info className="h-4 w-4 text-saffron" aria-hidden /><h2 className="font-display text-base font-bold">{t('pilot.title', 'Honest pilot note')}</h2><DemoTag /></div>
            <p className="mt-2 text-sm text-ink/90">{t('pilot.text', 'Prototype: demo data and simulated CleanRoute GPS are labelled. Official ward and corporation boundaries are used only when imported; otherwise reports are routed manually. CivicLens is not an emergency service.')}</p>
          </div>
        </div>
      </section>
    </>
  )
}

/** Static, flat SVG preview of the operations map. No gradients, no WebGL. Illustrative only. */
function Pin({ x, y, color, label, bang }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0 C-9 -12 -11 -17 -11 -22 a11 11 0 1 1 22 0 C11 -17 9 -12 0 0Z" fill={color} stroke="#fff" strokeWidth="2" />
      {bang ? <text x="0" y="-16" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">!</text> : <circle cx="0" cy="-22" r="3.5" fill="#fff" />}
      <title>{label}</title>
    </g>
  )
}
function Block({ x, y, w, h, d = 8, top = '#ecece4', side = '#d9dad0' }) {
  return (
    <g>
      <path d={`M${x} ${y} h${w} v${h} h-${w}Z`} fill={top} stroke="#d4d6cc" />
      <path d={`M${x} ${y} l${d} -${d} h${w} l-${d} ${d}Z`} fill="#f5f5ef" stroke="#d4d6cc" />
      <path d={`M${x + w} ${y} l${d} -${d} v${h} l-${d} ${d}Z`} fill={side} stroke="#d4d6cc" />
    </g>
  )
}
function MapPreview({ t }) {
  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-[10px] border border-line bg-paper">
        <svg viewBox="0 0 480 340" role="img" aria-label={t('landing.previewAlt', 'Illustrative preview of the City in Motion operations map')} className="block h-auto w-full">
          <rect width="480" height="340" fill="#f7f7f2" />
          {/* park */}
          <rect x="300" y="30" width="140" height="80" rx="8" fill="#e3ede6" stroke="#b9d0c0" />
          <circle cx="330" cy="62" r="9" fill="#2d5e47" /><circle cx="360" cy="80" r="12" fill="#244c39" /><circle cx="400" cy="56" r="8" fill="#2d5e47" />
          {/* roads */}
          <g stroke="#ffffff" strokeWidth="16" fill="none"><path d="M0 130 H480" /><path d="M0 250 H480" /><path d="M150 0 V340" /><path d="M290 0 V340" /></g>
          <g stroke="#d4d6cc" strokeWidth="1" strokeDasharray="6 6" fill="none"><path d="M0 130 H480" /><path d="M0 250 H480" /><path d="M150 0 V340" /><path d="M290 0 V340" /></g>
          {/* blocks */}
          <Block x={24} y={50} w={90} h={52} />
          <Block x={176} y={44} w={84} h={58} d={14} />
          <Block x={30} y={160} w={80} h={62} d={12} />
          <Block x={180} y={160} w={78} h={56} />
          <Block x={322} y={160} w={110} h={62} d={16} />
          <Block x={34} y={276} w={88} h={44} />
          <Block x={184} y={272} w={80} h={48} d={12} />
          <Block x={330} y={274} w={90} h={46} />
          {/* garbage route + truck */}
          <path d="M20 250 H290 V130 H460" fill="none" stroke="#2f5f8f" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
          <g transform="translate(226 238)">
            <rect x="0" y="0" width="22" height="13" rx="2" fill="#2d5e47" stroke="#fff" />
            <rect x="22" y="4" width="10" height="9" rx="2" fill="#ffffff" stroke="#2d5e47" />
            <circle cx="7" cy="14" r="3" fill="#303630" /><circle cx="26" cy="14" r="3" fill="#303630" />
            <title>Garbage truck (simulated)</title>
          </g>
          {/* markers */}
          <Pin x={96} y={128} color="#b94a48" label="Critical" bang />
          <Pin x={222} y={158} color="#c2603a" label="High" />
          <Pin x={356} y={158} color="#2f5f8f" label="Medium" />
          <Pin x={150} y={296} color="#4f7a8f" label="Low" />
        </svg>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-2 font-semibold text-ink/80">{t('landing.previewLabel', '3D operations preview')} <DemoTag /></span>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Legend">
          {[['#b94a48', t('severity.critical', 'Critical')], ['#c2603a', t('severity.high', 'High')], ['#2f5f8f', t('severity.medium', 'Medium')], ['#4f7a8f', t('severity.low', 'Low')]].map(([c, l]) => (
            <li key={l} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} aria-hidden />{l}</li>
          ))}
          <li className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-forest" aria-hidden />{t('landing.legendTruck', 'Truck')}</li>
        </ul>
      </figcaption>
    </figure>
  )
}
