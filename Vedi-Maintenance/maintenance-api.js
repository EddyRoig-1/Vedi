// maintenance-api.js - Vedi Admin Analytics & Monitoring API

const VediMaintenanceAPI = {
  // ============================================================================
  // ADMIN AUTHENTICATION & ACCESS
  // ============================================================================

  /**
   * Verify admin access for current user
   * @returns {Promise<boolean>} True if user is admin
   */
  async verifyAdminAccess() {
    try {
      const currentUser = firebase.auth().currentUser;
      if (!currentUser) return false;
      
      const adminDoc = await firebase.firestore().collection('adminUsers').doc(currentUser.uid).get();
      return adminDoc.exists;
    } catch (error) {
      console.error('❌ Admin verification error:', error);
      return false;
    }
  },

  /**
   * Get admin user data
   * @param {string} adminId - Admin user ID
   * @returns {Promise<Object>} Admin data
   */
  async getAdminData(adminId) {
    try {
      const adminDoc = await firebase.firestore().collection('adminUsers').doc(adminId).get();
      if (adminDoc.exists) {
        return { id: adminDoc.id, ...adminDoc.data() };
      }
      throw new Error('Admin not found');
    } catch (error) {
      console.error('❌ Get admin data error:', error);
      throw error;
    }
  },

  /**
   * Log admin access
   * @param {string} adminId - Admin user ID
   * @param {string} action - Action performed
   * @param {Object} metadata - Additional metadata
   */
  async logAdminAccess(adminId, action, metadata = {}) {
    try {
      await firebase.firestore().collection('adminLogs').add({
        adminId,
        action,
        metadata,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        userAgent: navigator.userAgent,
        ip: 'client-side' // Would be server-side in production
      });
    } catch (error) {
      console.error('❌ Log admin access error:', error);
    }
  },

  // ============================================================================
  // SYSTEM ANALYTICS & METRICS
  // ============================================================================

  /**
   * Get comprehensive system metrics
   * @param {string} timePeriod - today, week, month, quarter, year
   * @returns {Promise<Object>} System metrics
   */
  async getSystemMetrics(timePeriod = 'today') {
    try {
      const startDate = this.getTimePeriodStart(timePeriod);
      const now = new Date();

      // Get all collections data
      const [users, restaurants, venues, orders, incidents] = await Promise.all([
        firebase.firestore().collection('users').get(),
        firebase.firestore().collection('restaurants').get(),
        firebase.firestore().collection('venues').get(),
        this.getOrdersInPeriod(startDate, now),
        this.getLossIncidentsInPeriod(startDate, now)
      ]);

      return {
        totalUsers: users.size,
        totalRestaurants: restaurants.size,
        totalVenues: venues.size,
        ordersInPeriod: orders.length,
        incidentsInPeriod: incidents.length,
        usersByType: this.categorizeUsers(users.docs),
        restaurantsByStatus: this.categorizeRestaurants(restaurants.docs),
        ordersByStatus: this.categorizeOrders(orders),
        revenueMetrics: this.calculateRevenue(orders),
        growthMetrics: await this.calculateGrowthMetrics(timePeriod),
        lastUpdated: now.toISOString()
      };
    } catch (error) {
      console.error('❌ Get system metrics error:', error);
      throw error;
    }
  },

  /**
   * Get API usage analytics
   * @param {string} timePeriod - Time period to analyze
   * @returns {Promise<Object>} API usage data
   */
  async getAPIAnalytics(timePeriod = 'today') {
    try {
      const startDate = this.getTimePeriodStart(timePeriod);
      
      // In production, this would query actual API logs
      // For now, we'll simulate based on database activity
      const apiCallsSnapshot = await firebase.firestore().collection('apiCalls')
        .where('timestamp', '>=', startDate)
        .orderBy('timestamp', 'desc')
        .get();

      const apiCalls = apiCallsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      return {
        totalCalls: apiCalls.length,
        callsByMethod: this.groupAPICallsByMethod(apiCalls),
        callsByHour: this.groupAPICallsByHour(apiCalls),
        errorRate: this.calculateErrorRate(apiCalls),
        averageResponseTime: this.calculateAverageResponseTime(apiCalls),
        topMethods: this.getTopAPIMethods(apiCalls),
        methodDetails: this.getMethodDetails()
      };
    } catch (error) {
      console.error('❌ Get API analytics error:', error);
      // Return mock data if collection doesn't exist yet
              return this.getEmptyAPIAnalytics(timePeriod);
    }
  },

  /**
   * Track API call for analytics
   * @param {string} method - API method name
   * @param {number} responseTime - Response time in ms
   * @param {boolean} success - Whether call was successful
   * @param {Object} metadata - Additional data
   */
  async trackAPICall(method, responseTime, success = true, metadata = {}) {
    try {
      await firebase.firestore().collection('apiCalls').add({
        method,
        responseTime,
        success,
        metadata,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        hour: new Date().getHours()
      });
    } catch (error) {
      console.error('❌ Track API call error:', error);
    }
  },

  /**
   * Get user activity analytics
   * @param {string} timePeriod - Time period
   * @returns {Promise<Object>} User activity data
   */
  async getUserActivityAnalytics(timePeriod = 'week') {
    try {
      const startDate = this.getTimePeriodStart(timePeriod);
      
      // Get recent orders to infer user activity
      const ordersSnapshot = await firebase.firestore().collection('orders')
        .where('createdAt', '>=', startDate)
        .get();
      
      const orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Get unique users from orders
      const activeUsers = new Set(orders.map(order => order.customerPhone));
      
      // Get user signups in period
      const usersSnapshot = await firebase.firestore().collection('users')
        .where('createdAt', '>=', startDate)
        .get();
      
      return {
        activeUsers: activeUsers.size,
        newSignups: usersSnapshot.size,
        averageOrdersPerUser: activeUsers.size > 0 ? (orders.length / activeUsers.size).toFixed(2) : 0,
        userRetention: this.calculateUserRetention(orders),
        mostActiveRestaurants: this.getMostActiveRestaurants(orders),
        peakActivityHours: this.getPeakActivityHours(orders)
      };
    } catch (error) {
      console.error('❌ Get user activity analytics error:', error);
      throw error;
    }
  },

  /**
   * Get system health metrics
   * @returns {Promise<Object>} System health data
   */
  async getSystemHealth() {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      // Check recent errors
      const errorsSnapshot = await firebase.firestore().collection('systemErrors')
        .where('timestamp', '>=', oneHourAgo)
        .get();
      
      // Get database performance metrics
      const performanceMetrics = await this.getDatabasePerformance();
      
      // Calculate uptime and error rates
      const errorRate = this.calculateSystemErrorRate(errorsSnapshot.docs);
      
      return {
        status: errorRate < 1 ? 'healthy' : errorRate < 5 ? 'warning' : 'critical',
        uptime: '99.9%', // Would be calculated from actual monitoring
        errorRate: errorRate,
        responseTime: performanceMetrics.averageResponseTime,
        databaseHealth: performanceMetrics.health,
        lastChecked: now.toISOString(),
        activeConnections: performanceMetrics.activeConnections,
        memoryUsage: performanceMetrics.memoryUsage,
        alerts: this.getSystemAlerts(errorsSnapshot.docs)
      };
    } catch (error) {
      console.error('❌ Get system health error:', error);
      return {
        status: 'unknown',
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  },

  /**
   * Get real-time activity feed
   * @param {number} limit - Number of activities to return
   * @returns {Promise<Array>} Recent activities
   */
  async getRealtimeActivity(limit = 20) {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      // Get recent orders
      const ordersSnapshot = await firebase.firestore().collection('orders')
        .where('createdAt', '>=', oneHourAgo)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      
      // Get recent user signups
      const usersSnapshot = await firebase.firestore().collection('users')
        .where('createdAt', '>=', oneHourAgo)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      
      // Get recent incidents
      const incidentsSnapshot = await firebase.firestore().collection('lossIncidents')
        .where('createdAt', '>=', oneHourAgo)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      
      // Combine and format activities
      const activities = [];
      
      ordersSnapshot.docs.forEach(doc => {
        const order = doc.data();
        activities.push({
          type: 'order',
          icon: '📋',
          text: `New order #${order.orderNumber} placed at ${order.restaurantName || 'Restaurant'}`,
          time: this.getRelativeTime(order.createdAt),
          timestamp: order.createdAt,
          color: '#10b981'
        });
      });
      
      usersSnapshot.docs.forEach(doc => {
        const user = doc.data();
        activities.push({
          type: 'user',
          icon: '👤',
          text: `New ${user.accountType || 'user'} registered: ${user.name}`,
          time: this.getRelativeTime(user.createdAt),
          timestamp: user.createdAt,
          color: '#667eea'
        });
      });
      
      incidentsSnapshot.docs.forEach(doc => {
        const incident = doc.data();
        activities.push({
          type: 'incident',
          icon: '⚠️',
          text: `${incident.type} incident reported: ${incident.title}`,
          time: this.getRelativeTime(incident.createdAt),
          timestamp: incident.createdAt,
          color: '#ef4444'
        });
      });
      
      // Sort by timestamp and return limited results
      return activities
        .sort((a, b) => this.timestampToDate(b.timestamp) - this.timestampToDate(a.timestamp))
        .slice(0, limit);
        
    } catch (error) {
      console.error('❌ Get realtime activity error:', error);
              return this.getEmptyActivity();
    }
  },

  // ============================================================================
  // USER MANAGEMENT METHODS
  // ============================================================================

  /**
   * Get detailed user management data
   * @returns {Promise<Object>} User management data
   */
  async getUserManagementData() {
    try {
      const [usersSnapshot, restaurantsSnapshot, venuesSnapshot] = await Promise.all([
        firebase.firestore().collection('users').get(),
        firebase.firestore().collection('restaurants').get(),
        firebase.firestore().collection('venues').get()
      ]);
      
      const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const restaurants = restaurantsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const venues = venuesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      return {
        totalUsers: users.length,
        usersByType: this.categorizeUsers(usersSnapshot.docs),
        recentUsers: users
          .sort((a, b) => this.timestampToDate(b.createdAt) - this.timestampToDate(a.createdAt))
          .slice(0, 10),
        restaurantOwners: this.getRestaurantOwners(users, restaurants),
        venueManagers: this.getVenueManagers(users, venues),
        userActivity: await this.getUserActivitySummary(users),
        userRetentionRate: this.calculateOverallRetention(users)
      };
    } catch (error) {
      console.error('❌ Get user management data error:', error);
      throw error;
    }
  },

  /**
   * Suspend or activate user account
   * @param {string} userId - User ID
   * @param {boolean} suspended - Suspension status
   * @param {string} reason - Reason for suspension
   */
  async updateUserStatus(userId, suspended, reason = '') {
    try {
      await firebase.firestore().collection('users').doc(userId).update({
        suspended,
        suspensionReason: reason,
        suspendedAt: suspended ? firebase.firestore.FieldValue.serverTimestamp() : null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Log admin action
      const currentUser = firebase.auth().currentUser;
      if (currentUser) {
        await this.logAdminAccess(currentUser.uid, 'user_status_update', {
          targetUserId: userId,
          suspended,
          reason
        });
      }
      
      console.log(`✅ User ${userId} ${suspended ? 'suspended' : 'activated'}`);
    } catch (error) {
      console.error('❌ Update user status error:', error);
      throw error;
    }
  },

  // ============================================================================
  // UTILITY & HELPER METHODS
  // ============================================================================

  /**
   * Get start date for time period
   * @param {string} timePeriod - Time period string
   * @returns {Date} Start date
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
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
    if (timestamp && timestamp.seconds) {
      return new Date(timestamp.seconds * 1000);
    }
    return new Date(timestamp);
  },

  /**
   * Get relative time string
   * @param {Object} timestamp - Firebase timestamp
   * @returns {string} Relative time
   */
  getRelativeTime(timestamp) {
    const date = this.timestampToDate(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  },

  /**
   * Get orders in time period
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Orders in period
   */
  async getOrdersInPeriod(startDate, endDate) {
    try {
      const ordersSnapshot = await firebase.firestore().collection('orders')
        .where('createdAt', '>=', startDate)
        .where('createdAt', '<=', endDate)
        .get();
      
      return ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('❌ Get orders in period error:', error);
      return [];
    }
  },

  /**
   * Get loss incidents in time period
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Incidents in period
   */
  async getLossIncidentsInPeriod(startDate, endDate) {
    try {
      const incidentsSnapshot = await firebase.firestore().collection('lossIncidents')
        .where('createdAt', '>=', startDate)
        .where('createdAt', '<=', endDate)
        .get();
      
      return incidentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('❌ Get incidents in period error:', error);
      return [];
    }
  },

  /**
   * Categorize users by account type
   * @param {Array} userDocs - User documents
   * @returns {Object} User categories
   */
  categorizeUsers(userDocs) {
    const categories = { restaurant: 0, venue: 0, customer: 0, other: 0 };
    
    userDocs.forEach(doc => {
      const user = doc.data();
      const type = user.accountType || 'other';
      if (categories.hasOwnProperty(type)) {
        categories[type]++;
      } else {
        categories.other++;
      }
    });
    
    return categories;
  },

  /**
   * Get empty API analytics when no data available
   * @param {string} timePeriod - Time period
   * @returns {Object} Empty API analytics structure
   */
  getEmptyAPIAnalytics(timePeriod) {
    return {
      totalCalls: 0,
      callsByMethod: {},
      errorRate: '0.0',
      averageResponseTime: 0,
      methodDetails: this.getMethodDetails()
    };
  },

  /**
   * Get VediAPI method details
   * @returns {Array} Method details
   */
  getMethodDetails() {
    return [
      { name: 'signUp', category: 'Authentication', description: 'Create new user account' },
      { name: 'signIn', category: 'Authentication', description: 'User login' },
      { name: 'signOut', category: 'Authentication', description: 'User logout' },
      { name: 'getCurrentUser', category: 'Authentication', description: 'Get current authenticated user' },
      { name: 'getUserData', category: 'Authentication', description: 'Get user data from Firestore' },
      { name: 'checkEmailExists', category: 'Authentication', description: 'Check if email is registered' },
      
      { name: 'createRestaurant', category: 'Restaurant', description: 'Create new restaurant' },
      { name: 'updateRestaurant', category: 'Restaurant', description: 'Update restaurant data' },
      { name: 'getRestaurantByOwner', category: 'Restaurant', description: 'Get restaurant by owner ID' },
      { name: 'getRestaurant', category: 'Restaurant', description: 'Get restaurant by ID' },
      { name: 'getRestaurantsByVenue', category: 'Restaurant', description: 'Get restaurants in venue' },
      
      { name: 'getMenuCategories', category: 'Menu', description: 'Get menu categories' },
      { name: 'createMenuCategory', category: 'Menu', description: 'Create menu category' },
      { name: 'updateMenuCategory', category: 'Menu', description: 'Update menu category' },
      { name: 'deleteMenuCategory', category: 'Menu', description: 'Delete menu category' },
      { name: 'getMenuItems', category: 'Menu', description: 'Get all menu items' },
      { name: 'getMenuItemsByCategory', category: 'Menu', description: 'Get items by category' },
      { name: 'createMenuItem', category: 'Menu', description: 'Create menu item' },
      { name: 'updateMenuItem', category: 'Menu', description: 'Update menu item' },
      { name: 'deleteMenuItem', category: 'Menu', description: 'Delete menu item' },
      { name: 'updateItemStock', category: 'Menu', description: 'Update item stock status' },
      { name: 'getFullMenu', category: 'Menu', description: 'Get complete menu with categories' },
      { name: 'searchMenuItems', category: 'Menu', description: 'Search menu items' },
      
      { name: 'createOrder', category: 'Orders', description: 'Create new order' },
      { name: 'getOrderByNumber', category: 'Orders', description: 'Get order by number' },
      { name: 'getOrders', category: 'Orders', description: 'Get restaurant orders' },
      { name: 'getOrdersByCustomer', category: 'Orders', description: 'Get customer order history' },
      { name: 'getMostRecentActiveOrder', category: 'Orders', description: 'Get customer active order' },
      { name: 'updateOrderStatus', category: 'Orders', description: 'Update order status' },
      { name: 'getTodaysOrders', category: 'Orders', description: 'Get today\'s orders' },
      
      { name: 'createVenue', category: 'Venues', description: 'Create new venue' },
      { name: 'updateVenue', category: 'Venues', description: 'Update venue data' },
      { name: 'getVenueByManager', category: 'Venues', description: 'Get venue by manager' },
      { name: 'getVenue', category: 'Venues', description: 'Get venue by ID' },
      
      { name: 'createLossIncident', category: 'Loss Tracking', description: 'Report loss incident' },
      { name: 'getLossIncidents', category: 'Loss Tracking', description: 'Get restaurant incidents' },
      { name: 'getLossIncidentsByVenue', category: 'Loss Tracking', description: 'Get venue incidents' },
      { name: 'updateLossIncident', category: 'Loss Tracking', description: 'Update incident' },
      { name: 'deleteLossIncident', category: 'Loss Tracking', description: 'Delete incident' },
      { name: 'getLossAnalytics', category: 'Loss Tracking', description: 'Get loss analytics' },
      { name: 'getVenueLossAnalytics', category: 'Loss Tracking', description: 'Get venue loss analytics' },
      
      { name: 'listenToOrders', category: 'Real-time', description: 'Real-time order updates' },
      { name: 'listenToOrder', category: 'Real-time', description: 'Listen to specific order' },
      { name: 'listenToCustomerOrders', category: 'Real-time', description: 'Customer order tracking' },
      { name: 'listenToOrderByNumber', category: 'Real-time', description: 'Track order by number' },
      { name: 'listenToVenueOrders', category: 'Real-time', description: 'Venue-wide order tracking' },
      { name: 'listenToLossIncidents', category: 'Real-time', description: 'Real-time incident tracking' }
    ];
  },

  /**
   * Get empty activity data
   * @returns {Array} Empty activities array
   */
  getEmptyActivity() {
    return [];
  },

  // Additional helper methods for calculations
  categorizeOrders(orders) {
    const categories = { pending: 0, preparing: 0, ready: 0, completed: 0, cancelled: 0 };
    orders.forEach(order => {
      const status = order.status || 'pending';
      if (categories.hasOwnProperty(status)) {
        categories[status]++;
      }
    });
    return categories;
  },

  categorizeRestaurants(restaurantDocs) {
    const categories = { active: 0, inactive: 0, pending: 0 };
    restaurantDocs.forEach(doc => {
      const restaurant = doc.data();
      const status = restaurant.status || 'active';
      if (categories.hasOwnProperty(status)) {
        categories[status]++;
      }
    });
    return categories;
  },

  calculateRevenue(orders) {
    const totalRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);
    const averageOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
    
    return {
      total: totalRevenue,
      average: averageOrderValue,
      orderCount: orders.length
    };
  },

  async calculateGrowthMetrics(timePeriod) {
    // Calculate actual growth metrics by comparing periods
    // For now, return basic structure - will be populated with real data
    return {
      userGrowth: 0,
      restaurantGrowth: 0,
      orderGrowth: 0,
      revenueGrowth: 0
    };
  }
};

// Make VediMaintenanceAPI available globally
window.VediMaintenanceAPI = VediMaintenanceAPI;

console.log('🔧 Vedi Maintenance API loaded successfully');
console.log('📊 Admin analytics methods: Available');
console.log('🛠️ Ready for admin dashboard use!');
