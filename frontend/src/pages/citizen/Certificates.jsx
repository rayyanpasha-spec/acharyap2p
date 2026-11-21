import { useCallback, useEffect, useState } from 'react'
import { Award } from 'lucide-react'
import { api, errMsg } from '../../lib/api'
import { Card, EmptyState, ErrorState, Notice, PageHeader, Spinner } from '../../components/ui'
import CertificateCard from '../../features/civicverse/CertificateCard'
import CivicBot from '../../features/civicverse/CivicBot'

export default function Certificates() {
  const [certs, setCerts] = useState(null)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    setCerts(null); setErr('')
    api.get('/certificates')
      .then((r) => setCerts(Array.isArray(r.data) ? r.data : (r.data?.items || [])))
      .catch((e) => setErr(errMsg(e)))
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div>
      <PageHeader title="Certificates" subtitle="Certificates of Appreciation for reports that led to a verified improvement." />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {certs === null && !err && <Spinner label="Loading certificates…" />}
          {err && <Card><ErrorState message={err} onRetry={load} /></Card>}
          {certs && certs.length === 0 && (
            <Card>
              <EmptyState
                icon={Award}
                title="No certificates yet"
                hint="A certificate is issued only after an authorised officer verifies that your reported issue was resolved. It is never issued merely because a field worker marked a ticket as resolved."
              />
            </Card>
          )}
          {certs && certs.map((c) => <CertificateCard key={c.code || c.id} cert={c} />)}
          {certs && certs.length > 0 && (
            <Notice tone="civic" title="About these certificates">
              Each certificate thanks you for reporting an issue that led to a verified improvement. It does not mean you carried out the repair. Anyone with the verification link can confirm it is genuine and will see only approved details.
            </Notice>
          )}
        </div>
        <div><CivicBot /></div>
      </div>
    </div>
  )
}
