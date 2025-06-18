// payments/revenue_analytics.js - Revenue Analytics and Reporting

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
// REVENUE ANALYTICS API (EXACTLY LIKE YOUR VEDIAPI PATTERN)
// ============================================================================

const VediAPI = {

  /**
   * Get fee analytics - ENHANCED to include venue fee revenue tracking
   * @param {string} timePeriod - Time period (today, week, month, year)
   * @param {string} restaurantId - Optional restaurant filter
   * @returns {Promise<Object>} Fee analytics including venue fees
   */
  getFeeAnalytics: withTracking('getFeeAnalytics', async function(timePeriod = 'month', restaurantId = null) {
    try {
      const db = getFirebaseDb();
      const startDate = this.getTimePeriodStart(timePeriod);
      
      let query = db.collection('orders');
      
      if (startDate) {
        query = query.where('createdAt', '>=', startDate);
      }
      
      if (restaurantId) {
        query = query.where('restaurantId', '==', restaurantId);
      }
      
      const ordersSnapshot = await query.get();
      
      let totalRevenue = 0;
      let totalServiceFees = 0;
      let totalVenueFees = 0; // ENHANCED: Track venue fees
      let totalStripeFees = 0;
      let totalTax = 0;
      let orderCount = 0;
      const revenueByRestaurant = {};
      const revenueByVenue = {}; // ENHANCED: Track venue revenue
      
      ordersSnapshot.docs.forEach(doc => {
        const order = doc.data();
        if (order.status === 'completed') {
          totalRevenue += order.total || 0;
          totalServiceFees += order.serviceFee || 0;
          totalVenueFees += order.venueFee || 0; // ENHANCED: Add venue fees
          totalStripeFees += order.stripeFee || 0;
          totalTax += order.tax || 0;
          orderCount++;
          
          const restId = order.restaurantId;
          const venueId = order.venueId; // ENHANCED: Get venue ID from order
          
          if (!revenueByRestaurant[restId]) {
            revenueByRestaurant[restId] = {
              revenue: 0,
              serviceFees: 0,
              venueFees: 0, // ENHANCED: Track venue fees per restaurant
              stripeFees: 0,
              orders: 0
            };
          }
          
          revenueByRestaurant[restId].revenue += order.total || 0;
          revenueByRestaurant[restId].serviceFees += order.serviceFee || 0;
          revenueByRestaurant[restId].venueFees += order.venueFee || 0; // ENHANCED
          revenueByRestaurant[restId].stripeFees += order.stripeFee || 0;
          revenueByRestaurant[restId].orders++;
          
          // ENHANCED: Track venue revenue if venue exists
          if (venueId) {
            if (!revenueByVenue[venueId]) {
              revenueByVenue[venueId] = {
                revenue: 0,
                venueFees: 0,
                orders: 0,
                restaurants: new Set()
              };
            }
            
            revenueByVenue[venueId].revenue += order.total || 0;
            revenueByVenue[venueId].venueFees += order.venueFee || 0;
            revenueByVenue[venueId].orders++;
            revenueByVenue[venueId].restaurants.add(restId);
          }
        }
      });
      
      // Convert venue restaurant sets to counts
      Object.keys(revenueByVenue).forEach(venueId => {
        revenueByVenue[venueId].restaurantCount = revenueByVenue[venueId].restaurants.size;
        delete revenueByVenue[venueId].restaurants;
      });
      
      return {
        timePeriod,
        totalRevenue,
        totalServiceFees,
        totalVenueFees, // ENHANCED: Include venue fees
        totalStripeFees,
        totalTax,
        orderCount,
        averageOrderValue: orderCount > 0 ? totalRevenue / orderCount : 0,
        averageServiceFee: orderCount > 0 ? totalServiceFees / orderCount : 0,
        averageVenueFee: orderCount > 0 ? totalVenueFees / orderCount : 0, // ENHANCED
        averageStripeFee: orderCount > 0 ? totalStripeFees / orderCount : 0,
        revenueByRestaurant,
        revenueByVenue, // ENHANCED: Venue revenue breakdown
        platformCommission: totalServiceFees, // Your platform revenue
        venueCommission: totalVenueFees, // ENHANCED: Venue revenue
        stripeCommission: totalStripeFees // Stripe's revenue
      };
      
    } catch (error) {
      console.error('❌ Get fee analytics error:', error);
      throw error;
    }
  }),

  /**
   * Get payment analytics for restaurants
   */
  getRestaurantPayments: withTracking('getRestaurantPayments', async function({ 
    restaurantId, 
    startDate, 
    endDate, 
    limit = 50 
  }) {
    try {
      if (!getFirebaseAuth().currentUser) {
        throw new Error('User must be authenticated');
      }

      let query = getFirebaseDb().collection('payments')
        .where('restaurantId', '==', restaurantId)
        .orderBy('createdAt', 'desc');

      if (startDate) {
        query = query.where('createdAt', '>=', new Date(startDate));
      }
      if (endDate) {
        query = query.where('createdAt', '<=', new Date(endDate));
      }

      const payments = await query.limit(limit).get();
      
      const results = payments.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString()
      }));

      return { payments: results, count: results.length };

    } catch (error) {
      console.error('Error getting restaurant payments:', error);
      throw error;
    }
  }),

  /**
   * Get payment analytics for venues
   */
  getVenuePayments: withTracking('getVenuePayments', async function({ 
    venueId, 
    startDate, 
    endDate, 
    limit = 50 
  }) {
    try {
      if (!getFirebaseAuth().currentUser) {
        throw new Error('User must be authenticated');
      }

      let query = getFirebaseDb().collection('payments')
        .where('venueId', '==', venueId)
        .orderBy('createdAt', 'desc');

      if (startDate) {
        query = query.where('createdAt', '>=', new Date(startDate));
      }
      if (endDate) {
        query = query.where('createdAt', '<=', new Date(endDate));
      }

      const payments = await query.limit(limit).get();
      
      const results = payments.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString()
      }));

      return { payments: results, count: results.length };

    } catch (error) {
      console.error('Error getting venue payments:', error);
      throw error;
    }
  }),

  /**
   * Get platform payment analytics (admin only)
   */
  getPlatformPayments: withTracking('getPlatformPayments', async function({ 
    startDate, 
    endDate, 
    limit = 100 
  }) {
    try {
      if (!getFirebaseAuth().currentUser) {
        throw new Error('User must be authenticated');
      }

      // TODO: Add admin role verification
      // const userDoc = await getFirebaseDb().collection('users').doc(getFirebaseAuth().currentUser.uid).get();
      // if (!userDoc.data()?.role === 'admin') {
      //   throw new Error('Admin access required');
      // }

      let query = getFirebaseDb().collection('payments')
        .orderBy('createdAt', 'desc');

      if (startDate) {
        query = query.where('createdAt', '>=', new Date(startDate));
      }
      if (endDate) {
        query = query.where('createdAt', '<=', new Date(endDate));
      }

      const payments = await query.limit(limit).get();
      
      // Calculate platform totals
      let totalRevenue = 0;
      let totalPlatformFees = 0;
      let totalVenueFees = 0;
      let totalRestaurantPayouts = 0;

      const results = payments.docs.map(doc => {
        const data = doc.data();
        const split = data.paymentSplit || {};
        
        totalRevenue += (split.totalCents || 0) / 100;
        totalPlatformFees += (split.platformFeeAmount || 0) / 100;
        totalVenueFees += (split.venueFeeAmount || 0) / 100;
        totalRestaurantPayouts += (split.restaurantAmount || 0) / 100;

        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString()
        };
      });

      return { 
        payments: results, 
        count: results.length,
        totals: {
          totalRevenue,
          totalPlatformFees,
          totalVenueFees,
          totalRestaurantPayouts
        }
      };

    } catch (error) {
      console.error('Error getting platform payments:', error);
      throw error;
    }
  }),

  /**
   * Get revenue trends over time
   * @param {string} timePeriod - Time period for trend analysis
   * @param {string} groupBy - Group by 'day', 'week', or 'month'
   * @returns {Promise<Object>} Revenue trends
   */
  getRevenueTrends: withTracking('getRevenueTrends', async function(timePeriod = 'month', groupBy = 'day') {
    try {
      const startDate = this.getTimePeriodStart(timePeriod);
      
      let query = getFirebaseDb().collection('payments')
        .where('status', '==', 'completed');
      
      if (startDate) {
        query = query.where('createdAt', '>=', startDate);
      }
      
      const paymentsSnapshot = await query.get();
      const trends = {};
      
      paymentsSnapshot.docs.forEach(doc => {
        const payment = doc.data();
        const split = payment.paymentSplit || {};
        
        if (payment.createdAt) {
          const date = this.timestampToDate(payment.createdAt);
          let key;
          
          switch (groupBy) {
            case 'day':
              key = date.toISOString().split('T')[0];
              break;
            case 'week':
              key = this.getWeekKey(date);
              break;
            case 'month':
              key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
              break;
            default:
              key = date.toISOString().split('T')[0];
          }
          
          if (!trends[key]) {
            trends[key] = {
              revenue: 0,
              payments: 0,
              platformFees: 0,
              venueFees: 0,
              stripeFees: 0
            };
          }
          
          trends[key].revenue += (split.totalCents || 0) / 100;
          trends[key].payments++;
          trends[key].platformFees += (split.platformFeeAmount || 0) / 100;
          trends[key].venueFees += (split.venueFeeAmount || 0) / 100;
          trends[key].stripeFees += (split.stripeFeeAmount || 0) / 100;
        }
      });
      
      // Sort trends by date
      const sortedTrends = Object.entries(trends)
        .sort(([a], [b]) => a.localeCompare(b))
        .reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {});
      
      return {
        timePeriod,
        groupBy,
        trends: sortedTrends,
        totalPeriods: Object.keys(sortedTrends).length
      };
      
    } catch (error) {
      console.error('❌ Get revenue trends error:', error);
      throw error;
    }
  }),

  /**
   * Get top performing restaurants by revenue
   * @param {string} timePeriod - Time period
   * @param {number} limit - Number of top restaurants to return
   * @returns {Promise<Array>} Top restaurants
   */
  getTopPerformingRestaurants: withTracking('getTopPerformingRestaurants', async function(timePeriod = 'month', limit = 10) {
    try {
      const analytics = await this.getFeeAnalytics(timePeriod);
      const restaurantRevenue = analytics.revenueByRestaurant;
      
      // Get restaurant details
      const restaurantIds = Object.keys(restaurantRevenue);
      const restaurantDetails = {};
      
      for (const restaurantId of restaurantIds) {
        try {
          const restaurantDoc = await getFirebaseDb().collection('restaurants').doc(restaurantId).get();
          if (restaurantDoc.exists) {
            restaurantDetails[restaurantId] = restaurantDoc.data();
          }
        } catch (error) {
          console.warn('Could not fetch restaurant details for:', restaurantId);
          restaurantDetails[restaurantId] = { name: 'Unknown Restaurant' };
        }
      }
      
      // Sort and format results
      const topRestaurants = Object.entries(restaurantRevenue)
        .sort(([,a], [,b]) => b.revenue - a.revenue)
        .slice(0, limit)
        .map(([restaurantId, revenue]) => ({
          restaurantId,
          restaurantName: restaurantDetails[restaurantId]?.name || 'Unknown',
          ...revenue,
          averagePayment: revenue.orders > 0 ? Math.round((revenue.revenue / revenue.orders) * 100) / 100 : 0
        }));
      
      return topRestaurants;
      
    } catch (error) {
      console.error('❌ Get top performing restaurants error:', error);
      throw error;
    }
  }),

  /**
   * Get venue payment summary
   * @param {string} venueId - Venue ID
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Promise<Object>} Venue payment summary
   */
  getVenuePaymentSummary: withTracking('getVenuePaymentSummary', async function(venueId, startDate, endDate) {
    try {
      if (!getFirebaseAuth().currentUser) {
        throw new Error('User must be authenticated');
      }

      // Verify user has access to this venue
      const venueDoc = await getFirebaseDb().collection('venues').doc(venueId).get();
      if (!venueDoc.exists) {
        throw new Error('Venue not found');
      }

      const venue = venueDoc.data();
      if (venue.managerId !== getFirebaseAuth().currentUser.uid) {
        throw new Error('Access denied');
      }

      // Query payments for this venue
      let query = getFirebaseDb().collection('payments').where('venueId', '==', venueId);
      
      if (startDate) {
        query = query.where('createdAt', '>=', new Date(startDate));
      }
      if (endDate) {
        query = query.where('createdAt', '<=', new Date(endDate));
      }

      const payments = await query.get();
      
      // Calculate totals
      let totalVenueEarnings = 0;
      let totalOrders = 0;
      let totalVolume = 0;
      const restaurantBreakdown = {};

      payments.docs.forEach(doc => {
        const payment = doc.data();
        const split = payment.paymentSplit || {};
        
        totalOrders++;
        totalVolume += (split.totalCents || 0) / 100;
        totalVenueEarnings += (split.venueFeeAmount || 0) / 100;
        
        // Track by restaurant
        const restaurantId = payment.restaurantId;
        if (!restaurantBreakdown[restaurantId]) {
          restaurantBreakdown[restaurantId] = {
            orders: 0,
            volume: 0,
            venueEarnings: 0
          };
        }
        
        restaurantBreakdown[restaurantId].orders++;
        restaurantBreakdown[restaurantId].volume += (split.totalCents || 0) / 100;
        restaurantBreakdown[restaurantId].venueEarnings += (split.venueFeeAmount || 0) / 100;
      });

      return {
        summary: {
          totalOrders,
          totalVolume,
          totalVenueEarnings,
          averageOrderValue: totalOrders > 0 ? totalVolume / totalOrders : 0,
          averageVenueFee: totalOrders > 0 ? totalVenueEarnings / totalOrders : 0
        },
        restaurantBreakdown,
        period: {
          startDate: startDate || null,
          endDate: endDate || null,
          daysIncluded: startDate && endDate ? 
            Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) : null
        }
      };

    } catch (error) {
      console.error('Error getting venue payment summary:', error);
      throw error;
    }
  }),

  /**
   * Get detailed venue payment history
   * @param {string} venueId - Venue ID
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @param {number} limit - Limit
   * @returns {Promise<Object>} Venue payment history
   */
  getVenuePaymentHistory: withTracking('getVenuePaymentHistory', async function(venueId, startDate, endDate, limit = 50) {
    try {
      if (!getFirebaseAuth().currentUser) {
        throw new Error('User must be authenticated');
      }

      // Verify user has access to this venue
      const venueDoc = await getFirebaseDb().collection('venues').doc(venueId).get();
      if (!venueDoc.exists) {
        throw new Error('Venue not found');
      }

      const venue = venueDoc.data();
      if (venue.managerId !== getFirebaseAuth().currentUser.uid) {
        throw new Error('Access denied');
      }

      // Query payments
      let query = getFirebaseDb().collection('payments')
        .where('venueId', '==', venueId)
        .orderBy('createdAt', 'desc');
      
      if (startDate) {
        query = query.where('createdAt', '>=', new Date(startDate));
      }
      if (endDate) {
        query = query.where('createdAt', '<=', new Date(endDate));
      }

      const payments = await query.limit(limit).get();
      
      // Enrich with restaurant names
      const paymentHistory = [];
      for (const doc of payments.docs) {
        const payment = doc.data();
        
        // Get restaurant name
        let restaurantName = 'Unknown Restaurant';
        try {
          const restaurantDoc = await getFirebaseDb().collection('restaurants').doc(payment.restaurantId).get();
          if (restaurantDoc.exists) {
            restaurantName = restaurantDoc.data().name;
          }
        } catch (error) {
          console.warn('Could not fetch restaurant name for', payment.restaurantId);
        }
        
        paymentHistory.push({
          id: doc.id,
          restaurantId: payment.restaurantId,
          restaurantName,
          paymentIntentId: payment.paymentIntentId,
          venueEarnings: (payment.paymentSplit?.venueFeeAmount || 0) / 100,
          totalAmount: (payment.paymentSplit?.totalCents || 0) / 100,
          feePercentage: payment.paymentSplit?.venueFeePercentage || 0,
          createdAt: payment.createdAt?.toDate?.()?.toISOString(),
          status: payment.status
        });
      }

      return { payments: paymentHistory, count: paymentHistory.length };

    } catch (error) {
      console.error('Error getting venue payment history:', error);
      throw error;
    }
  }),

  // ============================================================================
  // HELPER METHODS (EXACTLY LIKE YOUR PATTERNS)
  // ============================================================================

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

console.log('📊 VediAPI Revenue Analytics module loaded successfully');
console.log('💰 Available revenue analytics methods:', Object.keys(VediAPI).length, 'total methods');
console.log('🚀 Ready for comprehensive revenue analysis!');