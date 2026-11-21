// Shown when MapLibre cannot start (no WebGL, blocked tile provider, library failed to load). Offers Retry and hosts the 2D fallback map.
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '../../../components/ui'

export default function MapErrorState({ message, onRetry, children }) {
  return (
    <div className="flex h-full w-full flex-col bg-paper">
      <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-critical/30 bg-critical-100 px-4 py-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-critical" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-ink">
          <span className="font-semibold">The 3D map could not start. </span>
          {message || 'Your browser may not support WebGL, or the map provider is unreachable.'} Showing the same data on a simple 2D map.
        </p>
        <Button variant="secondary" size="sm" onClick={onRetry}><RotateCw className="h-3.5 w-3.5" aria-hidden /> Retry 3D map</Button>
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  )
}
