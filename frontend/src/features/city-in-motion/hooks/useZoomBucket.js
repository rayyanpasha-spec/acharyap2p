import { useEffect, useState } from 'react'

/** Integer zoom level of a MapLibre map, updated on `zoomend`. Used to regenerate zoom-adaptive 3D solids. */
export default function useZoomBucket(map) {
  const [z, setZ] = useState(() => { try { return Math.round(map.getZoom()) } catch { return 13 } })
  useEffect(() => {
    if (!map) return undefined
    const on = () => { try { setZ(Math.round(map.getZoom())) } catch { /* map removed */ } }
    on()
    map.on('zoomend', on)
    return () => { try { map.off('zoomend', on) } catch { /* map removed */ } }
  }, [map])
  return z
}
