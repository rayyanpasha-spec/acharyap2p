// Ticket action panels (right column of the ticket detail) + reusable evidence/status forms (also used by worker tasks).
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import { api, errMsg } from '../../lib/api'
import { Button, Field, Input, Notice, Select, Textarea, cn, toast } from '../../components/ui'
import { titleCase } from '../../lib/format'
import { useMeta } from '../../store/meta'
import { SEVERITIES, useFetch } from './common'

/* ---------- API helpers (shared with WorkerTasks) ---------- */
export const patchStatus = (ticket, status, note, citizenVisible = true) =>
  api.patch(`/complaints/${ticket}/status`, { status, note: note || undefined, citizen_visible: citizenVisible })

export function postEvidence(ticket, { kind, notes, file }) {
  const fd = new FormData()
  fd.append('kind', kind)
  if (notes) fd.append('notes', notes)
  if (file) fd.append('image', file)
  return api.post(`/complaints/${ticket}/resolution-evidence`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

/** Runs an async action with busy state, toast and a refetch callback. */
export function useAction(onDone) {
  const [busy, setBusy] = useState(false)
  const run = async (fn, successMsg) => {
    setBusy(true)
    try {
      await fn()
      toast.success(successMsg)
      if (onDone) await onDone()
      return true
    } catch (e) {
      toast.error(errMsg(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

/* ---------- Panel shell ---------- */
export function Panel({ title, hint, defaultOpen = false, accent = 'civic', children }) {
  const [open, setOpen] = useState(defaultOpen)
  const bar = { civic: 'border-l-civic', forest: 'border-l-forest', teal: 'border-l-teal', saffron: 'border-l-saffron', plum: 'border-l-plum' }[accent]
  return (
    <section className={cn('rounded-[10px] border border-line border-l-4 bg-surface', bar)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span>
          <span className="block font-display text-[14px] font-bold text-ink">{title}</span>
          {hint && <span className="block text-xs text-muted">{hint}</span>}
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted" aria-hidden /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
      </button>
      {open && <div className="space-y-3 border-t border-line px-4 py-3">{children}</div>}
    </section>
  )
}

const Check = ({ id, checked, onChange, children }) => (
  <label htmlFor={id} className="flex items-start gap-2 text-sm text-ink">
    <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#244c39]" />
    <span>{children}</span>
  </label>
)

/* ---------- Classification ---------- */
export function ClassifyPanel({ ticket, detail, onDone }) {
  const meta = useMeta((s) => s.meta)
  const categories = meta?.categories || []
  const departments = meta?.departments || []
  const aiRes = detail?.ai_analysis?.result || {}
  const aiVals = {
    category: aiRes.category ?? ticket.category,
    subcategory: aiRes.subcategory ?? ticket.subcategory,
    severity: aiRes.severity ?? ticket.severity,
    department_code: aiRes.department_code ?? ticket.department_code,
  }
  const [f, setF] = useState({ category: ticket.category || '', subcategory: ticket.subcategory || '', severity: ticket.severity || '', department_code: ticket.department_code || '', reason: '', confirm: false })
  useEffect(() => {
    setF({ category: ticket.category || '', subcategory: ticket.subcategory || '', severity: ticket.severity || '', department_code: ticket.department_code || '', reason: '', confirm: false })
  }, [ticket.id, ticket.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps
  const { busy, run } = useAction(onDone)
  const subs = categories.find((c) => c.code === f.category)?.subcategories || []
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const changed = ['category', 'subcategory', 'severity', 'department_code'].filter((k) => (f[k] || '') !== (ticket[k] || ''))
  const diffs = ['category', 'subcategory', 'severity', 'department_code'].filter((k) => (f[k] || '') !== (aiVals[k] || ''))
  const reasonOk = f.reason.trim().length >= 5
  const canSubmit = reasonOk && (changed.length > 0 || f.confirm)

  const submit = (e) => {
    e.preventDefault()
    const body = { reason: f.reason.trim(), confirm: f.confirm }
    changed.forEach((k) => { body[k] = f[k] })
    run(() => api.patch(`/complaints/${ticket.ticket_number}/classification`, body), f.confirm ? 'Classification confirmed' : 'Classification updated')
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {ticket.classification_confirmed && <Notice tone="success">Classification already confirmed by staff.</Notice>}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Category" htmlFor="cl-cat">
          <Select id="cl-cat" value={f.category} onChange={(e) => setF((p) => ({ ...p, category: e.target.value, subcategory: '' }))}>
            {categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Subcategory" htmlFor="cl-sub">
          <Select id="cl-sub" value={f.subcategory} onChange={(e) => set('subcategory', e.target.value)}>
            <option value="">None</option>
            {subs.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Severity" htmlFor="cl-sev">
          <Select id="cl-sev" value={f.severity} onChange={(e) => set('severity', e.target.value)}>
            {SEVERITIES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </Select>
        </Field>
        <Field label="Department" htmlFor="cl-dept">
          <Select id="cl-dept" value={f.department_code} onChange={(e) => set('department_code', e.target.value)}>
            {departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Reason (required)" htmlFor="cl-reason" hint="Recorded in the audit log with the before/after values.">
        <Textarea id="cl-reason" className="min-h-[70px]" value={f.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Why are you confirming or changing this?" />
      </Field>
      {diffs.length > 0 && (
        <div className="rounded-lg border border-dashed border-saffron/60 bg-saffron-100/60 p-2.5 text-xs text-ink">
          <p className="mb-1 font-bold text-saffron">AI said → you set</p>
          <ul className="space-y-0.5">
            {diffs.map((k) => (
              <li key={k} className="flex flex-wrap items-center gap-1">
                <span className="font-semibold">{titleCase(k.replace('_code', ''))}:</span>
                <span className="text-muted line-through">{titleCase(String(aiVals[k] || 'none'))}</span>
                <ArrowRight className="h-3 w-3" aria-hidden />
                <span className="font-semibold">{titleCase(String(f[k] || 'none'))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Check id="cl-confirm" checked={f.confirm} onChange={(v) => set('confirm', v)}>
        <b>Confirm AI result</b> as correct (moves a new ticket to Verified).
      </Check>
      <Button type="submit" variant="civic" loading={busy} disabled={!canSubmit} className="w-full">
        {f.confirm && changed.length === 0 ? 'Confirm classification' : 'Save classification'}
      </Button>
    </form>
  )
}

/* ---------- Assignment ---------- */
export function AssignPanel({ ticket, onDone }) {
  const departments = useMeta((s) => s.meta?.departments) || []
  const [dept, setDept] = useState(ticket.department_code || '')
  const [worker, setWorker] = useState('')
  const [note, setNote] = useState('')
  const { busy, run } = useAction(onDone)
  const { data: workers, loading } = useFetch('/officer/workers', { department: dept || undefined })
  const list = Array.isArray(workers) ? workers : workers?.items || []
  useEffect(() => { setWorker('') }, [dept])
  const deptChanged = dept !== (ticket.department_code || '')

  const submit = (e) => {
    e.preventDefault()
    const body = {}
    if (deptChanged) body.department_code = dept
    if (worker) body.worker_id = worker
    if (note.trim()) body.note = note.trim()
    run(async () => { await api.patch(`/complaints/${ticket.ticket_number}/assignment`, body); setNote(''); setWorker('') }, 'Assignment updated')
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-muted">Currently: {ticket.assigned_worker?.name ? <b className="text-ink">{ticket.assigned_worker.name}</b> : 'unassigned'}</p>
      <Field label="Department" htmlFor="as-dept">
        <Select id="as-dept" value={dept} onChange={(e) => setDept(e.target.value)}>
          {departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
        </Select>
      </Field>
      <Field label="Field worker" htmlFor="as-worker" hint={loading ? 'Loading workers…' : list.length === 0 ? 'No workers found for this department.' : undefined}>
        <Select id="as-worker" value={worker} onChange={(e) => setWorker(e.target.value)}>
          <option value="">No change</option>
          {list.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.open_tasks ?? 0} open)</option>)}
        </Select>
      </Field>
      <Field label="Note (optional)" htmlFor="as-note">
        <Input id="as-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Instructions for the worker" />
      </Field>
      <Button type="submit" variant="civic" loading={busy} disabled={!worker && !deptChanged} className="w-full">Save assignment</Button>
    </form>
  )
}

/* ---------- Status ---------- */
export function StatusPanel({ ticket, detail, onDone }) {
  const options = (detail?.allowed_transitions || []).filter((s) => s !== 'resolved' && s !== 'duplicate_linked')
  const [status, setStatus] = useState('')
  const [note, setNote] = useState('')
  const [visible, setVisible] = useState(true)
  const { busy, run } = useAction(onDone)
  useEffect(() => { setStatus(options[0] || '') }, [ticket.status]) // eslint-disable-line react-hooks/exhaustive-deps

  if (options.length === 0) return <p className="text-sm text-muted">No status changes are available for this ticket right now.</p>
  const submit = (e) => {
    e.preventDefault()
    run(async () => { await patchStatus(ticket.ticket_number, status, note.trim(), visible); setNote('') }, `Status set to ${titleCase(status)}`)
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="New status" htmlFor="st-status">
        <Select id="st-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {options.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </Select>
      </Field>
      <Field label="Note" htmlFor="st-note">
        <Textarea id="st-note" className="min-h-[64px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed?" />
      </Field>
      <Check id="st-vis" checked={visible} onChange={setVisible}>Visible to the citizen on their timeline</Check>
      <Button type="submit" variant="civic" loading={busy} disabled={!status} className="w-full">Update status</Button>
      <p className="text-xs text-muted">Only transitions allowed from the current status are listed. Resolution is completed through supervisor verification.</p>
    </form>
  )
}

/* ---------- Notes ---------- */
export function NotePanel({ ticket, onDone }) {
  const [vis, setVis] = useState('internal')
  const [body, setBody] = useState('')
  const { busy, run } = useAction(onDone)
  const submit = (e) => {
    e.preventDefault()
    run(async () => { await api.post(`/complaints/${ticket.ticket_number}/notes`, { body: body.trim(), visibility: vis }); setBody('') }, vis === 'public' ? 'Update posted to the citizen' : 'Internal note added')
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div role="radiogroup" aria-label="Note visibility" className="grid grid-cols-2 gap-2 text-sm">
        {[['internal', 'Internal note'], ['public', 'Public update']].map(([v, label]) => (
          <label key={v} className={cn('cursor-pointer rounded-lg border px-3 py-2 text-center font-semibold', vis === v ? (v === 'internal' ? 'border-saffron bg-saffron-100 text-saffron' : 'border-civic bg-civic-100 text-civic') : 'border-line-strong text-muted')}>
            <input type="radio" name="note-vis" value={v} checked={vis === v} onChange={() => setVis(v)} className="sr-only" />
            {label}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">{vis === 'public' ? 'The citizen who reported this will see this update and be notified.' : 'Internal - not visible to citizens.'}</p>
      <Textarea aria-label="Note text" className="min-h-[80px]" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a note…" />
      <Button type="submit" variant="civic" loading={busy} disabled={body.trim().length < 2} className="w-full">{vis === 'public' ? 'Post public update' : 'Add internal note'}</Button>
    </form>
  )
}

/* ---------- Evidence upload (reused by WorkerTasks) ---------- */
export function EvidenceForm({ ticketNumber, defaultKind = 'after', lockKind, onDone, submitLabel = 'Upload evidence' }) {
  const [kind, setKind] = useState(defaultKind)
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [key, setKey] = useState(0)
  const { busy, run } = useAction(onDone)
  const submit = async (e) => {
    e.preventDefault()
    const ok = await run(() => postEvidence(ticketNumber, { kind, notes: notes.trim(), file }), `${titleCase(kind)} evidence uploaded`)
    if (ok) { setNotes(''); setFile(null); setKey((k) => k + 1) }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {!lockKind && (
        <Field label="Type" htmlFor={`ev-kind-${ticketNumber}`}>
          <Select id={`ev-kind-${ticketNumber}`} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="before">Before work</option>
            <option value="after">After work</option>
          </Select>
        </Field>
      )}
      <Field label="Photo" htmlFor={`ev-file-${ticketNumber}`} hint="JPEG, PNG or WebP. Photos are evidence only; a supervisor verifies resolution.">
        <input key={key} id={`ev-file-${ticketNumber}`} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-civic-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-civic" />
      </Field>
      <Field label="Notes (optional)" htmlFor={`ev-notes-${ticketNumber}`}>
        <Input id={`ev-notes-${ticketNumber}`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was done?" />
      </Field>
      <Button type="submit" variant="primary" loading={busy} disabled={!file && !notes.trim()} className="w-full">{submitLabel}</Button>
    </form>
  )
}

/* ---------- Send for supervisor verification (reused by WorkerTasks) ---------- */
export function HandoverForm({ ticketNumber, hasAfter, onDone }) {
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const { busy, run } = useAction(onDone)
  const needsNote = !hasAfter && !file
  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      if (file) await postEvidence(ticketNumber, { kind: 'after', notes: note.trim(), file })
      await patchStatus(ticketNumber, 'awaiting_verification', note.trim() || 'Work completed - sent for supervisor verification', true)
      setNote(''); setFile(null)
    }, 'Sent for supervisor verification')
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="After-work photo (optional)" htmlFor={`ho-file-${ticketNumber}`} hint={hasAfter ? 'An after photo is already on file.' : 'An after photo or a completion note is required.'}>
        <input id={`ho-file-${ticketNumber}`} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-civic-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-civic" />
      </Field>
      <Field label="Completion note" htmlFor={`ho-note-${ticketNumber}`}>
        <Textarea id={`ho-note-${ticketNumber}`} className="min-h-[64px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe the work completed" />
      </Field>
      <Button type="submit" variant="primary" loading={busy} disabled={needsNote && !note.trim()} className="w-full">Send for supervisor verification</Button>
      <p className="text-xs text-muted">The ticket is not resolved until a supervisor verifies it.</p>
    </form>
  )
}

/* ---------- Supervisor: verify resolution ---------- */
export function VerifyPanel({ ticket, onDone }) {
  const [note, setNote] = useState('')
  const { busy, run } = useAction(onDone)
  const ready = ticket.status === 'awaiting_verification'
  const submit = (e) => {
    e.preventDefault()
    run(async () => { await api.post(`/complaints/${ticket.ticket_number}/verify-resolution`, { note: note.trim() || undefined }); setNote('') }, 'Resolution verified')
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Notice tone="forest">Verifying marks the ticket Resolved. A Certificate of Appreciation is issued to the reporter only after verification, never when a worker simply marks work done.</Notice>
      {!ready && <p className="text-xs font-medium text-saffron">Available once the ticket is Awaiting verification (currently {titleCase(ticket.status)}).</p>}
      <Field label="Verification note" htmlFor="vr-note" hint="Required if there is no after-work evidence on file.">
        <Textarea id="vr-note" className="min-h-[64px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you check?" />
      </Field>
      <Button type="submit" variant="primary" loading={busy} disabled={!ready} className="w-full">Verify resolution</Button>
    </form>
  )
}

/* ---------- Supervisor: reopen decision ---------- */
export function ReopenPanel({ ticket, onDone }) {
  const [note, setNote] = useState('')
  const { busy, run } = useAction(onDone)
  const decide = (approve) => run(async () => { await api.post(`/complaints/${ticket.ticket_number}/reopen-decision`, { approve, note: note.trim() || undefined }); setNote('') }, approve ? 'Ticket reopened' : 'Reopen request declined')
  return (
    <div className="space-y-3">
      <Notice tone="warning" title="The citizen asked to reopen this ticket">{ticket.reopen_reason || 'No reason was recorded.'}</Notice>
      <Field label="Decision note" htmlFor="ro-note"><Textarea id="ro-note" className="min-h-[60px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shown to the citizen if you decline" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" loading={busy} onClick={() => decide(true)}>Approve reopen</Button>
        <Button variant="secondary" loading={busy} onClick={() => decide(false)}>Decline</Button>
      </div>
    </div>
  )
}

/* ---------- Link duplicate ---------- */
export function DuplicatePanel({ ticket, onDone }) {
  const [primary, setPrimary] = useState('')
  const [reason, setReason] = useState('')
  const { busy, run } = useAction(onDone)
  const valid = /^CL-\d{4}-\d+$/i.test(primary.trim()) && reason.trim().length >= 3 && primary.trim().toUpperCase() !== ticket.ticket_number
  const submit = (e) => {
    e.preventDefault()
    if (!window.confirm(`Link ${ticket.ticket_number} as a duplicate of ${primary.trim().toUpperCase()}? Original submissions are preserved.`)) return
    run(async () => { await api.post(`/complaints/${ticket.ticket_number}/link-duplicate`, { primary_ticket_number: primary.trim().toUpperCase(), reason: reason.trim() }); setPrimary(''); setReason('') }, 'Linked as duplicate')
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Primary ticket number" htmlFor="dp-primary"><Input id="dp-primary" value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="CL-2026-00142" className="font-mono" /></Field>
      <Field label="Reason" htmlFor="dp-reason"><Input id="dp-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Same pothole, same street" /></Field>
      <Button type="submit" variant="secondary" loading={busy} disabled={!valid} className="w-full">Link as duplicate</Button>
      <p className="text-xs text-muted">Reporters and supporters are moved to follow the primary ticket.</p>
    </form>
  )
}

/** The whole right-hand column, gated by `can` and `allowed_transitions`. */
export function ActionColumn({ ticket, detail, onDone }) {
  const can = detail?.can || {}
  const transitions = detail?.allowed_transitions || []
  const hasAfter = useMemo(() => (detail?.resolution_evidence || []).some((e) => e.kind === 'after'), [detail])
  const canEvidence = can.status || can.assign || can.verify || can.classify
  const any = can.classify || can.assign || can.status || can.note || can.verify || (can.reopen_decision && ticket.reopen_requested)

  if (!any) return <Notice tone="civic">You have read-only access to this ticket.</Notice>
  return (
    <div className="space-y-3">
      {can.reopen_decision && ticket.reopen_requested && (
        <Panel title="Reopen decision" hint="Citizen requested reopening" accent="saffron" defaultOpen><ReopenPanel ticket={ticket} onDone={onDone} /></Panel>
      )}
      {can.verify && <Panel title="Verify resolution" hint="Supervisor / admin only" accent="forest" defaultOpen={ticket.status === 'awaiting_verification'}><VerifyPanel ticket={ticket} onDone={onDone} /></Panel>}
      {can.classify && <Panel title="Confirm or correct classification" hint="Reason required; logged to audit" accent="civic" defaultOpen={!ticket.classification_confirmed}><ClassifyPanel ticket={ticket} detail={detail} onDone={onDone} /></Panel>}
      {can.assign && <Panel title="Assign" hint="Department and field worker" accent="civic"><AssignPanel ticket={ticket} onDone={onDone} /></Panel>}
      {can.status && <Panel title="Update status" hint="Allowed transitions only" accent="civic" defaultOpen={!can.classify}><StatusPanel ticket={ticket} detail={detail} onDone={onDone} /></Panel>}
      {can.status && transitions.includes('awaiting_verification') && (
        <Panel title="Send for supervisor verification" hint="Work is done and evidence is attached" accent="forest"><HandoverForm ticketNumber={ticket.ticket_number} hasAfter={hasAfter} onDone={onDone} /></Panel>
      )}
      {can.note && <Panel title="Add note" hint="Public update or internal note" accent="saffron"><NotePanel ticket={ticket} onDone={onDone} /></Panel>}
      {canEvidence && <Panel title="Upload resolution evidence" hint="Before / after photos" accent="forest"><EvidenceForm ticketNumber={ticket.ticket_number} onDone={onDone} /></Panel>}
      {can.classify && <Panel title="Link duplicate" hint="Merge into a primary ticket" accent="plum"><DuplicatePanel ticket={ticket} onDone={onDone} /></Panel>}
    </div>
  )
}
