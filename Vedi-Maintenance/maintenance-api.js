// maintenance-api.js - Enhanced VediAPI with Analytics Tracking
// This extends your existing firebase-api.js with analytics capabilities

// Analytics and Maintenance API Extension
const VediAnalytics = {
    // Initialize analytics tracking
    async initialize() {
        console.log('Initializing Vedi Analytics System...');
        try {
            await this.createAnalyticsCollections();
            await this.setupDailyMetrics();
            await this.enableAPITracking();
            console.log('Vedi Analytics initialized successfully');
        } catch (error) {
            console.error('Analytics initialization failed:', error);
        }
    },

    // Create necessary analytics collections (8 total)
    async createAnalyticsCollections() {
        const collections = [
            'analytics',
            'apiTracking', 
            'systemActivity',
            'userSessions',
            'errorLogs',
            'performanceMetrics',
            'businessMetrics',
            'systemAlerts'
        ];

        for (const collection of collections) {
            try {
                // Create initial document to establish collection
                await firebase.firestore().collection(collection).doc('_init').set({
                    created: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'initialized'
                });
                console.log(`✅ Created collection: ${collection}`);
            } catch (error) {
                console.warn(`Collection ${collection} may already exist:`, error);
            }
        }
    },

    // Setup daily metrics tracking
    async setupDailyMetrics() {
        const today = new Date().toISOString().split('T')[0];
        const metricsRef = firebase.firestore().collection('analytics').doc(today);
        
        try {
            await metricsRef.set({
                date: today,
                created: firebase.firestore.FieldValue.serverTimestamp(),
                metrics: {
                    totalUsers: 0,
                    activeUsers: 0,
                    totalRestaurants: 0,
                    totalVenues: 0,
                    totalOrders: 0,
                    totalAPICallsToday: 0,
                    errorCount: 0,
                    errorRate: 0,
                    averageResponseTime: 0,
                    newUsersToday: 0,
                    newRestaurantsToday: 0,
                    popularFeatures: {},
                    apiMethodCalls: {}
                },
                hourlyBreakdown: {},
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            console.log('✅ Daily metrics initialized');
        } catch (error) {
            console.error('Error setting up daily metrics:', error);
        }
    },

    // Track API method calls
    async trackAPICall(methodName, userId = null, success = true, responseTime = 0, errorCode = null, metadata = {}) {
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        const today = new Date().toISOString().split('T')[0];
        const hour = new Date().getHours();

        try {
            // Log individual API call
            await firebase.firestore().collection('apiTracking').add({
                timestamp,
                date: today,
                hour,
                method: methodName,
                userId,
                success,
                responseTime,
                errorCode,
                metadata,
                userAgent: navigator.userAgent,
                ip: await this.getUserIP()
            });

            // Update daily aggregates
            const analyticsRef = firebase.firestore().collection('analytics').doc(today);
            await analyticsRef.update({
                [`metrics.apiMethodCalls.${methodName}`]: firebase.firestore.FieldValue.increment(1),
                'metrics.totalAPICallsToday': firebase.firestore.FieldValue.increment(1),
                [`hourlyBreakdown.${hour}.apiCalls`]: firebase.firestore.FieldValue.increment(1),
                'lastUpdated': timestamp
            });

            // Track errors separately
            if (!success) {
                await this.trackError(methodName, errorCode, userId, metadata);
            }

        } catch (error) {
            console.error('Error tracking API call:', error);
        }
    },

    // Track user activity
    async trackUserActivity(action, userId, details = '', metadata = {}) {
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        
        try {
            await firebase.firestore().collection('systemActivity').add({
                timestamp,
                type: this.getActivityType(action),
                action,
                userId,
                details,
                metadata,
                date: new Date().toISOString().split('T')[0]
            });

            // Update real-time activity counter
            await this.updateActivityCounter(action);
            
        } catch (error) {
            console.error('Error tracking user activity:', error);
        }
    },

    // Track system errors
    async trackError(method, errorCode, userId = null, context = {}) {
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        const today = new Date().toISOString().split('T')[0];

        try {
            // Log error details
            await firebase.firestore().collection('errorLogs').add({
                timestamp,
                date: today,
                method,
                errorCode,
                userId,
                context,
                userAgent: navigator.userAgent,
                url: window.location.href,
                stackTrace: context.stack || 'N/A'
            });

            // Update error metrics
            const analyticsRef = firebase.firestore().collection('analytics').doc(today);
            await analyticsRef.update({
                'metrics.errorCount': firebase.firestore.FieldValue.increment(1),
                [`metrics.errorsByMethod.${method}`]: firebase.firestore.FieldValue.increment(1),
                [`metrics.errorsByCode.${errorCode}`]: firebase.firestore.FieldValue.increment(1),
                'lastUpdated': timestamp
            });

        } catch (error) {
            console.error('Error logging error:', error);
        }
    },

    // Track user sessions
    async trackUserSession(userId, action = 'login', sessionData = {}) {
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        
        try {
            await firebase.firestore().collection('userSessions').add({
                timestamp,
                userId,
                action, // 'login', 'logout', 'activity'
                sessionData,
                userAgent: navigator.userAgent,
                ip: await this.getUserIP(),
                date: new Date().toISOString().split('T')[0]
            });

            if (action === 'login') {
                await this.updateUserMetrics(userId);
            }

        } catch (error) {
            console.error('Error tracking user session:', error);
        }
    },

    // Track business metrics
    async trackBusinessMetric(type, data) {
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        const today = new Date().toISOString().split('T')[0];
        
        try {
            await firebase.firestore().collection('businessMetrics').add({
                timestamp,
                date: today,
                type, // 'order', 'revenue', 'menu_item_popularity', etc.
                data,
                hour: new Date().getHours()
            });

            // Update daily business aggregates
            const analyticsRef = firebase.firestore().collection('analytics').doc(today);
            await analyticsRef.update({
                [`businessMetrics.${type}`]: firebase.firestore.FieldValue.increment(data.value || 1),
                'lastUpdated': timestamp
            });

        } catch (error) {
            console.error('Error tracking business metric:', error);
        }
    },

    // Create system alerts
    async createSystemAlert(level, title, message, context = {}) {
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        
        try {
            await firebase.firestore().collection('systemAlerts').add({
                timestamp,
                level, // 'info', 'warning', 'error', 'critical'
                title,
                message,
                context,
                resolved: false,
                date: new Date().toISOString().split('T')[0]
            });

            console.log(`System Alert [${level.toUpperCase()}]: ${title}`);

        } catch (error) {
            console.error('Error creating system alert:', error);
        }
    },

    // Get comprehensive system metrics
    async getSystemMetrics(dateRange = 'today') {
        try {
            let startDate, endDate;
            const now = new Date();
            
            switch(dateRange) {
                case 'today':
                    startDate = endDate = now.toISOString().split('T')[0];
                    break;
                case '7days':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    endDate = now.toISOString().split('T')[0];
                    break;
                case '30days':
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    endDate = now.toISOString().split('T')[0];
                    break;
                default:
                    startDate = endDate = now.toISOString().split('T')[0];
            }

            // Get analytics data
            const analyticsQuery = firebase.firestore()
                .collection('analytics')
                .where('date', '>=', startDate)
                .where('date', '<=', endDate)
                .orderBy('date');

            const analyticsSnapshot = await analyticsQuery.get();
            const analytics = analyticsSnapshot.docs.map(doc => doc.data());

            // Get real-time counts
            const [usersCount, restaurantsCount, venuesCount, ordersCount] = await Promise.all([
                this.getTotalUsersCount(),
                this.getTotalRestaurantsCount(),
                this.getTotalVenuesCount(),
                this.getTotalOrdersCount()
            ]);

            return {
                analytics,
                realTimeCounts: {
                    totalUsers: usersCount,
                    totalRestaurants: restaurantsCount,
                    totalVenues: venuesCount,
                    totalOrders: ordersCount
                },
                dateRange: { startDate, endDate }
            };

        } catch (error) {
            console.error('Error getting system metrics:', error);
            return null;
        }
    },

    // Get API usage analytics
    async getAPIAnalytics(timeframe = '24h') {
        try {
            const now = new Date();
            let startTime;

            switch(timeframe) {
                case '24h':
                    startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    break;
                case '7d':
                    startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case '30d':
                    startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            }

            const apiQuery = firebase.firestore()
                .collection('apiTracking')
                .where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(startTime))
                .orderBy('timestamp', 'desc')
                .limit(10000);

            const snapshot = await apiQuery.get();
            const apiCalls = snapshot.docs.map(doc => doc.data());

            // Analyze data
            const methodCounts = {};
            const errorCounts = {};
            const responseTimes = {};
            let totalCalls = 0;
            let successfulCalls = 0;

            apiCalls.forEach(call => {
                totalCalls++;
                if (call.success) successfulCalls++;

                // Count by method
                methodCounts[call.method] = (methodCounts[call.method] || 0) + 1;

                // Track errors
                if (!call.success) {
                    errorCounts[call.errorCode] = (errorCounts[call.errorCode] || 0) + 1;
                }

                // Track response times
                if (call.responseTime) {
                    if (!responseTimes[call.method]) {
                        responseTimes[call.method] = [];
                    }
                    responseTimes[call.method].push(call.responseTime);
                }
            });

            // Calculate averages
            const avgResponseTimes = {};
            Object.keys(responseTimes).forEach(method => {
                const times = responseTimes[method];
                avgResponseTimes[method] = times.reduce((a, b) => a + b, 0) / times.length;
            });

            return {
                totalCalls,
                successRate: (successfulCalls / totalCalls * 100).toFixed(2),
                methodCounts,
                errorCounts,
                avgResponseTimes,
                timeframe
            };

        } catch (error) {
            console.error('Error getting API analytics:', error);
            return null;
        }
    },

    // Get live activity feed
    async getLiveActivity(limit = 50) {
        try {
            const query = firebase.firestore()
                .collection('systemActivity')
                .orderBy('timestamp', 'desc')
                .limit(limit);

            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

        } catch (error) {
            console.error('Error getting live activity:', error);
            return [];
        }
    },

    // Get system alerts
    async getSystemAlerts(unreadOnly = false) {
        try {
            let query = firebase.firestore()
                .collection('systemAlerts')
                .orderBy('timestamp', 'desc')
                .limit(100);

            if (unreadOnly) {
                query = query.where('resolved', '==', false);
            }

            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

        } catch (error) {
            console.error('Error getting system alerts:', error);
            return [];
        }
    },

    // Helper functions
    getActivityType(action) {
        const typeMap = {
            'login': 'user',
            'signup': 'user',
            'logout': 'user',
            'createOrder': 'order',
            'updateOrderStatus': 'order',
            'createRestaurant': 'system',
            'createMenuItem': 'system',
            'createLossIncident': 'system',
            'error': 'error'
        };
        return typeMap[action] || 'system';
    },

    async updateActivityCounter(action) {
        const today = new Date().toISOString().split('T')[0];
        const analyticsRef = firebase.firestore().collection('analytics').doc(today);
        
        await analyticsRef.update({
            [`metrics.activityCounts.${action}`]: firebase.firestore.FieldValue.increment(1),
            'lastUpdated': firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    async updateUserMetrics(userId) {
        const today = new Date().toISOString().split('T')[0];
        const analyticsRef = firebase.firestore().collection('analytics').doc(today);
        
        await analyticsRef.update({
            'metrics.activeUsers': firebase.firestore.FieldValue.increment(1),
            'lastUpdated': firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    async getUserIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch {
            return 'unknown';
        }
    },

    // Get total counts for real-time metrics
    async getTotalUsersCount() {
        try {
            const snapshot = await firebase.firestore().collection('users').get();
            return snapshot.size;
        } catch (error) {
            console.error('Error getting users count:', error);
            return 0;
        }
    },

    async getTotalRestaurantsCount() {
        try {
            const snapshot = await firebase.firestore().collection('restaurants').get();
            return snapshot.size;
        } catch (error) {
            console.error('Error getting restaurants count:', error);
            return 0;
        }
    },

    async getTotalVenuesCount() {
        try {
            const snapshot = await firebase.firestore().collection('venues').get();
            return snapshot.size;
        } catch (error) {
            console.error('Error getting venues count:', error);
            return 0;
        }
    },

    async getTotalOrdersCount() {
        try {
            const snapshot = await firebase.firestore().collection('orders').get();
            return snapshot.size;
        } catch (error) {
            console.error('Error getting orders count:', error);
            return 0;
        }
    },

    // Enable automatic API tracking for all VediAPI methods
    async enableAPITracking() {
        console.log('Enabling automatic API tracking for all VediAPI methods...');
        
        // Store original methods
        const originalMethods = {};
        
        // List of all 41 VediAPI methods to track
        const methodsToTrack = [
            // Authentication (6)
            'signUp', 'signIn', 'signOut', 'getCurrentUser', 'getUserData', 'checkEmailExists',
            // Restaurant Management (5)
            'createRestaurant', 'updateRestaurant', 'getRestaurantByOwner', 'getRestaurant', 'getRestaurantsByVenue',
            // Menu Categories (4)
            'getMenuCategories', 'createMenuCategory', 'updateMenuCategory', 'deleteMenuCategory',
            // Menu Items (8)
            'getMenuItems', 'getMenuItemsByCategory', 'createMenuItem', 'updateMenuItem', 
            'deleteMenuItem', 'updateItemStock', 'getFullMenu', 'searchMenuItems',
            // Orders (7)
            'createOrder', 'getOrderByNumber', 'getOrders', 'getOrdersByCustomer', 
            'getMostRecentActiveOrder', 'updateOrderStatus', 'getTodaysOrders',
            // Real-time Listeners (7)
            'listenToOrders', 'listenToOrder', 'listenToCustomerOrders', 'listenToOrderByNumber',
            'listenToVenueOrders', 'listenToLossIncidents', 'listenToVenueLossIncidents',
            // Venues (4)
            'createVenue', 'updateVenue', 'getVenueByManager', 'getVenue',
            // Loss Tracking (8)
            'createLossIncident', 'getLossIncidents', 'getLossIncidentsByVenue', 'updateLossIncident',
            'deleteLossIncident', 'getLossAnalytics', 'getVenueLossAnalytics',
            // Utility (4)
            'generateOrderNumber', 'generateInviteCode', 'timestampToDate', 'getAuthErrorMessage'
        ];

        // Wrap each method with analytics tracking
        methodsToTrack.forEach(methodName => {
            if (VediAPI[methodName] && typeof VediAPI[methodName] === 'function') {
                originalMethods[methodName] = VediAPI[methodName];
                
                VediAPI[methodName] = async function(...args) {
                    const startTime = performance.now();
                    let success = true;
                    let errorCode = null;
                    let result = null;
                    const currentUser = await VediAPI.getCurrentUser().catch(() => null);
                    const userId = currentUser ? currentUser.id : null;

                    try {
                        // Call original method
                        result = await originalMethods[methodName].apply(this, args);
                        
                        // Track successful call
                        const responseTime = performance.now() - startTime;
                        await VediAnalytics.trackAPICall(methodName, userId, true, responseTime, null, {
                            argsCount: args.length,
                            hasResult: !!result
                        });

                        // Track specific user activities
                        await VediAnalytics.trackUserActivity(methodName, userId, `${methodName} completed successfully`);

                        // Track business metrics for relevant methods
                        if (methodName === 'createOrder' && result) {
                            await VediAnalytics.trackBusinessMetric('order', {
                                value: result.totalAmount || 0,
                                restaurantId: result.restaurantId
                            });
                        }

                        return result;

                    } catch (error) {
                        success = false;
                        errorCode = error.code || error.message || 'unknown_error';
                        
                        // Track failed call
                        const responseTime = performance.now() - startTime;
                        await VediAnalytics.trackAPICall(methodName, userId, false, responseTime, errorCode, {
                            argsCount: args.length,
                            errorMessage: error.message
                        });

                        // Track error
                        await VediAnalytics.trackError(methodName, errorCode, userId, {
                            args: args.length,
                            stack: error.stack
                        });

                        // Create system alert for critical errors
                        if (errorCode.includes('permission-denied') || errorCode.includes('network')) {
                            await VediAnalytics.createSystemAlert('error', 
                                `API Error: ${methodName}`, 
                                `Error: ${error.message}`,
                                { method: methodName, userId, errorCode }
                            );
                        }

                        throw error;
                    }
                };
            }
        });

        console.log(`✅ Analytics tracking enabled for ${methodsToTrack.length} VediAPI methods`);
    },

    // Setup real-time analytics listeners
    setupRealTimeListeners() {
        // Listen for new users
        firebase.firestore().collection('users').onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    this.trackUserActivity('new_user_registered', change.doc.id, 'New user joined the platform');
                }
            });
        });

        // Listen for new restaurants
        firebase.firestore().collection('restaurants').onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    this.trackUserActivity('new_restaurant_created', change.doc.data().ownerId, 'New restaurant registered');
                }
            });
        });

        // Listen for new orders
        firebase.firestore().collection('orders').onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    this.trackUserActivity('new_order_created', null, `Order ${change.doc.data().orderNumber} created`);
                }
            });
        });

        console.log('✅ Real-time analytics listeners active');
    }
};

// Auto-initialize analytics when this script loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait for Firebase to be ready
    setTimeout(async () => {
        try {
            await VediAnalytics.initialize();
            VediAnalytics.setupRealTimeListeners();
            console.log('🚀 Vedi Analytics System is now active!');
        } catch (error) {
            console.error('Failed to initialize Vedi Analytics:', error);
        }
    }, 2000);
});

// Export for use in maintenance dashboard
window.VediAnalytics = VediAnalytics;
