import { useCallback, useEffect, useState } from 'react'
import { Award, Info } from 'lucide-react'
import { api, errMsg } from '../../lib/api'
import { EmptyState, ErrorState, IconTile, Page, Panel, Spinner } from '../../components/ui'
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
    <Page title="Certificates" subtitle="Certificates of Appreciation for reports that led to a verified improvement.">
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[minmax(0,1fr)]">
        <Panel title={`Your certificates${certs ? ` (${certs.length})` : ''}`} icon={Award} tone="saffron" bodyClassName="p-3">
          {certs === null && !err && <Spinner label="Loading certificates…" />}
          {err && <ErrorState message={err} onRetry={load} />}
          {certs && certs.length === 0 && (
            <EmptyState
              icon={Award}
              title="No certificates yet"
              hint="A certificate is issued only after an authorised officer verifies that your reported issue was resolved. It is never issued merely because a field worker marked a ticket as resolved."
            />
          )}
          {certs && certs.length > 0 && (
            <div className="grid content-start gap-3 xl:grid-cols-2">
              {certs.map((c) => <CertificateCard key={c.code || c.id} cert={c} />)}
            </div>
          )}
        </Panel>

        <div className="flex min-h-0 flex-col gap-3">
          <Panel title="About these certificates" icon={Info} tone="civic" className="shrink-0" bodyClassName="p-3.5">
            <div className="flex items-start gap-2.5">
              <IconTile icon={Info} tone="civic" size="sm" />
              <p className="text-[13px] text-ink/85">Each certificate thanks you for reporting an issue that led to a verified improvement. It does not mean you carried out the repair. Anyone with the verification link can confirm it is genuine and will see only approved details.</p>
            </div>
          </Panel>
          <CivicBot className="lg:flex-1" />
        </div>
      </div>
    </Page>
  )
}
