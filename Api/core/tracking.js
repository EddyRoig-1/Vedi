// api/core/tracking.js - API Analytics and Performance Tracking
/**
 * API Tracking Module
 * 
 * Provides comprehensive analytics and performance tracking for all VediAPI methods.
 * This module collects metrics on API usage, response times, error rates, and
 * user patterns to support the maintenance dashboard and system optimization.
 * 
 * All tracking is designed to be non-intrusive and will not break main functionality
 * if the tracking system encounters errors.
 * 
 * NOTE: TRACKING FEATURES DISABLED TO REDUCE FIREBASE COSTS AND ERRORS
 */

// ============================================================================
// API CALL TRACKING AND ANALYTICS - DISABLED
// ============================================================================

/**
 * Track individual API call for analytics and monitoring - DISABLED
 * Records method usage, performance metrics, and outcome for dashboard analytics
 * @param {string} method - API method name that was called
 * @param {number} responseTime - Response time in milliseconds
 * @param {boolean} success - Whether the API call was successful
 * @param {Object} metadata - Additional data about the call (args, user, etc.)
 * @returns {Promise<void>} Resolves when tracking is complete (non-blocking)
 */
async function trackAPICall(method, responseTime, success = true, metadata = {}) {
  // DISABLED TO REDUCE FIREBASE COSTS
  return Promise.resolve();
}

/**
 * Create a wrapper function that adds tracking to any API method - DISABLED
 * This allows seamless integration of tracking into existing methods
 * @param {string} methodName - Name of the method being wrapped
 * @param {Function} originalMethod - Original method function to wrap
 * @returns {Function} Wrapped method with automatic tracking
 */
function withTracking(methodName, originalMethod) {
  // DISABLED - Return original method without tracking
  return originalMethod;
}

/**
 * Track user activity events (logins, signups, major actions) - DISABLED
 * Provides insights into user behavior patterns for analytics
 * @param {string} eventType - Type of activity ('login', 'signup', 'order_created', etc.)
 * @param {Object} eventData - Additional data about the event
 * @returns {Promise<void>} Resolves when tracking is complete
 */
async function trackUserActivity(eventType, eventData = {}) {
  // DISABLED TO REDUCE FIREBASE COSTS
  return Promise.resolve();
}

/**
 * Track system errors and exceptions for monitoring and debugging
 * Helps identify patterns in system failures and performance issues
 * @param {Error} error - Error object that occurred
 * @param {string} context - Context where the error occurred
 * @param {Object} additionalData - Additional debugging information
 * @returns {Promise<void>} Resolves when error tracking is complete
 */
async function trackError(error, context = 'unknown', additionalData = {}) {
  try {
    if (!window.getFirebaseDb) return;
    
    const db = window.getFirebaseDb();
    const auth = window.getFirebaseAuth();
    
    const errorData = {
      message: error.message,
      stack: error.stack,
      code: error.code,
      context,
      additionalData,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      userId: auth.currentUser?.uid || 'anonymous',
      sessionId: getSessionId(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      severity: determineSeverity(error, context)
    };
    
    await db.collection('systemErrors').add(errorData);
    
  } catch (trackingError) {
    console.debug('📊 Error tracking failed (non-critical):', trackingError.message);
  }
}

// ============================================================================
// REAL-TIME SUBSCRIPTION TRACKING (INJECTED FROM RESTAURANT-VENUE-SYNC) - DISABLED
// ============================================================================

/**
 * Track venue activity events for analytics - DISABLED
 * @param {string} venueId - Venue ID
 * @param {Object} activity - Activity data
 * @returns {Promise<void>}
 */
async function addVenueActivity(venueId, activity) {
  // DISABLED TO REDUCE FIREBASE COSTS
  return Promise.resolve();
}

/**
 * Track restaurant activity events for analytics - DISABLED
 * @param {string} restaurantId - Restaurant ID
 * @param {Object} activity - Activity data
 * @returns {Promise<void>}
 */
async function addRestaurantActivity(restaurantId, activity) {
  // DISABLED TO REDUCE FIREBASE COSTS
  return Promise.resolve();
}

// ============================================================================
// AVAILABILITY STATUS TRACKING (INJECTED FROM AVAILABLE-STATUS-API) - DISABLED
// ============================================================================

/**
 * Log status change for analytics - DISABLED
 * @param {string} restaurantId - Restaurant ID
 * @param {boolean} isOnline - New online status
 * @param {string} reason - Reason for change
 * @returns {Promise<void>}
 */
async function logStatusChange(restaurantId, isOnline, reason = '') {
  // DISABLED TO REDUCE FIREBASE COSTS
  return Promise.resolve();
}

// ============================================================================
// PERFORMANCE MONITORING - DISABLED
// ============================================================================

/**
 * Start performance measurement for a specific operation - DISABLED
 * Returns a function to end the measurement and record the timing
 * @param {string} operationName - Name of the operation being measured
 * @returns {Function} Function to call when operation completes
 */
function startPerformanceMeasurement(operationName) {
  const startTime = performance.now();
  
  return async function endMeasurement(success = true, metadata = {}) {
    // DISABLED - Just return elapsed time without tracking
    return performance.now() - startTime;
  };
}

/**
 * Track page load performance metrics - DISABLED
 * Provides insights into application loading performance
 */
function trackPageLoadPerformance() {
  // DISABLED TO REDUCE FIREBASE COSTS
  return;
}

// ============================================================================
// SESSION AND USER TRACKING - DISABLED
// ============================================================================

/**
 * Get or create session ID for tracking user sessions
 * Session ID persists for the duration of the browser session
 * @returns {string} Unique session identifier
 */
function getSessionId() {
  if (!window.vediAPISessionId) {
    window.vediAPISessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2);
  }
  return window.vediAPISessionId;
}

/**
 * Initialize session tracking - DISABLED
 * Records session start and sets up session duration tracking
 */
async function initializeSessionTracking() {
  // DISABLED TO REDUCE FIREBASE COSTS
  return Promise.resolve();
}

/**
 * Update session with user ID when user logs in - DISABLED
 * @param {string} userId - User ID from authentication
 */
async function updateSessionUser(userId) {
  // DISABLED TO REDUCE FIREBASE COSTS
  return Promise.resolve();
}

/**
 * Update session heartbeat to track active duration - DISABLED
 */
async function updateSessionHeartbeat() {
  // DISABLED TO REDUCE FIREBASE COSTS
  return Promise.resolve();
}

/**
 * Mark session as ended - DISABLED
 */
async function updateSessionEnd() {
  // DISABLED TO REDUCE FIREBASE COSTS
  return Promise.resolve();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine error severity based on error type and context
 * @param {Error} error - Error object
 * @param {string} context - Context where error occurred
 * @returns {string} Severity level ('low', 'medium', 'high', 'critical')
 */
function determineSeverity(error, context) {
  // Critical errors that break core functionality
  if (error.message.includes('Firebase') || error.message.includes('database')) {
    return 'critical';
  }
  
  // High severity for authentication errors
  if (context.includes('auth') || error.code?.startsWith('auth/')) {
    return 'high';
  }
  
  // Medium severity for API errors
  if (context.includes('API') || context.includes('api')) {
    return 'medium';
  }
  
  // Low severity for everything else
  return 'low';
}

/**
 * Get current system performance metrics
 * @returns {Object} Current performance and memory usage
 */
function getCurrentPerformanceMetrics() {
  const metrics = {
    timestamp: Date.now(),
    memory: null,
    timing: null
  };
  
  if (performance.memory) {
    metrics.memory = {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
    };
  }
  
  if (performance.timing) {
    const timing = performance.timing;
    metrics.timing = {
      loadTime: timing.loadEventEnd - timing.navigationStart,
      domReady: timing.domContentLoadedEventEnd - timing.navigationStart,
      responseTime: timing.responseEnd - timing.requestStart
    };
  }
  
  return metrics;
}

// ============================================================================
// GLOBAL EXPORTS AND VEDIAPI INTEGRATION
// ============================================================================

// Ensure VediAPI namespace exists
if (!window.VediAPI) {
  window.VediAPI = {};
}

// Attach tracking functions to VediAPI - MOST DISABLED
Object.assign(window.VediAPI, {
  // Core tracking functions - DISABLED (return dummy functions)
  trackAPICall,
  withTracking,
  trackUserActivity,
  trackError, // Keep this one for critical errors only
  
  // INJECTED: Real-time subscription tracking from restaurant-venue-sync - DISABLED
  addVenueActivity,
  addRestaurantActivity,
  
  // INJECTED: Availability status tracking from available-status-api - DISABLED
  logStatusChange,
  
  // Performance monitoring - DISABLED
  startPerformanceMeasurement,
  trackPageLoadPerformance,
  getCurrentPerformanceMetrics,
  
  // Session tracking - DISABLED
  getSessionId,
  initializeSessionTracking,
  updateSessionUser,
  updateSessionHeartbeat,
  updateSessionEnd
});

// Make global tracking function available for other modules - DISABLED
// window.trackAPICall = trackAPICall;
// window.withTracking = withTracking;

// Provide dummy functions to prevent errors
window.trackAPICall = () => Promise.resolve();
window.withTracking = (name, func) => func;

// Initialize tracking when module loads - DISABLED TO SAVE COSTS AND REDUCE ERRORS
// document.addEventListener('DOMContentLoaded', () => {
//   initializeSessionTracking();
//   trackPageLoadPerformance();
// });

console.log('📊 Enhanced API Tracking Module loaded - TRACKING DISABLED');
console.log('🚫 Session and performance tracking DISABLED to reduce Firestore costs');
console.log('🚫 No more session heartbeats, API call tracking, or performance metrics');
console.log('💰 This will significantly reduce your Firebase bill');
console.log('🔍 Only error tracking remains active for critical debugging');
console.log('🏢 Venue/Restaurant activity tracking DISABLED');
console.log('🔄 Status change logging DISABLED');
console.log('⚡ Performance monitoring returns local metrics only');
console.log('👤 Session tracking completely DISABLED');
console.log('🛡️ All functions return dummy values to prevent application breakage');
