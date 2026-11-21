// After a pin is placed: service-area check + reverse geocode. Both are non-blocking (failures are shown, never fatal).
import { useEffect } from 'react'
import { reverseGeocode, serviceAreaCheck } from './api'

export default function useLocationLookups(s, set) {
  const key = s.loc ? `${s.loc.lat.toFixed(5)},${s.loc.lng.toFixed(5)}` : null
  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    const { lat, lng } = s.loc
    set((cur) => ({
      geoKey: key,
      area: { status: 'loading', data: null },
      geo: { status: 'loading', data: null },
      outsideAck: false,
      locality: '',
      address: cur.addressEdited || cur.loc?.source === 'address_search' ? cur.address : '',
    }))
    const id = setTimeout(() => {
      serviceAreaCheck(lat, lng)
        .then((d) => { if (!cancelled) set((cur) => ({ area: { status: 'done', data: d }, locality: cur.locality || d?.locality || '' })) })
        .catch(() => { if (!cancelled) set({ area: { status: 'error', data: null } }) })
      reverseGeocode(lat, lng)
        .then((d) => {
          if (cancelled) return
          set((cur) => ({
            geo: { status: d?.ok ? 'done' : 'error', data: d },
            locality: d?.locality || cur.locality,
            ...(d?.ok && d.address && !cur.addressEdited && !(cur.loc?.source === 'address_search' && cur.address) ? { address: d.address } : {}),
          }))
        })
        .catch(() => { if (!cancelled) set({ geo: { status: 'error', data: null } }) })
    }, 400)
    return () => { cancelled = true; clearTimeout(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
