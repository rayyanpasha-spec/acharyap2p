import { useState } from 'react'
import { Modal, Button } from '../../components/ui'

const GOLD = '#d4a017'
const GOLD_DARK = '#a77a0c'

/** golden_tree: {unlocked, message}. Locked: only a faint hint line. Unlocked: a tree to click. */
export default function GoldenTree({ tree }) {
  const [open, setOpen] = useState(false)
  if (!tree?.unlocked) {
    return <p className="text-center text-[11px] text-muted/70">Some rewards stay hidden until a special civic challenge is complete.</p>
  }
  return (
    <>
      <style>{'@keyframes cl-sway{0%,100%{transform:rotate(-1.5deg)}50%{transform:rotate(1.5deg)}} .cl-sway{transform-origin:50% 100%;transform-box:fill-box;animation:cl-sway 4s ease-in-out infinite}'}</style>
      <div className="flex flex-col items-center gap-1">
        <button type="button" onClick={() => setOpen(true)} aria-label="Golden Tree: open your message" className="rounded-[10px] p-2 hover:bg-saffron-100">
          <svg viewBox="0 0 80 90" width="72" height="81" role="img" aria-hidden>
            <g className="cl-sway">
              <rect x="36" y="48" width="8" height="34" rx="2" fill={GOLD_DARK} />
              <circle cx="40" cy="34" r="22" fill={GOLD} />
              <circle cx="26" cy="42" r="13" fill={GOLD} />
              <circle cx="54" cy="42" r="13" fill={GOLD} />
              <circle cx="32" cy="28" r="3" fill="#f3d36b" />
              <circle cx="48" cy="38" r="3" fill="#f3d36b" />
              <circle cx="40" cy="22" r="2.5" fill="#f3d36b" />
            </g>
            <rect x="22" y="82" width="36" height="4" rx="2" fill="#7d8a5a" />
          </svg>
        </button>
        <p className="text-xs font-semibold text-saffron">Golden Tree</p>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="The Golden Tree" footer={<Button onClick={() => setOpen(false)}>Close</Button>}>
        <p className="text-base text-ink">{tree.message || 'Thank you for caring about your city.'}</p>
      </Modal>
    </>
  )
}
