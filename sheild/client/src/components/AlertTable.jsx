import { useState } from 'react'
import AcknowledgeModal from './AcknowledgeModal'

const getSeverityColor = (severity) => {
  switch (severity) {
    case 'critical':
    case 'high': return 'bg-red-900 text-red-100 border-red-500'
    case 'medium': return 'bg-yellow-900 text-yellow-200 border-yellow-500'
    case 'low': return 'bg-blue-900 text-blue-200 border-blue-500'
    default: return 'bg-slate-700 text-slate-200 border-slate-600'
  }
}

const getSeverityDot = (severity) => {
  switch (severity) {
    case 'critical':
    case 'high': return 'bg-red-400'
    case 'medium': return 'bg-yellow-400'
    case 'low': return 'bg-blue-400'
    default: return 'bg-slate-400'
  }
}

/**
 * AlertTable — Shows a table on desktop, card list on mobile.
 */
export default function AlertTable({ alerts = [], onAcknowledge, acknowledgments = {} }) {
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const open = (alert) => { setSelectedAlert(alert); setIsModalOpen(true) }
  const close = () => { setIsModalOpen(false); setSelectedAlert(null) }
  const submit = (data) => {
    const id = selectedAlert.id || alerts.indexOf(selectedAlert)
    if (onAcknowledge) onAcknowledge(id, data)
    close()
  }

  if (alerts.length === 0) {
    return (
      <div className="bg-slate-900 border-2 border-slate-600 rounded-lg p-8 text-center shadow-xl">
        <div className="text-3xl mb-3">✅</div>
        <div className="text-slate-300 font-medium">No alerts at this time</div>
        <div className="text-sm text-slate-400 mt-1">All systems operating normally</div>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 border-2 border-slate-600 rounded-xl overflow-hidden shadow-xl">

      {/* ── MOBILE: card list (hidden on sm+) ─────────────────── */}
      <div className="sm:hidden divide-y divide-slate-700">
        {alerts.map((alert, index) => {
          const alertId = alert.id || index
          const isAck = !!acknowledgments[alertId]
          return (
            <div key={alertId} className={`p-4 space-y-3 ${isAck ? 'opacity-60' : ''}`}>
              {/* Row 1: dot + time + severity badge */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getSeverityDot(alert.severity)}`} />
                  <span className="text-xs text-slate-400 truncate">
                    {alert.timestamp ? new Date(alert.timestamp).toLocaleString() : '--'}
                  </span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded border font-semibold flex-shrink-0 ${getSeverityColor(alert.severity)}`}>
                  {alert.severity || 'medium'}
                </span>
              </div>

              {/* Row 2: message */}
              <div className="text-sm text-white">
                {alert.message || alert.label || 'Alert'}
              </div>

              {/* Failure prediction detail — collapsed on mobile */}
              {alert.failurePrediction && (
                <div className="bg-slate-800 rounded-lg p-3 space-y-1.5 text-xs">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span className="text-slate-400">Component: <span className="text-cyan-300 font-semibold">{alert.failurePrediction.component}</span></span>
                    <span className="text-slate-400">Risk: <span className="text-yellow-300 font-bold">{alert.failurePrediction.probability}%</span></span>
                  </div>
                  <div className="text-cyan-300">💡 {alert.failurePrediction.recommendedAction}</div>
                </div>
              )}

              {/* Row 3: status + action */}
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-1 rounded font-medium ${isAck ? 'bg-slate-700 text-slate-300' : 'bg-yellow-900 text-yellow-200'}`}>
                  {isAck ? 'Acknowledged' : 'Active'}
                </span>
                {!isAck ? (
                  <button
                    onClick={() => open(alert)}
                    className="text-xs px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-all font-medium"
                  >
                    Acknowledge
                  </button>
                ) : (
                  <button
                    onClick={() => open(alert)}
                    className="text-xs px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-all font-medium"
                  >
                    View Details
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── DESKTOP: table (hidden below sm) ──────────────────── */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-800 border-b-2 border-slate-700">
            <tr>
              <th className="text-left py-3 px-4 text-sm font-semibold text-white whitespace-nowrap">Time</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-white">Alert Details</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-white">Severity</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-white">Status</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-white">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {alerts.map((alert, index) => {
              const alertId = alert.id || index
              const isAck = !!acknowledgments[alertId]
              return (
                <tr key={alertId} className={`hover:bg-slate-800/50 transition-colors ${isAck ? 'opacity-75' : ''}`}>
                  <td className="py-4 px-4">
                    <div className="text-xs text-slate-400 whitespace-nowrap">
                      {alert.timestamp ? new Date(alert.timestamp).toLocaleString() : '--'}
                    </div>
                  </td>
                  <td className="py-4 px-4 max-w-md">
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-white">{alert.message || alert.label || 'Alert'}</div>
                      {alert.failurePrediction && (
                        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs text-slate-400">Component: <span className="text-cyan-300 font-semibold">{alert.failurePrediction.component}</span></span>
                            <span className="text-xs text-slate-400">Risk: <span className="text-yellow-300 font-bold">{alert.failurePrediction.probability}%</span>
                              <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-medium border ${alert.failurePrediction.riskLevel === 'critical' ? 'bg-red-900 text-red-200 border-red-500' :
                                  alert.failurePrediction.riskLevel === 'high' ? 'bg-orange-900 text-orange-200 border-orange-500' :
                                    'bg-yellow-900 text-yellow-200 border-yellow-500'}`}>{alert.failurePrediction.riskLevel?.toUpperCase()}</span>
                            </span>
                          </div>
                          {alert.failurePrediction.indicators?.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-slate-400">Indicators:</span>
                              <div className="flex gap-1.5 flex-wrap">
                                {alert.failurePrediction.indicators.map((ind, idx) => (
                                  <span key={idx} className="text-xs px-2 py-0.5 bg-red-900/30 text-red-300 rounded border border-red-700">
                                    {ind.feature.replace('_', ' ')}: {ind.value.toFixed(2)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="text-xs text-cyan-300 pt-1 border-t border-slate-700">💡 {alert.failurePrediction.recommendedAction}</div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <span className={`px-3 py-1.5 rounded text-xs font-semibold border ${getSeverityColor(alert.severity)}`}>
                      {alert.severity || 'medium'}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <span className={`text-xs px-3 py-1.5 rounded font-medium ${isAck ? 'bg-slate-700 text-slate-300' : 'bg-yellow-900 text-yellow-200'}`}>
                      {isAck ? 'Acknowledged' : 'Active'}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    {!isAck ? (
                      <button onClick={() => open(alert)} className="text-xs px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-all hover:scale-105 font-medium shadow-lg">
                        Acknowledge
                      </button>
                    ) : (
                      <button onClick={() => open(alert)} className="text-xs px-4 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-all hover:scale-105 font-medium">
                        View Details
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <AcknowledgeModal
        isOpen={isModalOpen}
        alert={selectedAlert}
        onClose={close}
        onSubmit={submit}
        acknowledgment={selectedAlert ? acknowledgments[selectedAlert.id || alerts.indexOf(selectedAlert)] : null}
      />
    </div>
  )
}
