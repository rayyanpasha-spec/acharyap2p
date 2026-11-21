// Accessible list alternative to the map: same filtered data, sorted by priority. Selecting an item opens the details panel
// and (via onSelect) flies the map to it.
import { useEffect, useState } from 'react'
import { Inbox } from 'lucide-react'
import { Badge, EmptyState, ErrorState, SeverityBadge, StatusBadge, cn } from '../../../components/ui'
import { timeAgo } from '../../../lib/format'
import { BIN_STATUS, VEHICLE_STATUS } from '../utils/mapConfig'
import DataSourceBadge from './DataSourceBadge'

const PAGE = 40

function Row({ selected, onClick, label, children }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-current={selected || undefined}
        className={cn('flex w-full flex-col gap-1.5 rounded-[10px] border bg-surface px-3.5 py-3 text-left transition-colors hover:border-line-strong hover:bg-paper', selected ? 'border-civic' : 'border-line')}
      >
        {children}
      </button>
    </li>
  )
}

function ComplaintList({ features, selection, onSelect }) {
  const [shown, setShown] = useState(PAGE)
  useEffect(() => setShown(PAGE), [features.length])
  if (!features.length) return <EmptyState title="No civic issues match these filters" hint="Clear a filter or zoom out on the map to see more." />
  return (
    <>
      <ul className="space-y-2" aria-label="Civic issues sorted by priority">
        {features.slice(0, shown).map((f) => {
          const p = f.properties
          return (
            <Row key={p.ticket_id} selected={selection?.type === 'complaint' && selection.id === p.ticket_id} onClick={() => onSelect('complaint', p.ticket_id)}
              label={`${p.ticket_id}, ${p.severity} severity, ${p.category_name || p.category}. Open details`}>
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[13px] font-semibold text-ink">{p.ticket_id}</span>
                <SeverityBadge severity={p.severity} />
                <StatusBadge status={p.status} />
              </span>
              <span className="line-clamp-2 text-sm text-ink">{p.public_summary || p.category_name || 'Civic issue'}</span>
              <span className="text-xs text-muted">{[p.category_name, p.locality, p.created_at ? `reported ${timeAgo(p.created_at)}` : null].filter(Boolean).join(' - ')}</span>
            </Row>
          )
        })}
      </ul>
      {features.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="mt-3 w-full rounded-[10px] border border-line-strong bg-surface py-2 text-sm font-semibold text-ink hover:bg-paper">
          Show more ({features.length - shown} remaining)
        </button>
      )}
    </>
  )
}

function FleetList({ vehicles, bins, selection, onSelect, layers }) {
  const sortedBins = [...bins].sort((a, b) => b.fill_percentage - a.fill_percentage)
  return (
    <div className="space-y-6">
      {layers.vehicles && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Collection vehicles ({vehicles.length})</h3>
          {vehicles.length === 0 ? <EmptyState title="No vehicle positions yet" hint="Vehicles appear here when the CleanRoute simulation or a GPS feed is running." /> : (
            <ul className="space-y-2">
              {vehicles.map((v) => {
                const st = VEHICLE_STATUS[v.status] || VEHICLE_STATUS.idle
                return (
                  <Row key={v.vehicle_id} selected={selection?.type === 'vehicle' && selection.id === String(v.vehicle_id)} onClick={() => onSelect('vehicle', v.vehicle_id)} label={`Vehicle ${v.vehicle_code}, ${st.label}. Open details`}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[13px] font-semibold text-ink">{v.vehicle_code}</span>
                      <Badge tone={v.stale ? 'neutral' : st.tone} dot>{st.label}</Badge>
                      <DataSourceBadge source={v.data_source} kind="vehicle" />
                    </span>
                    <span className="text-xs text-muted">
                      {[v.route_name, v.route_progress != null ? `${Math.round(v.route_progress)}% complete` : null, v.stale ? 'location may be outdated' : null].filter(Boolean).join(' - ')}
                    </span>
                  </Row>
                )
              })}
            </ul>
          )}
        </section>
      )}
      {layers.bins && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Waste bins ({bins.length})</h3>
          {bins.length === 0 ? <EmptyState title="No bin readings yet" /> : (
            <ul className="space-y-2">
              {sortedBins.map((b) => {
                const st = BIN_STATUS[b.status] || BIN_STATUS.normal
                return (
                  <Row key={b.bin_id} selected={selection?.type === 'bin' && selection.id === String(b.bin_id)} onClick={() => onSelect('bin', b.bin_id)} label={`Bin ${b.bin_code}, ${Math.round(b.fill_percentage)} percent full, ${st.label}. Open details`}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[13px] font-semibold text-ink">{b.bin_code}</span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2 py-0.5 text-xs font-semibold text-ink"><span className="h-2 w-2 rounded-sm" style={{ background: st.color }} aria-hidden />{Math.round(b.fill_percentage)}% - {st.label}</span>
                      <DataSourceBadge source={b.data_source} kind="bin" />
                    </span>
                    <span className="text-xs text-muted">{b.public_label}</span>
                  </Row>
                )
              })}
            </ul>
          )}
        </section>
      )}
      {!layers.vehicles && !layers.bins && <EmptyState icon={Inbox} title="No CleanRoute layers are on" hint="Turn on vehicles or bins in the layer list to see them here." />}
    </div>
  )
}

export default function ListView({ view, complaints, resolved, layers, vehicles, bins, selection, onSelect, status, onRetry }) {
  const features = [...(layers.complaints ? complaints.features : []), ...(layers.resolved ? resolved.features : [])]
  features.sort((a, b) => (b.properties.priority_score || 0) - (a.properties.priority_score || 0) || b.properties.sev_rank - a.properties.sev_rank)
  const failed = view === 'issues' ? status.complaints === 'error' : status.vehicles === 'error' && status.bins === 'error'
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-paper px-3 pb-24 pt-28 sm:px-6">
      <div className="mx-auto max-w-3xl">
        {failed ? <ErrorState message="Could not load this data. The map and list use the same source." onRetry={onRetry} />
          : view === 'issues'
            ? (layers.complaints || layers.resolved
              ? <ComplaintList features={features} selection={selection} onSelect={onSelect} />
              : <EmptyState icon={Inbox} title="The Civic issues layer is off" hint="Turn it on in the layer list to see issues here." />)
            : <FleetList vehicles={vehicles} bins={bins} selection={selection} onSelect={onSelect} layers={layers} />}
      </div>
    </div>
  )
}
