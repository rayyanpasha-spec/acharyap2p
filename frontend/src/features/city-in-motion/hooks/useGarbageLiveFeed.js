// WebSocket live feed (snapshot + deltas) with exponential-backoff reconnect and a 5 s REST polling fallback while the socket is down.
// Handlers are read through a ref so the socket is never re-opened when callbacks change.
import { useEffect, useRef, useState } from 'react'
import { WS_BASE } from '../../../lib/api'
import { POLL_MS } from '../utils/mapConfig'

const MAX_BACKOFF_MS = 15000
const PING_MS = 25000

/**
 * handlers: { snapshot(msg), vehicle(item), bin(item), complaint(data, type), poll() }
 * returns { state: 'connecting' | 'live' | 'paused', polling: boolean, lastMessageAt }
 */
export function useGarbageLiveFeed({ enabled = true, handlers }) {
  const [state, setState] = useState('connecting')
  const [lastMessageAt, setLastMessageAt] = useState(null)
  const hRef = useRef(handlers)
  hRef.current = handlers

  useEffect(() => {
    if (!enabled) return undefined
    let disposed = false
    let ws = null
    let retry = null
    let pollTimer = null
    let pingTimer = null
    let attempts = 0

    const stopPolling = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }
    const startPolling = () => {
      if (pollTimer || disposed) return
      const tick = () => { if (!document.hidden) hRef.current?.poll?.() }
      tick()
      pollTimer = setInterval(tick, POLL_MS)
    }

    const onMessage = (ev) => {
      if (typeof ev.data !== 'string') return
      let m
      try { m = JSON.parse(ev.data) } catch { return } // plain "pong"
      if (!m || typeof m !== 'object') return
      const h = hRef.current || {}
      setLastMessageAt(Date.now())
      switch (m.type) {
        case 'snapshot': h.snapshot?.(m); break
        case 'vehicle.position.updated': h.vehicle?.(m.data); break
        case 'bin.fill.updated': h.bin?.(m.data); break
        case 'complaint.status.updated':
        case 'complaint.created': h.complaint?.(m.data, m.type); break
        default: break
      }
    }

    const scheduleRetry = () => {
      if (disposed || retry) return
      const delay = Math.min(1000 * 2 ** Math.min(attempts, 4), MAX_BACKOFF_MS)
      retry = setTimeout(() => { retry = null; connect() }, delay)
    }

    function connect() {
      if (disposed) return
      let sock
      let opened = false
      try {
        sock = new WebSocket(`${WS_BASE}/ws/v1/city-twin/live`)
      } catch {
        attempts += 1
        setState('paused'); startPolling(); scheduleRetry()
        return
      }
      ws = sock
      sock.onopen = () => {
        opened = true
        attempts = 0
        stopPolling()
        setState('live')
        clearInterval(pingTimer)
        pingTimer = setInterval(() => { try { if (sock.readyState === 1) sock.send('ping') } catch { /* ignore */ } }, PING_MS)
      }
      sock.onmessage = onMessage
      sock.onerror = () => { /* onclose follows */ }
      sock.onclose = () => {
        clearInterval(pingTimer)
        if (ws === sock) ws = null
        if (disposed) return
        attempts += 1
        setState('paused')
        if (!opened || attempts >= 1) startPolling()
        scheduleRetry()
      }
    }

    const onVisible = () => { if (!document.hidden && !ws) hRef.current?.poll?.() }
    document.addEventListener('visibilitychange', onVisible)
    connect()

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisible)
      clearTimeout(retry); clearInterval(pingTimer); stopPolling()
      if (ws) {
        ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null
        try { ws.close() } catch { /* ignore */ }
        ws = null
      }
    }
  }, [enabled])

  return { state, polling: state === 'paused', lastMessageAt }
}

export default useGarbageLiveFeed
