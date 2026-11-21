import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import { AlertOctagon, Building2, CalendarDays, CheckCircle2, Clock, Copy, MapPinned, PieChart as PieIcon, RotateCcw, Tags } from 'lucide-react'
import { Card, DemoTag, ErrorState, Page, Panel, Spinner } from '../../components/ui'
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_ATTRIBUTION, TILE_URL } from '../../lib/leaflet'
import { titleCase } from '../../lib/format'
import { useMeta } from '../../store/meta'
import { CAT_HEX, Cell as TCell, HCell, MetricTile, SEVERITIES, SEV_HEX, hoursLabel, ratePct, useFetch } from '../../features/staff/common'

const CIVIC = '#2f5f8f'
const axis = { fontSize: 11, fill: '#737a72' }

/** Fills the remaining Panel height on desktop; fixed height when stacked on small screens. */
function ChartBox({ label, children, mobileH = 'h-56' }) {
  return (
    <div className={`relative ${mobileH} lg:h-auto lg:min-h-0 lg:flex-1`} role="img" aria-label={label}>
      <div className="absolute inset-0">{children}</div>
    </div>
  )
}
const chartBody = 'flex flex-col p-2'

export default function Analytics() {
  const { data, loading, error, reload } = useFetch('/analytics/overview')
  const meta = useMeta((s) => s.meta)

  const byCat = useMemo(() => (data?.by_category || []).map((c) => ({ ...c, label: c.name || titleCase(c.category) })), [data])
  const bySev = useMemo(() => SEVERITIES.map((s) => ({ name: titleCase(s), key: s, value: Number(data?.by_severity?.[s] || 0) })), [data])
  const daily = useMemo(() => (data?.daily_volume || []).map((d) => ({ ...d, label: String(d.date).slice(5) })), [data])
  const sla = data?.sla || {}
  const points = data?.map_points || []
  const center = meta?.map?.center || DEFAULT_CENTER
  const zoom = meta?.map?.zoom || DEFAULT_ZOOM

  if (loading && !data) return <Spinner label="Loading analytics…" />
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>
  if (!data) return null

  const sevTotal = bySev.reduce((a, b) => a + b.value, 0)
  const depts = data.by_department || []

  return (
    <Page
      title="Analytics"
      subtitle="Aggregate figures only. No personal citizen data is shown. SLA targets are sample configuration, not official municipal commitments."
      actions={<DemoTag />}
    >
      <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <MetricTile label="SLA overdue" value={sla.overdue ?? '—'} tone="critical" icon={AlertOctagon} />
        <MetricTile label="SLA at risk" value={sla.at_risk ?? '—'} tone="warning" icon={Clock} />
        <MetricTile label="SLA on track" value={sla.on_track ?? '—'} tone="success" icon={CheckCircle2} />
        <MetricTile label="Reopened rate" value={ratePct(data.reopened_rate)} tone="high" icon={RotateCcw} hint="Of resolved tickets" />
        <MetricTile label="Duplicate rate" value={ratePct(data.duplicate_rate)} tone="plum" icon={Copy} hint="Linked as duplicates" />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Tickets by category" icon={Tags} tone="civic" scroll={false} bodyClassName={chartBody}>
          {byCat.length === 0 ? <p className="p-2 text-[13px] text-muted">No data.</p> : (
            <ChartBox label="Bar chart of tickets by category">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCat} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
                  <CartesianGrid stroke="#e8e9e2" horizontal={false} />
                  <XAxis type="number" tick={axis} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={axis} width={110} interval={0} />
                  <Tooltip cursor={{ fill: '#f7f7f2' }} />
                  <Bar dataKey="count" name="Tickets" radius={[0, 4, 4, 0]}>
                    {byCat.map((c) => <Cell key={c.category} fill={CAT_HEX[c.category] || CAT_HEX.other} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
          )}
        </Panel>

        <Panel title="Severity mix" icon={PieIcon} tone="critical" scroll={false} bodyClassName={chartBody}>
          {sevTotal === 0 ? <p className="p-2 text-[13px] text-muted">No data.</p> : (
            <ChartBox label="Donut chart of tickets by severity">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={bySev} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="80%" paddingAngle={2} stroke="#fff">
                    {bySev.map((s) => <Cell key={s.key} fill={SEV_HEX[s.key]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartBox>
          )}
        </Panel>

        <Panel title="Complaint volume" subtitle="Last 30 days" icon={CalendarDays} tone="teal" scroll={false} bodyClassName={chartBody}>
          <ChartBox label="Area chart of daily complaint volume">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ left: -16, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid stroke="#e8e9e2" vertical={false} />
                <XAxis dataKey="label" tick={axis} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={axis} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="count" name="Complaints" stroke={CIVIC} strokeWidth={2} fill={CIVIC} fillOpacity={0.12} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartBox>
        </Panel>

        <Panel title="Department workload" subtitle="Median resolution uses verified resolutions only" icon={Building2} tone="forest" bodyClassName="overflow-x-auto p-0">
          {depts.length === 0 ? <p className="p-4 text-[13px] text-muted">No data.</p> : (
            <table className="w-full border-collapse text-left">
              <thead><tr><HCell>Department</HCell><HCell className="text-right">Total</HCell><HCell className="text-right">Open</HCell><HCell className="text-right">Resolved</HCell><HCell className="text-right">Median</HCell></tr></thead>
              <tbody>
                {depts.map((d) => (
                  <tr key={d.department_code} className="hover:bg-paper">
                    <TCell className="font-medium">{d.name || d.department_code}</TCell>
                    <TCell className="text-right tabular-nums">{d.total}</TCell>
                    <TCell className="text-right tabular-nums">{d.open}</TCell>
                    <TCell className="text-right tabular-nums">{d.resolved}</TCell>
                    <TCell className="text-right tabular-nums">{hoursLabel(d.median_resolution_hours)}</TCell>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel
          title="Active ticket concentration"
          subtitle={`${points.length} active ticket(s), coloured by severity`}
          icon={MapPinned}
          tone="plum"
          scroll={false}
          bodyClassName="flex flex-col p-0"
          className="lg:col-span-2"
          action={<div className="hidden gap-3 text-[11.5px] text-muted sm:flex">{SEVERITIES.map((s) => <span key={s} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SEV_HEX[s] }} aria-hidden />{titleCase(s)}</span>)}</div>}
        >
          <div className="relative h-72 lg:h-auto lg:min-h-0 lg:flex-1">
            <div className="absolute inset-0">
              <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} style={{ height: '100%', width: '100%', borderRadius: 0 }}>
                <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
                {points.filter((p) => p.latitude != null && p.longitude != null).map((p) => (
                  <CircleMarker key={p.ticket_number} center={[p.latitude, p.longitude]} radius={7} pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: SEV_HEX[p.severity] || '#737a72', fillOpacity: 0.9 }}>
                    <Popup>
                      <Link to={`/staff/tickets/${p.ticket_number}`} className="font-mono font-semibold text-civic">{p.ticket_number}</Link>
                      <div className="text-xs">{titleCase(p.category || '')} · {titleCase(p.severity || '')} · {titleCase(p.status || '')}</div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
            {points.length === 0 && <p className="absolute left-3 top-3 z-[500] rounded-md bg-surface/95 px-2 py-1 text-[12px] text-muted shadow-sm">No active tickets with coordinates.</p>}
          </div>
        </Panel>
      </div>
    </Page>
  )
}
