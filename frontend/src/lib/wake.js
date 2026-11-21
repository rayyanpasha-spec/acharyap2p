// Free hosting (Render) puts the backend to sleep when idle; the first request then takes ~30-60 s while it boots.
// This module finds out whether the server is awake and, if not, drives the "waking up" card (components/ServerWakeCard.jsx).
//
//   status: 'checking'  first probe in flight (most visits: answered in well under a second, nothing is shown)
//           'waking'    no answer yet -> the card is visible
//           'awake'     the card was shown and the server just answered: "The server is awake!" for ~1 s
//           'ready'     server answered, nothing to show
//           'failed'    still no answer after WAKE_GIVE_UP_MS -> the card offers Retry / Continue
//
// `booted` becomes true ONCE, after the first check. The app is only rendered once booted, so pages never fire their first
// requests into a sleeping server. After that the app is NEVER unmounted again: later trouble only shows the card on top.
import { create } from 'zustand'

const API = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8010/api/v1').replace(/\/$/, '')
export const HEALTH_URL = `${API.replace(/\/api\/v1$/, '')}/health`

const SHOW_AFTER_MS = 1800          // answers faster than this never show the card
const PROBE_TIMEOUT_MS = 8000
const RETRY_EVERY_MS = 2500
export const WAKE_GIVE_UP_MS = 150000

export const useServer = create(() => ({ status: 'checking', startedAt: 0, attempt: 0, booted: false }))
const set = (p) => useServer.setState(p)

/** One probe. 'ok' = the server answered; 'down' = no answer (asleep / offline). */
async function probe() {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS)
  try {
    const r = await fetch(HEALTH_URL, { cache: 'no-store', signal: ctl.signal })
    if (r.ok) return 'ok'
    return 'down'                                    // 502 / 503 from the host while the service boots
  } catch {
    // Either the network failed or CORS blocked the answer. A no-cors request only rejects on a real network failure,
    // so if it resolves the server IS reachable (the app will then show its own, more specific error).
    try {
      const ctl2 = new AbortController()
      const t2 = setTimeout(() => ctl2.abort(), PROBE_TIMEOUT_MS)
      await fetch(HEALTH_URL, { mode: 'no-cors', cache: 'no-store', signal: ctl2.signal }).finally(() => clearTimeout(t2))
      return 'ok'
    } catch {
      return 'down'
    }
  } finally {
    clearTimeout(timer)
  }
}

let running = null        // the in-flight wait, shared by every caller
let lastOkAt = 0

/** Resolves when the server answers (or when we give up waiting). Safe to call from anywhere, any number of times. */
export function ensureAwake({ force = false } = {}) {
  if (!force && Date.now() - lastOkAt < 20000) return Promise.resolve(true)   // answered a moment ago
  if (running) return running
  const began = Date.now()
  set({ status: 'checking', startedAt: began, attempt: 0 })
  const showTimer = setTimeout(() => { if (running) set({ status: 'waking' }) }, SHOW_AFTER_MS)

  running = (async () => {
    let n = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      n += 1
      set({ attempt: n })
      if (await probe() === 'ok') {
        lastOkAt = Date.now()
        clearTimeout(showTimer)
        const shown = useServer.getState().status === 'waking'
        if (shown) {
          set({ status: 'awake', booted: true })                       // the card shows "The server is awake!" ...
          await new Promise((r) => setTimeout(r, 1300))                // ... long enough to be seen, then it goes away
        }
        set({ status: 'ready', booted: true })
        return true
      }
      if (Date.now() - began > WAKE_GIVE_UP_MS) {
        clearTimeout(showTimer)
        set({ status: 'failed', booted: true })
        return false
      }
      if (useServer.getState().status === 'checking' && Date.now() - began > SHOW_AFTER_MS) set({ status: 'waking' })
      await new Promise((r) => setTimeout(r, RETRY_EVERY_MS))
    }
  })().finally(() => { running = null })
  return running
}

/** "Retry" on the failed card. */
export const retryWake = () => ensureAwake({ force: true })
/** "Continue anyway" on the failed card: let the app render; its own requests will show their own errors. */
export const continueAnyway = () => set({ status: 'ready', booted: true })

/**
 * Called by the API layer after a request failed with a network error / 502 / 503 / 504. A single failing request does NOT mean
 * the server is asleep (a photo that cannot be read, one broken endpoint, a CORS-less 500 ...). So: if the server answered a
 * health check a moment ago, or answers one now, the failure belongs to that request and the caller must NOT retry or reset
 * anything (resolves false). Only when the health check itself gets no answer do we show the card, wait for the server and
 * resolve true so the caller can repeat its request once.
 */
let probing = null
export async function noteServerTrouble() {
  if (running) return running                                   // already waiting for it: join that wait
  probing = probing || probe().finally(() => { probing = null }) // simultaneous failures share ONE health check
  if (await probing === 'ok') { lastOkAt = Date.now(); return false }
  return ensureAwake({ force: true })
}
