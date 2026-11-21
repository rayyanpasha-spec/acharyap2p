import { useState } from 'react'
import { Badge, Button, Card, DemoTag, EmptyState, ErrorState, Field, Input, Modal, Notice, PageHeader, Select, Spinner, Table, Td, Th, toast } from '../../components/ui'
import { api, errMsg } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { useMeta } from '../../store/meta'
import { timeAgo } from '../../lib/format'
import { RoleChip, STAFF_ROLES, genPassword, toList, useApi } from '../../features/admin/shared'

const NEEDS_DEPT = ['officer', 'worker']

function DeptSelect({ id, value, onChange, departments }) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select department</option>
      {departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
    </Select>
  )
}

function CreateModal({ open, onClose, onDone, departments }) {
  const blank = { display_name: '', email: '', role: 'officer', department_code: '', corporation_code: '', password: '' }
  const [f, setF] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }))
  const close = () => { setF(blank); setErr(null); onClose() }
  const submit = async (e) => {
    e.preventDefault()
    if (!f.display_name.trim() || !f.email.trim()) return setErr('Name and email are required.')
    if (f.password.length < 8) return setErr('Temporary password must be at least 8 characters.')
    if (NEEDS_DEPT.includes(f.role) && !f.department_code) return setErr('Choose a department for officers and workers.')
    setBusy(true); setErr(null)
    try {
      const body = { display_name: f.display_name.trim(), email: f.email.trim(), role: f.role, password: f.password }
      if (NEEDS_DEPT.includes(f.role)) body.department_code = f.department_code
      if (f.corporation_code.trim()) body.corporation_code = f.corporation_code.trim()
      await api.post('/admin/users', body)
      toast.success('Account created. Share the temporary password securely.')
      setF(blank); onDone()
    } catch (er) { setErr(errMsg(er)) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={close} title="Create staff account" footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit" form="create-user-form" loading={busy}>Create account</Button></>}>
      <form id="create-user-form" onSubmit={submit} className="space-y-3">
        {err && <Notice tone="critical">{err}</Notice>}
        <Field label="Full name" htmlFor="cu-name"><Input id="cu-name" value={f.display_name} onChange={(e) => set('display_name')(e.target.value)} required /></Field>
        <Field label="Email" htmlFor="cu-email"><Input id="cu-email" type="email" value={f.email} onChange={(e) => set('email')(e.target.value)} required /></Field>
        <Field label="Role" htmlFor="cu-role">
          <Select id="cu-role" value={f.role} onChange={(e) => set('role')(e.target.value)}>{STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</Select>
        </Field>
        {NEEDS_DEPT.includes(f.role) && <Field label="Department" htmlFor="cu-dept"><DeptSelect id="cu-dept" value={f.department_code} onChange={set('department_code')} departments={departments} /></Field>}
        <Field label="Corporation code (optional)" htmlFor="cu-corp" hint="Only set when an official code is known. Leave blank otherwise."><Input id="cu-corp" value={f.corporation_code} onChange={(e) => set('corporation_code')(e.target.value)} /></Field>
        <Field label="Temporary password" htmlFor="cu-pw" hint="At least 8 characters. The user should change it after first sign-in.">
          <div className="flex gap-2">
            <Input id="cu-pw" value={f.password} onChange={(e) => set('password')(e.target.value)} autoComplete="off" />
            <Button type="button" variant="secondary" onClick={() => set('password')(genPassword())}>Generate</Button>
          </div>
        </Field>
      </form>
    </Modal>
  )
}

function EditModal({ user, onClose, onDone, departments }) {
  const [role, setRole] = useState(user?.role || 'officer')
  const [dept, setDept] = useState(user?.department_code || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  if (!user) return null
  const submit = async (e) => {
    e.preventDefault()
    if (NEEDS_DEPT.includes(role) && !dept) return setErr('Choose a department for officers and workers.')
    setBusy(true); setErr(null)
    try {
      await api.patch(`/admin/users/${user.id}`, { role, department_code: NEEDS_DEPT.includes(role) ? dept : (dept || null) })
      toast.success('User updated'); onDone()
    } catch (er) { setErr(errMsg(er)) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={`Change role / department - ${user.display_name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="edit-user-form" loading={busy}>Save</Button></>}>
      <form id="edit-user-form" onSubmit={submit} className="space-y-3">
        {err && <Notice tone="critical">{err}</Notice>}
        <Field label="Role" htmlFor="eu-role"><Select id="eu-role" value={role} onChange={(e) => setRole(e.target.value)}>{STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</Select></Field>
        <Field label="Department" htmlFor="eu-dept"><DeptSelect id="eu-dept" value={dept} onChange={setDept} departments={departments} /></Field>
      </form>
    </Modal>
  )
}

function ResetModal({ user, onClose }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  if (!user) return null
  const submit = async (e) => {
    e.preventDefault()
    if (pw.length < 8) return setErr('Password must be at least 8 characters.')
    setBusy(true); setErr(null)
    try { await api.post(`/admin/users/${user.id}/reset-password`, { new_password: pw }); toast.success('Password reset'); onClose() } catch (er) { setErr(errMsg(er)) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={`Reset password - ${user.display_name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="reset-form" loading={busy}>Reset password</Button></>}>
      <form id="reset-form" onSubmit={submit} className="space-y-3">
        {err && <Notice tone="critical">{err}</Notice>}
        <Field label="New temporary password" htmlFor="rp-pw" hint="At least 8 characters.">
          <div className="flex gap-2"><Input id="rp-pw" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" /><Button type="button" variant="secondary" onClick={() => setPw(genPassword())}>Generate</Button></div>
        </Field>
      </form>
    </Modal>
  )
}

export default function Users() {
  const me = useAuth((s) => s.user)
  const departments = useMeta((s) => s.meta?.departments) || []
  const [role, setRole] = useState('')
  const [q, setQ] = useState('')
  const [qDraft, setQDraft] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [resetting, setResetting] = useState(null)
  const { data, loading, error, reload } = useApi('/admin/users', { role: role || undefined, q: q || undefined })
  const users = toList(data)

  const toggle = async (u) => {
    try { await api.patch(`/admin/users/${u.id}`, { is_active: !u.is_active }); toast.success(u.is_active ? 'Account deactivated' : 'Account activated'); reload() } catch (e) { toast.error(errMsg(e)) }
  }
  const deptName = (c) => departments.find((d) => d.code === c)?.name || c || '-'

  return (
    <div>
      <PageHeader title="Users" subtitle="Staff and citizen accounts. Admin only." actions={<Button onClick={() => setCreating(true)} className="!bg-plum">Create staff account</Button>} />
      <Card className="mb-4 p-3">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setQ(qDraft.trim()) }}>
          <Field label="Role" htmlFor="uf-role"><Select id="uf-role" value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option>{STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</Select></Field>
          <Field label="Search" htmlFor="uf-q" className="min-w-[200px] flex-1"><Input id="uf-q" placeholder="Name or email" value={qDraft} onChange={(e) => setQDraft(e.target.value)} /></Field>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
      </Card>
      <Card>
        {loading && !data ? <Spinner /> : error ? <ErrorState message={error} onRetry={reload} /> : !users.length ? <EmptyState title="No users found" hint="Try a different role or search." /> : (
          <Table>
            <thead><tr><Th>Name</Th><Th>Role</Th><Th>Department</Th><Th>Status</Th><Th>Last login</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <Td><p className="font-semibold">{u.display_name} {u.is_demo && <DemoTag />}</p><p className="text-xs text-muted">{u.email}</p></Td>
                  <Td><RoleChip role={u.role} /></Td>
                  <Td>{deptName(u.department_code)}</Td>
                  <Td>{u.is_active ? <Badge tone="success" dot>Active</Badge> : <Badge tone="neutral">Inactive</Badge>}</Td>
                  <Td className="text-muted">{u.last_login_at ? timeAgo(u.last_login_at) : 'Never'}</Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(u)}>Role / dept</Button>
                      <Button size="sm" variant="secondary" onClick={() => toggle(u)} disabled={u.id === me?.id}>{u.is_active ? 'Deactivate' : 'Activate'}</Button>
                      <Button size="sm" variant="secondary" onClick={() => setResetting(u)}>Reset password</Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <CreateModal open={creating} onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload() }} departments={departments} />
      <EditModal key={editing?.id} user={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} departments={departments} />
      <ResetModal key={`r${resetting?.id}`} user={resetting} onClose={() => setResetting(null)} />
    </div>
  )
}
