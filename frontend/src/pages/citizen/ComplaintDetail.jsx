import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet'
import { ArrowLeft, Mic, MapPin, Building2, Eye, EyeOff, ImagePlus, RotateCcw, Heart, Award, Sparkles, Users, X } from 'lucide-react'
import '../../lib/leaflet'
import { TILE_URL, TILE_ATTRIBUTION, dotIcon } from '../../lib/leaflet'
import { AuthImage, Button, Card, CardBody, CardHeader, CategoryChip, DemoTag, EmptyState, ErrorState, Field, Modal, Notice, Spinner, Textarea, toast } from '../../components/ui'
import StatusTimeline, { TSeverityBadge, TStatusBadge } from '../../components/StatusTimeline'
import { api, errMsg } from '../../lib/api'
import { useMeta } from '../../store/meta'
import { LANGS, useT } from '../../lib/i18n'
import { fmtDateTime } from '../../lib/format'

const SEV_COLOR = { low: '#4f7a8f', medium: '#2f5f8f', high: '#c2603a', critical: '#b94a48' }

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

  if (loading) return <Spinner />
  if (error || !c) {
    return (
      <div>
        <BackLink t={t} />
        <Card><ErrorState message={error || 'Not found'} onRetry={() => load()} /></Card>
      </div>
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

  return (
    <div>
      <BackLink t={t} />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">{c.ticket_number}</h1>
            {c.is_demo && <DemoTag />}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <CategoryChip category={c.category} label={catName} />
            {subName && <span className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-medium text-muted">{subName}</span>}
            <TStatusBadge status={c.status} />
            <TSeverityBadge severity={c.severity} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!c.is_mine && (
            <Button variant={c.i_follow ? 'secondary' : 'civic'} onClick={toggleFollow} loading={busy}>
              {c.i_follow ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              {c.i_follow ? t('btn.unfollow', 'Unfollow') : t('btn.follow', 'Follow')}
            </Button>
          )}
          {!isTerminal && (
            <Button variant="secondary" onClick={() => setEvOpen(true)}><ImagePlus className="h-4 w-4" aria-hidden />{t('btn.addEvidence', 'Add evidence')}</Button>
          )}
          {canReopen && (
            <Button variant="secondary" onClick={() => setReopenOpen(true)}><RotateCcw className="h-4 w-4" aria-hidden />{t('btn.reopen', 'Request reopening')}</Button>
          )}
        </div>
      </div>

      {resolved && (
        <Notice tone="success" title={t('detail.thanksTitle', 'Resolved. Thank you.')} className="mb-5">
          <p>{t('detail.thanks', 'Your voice helped make this neighbourhood better. A supervisor verified that this issue was resolved.')}</p>
          <Link to="/app/certificates" className="mt-2 inline-flex items-center gap-1.5 font-semibold text-forest hover:underline"><Award className="h-4 w-4" aria-hidden />{t('detail.certLink', 'View your certificates')}</Link>
        </Notice>
      )}
      {c.reopen_requested && (
        <Notice tone="warning" className="mb-5">{t('detail.reopenPending', 'A reopening request is awaiting a supervisor decision.')}</Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title={t('detail.report', 'The report')}
              action={<span className="inline-flex items-center gap-1.5 text-xs text-muted">{c.submitted_via === 'voice' && <><Mic className="h-3.5 w-3.5 text-civic" aria-hidden />{t('detail.voice', 'Submitted by voice')} · </>}{langLabel}</span>} />
            <CardBody>
              {c.summary && <p className="mb-3 rounded-[10px] bg-civic-50 px-3 py-2 text-sm text-ink"><span className="mr-1.5 inline-flex items-center gap-1 font-semibold text-civic"><Sparkles className="h-3.5 w-3.5" aria-hidden />{t('detail.aiSummary', 'AI summary')}:</span>{c.summary}</p>}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink" lang={c.original_language}>{c.original_description || '—'}</p>
              {c.translated_description && c.original_language !== 'en' && (
                <p className="mt-3 border-t border-line pt-3 text-sm text-muted"><span className="font-semibold text-ink/80">{t('detail.translation', 'English translation')}:</span> {c.translated_description}</p>
              )}
              <p className="mt-3 text-xs text-muted">{t('detail.submitted', 'Submitted')} {fmtDateTime(c.created_at)}{c.resolved_at ? ` · ${t('detail.resolvedAt', 'Resolved')} ${fmtDateTime(c.resolved_at)}` : ''}</p>
            </CardBody>
          </Card>

          {images.length > 0 && (
            <Card>
              <CardHeader title={`${t('detail.photos', 'Photos')} (${images.length})`} />
              <CardBody>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {images.map((im) => (
                    <li key={im.id}>
                      <button type="button" onClick={() => setPreview(im)} className="block w-full overflow-hidden rounded-[10px] border border-line" aria-label={`${t('detail.openPhoto', 'Open photo')} ${im.id}`}>
                        <AuthImage imageId={im.id} alt={im.ai_observation || `${t('detail.photo', 'Photo')} ${im.id}`} className="aspect-[4/3] w-full" />
                      </button>
                      <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">{im.kind}</p>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title={t('timeline.title', 'Status timeline')} />
            <CardBody><StatusTimeline rows={timeline} /></CardBody>
          </Card>

          {updates.length > 0 && (
            <Card>
              <CardHeader title={t('detail.updates', 'Updates from the department')} />
              <ul className="divide-y divide-line">
                {updates.map((u, i) => (
                  <li key={u.id ?? i} className="px-4 py-3 sm:px-5">
                    <p className="text-sm text-ink">{u.body}</p>
                    <p className="mt-1 text-xs text-muted">{u.author_name ? `${u.author_name} · ` : ''}{fmtDateTime(u.created_at)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title={t('detail.assessment', 'Routing and severity')} />
            <CardBody className="space-y-3 text-sm">
              <div className="flex items-start gap-2"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-civic" aria-hidden />
                <div><p className="text-xs text-muted">{t('detail.department', 'Department')}</p><p className="font-semibold">{c.department_name || meta?.departments?.find((d) => d.code === c.department_code)?.name || t('detail.pending', 'Being assigned')}</p></div>
              </div>
              <div>
                <p className="text-xs text-muted">{t('detail.severity', 'Severity')}</p>
                <div className="mt-1"><TSeverityBadge severity={c.severity} /></div>
                {c.severity_reason && <p className="mt-1.5 text-ink/80">{c.severity_reason}</p>}
                <p className="mt-1.5 text-xs text-muted">{t('detail.aiNote', 'Suggested by AI triage; an officer can confirm or change it.')}</p>
              </div>
              <div className="flex items-start gap-2 border-t border-line pt-3"><Users className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
                <p>{t('detail.supporting', 'Linked or supporting reports')}: <span className="font-semibold">{c.supporting_count ?? 0}</span>{c.followers_count > 0 && <span className="text-muted"> · {c.followers_count} {t('detail.followers', 'following')}</span>}</p>
              </div>
              {c.i_follow && <p className="flex items-center gap-1.5 text-xs font-semibold text-civic"><Heart className="h-3.5 w-3.5" aria-hidden />{t('detail.youFollow', 'You are following this report')}</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('detail.location', 'Approximate location')} />
            {hasLoc ? (
              <div className="p-3">
                <div className="h-56 overflow-hidden rounded-[10px] border border-line">
                  <MapContainer center={[loc.latitude, loc.longitude]} zoom={16} scrollWheelZoom={false} className="h-full w-full" attributionControl>
                    <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
                    <Circle center={[loc.latitude, loc.longitude]} radius={60} pathOptions={{ color: SEV_COLOR[c.severity] || '#244c39', weight: 1, fillOpacity: 0.12 }} />
                    <Marker position={[loc.latitude, loc.longitude]} icon={dotIcon(SEV_COLOR[c.severity] || '#244c39', 16)} />
                  </MapContainer>
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
                  <span>{loc.locality || loc.address || 'Bengaluru'}{loc.ward_code ? ` · ${loc.ward_code}` : ''}</span></p>
                {!c.is_mine && <p className="mt-1 text-xs text-muted">{t('detail.privacy', 'Position is rounded for privacy.')}</p>}
                {loc.service_area_status === 'needs_manual_routing' && <p className="mt-1 text-xs text-muted">{t('detail.manual', 'Official ward boundaries are not imported, so an officer routes this manually.')}</p>}
              </div>
            ) : <EmptyState title={t('detail.noLoc', 'No location available')} />}
          </Card>
        </div>
      </div>

      <EvidenceModal open={evOpen} onClose={() => setEvOpen(false)} ticketId={ticketId} t={t} max={meta?.limits?.max_images_per_report || 4} onDone={() => { setEvOpen(false); load(true) }} />
      <ReopenModal open={reopenOpen} onClose={() => setReopenOpen(false)} ticketId={ticketId} t={t} onDone={() => { setReopenOpen(false); load(true) }} />
      <Modal open={!!preview} onClose={() => setPreview(null)} title={t('detail.photo', 'Photo')} wide>
        {preview && <AuthImage imageId={preview.id} alt={preview.ai_observation || ''} className="max-h-[70vh] w-full rounded-[10px] !object-contain" />}
        {preview?.ai_observation && <p className="mt-2 text-sm text-muted">{preview.ai_observation}</p>}
      </Modal>
    </div>
  )
}

function BackLink({ t }) {
  return <Link to="/app/complaints" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-civic hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />{t('nav.reports', 'My reports')}</Link>
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
