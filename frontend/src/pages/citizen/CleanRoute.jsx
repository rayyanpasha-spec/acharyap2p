import { useMemo, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { Card, CardHeader, ErrorState, PageHeader, Spinner, Tabs } from '../../components/ui'
import { useGarbageLive } from '../../features/garbage-tracker/useGarbageLive'
import GarbageMap from '../../features/garbage-tracker/GarbageMap'
import VehiclePanel, { VehicleList } from '../../features/garbage-tracker/VehiclePanel'
import BinList from '../../features/garbage-tracker/BinList'
import Legend from '../../features/garbage-tracker/Legend'
import { DemoBanner, LiveStatusBar, SummaryStats } from '../../features/garbage-tracker/StatusBits'

export default function CleanRoute() {
  const live = useGarbageLive()
  const [selV, setSelV] = useState(null)
  const [selB, setSelB] = useState(null)
  const [focus, setFocus] = useState(null)
  const [tab, setTab] = useState('vehicles')
  const [filter, setFilter] = useState('all')

  const vehicle = selV != null ? live.vehicles[selV] : null
  const route = useMemo(() => (vehicle ? live.routes.find((r) => r.id === vehicle.route?.id) : null), [vehicle, live.routes])
  const hasData = live.vehicleList.length > 0 || live.binList.length > 0

  const pickVehicle = (v) => { setSelV(v.id); if (Number.isFinite(Number(v.latitude))) setFocus({ lat: Number(v.latitude), lng: Number(v.longitude), k: Math.random() }) }
  const pickBin = (b) => { setSelB(b.id); if (Number.isFinite(Number(b.latitude))) setFocus({ lat: Number(b.latitude), lng: Number(b.longitude), k: Math.random() }) }

  return (
    <div>
      <PageHeader title="CleanRoute" subtitle="Garbage collection tracker - see simulated collection vehicles, routes and nearby bin status." />
      <DemoBanner />
      <LiveStatusBar conn={live.conn} polling={live.polling} lastUpdated={live.lastUpdated} stale={live.stale} sourceLabel={live.sourceLabel} error={hasData ? null : live.error} onRetry={live.refresh} />

      {live.loading && !hasData ? (
        <Spinner label="Loading CleanRoute demo data..." />
      ) : live.error && !hasData ? (
        <Card><ErrorState message={live.error} onRetry={live.refresh} /></Card>
      ) : (
        <>
          <SummaryStats summary={live.summary} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
              <GarbageMap
                vehicles={live.vehicleList} bins={live.binList} routes={live.routes}
                selectedVehicleId={selV} selectedBinId={selB}
                onSelectVehicle={(id) => { setSelV(id); setTab('vehicles') }} onSelectBin={(id) => { setSelB(id); setTab('bins') }}
                showReport focus={focus}
              />
              <Legend />
              {vehicle && <VehiclePanel vehicle={vehicle} route={route} onClose={() => setSelV(null)} />}
              <Card>
                <CardHeader title="Next scheduled collection windows" subtitle="Demo schedule - not an official municipal timetable" />
                {live.routes.length ? (
                  <ul className="divide-y divide-line">
                    {live.routes.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                        <span className="flex items-center gap-2 font-medium text-ink"><CalendarClock className="h-4 w-4 text-forest" aria-hidden />{r.name}</span>
                        <span className="text-muted">{r.schedule_window || 'Not set'}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="px-5 py-4 text-sm text-muted">No route schedules available.</p>}
              </Card>
            </div>

            <Card className="h-fit overflow-hidden">
              <Tabs tabs={[{ value: 'vehicles', label: `Vehicles (${live.vehicleList.length})` }, { value: 'bins', label: `Bins (${live.binList.length})` }]} value={tab} onChange={setTab} />
              <div className="max-h-[70vh] overflow-y-auto">
                {tab === 'vehicles'
                  ? <VehicleList vehicles={live.vehicleList} selectedId={selV} onSelect={pickVehicle} />
                  : <BinList bins={live.binList} selectedId={selB} onSelect={pickBin} showReport filter={filter} onFilter={setFilter} />}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
