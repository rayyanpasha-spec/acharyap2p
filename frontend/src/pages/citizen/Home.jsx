import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FilePlus2, ClipboardList, Hourglass, CheckCircle2, Eye, Truck, Gamepad2, Award, Star, ArrowRight, Users, Clock as Pending } from 'lucide-react'
import { Button, DemoTag, EmptyState, ErrorState, IconTile, Page, Panel, Spinner, cn } from '../../components/ui'
import { ComplaintRow, TStatusBadge } from '../../components/StatusTimeline'
import { api, errMsg } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { useMeta } from '../../store/meta'
import { useT } from '../../lib/i18n'
import { timeAgo } from '../../lib/format'

const TILE = {
  forest: 'border-forest/15 bg-forest-50 text-forest',
  high: 'border-high/20 bg-high-100/60 text-high',
  success: 'border-success/20 bg-success-100/70 text-success',
  civic: 'border-civic/15 bg-civic-50 text-civic',
}
function StatTile({ label, value, icon, tone }) {
  return (
    <div className={cn('flex flex-col justify-between rounded-xl border p-3', TILE[tone])}>
      <IconTile icon={icon} tone={tone} size="sm" />
      <div className="mt-2">
        <p className="font-display text-2xl font-extrabold leading-none">{value}</p>
        <p className="mt-1 text-[12px] font-medium text-ink/70">{label}</p>
      </div>
    </div>
  )
}

export default function Home() {
  const { t } = useT()
  const user = useAuth((s) => s.user)
  const categoryName = useMeta((s) => s.categoryName)
  const [summary, setSummary] = useState(null)
  const [profile, setProfile] = useState(null)
  const [feed, setFeed] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [s, p, f] = await Promise.allSettled([
      api.get('/complaints/summary'), api.get('/civic/profile'), api.get('/complaints/public-feed'),
    ])
    if (s.status === 'fulfilled') setSummary(s.value.data)
    else setError(errMsg(s.reason))
    setProfile(p.status === 'fulfilled' ? p.value.data : null)   // may 404 until the recognition module is live
    setFeed(f.status === 'fulfilled' ? (f.value.data?.items || []) : [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const first = (user?.display_name || '').split(' ')[0]
  const recent = summary?.recent || []
  const level = profile?.level
  const levelTitle = typeof level === 'string' ? level : level?.title
  const nextTitle = level?.next_title
  const nextThreshold = level?.next_threshold
  const verified = profile?.verified_contributions ?? level?.verified_contributions ?? 0
  const pct = nextThreshold ? Math.min(100, Math.round((verified / nextThreshold) * 100)) : null

  const quick = [
    { to: '/app/cleanroute', label: t('nav.cleanroute', 'CleanRoute'), sub: t('dash.cleanrouteD', 'Collection vehicles and bins'), icon: Truck, tone: 'civic', demo: true },
    { to: '/app/civicverse', label: t('nav.civicverse', 'CivicVerse'), sub: t('dash.civicverseD', 'Learn and play for civic awareness'), icon: Gamepad2, tone: 'teal' },
    { to: '/app/certificates', label: t('nav.certificates', 'Certificates'), sub: t('dash.certD', 'Recognition for verified fixes'), icon: Award, tone: 'saffron' },
  ]

  return (
    <Page title={`${t('dash.welcome', 'Welcome')}${first ? ', ' + first : ''}`} subtitle={t('dash.sub', 'Here is what is happening with your reports and your neighbourhood.')}>
      {loading ? (
        <Panel className="flex-1"><Spinner /></Panel>
      ) : error && !summary ? (
        <Panel className="flex-1"><ErrorState message={error} onRetry={load} /></Panel>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[250px_minmax(0,1fr)_280px] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_330px]">
          {/* left: hero + quick stats */}
          <Panel bodyClassName="flex flex-col gap-3 p-3">
            <div className="rounded-xl border border-forest/15 bg-forest-50 p-4">
              <IconTile icon={FilePlus2} tone="forest" size="lg" />
              <h2 className="mt-3 font-display text-lg font-bold leading-snug text-forest">{t('dash.seeSomething', 'See something that needs fixing?')}</h2>
              <p className="mt-1 text-[13px] text-ink/75">{t('dash.seeSomethingD', 'Speak or type it in your language. It takes about a minute.')}</p>
              <Button as={Link} to="/app/report" size="lg" className="mt-3 w-full"><FilePlus2 className="h-5 w-5" aria-hidden />{t('btn.report', 'Report an issue')}</Button>
            </div>
            <div className="grid min-h-[170px] flex-1 grid-cols-2 gap-2">
              <StatTile label={t('dash.myReports', 'My reports')} value={summary?.total ?? 0} icon={ClipboardList} tone="forest" />
              <StatTile label={t('dash.unresolved', 'Unresolved')} value={summary?.unresolved ?? 0} icon={Hourglass} tone="high" />
              <StatTile label={t('dash.resolved', 'Resolved')} value={summary?.resolved ?? 0} icon={CheckCircle2} tone="success" />
              <StatTile label={t('dash.following', 'Following')} value={summary?.following ?? 0} icon={Eye} tone="civic" />
            </div>
            {summary?.awaiting_my_confirmation > 0 && (
              <p className="flex items-start gap-2 rounded-xl border border-plum/25 bg-plum-100 px-3 py-2 text-[13px] text-plum">
                <Pending className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{summary.awaiting_my_confirmation} {t('dash.awaiting', 'of your reports are awaiting verification by a supervisor.')}</span>
              </p>
            )}
          </Panel>

          {/* centre: recent reports */}
          <Panel title={t('dash.recent', 'My recent reports')} icon={ClipboardList} tone="civic" bodyClassName="p-0"
            action={<Link to="/app/complaints" className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-civic hover:underline">{t('dash.viewAll', 'View all')}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>}>
            {recent.length === 0 ? (
              <EmptyState title={t('dash.noReports', 'You have not reported anything yet')} hint={t('dash.noReportsD', 'Your first report will appear here with live status updates.')}
                action={<Button as={Link} to="/app/report" size="sm">{t('btn.report', 'Report an issue')}</Button>} />
            ) : (
              <div className="divide-y divide-line">{recent.map((c) => <ComplaintRow key={c.ticket_number} c={c} />)}</div>
            )}
          </Panel>

          {/* right: points, neighbourhood, quick links */}
          <div className="flex min-h-0 flex-col gap-3">
            <Panel title={t('dash.points', 'Civic points')} icon={Star} tone="saffron" className="shrink-0" bodyClassName="p-3.5">
              {profile ? (
                <div>
                  <div className="flex items-end justify-between gap-3">
                    <p className="font-display text-3xl font-extrabold leading-none text-saffron">{profile.points_total ?? 0}</p>
                    {levelTitle && <span className="rounded-full border border-saffron/25 bg-saffron-100 px-2.5 py-0.5 text-xs font-bold text-saffron">{levelTitle}</span>}
                  </div>
                  {pct != null ? (
                    <div className="mt-2.5">
                      <div className="h-2 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('dash.nextLevel', 'Progress to next level')}>
                        <div className="h-full bg-forest" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted">{verified}/{nextThreshold} {t('dash.verifiedToward', 'verified contributions toward')} {nextTitle}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted">{t('dash.pointsNote', 'Points are earned for verified improvements, not for submitting reports.')}</p>
                  )}
                </div>
              ) : (
                <p className="text-[13px] text-muted">{t('dash.pointsNone', 'Your points will appear here once your first report is verified as resolved.')}</p>
              )}
            </Panel>

            <Panel title={t('dash.neighbourhood', 'Neighbourhood activity')} icon={Users} tone="teal" className="min-h-[200px] lg:min-h-0 lg:flex-1" bodyClassName="p-0"
              footer={<p className="text-[11px] leading-snug text-muted">{t('dash.neighbourhoodD', 'Recent public reports. Locations are approximate and reporters are never shown.')}</p>}>
              {feed.length === 0 ? (
                <EmptyState icon={Users} title={t('dash.noFeed', 'No recent activity to show')} />
              ) : (
                <ul className="divide-y divide-line">
                  {feed.slice(0, 10).map((f) => (
                    <li key={f.ticket_number}>
                      <Link to={`/app/complaints/${f.ticket_number}`} className="flex items-center justify-between gap-2 px-3.5 py-2 transition-colors hover:bg-forest-50/70">
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold">{categoryName(f.category)}{f.locality ? ` · ${f.locality}` : ''}</span>
                          <span className="block truncate text-xs text-muted">{timeAgo(f.created_at)}{f.supporting_count > 0 ? ` · ${f.supporting_count} ${t('dash.supporters', 'supporting')}` : ''}</span>
                        </span>
                        <TStatusBadge status={f.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel className="shrink-0" bodyClassName="grid grid-cols-3 gap-2 p-2.5">
              {quick.map((q) => (
                <Link key={q.to} to={q.to} title={q.sub} className="flex flex-col items-center gap-1.5 rounded-xl border border-line px-1.5 py-2.5 text-center transition-colors hover:border-forest/30 hover:bg-forest-50">
                  <IconTile icon={q.icon} tone={q.tone} />
                  <span className="text-[12px] font-semibold leading-tight">{q.label}</span>
                  {q.demo && <DemoTag kind="simulated" className="!px-1 !text-[9px]" />}
                </Link>
              ))}
            </Panel>
          </div>
        </div>
      )}
    </Page>
  )
}
