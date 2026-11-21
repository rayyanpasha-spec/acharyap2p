// Map + address search for choosing the issue location. The default centre is NEVER reported as a location:
// `value` stays null until the citizen clicks the map, drags the pin, or picks a search result.
// Exports:
//   LocationSearch({ onPick, className })           - debounced address search with an in-flow results list
//   LocationMap({ value, onChange, center, zoom, focus, className }) - the map; fills its parent (h-full min-h-[260px])
//   default LocationPicker(...)                      - both stacked (search above map), for simple uses
// onChange / onPick receive ({lat,lng,source:'map_pin'|'address_search', label?}). `focus` is {lat,lng,n}|null: a new `n` flies the map there.
import { useEffect, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { MapPin, Search } from 'lucide-react'
import '../../lib/leaflet'
import { TILE_ATTRIBUTION, TILE_URL, DEFAULT_CENTER, DEFAULT_ZOOM } from '../../lib/leaflet'
import { Input, Spinner, cn } from '../ui'
import { useT } from '../../lib/i18n'
import { searchLocations } from '../../features/report/api'

/** Keeps Leaflet's tile grid in sync when the container changes size (fixed-height layouts, window resize, step changes). */
function Invalidate() {
  const map = useMap()
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 200)
    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    let ro
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => map.invalidateSize())
      ro.observe(map.getContainer())
    }
    return () => { clearTimeout(id); window.removeEventListener('resize', onResize); ro?.disconnect() }
  }, [map])
  return null
}

function Fly({ focus }) {
  const map = useMap()
  useEffect(() => {
    if (focus && Number.isFinite(focus.lat) && Number.isFinite(focus.lng)) {
      map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 17), { duration: 0.8 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n])
  return null
}

function Clicks({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

export function LocationSearch({ onPick, className }) {
  const { t } = useT()
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null) // null = no search yet
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState(false)
  const ctl = useRef(null)

  // Debounced address search (350 ms), cancelling stale requests.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 3) { setResults(null); setSearching(false); setSearchErr(false); return undefined }
    setSearching(true)
    const id = setTimeout(async () => {
      ctl.current?.abort()
      const c = new AbortController()
      ctl.current = c
      try {
        const data = await searchLocations(term, c.signal)
        setResults(Array.isArray(data?.items) ? data.items : []); setSearchErr(false)
      } catch (e) {
        if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return
        setResults([]); setSearchErr(true)
      } finally {
        if (ctl.current === c) setSearching(false)
      }
    }, 350)
    return () => clearTimeout(id)
  }, [q])
  useEffect(() => () => ctl.current?.abort(), [])

  const chooseResult = (r) => {
    const lat = Number(r.lat), lng = Number(r.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    onPick({ lat, lng, source: 'address_search', label: r.label })
    setResults(null)
    setQ(r.label || '')
  }

  return (
    <div className={className}>
      <div className="relative">
        <label htmlFor="loc-search" className="sr-only">{t('report.loc.search', 'Search an address or place')}</label>
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" aria-hidden />
        <Input id="loc-search" type="search" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t('report.loc.search', 'Search an address or place')} autoComplete="off" />
      </div>
      {(searching || results) && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-[10px] border border-line-strong bg-surface text-sm">
          {searching && <Spinner className="py-3" label={t('report.loc.searching', 'Searching...')} />}
          {!searching && searchErr && <p className="px-3 py-3 text-muted">{t('report.loc.search_failed', 'Address search is unavailable right now. Tap the map to place the pin.')}</p>}
          {!searching && !searchErr && results && results.length === 0 && <p className="px-3 py-3 text-muted">{t('report.loc.no_results', 'No places found. Try another spelling or tap the map.')}</p>}
          {!searching && results && results.map((r, i) => (
            <button key={`${r.lat}-${r.lng}-${i}`} type="button" onClick={() => chooseResult(r)}
              className="flex min-h-10 w-full items-start gap-2 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-forest-50">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
              <span className="min-w-0">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function LocationMap({ value, onChange, center, zoom, focus, className }) {
  const { t } = useT()
  const c = Array.isArray(center) && center.length === 2 ? center : DEFAULT_CENTER
  const z = zoom || DEFAULT_ZOOM
  const pick = (lat, lng) => onChange({ lat, lng, source: 'map_pin' })
  return (
    <div className={cn('relative h-full min-h-[260px] overflow-hidden rounded-[10px] border border-line-strong', className)}>
      <MapContainer center={c} zoom={z} scrollWheelZoom className="h-full w-full" attributionControl>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
        <Invalidate />
        <Fly focus={focus || null} />
        <Clicks onPick={pick} />
        {value && Number.isFinite(value.lat) && Number.isFinite(value.lng) && (
          <Marker position={[value.lat, value.lng]} draggable
            eventHandlers={{ dragend: (e) => { const p = e.target.getLatLng(); pick(p.lat, p.lng) } }} />
        )}
      </MapContainer>
      <p className="pointer-events-none absolute bottom-6 left-3 z-[500] max-w-[70%] rounded-lg border border-line-strong bg-surface px-2.5 py-1 text-xs text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
        {t('report.loc.map_hint', 'Tap the map or drag the pin to the exact spot of the issue.')}
      </p>
    </div>
  )
}

export default function LocationPicker({ value, onChange, center, zoom, focus, className }) {
  const [flyTo, setFlyTo] = useState(null)
  const merged = [focus, flyTo].filter(Boolean).sort((a, b) => b.n - a.n)[0] || null
  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      <LocationSearch onPick={(p) => { onChange(p); setFlyTo({ lat: p.lat, lng: p.lng, n: Date.now() }) }} />
      <div className="h-72 sm:h-80"><LocationMap value={value} onChange={onChange} center={center} zoom={zoom} focus={merged} /></div>
    </div>
  )
}
