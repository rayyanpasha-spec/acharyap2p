// Growing City: a flat, solid-colour neighbourhood scene that gains one element per verified contribution.
// It represents community participation, not literal municipal construction.
import { Link } from 'react-router-dom'
import { Sprout } from 'lucide-react'
import { EmptyState, Panel } from '../../components/ui'
import { titleCase } from '../../lib/format'

const C = {
  sky: '#eaf1f6', ground: '#d9e8d3', road: '#5d645c', dash: '#f3f1e6', house1: '#e7d3b0', house2: '#cfdbe8', house3: '#e8c9bd',
  roof: '#8a6d5a', win: '#ffffff', trunk: '#7a5a3a', leaf: '#397a56', leaf2: '#4f8f5a', park: '#7fb383', bench: '#a3702e',
  pole: '#4a504a', lamp: '#f2c14e', bin: '#2a7f86', binDark: '#1f666c', sign: '#ffffff',
}

// slot centres: back row (above the road) and front row (below it)
const MAX_SLOTS = 16
const slotPos = (i) => {
  const row = i % 2 // alternate rows
  const col = Math.floor(i / 2) // 0..7
  return { x: 34 + col * 56 + (row ? 28 : 0), base: row ? 206 : 144, row }
}

function House({ x, base, fill }) {
  return (
    <g>
      <rect x={x} y={base - 34} width="44" height="34" fill={fill} />
      <polygon points={`${x - 4},${base - 34} ${x + 22},${base - 54} ${x + 48},${base - 34}`} fill={C.roof} />
      <rect x={x + 8} y={base - 24} width="9" height="9" fill={C.win} />
      <rect x={x + 27} y={base - 24} width="9" height="9" fill={C.win} />
    </g>
  )
}

function Element({ type, x, base, idx }) {
  const anim = { animation: 'cl-grow .6s ease-out both', animationDelay: `${Math.min(idx, 10) * 60}ms`, transformBox: 'fill-box', transformOrigin: '50% 100%' }
  switch (type) {
    case 'park':
      return (
        <g style={anim}>
          <rect x={x - 22} y={base - 10} width="44" height="12" rx="4" fill={C.park} />
          <rect x={x - 16} y={base - 24} width="3" height="14" fill={C.trunk} /><circle cx={x - 14.5} cy={base - 28} r="8" fill={C.leaf2} />
          <rect x={x + 10} y={base - 20} width="3" height="10" fill={C.trunk} /><circle cx={x + 11.5} cy={base - 24} r="6.5" fill={C.leaf} />
          <rect x={x - 6} y={base - 8} width="14" height="3" fill={C.bench} />
        </g>
      )
    case 'road':
      // a refreshed patch of the road band (road occupies y 150-176)
      return (
        <g style={{ ...anim, transformOrigin: '50% 50%' }}>
          <rect x={x - 24} y={150} width="48" height="26" fill="#3f453f" />
          <rect x={x - 16} y={162} width="12" height="3" fill={C.dash} />
          <rect x={x + 4} y={162} width="12" height="3" fill={C.dash} />
        </g>
      )
    case 'streetlight':
      return (
        <g style={anim}>
          <rect x={x - 1.5} y={base - 42} width="3" height="42" fill={C.pole} />
          <rect x={x - 1.5} y={base - 42} width="14" height="3" fill={C.pole} />
          <circle cx={x + 11} cy={base - 36} r="5" fill={C.lamp} />
        </g>
      )
    case 'recycling':
      return (
        <g style={anim}>
          <rect x={x - 13} y={base - 24} width="26" height="24" rx="2" fill={C.bin} />
          <rect x={x - 15} y={base - 28} width="30" height="6" rx="2" fill={C.binDark} />
          <polygon points={`${x},${base - 20} ${x + 6},${base - 9} ${x - 6},${base - 9}`} fill={C.sign} />
        </g>
      )
    case 'tree':
    default:
      return (
        <g style={anim}>
          <rect x={x - 2.5} y={base - 22} width="5" height="22" fill={C.trunk} />
          <circle cx={x} cy={base - 30} r="14" fill={C.leaf} />
          <circle cx={x - 7} cy={base - 24} r="8" fill={C.leaf2} />
        </g>
      )
  }
}

export default function GrowingCity({ items, className }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : []
  const shown = list.slice(0, MAX_SLOTS)
  const extra = list.length - shown.length

  return (
    <Panel title="Growing City" subtitle="Grows with each verified contribution" icon={Sprout} tone="forest" scroll={list.length === 0} className={className} bodyClassName="flex flex-col gap-2 p-3">
      {list.length === 0 ? (
        <EmptyState
          icon={Sprout}
          title="Your city is waiting to grow"
          hint="When an authorised officer verifies a resolution that began with your report, a tree, park, road, streetlight or recycling station appears here."
        />
      ) : (
        <>
          <style>{'@keyframes cl-grow{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}'}</style>
          <div className="aspect-[480/220] min-h-0 lg:aspect-auto lg:min-h-[120px] lg:flex-1">
            <svg viewBox="0 0 480 220" preserveAspectRatio="xMidYMid meet" className="h-full w-full rounded-[10px] border border-line" role="img" aria-label={`Growing City scene with ${list.length} element${list.length === 1 ? '' : 's'}, one for each verified contribution`}>
              <rect width="480" height="220" fill={C.sky} />
              <rect y="96" width="480" height="124" fill={C.ground} />
              <House x={40} base={110} fill={C.house1} />
              <House x={200} base={110} fill={C.house2} />
              <House x={360} base={110} fill={C.house3} />
              <rect y="150" width="480" height="26" fill={C.road} />
              <g fill={C.dash}>
                {Array.from({ length: 12 }, (_, k) => <rect key={k} x={10 + k * 40} y="162" width="20" height="3" />)}
              </g>
              {shown.map((it, i) => {
                const p = slotPos(i)
                return <Element key={`${it.ticket_number || 'x'}-${i}`} type={it.type} x={p.x} base={p.base} idx={i} />
              })}
            </svg>
          </div>
          <p className="shrink-0 text-[11px] text-muted">
            Growing City represents community participation, not literal municipal construction.
            {extra > 0 && ` Showing the first ${MAX_SLOTS} of ${list.length} elements.`}
          </p>
          <ul className="flex max-h-[4.25rem] shrink-0 flex-wrap gap-1.5 overflow-y-auto">
            {list.map((it, i) => (
              <li key={`${it.ticket_number || 'x'}-${i}`} className="rounded-md border border-line bg-paper px-2 py-0.5 text-xs text-ink">
                {it.label || titleCase(it.type || 'tree')}
                {it.ticket_number && <> &middot; <Link to={`/app/complaints/${it.ticket_number}`} className="font-semibold text-civic hover:underline">{it.ticket_number}</Link></>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}
