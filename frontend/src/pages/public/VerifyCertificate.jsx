// Public certificate verification (no login). Shows only what the API returns.
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BadgeCheck, ShieldQuestion } from 'lucide-react'
import { api, errMsg } from '../../lib/api'
import { Badge, Button, Card, CardBody, DemoTag, ErrorState, Spinner } from '../../components/ui'
import { fmtDate } from '../../lib/format'

function Row({ label, children }) {
  if (children == null || children === '') return null
  return (
    <div className="flex flex-col gap-0.5 border-b border-line py-2.5 last:border-0 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-[13px] font-medium text-muted">{label}</dt>
      <dd className="text-sm font-semibold text-ink">{children}</dd>
    </div>
  )
}

export default function VerifyCertificate() {
  const { code } = useParams()
  const [state, setState] = useState({ phase: 'loading', data: null, error: '' })

  const load = useCallback(() => {
    setState({ phase: 'loading', data: null, error: '' })
    api.get(`/certificates/verify/${encodeURIComponent(code || '')}`)
      .then((r) => setState(r.data && r.data.valid !== false ? { phase: 'valid', data: r.data, error: '' } : { phase: 'invalid', data: null, error: '' }))
      .catch((e) => {
        if (e?.response?.status === 404) setState({ phase: 'invalid', data: null, error: '' })
        else setState({ phase: 'error', data: null, error: errMsg(e) })
      })
  }, [code])
  useEffect(() => { load() }, [load])

  const { phase, data } = state

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <h1 className="font-display text-2xl font-extrabold text-ink sm:text-[28px]">Certificate verification</h1>
      <p className="mt-1 text-sm text-muted">Check that a CivicLens Certificate of Appreciation is genuine.</p>

      <div className="mt-5">
        {phase === 'loading' && <Card><Spinner label="Checking certificate…" /></Card>}

        {phase === 'error' && <Card><ErrorState message={state.error} onRetry={load} /></Card>}

        {phase === 'invalid' && (
          <Card>
            <CardBody className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-paper text-muted"><ShieldQuestion className="h-6 w-6" aria-hidden /></span>
              <h2 className="font-display text-lg font-bold text-ink">We could not verify this certificate</h2>
              <p className="max-w-md text-sm text-muted">
                No valid certificate matches the ID <span className="font-mono text-ink">{code}</span>. Please check the link or ID and try again. If you believe this is a mistake, contact the person who shared it with you.
              </p>
              <Button variant="secondary" size="sm" onClick={load}>Check again</Button>
            </CardBody>
          </Card>
        )}

        {phase === 'valid' && data && (
          <Card className="border-success/40">
            <CardBody>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success" className="px-3 py-1 text-sm"><BadgeCheck className="h-4 w-4" aria-hidden /> Valid certificate</Badge>
                {data.is_demo && <DemoTag />}
              </div>
              <h2 className="mt-3 font-display text-xl font-extrabold text-forest">Certificate of Appreciation</h2>
              <dl className="mt-3">
                <Row label="Awarded to">{data.display_name}</Row>
                <Row label="Contribution">{data.contribution}</Row>
                <Row label="Ticket number">{data.ticket_number}</Row>
                <Row label="Category">{data.category_name}</Row>
                <Row label="Issue date">{data.issued_at ? fmtDate(data.issued_at) : null}</Row>
                <Row label="Issued by">{data.issuer}</Row>
                <Row label="Certificate ID"><span className="font-mono">{data.code || code}</span></Row>
              </dl>
              {data.statement && <p className="mt-4 rounded-[10px] border border-line bg-paper p-3 text-sm text-ink">{data.statement}</p>}
              {data.is_demo && <p className="mt-3 text-xs text-muted">This certificate was created from demonstration data and does not represent a real municipal action.</p>}
            </CardBody>
          </Card>
        )}
      </div>

      <p className="mt-4 text-xs text-muted">This page shows only approved details: no email, phone number or exact location is ever displayed.</p>
      <Link to="/" className="mt-3 inline-block text-sm font-semibold text-civic hover:underline">Back to CivicLens</Link>
    </div>
  )
}
