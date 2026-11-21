// Achievements: level, Growing City, neighbourhood story, points history, achievements, Golden Tree.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Users } from 'lucide-react'
import { api, errMsg } from '../../lib/api'
import { Card, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui'
import { fmtDate, titleCase } from '../../lib/format'
import LevelCard from '../../features/civicverse/LevelCard'
import GrowingCity from '../../features/civicverse/GrowingCity'
import AchievementGrid from '../../features/civicverse/AchievementGrid'
import GoldenTree from '../../features/civicverse/GoldenTree'
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

export default function Achievements() {
  const [ach, setAch] = useState(null)
  const [profile, setProfile] = useState(null)
  const [hood, setHood] = useState(null)
  const [achErr, setAchErr] = useState('')
  const [profErr, setProfErr] = useState('')

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
    <div>
      <PageHeader title="Achievements" subtitle="Recognition for verified contributions to your community." />

      {loadingAll && <Spinner label="Loading your achievements…" />}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {achErr && <Card><ErrorState message={achErr} onRetry={load} /></Card>}
          {(ach || profile) && <LevelCard level={level} pointsTotal={points} verified={verified} />}

          {profErr && <Card><ErrorState message={profErr} onRetry={load} /></Card>}
          {profile && <GrowingCity items={profile.growing_city} />}

          {profile && (
            <Card>
              <CardHeader title="Your neighbourhood story" subtitle="Verified improvements that began with your reports" />
              <CardBody>
                {STORY.every(([k]) => !Number(story[k])) ? (
                  <p className="text-sm text-muted">Nothing to show yet. Verified improvements will be counted here.</p>
                ) : (
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {STORY.map(([k, label]) => (
                      <div key={k} className="rounded-[10px] border border-line bg-paper p-3">
                        <dd className="font-display text-2xl font-extrabold text-forest">{Number(story[k]) || 0}</dd>
                        <dt className="text-xs text-muted">{label}</dt>
                      </div>
                    ))}
                  </dl>
                )}
              </CardBody>
            </Card>
          )}

          {ach && (
            <Card>
              <CardHeader title="Achievements" subtitle="Secret achievements stay hidden until you earn them" />
              <CardBody><AchievementGrid achievements={ach.achievements} /></CardBody>
            </Card>
          )}

          {profile && (
            <Card>
              <CardHeader title="Points history" subtitle="Most recent entries" />
              {history.length === 0 ? (
                <EmptyState title="No points yet" hint="Points come from verified contributions and daily games. They never come from the number of complaints submitted." />
              ) : (
                <ul className="divide-y divide-line">
                  {history.map((h, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{h.note || titleCase(h.reason_code || 'points')}</p>
                        <p className="text-xs text-muted">{fmtDate(h.created_at)}</p>
                      </div>
                      <span className="font-display font-bold text-saffron">+{h.points}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {profile && verified > 0 && (
            <Card className="border-saffron/40 bg-saffron-100/40">
              <CardBody>
                <p className="flex items-center gap-2 font-display text-[15px] font-bold text-ink"><Heart className="h-4 w-4 text-saffron" aria-hidden /> A thank you from your city</p>
                <p className="mt-2 text-sm text-ink">Your voice helped make this neighbourhood better. Thank you for caring about your community.</p>
              </CardBody>
            </Card>
          )}

          {profile && <GoldenTree tree={profile.golden_tree} />}

          <Card>
            <CardHeader title="Across the city" subtitle="Verified improvements, everyone combined" />
            <CardBody>
              {hood === null && <Spinner label="Loading…" className="py-3" />}
              {hood === false && <p className="text-sm text-muted">City-wide counts are unavailable right now.</p>}
              {hood && hoodRows.length === 0 && <p className="text-sm text-muted">No verified improvements to count yet.</p>}
              {hoodRows.length > 0 && (
                <ul className="space-y-1.5">
                  {hoodRows.map((r) => (
                    <li key={r.label} className="flex items-center justify-between text-sm">
                      <span className="text-ink">{r.label}</span>
                      <span className="font-semibold text-forest">{r.count}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted"><Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Totals only. No names or exact locations are shown.</p>
            </CardBody>
          </Card>

          <CivicBot />
          <Link to="/app/civicverse" className="block text-center text-sm font-semibold text-civic hover:underline">Back to CivicVerse</Link>
        </div>
      </div>
    </div>
  )
}
