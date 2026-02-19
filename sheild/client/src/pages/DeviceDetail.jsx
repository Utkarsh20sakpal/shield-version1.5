import { useEffect, useState, useRef } from 'react'
import { gsap } from 'gsap'
import { useParams } from 'react-router-dom'
import { subscribeToDeviceData } from '../services/firebase'
import { getHealthStatus, formatTimestamp, getTimeAgo, generateFeatureWarnings } from '../services/statusLogic'
import { getAllThresholds } from '../services/thresholds'
import { getMLPrediction, formatRUL } from '../services/mlService'
import { checkDataQuality, getQualityBadgeColor } from '../utils/dataQuality'
import { checkAllSensors } from '../utils/sensorDrift'
import { detectChanges, formatChange, getChangeColor } from '../utils/changeDetector'
import { calculatePriorityScore, getPriorityBadgeColor, getPriorityDescription } from '../utils/priorityScore'
import { api } from '../lib/api'
import HealthBadge from '../components/HealthBadge'
import SensorCard from '../components/SensorCard'
import StatusIndicator from '../components/StatusIndicator'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import MaintenanceEventModal from '../components/MaintenanceEventModal'
import FailurePredictionPanel from '../components/FailurePredictionPanel'

export default function DeviceDetail() {
  const { deviceId = 'PM_001' } = useParams()
  const [deviceData, setDeviceData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])
  const [mlPrediction, setMLPrediction] = useState(null)
  const [dataQuality, setDataQuality] = useState(null)
  const [sensorDrift, setSensorDrift] = useState({})
  const [changes, setChanges] = useState([])
  const [priorityScore, setPriorityScore] = useState(null)
  const [maintenanceEvents, setMaintenanceEvents] = useState([])
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false)
  const [mlLoading, setMLLoading] = useState(false)
  const [mlError, setMLError] = useState(null)
  const previousDataRef = useRef(null)
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const healthGaugeRef = useRef(null)
  const cardsRef = useRef(null)

  // Fetch historical data from backend on mount
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await api.get(`/sensors/${deviceId}/logs?limit=50`)
        if (response.data.success && response.data.data.logs) {
          const logs = response.data.data.logs.reverse() // Reverse to get chronological order
          const formattedHistory = logs.map(log => ({
            timestamp: new Date(log.timestamp).getTime() / 1000,
            time: formatTimestamp(new Date(log.timestamp).getTime() / 1000),
            temp_mean: log.temp_mean || log.temperature || 0,
            vib_rms: log.vib_rms || log.vibration || 0,
            current_rms: log.current_rms || log.current || 0,
            edge_health: log.edge_health || 0
          }))
          setHistory(formattedHistory)

          // Also save to localStorage as backup
          localStorage.setItem(`sensor_history_${deviceId}`, JSON.stringify(formattedHistory))
        }
      } catch (error) {
        console.error('Failed to fetch history from backend:', error)
        // Try to load from localStorage as fallback
        try {
          const savedHistory = localStorage.getItem(`sensor_history_${deviceId}`)
          if (savedHistory) {
            setHistory(JSON.parse(savedHistory))
          }
        } catch (e) {
          console.error('Failed to load history from localStorage:', e)
        }
      }
    }

    if (deviceId) {
      fetchHistory()
    }
  }, [deviceId])

  useEffect(() => {
    let unsubscribe = null

    const setupSubscription = () => {
      unsubscribe = subscribeToDeviceData(deviceId, (data, err) => {
        if (err) {
          setError(err.message || 'Failed to connect to Firebase')
          setLoading(false)
          return
        }

        if (data) {
          // Only update if data actually changed to prevent unnecessary re-renders
          setDeviceData(prev => {
            if (prev && prev.timestamp === data.timestamp) {
              return prev // Don't update if timestamp is the same
            }
            return data
          })
          setLoading(false)
          setError(null)

          // Save to backend (async, don't wait)
          api.post('/sensors/sync-firebase', {
            machineId: deviceId,
            data: {
              features: data.features || {},
              edge_health: data.edge_health || 0,
              timestamp: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : new Date().toISOString()
            }
          }).catch(err => {
            console.error('Failed to sync data to backend:', err)
          })

          // Add to history for charts (keep last 50 points)
          setHistory(prev => {
            // Check if this timestamp already exists to avoid duplicates
            if (prev.length > 0 && prev[prev.length - 1].timestamp === data.timestamp) {
              return prev // Don't add duplicate
            }
            const newHistory = [...prev, {
              timestamp: data.timestamp,
              time: formatTimestamp(data.timestamp),
              temp_mean: data.features?.temp_mean || 0,
              vib_rms: data.features?.vib_rms || 0,
              current_rms: data.features?.current_rms || 0,
              edge_health: data.edge_health || 0
            }].slice(-50) // Keep last 50 data points

            // Save to localStorage as backup
            try {
              localStorage.setItem(`sensor_history_${deviceId}`, JSON.stringify(newHistory))
            } catch (e) {
              console.error('Failed to save history to localStorage:', e)
            }

            return newHistory
          })

          // Check data quality
          const quality = checkDataQuality(data, history)
          setDataQuality(quality)

          // Check sensor drift (need full data objects, not just chart data)
          const fullHistoryForDrift = [...history, {
            features: {
              temp_mean: data.features?.temp_mean,
              vib_rms: data.features?.vib_rms,
              current_rms: data.features?.current_rms
            }
          }].slice(-20)
          const driftResults = checkAllSensors(fullHistoryForDrift)
          setSensorDrift(driftResults)

          // Detect changes
          if (previousDataRef.current) {
            const detectedChanges = detectChanges(data, previousDataRef.current)
            setChanges(detectedChanges)
          }
          previousDataRef.current = data

          // Fetch ML prediction
          // Compute healthStatus locally for use inside this async callback
          const localHealthStatus = getHealthStatus(data.edge_health || 0)
          if (data.features && data.features.temp_mean !== undefined) {
            setMLLoading(true)
            setMLError(null)
            getMLPrediction(deviceId, {
              temp_mean: data.features.temp_mean,
              vib_rms: data.features.vib_rms,
              current_rms: data.features.current_rms,
              edge_health: data.edge_health || 0
            }).then(prediction => {
              setMLLoading(false)
              if (prediction) {
                setMLPrediction(prediction)

                // Calculate priority score
                const priority = calculatePriorityScore({
                  health_score: prediction.health_score || data.edge_health || 0,
                  anomaly_score: prediction.anomaly_score || 0,
                  rul_hours: prediction.rul_hours || 1000
                })
                setPriorityScore(priority)
              } else {
                // Set fallback prediction if ML returns null
                setMLPrediction({
                  health_score: data.edge_health || 0,
                  status: localHealthStatus.label.toLowerCase(),
                  rul_hours: null,
                  anomaly: 0,
                  anomaly_score: 0
                })
              }
            }).catch(err => {
              console.error('Failed to get ML prediction:', err)
              setMLLoading(false)
              setMLError(err.message || 'Failed to load ML prediction')
              // Set fallback prediction on error
              setMLPrediction({
                health_score: data.edge_health || 0,
                status: localHealthStatus.label.toLowerCase(),
                rul_hours: null,
                anomaly: 0,
                anomaly_score: 0
              })
            })
          } else {
            // If no features, set fallback immediately
            setMLPrediction({
              health_score: data.edge_health || 0,
              status: localHealthStatus.label.toLowerCase(),
              rul_hours: null,
              anomaly: 0,
              anomaly_score: 0
            })
          }
        } else {
          setLoading(false)
        }
      })
    }

    setupSubscription()

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [deviceId])

  // Fetch maintenance events
  useEffect(() => {
    const fetchMaintenanceEvents = async () => {
      try {
        const response = await api.get(`/maintenance/${deviceId}`)
        console.log('Fetched maintenance events:', response.data)
        // Backend returns { success: true, data: { events, count } } or { message, data: { events, count } }
        if (response.data.success && response.data.data) {
          setMaintenanceEvents(response.data.data.events || [])
        } else if (response.data.data && response.data.data.events) {
          setMaintenanceEvents(response.data.data.events || [])
        }
      } catch (error) {
        console.error('Failed to fetch maintenance events:', error)
      }
    }

    if (deviceId) {
      fetchMaintenanceEvents()
    }
  }, [deviceId])

  // GSAP animations - only run once on initial load
  const hasAnimatedRef = useRef(false)
  useEffect(() => {
    if (!deviceData || loading || hasAnimatedRef.current) return

    hasAnimatedRef.current = true

    const ctx = gsap.context(() => {
      if (headerRef.current) {
        gsap.fromTo(headerRef.current, {
          opacity: 0,
          y: -20
        }, {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: 'power2.out'
        })
      }

      if (healthGaugeRef.current) {
        gsap.fromTo(healthGaugeRef.current, {
          opacity: 0,
          scale: 0.8,
          rotation: -10
        }, {
          opacity: 1,
          scale: 1,
          rotation: 0,
          duration: 0.8,
          delay: 0.2,
          ease: 'back.out(1.7)'
        })
      }

      if (cardsRef.current && cardsRef.current.children.length > 0) {
        const cards = Array.from(cardsRef.current.children)
        cards.forEach((card, index) => {
          // Always ensure cards are visible
          gsap.set(card, { opacity: 1, y: 0, display: 'block', visibility: 'visible' })
          // Animate in on first load
          gsap.fromTo(card, {
            opacity: 0,
            y: 30
          }, {
            opacity: 1,
            y: 0,
            duration: 0.5,
            delay: 0.4 + (index * 0.1),
            ease: 'power2.out'
          })
        })
      }
    }, containerRef)

    return () => ctx.revert()
  }, [deviceData, loading])

  // Ensure cards stay visible on data updates (prevent disappearing)
  useEffect(() => {
    if (!deviceData) return
    if (cardsRef.current && cardsRef.current.children.length > 0) {
      const cards = Array.from(cardsRef.current.children)
      cards.forEach(card => {
        // Force visibility on every data update
        gsap.set(card, { opacity: 1, display: 'block', visibility: 'visible' })
      })
    }
  }, [deviceData])

  if (loading && !deviceData) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-slate-400">Loading device data...</div>
      </div>
    )
  }

  if (error && !deviceData) {
    return (
      <div className="p-8">
        <div className="bg-red-900 border-2 border-red-500 rounded-lg p-6 text-red-200 shadow-lg">
          <div className="font-semibold mb-2">Connection Error</div>
          <div className="text-sm">{error}</div>
        </div>
      </div>
    )
  }

  if (!deviceData) {
    return (
      <div className="p-8">
        <div className="text-slate-400">No device data available</div>
      </div>
    )
  }

  const healthStatus = getHealthStatus(deviceData.edge_health || 0)
  const features = deviceData.features || {}
  const thresholds = getAllThresholds()
  const warnings = generateFeatureWarnings(features, thresholds)

  return (
    <div ref={containerRef} className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8 max-w-7xl mx-auto">
      {/* Device Header */}
      <div ref={headerRef} className="bg-slate-900 border-2 border-slate-600 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold text-white">{deviceData.device_id || deviceId}</h1>
              {dataQuality && (
                <div
                  className={`text-xs px-2 py-1 rounded border ${getQualityBadgeColor(dataQuality.status)}`}
                  title={dataQuality.reason}
                >
                  {dataQuality.status === 'good' ? '✓ Good' : '⚠ Degraded'}
                </div>
              )}
              {deviceData._isStale && (
                <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-amber-500 bg-amber-950 text-amber-300">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  Machine Offline — Last Known Reading
                </div>
              )}
            </div>
            <p className="text-sm text-slate-400 mt-2">
              {deviceData._isStale
                ? <span className="text-amber-400">⚠ Last reading: {formatTimestamp(deviceData.timestamp)} ({getTimeAgo(deviceData.timestamp)}) — machine may be offline</span>
                : <>Last updated: {formatTimestamp(deviceData.timestamp)} ({getTimeAgo(deviceData.timestamp)})</>
              }
            </p>
          </div>
          <div className="flex-shrink-0">
            <StatusIndicator healthScore={deviceData.edge_health} size="lg" />
          </div>
        </div>
      </div>

      {/* Health Score & Predictive Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div ref={healthGaugeRef} className="bg-slate-900 border-2 border-slate-600 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-slate-200 mb-4">Health Score</h2>
          <div className="flex items-center justify-center mb-4">
            <div className="relative w-48 h-48">
              <svg className="transform -rotate-90 w-48 h-48">
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  stroke="currentColor"
                  strokeWidth="16"
                  fill="none"
                  className="text-slate-700"
                />
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  stroke="currentColor"
                  strokeWidth="16"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 80}`}
                  strokeDashoffset={`${2 * Math.PI * 80 * (1 - (deviceData.edge_health || 0) / 100)}`}
                  className={
                    healthStatus.color === 'green' ? 'text-green-400' :
                      healthStatus.color === 'yellow' ? 'text-yellow-400' :
                        healthStatus.color === 'red' ? 'text-red-400' :
                          'text-slate-400'
                  }
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className={`text-4xl font-bold ${healthStatus.color === 'green' ? 'text-green-400' :
                    healthStatus.color === 'yellow' ? 'text-yellow-400' :
                      healthStatus.color === 'red' ? 'text-red-400' :
                        'text-slate-400'
                    }`}>
                    {deviceData.edge_health || 0}%
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="text-center">
            <HealthBadge healthScore={deviceData.edge_health} deviceId={deviceId} />
            <p className="text-sm text-slate-400 mt-2">{healthStatus.description}</p>
          </div>
        </div>

        <div className="bg-slate-900 border-2 border-slate-600 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-slate-200 mb-4">Predictive Status</h2>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-slate-400 mb-2">Current Condition</div>
              <div className="text-lg font-semibold text-slate-200">
                {mlPrediction?.status
                  ? mlPrediction.status.charAt(0).toUpperCase() + mlPrediction.status.slice(1)
                  : healthStatus.label
                }
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-400 mb-2">Status Severity</div>
              <div className={`inline-block px-3 py-1 rounded ${healthStatus.severity === 'high' ? 'bg-red-900 text-red-200' :
                healthStatus.severity === 'medium' ? 'bg-yellow-900 text-yellow-200' :
                  'bg-green-900 text-green-200'
                }`}>
                {healthStatus.severity}
              </div>
            </div>

            {/* RUL Section - Always show, with loading state */}
            <div className="pt-4 border-t border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-slate-400">Remaining Useful Life (RUL)</div>
                {priorityScore && (
                  <div
                    className={`text-xs px-2 py-0.5 rounded border ${getPriorityBadgeColor(priorityScore.priority)}`}
                    title={getPriorityDescription(priorityScore.priority)}
                  >
                    {priorityScore.priority}
                  </div>
                )}
              </div>
              {mlLoading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-400"></div>
                  <div className="text-sm text-slate-400">Calculating RUL...</div>
                </div>
              ) : mlPrediction?.rul_hours ? (
                <>
                  <div className="text-lg font-semibold text-green-300">{formatRUL(mlPrediction.rul_hours)}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {mlPrediction.rul_hours.toFixed(1)} hours remaining
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg font-semibold text-slate-400">N/A</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {mlError ? 'ML prediction unavailable' : 'Awaiting ML model training'}
                  </div>
                </>
              )}
            </div>

            {/* ML Health Score Section - Always show */}
            <div className="pt-4 border-t border-slate-700">
              <div className="text-sm text-slate-400 mb-2">ML Health Score</div>
              {mlLoading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-400"></div>
                  <div className="text-sm text-slate-400">Calculating...</div>
                </div>
              ) : mlPrediction?.health_score !== undefined ? (
                <div className="text-lg font-semibold text-cyan-300">
                  {mlPrediction.health_score.toFixed(1)}%
                </div>
              ) : (
                <div className="text-lg font-semibold text-slate-400">
                  {deviceData.edge_health || 0}% <span className="text-xs text-slate-500">(fallback)</span>
                </div>
              )}
              {mlPrediction?.anomaly === 1 && (
                <div className="text-xs text-red-400 mt-1">⚠️ Anomaly Detected</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* What Changed Panel - Full Width */}
      {changes.length > 0 && (
        <div className="bg-slate-900 border-2 border-slate-600 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-slate-200 mb-4">What Changed?</h2>
          <div className="space-y-2">
            {changes.map((change, index) => (
              <div
                key={index}
                className={`text-sm ${getChangeColor(change)}`}
              >
                {formatChange(change)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failure Prediction Panel - Full Width */}
      <FailurePredictionPanel deviceData={deviceData} mlPrediction={mlPrediction} />

      {/* Feature Cards - Full Width Grid */}
      <div>
        <h2 className="text-xl font-semibold text-slate-200 mb-4">Real-time Features</h2>
        <div ref={cardsRef} className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
          <SensorCard
            label="Temperature"
            value={features.temp_mean}
            unit="°C"
            featureKey="temp_mean"
            driftStatus={sensorDrift.temp_mean}
          />
          <SensorCard
            label="Vibration"
            value={features.vib_rms}
            unit="m/s²"
            featureKey="vib_rms"
            driftStatus={sensorDrift.vib_rms}
          />
          <SensorCard
            label="Current"
            value={features.current_rms}
            unit="A"
            featureKey="current_rms"
            driftStatus={sensorDrift.current_rms}
          />
        </div>
      </div>

      {/* Warnings - Full Width */}
      {warnings.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-slate-200 mb-4">Active Warnings</h2>
          <div className="space-y-2">
            {warnings.map((warning, index) => (
              <div
                key={index}
                className="bg-yellow-900 border-2 border-yellow-500 rounded-lg p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-yellow-400">{warning.label}</div>
                    <div className="text-sm text-slate-300 mt-1">{warning.message}</div>
                  </div>
                  <span className={`px-3 py-1 rounded text-xs font-medium ${warning.severity === 'high' ? 'bg-red-900 text-red-200' :
                    'bg-yellow-900 text-yellow-200'
                    }`}>
                    {warning.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Maintenance Events Section - Full Width */}
      <div className="bg-slate-900 border-2 border-slate-600 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-xl font-semibold text-slate-200">Maintenance History</h2>
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              console.log('Log Maintenance Event button clicked')
              setShowMaintenanceModal(true)
            }}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-all hover:scale-105 shadow-lg cursor-pointer whitespace-nowrap"
            type="button"
          >
            + Log Maintenance Event
          </button>
        </div>
        {maintenanceEvents.length > 0 ? (
          <div className="space-y-3">
            {maintenanceEvents.map((event) => (
              <div key={event._id} className="bg-slate-800 border-2 border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                  <div className="text-sm text-slate-400">
                    {new Date(event.timestamp).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {event.createdBy && (
                      <div className="text-xs text-slate-500">By: {event.createdBy}</div>
                    )}
                    <button
                      onClick={async () => {
                        if (window.confirm('Are you sure you want to delete this maintenance event? This action cannot be undone.')) {
                          try {
                            const response = await api.delete(`/maintenance/event/${event._id}`)
                            console.log('Maintenance event deleted successfully:', response.data)
                            // Remove from local state
                            setMaintenanceEvents(prev => prev.filter(e => e._id !== event._id))
                          } catch (error) {
                            console.error('Failed to delete maintenance event:', error)
                            const errorMessage = error.response?.data?.message || error.message || 'Failed to delete maintenance event'
                            alert(`Error: ${errorMessage}`)
                          }
                        }
                      }}
                      className="text-red-400 hover:text-red-300 transition-colors text-sm px-2 py-1 hover:bg-red-900 rounded border border-red-700 hover:border-red-600 whitespace-nowrap"
                      title="Delete this event"
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="text-white font-medium mb-1">{event.actionTaken}</div>
                {event.notes && (
                  <div className="text-sm text-slate-300 mt-2">{event.notes}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-slate-400 text-center py-8">
            No maintenance events logged yet. Click "Log Maintenance Event" to add one.
          </div>
        )}
      </div>

      {/* Warnings section intentionally removed here (already rendered above near sensor cards) */}

      {/* Real-time Chart */}
      {history.length > 0 && (
        <div className="bg-slate-900 border-2 border-slate-600 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-slate-200 mb-4">Real-time Feature Trends</h2>
          <ResponsiveContainer width="100%" height={typeof window !== 'undefined' && window.innerWidth < 640 ? 220 : 400}>

            <LineChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} hide={window.innerWidth < 640} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} width={40} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px' }}
                labelStyle={{ color: '#cbd5e1' }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="temp_mean"
                stroke="#60a5fa"
                strokeWidth={2}
                name="Temperature (°C)"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="vib_rms"
                stroke="#22d3ee"
                strokeWidth={2}
                name="Vibration (m/s²)"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="current_rms"
                stroke="#34d399"
                strokeWidth={2}
                name="Current (A)"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Maintenance Event Modal */}
      <MaintenanceEventModal
        isOpen={showMaintenanceModal}
        deviceId={deviceId}
        onClose={() => setShowMaintenanceModal(false)}
        onSuccess={async (event) => {
          console.log('Maintenance event created successfully:', event)
          // Add the new event to the list immediately
          setMaintenanceEvents(prev => [event, ...prev])
          setShowMaintenanceModal(false)
          // Refetch to ensure we have the latest data from server
          try {
            const response = await api.get(`/maintenance/${deviceId}`)
            if (response.data.success && response.data.data) {
              setMaintenanceEvents(response.data.data.events || [])
            } else if (response.data.data && response.data.data.events) {
              setMaintenanceEvents(response.data.data.events || [])
            }
          } catch (error) {
            console.error('Failed to refresh maintenance events:', error)
          }
        }}
      />
    </div>
  )
}

