// Collection vehicles. Thin React shell around VehicleController (Three.js custom layer + labels + 2D fallback).
// React hands over data/visibility/selection; all per-frame work stays inside the controller.
import { useEffect, useRef } from 'react'
import { VehicleController } from './vehicleController'

export default function VehicleLayer({ map, maplibregl, registerPicker, vehicles, visible, selectedId, onSelect, onMode, prefer3D }) {
  const ctlRef = useRef(null)
  const latest = useRef({ vehicles, visible, selectedId })
  latest.current = { vehicles, visible, selectedId }
  const cb = useRef({ onSelect, onMode })
  cb.current = { onSelect, onMode }

  useEffect(() => {
    const ctl = new VehicleController({
      map, maplibregl, prefer3D,
      onSelect: (id) => cb.current.onSelect?.('vehicle', id),
      onMode: (mode, err) => cb.current.onMode?.(mode, err),
    })
    ctlRef.current = ctl
    ctl.setVisible(latest.current.visible)
    ctl.setVehicles(latest.current.vehicles)
    ctl.setSelected(latest.current.selectedId)
    ctl.init().catch(() => {})
    const unregister = registerPicker('vehicles', 0, (pt) => ctl.pick(pt))
    return () => { unregister?.(); ctl.destroy(); ctlRef.current = null }
  }, [map, maplibregl, registerPicker, prefer3D])

  useEffect(() => { ctlRef.current?.setVehicles(vehicles) }, [vehicles])
  useEffect(() => { ctlRef.current?.setVisible(visible) }, [visible])
  useEffect(() => { ctlRef.current?.setSelected(selectedId) }, [selectedId])

  return null
}
