// Floating camera controls (right edge): zoom, compass / reset north, 2D-3D, reset camera, fullscreen.
import { Compass, Home, Maximize2, Minimize2, Minus, Plus } from 'lucide-react'
import { cn } from '../../../components/ui'

function Btn({ label, onClick, children, active, pressed }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn('flex h-10 w-10 items-center justify-center text-ink transition-colors hover:bg-paper', active && 'bg-forest-50 font-bold text-forest')}
    >
      {children}
    </button>
  )
}

export default function MapToolbar({ api, pitched, bearing, fullscreen, onToggleFullscreen, onTogglePitch }) {
  const divider = <span className="block h-px bg-line" aria-hidden />
  return (
    <div role="toolbar" aria-label="Map controls" className="flex flex-col overflow-hidden rounded-[10px] border border-line-strong bg-surface">
      <Btn label="Zoom in" onClick={() => api()?.zoomIn()}><Plus className="h-[18px] w-[18px]" aria-hidden /></Btn>
      {divider}
      <Btn label="Zoom out" onClick={() => api()?.zoomOut()}><Minus className="h-[18px] w-[18px]" aria-hidden /></Btn>
      {divider}
      <Btn label="Reset bearing to north" onClick={() => api()?.resetNorth()}>
        <Compass className="h-[18px] w-[18px] transition-transform" style={{ transform: `rotate(${-(bearing || 0)}deg)` }} aria-hidden />
      </Btn>
      {divider}
      <Btn label={pitched ? 'Switch to flat 2D view' : 'Switch to tilted 3D view'} onClick={onTogglePitch} active={pitched} pressed={pitched}>
        <span className="text-[13px] font-bold">{pitched ? '3D' : '2D'}</span>
      </Btn>
      {divider}
      <Btn label="Reset camera to Bengaluru" onClick={() => api()?.resetCamera()}><Home className="h-[18px] w-[18px]" aria-hidden /></Btn>
      {onToggleFullscreen && (
        <>
          {divider}
          <Btn label={fullscreen ? 'Exit full screen' : 'Enter full screen'} onClick={onToggleFullscreen}>
            {fullscreen ? <Minimize2 className="h-[18px] w-[18px]" aria-hidden /> : <Maximize2 className="h-[18px] w-[18px]" aria-hidden />}
          </Btn>
        </>
      )}
    </div>
  )
}
