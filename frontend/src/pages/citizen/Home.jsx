import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FilePlus2, ClipboardList, Hourglass, CheckCircle2, Eye, Truck, Gamepad2, Award, Star, ArrowRight, Users } from 'lucide-react'
import { Button, Card, CardHeader, DemoTag, EmptyState, ErrorState, PageHeader, Spinner, Stat } from '../../components/ui'
import { ComplaintRow, TStatusBadge } from '../../components/StatusTimeline'
import { api, errMsg } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { useMeta } from '../../store/meta'
import { useT } from '../../lib/i18n'
import { timeAgo } from '../../lib/format'

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

  return (
    <div>
      <PageHeader title={`${t('dash.welcome', 'Welcome')}${first ? ', ' + first : ''}`} subtitle={t('dash.sub', 'Here is what is happening with your reports and your neighbourhood.')} />

      <Card className="mb-5 border-forest/25 bg-forest-50 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-forest">{t('dash.seeSomething', 'See something that needs fixing?')}</h2>
            <p className="text-sm text-ink/75">{t('dash.seeSomethingD', 'Speak or type it in your language. It takes about a minute.')}</p>
          </div>
          <Button as={Link} to="/app/report" size="lg" className="w-full sm:w-auto"><FilePlus2 className="h-5 w-5" aria-hidden />{t('btn.report', 'Report an issue')}</Button>
        </div>
      </Card>

      {loading ? <Spinner /> : error && !summary ? (
        <Card><ErrorState message={error} onRetry={load} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t('dash.myReports', 'My reports')} value={summary?.total ?? 0} icon={ClipboardList} accent="forest" />
            <Stat label={t('dash.unresolved', 'Unresolved')} value={summary?.unresolved ?? 0} icon={Hourglass} accent="high" />
            <Stat label={t('dash.resolved', 'Resolved')} value={summary?.resolved ?? 0} icon={CheckCircle2} accent="success" />
            <Stat label={t('dash.following', 'Following')} value={summary?.following ?? 0} icon={Eye} accent="civic" />
          </div>

          {summary?.awaiting_my_confirmation > 0 && (
            <p className="mt-3 rounded-[10px] border border-plum/25 bg-plum-100 px-4 py-2 text-sm text-plum">
              {summary.awaiting_my_confirmation} {t('dash.awaiting', 'of your reports are awaiting verification by a supervisor.')}
            </p>
          )}

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <div className="space-y-5">
              <Card>
                <CardHeader title={t('dash.recent', 'Recent reports')} action={<Link to="/app/complaints" className="inline-flex items-center gap-1 text-sm font-semibold text-civic hover:underline">{t('dash.viewAll', 'View all')}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>} />
                {recent.length === 0 ? (
                  <EmptyState title={t('dash.noReports', 'You have not reported anything yet')} hint={t('dash.noReportsD', 'Your first report will appear here with live status updates.')}
                    action={<Button as={Link} to="/app/report" size="sm">{t('btn.report', 'Report an issue')}</Button>} />
                ) : (
                  <div className="divide-y divide-line">{recent.map((c) => <ComplaintRow key={c.ticket_number} c={c} />)}</div>
                )}
              </Card>

              <Card>
                <CardHeader title={t('dash.neighbourhood', 'Neighbourhood activity')} subtitle={t('dash.neighbourhoodD', 'Recent public reports. Locations are approximate and reporters are never shown.')} />
                {feed.length === 0 ? (
                  <EmptyState icon={Users} title={t('dash.noFeed', 'No recent activity to show')} />
                ) : (
                  <ul className="divide-y divide-line">
                    {feed.slice(0, 6).map((f) => (
                      <li key={f.ticket_number}>
                        <Link to={`/app/complaints/${f.ticket_number}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-forest-50/60 sm:px-5">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{categoryName(f.category)}{f.locality ? ` · ${f.locality}` : ''}</span>
                            <span className="block text-xs text-muted">{timeAgo(f.created_at)}{f.supporting_count > 0 ? ` · ${f.supporting_count} ${t('dash.supporters', 'supporting')}` : ''}</span>
                          </span>
                          <TStatusBadge status={f.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="space-y-5">
              <Card className="p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-[15px] font-bold">{t('dash.points', 'Civic points')}</h3>
                  <Star className="h-4 w-4 text-saffron" aria-hidden />
                </div>
                {profile ? (
                  <>
                    <p className="mt-1 font-display text-3xl font-extrabold text-saffron">{profile.points_total ?? 0}</p>
                    {levelTitle && <p className="mt-0.5 text-sm font-semibold text-ink">{levelTitle}</p>}
                    {pct != null ? (
                      <div className="mt-3">
                        <div className="h-2 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('dash.nextLevel', 'Progress to next level')}>
                          <div className="h-full bg-forest" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1.5 text-xs text-muted">{verified}/{nextThreshold} {t('dash.verifiedToward', 'verified contributions toward')} {nextTitle}</p>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted">{t('dash.pointsNote', 'Points are earned for verified improvements, not for submitting reports.')}</p>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted">{t('dash.pointsNone', 'Your points will appear here once your first report is verified as resolved.')}</p>
                )}
              </Card>

              <Card className="p-2">
                <h3 className="px-3 pb-1 pt-2 font-display text-[15px] font-bold">{t('dash.quick', 'Quick links')}</h3>
                {[
                  { to: '/app/cleanroute', label: t('nav.cleanroute', 'CleanRoute'), sub: t('dash.cleanrouteD', 'Collection vehicles and bins'), icon: Truck, tone: 'bg-civic-100 text-civic', demo: true },
                  { to: '/app/civicverse', label: t('nav.civicverse', 'CivicVerse'), sub: t('dash.civicverseD', 'Learn and play for civic awareness'), icon: Gamepad2, tone: 'bg-teal-100 text-teal' },
                  { to: '/app/certificates', label: t('nav.certificates', 'Certificates'), sub: t('dash.certD', 'Recognition for verified fixes'), icon: Award, tone: 'bg-saffron-100 text-saffron' },
                ].map((q) => (
                  <Link key={q.to} to={q.to} className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 hover:bg-forest-50">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-full ${q.tone}`}><q.icon className="h-[18px] w-[18px]" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-semibold">{q.label}{q.demo && <DemoTag kind="simulated" />}</span>
                      <span className="block truncate text-xs text-muted">{q.sub}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted" aria-hidden />
                  </Link>
                ))}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
