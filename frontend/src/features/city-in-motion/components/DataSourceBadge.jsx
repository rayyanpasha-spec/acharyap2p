// Honest provenance badge. kind: 'vehicle' | 'bin' | 'complaint'. Simulated sources are always visibly marked.
import { cn } from '../../../components/ui'
import { DATA_SOURCE } from '../utils/mapConfig'

export function sourceLabel(source, kind) {
  const m = DATA_SOURCE[source]
  if (!m) return source ? String(source).replace(/_/g, ' ') : 'Unknown source'
  return m[kind] || m.fallback
}

export default function DataSourceBadge({ source, kind = 'vehicle', className }) {
  if (!source) return null
  const simulated = !!DATA_SOURCE[source]?.simulated
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        simulated ? 'border-dashed border-saffron/60 bg-saffron-100 text-[#8A4F13]' : 'border-forest/20 bg-forest-100 text-forest',
        className,
      )}
      title={simulated ? 'This data is simulated for the demo' : 'Data source'}
    >
      {sourceLabel(source, kind)}
    </span>
  )
}
