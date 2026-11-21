// Read-only sections of the ticket detail (left column).
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import { Mic, Lock, Languages } from 'lucide-react'
import '../../lib/leaflet'
import { TILE_ATTRIBUTION, TILE_URL, dotIcon } from '../../lib/leaflet'
import { AuthImage, Badge, Card, CardBody, CardHeader, Modal, Notice, cn } from '../../components/ui'
import { fmtDateTime, titleCase } from '../../lib/format'
import { SEV_HEX, pct } from './common'

const LANG = { en: 'English', kn: 'Kannada', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam' }

const Row = ({ label, children }) => (
  <div className="flex items-start justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
    <dt className="shrink-0 text-muted">{label}</dt>
    <dd className="text-right font-medium text-ink">{children}</dd>
  </div>
)

export function ReportCard({ t, submissions }) {
  const lang = LANG[t.original_language] || t.original_language
  return (
    <Card>
      <CardHeader title="Citizen report" subtitle={`Reporter: ${t.reporter?.name || 'not available'} · ${t.supporting_count ?? 0} supporting report(s) · ${t.followers_count ?? 0} follower(s)`} />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral"><Languages className="h-3 w-3" aria-hidden /> {lang || 'Unknown language'}</Badge>
          {t.submitted_via === 'voice' && <Badge tone="civic"><Mic className="h-3 w-3" aria-hidden /> Submitted by voice</Badge>}
          <span className="text-xs text-muted">Received {fmtDateTime(t.created_at)}</span>
        </div>
        <blockquote className="whitespace-pre-wrap rounded-lg border-l-4 border-civic bg-civic-50 px-3 py-2 text-sm text-ink">{t.original_description || '—'}</blockquote>
        {t.submitted_via === 'voice' && <p className="text-xs text-muted">Text above is the transcript the citizen confirmed. Audio is not stored.</p>}
        {t.translated_description && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">English translation (AI)</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{t.translated_description}</p>
          </div>
        )}
        {submissions?.length > 1 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">All submissions ({submissions.length})</p>
            <ul className="space-y-2">
              {submissions.map((s) => (
                <li key={s.id} className="rounded-lg border border-line p-2.5 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge tone={s.is_primary ? 'civic' : 'neutral'}>{s.is_primary ? 'Primary report' : 'Supporting report'}</Badge>
                    <span>{s.reporter_name || 'Citizen'}</span><span>{fmtDateTime(s.created_at)}</span>
                    {s.duplicate_choice && <span>Choice: {titleCase(s.duplicate_choice)}</span>}
                  </div>
                  <p className="whitespace-pre-wrap text-ink">{s.description}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export function ImageGallery({ images }) {
  const [big, setBig] = useState(null)
  const list = images || []
  return (
    <Card>
      <CardHeader title={`Photos (${list.length})`} subtitle="Observations are AI-generated - may be wrong. Verify on site." />
      <CardBody>
        {list.length === 0 ? <p className="text-sm text-muted">No photos were attached.</p> : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {list.map((im) => (
              <li key={im.id} className="space-y-1">
                <button type="button" onClick={() => setBig(im)} className="block w-full overflow-hidden rounded-lg border border-line" aria-label={`Open ${im.kind} photo`}>
                  <AuthImage imageId={im.id} alt={`${im.kind} photo`} className="h-28 w-full" />
                </button>
                <p className="text-xs font-semibold text-ink">{titleCase(im.kind)}</p>
                {im.ai_observation && <p className="text-xs text-muted"><span className="font-semibold">AI observation - may be wrong:</span> {im.ai_observation}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <Modal open={!!big} onClose={() => setBig(null)} title={big ? `${titleCase(big.kind)} photo` : ''} wide>
        {big && <AuthImage imageId={big.id} alt={`${big.kind} photo`} className="max-h-[70vh] w-full rounded-lg object-contain" />}
      </Modal>
    </Card>
  )
}

export function LocationCard({ t }) {
  const loc = t.location || {}
  const has = loc.latitude != null && loc.longitude != null
  const nr = <span className="text-muted">not resolved yet</span>
  return (
    <Card>
      <CardHeader title="Location" subtitle={loc.address || loc.locality || undefined} />
      <CardBody className="space-y-3">
        {has ? (
          <div className="h-52 overflow-hidden rounded-lg border border-line">
            <MapContainer center={[loc.latitude, loc.longitude]} zoom={16} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
              <Marker position={[loc.latitude, loc.longitude]} icon={dotIcon(SEV_HEX[t.severity] || '#2f5f8f', 20)} />
            </MapContainer>
          </div>
        ) : <p className="text-sm text-muted">No coordinates were recorded.</p>}
        <dl>
          <Row label="Locality">{loc.locality || nr}</Row>
          <Row label="Coordinates">{has ? `${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}` : '—'}</Row>
          <Row label="Source / accuracy">{[loc.source && titleCase(loc.source), loc.accuracy_m != null && `${Math.round(loc.accuracy_m)} m`].filter(Boolean).join(' · ') || '—'}</Row>
          <Row label="Service area">{loc.service_area_status ? titleCase(loc.service_area_status) : nr}</Row>
          <Row label="Corporation">{loc.city_corporation_code || nr}</Row>
          <Row label="Zone / division">{loc.division_code || nr}</Row>
          <Row label="Ward">{loc.ward_code || nr}</Row>
        </dl>
        {loc.service_area_status === 'needs_manual_routing' && <Notice tone="warning">Official boundary data is not imported, so corporation and ward are not resolved. Route this ticket manually.</Notice>}
        {loc.service_area_status === 'outside_service_area' && <Notice tone="critical">This location appears to be outside the service area.</Notice>}
      </CardBody>
    </Card>
  )
}

export function AiPanel({ t, detail }) {
  const ai = detail?.ai_analysis
  return (
    <Card>
      <CardHeader title="AI triage" subtitle="Suggestions only - a human confirms classification." action={t.requires_human_review ? <Badge tone="saffron">Needs human review</Badge> : <Badge tone="neutral">No review flag</Badge>} />
      <CardBody className="space-y-3">
        <dl>
          <Row label="Category">{t.category_name || titleCase(t.category)}{t.subcategory_name ? ` / ${t.subcategory_name}` : ''}</Row>
          <Row label="Severity">{titleCase(t.severity || '')}{t.severity_score != null ? ` (score ${Number(t.severity_score).toFixed(1)})` : ''}{t.severity_overridden ? ' - overridden by staff' : ''}</Row>
          <Row label="Confidence">{pct(t.ai_confidence)}</Row>
          <Row label="Provider">{t.ai_provider || ai?.provider || '—'}{ai?.model ? ` (${ai.model})` : ''}</Row>
          <Row label="Department">{t.department_name || t.department_code || '—'}</Row>
        </dl>
        {t.severity_reason && <p className="rounded-lg bg-paper px-3 py-2 text-sm"><span className="font-semibold">Reason: </span>{t.severity_reason}</p>}
        {t.review_reasons?.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Review reasons</p>
            <ul className="mt-1 list-inside list-disc text-sm text-ink">{t.review_reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        )}
        {t.routing_note && <p className="text-sm text-ink"><span className="font-semibold">Routing note: </span>{t.routing_note}</p>}
        {t.image_observations?.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-saffron">AI observations - may be wrong</p>
            <ul className="mt-1 list-inside list-disc text-sm text-ink">{t.image_observations.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export function DuplicatesCard({ detail }) {
  const dups = detail?.duplicates || []
  const links = detail?.links || []
  if (!dups.length && !links.length) return null
  return (
    <Card>
      <CardHeader title="Possible duplicates and links" />
      <CardBody className="space-y-3">
        {dups.length > 0 && (
          <ul className="space-y-1.5">
            {dups.map((d, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2 text-sm">
                <Link to={`/staff/tickets/${d.candidate_ticket}`} className="font-mono font-semibold text-civic hover:underline">{d.candidate_ticket}</Link>
                {d.distance_m != null && <span className="text-muted">{Math.round(d.distance_m)} m away</span>}
                {d.similarity != null && <span className="text-muted">{Math.round(d.similarity * 100)}% similar</span>}
                {d.same_reporter && <Badge tone="civic">Same reporter</Badge>}
                {d.decision && <Badge tone="neutral">{titleCase(d.decision)}</Badge>}
              </li>
            ))}
          </ul>
        )}
        {links.length > 0 && (
          <ul className="space-y-1.5">
            {links.map((l, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Badge tone="plum">{titleCase(l.direction || 'linked')}</Badge>
                <Link to={`/staff/tickets/${l.ticket_number}`} className="font-mono font-semibold text-civic hover:underline">{l.ticket_number}</Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

/** Citizen-visible timeline: status rows marked citizen_visible + public comments. */
export function PublicTimeline({ detail }) {
  const rows = [
    ...(detail?.timeline || []).filter((r) => r.citizen_visible !== false).map((r) => ({ key: `t${r.id}`, at: r.created_at, kind: 'status', r })),
    ...(detail?.comments || []).filter((c) => c.visibility !== 'internal').map((c) => ({ key: `c${c.id}`, at: c.created_at, kind: 'comment', r: c })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)))
  return (
    <Card>
      <CardHeader title="Citizen-visible timeline" subtitle="Everything here is shown to the reporter." />
      <CardBody>
        {rows.length === 0 ? <p className="text-sm text-muted">No updates yet.</p> : (
          <ol className="space-y-3 border-l-2 border-line pl-4">
            {rows.map((x) => (
              <li key={x.key} className="relative text-sm">
                <span className={cn('absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface', x.kind === 'status' ? 'bg-civic' : 'bg-forest')} aria-hidden />
                {x.kind === 'status' ? (
                  <p className="font-semibold text-ink">{x.r.from_status ? `${titleCase(x.r.from_status)} → ` : ''}{titleCase(x.r.to_status || '')}</p>
                ) : (
                  <p className="font-semibold text-forest">Public update from {x.r.author_name || titleCase(x.r.author_role || 'staff')}</p>
                )}
                {(x.r.note || x.r.body) && <p className="whitespace-pre-wrap text-ink/90">{x.r.note || x.r.body}</p>}
                <p className="text-xs text-muted">{fmtDateTime(x.at)}{x.r.actor_name ? ` · ${x.r.actor_name}` : ''}{x.r.actor_role ? ` (${x.r.actor_role})` : ''}</p>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  )
}

/** Private notes and non-citizen-visible status rows. Dashed saffron border. */
export function InternalNotes({ detail }) {
  const rows = [
    ...(detail?.comments || []).filter((c) => c.visibility === 'internal').map((c) => ({ key: `c${c.id}`, at: c.created_at, who: c.author_name, role: c.author_role, text: c.body, tag: 'Note' })),
    ...(detail?.timeline || []).filter((r) => r.citizen_visible === false).map((r) => ({ key: `t${r.id}`, at: r.created_at, who: r.actor_name, role: r.actor_role, text: `${r.from_status ? `${titleCase(r.from_status)} → ` : ''}${titleCase(r.to_status || '')}${r.note ? `: ${r.note}` : ''}`, tag: 'Status' })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)))
  const assigns = detail?.assignments || []
  return (
    <section className="rounded-[10px] border-2 border-dashed border-saffron/60 bg-saffron-100/40">
      <div className="flex items-center gap-2 border-b border-dashed border-saffron/50 px-4 py-3">
        <Lock className="h-4 w-4 text-saffron" aria-hidden />
        <div>
          <h3 className="font-display text-[15px] font-bold text-ink">Internal notes and history</h3>
          <p className="text-xs font-semibold text-saffron">Internal - not visible to citizens</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {rows.length === 0 && assigns.length === 0 && <p className="text-sm text-muted">No internal notes yet.</p>}
        {rows.map((x) => (
          <div key={x.key} className="rounded-lg bg-surface/80 px-3 py-2 text-sm">
            <p className="whitespace-pre-wrap text-ink">{x.text}</p>
            <p className="mt-0.5 text-xs text-muted">{x.tag} · {x.who || 'Staff'}{x.role ? ` (${x.role})` : ''} · {fmtDateTime(x.at)}</p>
          </div>
        ))}
        {assigns.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Assignment history</p>
            <ul className="space-y-1 text-sm">
              {assigns.map((a, i) => (
                <li key={i} className="text-ink">
                  <b>{a.worker_name || 'Unassigned'}</b>{a.active ? <Badge tone="civic" className="ml-2">Active</Badge> : null}
                  <span className="text-xs text-muted"> by {a.assigned_by || 'staff'} · {fmtDateTime(a.created_at)}{a.note ? ` · ${a.note}` : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

export function EvidenceCard({ detail }) {
  const ev = detail?.resolution_evidence || []
  const groups = [['before', 'Before'], ['after', 'After']]
  return (
    <Card>
      <CardHeader title="Resolution evidence" subtitle="Uploaded by field staff. Resolution counts only after supervisor verification." />
      <CardBody>
        {ev.length === 0 ? <p className="text-sm text-muted">No before/after evidence uploaded yet.</p> : (
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map(([k, label]) => (
              <div key={k}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
                <div className="space-y-2">
                  {ev.filter((e) => e.kind === k).map((e) => (
                    <figure key={e.id} className="rounded-lg border border-line p-2">
                      {e.image_id ? <AuthImage imageId={e.image_id} alt={`${label} work`} className="h-32 w-full rounded-md" /> : <p className="text-xs text-muted">No photo</p>}
                      <figcaption className="mt-1 text-xs text-muted">
                        {e.notes || 'No notes'} · {fmtDateTime(e.created_at)} {e.verified && <Badge tone="success" className="ml-1">Verified</Badge>}
                      </figcaption>
                    </figure>
                  ))}
                  {ev.filter((e) => e.kind === k).length === 0 && <p className="text-xs text-muted">None</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
