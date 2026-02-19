import { useEffect, useState, useRef } from 'react'
import { gsap } from 'gsap'
import { subscribeToDeviceData } from '../services/firebase'
import { formatTimestamp } from '../services/statusLogic'
import { api } from '../lib/api'
import * as XLSX from 'xlsx'

export default function History() {
  const [deviceData, setDeviceData] = useState(null)
  const [history, setHistory] = useState([])
  const [filteredHistory, setFilteredHistory] = useState([])
  const [timeRange, setTimeRange] = useState('all') // 'all', '1h', '6h', '24h', 'custom'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(true)
  const containerRef = useRef(null)
  const tableRef = useRef(null)
  const controlsRef = useRef(null)

  // Fetch historical data from backend on mount
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await api.get(`/sensors/PM_001/logs?limit=5000`)
        if (response.data.success && response.data.data.logs) {
          const logs = response.data.data.logs.reverse() // Reverse to get chronological order
          const formattedHistory = logs.map(log => ({
            timestamp: new Date(log.timestamp).getTime() / 1000,
            date: formatTimestamp(new Date(log.timestamp).getTime() / 1000),
            time: new Date(log.timestamp).toLocaleTimeString(),
            device_id: log.machineId || 'PM_001',
            temp_mean: log.temp_mean || log.temperature || 0,
            vib_rms: log.vib_rms || log.vibration || 0,
            current_rms: log.current_rms || log.current || 0,
            edge_health: log.edge_health || 0,
            temp_std: log.temp_std || 0,
            vib_std: log.vib_std || 0,
            current_std: log.current_std || 0
          }))
          setHistory(formattedHistory)
          setLoading(false)

          // Also save to localStorage as backup
          localStorage.setItem('sensor_history_full_PM_001', JSON.stringify(formattedHistory))
        } else {
          // Try to load from localStorage as fallback
          try {
            const savedHistory = localStorage.getItem('sensor_history_full_PM_001')
            if (savedHistory) {
              setHistory(JSON.parse(savedHistory))
            }
          } catch (e) {
            console.error('Failed to load history from localStorage:', e)
          }
          setLoading(false)
        }
      } catch (error) {
        console.error('Failed to fetch history from backend:', error)
        // Try to load from localStorage as fallback
        try {
          const savedHistory = localStorage.getItem('sensor_history_full_PM_001')
          if (savedHistory) {
            setHistory(JSON.parse(savedHistory))
          }
        } catch (e) {
          console.error('Failed to load history from localStorage:', e)
        }
        setLoading(false)
      }
    }

    fetchHistory()
  }, [])

  useEffect(() => {
    let unsubscribe = null

    const setupSubscription = () => {
      unsubscribe = subscribeToDeviceData('PM_001', (data) => {
        if (data) {
          // Only update if data actually changed
          setDeviceData(prev => {
            if (prev && prev.timestamp === data.timestamp) {
              return prev
            }
            return data
          })

          // Save to backend first (async, don't wait)
          api.post('/sensors/sync-firebase', {
            machineId: 'PM_001',
            data: {
              features: data.features || {},
              edge_health: data.edge_health || 0,
              timestamp: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : new Date().toISOString()
            }
          }).catch(err => {
            console.error('Failed to sync data to backend:', err)
          })

          // Add to history
          const newPoint = {
            timestamp: data.timestamp,
            date: formatTimestamp(data.timestamp),
            time: new Date(data.timestamp * 1000).toLocaleTimeString(),
            device_id: data.device_id || 'PM_001',
            temp_mean: data.features?.temp_mean || 0,
            vib_rms: data.features?.vib_rms || 0,
            current_rms: data.features?.current_rms || 0,
            edge_health: data.edge_health || 0,
            temp_std: data.features?.temp_std || 0,
            vib_std: data.features?.vib_std || 0,
            current_std: data.features?.current_std || 0
          }

          setHistory(prev => {
            // Check if this timestamp already exists to avoid duplicates
            if (prev.length > 0 && prev[prev.length - 1].timestamp === newPoint.timestamp) {
              return prev
            }
            const updated = [...prev, newPoint].slice(-5000) // Keep last 5000 points for history

            // Save to localStorage as backup
            try {
              localStorage.setItem('sensor_history_full_PM_001', JSON.stringify(updated))
            } catch (e) {
              console.error('Failed to save history to localStorage:', e)
            }

            return updated
          })
        }
        setLoading(false)
      })
    }

    setupSubscription()

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [])

  // Filter history based on time range
  useEffect(() => {
    let filtered = [...history]

    if (timeRange === 'custom') {
      if (startDate && endDate) {
        const start = new Date(startDate).getTime() / 1000
        const end = new Date(endDate).getTime() / 1000 + 86400 // Add 1 day to include end date
        filtered = history.filter(point =>
          point.timestamp >= start && point.timestamp <= end
        )
      }
    } else if (timeRange !== 'all') {
      const now = Math.floor(Date.now() / 1000)
      const rangeSeconds = {
        '1h': 3600,
        '6h': 21600,
        '24h': 86400,
        '7d': 604800,
        '30d': 2592000
      }[timeRange] || 0
      filtered = history.filter(point => point.timestamp >= now - rangeSeconds)
    }

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => b.timestamp - a.timestamp)
    setFilteredHistory(filtered)
  }, [history, timeRange, startDate, endDate])

  // GSAP animations - only run once on initial load
  const hasAnimatedRef = useRef(false)
  useEffect(() => {
    if (hasAnimatedRef.current) return

    hasAnimatedRef.current = true

    const ctx = gsap.context(() => {
      if (controlsRef.current) {
        gsap.fromTo(controlsRef.current, {
          opacity: 0,
          y: -20
        }, {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: 'power2.out'
        })
      }

      if (tableRef.current) {
        gsap.fromTo(tableRef.current, {
          opacity: 0,
          y: 40
        }, {
          opacity: 1,
          y: 0,
          duration: 0.6,
          delay: 0.2,
          ease: 'power2.out'
        })
      }
    }, containerRef)

    return () => ctx.revert()
  }, [])

  const exportToExcel = () => {
    if (filteredHistory.length === 0) {
      alert('No data available to export')
      return
    }

    // Prepare data for Excel
    const excelData = filteredHistory.map(point => ({
      'Date': point.date,
      'Time': point.time,
      'Device ID': point.device_id,
      'Temperature Mean (°C)': point.temp_mean.toFixed(2),
      'Temperature Std': point.temp_std.toFixed(2),
      'Vibration RMS': point.vib_rms.toFixed(2),
      'Vibration Std': point.vib_std.toFixed(2),
      'Current RMS': point.current_rms.toFixed(2),
      'Current Std': point.current_std.toFixed(2),
      'Edge Health (%)': point.edge_health.toFixed(2)
    }))

    // Create workbook and worksheet
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Device History')

    // Generate filename with date range
    let filename = 'device_history'
    if (timeRange === 'custom' && startDate && endDate) {
      filename = `device_history_${startDate}_to_${endDate}`
    } else if (timeRange !== 'all') {
      filename = `device_history_${timeRange}`
    }
    filename += `_${new Date().toISOString().split('T')[0]}.xlsx`

    // Write file
    XLSX.writeFile(wb, filename)
  }

  // Set default date range for custom (last 7 days)
  useEffect(() => {
    if (timeRange === 'custom' && !startDate && !endDate) {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 7)
      setEndDate(end.toISOString().split('T')[0])
      setStartDate(start.toISOString().split('T')[0])
    }
  }, [timeRange])

  return (
    <div ref={containerRef} className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Device History</h1>
        <p className="text-slate-300">View and export historical device data</p>
      </div>

      {/* Controls */}
      <div ref={controlsRef} className="bg-slate-900 border-2 border-slate-600 rounded-lg p-6 mb-6">
        <div className="grid grid-cols-1 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Time Range
            </label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="w-full bg-slate-800 border-2 border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="all">All Time</option>
              <option value="1h">Last 1 Hour</option>
              <option value="6h">Last 6 Hours</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {timeRange === 'custom' && (
            <>
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-800 border-2 border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-800 border-2 border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-white">
            <span className="font-semibold">Total Records: </span>
            <span className="text-cyan-300">{filteredHistory.length}</span>
          </div>
          <button
            onClick={exportToExcel}
            disabled={filteredHistory.length === 0}
            className="w-full sm:w-auto px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed border-2 border-green-500 rounded-lg text-white font-semibold transition-all hover:scale-105 shadow-lg text-sm"
          >
            📥 Export to Excel
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div ref={tableRef} className="bg-slate-900 border-2 border-slate-600 rounded-lg overflow-hidden">
        {loading && filteredHistory.length === 0 ? (
          <div className="p-8 text-center text-white">Loading historical data...</div>
        ) : filteredHistory.length === 0 ? (
          <div className="p-8 text-center text-white">
            <p className="text-lg mb-2">No data available for the selected time range</p>
            <p className="text-slate-400 text-sm">Data will appear here as it's collected from the device</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800 border-b-2 border-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">Time</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">Device ID</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-white">Temp Mean (°C)</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-white">Temp Std</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-white">Vib RMS</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-white">Vib Std</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-white">Current RMS</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-white">Current Std</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-white">Health (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filteredHistory.map((point, index) => (
                  <tr
                    key={`${point.timestamp}-${index}`}
                    className="hover:bg-slate-800 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-white">{point.date}</td>
                    <td className="px-4 py-3 text-sm text-white">{point.time}</td>
                    <td className="px-4 py-3 text-sm text-white font-mono">{point.device_id}</td>
                    <td className="px-4 py-3 text-sm text-white text-right">{point.temp_mean.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-white text-right">{point.temp_std.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-white text-right">{point.vib_rms.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-white text-right">{point.vib_std.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-white text-right">{point.current_rms.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-white text-right">{point.current_std.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <span className={`font-semibold ${point.edge_health >= 80 ? 'text-green-400' :
                          point.edge_health >= 50 ? 'text-yellow-400' :
                            'text-red-400'
                        }`}>
                        {point.edge_health.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-4 text-sm text-slate-400 text-center">
        <p>Data is collected in real-time. Historical data is limited to the last 5,000 records.</p>
      </div>
    </div>
  )
}


