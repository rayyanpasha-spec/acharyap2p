import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Download, Share2, ExternalLink, BadgeCheck } from 'lucide-react'
import { Badge, Button, DemoTag, toast } from '../../components/ui'
import { fetchBlobUrl, errMsg } from '../../lib/api'
import { fmtDate } from '../../lib/format'

export const verifyUrlFor = (c) => c?.verify_url || `${window.location.origin}/verify/${c?.code}`

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true }
  } catch { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}

export default function CertificateCard({ cert }) {
  const [busy, setBusy] = useState(false)
  if (!cert) return null
  const url = verifyUrlFor(cert)

  const download = async () => {
    setBusy(true)
    let u
    try {
      u = await fetchBlobUrl(`/certificates/${cert.code}/pdf`)
      const a = document.createElement('a')
      a.href = u; a.download = `CivicLens-certificate-${cert.code}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      toast.success('Certificate downloaded')
    } catch (e) {
      toast.error(errMsg(e, 'Could not download the certificate.'))
    } finally {
      if (u) setTimeout(() => URL.revokeObjectURL(u), 10000)
      setBusy(false)
    }
  }
  const copy = async () => (await copyText(url)) ? toast.success('Verification link copied') : toast.error('Could not copy. Select the link and copy it manually.')
  const share = async () => {
    try { await navigator.share({ title: 'CivicLens Certificate of Appreciation', text: 'My CivicLens Certificate of Appreciation', url }) } catch { /* cancelled */ }
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(36,76,57,0.05)]" aria-label={`Certificate ${cert.code}`}>
      <div className="m-2.5 rounded-[10px] border-2 border-double border-forest/40 bg-paper px-4 py-4 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-saffron">CivicLens &middot; Bengaluru, Karnataka pilot</p>
        <h3 className="mt-1.5 font-display text-xl font-extrabold text-forest">Certificate of Appreciation</h3>
        <p className="mt-2 text-xs text-muted">presented to</p>
        <p className="font-display text-lg font-bold text-ink">{cert.display_name || 'Citizen'}</p>
        {cert.contribution && <p className="mx-auto mt-2 max-w-md text-[13px] text-ink">{cert.contribution}</p>}
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-muted sm:grid-cols-3">
          <div><dt className="inline">Ticket: </dt><dd className="inline font-semibold text-ink">{cert.ticket_number || '-'}</dd></div>
          <div><dt className="inline">Issued: </dt><dd className="inline font-semibold text-ink">{fmtDate(cert.issued_at)}</dd></div>
          <div className="min-w-0 truncate"><dt className="inline">ID: </dt><dd className="inline font-mono font-semibold text-ink">{cert.code}</dd></div>
        </dl>
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
          {cert.revoked ? <Badge tone="critical">Revoked</Badge> : <Badge tone="success"><BadgeCheck className="h-3 w-3" aria-hidden /> Verifiable</Badge>}
          {cert.is_demo && <DemoTag />}
        </div>
      </div>

      <div className="space-y-2 border-t border-line px-3 py-2.5">
        <p className="truncate text-xs text-muted" title={url}>Verification link: <a href={url} className="font-medium text-civic hover:underline">{url}</a></p>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={download} loading={busy} disabled={cert.revoked}><Download className="h-4 w-4" aria-hidden /> Download PDF</Button>
          <Button size="sm" variant="secondary" onClick={copy}><Copy className="h-4 w-4" aria-hidden /> Copy link</Button>
          {typeof navigator !== 'undefined' && navigator.share && (
            <Button size="sm" variant="secondary" onClick={share}><Share2 className="h-4 w-4" aria-hidden /> Share</Button>
          )}
          {cert.ticket_number && (
            <Link to={`/app/complaints/${cert.ticket_number}`} className="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-civic hover:bg-civic-50">
              <ExternalLink className="h-4 w-4" aria-hidden /> View ticket
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}
