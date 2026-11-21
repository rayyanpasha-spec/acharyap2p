// Live CleanRoute data: initial REST load, then WebSocket (snapshot + tick) with auto-reconnect,
// stale detection (> 20 s without a tick) and a 5 s REST polling fallback while the socket is down.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, errMsg, WS_BASE } from '../../lib/api'
import { parseDate } from '../../lib/format'
import { asList, binState } from './shared'

const STALE_MS = 20000
const POLL_MS = 5000
const MAX_BACKOFF_MS = 15000

function mergeById(prev, incoming, replace = false) {
  const next = replace ? {} : { ...prev }
  for (const it of incoming) {
    if (it == null || it.id == null) continue
    next[it.id] = { ...prev[it.id], ...it }
  }
  return next
}

export function useGarbageLive({ enabled = true } = {}) {
  const [vehicles, setVehicles] = useState({})
  const [bins, setBins] = useState({})
  const [routes, setRoutes] = useState([])
  const [restSummary, setRestSummary] = useState(null)
  const [thresholds, setThresholds] = useState(null)
  const [sourceLabel, setSourceLabel] = useState('DEMO / SIMULATED GPS')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [conn, setConn] = useState('reconnecting') // live | reconnecting | offline
  const [polling, setPolling] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null) // ms
  const [stale, setStale] = useState(false)
  const [events, setEvents] = useState([])
  const [collectionsSinceLoad, setCollectionsSinceLoad] = useState(0)

  const lastTickRef = useRef(0)
  const refreshRef = useRef(null)

  useEffect(() => {
    if (!enabled) return undefined
    let disposed = false
    let ws = null
    let retryTimer = null
    let pollTimer = null
    let attempts = 0
    let gotSnapshot = false

    const markTick = (iso) => {
      const now = Date.now()
      lastTickRef.current = now
      setStale(false)
      const srv = iso ? parseDate(iso) : null
      setLastUpdated(srv ? srv.getTime() : now)
    }

    const loadRest = async ({ withRoutes }) => {
      const calls = [api.get('/garbage/vehicles'), api.get('/garbage/bins'), api.get('/garbage/summary')]
      if (withRoutes) calls.push(api.get('/garbage/routes'))
      const res = await Promise.allSettled(calls)
      if (disposed) return false
      const [v, b, s, r] = res
      if (v.status === 'rejected' && b.status === 'rejected') {
        setError(errMsg(v.reason, 'Could not load CleanRoute data.'))
        return false
      }
      setError(null)
      if (!gotSnapshot || !withRoutes) {
        if (v.status === 'fulfilled') {
          setVehicles((p) => mergeById(p, asList(v.value.data), true))
          if (v.value.data?.source_label) setSourceLabel(v.value.data.source_label)
        }
        if (b.status === 'fulfilled') {
          setBins((p) => mergeById(p, asList(b.value.data), true))
          if (b.value.data?.thresholds) setThresholds(b.value.data.thresholds)
        }
      }
      if (s.status === 'fulfilled') { setRestSummary(s.value.data); setCollectionsSinceLoad(0) }
      if (r && r.status === 'fulfilled') setRoutes(asList(r.value.data))
      markTick(v.status === 'fulfilled' ? v.value.data?.updated_at : null)
      return true
    }

    const stopPolling = () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
      setPolling(false)
    }
    const startPolling = () => {
      if (pollTimer || disposed) return
      setPolling(true)
      pollTimer = setInterval(() => { loadRest({ withRoutes: false }) }, POLL_MS)
      loadRest({ withRoutes: false })
    }

    const handle = (m) => {
      if (!m || typeof m !== 'object') return
      if (m.source_label) setSourceLabel(m.source_label)
      if (m.type === 'snapshot') {
        gotSnapshot = true
        if (Array.isArray(m.vehicles)) setVehicles((p) => mergeById(p, m.vehicles, true))
        if (Array.isArray(m.bins)) setBins((p) => mergeById(p, m.bins, true))
        markTick(m.ts)
      } else if (m.type === 'tick') {
        if (Array.isArray(m.vehicles) && m.vehicles.length) setVehicles((p) => mergeById(p, m.vehicles))
        if (Array.isArray(m.bins) && m.bins.length) setBins((p) => mergeById(p, m.bins))
        if (Array.isArray(m.events) && m.events.length) {
          const stamped = m.events.map((e) => ({ ...e, ts: m.ts || new Date().toISOString() }))
          setEvents((p) => [...stamped, ...p].slice(0, 20))
          setCollectionsSinceLoad((n) => n + m.events.filter((e) => e.type === 'collection').length)
        }
        markTick(m.ts)
      }
    }

    const scheduleRetry = () => {
      if (disposed || retryTimer) return
      const delay = Math.min(1000 * 2 ** Math.min(attempts, 5), MAX_BACKOFF_MS)
      retryTimer = setTimeout(() => { retryTimer = null; connect() }, delay)
    }

    function connect() {
      if (disposed) return
      let opened = false
      let sock
      try {
        sock = new WebSocket(`${WS_BASE}/ws/v1/garbage/live`)
      } catch {
        attempts += 1
        setConn('offline')
        startPolling()
        scheduleRetry()
        return
      }
      ws = sock
      sock.onopen = () => {
        opened = true
        attempts = 0
        stopPolling()
        setConn('live')
      }
      sock.onmessage = (ev) => {
        let m
        try { m = JSON.parse(ev.data) } catch { return }
        handle(m)
      }
      sock.onerror = () => { /* onclose follows */ }
      sock.onclose = () => {
        if (ws === sock) ws = null
        if (disposed) return
        attempts += 1
        if (opened) { setConn('reconnecting') } else { setConn(attempts >= 2 ? 'offline' : 'reconnecting') }
        if (attempts >= 2 || !opened) startPolling()
        scheduleRetry()
      }
    }

    refreshRef.current = () => loadRest({ withRoutes: true })
    loadRest({ withRoutes: true }).finally(() => { if (!disposed) setLoading(false) })
    connect()

    const staleTimer = setInterval(() => {
      if (lastTickRef.current > 0) setStale(Date.now() - lastTickRef.current > STALE_MS)
    }, 2000)

    return () => {
      disposed = true
      clearInterval(staleTimer)
      if (retryTimer) clearTimeout(retryTimer)
      if (pollTimer) clearInterval(pollTimer)
      if (ws) {
        ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null
        try { ws.close() } catch { /* ignore */ }
      }
      refreshRef.current = null
    }
  }, [enabled])

  const refresh = useCallback(() => (refreshRef.current ? refreshRef.current() : Promise.resolve(false)), [])

  const vehicleList = useMemo(() => Object.values(vehicles).sort((a, b) => String(a.code).localeCompare(String(b.code))), [vehicles])
  const binList = useMemo(() => Object.values(bins), [bins])

  const summary = useMemo(() => {
    const base = restSummary || {}
    const hasBins = binList.length > 0
    return {
      vehicles_active: vehicleList.length ? vehicleList.filter((v) => v.status !== 'offline' && v.status !== 'idle').length : base.vehicles_active ?? 0,
      bins_total: hasBins ? binList.length : base.bins_total ?? 0,
      bins_overflow_risk: hasBins ? binList.filter((b) => binState(b) === 'overflow_risk').length : base.bins_overflow_risk ?? 0,
      bins_collection_recommended: hasBins ? binList.filter((b) => binState(b) === 'collection_recommended').length : base.bins_collection_recommended ?? 0,
      collections_today: (base.collections_today ?? 0) + collectionsSinceLoad,
      last_updated: base.last_updated || null,
    }
  }, [restSummary, vehicleList, binList, collectionsSinceLoad])

  return {
    vehicles: vehicles, bins, vehicleList, binList, routes, summary, thresholds, sourceLabel,
    loading, error, conn, polling, lastUpdated, stale, events, refresh,
  }
}

export default useGarbageLive
