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
 */

// ============================================================================
// API CALL TRACKING AND ANALYTICS
// ============================================================================

/**
 * Track individual API call for analytics and monitoring
 * Records method usage, performance metrics, and outcome for dashboard analytics
 * @param {string} method - API method name that was called
 * @param {number} responseTime - Response time in milliseconds
 * @param {boolean} success - Whether the API call was successful
 * @param {Object} metadata - Additional data about the call (args, user, etc.)
 * @returns {Promise<void>} Resolves when tracking is complete (non-blocking)
 */
async function trackAPICall(method, responseTime, success = true, metadata = {}) {
  try {
    // Skip tracking if Firebase not available to avoid breaking main functionality
    if (!window.getFirebaseDb) {
      return;
    }
    
    const db = window.getFirebaseDb();
    const auth = window.getFirebaseAuth();
    
    const trackingData = {
      method,
      responseTime,
      success,
      metadata: metadata || {},
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      date: new Date().toISOString().split('T')[0], // YYYY-MM-DD for daily analytics
      hour: new Date().getHours(),
      userId: auth.currentUser?.uid || 'anonymous',
      userAgent: navigator.userAgent,
      sessionId: getSessionId()
    };
    
    // Use add() instead of set() to allow multiple calls per method
    await db.collection('apiCalls').add(trackingData);
    
  } catch (error) {
    // Silent fail - tracking should never break main functionality
    console.debug('📊 API tracking error (non-critical):', error.message);
  }
}

/**
 * Create a wrapper function that adds tracking to any API method
 * This allows seamless integration of tracking into existing methods
 * @param {string} methodName - Name of the method being wrapped
 * @param {Function} originalMethod - Original method function to wrap
 * @returns {Function} Wrapped method with automatic tracking
 */
function withTracking(methodName, originalMethod) {
  return async function(...args) {
    const startTime = Date.now();
    
    try {
      // Execute the original method
      const result = await originalMethod.apply(this, args);
      
      // Track successful call
      const responseTime = Date.now() - startTime;
      await trackAPICall(methodName, responseTime, true, {
        args: args.length,
        resultType: typeof result,
        hasResult: !!result
      });
      
      return result;
      
    } catch (error) {
      // Track failed call
      const responseTime = Date.now() - startTime;
      await trackAPICall(methodName, responseTime, false, {
        error: error.message,
        errorCode: error.code,
        args: args.length
      });
      
      // Re-throw the original error
      throw error;
    }
  };
}

/**
 * Track user activity events (logins, signups, major actions)
 * Provides insights into user behavior patterns for analytics
 * @param {string} eventType - Type of activity ('login', 'signup', 'order_created', etc.)
 * @param {Object} eventData - Additional data about the event
 * @returns {Promise<void>} Resolves when tracking is complete
 */
async function trackUserActivity(eventType, eventData = {}) {
  try {
    if (!window.getFirebaseDb) return;
    
    const db = window.getFirebaseDb();
    const auth = window.getFirebaseAuth();
    
    const activityData = {
      eventType,
      eventData,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      userId: auth.currentUser?.uid || 'anonymous',
      sessionId: getSessionId(),
      userAgent: navigator.userAgent,
      referrer: document.referrer,
      url: window.location.href
    };
    
    await db.collection('userActivity').add(activityData);
    
  } catch (error) {
    console.debug('📊 User activity tracking error (non-critical):', error.message);
  }
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
// REAL-TIME SUBSCRIPTION TRACKING (INJECTED FROM RESTAURANT-VENUE-SYNC)
// ============================================================================

/**
 * Track venue activity events for analytics
 * @param {string} venueId - Venue ID
 * @param {Object} activity - Activity data
 * @returns {Promise<void>}
 */
async function addVenueActivity(venueId, activity) {
  try {
    const db = window.getFirebaseDb();
    const auth = window.getFirebaseAuth();
    
    const activityData = {
      venueId: venueId,
      ...activity,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser?.uid || null
    };

    await db.collection('venueActivity').add(activityData);

  } catch (error) {
    console.error('❌ Error adding venue activity:', error);
    // Don't throw - activity logging shouldn't break main functionality
  }
}

/**
 * Track restaurant activity events for analytics
 * @param {string} restaurantId - Restaurant ID
 * @param {Object} activity - Activity data
 * @returns {Promise<void>}
 */
async function addRestaurantActivity(restaurantId, activity) {
  try {
    const db = window.getFirebaseDb();
    const auth = window.getFirebaseAuth();
    
    const activityData = {
      restaurantId: restaurantId,
      ...activity,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser?.uid || null
    };

    await db.collection('restaurantActivity').add(activityData);

  } catch (error) {
    console.error('❌ Error adding restaurant activity:', error);
    // Don't throw - activity logging shouldn't break main functionality
  }
}

// ============================================================================
// AVAILABILITY STATUS TRACKING (INJECTED FROM AVAILABLE-STATUS-API)
// ============================================================================

/**
 * Log status change for analytics
 * @param {string} restaurantId - Restaurant ID
 * @param {boolean} isOnline - New online status
 * @param {string} reason - Reason for change
 * @returns {Promise<void>}
 */
async function logStatusChange(restaurantId, isOnline, reason = '') {
  try {
    const db = window.getFirebaseDb();
    const auth = window.getFirebaseAuth();
    
    const logData = {
      restaurantId,
      isOnline,
      reason: reason || '',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      changedBy: auth.currentUser?.uid || 'system',
      userAgent: navigator.userAgent,
      ipAddress: 'unknown' // Would need server-side logging for real IP
    };
    
    await db.collection('restaurantStatusHistory').add(logData);
    
    console.log('📝 Status change logged for analytics');
    
  } catch (error) {
    console.warn('⚠️ Failed to log status change (non-critical):', error);
    // Don't throw error as this is for analytics only
  }
}

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

/**
 * Start performance measurement for a specific operation
 * Returns a function to end the measurement and record the timing
 * @param {string} operationName - Name of the operation being measured
 * @returns {Function} Function to call when operation completes
 */
function startPerformanceMeasurement(operationName) {
  const startTime = performance.now();
  const startMemory = performance.memory ? performance.memory.usedJSHeapSize : null;
  
  return async function endMeasurement(success = true, metadata = {}) {
    try {
      const endTime = performance.now();
      const duration = endTime - startTime;
      const endMemory = performance.memory ? performance.memory.usedJSHeapSize : null;
      const memoryDelta = startMemory && endMemory ? endMemory - startMemory : null;
      
      if (!window.getFirebaseDb) return duration;
      
      const db = window.getFirebaseDb();
      
      const performanceData = {
        operationName,
        duration,
        memoryDelta,
        success,
        metadata,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        sessionId: getSessionId()
      };
      
      await db.collection('performanceMetrics').add(performanceData);
      return duration;
      
    } catch (error) {
      console.debug('📊 Performance tracking error (non-critical):', error.message);
      return performance.now() - startTime;
    }
  };
}

/**
 * Track page load performance metrics
 * Provides insights into application loading performance
 */
function trackPageLoadPerformance() {
  try {
    // Wait for page to fully load
    window.addEventListener('load', async () => {
      if (!performance.timing || !window.getFirebaseDb) return;
      
      const timing = performance.timing;
      const loadTime = timing.loadEventEnd - timing.navigationStart;
      const domContentLoaded = timing.domContentLoadedEventEnd - timing.navigationStart;
      const firstPaint = performance.getEntriesByType('paint').find(entry => entry.name === 'first-paint');
      
      const db = window.getFirebaseDb();
      
      const performanceData = {
        type: 'page_load',
        loadTime,
        domContentLoaded,
        firstPaintTime: firstPaint ? firstPaint.startTime : null,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        sessionId: getSessionId()
      };
      
      await db.collection('performanceMetrics').add(performanceData);
      
    });
  } catch (error) {
    console.debug('📊 Page load tracking setup error:', error.message);
  }
}

// ============================================================================
// SESSION AND USER TRACKING
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
 * Initialize session tracking
 * Records session start and sets up session duration tracking
 */
async function initializeSessionTracking() {
  try {
    if (!window.getFirebaseDb) return;
    
    const sessionId = getSessionId();
    const db = window.getFirebaseDb();
    
    const sessionData = {
      sessionId,
      startTime: firebase.firestore.FieldValue.serverTimestamp(),
      userAgent: navigator.userAgent,
      referrer: document.referrer,
      initialUrl: window.location.href,
      userId: null // Will be updated when user logs in
    };
    
    await db.collection('userSessions').doc(sessionId).set(sessionData);
    
    // Track session end when page unloads
    window.addEventListener('beforeunload', () => {
      updateSessionEnd();
    });
    
    // Update session periodically to track duration
    setInterval(() => {
      updateSessionHeartbeat();
    }, 30000); // Every 30 seconds
    
  } catch (error) {
    console.debug('📊 Session tracking initialization error:', error.message);
  }
}

/**
 * Update session with user ID when user logs in
 * @param {string} userId - User ID from authentication
 */
async function updateSessionUser(userId) {
  try {
    if (!window.getFirebaseDb) return;
    
    const sessionId = getSessionId();
    const db = window.getFirebaseDb();
    
    await db.collection('userSessions').doc(sessionId).update({
      userId,
      loginTime: firebase.firestore.FieldValue.serverTimestamp()
    });
    
  } catch (error) {
    console.debug('📊 Session user update error:', error.message);
  }
}

/**
 * Update session heartbeat to track active duration
 */
async function updateSessionHeartbeat() {
  try {
    if (!window.getFirebaseDb) return;
    
    const sessionId = getSessionId();
    const db = window.getFirebaseDb();
    
    await db.collection('userSessions').doc(sessionId).update({
      lastActivity: firebase.firestore.FieldValue.serverTimestamp()
    });
    
  } catch (error) {
    console.debug('📊 Session heartbeat error:', error.message);
  }
}

/**
 * Mark session as ended
 */
async function updateSessionEnd() {
  try {
    if (!window.getFirebaseDb) return;
    
    const sessionId = getSessionId();
    const db = window.getFirebaseDb();
    
    await db.collection('userSessions').doc(sessionId).update({
      endTime: firebase.firestore.FieldValue.serverTimestamp()
    });
    
  } catch (error) {
    console.debug('📊 Session end tracking error:', error.message);
  }
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

// Attach tracking functions to VediAPI
Object.assign(window.VediAPI, {
  // Core tracking functions
  trackAPICall,
  withTracking,
  trackUserActivity,
  trackError,
  
  // INJECTED: Real-time subscription tracking from restaurant-venue-sync
  addVenueActivity,
  addRestaurantActivity,
  
  // INJECTED: Availability status tracking from available-status-api
  logStatusChange,
  
  // Performance monitoring
  startPerformanceMeasurement,
  trackPageLoadPerformance,
  getCurrentPerformanceMetrics,
  
  // Session tracking
  getSessionId,
  initializeSessionTracking,
  updateSessionUser,
  updateSessionHeartbeat,
  updateSessionEnd
});

// Make global tracking function available for other modules
window.trackAPICall = trackAPICall;
window.withTracking = withTracking;

// Initialize tracking when module loads
document.addEventListener('DOMContentLoaded', () => {
  initializeSessionTracking();
  trackPageLoadPerformance();
});

console.log('📊 Enhanced API Tracking Module loaded');
console.log('📈 Features: API call tracking, performance monitoring, session tracking');
console.log('🔍 Analytics: trackAPICall, trackUserActivity, trackError');
console.log('🏢 INJECTED: addVenueActivity, addRestaurantActivity from restaurant-venue-sync');
console.log('🔄 INJECTED: logStatusChange from available-status-api');
console.log('⚡ Performance: startPerformanceMeasurement, trackPageLoadPerformance');
console.log('👤 Sessions: Session tracking initialized automatically');
console.log('🛡️ Non-intrusive: All tracking failures are silent and non-blocking');