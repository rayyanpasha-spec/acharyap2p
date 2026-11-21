import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import { Card, CardBody, CardHeader, ErrorState, Notice, PageHeader, Spinner, Stat, Table, Td, Th } from '../../components/ui'
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_ATTRIBUTION, TILE_URL } from '../../lib/leaflet'
import { titleCase } from '../../lib/format'
import { useMeta } from '../../store/meta'
import { CAT_HEX, SEVERITIES, SEV_HEX, hoursLabel, ratePct, useFetch } from '../../features/staff/common'

const CIVIC = '#2f5f8f'
const axis = { fontSize: 12, fill: '#737a72' }

function Box({ title, subtitle, children, className }) {
  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={subtitle} />
      <CardBody>{children}</CardBody>
    </Card>
  )
}

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

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Aggregate figures only. No personal citizen data is shown." />
      <Notice tone="warning" className="mb-4">SLA targets in this prototype are sample configuration, not official municipal commitments. All data is demo data.</Notice>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="SLA overdue" value={sla.overdue ?? '—'} accent="critical" />
        <Stat label="SLA at risk" value={sla.at_risk ?? '—'} accent="warning" />
        <Stat label="SLA on track" value={sla.on_track ?? '—'} accent="success" />
        <Stat label="Reopened rate" value={ratePct(data.reopened_rate)} accent="high" hint="Of resolved tickets" />
        <Stat label="Duplicate rate" value={ratePct(data.duplicate_rate)} accent="plum" hint="Linked as duplicates" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Box title="Tickets by category">
          {byCat.length === 0 ? <p className="text-sm text-muted">No data.</p> : (
            <div className="h-64" role="img" aria-label="Bar chart of tickets by category">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCat} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid stroke="#e8e9e2" vertical={false} />
                  <XAxis dataKey="label" tick={axis} interval={0} angle={-20} textAnchor="end" height={56} />
                  <YAxis tick={axis} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#f7f7f2' }} />
                  <Bar dataKey="count" name="Tickets" radius={[4, 4, 0, 0]}>
                    {byCat.map((c) => <Cell key={c.category} fill={CAT_HEX[c.category] || CAT_HEX.other} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Box>

        <Box title="Severity mix">
          {sevTotal === 0 ? <p className="text-sm text-muted">No data.</p> : (
            <div className="h-64" role="img" aria-label="Donut chart of tickets by severity">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={bySev} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} stroke="#fff">
                    {bySev.map((s) => <Cell key={s.key} fill={SEV_HEX[s.key]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Box>

        <Box title="Complaint volume, last 30 days" className="lg:col-span-2">
          <div className="h-60" role="img" aria-label="Area chart of daily complaint volume">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ left: -16, right: 8 }}>
                <CartesianGrid stroke="#e8e9e2" vertical={false} />
                <XAxis dataKey="label" tick={axis} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={axis} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="count" name="Complaints" stroke={CIVIC} strokeWidth={2} fill={CIVIC} fillOpacity={0.12} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Box>

        <Card className="lg:col-span-2">
          <CardHeader title="Department workload" subtitle="Median resolution time uses verified resolutions only." />
          {(data.by_department || []).length === 0 ? <CardBody><p className="text-sm text-muted">No data.</p></CardBody> : (
            <Table>
              <thead><tr><Th>Department</Th><Th className="text-right">Total</Th><Th className="text-right">Open</Th><Th className="text-right">Resolved</Th><Th className="text-right">Median resolution</Th></tr></thead>
              <tbody>
                {data.by_department.map((d) => (
                  <tr key={d.department_code}>
                    <Td className="py-2 font-medium">{d.name || d.department_code}</Td>
                    <Td className="py-2 text-right tabular-nums">{d.total}</Td>
                    <Td className="py-2 text-right tabular-nums">{d.open}</Td>
                    <Td className="py-2 text-right tabular-nums">{d.resolved}</Td>
                    <Td className="py-2 text-right tabular-nums">{hoursLabel(d.median_resolution_hours)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Active ticket concentration"
            subtitle={`${points.length} active ticket(s) shown, coloured by severity`}
            action={<div className="hidden gap-3 text-xs text-muted sm:flex">{SEVERITIES.map((s) => <span key={s} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SEV_HEX[s] }} aria-hidden />{titleCase(s)}</span>)}</div>}
          />
          <CardBody>
            <div className="h-[380px] overflow-hidden rounded-lg border border-line">
              <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
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
            {points.length === 0 && <p className="mt-2 text-sm text-muted">No active tickets with coordinates.</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
