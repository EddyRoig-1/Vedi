// api/core/firebase-init.js - Firebase Initialization and Database Reference Management
/**
 * Firebase Initialization Module
 * 
 * Handles Firebase app initialization, database reference management, and provides
 * centralized access to Firebase services throughout the VediAPI system.
 * 
 * This module ensures Firebase is properly initialized before other modules attempt
 * to use Firebase services, preventing initialization race conditions.
 */

// ============================================================================
// FIREBASE REFERENCE INITIALIZATION AND MANAGEMENT
// ============================================================================

/**
 * Get Firebase Firestore database reference
 * Creates and caches database reference for consistent access across modules
 * @returns {Object} Firebase Firestore database instance
 * @throws {Error} If Firebase is not properly initialized
 */
function getFirebaseDb() {
  if (window.firebaseDb) {
    return window.firebaseDb;
  } else if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
    window.firebaseDb = firebase.firestore();
    return window.firebaseDb;
  } else {
    throw new Error('Firebase database not initialized. Please ensure Firebase is loaded.');
  }
}

/**
 * Get Firebase Authentication reference
 * Creates and caches auth reference for consistent access across modules
 * @returns {Object} Firebase Auth instance
 * @throws {Error} If Firebase is not properly initialized
 */
function getFirebaseAuth() {
  if (window.firebaseAuth) {
    return window.firebaseAuth;
  } else if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
    window.firebaseAuth = firebase.auth();
    return window.firebaseAuth;
  } else {
    throw new Error('Firebase auth not initialized. Please ensure Firebase is loaded.');
  }
}

/**
 * Initialize Firebase API with proper error handling and retry logic
 * Ensures Firebase is fully loaded before initializing database references
 * @returns {Promise<void>} Resolves when Firebase is properly initialized
 */
function initializeFirebaseAPI() {
  return new Promise((resolve, reject) => {
    if (typeof firebase === 'undefined') {
      reject(new Error('Firebase SDK not loaded. Please check your script tags.'));
      return;
    }

    const checkFirebaseInit = () => {
      try {
        if (firebase.apps.length > 0) {
          // Initialize global references
          window.firebaseDb = firebase.firestore();
          window.firebaseAuth = firebase.auth();
          
          console.log('✅ Firebase API core initialization complete');
          console.log('🔧 Firebase project:', firebase.app().options.projectId);
          console.log('🔧 Database references cached globally');
          
          resolve();
        } else {
          // Retry after 100ms if Firebase app not yet initialized
          setTimeout(checkFirebaseInit, 100);
        }
      } catch (error) {
        console.error('❌ Firebase initialization error:', error);
        reject(error);
      }
    };

    checkFirebaseInit();
  });
}

/**
 * Check Firebase configuration and connectivity
 * Provides detailed diagnostics for troubleshooting Firebase issues
 * @returns {Object} Firebase configuration status and diagnostics
 */
function checkFirebaseStatus() {
  const status = {
    sdkLoaded: typeof firebase !== 'undefined',
    appInitialized: false,
    projectId: null,
    authDomain: null,
    databaseUrl: null,
    firestoreReady: false,
    authReady: false,
    timestamp: new Date().toISOString()
  };

  try {
    if (status.sdkLoaded && firebase.apps.length > 0) {
      const app = firebase.app();
      status.appInitialized = true;
      status.projectId = app.options.projectId;
      status.authDomain = app.options.authDomain;
      status.databaseUrl = app.options.databaseURL;
      
      // Check Firestore availability
      try {
        firebase.firestore();
        status.firestoreReady = true;
      } catch (error) {
        status.firestoreError = error.message;
      }
      
      // Check Auth availability
      try {
        firebase.auth();
        status.authReady = true;
      } catch (error) {
        status.authError = error.message;
      }
    }
  } catch (error) {
    status.error = error.message;
  }

  return status;
}

/**
 * Verify Firebase services are operational
 * Performs basic connectivity tests to ensure Firebase services are working
 * @returns {Promise<Object>} Service connectivity test results
 */
async function verifyFirebaseServices() {
  const results = {
    firestore: { available: false, tested: false },
    auth: { available: false, tested: false },
    timestamp: new Date().toISOString()
  };

  try {
    // Test Firestore connectivity
    const db = getFirebaseDb();
    await db.collection('_health_check').limit(1).get();
    results.firestore = { available: true, tested: true, latency: Date.now() };
  } catch (error) {
    results.firestore = { 
      available: false, 
      tested: true, 
      error: error.message 
    };
  }

  try {
    // Test Auth service availability
    const auth = getFirebaseAuth();
    auth.onAuthStateChanged(() => {}); // Test auth service
    results.auth = { available: true, tested: true };
  } catch (error) {
    results.auth = { 
      available: false, 
      tested: true, 
      error: error.message 
    };
  }

  return results;
}

/**
 * Check if Firebase is ready for use
 * Tests if all required Firebase services are initialized and available
 * @returns {boolean} True if Firebase is ready, false otherwise
 */
function isFirebaseReady() {
  try {
    return !!(
      typeof firebase !== 'undefined' &&
      firebase.apps.length > 0 &&
      window.firebaseAuth &&
      window.firebaseDb &&
      window.firebaseAnalytics
    );
  } catch (error) {
    return false;
  }
}

// ============================================================================
// GLOBAL INITIALIZATION AND SETUP
// ============================================================================

// Initialize when DOM is ready or immediately if already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await initializeFirebaseAPI();
    } catch (error) {
      console.error('❌ Firebase API initialization failed on DOM ready:', error);
    }
  });
} else {
  // DOM already loaded, initialize immediately
  initializeFirebaseAPI().catch(error => {
    console.error('❌ Firebase API initialization failed on immediate load:', error);
  });
}

// ============================================================================
// GLOBAL EXPORTS AND VEDIAPI INTEGRATION
// ============================================================================

// Initialize VediAPI namespace if it doesn't exist
if (!window.VediAPI) {
  window.VediAPI = {};
}

// Attach Firebase utility functions to VediAPI
Object.assign(window.VediAPI, {
  // Database reference functions
  getFirebaseDb,
  getFirebaseAuth,
  
  // Initialization and status functions
  initializeFirebaseAPI,
  checkFirebaseStatus,
  verifyFirebaseServices,
  isFirebaseReady
});

// Also make functions available globally for internal module use
window.getFirebaseDb = getFirebaseDb;
window.getFirebaseAuth = getFirebaseAuth;
// This is exactly what the login page expects:
window.isFirebaseReady = isFirebaseReady;

console.log('🔥 Firebase Core Initialization Module loaded');
console.log('📚 Functions: getFirebaseDb, getFirebaseAuth, initializeFirebaseAPI');
console.log('🔧 Status: checkFirebaseStatus, verifyFirebaseServices, isFirebaseReady');
console.log('✅ Global Firebase references will be available to all modules');