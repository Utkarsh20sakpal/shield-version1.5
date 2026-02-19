import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { useAuth } from './store/auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import DeviceDetail from './pages/DeviceDetail'
import Analytics from './pages/Analytics'
import Alerts from './pages/Alerts'
import History from './pages/History'
import HelpAndFeedback from './pages/HelpAndFeedback'
import Landing from './pages/Landing'
import Footer from './components/Footer'
import ShieldLogoWithText from './components/ShieldLogo'
import ErrorBoundary from './components/ErrorBoundary'

const queryClient = new QueryClient()

// ── Nav links config ─────────────────────────────────────────────────────────
const NAV_LINKS = [
  { to: '/', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', authRequired: false },
  { to: '/dashboard', label: 'Dashboard', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', authRequired: true },
  { to: '/device/PM_001', label: 'Device', icon: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18', authRequired: true },
  { to: '/analytics', label: 'Analytics', icon: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z', authRequired: true },
  { to: '/alerts', label: 'Alerts', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9', authRequired: true },
  { to: '/history', label: 'History', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', authRequired: true },
  { to: '/help', label: 'Help', icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', authRequired: false },
]

const AppLayout = ({ children }) => {
  const { token, logout } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const visibleLinks = NAV_LINKS.filter(l => !l.authRequired || token)

  return (
    <div className="min-h-screen app-gradient flex flex-col">
      {/* ── Top Navbar ─────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 glass-effect border-b-2 border-slate-700 shadow-professional">
        <div className="w-full px-4 sm:px-6 py-3 flex items-center justify-between">

          {/* Logo */}
          <Link to="/" className="flex items-center flex-shrink-0" onClick={() => setMenuOpen(false)}>
            <ShieldLogoWithText size={40} showText={true} />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-200 flex-1 px-6">
            {visibleLinks.map(({ to, label, icon }) => {
              const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to))
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all duration-200 hover:text-cyan-300 hover:bg-slate-800
                    ${active ? 'text-cyan-300 bg-slate-800' : ''}`}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                  </svg>
                  {label}
                </Link>
              )
            })}
          </div>

          {/* Desktop logout / login */}
          <div className="hidden md:flex items-center">
            {token ? (
              <button
                onClick={logout}
                className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 hover:bg-slate-700 hover:border-slate-500 transition-all font-medium text-white text-sm"
              >
                Logout
              </button>
            ) : (
              <Link to="/login" className="hover:text-cyan-300 transition-colors font-medium text-slate-200 text-sm">Login</Link>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex flex-col justify-center items-center w-10 h-10 rounded-lg hover:bg-slate-800 transition-all gap-1.5"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            <span className={`block w-5 h-0.5 bg-slate-300 transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block w-5 h-0.5 bg-slate-300 transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-0.5 bg-slate-300 transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>
        </div>

        {/* Mobile dropdown menu */}
        <div className={`md:hidden overflow-hidden transition-all duration-300 ${menuOpen ? 'max-h-screen pb-4' : 'max-h-0'}`}>
          <div className="px-4 flex flex-col gap-1">
            {visibleLinks.map(({ to, label, icon }) => {
              const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to))
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all
                    ${active ? 'text-cyan-300 bg-slate-800' : 'text-slate-200 hover:text-cyan-300 hover:bg-slate-800'}`}
                >
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                  </svg>
                  {label}
                </Link>
              )
            })}

            {/* Mobile logout / login */}
            <div className="mt-2 pt-2 border-t border-slate-700">
              {token ? (
                <button
                  onClick={() => { logout(); setMenuOpen(false) }}
                  className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-400 hover:bg-slate-800 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </button>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-200 hover:text-cyan-300 hover:bg-slate-800 transition-all"
                >
                  Login
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      <PageTransition>
        <main className="flex-1 w-full overflow-x-hidden">{children}</main>
      </PageTransition>
      <Footer />
    </div>
  )
}

const RequireAuth = ({ children }) => {
  const { token, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-300">Loading...</div>
      </div>
    )
  }

  if (!token) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

const PageTransition = ({ children }) => {
  const location = useLocation()
  const containerRef = useRef(null)
  const prevPathRef = useRef(location.pathname)

  useEffect(() => {
    if (prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname
      if (containerRef.current) {
        gsap.fromTo(containerRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' })
      }
    }
  }, [location.pathname])

  return <div ref={containerRef}>{children}</div>
}

function App() {
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = localStorage.getItem('token')
        if (token) await useAuth.getState().fetchMe()
      } catch (error) {
        console.error('Auth initialization error:', error)
      }
    }
    initAuth()
  }, [])

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<RequireAuth><AppLayout><Dashboard /></AppLayout></RequireAuth>} />
            <Route path="/device/:deviceId" element={<RequireAuth><AppLayout><DeviceDetail /></AppLayout></RequireAuth>} />
            <Route path="/analytics" element={<RequireAuth><AppLayout><Analytics /></AppLayout></RequireAuth>} />
            <Route path="/alerts" element={<RequireAuth><AppLayout><Alerts /></AppLayout></RequireAuth>} />
            <Route path="/history" element={<RequireAuth><AppLayout><History /></AppLayout></RequireAuth>} />
            <Route path="/help" element={<AppLayout><HelpAndFeedback /></AppLayout>} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
