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

/**
 * Subscribe to real-time data from Firestore
 * @param {string} deviceId - Device ID (default: PM_001)
 * @param {function} callback - Callback function that receives the data snapshot
 * @returns {function} Unsubscribe function
 */
export const subscribeToDeviceData = (deviceId = 'PM_001', callback) => {

  if (!db) {
    console.warn('Firestore not initialized')
    callback(null, new Error('Firestore not initialized'))
    return () => { }
  }

  // Firestore path: devices/PM_001/live/latest
  // Structure: collection/document/subcollection/document
  const docRef = doc(db, 'devices', deviceId, 'live', 'latest')
  console.log('Subscribing to Firestore document:', `devices/${deviceId}/live/latest`)

  const unsubscribe = onSnapshot(docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const raw = snapshot.data()
        const data = normalizeFirebaseData(raw)
        console.log('Firestore data received (normalized):', data)
        callback(data)
      } else {
        console.warn(`No data found at Firestore path: devices/${deviceId}/live/latest`)
        // Don't treat empty data as error - just pass null
        callback(null)
      }
    },
    (error) => {
      console.error('Firestore subscription error:', error)
      console.error('Error code:', error.code)
      console.error('Error message:', error.message)

      // Check if it's a permission error
      if (error.code === 'permission-denied') {
        callback(null, new Error(`Permission denied. Please check Firestore Rules allow read access to: devices/${deviceId}/live/latest`))
      } else {
        callback(null, error)
      }
    }
  )

  // Return unsubscribe function
  return () => {
    unsubscribe()
  }
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

