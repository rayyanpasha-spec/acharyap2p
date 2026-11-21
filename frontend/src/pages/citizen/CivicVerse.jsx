// CivicVerse hub: games, civic points / level, weekly challenge hint, CivicBot.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, ShieldCheck, Sprout } from 'lucide-react'
import { api, errMsg } from '../../lib/api'
import { Badge, Card, CardBody, CardHeader, ErrorState, Notice, PageHeader, Spinner, EmptyState } from '../../components/ui'
import GameCard from '../../features/civicverse/GameCard'
import CivicBot from '../../features/civicverse/CivicBot'

export default function CivicVerse() {
  const [games, setGames] = useState(null)
  const [gamesErr, setGamesErr] = useState('')
  const [ach, setAch] = useState(null)
  const [profile, setProfile] = useState(null)

  const load = useCallback(() => {
    setGames(null); setGamesErr('')
    api.get('/games').then((r) => setGames(Array.isArray(r.data) ? r.data : (r.data?.items || []))).catch((e) => setGamesErr(errMsg(e)))
    api.get('/achievements').then((r) => setAch(r.data)).catch(() => setAch(false))
    api.get('/civic/profile').then((r) => setProfile(r.data)).catch(() => setProfile(false))
  }, [])
  useEffect(() => { load() }, [load])

  const level = ach?.level || null
  const points = ach?.points_total ?? profile?.points_total
  const verified = level?.verified_contributions ?? profile?.verified_contributions
  const tree = profile?.golden_tree

  return (
    <div>
      <PageHeader
        title="CivicVerse"
        subtitle="Short games that build civic awareness. Learn something, earn a few points, and keep your city in mind."
        actions={<Link to="/app/achievements" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-paper"><Trophy className="h-4 w-4 text-saffron" aria-hidden /> My achievements</Link>}
      />

      <Notice tone="forest" className="mb-5">
        <span className="inline-flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
          <span>Points are earned from verified contributions and daily games - never from the number of complaints submitted. Game points are capped each day.</span>
        </span>
      </Notice>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {games === null && !gamesErr && <Spinner label="Loading games…" />}
          {gamesErr && <Card><ErrorState message={gamesErr} onRetry={load} /></Card>}
          {games && games.length === 0 && <Card><EmptyState title="No games available" hint="Games are not available right now. Please check back later." /></Card>}
          {games && games.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {games.map((g) => <GameCard key={g.code} game={g} />)}
            </div>
          )}

          <Card>
            <CardHeader title="Weekly challenge" subtitle="A small bonus for coming back" />
            <CardBody className="space-y-2">
              <p className="flex items-start gap-2 text-sm text-ink">
                <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
                Play both games this week to unlock the Golden Tree.
              </p>
              {tree?.unlocked && <Badge tone="saffron">Golden Tree unlocked - find it on your Achievements page</Badge>}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Your civic points" subtitle="From verified contributions and daily games" />
            <CardBody>
              {ach === null && profile === null && <Spinner label="Loading…" className="py-4" />}
              {(ach !== null || profile !== null) && points == null && (
                <p className="text-sm text-muted">Your points could not be loaded right now.</p>
              )}
              {points != null && (
                <>
                  <p className="font-display text-[34px] font-extrabold leading-none text-saffron">{points}</p>
                  <p className="mt-1 text-xs text-muted">civic points</p>
                  <div className="mt-4 space-y-1">
                    <p className="text-sm font-semibold text-ink">{level?.title || 'Getting started'}</p>
                    <p className="text-xs text-muted">{verified ?? 0} verified contribution{verified === 1 ? '' : 's'}</p>
                    {level?.next_title && level?.next_threshold != null && (
                      <>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={level.next_threshold} aria-valuenow={Math.min(verified ?? 0, level.next_threshold)} aria-label="Progress to next level">
                          <div className="h-full rounded-full bg-forest transition-all duration-500" style={{ width: `${Math.min(100, Math.round(((verified ?? 0) / Math.max(1, level.next_threshold)) * 100))}%` }} />
                        </div>
                        <p className="text-xs text-muted">Next: {level.next_title} at {level.next_threshold} verified contributions</p>
                      </>
                    )}
                  </div>
                </>
              )}
              <Link to="/app/achievements" className="mt-4 inline-block text-sm font-semibold text-civic hover:underline">See Growing City and achievements</Link>
            </CardBody>
          </Card>

          <CivicBot />
        </div>
      </div>
    </div>
  )
}
