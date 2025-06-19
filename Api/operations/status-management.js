// api/operations/status-management.js - Restaurant Status Management
/**
 * Status Management Module
 * 
 * Handles restaurant online/offline status management, business hours checking,
 * and availability status with comprehensive tracking and analytics.
 * All methods are properly wrapped in VediAPI for consistent access.
 */

// ============================================================================
// RESTAURANT STATUS MANAGEMENT
// ============================================================================

/**
 * Update restaurant online/offline status
 * @param {string} restaurantId - Restaurant ID
 * @param {boolean} isOnline - Online status (true = online, false = offline)
 * @param {string} offlineReason - Optional reason when going offline
 * @returns {Promise<Object>} Updated restaurant status
 */
async function updateRestaurantStatus(restaurantId, isOnline, offlineReason = '') {
  const endTracking = VediAPI.startPerformanceMeasurement('updateRestaurantStatus');
  
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    if (!restaurantId) {
      throw new Error('Restaurant ID is required');
    }
    
    const updateData = {
      isOnline: isOnline,
      acceptingOrders: isOnline, // If offline, stop accepting orders
      statusUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      statusUpdatedBy: auth.currentUser?.uid || 'system',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Add offline reason if going offline
    if (!isOnline && offlineReason.trim()) {
      updateData.offlineReason = VediAPI.sanitizeInput(offlineReason.trim());
    } else if (isOnline) {
      // Clear offline reason when going online
      updateData.offlineReason = firebase.firestore.FieldValue.delete();
    }
    
    // Log status change for analytics
    await logStatusChange(restaurantId, isOnline, offlineReason);
    
    // Update restaurant document
    await db.collection('restaurants').doc(restaurantId).update(updateData);
    
    // Get updated document
    const doc = await db.collection('restaurants').doc(restaurantId).get();
    const restaurantData = doc.data();
    
    // Track status change
    await VediAPI.trackUserActivity('restaurant_status_updated', {
      restaurantId: restaurantId,
      restaurantName: restaurantData.name,
      newStatus: isOnline ? 'online' : 'offline',
      reason: offlineReason || 'No reason provided'
    });
    
    await endTracking(true);
    
    console.log('✅ Restaurant status updated:', {
      restaurantId,
      restaurantName: restaurantData.name,
      status: isOnline ? 'ONLINE' : 'OFFLINE',
      reason: offlineReason || 'N/A'
    });
    
    return {
      id: doc.id,
      isOnline: restaurantData.isOnline,
      offlineReason: restaurantData.offlineReason || '',
      statusUpdatedAt: restaurantData.statusUpdatedAt,
      restaurantName: restaurantData.name,
      success: true
    };
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'updateRestaurantStatus', { restaurantId, isOnline });
    
    console.error('❌ Update restaurant status error:', error);
    throw error;
  }
}

/**
 * Get restaurant online status
 * @param {string} restaurantId - Restaurant ID
 * @returns {Promise<Object>} Status information
 */
async function getRestaurantStatus(restaurantId) {
  const endTracking = VediAPI.startPerformanceMeasurement('getRestaurantStatus');
  
  try {
    const db = getFirebaseDb();
    
    if (!restaurantId) {
      throw new Error('Restaurant ID is required');
    }
    
    const doc = await db.collection('restaurants').doc(restaurantId).get();
    
    if (!doc.exists) {
      throw new Error('Restaurant not found');
    }
    
    const restaurant = doc.data();
    
    const status = {
      isOnline: restaurant.isOnline !== false, // Default to true if not set
      offlineReason: restaurant.offlineReason || '',
      statusUpdatedAt: restaurant.statusUpdatedAt,
      statusUpdatedBy: restaurant.statusUpdatedBy,
      restaurantName: restaurant.name,
      restaurantId: restaurantId,
      phone: restaurant.phone || '',
      email: restaurant.email || '',
      success: true
    };
    
    await endTracking(true);
    return status;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getRestaurantStatus', { restaurantId });
    
    console.error('❌ Get restaurant status error:', error);
    
    // Return default online status if there's an error
    return {
      isOnline: true,
      offlineReason: '',
      statusUpdatedAt: null,
      restaurantName: 'Restaurant',
      restaurantId: restaurantId,
      success: false,
      error: error.message
    };
  }
}

/**
 * Listen to real-time restaurant status changes
 * @param {string} restaurantId - Restaurant ID
 * @param {Function} callback - Callback function for status updates
 * @returns {Function} Unsubscribe function
 */
function listenToRestaurantStatus(restaurantId, callback) {
  try {
    const db = getFirebaseDb();
    
    if (!restaurantId) {
      throw new Error('Restaurant ID is required');
    }
    
    if (typeof callback !== 'function') {
      throw new Error('Callback function is required');
    }
    
    console.log('📡 Starting real-time status listener for:', restaurantId);
    
    return db.collection('restaurants').doc(restaurantId)
      .onSnapshot(doc => {
        if (doc.exists) {
          const data = doc.data();
          const status = {
            isOnline: data.isOnline !== false,
            offlineReason: data.offlineReason || '',
            statusUpdatedAt: data.statusUpdatedAt,
            restaurantName: data.name,
            restaurantId: restaurantId
          };
          
          console.log('🔄 Status update received:', {
            restaurantId,
            status: status.isOnline ? 'ONLINE' : 'OFFLINE',
            reason: status.offlineReason || 'N/A'
          });
          
          callback(status);
        }
      }, error => {
        console.error('❌ Status listener error:', error);
        // Call callback with default status on error
        callback({
          isOnline: true,
          offlineReason: '',
          error: error.message
        });
      });
      
  } catch (error) {
    console.error('❌ Failed to setup status listener:', error);
    throw error;
  }
}

/**
 * Get multiple restaurants status (for venue managers)
 * @param {Array} restaurantIds - Array of restaurant IDs
 * @returns {Promise<Object>} Status information for all restaurants
 */
async function getMultipleRestaurantStatus(restaurantIds) {
  const endTracking = VediAPI.startPerformanceMeasurement('getMultipleRestaurantStatus');
  
  try {
    const db = getFirebaseDb();
    
    if (!Array.isArray(restaurantIds) || restaurantIds.length === 0) {
      throw new Error('Valid restaurant IDs array is required');
    }
    
    // Firebase 'in' queries are limited to 10 items, so we batch them
    const batches = [];
    for (let i = 0; i < restaurantIds.length; i += 10) {
      const batch = restaurantIds.slice(i, i + 10);
      batches.push(batch);
    }
    
    const allStatuses = {};
    
    for (const batch of batches) {
      const querySnapshot = await db.collection('restaurants')
        .where(firebase.firestore.FieldPath.documentId(), 'in', batch)
        .get();
      
      querySnapshot.docs.forEach(doc => {
        const data = doc.data();
        allStatuses[doc.id] = {
          isOnline: data.isOnline !== false,
          offlineReason: data.offlineReason || '',
          statusUpdatedAt: data.statusUpdatedAt,
          restaurantName: data.name,
          restaurantId: doc.id
        };
      });
    }
    
    await endTracking(true);
    
    console.log('✅ Retrieved status for', Object.keys(allStatuses).length, 'restaurants');
    
    return {
      statuses: allStatuses,
      success: true
    };
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getMultipleRestaurantStatus', { count: restaurantIds?.length });
    
    console.error('❌ Get multiple restaurant status error:', error);
    throw error;
  }
}

// ============================================================================
// BUSINESS HOURS AND AVAILABILITY
// ============================================================================

/**
 * Check if restaurant should be automatically set offline (business hours)
 * @param {string} restaurantId - Restaurant ID
 * @returns {Promise<Object>} Recommendation for status change
 */
async function checkBusinessHours(restaurantId) {
  const endTracking = VediAPI.startPerformanceMeasurement('checkBusinessHours');
  
  try {
    const db = getFirebaseDb();
    
    const doc = await db.collection('restaurants').doc(restaurantId).get();
    
    if (!doc.exists) {
      throw new Error('Restaurant not found');
    }
    
    const restaurant = doc.data();
    const now = new Date();
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'lowercase' });
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    
    // Check if restaurant has operating hours defined
    if (!restaurant.operatingHours || !restaurant.operatingHours[currentDay]) {
      await endTracking(true);
      
      return {
        isWithinHours: true,
        recommendation: 'online',
        reason: 'No operating hours defined',
        currentTime,
        currentDay
      };
    }
    
    const todayHours = restaurant.operatingHours[currentDay];
    let isWithinHours = false;
    
    // Check if current time falls within any of the operating periods
    for (const period of todayHours) {
      if (currentTime >= period.open && currentTime <= period.close) {
        isWithinHours = true;
        break;
      }
    }
    
    await endTracking(true);
    
    return {
      isWithinHours,
      recommendation: isWithinHours ? 'online' : 'offline',
      reason: isWithinHours ? 'Within business hours' : 'Outside business hours',
      currentTime,
      currentDay,
      todayHours,
      success: true
    };
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'checkBusinessHours', { restaurantId });
    
    console.error('❌ Check business hours error:', error);
    
    // Default to allowing online status if there's an error
    return {
      isWithinHours: true,
      recommendation: 'online',
      reason: 'Unable to determine business hours',
      error: error.message,
      success: false
    };
  }
}

/**
 * Set automatic business hours monitoring
 * @param {string} restaurantId - Restaurant ID
 * @param {boolean} enabled - Enable/disable automatic monitoring
 * @returns {Promise<Object>} Update result
 */
async function setAutomaticHoursMonitoring(restaurantId, enabled = true) {
  const endTracking = VediAPI.startPerformanceMeasurement('setAutomaticHoursMonitoring');
  
  try {
    const db = getFirebaseDb();
    
    if (!restaurantId) {
      throw new Error('Restaurant ID is required');
    }
    
    await db.collection('restaurants').doc(restaurantId).update({
      automaticHoursMonitoring: enabled,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    await VediAPI.trackUserActivity('automatic_hours_monitoring_updated', {
      restaurantId,
      enabled
    });
    
    await endTracking(true);
    
    console.log('✅ Automatic hours monitoring:', enabled ? 'ENABLED' : 'DISABLED');
    
    return {
      restaurantId,
      automaticHoursMonitoring: enabled,
      success: true
    };
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'setAutomaticHoursMonitoring', { restaurantId, enabled });
    
    console.error('❌ Set automatic hours monitoring error:', error);
    throw error;
  }
}

/**
 * Bulk update multiple restaurants status (for venue managers)
 * @param {Array} updates - Array of {restaurantId, isOnline, reason}
 * @returns {Promise<Object>} Bulk update results
 */
async function bulkUpdateRestaurantStatus(updates) {
  const endTracking = VediAPI.startPerformanceMeasurement('bulkUpdateRestaurantStatus');
  
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new Error('Valid updates array is required');
    }
    
    console.log('🔄 Starting bulk status update for', updates.length, 'restaurants');
    
    const batch = db.batch();
    const results = {
      successful: [],
      failed: [],
      total: updates.length
    };
    
    for (const update of updates) {
      try {
        const { restaurantId, isOnline, reason = '' } = update;
        
        if (!restaurantId) {
          results.failed.push({
            restaurantId: 'unknown',
            error: 'Restaurant ID is required'
          });
          continue;
        }
        
        const restaurantRef = db.collection('restaurants').doc(restaurantId);
        
        const updateData = {
          isOnline: isOnline,
          acceptingOrders: isOnline,
          statusUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          statusUpdatedBy: auth.currentUser?.uid || 'bulk_update',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (!isOnline && reason.trim()) {
          updateData.offlineReason = VediAPI.sanitizeInput(reason.trim());
        } else if (isOnline) {
          updateData.offlineReason = firebase.firestore.FieldValue.delete();
        }
        
        batch.update(restaurantRef, updateData);
        
        // Log individual status changes
        await logStatusChange(restaurantId, isOnline, reason);
        
        results.successful.push({
          restaurantId,
          isOnline,
          reason: reason || ''
        });
        
      } catch (error) {
        results.failed.push({
          restaurantId: update.restaurantId || 'unknown',
          error: error.message
        });
      }
    }
    
    // Commit the batch
    await batch.commit();
    
    // Track bulk update
    await VediAPI.trackUserActivity('bulk_status_update', {
      successful: results.successful.length,
      failed: results.failed.length,
      total: results.total,
      updatedBy: auth.currentUser?.uid || 'system'
    });
    
    await endTracking(true);
    
    console.log('✅ Bulk status update completed:', {
      successful: results.successful.length,
      failed: results.failed.length
    });
    
    return {
      ...results,
      success: true
    };
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'bulkUpdateRestaurantStatus', { updateCount: updates?.length });
    
    console.error('❌ Bulk update restaurant status error:', error);
    throw error;
  }
}

// ============================================================================
// STATUS ANALYTICS AND HISTORY
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
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    const logData = {
      restaurantId,
      isOnline,
      reason: VediAPI.sanitizeInput(reason) || '',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      changedBy: auth.currentUser?.uid || 'system',
      userAgent: navigator.userAgent,
      sessionId: VediAPI.getSessionId ? VediAPI.getSessionId() : 'unknown'
    };
    
    await db.collection('restaurantStatusHistory').add(logData);
    
    console.log('📝 Status change logged for analytics');
    
  } catch (error) {
    console.warn('⚠️ Failed to log status change (non-critical):', error);
    // Don't throw error as this is for analytics only
  }
}

/**
 * Get restaurant status history (for analytics)
 * @param {string} restaurantId - Restaurant ID
 * @param {Object} options - Query options (limit, startDate, endDate)
 * @returns {Promise<Array>} Array of status change records
 */
async function getStatusHistory(restaurantId, options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('getStatusHistory');
  
  try {
    const db = getFirebaseDb();
    
    if (!restaurantId) {
      throw new Error('Restaurant ID is required');
    }
    
    let query = db.collection('restaurantStatusHistory')
      .where('restaurantId', '==', restaurantId)
      .orderBy('timestamp', 'desc');
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    if (options.startDate) {
      query = query.where('timestamp', '>=', options.startDate);
    }
    
    if (options.endDate) {
      query = query.where('timestamp', '<=', options.endDate);
    }
    
    const querySnapshot = await query.get();
    const history = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    await endTracking(true);
    
    console.log('✅ Retrieved status history:', history.length, 'records');
    return history;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getStatusHistory', { restaurantId });
    
    console.error('❌ Get status history error:', error);
    throw error;
  }
}

/**
 * Get availability analytics for a restaurant
 * @param {string} restaurantId - Restaurant ID
 * @param {Object} options - Analytics options (days, groupBy)
 * @returns {Promise<Object>} Analytics data
 */
async function getAvailabilityAnalytics(restaurantId, options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('getAvailabilityAnalytics');
  
  try {
    const days = options.days || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const history = await getStatusHistory(restaurantId, {
      startDate,
      limit: 1000
    });
    
    // Calculate analytics
    let totalOnlineTime = 0;
    let totalOfflineTime = 0;
    let statusChanges = 0;
    const offlineReasons = {};
    const dailyStats = {};
    
    for (let i = 0; i < history.length - 1; i++) {
      const current = history[i];
      const next = history[i + 1];
      
      const currentTime = VediAPI.timestampToDate(current.timestamp);
      const nextTime = VediAPI.timestampToDate(next.timestamp);
      const duration = currentTime - nextTime;
      
      if (next.isOnline) {
        totalOnlineTime += duration;
      } else {
        totalOfflineTime += duration;
        
        // Count offline reasons
        const reason = next.reason || 'No reason specified';
        offlineReasons[reason] = (offlineReasons[reason] || 0) + 1;
      }
      
      statusChanges++;
      
      // Daily stats
      const day = nextTime.toDateString();
      if (!dailyStats[day]) {
        dailyStats[day] = { online: 0, offline: 0, changes: 0 };
      }
      
      if (next.isOnline) {
        dailyStats[day].online += duration;
      } else {
        dailyStats[day].offline += duration;
      }
      
      dailyStats[day].changes++;
    }
    
    const totalTime = totalOnlineTime + totalOfflineTime;
    const uptime = totalTime > 0 ? (totalOnlineTime / totalTime) * 100 : 100;
    
    const analytics = {
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString()
      },
      summary: {
        uptimePercentage: Math.round(uptime * 100) / 100,
        totalOnlineTime: Math.round(totalOnlineTime / (1000 * 60)), // minutes
        totalOfflineTime: Math.round(totalOfflineTime / (1000 * 60)), // minutes
        statusChanges,
        averageSessionLength: statusChanges > 0 ? Math.round((totalTime / statusChanges) / (1000 * 60)) : 0
      },
      offlineReasons,
      dailyStats,
      success: true
    };
    
    await endTracking(true);
    return analytics;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getAvailabilityAnalytics', { restaurantId });
    
    console.error('❌ Get availability analytics error:', error);
    throw error;
  }
}

/**
 * Get current system status and health check
 * @returns {Promise<Object>} System status information
 */
async function getSystemStatus() {
  const endTracking = VediAPI.startPerformanceMeasurement('getSystemStatus');
  
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    // Check Firebase connectivity
    const connectivityTest = await db.collection('_test').limit(1).get();
    
    const status = {
      firebase: {
        connected: true,
        authenticated: !!auth.currentUser,
        user: auth.currentUser?.uid || null
      },
      timestamp: new Date().toISOString(),
      api: {
        version: '1.0.0',
        environment: 'production'
      },
      success: true
    };
    
    await endTracking(true);
    return status;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    
    return {
      firebase: {
        connected: false,
        error: error.message
      },
      timestamp: new Date().toISOString(),
      success: false
    };
  }
}

// ============================================================================
// GLOBAL EXPORTS AND VEDIAPI INTEGRATION
// ============================================================================

// Ensure VediAPI namespace exists
if (!window.VediAPI) {
  window.VediAPI = {};
}

// Attach ALL status management functions to VediAPI
Object.assign(window.VediAPI, {
  // Core status management
  updateRestaurantStatus,
  getRestaurantStatus,
  listenToRestaurantStatus,
  getMultipleRestaurantStatus,
  
  // Business hours and availability
  checkBusinessHours,
  setAutomaticHoursMonitoring,
  bulkUpdateRestaurantStatus,
  
  // Analytics and history
  getStatusHistory,
  getAvailabilityAnalytics,
  logStatusChange,
  
  // System status
  getSystemStatus
});

// Create backward compatibility alias for existing code
window.AvailabilityStatusAPI = {
  updateRestaurantStatus: window.VediAPI.updateRestaurantStatus,
  getRestaurantStatus: window.VediAPI.getRestaurantStatus,
  listenToRestaurantStatus: window.VediAPI.listenToRestaurantStatus,
  getMultipleRestaurantStatus: window.VediAPI.getMultipleRestaurantStatus,
  checkBusinessHours: window.VediAPI.checkBusinessHours,
  getStatusHistory: window.VediAPI.getStatusHistory,
  getAvailabilityAnalytics: window.VediAPI.getAvailabilityAnalytics
};

console.log('🔄 Status Management Module loaded with VediAPI integration');
console.log('📊 Core: updateRestaurantStatus, getRestaurantStatus, listenToRestaurantStatus');
console.log('🏢 Multiple: getMultipleRestaurantStatus for venue managers');
console.log('🕐 Hours: checkBusinessHours, setAutomaticHoursMonitoring');
console.log('📋 Bulk: bulkUpdateRestaurantStatus for mass operations');
console.log('📈 Analytics: getStatusHistory, getAvailabilityAnalytics');
console.log('📝 Tracking: Comprehensive logging and system monitoring');
console.log('🔗 Compatibility: AvailabilityStatusAPI alias maintained');
console.log('✅ Complete restaurant availability management system with VediAPI');
