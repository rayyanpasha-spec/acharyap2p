// Route table (FIXED CONTRACT - see docs/API_CONTRACT.md "Frontend routes"). Pages are lazy-loaded.
import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './store/auth'
import { useMeta } from './store/meta'
import { Spinner, Toaster } from './components/ui'
import { useLang } from './lib/i18n'
import { ensureAwake, useServer } from './lib/wake'
import ServerWakeCard from './components/ServerWakeCard'

import CitizenLayout from './layouts/CitizenLayout'
import StaffLayout from './layouts/StaffLayout'
import PublicLayout from './layouts/PublicLayout'

// Lazy page + a `preload` handle, so the next pages can be fetched quietly in the background (no blank wait on first open).
const L = (loader) => { const C = lazy(loader); C.preload = loader; return C }
const Landing = L(() => import('./pages/public/Landing'))
const Login = L(() => import('./pages/public/Login'))
const Register = L(() => import('./pages/public/Register'))
const VerifyCertificate = L(() => import('./pages/public/VerifyCertificate'))

const Home = L(() => import('./pages/citizen/Home'))
const Report = L(() => import('./pages/citizen/Report'))
const MyComplaints = L(() => import('./pages/citizen/MyComplaints'))
const ComplaintDetail = L(() => import('./pages/citizen/ComplaintDetail'))
const Notifications = L(() => import('./pages/citizen/Notifications'))
const Profile = L(() => import('./pages/citizen/Profile'))
const CleanRoute = L(() => import('./pages/citizen/CleanRoute'))
const CivicVerse = L(() => import('./pages/citizen/CivicVerse'))
const GamePlay = L(() => import('./pages/citizen/GamePlay'))
const Achievements = L(() => import('./pages/citizen/Achievements'))
const Certificates = L(() => import('./pages/citizen/Certificates'))

const CityInMotion = L(() => import('./pages/CityInMotion'))
const Dashboard = L(() => import('./pages/officer/Dashboard'))
const Queue = L(() => import('./pages/officer/Queue'))
const TicketDetail = L(() => import('./pages/officer/TicketDetail'))
const Analytics = L(() => import('./pages/officer/Analytics'))
const WorkerTasks = L(() => import('./pages/officer/WorkerTasks'))
const CleanRouteOps = L(() => import('./pages/officer/CleanRouteOps'))
const Users = L(() => import('./pages/admin/Users'))
const Config = L(() => import('./pages/admin/Config'))
const AuditLogs = L(() => import('./pages/admin/AuditLogs'))
const Rewards = L(() => import('./pages/admin/Rewards'))

/** Redirects to /login when signed out, or to the user's own home when the role is not allowed. */
function RequireRole({ roles }) {
  const { user, ready, homePath } = useAuth()
  const loc = useLocation()
  if (!ready) return <Spinner label="Checking your session…" className="min-h-[50vh]" />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  if (!roles.includes(user.role)) return <Navigate to={homePath()} replace />
  return <Outlet />
}

export default function App() {
  const init = useAuth((s) => s.init)
  const loadMeta = useMeta((s) => s.load)
  const lang = useLang((s) => s.lang)
  const role = useAuth((s) => s.user?.role)
  const booted = useServer((s) => s.booted)
  // Find out whether the (free-tier) backend is awake BEFORE the app starts asking it for things; a sleeping server shows the
  // "waking up" card, and nobody is signed out or shown errors just because the first request had to wait for the boot.
  useEffect(() => { ensureAwake().finally(() => { init(); loadMeta() }) }, [init, loadMeta])
  // Once signed in, fetch the pages that person is most likely to open next while the browser is idle.
  useEffect(() => {
    const pages = role === 'citizen' ? [Report, MyComplaints, CleanRoute, CivicVerse, Achievements, Certificates, Profile]
      : role ? [Queue, TicketDetail, Analytics, CleanRouteOps] : []
    if (!pages.length) return undefined
    const run = () => pages.forEach((p) => { try { p.preload?.().catch(() => {}) } catch { /* best effort */ } })
    const id = typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(run, { timeout: 2500 }) : setTimeout(run, 800)
    return () => { if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(id); else clearTimeout(id) }
  }, [role])
  useEffect(() => { document.documentElement.lang = lang }, [lang])

  const appReady = booted      // true after the first server check, and never reset: the app is never unmounted again
  return (
    <>
      <ServerWakeCard />
      {appReady && <Suspense fallback={<Spinner className="min-h-[50vh]" />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify/:code" element={<VerifyCertificate />} />
          </Route>

          {/* 3D operations map: public, full-viewport, data scoped by role on the server */}
          <Route path="/city-in-motion" element={<CityInMotion />} />

          <Route element={<RequireRole roles={['citizen']} />}>
            <Route path="/app" element={<CitizenLayout />}>
              <Route index element={<Home />} />
              <Route path="report" element={<Report />} />
              <Route path="complaints" element={<MyComplaints />} />
              <Route path="complaints/:ticketId" element={<ComplaintDetail />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="profile" element={<Profile />} />
              <Route path="cleanroute" element={<CleanRoute />} />
              <Route path="civicverse" element={<CivicVerse />} />
              <Route path="civicverse/:gameCode" element={<GamePlay />} />
              <Route path="achievements" element={<Achievements />} />
              <Route path="certificates" element={<Certificates />} />
            </Route>
          </Route>

          <Route element={<RequireRole roles={['officer', 'worker', 'supervisor', 'admin']} />}>
            <Route path="/staff" element={<StaffLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="queue" element={<Queue />} />
              <Route path="tickets/:ticketId" element={<TicketDetail />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="worker" element={<WorkerTasks />} />
              <Route path="cleanroute" element={<CleanRouteOps />} />
              <Route element={<RequireRole roles={['admin']} />}>
                <Route path="admin/users" element={<Users />} />
                <Route path="admin/config" element={<Config />} />
                <Route path="admin/rewards" element={<Rewards />} />
                <Route path="admin/audit" element={<AuditLogs />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>}
      <Toaster />
    </>
  )
}
