import { initializeApp } from 'firebase/app'
import { getFirestore, collection, doc, onSnapshot, getDoc } from 'firebase/firestore'

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "your-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "your-project.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://your-project-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "your-project-id",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "your-project.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "your-app-id"
}

// Log configuration status
console.log('Firebase Config Status:', {
  hasApiKey: !!firebaseConfig.apiKey && firebaseConfig.apiKey !== 'your-api-key',
  projectId: firebaseConfig.projectId,
  usingFirestore: true
})

// Initialize Firebase
let app, db
try {
  app = initializeApp(firebaseConfig)
  db = getFirestore(app)
  console.log('Firebase initialized:', {
    projectId: firebaseConfig.projectId,
    usingFirestore: true
  })
} catch (error) {
  console.error('Firebase initialization error:', error)
  console.error('Please ensure:')
  console.error('1. Firestore is enabled in Firebase Console')
  console.error('2. Firestore Rules allow read access')
  console.error('3. Project ID is correct:', firebaseConfig.projectId)
  // Don't throw - allow app to continue without Firebase
  db = null
}

/**
 * Normalize Firebase field names to what the rest of the app expects.
 *
 * Firestore sends:   features.temp_mean_C  and  features.current_rms_A
 * The app expects:   features.temp_mean    and  features.current_rms
 *
 * This is the ONLY place that translates Firebase field names.
 * No other file needs to change when Firebase fields are renamed.
 */
const normalizeFirebaseData = (raw) => {
  if (!raw) return null

  const rawFeatures = raw.features || {}
  const features = {
    // Temperature: Firebase uses temp_mean_C, app uses temp_mean
    temp_mean: rawFeatures.temp_mean_C ?? rawFeatures.temp_mean ?? null,
    // Vibration: same name in both — pass through
    vib_rms: rawFeatures.vib_rms ?? null,
    // Current: Firebase uses current_rms_A, app uses current_rms
    current_rms: rawFeatures.current_rms_A ?? rawFeatures.current_rms ?? null,
  }

  return { ...raw, features }
}

// Per-device cache of the last good reading received from Firestore.
// When the machine goes offline (Firebase stops sending), we return
// the cached reading with _isStale: true so the UI never goes blank.
const lastKnownDataCache = {}

/**
 * Subscribe to real-time data from Firestore.
 * Always delivers data to the callback — even when the machine is offline,
 * the last known reading is returned with `data._isStale = true`.
 *
 * @param {string} deviceId - Device ID (default: PM_001)
 * @param {function} callback - fn(data, error) — data always has a value if
 *   there was ever a successful reading; check data._isStale for freshness.
 * @returns {function} Unsubscribe function
 */
export const subscribeToDeviceData = (deviceId = 'PM_001', callback) => {

  if (!db) {
    console.warn('Firestore not initialized')
    // If we have cached data, return it as stale instead of an error
    if (lastKnownDataCache[deviceId]) {
      callback({ ...lastKnownDataCache[deviceId], _isStale: true, _offlineSince: lastKnownDataCache[deviceId]._lastSeen })
    } else {
      callback(null, new Error('Firestore not initialized'))
    }
    return () => { }
  }

  const docRef = doc(db, 'devices', deviceId, 'live', 'latest')
  console.log('Subscribing to Firestore document:', `devices/${deviceId}/live/latest`)

  const unsubscribe = onSnapshot(docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const raw = snapshot.data()
        const data = normalizeFirebaseData(raw)
        // Fresh reading — update cache and deliver with isStale: false
        const enriched = { ...data, _isStale: false, _lastSeen: Date.now() }
        lastKnownDataCache[deviceId] = enriched
        console.log('Firestore data received (normalized):', data)
        callback(enriched)
      } else {
        // Document exists in path but has no data (machine went offline / cleared)
        console.warn(`No data at Firestore path: devices/${deviceId}/live/latest — machine may be offline`)
        if (lastKnownDataCache[deviceId]) {
          // Return last known reading with stale flag so UI stays populated
          const stale = {
            ...lastKnownDataCache[deviceId],
            _isStale: true,
            _offlineSince: lastKnownDataCache[deviceId]._lastSeen,
          }
          callback(stale)
        } else {
          // No cached data at all — first load with no Firestore data
          callback(null)
        }
      }
    },
    (error) => {
      console.error('Firestore subscription error:', error.code, error.message)

      if (lastKnownDataCache[deviceId]) {
        // Network / permission error but we have cached data — show it as stale
        const stale = {
          ...lastKnownDataCache[deviceId],
          _isStale: true,
          _offlineSince: lastKnownDataCache[deviceId]._lastSeen,
        }
        console.warn('Firestore error — showing last known reading as stale')
        callback(stale)
      } else {
        // No cache — surface the error normally
        const msg = error.code === 'permission-denied'
          ? `Permission denied reading devices/${deviceId}/live/latest`
          : error.message
        callback(null, new Error(msg))
      }
    }
  )

  return () => { unsubscribe() }
}


/**
 * Get current device data once (non-realtime)
 * @param {string} deviceId - Device ID (default: PM_001)
 * @returns {Promise} Promise that resolves with device data
 */
export const getDeviceData = async (deviceId = 'PM_001') => {
  if (!db) {
    throw new Error('Firestore not initialized')
  }

  const docRef = doc(db, 'devices', deviceId, 'live', 'latest')

  try {
    const snapshot = await getDoc(docRef)
    if (snapshot.exists()) {
      return normalizeFirebaseData(snapshot.data())
    } else {
      throw new Error(`No data found at Firestore path: devices/${deviceId}/live/latest`)
    }
  } catch (error) {
    throw error
  }
}

export { db, app }

