import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet'
import { ArrowLeft, Mic, MapPin, Building2, Eye, EyeOff, ImagePlus, RotateCcw, Heart, Award, Sparkles, Users, X, FileText, History, Megaphone, Gauge, CheckCircle2, Clock } from 'lucide-react'
import '../../lib/leaflet'
import { TILE_URL, TILE_ATTRIBUTION, dotIcon } from '../../lib/leaflet'
import { AuthImage, Button, CategoryChip, DemoTag, EmptyState, ErrorState, Field, IconTile, Modal, Page, Panel, Spinner, Textarea, toast } from '../../components/ui'
import StatusTimeline, { TSeverityBadge, TStatusBadge } from '../../components/StatusTimeline'
import { api, errMsg } from '../../lib/api'
import { useMeta } from '../../store/meta'
import { LANGS, useT } from '../../lib/i18n'
import { fmtDateTime } from '../../lib/format'

const SEV_COLOR = { low: '#4f7a8f', medium: '#2f5f8f', high: '#c2603a', critical: '#b94a48' }

function BackLink({ t }) {
  return <Link to="/app/complaints" className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-line-strong bg-surface px-3 text-[13px] font-semibold text-civic hover:bg-paper"><ArrowLeft className="h-4 w-4" aria-hidden />{t('nav.reports', 'My reports')}</Link>
}

function Fact({ icon, tone, label, children }) {
  return (
    <div className="flex items-start gap-2.5">
      <IconTile icon={icon} tone={tone} size="sm" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="text-xs text-muted">{label}</p>
        {children}
      </div>
    </div>
  )
}

export default function ComplaintDetail() {
  const { ticketId } = useParams()
  const { t } = useT()
  const meta = useMeta((s) => s.meta)
  const [c, setC] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [evOpen, setEvOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [preview, setPreview] = useState(null)

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const { data } = await api.get(`/complaints/${ticketId}`)
      setC(data)
      let rows = Array.isArray(data?.timeline) ? data.timeline : null
      try {
        const tl = await api.get(`/complaints/${ticketId}/timeline`)
        if (Array.isArray(tl.data)) rows = tl.data
      } catch { /* fall back to the embedded timeline */ }
      setTimeline(rows || [])
    } catch (e) {
      setError(e?.response?.status === 404 ? t('detail.notFound', 'This report was not found, or you do not have access to it.') : errMsg(e))
      setC(null)
    }
    setLoading(false)
  }, [ticketId, t])
  useEffect(() => { load() }, [load])

  const toggleFollow = async () => {
    setBusy(true)
    try {
      if (c.i_follow) await api.delete(`/complaints/${ticketId}/follow`)
      else await api.post(`/complaints/${ticketId}/follow`)
      toast.success(c.i_follow ? t('detail.unfollowed', 'You stopped following this report.') : t('detail.followed', 'You are now following this report.'))
      await load(true)
    } catch (e) { toast.error(errMsg(e)) }
    setBusy(false)
  }

  if (loading) return <Page title={ticketId} actions={<BackLink t={t} />}><Panel className="flex-1"><Spinner /></Panel></Page>
  if (error || !c) {
    return (
      <Page title={ticketId} actions={<BackLink t={t} />}>
        <Panel className="flex-1"><ErrorState message={error || 'Not found'} onRetry={() => load()} /></Panel>
      </Page>
    )
  }

  const loc = c.location || {}
  const hasLoc = typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
  const langLabel = LANGS.find((l) => l.code === c.original_language)?.label || c.original_language
  const images = Array.isArray(c.images) ? c.images : []
  const updates = Array.isArray(c.public_updates) ? c.public_updates : []
  const canAct = c.is_mine || c.i_follow
  const resolved = c.status === 'resolved'
  const canReopen = resolved && canAct && !c.reopen_requested
  const isTerminal = ['resolved', 'rejected', 'duplicate_linked'].includes(c.status)
  const catName = c.category_name || useMeta.getState().categoryName(c.category)
  const subName = c.subcategory_name || (c.subcategory ? useMeta.getState().subcategoryName(c.category, c.subcategory) : '')
  const showActions = !c.is_mine || !isTerminal || canReopen

  return (
    <Page
      title={<span className="inline-flex flex-wrap items-center gap-2">{c.ticket_number}{c.is_demo && <DemoTag />}</span>}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
          <CategoryChip category={c.category} label={catName} />
          {subName && <span className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-medium text-muted">{subName}</span>}
          <TStatusBadge status={c.status} />
          <TSeverityBadge severity={c.severity} />
        </span>
      }
      actions={<BackLink t={t} />}
    >
      {resolved && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border border-success/30 bg-success-100 px-3 py-1.5 text-[13px]">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
          <p className="min-w-0 flex-1 text-ink/90"><span className="font-semibold">{t('detail.thanksTitle', 'Resolved. Thank you.')}</span> {t('detail.thanks', 'Your voice helped make this neighbourhood better. A supervisor verified that this issue was resolved.')}</p>
          <Link to="/app/certificates" className="inline-flex items-center gap-1.5 font-semibold text-forest hover:underline"><Award className="h-4 w-4" aria-hidden />{t('detail.certLink', 'View your certificates')}</Link>
        </div>
      )}
      {c.reopen_requested && (
        <div className="shrink-0 rounded-[10px] border border-warning/40 bg-warning-100 px-3 py-1.5 text-[13px] text-ink/90">{t('detail.reopenPending', 'A reopening request is awaiting a supervisor decision.')}</div>
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        {/* column 1: the report + photos */}
        <Panel title={t('detail.report', 'The report')} icon={FileText} tone="forest"
          action={<span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted">{c.submitted_via === 'voice' && <><Mic className="h-3.5 w-3.5 text-civic" aria-hidden />{t('detail.voice', 'Submitted by voice')} · </>}{langLabel}</span>}>
          {c.summary && <p className="mb-3 rounded-[10px] bg-civic-50 px-3 py-2 text-sm text-ink"><span className="mr-1.5 inline-flex items-center gap-1 font-semibold text-civic"><Sparkles className="h-3.5 w-3.5" aria-hidden />{t('detail.aiSummary', 'AI summary')}:</span>{c.summary}</p>}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink" lang={c.original_language}>{c.original_description || '—'}</p>
          {c.translated_description && c.original_language !== 'en' && (
            <p className="mt-3 border-t border-line pt-3 text-sm text-muted"><span className="font-semibold text-ink/80">{t('detail.translation', 'English translation')}:</span> {c.translated_description}</p>
          )}
          <p className="mt-3 text-xs text-muted">{t('detail.submitted', 'Submitted')} {fmtDateTime(c.created_at)}{c.resolved_at ? ` · ${t('detail.resolvedAt', 'Resolved')} ${fmtDateTime(c.resolved_at)}` : ''}</p>
          {images.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-2 text-[13px] font-semibold text-ink">{`${t('detail.photos', 'Photos')} (${images.length})`}</p>
              <ul className="grid grid-cols-3 gap-2">
                {images.map((im) => (
                  <li key={im.id}>
                    <button type="button" onClick={() => setPreview(im)} className="block w-full overflow-hidden rounded-[10px] border border-line transition-shadow hover:shadow-[0_2px_8px_rgba(36,76,57,0.15)]" aria-label={`${t('detail.openPhoto', 'Open photo')} ${im.id}`}>
                      <AuthImage imageId={im.id} alt={im.ai_observation || `${t('detail.photo', 'Photo')} ${im.id}`} className="aspect-[4/3] w-full" />
                    </button>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">{im.kind}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        {/* column 2: timeline + department updates */}
        <div className="flex min-h-0 flex-col gap-3">
          <Panel title={t('timeline.title', 'Status timeline')} icon={History} tone="civic" className="lg:flex-1">
            <StatusTimeline rows={timeline} />
          </Panel>
          {updates.length > 0 && (
            <Panel title={t('detail.updates', 'Updates from the department')} icon={Megaphone} tone="teal" className="lg:max-h-[42%]" bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {updates.map((u, i) => (
                  <li key={u.id ?? i} className="px-4 py-2.5">
                    <p className="text-sm text-ink">{u.body}</p>
                    <p className="mt-0.5 text-xs text-muted">{u.author_name ? `${u.author_name} · ` : ''}{fmtDateTime(u.created_at)}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        {/* column 3: map + facts */}
        <div className="flex min-h-0 flex-col gap-3">
          <Panel title={t('detail.location', 'Approximate location')} icon={MapPin} tone="forest" className="shrink-0" scroll={false} bodyClassName="p-3">
            {hasLoc ? (
              <>
                <div className="h-40 overflow-hidden rounded-[10px] border border-line">
                  <MapContainer center={[loc.latitude, loc.longitude]} zoom={16} scrollWheelZoom={false} className="h-full w-full" attributionControl>
                    <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
                    <Circle center={[loc.latitude, loc.longitude]} radius={60} pathOptions={{ color: SEV_COLOR[c.severity] || '#244c39', weight: 1, fillOpacity: 0.12 }} />
                    <Marker position={[loc.latitude, loc.longitude]} icon={dotIcon(SEV_COLOR[c.severity] || '#244c39', 16)} />
                  </MapContainer>
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-[13px]"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
                  <span>{loc.locality || loc.address || 'Bengaluru'}{loc.ward_code ? ` · ${loc.ward_code}` : ''}</span></p>
                {!c.is_mine && <p className="mt-0.5 text-xs text-muted">{t('detail.privacy', 'Position is rounded for privacy.')}</p>}
                {loc.service_area_status === 'needs_manual_routing' && <p className="mt-0.5 text-xs text-muted">{t('detail.manual', 'Official ward boundaries are not imported, so an officer routes this manually.')}</p>}
              </>
            ) : <EmptyState title={t('detail.noLoc', 'No location available')} />}
          </Panel>

          <Panel title={t('detail.assessment', 'Routing and severity')} icon={Gauge} tone="saffron" className="lg:flex-1" bodyClassName="space-y-3 p-4">
            <Fact icon={Building2} tone="civic" label={t('detail.department', 'Department')}>
              <p className="font-semibold">{c.department_name || meta?.departments?.find((d) => d.code === c.department_code)?.name || t('detail.pending', 'Being assigned')}</p>
            </Fact>
            <Fact icon={Gauge} tone="saffron" label={t('detail.severity', 'Severity')}>
              <div className="mt-0.5"><TSeverityBadge severity={c.severity} /></div>
              {c.severity_reason && <p className="mt-1 text-ink/80">{c.severity_reason}</p>}
              <p className="mt-1 text-xs text-muted">{t('detail.aiNote', 'Suggested by AI triage; an officer can confirm or change it.')}</p>
            </Fact>
            <Fact icon={Users} tone="forest" label={t('detail.supporting', 'Linked or supporting reports')}>
              <p className="font-semibold">{c.supporting_count ?? 0}{c.followers_count > 0 && <span className="font-normal text-muted"> · {c.followers_count} {t('detail.followers', 'following')}</span>}</p>
            </Fact>
          </Panel>
        </div>
      </div>

      {/* fixed actions strip */}
      {showActions && (
        <div className="sticky bottom-0 z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-[14px] border border-line bg-surface px-3 py-2 shadow-[0_1px_2px_rgba(36,76,57,0.05)] lg:static">
          <p className="flex items-center gap-1.5 text-[13px] text-muted">
            {c.i_follow
              ? <><Heart className="h-4 w-4 text-civic" aria-hidden /><span className="font-semibold text-civic">{t('detail.youFollow', 'You are following this report')}</span></>
              : <><Clock className="h-4 w-4" aria-hidden />{c.is_mine ? t('detail.yours', 'This is your report.') : t('detail.followHint', 'Follow this report to get updates.')}</>}
          </p>
          <div className="flex flex-wrap gap-2">
            {!c.is_mine && (
              <Button size="sm" variant={c.i_follow ? 'secondary' : 'civic'} onClick={toggleFollow} loading={busy}>
                {c.i_follow ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                {c.i_follow ? t('btn.unfollow', 'Unfollow') : t('btn.follow', 'Follow')}
              </Button>
            )}
            {!isTerminal && (
              <Button size="sm" variant="secondary" onClick={() => setEvOpen(true)}><ImagePlus className="h-4 w-4" aria-hidden />{t('btn.addEvidence', 'Add evidence')}</Button>
            )}
            {canReopen && (
              <Button size="sm" variant="secondary" onClick={() => setReopenOpen(true)}><RotateCcw className="h-4 w-4" aria-hidden />{t('btn.reopen', 'Request reopening')}</Button>
            )}
          </div>
        </div>
      )}

      <EvidenceModal open={evOpen} onClose={() => setEvOpen(false)} ticketId={ticketId} t={t} max={meta?.limits?.max_images_per_report || 4} onDone={() => { setEvOpen(false); load(true) }} />
      <ReopenModal open={reopenOpen} onClose={() => setReopenOpen(false)} ticketId={ticketId} t={t} onDone={() => { setReopenOpen(false); load(true) }} />
      <Modal open={!!preview} onClose={() => setPreview(null)} title={t('detail.photo', 'Photo')} wide>
        {preview && <AuthImage imageId={preview.id} alt={preview.ai_observation || ''} className="max-h-[70vh] w-full rounded-[10px] !object-contain" />}
        {preview?.ai_observation && <p className="mt-2 text-sm text-muted">{preview.ai_observation}</p>}
      </Modal>
    </Page>
  )
}

function EvidenceModal({ open, onClose, ticketId, onDone, t, max }) {
  const [note, setNote] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef(null)
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  useEffect(() => { if (open) { setNote(''); setFiles([]); setErr('') } }, [open])

  const pick = (e) => {
    const picked = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'))
    setFiles((prev) => [...prev, ...picked].slice(0, Math.min(4, max)))
    e.target.value = ''
  }
  const submit = async () => {
    if (!note.trim() && files.length === 0) { setErr(t('ev.required', 'Add a note or at least one photo.')); return }
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      if (note.trim()) fd.append('note', note.trim())
      files.forEach((f) => fd.append('images', f))
      await api.post(`/complaints/${ticketId}/evidence`, fd)
      toast.success(t('ev.done', 'Thank you. Your evidence was added.'))
      onDone()
    } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }
  return (
    <Modal open={open} onClose={onClose} title={t('btn.addEvidence', 'Add evidence')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('btn.cancel', 'Cancel')}</Button><Button onClick={submit} loading={busy}>{t('ev.submit', 'Send evidence')}</Button></>}>
      <div className="space-y-4">
        {err && <div role="alert" className="rounded-[10px] border border-critical/30 bg-critical-100 px-3 py-2 text-sm text-critical">{err}</div>}
        <Field label={t('ev.note', 'Note (optional)')} htmlFor="ev-note" hint={t('ev.hint', 'What has changed, or what else should the team know?')}>
          <Textarea id="ev-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </Field>
        <div>
          <p className="mb-1.5 text-[13px] font-semibold">{t('ev.photos', 'Photos')} ({files.length}/{Math.min(4, max)})</p>
          <input ref={inputRef} id="ev-files" type="file" accept="image/*" multiple className="sr-only" onChange={pick} />
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={i} className="relative h-20 w-20 overflow-hidden rounded-[10px] border border-line">
                <img src={urls[i]} alt={f.name} className="h-full w-full object-cover" />
                <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="absolute right-0.5 top-0.5 rounded-full bg-ink/70 p-0.5 text-white"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            {files.length < Math.min(4, max) && (
              <label htmlFor="ev-files" className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-line-strong text-xs text-muted hover:bg-paper focus-within:outline">
                <ImagePlus className="h-5 w-5" aria-hidden />{t('ev.add', 'Add')}
              </label>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function ReopenModal({ open, onClose, ticketId, onDone, t }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (open) { setReason(''); setErr('') } }, [open])
  const submit = async () => {
    if (reason.trim().length < 5) { setErr(t('reopen.required', 'Please explain why the issue is not fixed (at least 5 characters).')); return }
    setBusy(true); setErr('')
    try {
      await api.post(`/complaints/${ticketId}/reopen-request`, { reason: reason.trim() })
      toast.success(t('reopen.done', 'Your request was sent to a supervisor.'))
      onDone()
    } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }
  return (
    <Modal open={open} onClose={onClose} title={t('btn.reopen', 'Request reopening')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('btn.cancel', 'Cancel')}</Button><Button onClick={submit} loading={busy}>{t('reopen.submit', 'Send request')}</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-muted">{t('reopen.intro', 'If the problem is still there, tell us. A supervisor will review your request.')}</p>
        {err && <div role="alert" className="rounded-[10px] border border-critical/30 bg-critical-100 px-3 py-2 text-sm text-critical">{err}</div>}
        <Field label={t('reopen.reason', 'Why should this be reopened?')} htmlFor="reopen-reason">
          <Textarea id="reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
        </Field>
      </div>
    </Modal>
  )
}
