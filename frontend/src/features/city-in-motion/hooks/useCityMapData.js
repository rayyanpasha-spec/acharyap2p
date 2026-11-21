// REST loading for the City in Motion page: summary, layer config, complaints (filtered server-side), vehicles, routes, bins.
// Live deltas (websocket / polling) are merged through the `live` helpers; vehicle/bin deltas are batched so React renders at most ~1x/s.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { errMsg } from '../../../lib/api'
import { useAuth } from '../../../store/auth'
import { useMeta } from '../../../store/meta'
import * as svc from '../services/cityTwinApi'
import {
  applyComplaintEvent, emptyFC, makeKeepPredicate, mergeItems, normalizeBins, normalizeComplaints,
  normalizeRoutes, normalizeVehicles,
} from '../utils/geojson'

const FLUSH_MS = 700

export function useCityMapData({ filters, includeResolved, enabled = true }) {
  const user = useAuth((s) => s.user)
  const userKey = user?.id ?? 'anon'
  const categoryName = useMeta((s) => s.categoryName)

  const [summary, setSummary] = useState(null)
  const [layersConfig, setLayersConfig] = useState(null)
  const [complaints, setComplaints] = useState(emptyFC)
  const [vehicles, setVehicles] = useState([])
  const [bins, setBins] = useState([])
  const [routes, setRoutes] = useState(emptyFC)
  const [sources, setSources] = useState({ vehicles: null, bins: null })
  const [status, setStatus] = useState({ summary: 'loading', complaints: 'loading', vehicles: 'loading', bins: 'loading', routes: 'loading' })
  const [errors, setErrors] = useState({})
  const [lastComplaintChange, setLastComplaintChange] = useState(null) // {ticket, kind, nonce}

  const filtersRef = useRef(filters)
  const includeResolvedRef = useRef(includeResolved)
  filtersRef.current = filters
  includeResolvedRef.current = includeResolved
  const bufV = useRef(new Map())
  const bufB = useRef(new Map())
  const flushTimer = useRef(null)
  const complaintReq = useRef(0)
  const summaryTimer = useRef(null)
  const aliveRef = useRef(true)

  const setStat = useCallback((key, value, err) => {
    setStatus((s) => (s[key] === value ? s : { ...s, [key]: value }))
    setErrors((e) => (err === undefined && !e[key] ? e : { ...e, [key]: err || null }))
  }, [])

  /* ---------- individual loaders ---------- */
  const loadSummary = useCallback(async () => {
    try {
      const data = await svc.getSummary()
      if (!aliveRef.current) return
      setSummary(data && typeof data === 'object' ? data : null)
      setStat('summary', 'ok', null)
    } catch (e) {
      if (!aliveRef.current) return
      setStat('summary', 'error', errMsg(e, 'Could not load the map summary.'))
    }
  }, [setStat])

  const loadComplaints = useCallback(async () => {
    const id = ++complaintReq.current
    const f = filtersRef.current
    try {
      const data = await svc.getComplaints({
        severity: f.severity, category: f.category, status: f.status, department: f.department,
        date_from: f.date_from, date_to: f.date_to,
        mine: f.mine ? true : undefined,
        include_resolved: includeResolvedRef.current ? true : undefined,
      })
      if (!aliveRef.current || id !== complaintReq.current) return
      setComplaints(normalizeComplaints(data))
      setStat('complaints', 'ok', null)
    } catch (e) {
      if (!aliveRef.current || id !== complaintReq.current) return
      setStat('complaints', 'error', errMsg(e, 'Could not load civic issues.'))
    }
  }, [setStat])

  const loadVehicles = useCallback(async () => {
    try {
      const data = await svc.getVehicles()
      if (!aliveRef.current) return
      const now = Date.now()
      setVehicles(normalizeVehicles(data).map((v) => ({ ...v, _seen: now })))
      setSources((s) => ({ ...s, vehicles: { simulated: data?.simulated, label: data?.source_label } }))
      setStat('vehicles', 'ok', null)
    } catch (e) {
      if (!aliveRef.current) return
      setStat('vehicles', 'error', errMsg(e, 'Could not load vehicles.'))
    }
  }, [setStat])

  const loadBins = useCallback(async () => {
    try {
      const data = await svc.getBins()
      if (!aliveRef.current) return
      const now = Date.now()
      setBins(normalizeBins(data).map((b) => ({ ...b, _seen: now })))
      setSources((s) => ({ ...s, bins: { simulated: data?.simulated, label: data?.source_label, thresholds: data?.thresholds } }))
      setStat('bins', 'ok', null)
    } catch (e) {
      if (!aliveRef.current) return
      setStat('bins', 'error', errMsg(e, 'Could not load bins.'))
    }
  }, [setStat])

  const loadRoutes = useCallback(async () => {
    try {
      const data = await svc.getRoutes()
      if (!aliveRef.current) return
      setRoutes(normalizeRoutes(data))
      setStat('routes', 'ok', null)
    } catch (e) {
      if (!aliveRef.current) return
      setStat('routes', 'error', errMsg(e, 'Could not load routes.'))
    }
  }, [setStat])

  const loadLayersConfig = useCallback(async () => {
    try {
      const data = await svc.getLayersConfig()
      if (aliveRef.current) setLayersConfig(data)
    } catch { /* filter options fall back to the taxonomy store */ }
  }, [])

  /* ---------- initial + identity-change load ---------- */
  useEffect(() => {
    aliveRef.current = true
    if (!enabled) return undefined
    loadSummary(); loadLayersConfig(); loadVehicles(); loadBins(); loadRoutes()
    return () => { aliveRef.current = false }
  }, [enabled, userKey, loadSummary, loadLayersConfig, loadVehicles, loadBins, loadRoutes])

  /* complaints reload when filters / resolved toggle / viewer change (debounced; the map is never rebuilt) */
  const filterKey = JSON.stringify(filters) + String(includeResolved) + userKey
  useEffect(() => {
    if (!enabled) return undefined
    const t = setTimeout(loadComplaints, 220)
    return () => clearTimeout(t)
  }, [enabled, filterKey, loadComplaints])

  /* ---------- live merge helpers ---------- */
  const flush = useCallback(() => {
    flushTimer.current = null
    if (bufV.current.size) {
      const incoming = [...bufV.current.values()]
      bufV.current.clear()
      setVehicles((prev) => mergeItems(prev, normalizeVehicles(incoming), 'vehicle_id'))
    }
    if (bufB.current.size) {
      const incoming = [...bufB.current.values()]
      bufB.current.clear()
      setBins((prev) => mergeItems(prev, normalizeBins(incoming), 'bin_id'))
    }
  }, [])
  const schedule = useCallback(() => { if (!flushTimer.current) flushTimer.current = setTimeout(flush, FLUSH_MS) }, [flush])

  const live = useMemo(() => ({
    snapshot(msg) {
      const now = Date.now()
      if (Array.isArray(msg?.vehicles)) setVehicles(normalizeVehicles(msg.vehicles).map((v) => ({ ...v, _seen: now })))
      if (Array.isArray(msg?.bins)) setBins(normalizeBins(msg.bins).map((b) => ({ ...b, _seen: now })))
      if (msg?.demo_mode != null) setSummary((s) => (s ? { ...s, demo_mode: s.demo_mode || !!msg.demo_mode } : s))
    },
    vehicle(item) { if (item?.vehicle_id != null) { bufV.current.set(String(item.vehicle_id), item); schedule() } },
    bin(item) { if (item?.bin_id != null) { bufB.current.set(String(item.bin_id), item); schedule() } },
    complaint(data, type) {
      const keep = makeKeepPredicate(filtersRef.current, includeResolvedRef.current)
      let result = null
      setComplaints((prev) => {
        const r = applyComplaintEvent(prev, data, { keep, categoryName })
        result = r
        return r.fc
      })
      // setState updaters may run lazily; derive the change marker from the event itself so it is always set.
      if (data?.ticket_id) setLastComplaintChange({ ticket: data.ticket_id, kind: type || 'complaint.status.updated', status: data.status, severity: data.severity, nonce: Date.now() })
      clearTimeout(summaryTimer.current)
      summaryTimer.current = setTimeout(() => { if (aliveRef.current) loadSummary() }, 1500)
      return result
    },
  }), [schedule, categoryName, loadSummary])

  useEffect(() => () => { clearTimeout(flushTimer.current); clearTimeout(summaryTimer.current) }, [])

  const refreshLive = useCallback(() => Promise.allSettled([loadVehicles(), loadBins()]), [loadVehicles, loadBins])
  const reload = useCallback(() => Promise.allSettled([loadSummary(), loadComplaints(), loadVehicles(), loadBins(), loadRoutes()]), [loadSummary, loadComplaints, loadVehicles, loadBins, loadRoutes])

  const initialLoading = status.complaints === 'loading' && status.vehicles === 'loading' && status.summary === 'loading'
  return {
    summary, layersConfig, complaints, vehicles, bins, routes, sources, status, errors, initialLoading,
    lastComplaintChange, live, refreshLive, reload, reloadComplaints: loadComplaints, reloadSummary: loadSummary,
  }
}

export default useCityMapData
