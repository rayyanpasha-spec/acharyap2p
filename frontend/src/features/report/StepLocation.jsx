import { useEffect, useRef, useState } from 'react'
import { Crosshair, Check, Info } from 'lucide-react'
import { Badge, Button, Field, Input, Spinner } from '../../components/ui'
import { LocationMap, LocationSearch } from '../../components/maps/LocationPicker'
import { useT } from '../../lib/i18n'
import { fill } from './api'
import { Callout, StepHead } from './parts'

const GPS_ERR = {
  1: ['report.loc.denied', 'Location permission was denied. To use it, allow location for this site in your browser settings. You can also choose the spot on the map below.'],
  2: ['report.loc.unavailable', 'Your location is not available right now. Search for an address or place the pin on the map.'],
  3: ['report.loc.timeout', 'Finding your location took too long. Try again, or search for an address or place the pin on the map.'],
}

export default function StepLocation({ s, set, meta, title }) {
  const { t } = useT()
  const [gps, setGps] = useState({ state: 'idle', msg: '' })
  const mounted = useRef(true)
  const mapRef = useRef(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const getGps = () => {
    if (!navigator.geolocation) { setGps({ state: 'error', msg: t('report.loc.nogeo', 'This browser cannot find your location. Search for an address or place the pin on the map.') }); return }
    setGps({ state: 'locating', msg: '' })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mounted.current) return
        const { latitude: lat, longitude: lng, accuracy } = pos.coords
        setGps({ state: 'idle', msg: '' })
        set({
          loc: { lat, lng, source: 'gps', accuracy: Number.isFinite(accuracy) ? accuracy : null, capturedAt: new Date(pos.timestamp || Date.now()).toISOString(), confirmed: false },
          focus: { lat, lng, n: Date.now() },
        })
      },
      (err) => {
        if (!mounted.current) return
        const [k, d] = GPS_ERR[err?.code] || GPS_ERR[2]
        setGps({ state: 'error', msg: t(k, d) })
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  const onPick = ({ lat, lng, source, label }) => {
    set(() => ({
      loc: { lat, lng, source, accuracy: null, capturedAt: new Date().toISOString(), confirmed: source === 'map_pin' },
      ...(source === 'address_search' && label ? { address: label } : {}),
      ...(source === 'address_search' ? { focus: { lat, lng, n: Date.now() } } : {}),
    }))
  }

  const loc = s.loc
  const area = s.area.data
  const outside = area && (area.service_area_status === 'outside_service_area' || area.inside_service_area === false)
  const officialBoundaries = area?.boundary_source === 'official_import'
  const poorAccuracy = loc?.source === 'gps' && loc.accuracy != null && loc.accuracy > 100

  // On phones the map sits below the controls: bring it into view. On desktop everything is already visible (never scroll the fixed shell).
  const adjustPin = () => {
    if (window.matchMedia?.('(max-width: 1023px)').matches) mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const srcLabel = loc && { gps: t('report.loc.src_gps', 'From GPS'), map_pin: t('report.loc.src_pin', 'Map pin'), address_search: t('report.loc.src_search', 'Address search') }[loc.source]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StepHead title={title}
        right={loc ? <Badge tone={loc.confirmed ? 'success' : 'saffron'} dot>{loc.confirmed ? t('report.loc.confirmed', 'Location confirmed') : t('report.loc.unconfirmed', 'Please confirm this location')}</Badge> : null} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        {/* LEFT: why, GPS, search, details (scrolls inside on desktop) */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1">
          <Callout tone="civic" title={t('report.loc.why_title', 'Why we ask for the location')}>
            <p>{t('report.loc.consent', 'CivicLens uses the location of the issue to find nearby reports and send it to the correct municipal team. Your precise location is not shown publicly.')}</p>
            <p className="mt-1 flex items-start gap-1.5 text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-civic" aria-hidden />
              {t('report.loc.differ', 'The issue location may be different from where you are now - move the pin if needed.')}
            </p>
          </Callout>

          <Button size="lg" onClick={getGps} loading={gps.state === 'locating'} className="w-full shrink-0">
            <Crosshair className="h-5 w-5" aria-hidden /> {gps.state === 'locating' ? t('report.loc.locating', 'Finding your location...') : t('report.loc.use_current', 'Use my current location')}
          </Button>
          {gps.state === 'error' && <Callout tone="warning" role="alert">{gps.msg}</Callout>}

          <LocationSearch onPick={onPick} />

          {!loc && <p className="text-[13px] font-medium text-saffron">{t('report.loc.pin_needed', 'Place a pin on the map to continue.')}</p>}

          {loc && (
            <div className="space-y-3 rounded-[14px] border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="civic">{srcLabel}</Badge>
                <span className="font-mono text-xs text-muted">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</span>
              </div>

              {loc.source === 'gps' && loc.accuracy != null && (
                <p className={`text-[13px] ${poorAccuracy ? 'font-semibold text-high' : 'text-muted'}`}>
                  {fill(t('report.loc.accuracy', 'GPS accuracy: about {m} m.'), { m: Math.round(loc.accuracy) })}
                  {poorAccuracy && ` ${t('report.loc.accuracy_poor', 'This is not very accurate. Please check the pin and move it to the exact spot if needed.')}`}
                </p>
              )}
              {loc.prefilled && !loc.confirmed && <p className="text-[13px] text-muted">{t('report.loc.prefilled', 'The pin was placed for you from the previous screen. Check it, move it if needed, then confirm.')}</p>}

              {!loc.confirmed && (
                <Button className="w-full" onClick={() => set((cur) => ({ loc: { ...cur.loc, confirmed: true } }))}><Check className="h-4 w-4" aria-hidden /> {t('report.loc.confirm', 'Confirm this location')}</Button>
              )}

              {/* service area */}
              {s.area.status === 'loading' && <Spinner className="justify-start py-1" label={t('report.loc.checking', 'Checking the service area...')} />}
              {s.area.status === 'error' && <p className="text-[13px] text-muted">{t('report.loc.area_failed', 'The service area could not be checked just now. You can still continue.')}</p>}
              {area && !outside && (
                <Callout tone="forest" title={area.locality ? `${t('report.loc.area_in', 'Inside the Greater Bengaluru service area')} - ${area.locality}` : t('report.loc.area_in', 'Inside the Greater Bengaluru service area')}>
                  {officialBoundaries && (area.city_corporation_code || area.ward_code)
                    ? <p>{[area.city_corporation_code && `${t('report.loc.corp', 'Corporation')}: ${area.city_corporation_code}`, area.division_code && `${t('report.loc.zone', 'Zone')}: ${area.division_code}`, area.ward_code && `${t('report.loc.ward', 'Ward')}: ${area.ward_code}`].filter(Boolean).join(' - ')}</p>
                    : <p>{t('report.loc.boundary_missing', 'Official ward boundaries are not loaded yet - the corporation and ward will be assigned by an officer.')}</p>}
                  {area.notice && <p className="mt-1 text-xs text-muted">{area.notice}</p>}
                </Callout>
              )}
              {area && outside && (
                <Callout tone="warning" title={t('report.loc.area_out', 'This location looks outside the Greater Bengaluru service area')}>
                  <p>{t('report.loc.area_out_body', 'CivicLens cannot be sure the right municipal team covers this spot. If the pin is wrong, adjust it.')}</p>
                  {area.notice && <p className="mt-1 text-xs text-muted">{area.notice}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Button size="sm" variant="secondary" onClick={adjustPin}>{t('report.loc.adjust', 'Adjust the pin')}</Button>
                    <label className="flex min-h-10 items-center gap-2 text-[13px]">
                      <input type="checkbox" className="h-5 w-5 accent-forest" checked={s.outsideAck} onChange={(e) => set({ outsideAck: e.target.checked })} />
                      {t('report.loc.out_ack', 'The pin is correct - continue anyway')}
                    </label>
                  </div>
                </Callout>
              )}

              {s.geo.status === 'error' && <p className="text-xs text-muted">{t('report.loc.geo_failed', 'We could not look up the street address. Type it below or add a landmark.')}</p>}

              <Field label={t('report.loc.address', 'Address (optional)')} htmlFor="rep-addr" hint={s.locality ? `${t('report.loc.locality', 'Locality')}: ${s.locality}` : undefined}>
                <Input id="rep-addr" value={s.address} maxLength={300} onChange={(e) => set({ address: e.target.value, addressEdited: true })}
                  placeholder={t('report.loc.address_ph', 'Street, area, PIN code')} />
              </Field>
              <Field label={t('report.loc.landmark', 'Nearby landmark (optional)')} htmlFor="rep-landmark">
                <Input id="rep-landmark" value={s.landmark} maxLength={120} onChange={(e) => set({ landmark: e.target.value })}
                  placeholder={t('report.loc.landmark_ph', 'For example: opposite the bus stop')} />
              </Field>
            </div>
          )}
        </div>

        {/* RIGHT: the map fills the whole body height */}
        <div ref={mapRef} className="h-80 min-h-0 lg:h-full">
          <LocationMap value={loc} onChange={onPick} center={meta?.map?.center} zoom={meta?.map?.zoom} focus={s.focus} />
        </div>
      </div>
    </div>
  )
}
