// CivicVerse hub: games, civic points / level, weekly challenge hint, CivicBot.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, ShieldCheck, Sprout, Star, Gamepad2 } from 'lucide-react'
import { api, errMsg } from '../../lib/api'
import { Badge, EmptyState, ErrorState, Page, Panel, Spinner } from '../../components/ui'
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
    <Page
      title="CivicVerse"
      subtitle="Short games that build civic awareness. Learn something, earn a few points, and keep your city in mind."
      actions={<Link to="/app/achievements" className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-paper"><Trophy className="h-4 w-4 text-saffron" aria-hidden /> My achievements</Link>}
    >
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        {/* left: fairness note + games */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex shrink-0 items-start gap-2 rounded-[10px] border border-forest/20 bg-forest-50 px-3 py-2 text-[13px] text-ink/90">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
            <span>Points are earned from verified contributions and daily games - never from the number of complaints submitted. Game points are capped each day.</span>
          </div>
          {games === null && !gamesErr && <Panel className="flex-1"><Spinner label="Loading games…" /></Panel>}
          {gamesErr && <Panel className="flex-1"><ErrorState message={gamesErr} onRetry={load} /></Panel>}
          {games && games.length === 0 && <Panel className="flex-1"><EmptyState icon={Gamepad2} title="No games available" hint="Games are not available right now. Please check back later." /></Panel>}
          {games && games.length > 0 && (
            <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-2 lg:auto-rows-fr lg:overflow-y-auto">
              {games.map((g) => <GameCard key={g.code} game={g} />)}
            </div>
          )}
        </div>

        {/* right: points, weekly challenge, CivicBot */}
        <div className="flex min-h-0 flex-col gap-3">
          <Panel title="Your civic points" subtitle="Verified contributions and daily games" icon={Star} tone="saffron" className="shrink-0" bodyClassName="p-3.5">
            {ach === null && profile === null && <Spinner label="Loading…" className="py-3" />}
            {(ach !== null || profile !== null) && points == null && (
              <p className="text-sm text-muted">Your points could not be loaded right now.</p>
            )}
            {points != null && (
              <>
                <div className="flex items-end justify-between gap-3">
                  <p className="font-display text-[34px] font-extrabold leading-none text-saffron">{points}</p>
                  <span className="rounded-full border border-saffron/25 bg-saffron-100 px-2.5 py-0.5 text-xs font-bold text-saffron">{level?.title || 'Getting started'}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{verified ?? 0} verified contribution{verified === 1 ? '' : 's'}</p>
                {level?.next_title && level?.next_threshold != null && (
                  <div className="mt-2">
                    <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={level.next_threshold} aria-valuenow={Math.min(verified ?? 0, level.next_threshold)} aria-label="Progress to next level">
                      <div className="h-full rounded-full bg-forest transition-all duration-500" style={{ width: `${Math.min(100, Math.round(((verified ?? 0) / Math.max(1, level.next_threshold)) * 100))}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted">Next: {level.next_title} at {level.next_threshold} verified contributions</p>
                  </div>
                )}
              </>
            )}
            <Link to="/app/achievements" className="mt-2.5 inline-block text-[13px] font-semibold text-civic hover:underline">See Growing City and achievements</Link>
          </Panel>

          <Panel title="Weekly challenge" subtitle="A small bonus for coming back" icon={Sprout} tone="forest" className="shrink-0" bodyClassName="space-y-2 p-3.5">
            <p className="text-sm text-ink">Play both games this week to unlock the Golden Tree.</p>
            {tree?.unlocked && <Badge tone="saffron">Golden Tree unlocked - find it on your Achievements page</Badge>}
          </Panel>

          <CivicBot className="lg:flex-1" />
        </div>
      </div>
    </Page>
  )
}
