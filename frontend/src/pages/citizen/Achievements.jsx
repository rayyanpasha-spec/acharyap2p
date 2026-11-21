// Achievements: level, Growing City, neighbourhood story, points history, achievements, Golden Tree.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, Heart, Users } from 'lucide-react'
import { api, errMsg } from '../../lib/api'
import { EmptyState, ErrorState, Page, Panel, Segmented, Spinner } from '../../components/ui'
import { fmtDate, titleCase } from '../../lib/format'
import LevelCard from '../../features/civicverse/LevelCard'
import GrowingCity from '../../features/civicverse/GrowingCity'
import AchievementGrid from '../../features/civicverse/AchievementGrid'
import GoldenTree from '../../features/civicverse/GoldenTree'
import RewardCard from '../../features/civicverse/RewardCard'
import CivicBot from '../../features/civicverse/CivicBot'

const STORY = [
  ['road_repairs', 'Road repairs'],
  ['streetlights_restored', 'Streetlights restored'],
  ['water_leaks_fixed', 'Water leaks fixed'],
  ['sanitation_resolved', 'Sanitation issues resolved'],
  ['trees_resolved', 'Tree issues resolved'],
  ['drainage_resolved', 'Drainage issues resolved'],
]

/** Neighbourhood aggregate may come as {counts:{...}}, {by_category:[{category,name,count}]} or a flat object / list. */
function normaliseNeighbourhood(d) {
  if (!d) return []
  const src = d.by_category || d.counts || d.items || d
  if (Array.isArray(src)) {
    return src.map((x) => ({ label: x.name || x.label || titleCase(x.category || x.code || ''), count: Number(x.count ?? x.total ?? 0) || 0 })).filter((x) => x.label)
  }
  if (src && typeof src === 'object') {
    return Object.entries(src).filter(([, v]) => typeof v === 'number').map(([k, v]) => ({ label: titleCase(k), count: v }))
  }
  return []
}

const STORY_TONE = ['bg-forest-50 text-forest border-forest/15', 'bg-saffron-100/60 text-saffron border-saffron/20', 'bg-civic-50 text-civic border-civic/15', 'bg-teal-100/60 text-teal border-teal/20', 'bg-success-100/60 text-success border-success/20', 'bg-plum-100/60 text-plum border-plum/20']

export default function Achievements() {
  const [ach, setAch] = useState(null)
  const [profile, setProfile] = useState(null)
  const [hood, setHood] = useState(null)
  const [achErr, setAchErr] = useState('')
  const [profErr, setProfErr] = useState('')
  const [tab, setTab] = useState('story')

  const load = useCallback(() => {
    setAch(null); setProfile(null); setHood(null); setAchErr(''); setProfErr('')
    api.get('/achievements').then((r) => setAch(r.data)).catch((e) => setAchErr(errMsg(e)))
    api.get('/civic/profile').then((r) => setProfile(r.data)).catch((e) => setProfErr(errMsg(e)))
    api.get('/civic/neighbourhood').then((r) => setHood(r.data)).catch(() => setHood(false))
  }, [])
  useEffect(() => { load() }, [load])

  const verified = profile?.verified_contributions ?? ach?.level?.verified_contributions ?? 0
  const level = ach?.level || profile?.level
  const points = ach?.points_total ?? profile?.points_total
  const story = profile?.neighbourhood_story || {}
  const history = Array.isArray(profile?.history) ? profile.history : []
  const hoodRows = normaliseNeighbourhood(hood)
  const loadingAll = ach === null && profile === null && !achErr && !profErr

  return (
    <Page title="Achievements" subtitle="Recognition for verified contributions to your community."
      actions={<Link to="/app/civicverse" className="inline-flex h-9 items-center rounded-[10px] border border-line-strong bg-surface px-3.5 text-[13px] font-semibold text-civic transition-colors hover:bg-paper">Back to CivicVerse</Link>}>
      {loadingAll ? <Panel className="flex-1"><Spinner label="Loading your achievements…" /></Panel> : (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
          {/* column 1: level + Growing City */}
          <div className="flex min-h-0 flex-col gap-3">
            {achErr && <Panel><ErrorState message={achErr} onRetry={load} /></Panel>}
            {(ach || profile) && <LevelCard level={level} pointsTotal={points} verified={verified} className="shrink-0" />}
            <RewardCard className="shrink-0" />
            {profErr && <Panel><ErrorState message={profErr} onRetry={load} /></Panel>}
            {profile && <GrowingCity items={profile.growing_city} className="min-h-[300px] lg:min-h-0 lg:flex-1" />}
          </div>

          {/* column 2: achievements */}
          <Panel title="Achievements" subtitle="Secret ones stay hidden until earned" icon={Award} tone="saffron" bodyClassName="p-3">
            {ach ? <AchievementGrid achievements={ach.achievements} /> : achErr ? <p className="text-sm text-muted">Achievements could not be loaded.</p> : <Spinner label="Loading…" className="py-4" />}
          </Panel>

          {/* column 3: story / points / city (tabs) + CivicBot */}
          <div className="flex min-h-0 flex-col gap-3">
            <Panel title="Your impact" icon={Heart} tone="plum" className="min-h-[320px] lg:min-h-0 lg:flex-1"
              action={<Segmented ariaLabel="Impact view" value={tab} onChange={setTab} className="shrink-0" options={[{ value: 'story', label: 'Story' }, { value: 'points', label: 'Points' }, { value: 'city', label: 'City' }]} />}>
              {tab === 'story' && (
                <div className="space-y-3">
                  {profile && verified > 0 && (
                    <div className="rounded-xl border border-saffron/40 bg-saffron-100/50 p-3">
                      <p className="flex items-center gap-2 font-display text-[14px] font-bold text-ink"><Heart className="h-4 w-4 text-saffron" aria-hidden /> A thank you from your city</p>
                      <p className="mt-1 text-[13px] text-ink">Your voice helped make this neighbourhood better. Thank you for caring about your community.</p>
                    </div>
                  )}
                  <div>
                    <p className="mb-1.5 text-[13px] font-semibold text-ink">Your neighbourhood story</p>
                    {!profile ? <p className="text-sm text-muted">Not available right now.</p> : STORY.every(([k]) => !Number(story[k])) ? (
                      <p className="text-sm text-muted">Nothing to show yet. Verified improvements will be counted here.</p>
                    ) : (
                      <dl className="grid grid-cols-3 gap-2">
                        {STORY.map(([k, label], idx) => (
                          <div key={k} className={`rounded-xl border p-2 ${STORY_TONE[idx % STORY_TONE.length]}`}>
                            <dd className="font-display text-xl font-extrabold leading-none">{Number(story[k]) || 0}</dd>
                            <dt className="mt-1 text-[11px] leading-tight text-ink/70">{label}</dt>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                  {profile && <GoldenTree tree={profile.golden_tree} />}
                </div>
              )}
              {tab === 'points' && (
                !profile ? <p className="text-sm text-muted">Not available right now.</p> : history.length === 0 ? (
                  <EmptyState title="No points yet" hint="Points come from verified contributions and daily games. They never come from the number of complaints submitted." />
                ) : (
                  <ul className="-mx-1 divide-y divide-line">
                    {history.map((h, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 px-1 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{h.note || titleCase(h.reason_code || 'points')}</p>
                          <p className="text-xs text-muted">{fmtDate(h.created_at)}</p>
                        </div>
                        <span className="font-display font-bold text-saffron">+{h.points}</span>
                      </li>
                    ))}
                  </ul>
                )
              )}
              {tab === 'city' && (
                <div>
                  <p className="mb-2 text-xs text-muted">Across the city: verified improvements, everyone combined.</p>
                  {hood === null && <Spinner label="Loading…" className="py-3" />}
                  {hood === false && <p className="text-sm text-muted">City-wide counts are unavailable right now.</p>}
                  {hood && hoodRows.length === 0 && <p className="text-sm text-muted">No verified improvements to count yet.</p>}
                  {hoodRows.length > 0 && (
                    <ul className="divide-y divide-line">
                      {hoodRows.map((r) => (
                        <li key={r.label} className="flex items-center justify-between py-1.5 text-sm">
                          <span className="text-ink">{r.label}</span>
                          <span className="font-semibold text-forest">{r.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 flex items-start gap-1.5 text-xs text-muted"><Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Totals only. No names or exact locations are shown.</p>
                </div>
              )}
            </Panel>
            <CivicBot compact className="shrink-0" />
          </div>
        </div>
      )}
    </Page>
  )
}
