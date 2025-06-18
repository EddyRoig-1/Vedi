// operations/loss_incidents.js - Loss Incident Reporting and Management

// ============================================================================
// FIREBASE REFERENCE INITIALIZATION (MATCHES YOUR PATTERN)
// ============================================================================

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

// ============================================================================
// API TRACKING SYSTEM (MATCHES YOUR PATTERN)
// ============================================================================

async function trackAPICall(method, responseTime, success = true, metadata = {}) {
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    await db.collection('apiCalls').add({
      method,
      responseTime,
      success,
      metadata,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      date: new Date().toISOString().split('T')[0],
      hour: new Date().getHours(),
      userId: auth.currentUser?.uid || 'anonymous'
    });
  } catch (error) {
    console.debug('API tracking error:', error);
  }
}

function withTracking(methodName, originalMethod) {
  return async function(...args) {
    const startTime = Date.now();
    try {
      const result = await originalMethod.apply(this, args);
      const responseTime = Date.now() - startTime;
      await trackAPICall(methodName, responseTime, true, {
        args: args.length,
        resultType: typeof result
      });
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await trackAPICall(methodName, responseTime, false, {
        error: error.message,
        errorCode: error.code
      });
      throw error;
    }
  };
}

// ============================================================================
// LOSS INCIDENT MANAGEMENT API (EXACTLY LIKE YOUR VEDIAPI PATTERN)
// ============================================================================

const VediAPI = {
  
  /**
   * Create new loss incident (FIXED to handle undefined values)
   * @param {Object} incidentData - Incident information
   * @returns {Promise<Object>} Created incident
   */
  createLossIncident: withTracking('createLossIncident', async function(incidentData) {
    try {
      const db = getFirebaseDb();
      
      // Remove undefined values from the incident data
      const cleanIncidentData = {};
      
      Object.keys(incidentData).forEach(key => {
        if (incidentData[key] !== undefined && incidentData[key] !== null) {
          cleanIncidentData[key] = incidentData[key];
        }
      });
      
      const incident = {
        ...cleanIncidentData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      console.log('📝 Creating incident with clean data:', incident);
      
      const docRef = await db.collection('lossIncidents').add(incident);
      const doc = await docRef.get();
      
      console.log('✅ Loss incident created:', docRef.id);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Create loss incident error:', error);
      throw error;
    }
  }),

  /**
   * Get loss incidents for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @param {Object} options - Query options (limit, orderBy, timePeriod, type, severity)
   * @returns {Promise<Array>} Array of incidents
   */
  getLossIncidents: withTracking('getLossIncidents', async function(restaurantId, options = {}) {
    try {
      const db = getFirebaseDb();
      
      let query = db.collection('lossIncidents')
        .where('restaurantId', '==', restaurantId);
      
      // Add type filter
      if (options.type && options.type !== 'all') {
        query = query.where('type', '==', options.type);
      }
      
      // Add severity filter
      if (options.severity && options.severity !== 'all') {
        query = query.where('severity', '==', options.severity);
      }
      
      // Add status filter
      if (options.status && options.status !== 'all') {
        query = query.where('status', '==', options.status);
      }
      
      // Add ordering
      if (options.orderBy) {
        query = query.orderBy(options.orderBy, options.orderDirection || 'desc');
      } else {
        query = query.orderBy('createdAt', 'desc');
      }
      
      // Add limit
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      // Add time period filter
      if (options.timePeriod) {
        const startDate = this.getTimePeriodStart(options.timePeriod);
        if (startDate) {
          query = query.where('createdAt', '>=', startDate);
        }
      }
      
      const querySnapshot = await query.get();
      const incidents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      console.log('✅ Retrieved loss incidents:', incidents.length);
      return incidents;
      
    } catch (error) {
      console.error('❌ Get loss incidents error:', error);
      throw error;
    }
  }),

  /**
   * Get loss incidents for all restaurants in a venue
   * @param {string} venueId - Venue ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of incidents across venue
   */
  getLossIncidentsByVenue: withTracking('getLossIncidentsByVenue', async function(venueId, options = {}) {
    try {
      const db = getFirebaseDb();
      
      let query = db.collection('lossIncidents')
        .where('venueId', '==', venueId);
      
      // Add filters similar to getLossIncidents
      if (options.type && options.type !== 'all') {
        query = query.where('type', '==', options.type);
      }
      
      if (options.severity && options.severity !== 'all') {
        query = query.where('severity', '==', options.severity);
      }
      
      if (options.status && options.status !== 'all') {
        query = query.where('status', '==', options.status);
      }
      
      // Add ordering
      query = query.orderBy('createdAt', 'desc');
      
      // Add limit
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      // Add time period filter
      if (options.timePeriod) {
        const startDate = this.getTimePeriodStart(options.timePeriod);
        if (startDate) {
          query = query.where('createdAt', '>=', startDate);
        }
      }
      
      const querySnapshot = await query.get();
      const incidents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      console.log('✅ Retrieved venue loss incidents:', incidents.length);
      return incidents;
      
    } catch (error) {
      console.error('❌ Get venue loss incidents error:', error);
      throw error;
    }
  }),

  /**
   * Update loss incident
   * @param {string} incidentId - Incident ID
   * @param {Object} updateData - Updated data
   * @returns {Promise<Object>} Updated incident
   */
  updateLossIncident: withTracking('updateLossIncident', async function(incidentId, updateData) {
    try {
      const db = getFirebaseDb();
      
      const data = {
        ...updateData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection('lossIncidents').doc(incidentId).update(data);
      
      const doc = await db.collection('lossIncidents').doc(incidentId).get();
      
      console.log('✅ Loss incident updated:', incidentId);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Update loss incident error:', error);
      throw error;
    }
  }),

  /**
   * Delete loss incident
   * @param {string} incidentId - Incident ID
   */
  deleteLossIncident: withTracking('deleteLossIncident', async function(incidentId) {
    try {
      const db = getFirebaseDb();
      
      await db.collection('lossIncidents').doc(incidentId).delete();
      console.log('✅ Loss incident deleted:', incidentId);
    } catch (error) {
      console.error('❌ Delete loss incident error:', error);
      throw error;
    }
  }),

  /**
   * Get loss analytics for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @param {string} timePeriod - Time period (today, week, month, quarter, year)
   * @returns {Promise<Object>} Analytics data
   */
  getLossAnalytics: withTracking('getLossAnalytics', async function(restaurantId, timePeriod = 'month') {
    try {
      const db = getFirebaseDb();
      const startDate = this.getTimePeriodStart(timePeriod);
      
      let query = db.collection('lossIncidents')
        .where('restaurantId', '==', restaurantId);
      
      if (startDate) {
        query = query.where('createdAt', '>=', startDate);
      }
      
      const querySnapshot = await query.get();
      const incidents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Calculate analytics
      const analytics = this.calculateLossAnalytics(incidents);
      
      console.log('✅ Retrieved loss analytics for restaurant:', analytics);
      return analytics;
      
    } catch (error) {
      console.error('❌ Get loss analytics error:', error);
      throw error;
    }
  }),

  /**
   * Get loss analytics for a venue
   * @param {string} venueId - Venue ID
   * @param {string} timePeriod - Time period
   * @returns {Promise<Object>} Venue analytics data
   */
  getVenueLossAnalytics: withTracking('getVenueLossAnalytics', async function(venueId, timePeriod = 'month') {
    try {
      const db = getFirebaseDb();
      const startDate = this.getTimePeriodStart(timePeriod);
      
      let query = db.collection('lossIncidents')
        .where('venueId', '==', venueId);
      
      if (startDate) {
        query = query.where('createdAt', '>=', startDate);
      }
      
      const querySnapshot = await query.get();
      const incidents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Calculate venue-wide analytics
      const analytics = this.calculateLossAnalytics(incidents, true);
      
      console.log('✅ Retrieved venue loss analytics:', analytics);
      return analytics;
      
    } catch (error) {
      console.error('❌ Get venue loss analytics error:', error);
      throw error;
    }
  }),

  /**
   * Listen to real-time loss incident updates for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @param {Function} callback - Callback function for updates
   * @returns {Function} Unsubscribe function
   */
  listenToLossIncidents(restaurantId, callback) {
    const db = getFirebaseDb();
    
    return db.collection('lossIncidents')
      .where('restaurantId', '==', restaurantId)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        const incidents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(incidents);
      });
  },

  /**
   * Listen to real-time loss incident updates for a venue
   * @param {string} venueId - Venue ID
   * @param {Function} callback - Callback function for updates
   * @returns {Function} Unsubscribe function
   */
  listenToVenueLossIncidents(venueId, callback) {
    const db = getFirebaseDb();
    
    return db.collection('lossIncidents')
      .where('venueId', '==', venueId)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        const incidents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(incidents);
      });
  },

  // ============================================================================
  // HELPER METHODS (EXACTLY LIKE YOUR PATTERNS)
  // ============================================================================

  /**
   * Calculate loss analytics from incidents array
   * @param {Array} incidents - Array of incident objects
   * @param {boolean} isVenue - Whether this is venue-wide analytics
   * @returns {Object} Analytics object
   */
  calculateLossAnalytics(incidents, isVenue = false) {
    const analytics = {
      totalIncidents: incidents.length,
      totalLoss: 0,
      byType: {},
      bySeverity: { low: 0, medium: 0, high: 0 },
      byStatus: { reported: 0, investigating: 0, resolved: 0, closed: 0 },
      averageLoss: 0,
      trends: {
        daily: {},
        weekly: {},
        monthly: {}
      }
    };
    
    // Calculate totals and breakdowns
    incidents.forEach(incident => {
      const amount = incident.amount || 0;
      analytics.totalLoss += amount;
      
      // By type
      const type = incident.type || 'other';
      analytics.byType[type] = (analytics.byType[type] || 0) + amount;
      
      // By severity
      const severity = incident.severity || 'medium';
      analytics.bySeverity[severity] = (analytics.bySeverity[severity] || 0) + 1;
      
      // By status
      const status = incident.status || 'reported';
      analytics.byStatus[status] = (analytics.byStatus[status] || 0) + 1;
      
      // Trends by date
      if (incident.createdAt) {
        const date = this.timestampToDate(incident.createdAt);
        const dayKey = date.toISOString().split('T')[0];
        const weekKey = this.getWeekKey(date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        analytics.trends.daily[dayKey] = (analytics.trends.daily[dayKey] || 0) + amount;
        analytics.trends.weekly[weekKey] = (analytics.trends.weekly[weekKey] || 0) + amount;
        analytics.trends.monthly[monthKey] = (analytics.trends.monthly[monthKey] || 0) + amount;
      }
    });
    
    // Calculate average
    analytics.averageLoss = incidents.length > 0 ? analytics.totalLoss / incidents.length : 0;
    
    return analytics;
  },

  /**
   * Get week key for date
   * @param {Date} date - Date object
   * @returns {string} Week key (YYYY-WNN)
   */
  getWeekKey(date) {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(((date - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
  },

  /**
   * Get start date for time period
   * @param {string} timePeriod - Time period string
   * @returns {Date|null} Start date or null
   */
  getTimePeriodStart(timePeriod) {
    const now = new Date();
    
    switch (timePeriod) {
      case 'today':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'week':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 7);
        return weekStart;
      case 'month':
        return new Date(now.getFullYear(), now.getMonth(), 1);
      case 'quarter':
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
        return new Date(now.getFullYear(), quarterMonth, 1);
      case 'year':
        return new Date(now.getFullYear(), 0, 1);
      default:
        return null;
    }
  },

  /**
   * Convert Firebase timestamp to Date
   * @param {Object} timestamp - Firebase timestamp
   * @returns {Date} JavaScript Date object
   */
  timestampToDate(timestamp) {
    if (timestamp && timestamp.toDate) {
      return timestamp.toDate();
    }
    return new Date(timestamp);
  }
};

// Make VediAPI available globally (EXACTLY LIKE YOUR PATTERN)
window.VediAPI = VediAPI;

// Legacy support - also make it available as FirebaseAPI for backward compatibility
window.FirebaseAPI = VediAPI;

console.log('📋 VediAPI Loss Incidents module loaded successfully');
console.log('🔧 Available loss incident methods:', Object.keys(VediAPI).length, 'total methods');
console.log('🚀 Ready for loss incident management!');