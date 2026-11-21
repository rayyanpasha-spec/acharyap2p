import { useEffect, useRef, useState } from 'react'
import { Crosshair, Map as MapIcon, Check, Info } from 'lucide-react'
import { Badge, Button, Card, CardBody, Field, Input, Notice, Spinner } from '../../components/ui'
import LocationPicker from '../../components/maps/LocationPicker'
import { useT } from '../../lib/i18n'
import { fill } from './api'

const GPS_ERR = {
  1: ['report.loc.denied', 'Location permission was denied. To use it, allow location for this site in your browser settings. You can also choose the spot on the map below.'],
  2: ['report.loc.unavailable', 'Your location is not available right now. Search for an address or place the pin on the map.'],
  3: ['report.loc.timeout', 'Finding your location took too long. Try again, or search for an address or place the pin on the map.'],
}

export default function StepLocation({ s, set, meta }) {
  const { t } = useT()
  const [showMap, setShowMap] = useState(!!s.loc)
  const [gps, setGps] = useState({ state: 'idle', msg: '' })
  const mounted = useRef(true)
  const mapRef = useRef(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const getGps = () => {
    setShowMap(true)
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
    set((cur) => ({
      loc: { lat, lng, source, accuracy: null, capturedAt: new Date().toISOString(), confirmed: source === 'map_pin' },
      ...(source === 'address_search' && label ? { address: label } : {}),
    }))
  }

  const loc = s.loc
  const area = s.area.data
  const outside = area && (area.service_area_status === 'outside_service_area' || area.inside_service_area === false)
  const officialBoundaries = area?.boundary_source === 'official_import'
  const poorAccuracy = loc?.source === 'gps' && loc.accuracy != null && loc.accuracy > 100

  const adjustPin = () => { setShowMap(true); mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }

  return (
    <div className="space-y-4">
      <Notice tone="civic" title={t('report.loc.why_title', 'Why we ask for the location')}>
        {t('report.loc.consent', 'CivicLens uses the location of the issue to find nearby reports and send it to the correct municipal team. Your precise location is not shown publicly.')}
      </Notice>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button size="lg" onClick={getGps} loading={gps.state === 'locating'} className="w-full">
          <Crosshair className="h-5 w-5" aria-hidden /> {gps.state === 'locating' ? t('report.loc.locating', 'Finding your location...') : t('report.loc.use_current', 'Use my current location')}
        </Button>
        <Button size="lg" variant="secondary" onClick={() => setShowMap(true)} className="w-full">
          <MapIcon className="h-5 w-5" aria-hidden /> {t('report.loc.choose_map', 'Choose on map')}
        </Button>
      </div>

      {gps.state === 'error' && <Notice tone="warning">{gps.msg}</Notice>}

      <p className="flex items-start gap-2 text-sm text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-civic" aria-hidden />
        {t('report.loc.differ', 'The issue location may be different from where you are now - move the pin if needed.')}
      </p>

      {showMap && (
        <div ref={mapRef}>
          <LocationPicker value={loc} onChange={onPick} center={meta?.map?.center} zoom={meta?.map?.zoom} focus={s.focus} />
        </div>
      )}

      {!loc && showMap && <p className="text-sm font-medium text-saffron">{t('report.loc.pin_needed', 'Place a pin on the map to continue.')}</p>}

      {loc && (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={loc.confirmed ? 'success' : 'saffron'} dot>{loc.confirmed ? t('report.loc.confirmed', 'Location confirmed') : t('report.loc.unconfirmed', 'Please confirm this location')}</Badge>
              <Badge tone="civic">{{ gps: t('report.loc.src_gps', 'From GPS'), map_pin: t('report.loc.src_pin', 'Map pin'), address_search: t('report.loc.src_search', 'Address search') }[loc.source]}</Badge>
              <span className="text-xs text-muted">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</span>
            </div>

            {loc.source === 'gps' && loc.accuracy != null && (
              <p className={`text-sm ${poorAccuracy ? 'font-semibold text-high' : 'text-muted'}`}>
                {fill(t('report.loc.accuracy', 'GPS accuracy: about {m} m.'), { m: Math.round(loc.accuracy) })}
                {poorAccuracy && ` ${t('report.loc.accuracy_poor', 'This is not very accurate. Please check the pin and move it to the exact spot if needed.')}`}
              </p>
            )}
            {loc.prefilled && !loc.confirmed && <p className="text-sm text-muted">{t('report.loc.prefilled', 'The pin was placed for you from the previous screen. Check it, move it if needed, then confirm.')}</p>}

            {!loc.confirmed && (
              <Button onClick={() => set((cur) => ({ loc: { ...cur.loc, confirmed: true } }))}><Check className="h-4 w-4" aria-hidden /> {t('report.loc.confirm', 'Confirm this location')}</Button>
            )}

            {/* service area */}
            {s.area.status === 'loading' && <Spinner className="justify-start py-1" label={t('report.loc.checking', 'Checking the service area...')} />}
            {s.area.status === 'error' && <p className="text-sm text-muted">{t('report.loc.area_failed', 'The service area could not be checked just now. You can still continue.')}</p>}
            {area && !outside && (
              <Notice tone="forest" title={area.locality ? `${t('report.loc.area_in', 'Inside the Greater Bengaluru service area')} - ${area.locality}` : t('report.loc.area_in', 'Inside the Greater Bengaluru service area')}>
                {officialBoundaries && (area.city_corporation_code || area.ward_code)
                  ? <p>{[area.city_corporation_code && `${t('report.loc.corp', 'Corporation')}: ${area.city_corporation_code}`, area.division_code && `${t('report.loc.zone', 'Zone')}: ${area.division_code}`, area.ward_code && `${t('report.loc.ward', 'Ward')}: ${area.ward_code}`].filter(Boolean).join(' - ')}</p>
                  : <p>{t('report.loc.boundary_missing', 'Official ward boundaries are not loaded yet - the corporation and ward will be assigned by an officer.')}</p>}
                {area.notice && <p className="mt-1 text-xs text-muted">{area.notice}</p>}
              </Notice>
            )}
            {area && outside && (
              <Notice tone="warning" title={t('report.loc.area_out', 'This location looks outside the Greater Bengaluru service area')}>
                <p>{t('report.loc.area_out_body', 'CivicLens cannot be sure the right municipal team covers this spot. If the pin is wrong, adjust it.')}</p>
                {area.notice && <p className="mt-1 text-xs text-muted">{area.notice}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button size="sm" variant="secondary" onClick={adjustPin}>{t('report.loc.adjust', 'Adjust the pin')}</Button>
                  <label className="flex min-h-10 items-center gap-2 text-sm">
                    <input type="checkbox" className="h-5 w-5 accent-forest" checked={s.outsideAck} onChange={(e) => set({ outsideAck: e.target.checked })} />
                    {t('report.loc.out_ack', 'The pin is correct - continue anyway')}
                  </label>
                </div>
              </Notice>
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
          </CardBody>
        </Card>
      )}
    </div>
  )
}
