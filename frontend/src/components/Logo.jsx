// CivicLens mark: magnifier over a small city skyline. Forest + saffron, flat colours (no gradients).
import { cn } from './ui'

export function LogoMark({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="CivicLens logo" fill="none">
      <rect x="1" y="1" width="38" height="38" rx="9" fill="#244c39" />
      {/* skyline */}
      <path d="M8 29V21h4v8M13 29V16h5v13M19 29V19h4v10M24 29V23h4v6" fill="#e3ede6" />
      <rect x="6" y="29" width="22" height="1.6" rx=".8" fill="#e3ede6" />
      {/* magnifier */}
      <circle cx="24" cy="15" r="6.5" fill="none" stroke="#c1782e" strokeWidth="2.6" />
      <path d="M28.8 19.8 34 25" stroke="#c1782e" strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="15" r="1.8" fill="#f8ecdc" />
    </svg>
  )
}

export default function Logo({ className, compact, light }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      {!compact && (
        <span className={cn('font-display text-lg font-extrabold tracking-tight', light ? 'text-white' : 'text-forest')}>
          Civic<span className="text-saffron">Lens</span>
        </span>
      )}
    </span>
  )
}
