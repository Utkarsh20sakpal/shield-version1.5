import { useEffect, useState, useRef } from 'react'
import { gsap } from 'gsap'
import { subscribeToDeviceData } from '../services/firebase'
import { formatTimestamp } from '../services/statusLogic'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

// Simple responsive chart height hook
function useChartHeight(mobile = 180, desktop = 300) {
  const [height, setHeight] = useState(window.innerWidth < 640 ? mobile : desktop)
  useEffect(() => {
    const handler = () => setHeight(window.innerWidth < 640 ? mobile : desktop)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [mobile, desktop])
  return height
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', fontSize: '12px' },
  labelStyle: { color: '#cbd5e1' },
}

export default function Analytics() {
  const [deviceData, setDeviceData] = useState(null)
  const [history, setHistory] = useState([])
  const [timeRange, setTimeRange] = useState('all')
  const containerRef = useRef(null)
  const statsRef = useRef(null)
  const chartsRef = useRef(null)
  const chartH = useChartHeight(180, 300)
  const combinedH = useChartHeight(200, 400)

  useEffect(() => {
    let unsubscribe = null
    unsubscribe = subscribeToDeviceData('PM_001', (data) => {
      if (!data) return
      setDeviceData(prev => (prev?.timestamp === data.timestamp ? prev : data))
      const newPoint = {
        timestamp: data.timestamp,
        time: formatTimestamp(data.timestamp),
        temp_mean: data.features?.temp_mean || 0,
        vib_rms: data.features?.vib_rms || 0,
        current_rms: data.features?.current_rms || 0,
        edge_health: data.edge_health || 0,
      }
      setHistory(prev => {
        if (prev.length > 0 && prev[prev.length - 1].timestamp === newPoint.timestamp) return prev
        const updated = [...prev, newPoint]
        if (timeRange !== 'all') {
          const now = Math.floor(Date.now() / 1000)
          const secs = { '1h': 3600, '6h': 21600, '24h': 86400 }[timeRange] || 0
          return updated.filter(p => p.timestamp >= now - secs)
        }
        return updated.slice(-1000)
      })
    })
    return () => { if (unsubscribe) unsubscribe() }
  }, [timeRange])

  const hasAnimatedRef = useRef(false)
  useEffect(() => {
    if (hasAnimatedRef.current) return
    hasAnimatedRef.current = true
    const ctx = gsap.context(() => {
      if (statsRef.current) gsap.fromTo(statsRef.current.children, { opacity: 0, y: 20, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.1, ease: 'back.out(1.4)' })
      if (chartsRef.current) gsap.fromTo(chartsRef.current.children, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.2, delay: 0.3, ease: 'power2.out' })
    }, containerRef)
    return () => ctx.revert()
  }, [])

  const stats = history.length > 0 ? {
    temp_mean: { min: Math.min(...history.map(h => h.temp_mean)), max: Math.max(...history.map(h => h.temp_mean)), avg: history.reduce((s, h) => s + h.temp_mean, 0) / history.length },
    vib_rms: { min: Math.min(...history.map(h => h.vib_rms)), max: Math.max(...history.map(h => h.vib_rms)), avg: history.reduce((s, h) => s + h.vib_rms, 0) / history.length },
    current_rms: { min: Math.min(...history.map(h => h.current_rms)), max: Math.max(...history.map(h => h.current_rms)), avg: history.reduce((s, h) => s + h.current_rms, 0) / history.length },
    edge_health: { min: Math.min(...history.map(h => h.edge_health)), max: Math.max(...history.map(h => h.edge_health)), avg: history.reduce((s, h) => s + h.edge_health, 0) / history.length },
  } : null

  const isMobile = window.innerWidth < 640

  return (
    <div ref={containerRef} className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <div className="flex flex-wrap gap-2">
          {['all', '1h', '6h', '24h'].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${timeRange === range
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-600'
                }`}
            >
              {range === 'all' ? 'All' : range}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div ref={statsRef} className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
          {[
            { label: 'Temperature', key: 'temp_mean', unit: '°C', color: 'text-blue-400' },
            { label: 'Vibration', key: 'vib_rms', unit: ' m/s²', color: 'text-cyan-400' },
            { label: 'Current', key: 'current_rms', unit: ' A', color: 'text-green-400' },
            { label: 'Health', key: 'edge_health', unit: '%', color: 'text-yellow-400' },
          ].map(({ label, key, unit, color }) => (
            <div key={key} className="bg-slate-900 border-2 border-slate-600 rounded-lg p-3 md:p-4 shadow-lg">
              <div className="text-xs sm:text-sm text-slate-400 mb-1">{label}</div>
              <div className={`text-base sm:text-lg font-semibold ${color}`}>
                {stats[key].avg.toFixed(2)}{unit}
              </div>
              <div className="text-xs text-slate-500 mt-1 hidden sm:block">
                {stats[key].min.toFixed(2)} – {stats[key].max.toFixed(2)}{unit}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      {history.length > 0 ? (
        <div ref={chartsRef} className="space-y-6">
          {[
            { title: 'Temperature Trend', key: 'temp_mean', stroke: '#60a5fa', fill: '#60a5fa', name: 'Temp (°C)' },
            { title: 'Vibration Trend', key: 'vib_rms', stroke: '#22d3ee', fill: '#22d3ee', name: 'Vib (m/s²)' },
            { title: 'Current Trend', key: 'current_rms', stroke: '#34d399', fill: '#34d399', name: 'Current (A)' },
          ].map(({ title, key, stroke, fill, name }) => (
            <div key={key} className="bg-slate-900 border-2 border-slate-600 rounded-xl p-4 md:p-6 shadow-xl">
              <h2 className="text-base md:text-xl font-semibold text-slate-200 mb-3">{title}</h2>
              <ResponsiveContainer width="100%" height={chartH}>
                <AreaChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  {!isMobile && <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />}
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} width={40} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey={key} stroke={stroke} fill={fill} fillOpacity={0.3} name={name} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ))}

          {/* Combined */}
          <div className="bg-slate-900 border-2 border-slate-600 rounded-xl p-4 md:p-6 shadow-xl">
            <h2 className="text-base md:text-xl font-semibold text-slate-200 mb-3">All Features Over Time</h2>
            <ResponsiveContainer width="100%" height={combinedH}>
              <LineChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                {!isMobile && <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />}
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} width={40} />
                <Tooltip {...CHART_TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="temp_mean" stroke="#60a5fa" strokeWidth={2} name="Temp (°C)" dot={false} />
                <Line type="monotone" dataKey="vib_rms" stroke="#22d3ee" strokeWidth={2} name="Vib (m/s²)" dot={false} />
                <Line type="monotone" dataKey="current_rms" stroke="#34d399" strokeWidth={2} name="Current (A)" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border-2 border-slate-600 rounded-lg p-8 text-center shadow-xl">
          <div className="text-slate-400">No historical data yet</div>
          <div className="text-sm text-slate-500 mt-2">Data will appear as it is received from the device</div>
        </div>
      )}
    </div>
  )
}
