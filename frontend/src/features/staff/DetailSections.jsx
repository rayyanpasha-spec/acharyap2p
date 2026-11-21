// Sections of the ticket detail. Each is a borderless block meant to live inside a scrolling <Panel> body.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import { Mic, Lock, Languages } from 'lucide-react'
import '../../lib/leaflet'
import { TILE_ATTRIBUTION, TILE_URL, dotIcon } from '../../lib/leaflet'
import { AuthImage, Badge, Modal, Notice, cn } from '../../components/ui'
import { fmtDateTime, titleCase } from '../../lib/format'
import { SEV_HEX, pct } from './common'

const LANG = { en: 'English', kn: 'Kannada', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam' }

/** Section heading inside a panel. */
export function Section({ title, hint, right, children, className }) {
  return (
    <section className={cn('border-b border-line px-4 py-3 last:border-b-0', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-[12px] font-bold uppercase tracking-wide text-ink">{title}</h3>
          {hint && <p className="text-[11.5px] text-muted">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

/** Compact label/value grid. */
const Facts = ({ children, cols = 2 }) => <dl className={cn('grid gap-x-4 gap-y-2', cols === 2 ? 'grid-cols-2' : 'grid-cols-1')}>{children}</dl>
const Fact = ({ label, children, wide }) => (
  <div className={cn('min-w-0', wide && 'col-span-2')}>
    <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
    <dd className="break-words text-[13px] font-medium text-ink">{children}</dd>
  </div>
)

export function ReportBlock({ t, submissions }) {
  const lang = LANG[t.original_language] || t.original_language
  return (
    <Section title="Citizen report" hint={`Reporter: ${t.reporter?.name || 'not available'} · ${t.supporting_count ?? 0} supporting · ${t.followers_count ?? 0} follower(s)`}>
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral"><Languages className="h-3 w-3" aria-hidden /> {lang || 'Unknown language'}</Badge>
          {t.submitted_via === 'voice' && <Badge tone="civic"><Mic className="h-3 w-3" aria-hidden /> Voice</Badge>}
          <span className="text-[11.5px] text-muted">Received {fmtDateTime(t.created_at)}</span>
        </div>
        <blockquote className="whitespace-pre-wrap rounded-lg border-l-4 border-civic bg-civic-50 px-3 py-2 text-[13px] text-ink">{t.original_description || '—'}</blockquote>
        {t.submitted_via === 'voice' && <p className="text-[11.5px] text-muted">Text above is the transcript the citizen confirmed. Audio is not stored.</p>}
        {t.translated_description && (
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">English translation (AI)</p>
            <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-ink">{t.translated_description}</p>
          </div>
        )}
        {submissions?.length > 1 && (
          <div>
            <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">All submissions ({submissions.length})</p>
            <ul className="space-y-1.5">
              {submissions.map((s) => (
                <li key={s.id} className="rounded-lg border border-line p-2 text-[13px]">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
                    <Badge tone={s.is_primary ? 'civic' : 'neutral'}>{s.is_primary ? 'Primary' : 'Supporting'}</Badge>
                    <span>{s.reporter_name || 'Citizen'}</span><span>{fmtDateTime(s.created_at)}</span>
                    {s.duplicate_choice && <span>Choice: {titleCase(s.duplicate_choice)}</span>}
                  </div>
                  <p className="whitespace-pre-wrap text-ink">{s.description}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  )
}

export function PhotosBlock({ images }) {
  const [big, setBig] = useState(null)
  const list = images || []
  return (
    <Section title={`Photos (${list.length})`} hint="Observations are AI-generated - may be wrong. Verify on site.">
      {list.length === 0 ? <p className="text-[13px] text-muted">No photos were attached.</p> : (
        <ul className="grid grid-cols-2 gap-2">
          {list.map((im) => (
            <li key={im.id} className="space-y-1">
              <button type="button" onClick={() => setBig(im)} className="block w-full overflow-hidden rounded-lg border border-line" aria-label={`Open ${im.kind} photo`}>
                <AuthImage imageId={im.id} alt={`${im.kind} photo`} className="h-24 w-full" />
              </button>
              <p className="text-[11.5px] font-semibold text-ink">{titleCase(im.kind)}</p>
              {im.ai_observation && <p className="text-[11.5px] leading-snug text-muted"><span className="font-semibold">AI observation - may be wrong:</span> {im.ai_observation}</p>}
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!big} onClose={() => setBig(null)} title={big ? `${titleCase(big.kind)} photo` : ''} wide>
        {big && <AuthImage imageId={big.id} alt={`${big.kind} photo`} className="max-h-[70vh] w-full rounded-lg object-contain" />}
      </Modal>
    </Section>
  )
}

export function LocationBlock({ t }) {
  const loc = t.location || {}
  const has = loc.latitude != null && loc.longitude != null
  const nr = <span className="text-muted">not resolved yet</span>
  return (
    <Section title="Location" hint={loc.address || loc.locality || undefined}>
      <div className="space-y-2.5">
        {has ? (
          <div className="h-36 overflow-hidden rounded-lg border border-line">
            <MapContainer center={[loc.latitude, loc.longitude]} zoom={16} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
              <Marker position={[loc.latitude, loc.longitude]} icon={dotIcon(SEV_HEX[t.severity] || '#2f5f8f', 20)} />
            </MapContainer>
          </div>
        ) : <p className="text-[13px] text-muted">No coordinates were recorded.</p>}
        <Facts>
          <Fact label="Locality">{loc.locality || nr}</Fact>
          <Fact label="Coordinates">{has ? `${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}` : '—'}</Fact>
          <Fact label="Source / accuracy">{[loc.source && titleCase(loc.source), loc.accuracy_m != null && `${Math.round(loc.accuracy_m)} m`].filter(Boolean).join(' · ') || '—'}</Fact>
          <Fact label="Service area">{loc.service_area_status ? titleCase(loc.service_area_status) : nr}</Fact>
          <Fact label="Corporation">{loc.city_corporation_code || nr}</Fact>
          <Fact label="Zone / division">{loc.division_code || nr}</Fact>
          <Fact label="Ward">{loc.ward_code || nr}</Fact>
        </Facts>
        {loc.service_area_status === 'needs_manual_routing' && <Notice tone="warning" className="!px-3 !py-2 !text-[13px]">Official boundary data is not imported, so corporation and ward are not resolved. Route this ticket manually.</Notice>}
        {loc.service_area_status === 'outside_service_area' && <Notice tone="critical" className="!px-3 !py-2 !text-[13px]">This location appears to be outside the service area.</Notice>}
      </div>
    </Section>
  )
}

export function AiBlock({ t, detail }) {
  const ai = detail?.ai_analysis
  return (
    <Section
      title="AI triage"
      hint="Suggestions only - a human confirms classification."
      right={t.requires_human_review ? <Badge tone="saffron">Needs human review</Badge> : <Badge tone="neutral">No review flag</Badge>}
    >
      <div className="space-y-2.5">
        <Facts>
          <Fact label="Category">{t.category_name || titleCase(t.category)}{t.subcategory_name ? ` / ${t.subcategory_name}` : ''}</Fact>
          <Fact label="Severity">{titleCase(t.severity || '')}{t.severity_score != null ? ` (score ${Number(t.severity_score).toFixed(1)})` : ''}{t.severity_overridden ? ' - overridden by staff' : ''}</Fact>
          <Fact label="Confidence">{pct(t.ai_confidence)}</Fact>
          <Fact label="Department">{t.department_name || t.department_code || '—'}</Fact>
          <Fact label="Provider" wide>{t.ai_provider || ai?.provider || '—'}{ai?.model ? ` (${ai.model})` : ''}</Fact>
        </Facts>
        {t.severity_reason && <p className="rounded-lg bg-paper px-3 py-2 text-[13px]"><span className="font-semibold">Reason: </span>{t.severity_reason}</p>}
        {t.review_reasons?.length > 0 && (
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Review reasons</p>
            <ul className="mt-0.5 list-inside list-disc text-[13px] text-ink">{t.review_reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        )}
        {t.routing_note && <p className="text-[13px] text-ink"><span className="font-semibold">Routing note: </span>{t.routing_note}</p>}
        {t.image_observations?.length > 0 && (
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-saffron">AI observations - may be wrong</p>
            <ul className="mt-0.5 list-inside list-disc text-[13px] text-ink">{t.image_observations.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        )}
      </div>
    </Section>
  )
}

export function DuplicatesBlock({ detail }) {
  const dups = detail?.duplicates || []
  const links = detail?.links || []
  if (!dups.length && !links.length) return null
  return (
    <Section title="Possible duplicates and links">
      <div className="space-y-2">
        {dups.length > 0 && (
          <ul className="space-y-1.5">
            {dups.map((d, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-2.5 py-1.5 text-[13px]">
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
              <li key={i} className="flex items-center gap-2 text-[13px]">
                <Badge tone="plum">{titleCase(l.direction || 'linked')}</Badge>
                <Link to={`/staff/tickets/${l.ticket_number}`} className="font-mono font-semibold text-civic hover:underline">{l.ticket_number}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

/** Citizen-visible timeline: status rows marked citizen_visible + public comments. */
export function TimelineBlock({ detail }) {
  const rows = [
    ...(detail?.timeline || []).filter((r) => r.citizen_visible !== false).map((r) => ({ key: `t${r.id}`, at: r.created_at, kind: 'status', r })),
    ...(detail?.comments || []).filter((c) => c.visibility !== 'internal').map((c) => ({ key: `c${c.id}`, at: c.created_at, kind: 'comment', r: c })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)))
  return (
    <div className="px-4 py-3">
      <p className="mb-2 text-[11.5px] text-muted">Everything here is shown to the reporter.</p>
      {rows.length === 0 ? <p className="text-[13px] text-muted">No updates yet.</p> : (
        <ol className="space-y-2.5 border-l-2 border-line pl-4">
          {rows.map((x) => (
            <li key={x.key} className="relative text-[13px]">
              <span className={cn('absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface', x.kind === 'status' ? 'bg-civic' : 'bg-forest')} aria-hidden />
              {x.kind === 'status' ? (
                <p className="font-semibold text-ink">{x.r.from_status ? `${titleCase(x.r.from_status)} → ` : ''}{titleCase(x.r.to_status || '')}</p>
              ) : (
                <p className="font-semibold text-forest">Public update from {x.r.author_name || titleCase(x.r.author_role || 'staff')}</p>
              )}
              {(x.r.note || x.r.body) && <p className="whitespace-pre-wrap text-ink/90">{x.r.note || x.r.body}</p>}
              <p className="text-[11.5px] text-muted">{fmtDateTime(x.at)}{x.r.actor_name ? ` · ${x.r.actor_name}` : ''}{x.r.actor_role ? ` (${x.r.actor_role})` : ''}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Count of internal rows (for the tab label). */
export function internalCount(detail) {
  return (detail?.comments || []).filter((c) => c.visibility === 'internal').length + (detail?.timeline || []).filter((r) => r.citizen_visible === false).length + (detail?.assignments || []).length
}

/** Private notes and non-citizen-visible status rows. Dashed saffron border. */
export function InternalBlock({ detail }) {
  const rows = [
    ...(detail?.comments || []).filter((c) => c.visibility === 'internal').map((c) => ({ key: `c${c.id}`, at: c.created_at, who: c.author_name, role: c.author_role, text: c.body, tag: 'Note' })),
    ...(detail?.timeline || []).filter((r) => r.citizen_visible === false).map((r) => ({ key: `t${r.id}`, at: r.created_at, who: r.actor_name, role: r.actor_role, text: `${r.from_status ? `${titleCase(r.from_status)} → ` : ''}${titleCase(r.to_status || '')}${r.note ? `: ${r.note}` : ''}`, tag: 'Status' })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)))
  const assigns = detail?.assignments || []
  return (
    <div className="m-3 rounded-[10px] border-2 border-dashed border-saffron/60 bg-saffron-100/40">
      <div className="flex items-center gap-2 border-b border-dashed border-saffron/50 px-3 py-2">
        <Lock className="h-4 w-4 text-saffron" aria-hidden />
        <p className="text-[12px] font-bold text-saffron">Internal - not visible to citizens</p>
      </div>
      <div className="space-y-2 p-3">
        {rows.length === 0 && assigns.length === 0 && <p className="text-[13px] text-muted">No internal notes yet.</p>}
        {rows.map((x) => (
          <div key={x.key} className="rounded-lg bg-surface/80 px-3 py-1.5 text-[13px]">
            <p className="whitespace-pre-wrap text-ink">{x.text}</p>
            <p className="mt-0.5 text-[11.5px] text-muted">{x.tag} · {x.who || 'Staff'}{x.role ? ` (${x.role})` : ''} · {fmtDateTime(x.at)}</p>
          </div>
        ))}
        {assigns.length > 0 && (
          <div>
            <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">Assignment history</p>
            <ul className="space-y-1 text-[13px]">
              {assigns.map((a, i) => (
                <li key={i} className="text-ink">
                  <b>{a.worker_name || 'Unassigned'}</b>{a.active ? <Badge tone="civic" className="ml-2">Active</Badge> : null}
                  <span className="text-[11.5px] text-muted"> by {a.assigned_by || 'staff'} · {fmtDateTime(a.created_at)}{a.note ? ` · ${a.note}` : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export function EvidenceBlock({ detail }) {
  const ev = detail?.resolution_evidence || []
  const groups = [['before', 'Before'], ['after', 'After']]
  return (
    <Section title="Resolution evidence" hint="Uploaded by field staff. Resolution counts only after supervisor verification.">
      {ev.length === 0 ? <p className="text-[13px] text-muted">No before/after evidence uploaded yet.</p> : (
        <div className="grid grid-cols-2 gap-3">
          {groups.map(([k, label]) => (
            <div key={k}>
              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</p>
              <div className="space-y-2">
                {ev.filter((e) => e.kind === k).map((e) => (
                  <figure key={e.id} className="rounded-lg border border-line p-1.5">
                    {e.image_id ? <AuthImage imageId={e.image_id} alt={`${label} work`} className="h-24 w-full rounded-md" /> : <p className="text-[11.5px] text-muted">No photo</p>}
                    <figcaption className="mt-1 text-[11.5px] text-muted">
                      {e.notes || 'No notes'} · {fmtDateTime(e.created_at)} {e.verified && <Badge tone="success" className="ml-1">Verified</Badge>}
                    </figcaption>
                  </figure>
                ))}
                {ev.filter((e) => e.kind === k).length === 0 && <p className="text-[11.5px] text-muted">None</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
