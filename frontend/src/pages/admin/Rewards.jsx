// Admin: civic rewards citizens have earned (every 10 resolved + verified reports). The app only records them;
// the admin pays / issues the reward outside the app and then marks it fulfilled here.
import { useState } from 'react'
import { Gift } from 'lucide-react'
import { Badge, Button, EmptyState, ErrorState, Field, Input, Modal, Notice, Page, Panel, Segmented, Spinner, toast } from '../../components/ui'
import { api, errMsg } from '../../lib/api'
import { fmtDateTime } from '../../lib/format'
import { Scroll, NoteStrip, toList, useApi } from '../../features/admin/shared'
import { Cell, HCell } from '../../features/staff/common'

export default function Rewards() {
  const [status, setStatus] = useState('earned')
  const { data, loading, error, reload } = useApi('/rewards', { status: status === 'all' ? undefined : status })
  const items = toList(data)
  const [target, setTarget] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const close = () => { setTarget(null); setNote(''); setErr(null) }
  const confirm = async () => {
    setBusy(true); setErr(null)
    try {
      await api.post(`/rewards/${target.id}/fulfil`, { note: note.trim() || null })
      toast.success('Reward marked as given. The citizen has been notified.')
      close(); reload()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <Page title="Rewards" subtitle="Citizens earn a reward for every 10 of their reports that are resolved and verified.">
      <Panel className="flex-1" title="Earned rewards" subtitle="Pay or issue the reward outside CivicLens, then mark it given" icon={Gift} tone="saffron"
        scroll={false} bodyClassName="flex flex-col p-0"
        action={<Segmented ariaLabel="Reward status" value={status} onChange={setStatus} options={[{ value: 'earned', label: `To give${data?.pending ? ` (${data.pending})` : ''}` }, { value: 'fulfilled', label: 'Given' }, { value: 'all', label: 'All' }]} />}>
        <NoteStrip title="No money moves in the app">CivicLens records who has earned a reward. Mark it given only after you have paid or issued it yourself.</NoteStrip>
        <Scroll>
          {loading && !data ? <Spinner /> : error ? <ErrorState message={error} onRetry={reload} /> : !items.length ? (
            <EmptyState title={status === 'earned' ? 'No rewards waiting' : 'Nothing here yet'} hint="A reward appears when a citizen has 10 resolved and verified reports." />
          ) : (
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead><tr><HCell>Citizen</HCell><HCell>Reward</HCell><HCell>Earned</HCell><HCell>Status</HCell><HCell className="text-right">Action</HCell></tr></thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <Cell><p className="font-medium text-ink">{r.user_name}</p><p className="text-xs text-muted">{r.user_email}</p></Cell>
                    <Cell><span className="font-sans font-bold">{r.display}</span> <span className="text-xs text-muted">#{r.milestone} ({r.reports_counted} reports)</span>{r.is_demo && <Badge tone="saffron" className="ml-2">Demo</Badge>}</Cell>
                    <Cell className="whitespace-nowrap text-muted">{fmtDateTime(r.earned_at)}</Cell>
                    <Cell>{r.status === 'fulfilled' ? <Badge tone="success">Given {fmtDateTime(r.fulfilled_at)}</Badge> : <Badge tone="saffron">To give</Badge>}{r.note && <p className="mt-0.5 text-xs text-muted">{r.note}</p>}</Cell>
                    <Cell className="text-right">{r.status === 'earned' && <Button size="sm" onClick={() => setTarget(r)}>Mark as given</Button>}</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Scroll>
      </Panel>

      <Modal open={!!target} onClose={close} title="Mark reward as given"
        footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={confirm} loading={busy}>Confirm given</Button></>}>
        {target && (
          <div className="space-y-3">
            {err && <Notice tone="critical">{err}</Notice>}
            <p className="text-sm">Confirm that <b>{target.display}</b> has been given to <b>{target.user_name}</b>. They will be notified. This cannot be undone.</p>
            <Field label="Note (optional)" htmlFor="rw-note" hint="For your records, for example a payment reference.">
              <Input id="rw-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        )}
      </Modal>
    </Page>
  )
}
