// available-status-api.js - Restaurant Online/Offline Status Management API
// Complete API for managing restaurant availability status

// ============================================================================
// FIREBASE REFERENCE INITIALIZATION
// ============================================================================

// Create database reference getter that waits for initialization
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

// Initialize database references when Firebase is ready
function initializeAvailabilityAPI() {
  return new Promise((resolve, reject) => {
    if (typeof firebase === 'undefined') {
      reject(new Error('Firebase not loaded'));
      return;
    }

    const checkFirebaseInit = () => {
      try {
        if (firebase.apps.length > 0) {
          window.firebaseDb = firebase.firestore();
          window.firebaseAuth = firebase.auth();
          console.log('✅ Availability Status API database references initialized');
          resolve();
        } else {
          setTimeout(checkFirebaseInit, 100);
        }
      } catch (error) {
        reject(error);
      }
    };

    checkFirebaseInit();
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeAvailabilityAPI().catch(error => {
      console.error('❌ Availability Status API initialization failed:', error);
    });
  });
} else {
  initializeAvailabilityAPI().catch(error => {
    console.error('❌ Availability Status API initialization failed:', error);
  });
}

// ============================================================================
// RESTAURANT AVAILABILITY STATUS API
// ============================================================================

const AvailabilityStatusAPI = {
  
  /**
   * Update restaurant online/offline status
   * @param {string} restaurantId - Restaurant ID
   * @param {boolean} isOnline - Online status (true = online, false = offline)
   * @param {string} offlineReason - Optional reason when going offline
   * @returns {Promise<Object>} Updated restaurant status
   */
  async updateRestaurantStatus(restaurantId, isOnline, offlineReason = '') {
    try {
      const db = getFirebaseDb();
      const auth = getFirebaseAuth();
      
      if (!restaurantId) {
        throw new Error('Restaurant ID is required');
      }
      
      const updateData = {
        isOnline: isOnline,
        statusUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        statusUpdatedBy: auth.currentUser?.uid || 'system',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      // Add offline reason if going offline
      if (!isOnline && offlineReason.trim()) {
        updateData.offlineReason = offlineReason.trim();
      } else if (isOnline) {
        // Clear offline reason when going online
        updateData.offlineReason = firebase.firestore.FieldValue.delete();
      }
      
      // Log status change for analytics
      await this.logStatusChange(restaurantId, isOnline, offlineReason);
      
      // Update restaurant document
      await db.collection('restaurants').doc(restaurantId).update(updateData);
      
      // Get updated document
      const doc = await db.collection('restaurants').doc(restaurantId).get();
      const restaurantData = doc.data();
      
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
      console.error('❌ Update restaurant status error:', error);
      throw new Error(`Failed to update restaurant status: ${error.message}`);
    }
  },

  /**
   * Get restaurant online status
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Status information
   */
  async getRestaurantStatus(restaurantId) {
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
      
      return {
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
      
    } catch (error) {
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
  },

  /**
   * Get multiple restaurants status (for venue managers)
   * @param {Array} restaurantIds - Array of restaurant IDs
   * @returns {Promise<Object>} Status information for all restaurants
   */
  async getMultipleRestaurantStatus(restaurantIds) {
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
      
      console.log('✅ Retrieved status for', Object.keys(allStatuses).length, 'restaurants');
      
      return {
        statuses: allStatuses,
        success: true
      };
      
    } catch (error) {
      console.error('❌ Get multiple restaurant status error:', error);
      throw new Error(`Failed to get restaurant statuses: ${error.message}`);
    }
  },

  /**
   * Listen to restaurant status changes in real-time
   * @param {string} restaurantId - Restaurant ID
   * @param {Function} callback - Callback function for status updates
   * @returns {Function} Unsubscribe function
   */
  listenToRestaurantStatus(restaurantId, callback) {
    try {
      const db = getFirebaseDb();
      
      if (!restaurantId) {
        throw new Error('Restaurant ID is required');
      }
      
      if (typeof callback !== 'function') {
        throw new Error('Callback function is required');
      }
      
      console.log('🔄 Starting real-time status listener for restaurant:', restaurantId);
      
      return db.collection('restaurants').doc(restaurantId)
        .onSnapshot(doc => {
          if (doc.exists) {
            const data = doc.data();
            const status = {
              isOnline: data.isOnline !== false,
              offlineReason: data.offlineReason || '',
              statusUpdatedAt: data.statusUpdatedAt,
              statusUpdatedBy: data.statusUpdatedBy,
              restaurantName: data.name,
              restaurantId: restaurantId,
              timestamp: new Date().toISOString()
            };
            
            console.log('📡 Real-time status update:', {
              restaurant: data.name,
              status: status.isOnline ? 'ONLINE' : 'OFFLINE',
              reason: status.offlineReason || 'N/A'
            });
            
            callback(status);
          } else {
            console.warn('⚠️ Restaurant document not found:', restaurantId);
            callback({
              isOnline: false,
              offlineReason: 'Restaurant not found',
              error: 'Restaurant document not found'
            });
          }
        }, error => {
          console.error('❌ Restaurant status listener error:', error);
          callback({
            isOnline: true, // Default to online on error to avoid blocking customers
            offlineReason: '',
            error: error.message
          });
        });
        
    } catch (error) {
      console.error('❌ Listen to restaurant status error:', error);
      // Return empty function to avoid breaking code
      return () => {};
    }
  },

  /**
   * Listen to multiple restaurants status changes (for venue managers)
   * @param {Array} restaurantIds - Array of restaurant IDs
   * @param {Function} callback - Callback function for status updates
   * @returns {Function} Unsubscribe function
   */
  listenToMultipleRestaurantStatus(restaurantIds, callback) {
    try {
      const db = getFirebaseDb();
      
      if (!Array.isArray(restaurantIds) || restaurantIds.length === 0) {
        throw new Error('Valid restaurant IDs array is required');
      }
      
      console.log('🔄 Starting multi-restaurant status listener for', restaurantIds.length, 'restaurants');
      
      const unsubscribeFunctions = [];
      const statusMap = {};
      
      // Create individual listeners for each restaurant
      restaurantIds.forEach(restaurantId => {
        const unsubscribe = this.listenToRestaurantStatus(restaurantId, (status) => {
          statusMap[restaurantId] = status;
          
          // Call callback with all current statuses
          callback({
            statuses: { ...statusMap },
            updatedRestaurant: restaurantId,
            timestamp: new Date().toISOString()
          });
        });
        
        unsubscribeFunctions.push(unsubscribe);
      });
      
      // Return function that unsubscribes from all listeners
      return () => {
        console.log('🔄 Unsubscribing from', unsubscribeFunctions.length, 'restaurant status listeners');
        unsubscribeFunctions.forEach(unsub => unsub());
      };
      
    } catch (error) {
      console.error('❌ Listen to multiple restaurant status error:', error);
      return () => {};
    }
  },

  /**
   * Get restaurant status history (for analytics)
   * @param {string} restaurantId - Restaurant ID
   * @param {Object} options - Query options (limit, startDate, endDate)
   * @returns {Promise<Array>} Array of status change records
   */
  async getStatusHistory(restaurantId, options = {}) {
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
      
      console.log('✅ Retrieved status history:', history.length, 'records');
      
      return history;
      
    } catch (error) {
      console.error('❌ Get status history error:', error);
      throw new Error(`Failed to get status history: ${error.message}`);
    }
  },

  /**
   * Log status change for analytics
   * @param {string} restaurantId - Restaurant ID
   * @param {boolean} isOnline - New online status
   * @param {string} reason - Reason for change
   * @returns {Promise<void>}
   */
  async logStatusChange(restaurantId, isOnline, reason = '') {
    try {
      const db = getFirebaseDb();
      const auth = getFirebaseAuth();
      
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
  },

  /**
   * Get availability analytics for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @param {Object} options - Analytics options (days, groupBy)
   * @returns {Promise<Object>} Analytics data
   */
  async getAvailabilityAnalytics(restaurantId, options = {}) {
    try {
      const days = options.days || 7;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const history = await this.getStatusHistory(restaurantId, {
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
        
        const currentTime = current.timestamp.toDate();
        const nextTime = next.timestamp.toDate();
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
      
      return {
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
      
    } catch (error) {
      console.error('❌ Get availability analytics error:', error);
      throw new Error(`Failed to get availability analytics: ${error.message}`);
    }
  },

  /**
   * Bulk update multiple restaurants status (for venue managers)
   * @param {Array} updates - Array of {restaurantId, isOnline, reason}
   * @returns {Promise<Object>} Bulk update results
   */
  async bulkUpdateRestaurantStatus(updates) {
    try {
      const db = getFirebaseDb();
      
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
            statusUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          };
          
          if (!isOnline && reason.trim()) {
            updateData.offlineReason = reason.trim();
          } else if (isOnline) {
            updateData.offlineReason = firebase.firestore.FieldValue.delete();
          }
          
          batch.update(restaurantRef, updateData);
          
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
      
      console.log('✅ Bulk status update completed:', {
        successful: results.successful.length,
        failed: results.failed.length
      });
      
      return {
        ...results,
        success: true
      };
      
    } catch (error) {
      console.error('❌ Bulk update restaurant status error:', error);
      throw new Error(`Failed to bulk update restaurant status: ${error.message}`);
    }
  },

  /**
   * Check if restaurant should be automatically set offline (business hours)
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Recommendation for status change
   */
  async checkBusinessHours(restaurantId) {
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
};

// Make AvailabilityStatusAPI available globally
window.AvailabilityStatusAPI = AvailabilityStatusAPI;

// Helper function to format time duration
function formatDuration(milliseconds) {
  const minutes = Math.floor(milliseconds / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

// Helper function to get user-friendly offline reasons
function getOfflineReasonText(reasonKey) {
  const reasons = {
    'break': 'Taking a break',
    'busy': 'Too busy with orders',
    'kitchen': 'Kitchen issues',
    'inventory': 'Out of stock',
    'closed': 'Temporarily closed',
    'maintenance': 'Under maintenance',
    'staff': 'Staff shortage',
    'custom': 'Custom reason'
  };
  
  return reasons[reasonKey] || reasonKey || 'Temporarily unavailable';
}

// Add helper functions to the API
AvailabilityStatusAPI.formatDuration = formatDuration;
AvailabilityStatusAPI.getOfflineReasonText = getOfflineReasonText;

console.log('🟢🔴 Restaurant Availability Status API loaded successfully');
console.log('📊 Available methods:', Object.keys(AvailabilityStatusAPI).length, 'total methods');
console.log('🔄 Features:');
console.log('   ✅ Real-time status updates');
console.log('   📊 Status history and analytics');
console.log('   🏢 Multi-restaurant support for venues');
console.log('   ⚡ Bulk status updates');
console.log('   🕐 Business hours checking');
console.log('   📝 Comprehensive logging');
console.log('🚀 Ready for production use!');
