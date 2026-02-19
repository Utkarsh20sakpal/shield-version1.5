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

const AppLayout = ({ children }) => {
  const { token, logout } = useAuth()
  return (
    <div className="min-h-screen app-gradient flex flex-col">
      <nav className="sticky top-0 z-10 glass-effect border-b-2 border-slate-700 shadow-professional">
        <div className="w-full px-6 py-4 flex items-center gap-8">
          <Link to="/" className="flex items-center">
            <ShieldLogoWithText size={48} showText={true} />
          </Link>
          <div className="text-base font-medium text-slate-200 flex gap-6">
            <Link to="/" className="hover:text-cyan-300 transition-all duration-200 px-3 py-2 rounded-lg hover:bg-slate-800 hover:scale-105 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Home
            </Link>
            {token && (
              <>
                <Link to="/dashboard" className="hover:text-cyan-300 transition-all duration-200 px-3 py-2 rounded-lg hover:bg-slate-800 hover:scale-105">Dashboard</Link>
                <Link to="/device/PM_001" className="hover:text-cyan-300 transition-all duration-200 px-3 py-2 rounded-lg hover:bg-slate-800 hover:scale-105">Device Detail</Link>
                <Link to="/analytics" className="hover:text-cyan-300 transition-all duration-200 px-3 py-2 rounded-lg hover:bg-slate-800 hover:scale-105">Analytics</Link>
                <Link to="/alerts" className="hover:text-cyan-300 transition-all duration-200 px-3 py-2 rounded-lg hover:bg-slate-800 hover:scale-105">Alerts</Link>
                <Link to="/history" className="hover:text-cyan-300 transition-all duration-200 px-3 py-2 rounded-lg hover:bg-slate-800 hover:scale-105">History</Link>
                <Link to="/help" className="hover:text-cyan-300 transition-all duration-200 px-3 py-2 rounded-lg hover:bg-slate-800 hover:scale-105">Help</Link>
              </>
            )}
          </div>
          <div className="ml-auto text-base text-slate-200">
            {token ? (
              <button onClick={logout} className="px-6 py-2.5 rounded-lg bg-slate-800 border-2 border-slate-600 hover:bg-slate-700 hover:border-slate-500 transition-all font-medium hover:scale-105 shadow-lg text-white">Logout</button>
            ) : (
              <Link to="/login" className="hover:text-cyan-300 transition-colors font-medium">Login</Link>
            )}
          </div>
        </div>
      </nav>
      <PageTransition>
        <main className="flex-1 w-full px-4 sm:px-6 overflow-x-hidden">{children}</main>
      </PageTransition>
      <Footer />
    </div>
  )
}

const RequireAuth = ({ children }) => {
  const { token, loading } = useAuth()
  const location = useLocation()

  // Wait for auth to initialize
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
    // Only animate on route change, not on data updates
    if (prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname
      if (containerRef.current) {
        gsap.fromTo(containerRef.current, {
          opacity: 0,
          y: 20
        }, {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: 'power2.out'
        })
      }
    }
  }, [location.pathname])

  return <div ref={containerRef}>{children}</div>
}

function App() {
  // Initialize auth on app start
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = localStorage.getItem('token')
        if (token) {
          await useAuth.getState().fetchMe()
        }
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
