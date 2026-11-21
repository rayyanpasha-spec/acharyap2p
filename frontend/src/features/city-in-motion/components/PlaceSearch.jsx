// Locality search via the existing GET /locations/search. That endpoint requires sign-in, so anonymous viewers see why it is unavailable.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, MapPin, Search } from 'lucide-react'
import { Input } from '../../../components/ui'
import { searchPlaces } from '../services/cityTwinApi'

export default function PlaceSearch({ signedIn, onPick }) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const [searched, setSearched] = useState(false)
  const reqRef = useRef(0)

  useEffect(() => {
    if (!signedIn) return undefined
    const term = q.trim()
    if (term.length < 3) { setItems([]); setSearched(false); return undefined }
    const id = ++reqRef.current
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        const data = await searchPlaces(term)
        if (id === reqRef.current) { setItems(Array.isArray(data?.items) ? data.items : []); setSearched(true) }
      } catch {
        if (id === reqRef.current) { setItems([]); setSearched(true) }
      } finally {
        if (id === reqRef.current) setBusy(false)
      }
    }, 450)
    return () => clearTimeout(t)
  }, [q, signedIn])

  if (!signedIn) {
    return (
      <p className="rounded-lg border border-dashed border-line-strong bg-paper px-3 py-2 text-[13px] text-muted">
        Place search is available to signed-in users. <Link to="/login" className="font-semibold text-civic hover:underline">Sign in</Link> to search localities.
      </p>
    )
  }
  return (
    <div className="relative">
      <label htmlFor="cm-place" className="sr-only">Search a locality in Bengaluru</label>
      <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" aria-hidden />
      <Input id="cm-place" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a locality" className="h-10 pl-9 text-[13px]" autoComplete="off" />
      {busy && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted" aria-hidden />}
      {(items.length > 0 || (searched && !busy && q.trim().length >= 3)) && (
        <ul role="listbox" aria-label="Place results" className="absolute inset-x-0 top-11 z-20 max-h-56 overflow-y-auto rounded-[10px] border border-line-strong bg-surface">
          {items.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">No matching places found.</li>}
          {items.map((it, i) => (
            <li key={`${it.lat},${it.lng},${i}`} role="option" aria-selected="false">
              <button
                type="button"
                onClick={() => { onPick({ lat: Number(it.lat), lng: Number(it.lng), label: it.label }); setItems([]); setSearched(false); setQ(it.label || q) }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-paper"
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                <span className="line-clamp-2">{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
