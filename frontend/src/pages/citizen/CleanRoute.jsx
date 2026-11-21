import { useMemo, useState } from 'react'
import { CalendarClock, MapPinned } from 'lucide-react'
import { ErrorState, Page, Panel, Spinner, Tabs } from '../../components/ui'
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
    <Page
      title="CleanRoute"
      actions={<LiveStatusBar compact conn={live.conn} polling={live.polling} lastUpdated={live.lastUpdated} stale={live.stale} sourceLabel={live.sourceLabel} error={hasData ? null : live.error} onRetry={live.refresh} />}
    >
      <DemoBanner compact />

      {live.loading && !hasData ? (
        <Panel className="flex-1"><Spinner label="Loading CleanRoute demo data..." /></Panel>
      ) : live.error && !hasData ? (
        <Panel className="flex-1"><ErrorState message={live.error} onRetry={live.refresh} /></Panel>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_350px] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* map fills the available height */}
          <Panel title="Live map" subtitle="Simulated vehicles, demo routes and bin status" icon={MapPinned} tone="civic" scroll={false} bodyClassName="flex flex-col p-0"
            footer={<Legend compact />}>
            <div className="relative h-[55vh] min-h-[320px] lg:min-h-0 lg:flex-1">
              <GarbageMap
                fill
                vehicles={live.vehicleList} bins={live.binList} routes={live.routes}
                selectedVehicleId={selV} selectedBinId={selB}
                onSelectVehicle={(id) => { setSelV(id); setTab('vehicles') }} onSelectBin={(id) => { setSelB(id); setTab('bins') }}
                showReport focus={focus}
              />
            </div>
          </Panel>

          {/* compact side panel with tabs */}
          <Panel scroll={false} bodyClassName="flex flex-col p-0">
            <div className="shrink-0 border-b border-line p-2.5">
              <SummaryStats compact summary={live.summary} />
            </div>
            <div className="shrink-0 px-2">
              <Tabs
                tabs={[{ value: 'vehicles', label: `Vehicles (${live.vehicleList.length})` }, { value: 'bins', label: `Bins (${live.binList.length})` }, { value: 'schedule', label: 'Schedule' }]}
                value={tab} onChange={setTab} />
            </div>
            <div className="max-h-[60vh] min-h-0 flex-1 overflow-y-auto lg:max-h-none">
              {tab === 'vehicles' && (
                <>
                  {vehicle && <div className="border-b border-line p-2.5"><VehiclePanel vehicle={vehicle} route={route} onClose={() => setSelV(null)} /></div>}
                  <VehicleList vehicles={live.vehicleList} selectedId={selV} onSelect={pickVehicle} />
                </>
              )}
              {tab === 'bins' && <BinList bins={live.binList} selectedId={selB} onSelect={pickBin} showReport filter={filter} onFilter={setFilter} />}
              {tab === 'schedule' && (
                <div>
                  <p className="border-b border-line bg-paper px-4 py-2 text-xs text-muted">Next scheduled collection windows. Demo schedule - not an official municipal timetable.</p>
                  {live.routes.length ? (
                    <ul className="divide-y divide-line">
                      {live.routes.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                          <span className="flex min-w-0 items-center gap-2 font-medium text-ink"><CalendarClock className="h-4 w-4 shrink-0 text-forest" aria-hidden /><span className="truncate">{r.name}</span></span>
                          <span className="shrink-0 text-muted">{r.schedule_window || 'Not set'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="px-4 py-4 text-sm text-muted">No route schedules available.</p>}
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}
    </Page>
  )
}
