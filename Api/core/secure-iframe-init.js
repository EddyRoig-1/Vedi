/**
 * Secure Firebase Iframe Initialization Module
 * Provides secure authentication and Firebase inheritance for iframe pages
 */

class SecureIframeInitializer {
    constructor(pageName, requiredMethods = [], timeout = 10000) {
        this.pageName = pageName;
        this.timeout = timeout;
        this.maxRetries = 5;
        this.retryDelay = 500;
        this.requiredMethods = [
            'getCurrentUser',
            'timestampToDate',
            ...requiredMethods // Page-specific required methods
        ];
    }

    async initialize() {
        console.log(`🔐 [${this.pageName}] Starting secure initialization...`);
        
        try {
            // Step 1: Verify we're in an iframe context
            await this.verifyIframeContext();
            
            // Step 2: Inherit Firebase from parent with validation
            await this.inheritFirebaseSecurely();
            
            // Step 3: Inherit ALL VediAPI functions from parent (including venue-sync)
            await this.inheritAllVediAPIFunctions();
            
            // Step 4: Add missing utility functions
            await this.addMissingUtilityFunctions();
            
            // Step 5: Validate inherited Firebase
            await this.validateFirebaseIntegrity();
            
            // Step 6: Verify authentication state
            const user = await this.verifyAuthentication();
            
            console.log(`✅ [${this.pageName}] Secure initialization complete for user: ${user.email}`);
            return user;
            
        } catch (error) {
            console.error(`❌ [${this.pageName}] Initialization failed:`, error);
            throw new Error(`Failed to initialize ${this.pageName}: ${error.message}`);
        }
    }

    async verifyIframeContext() {
        // Security: Ensure we're actually in an iframe
        if (window.self === window.top) {
            throw new Error('This page must be loaded in an iframe');
        }
        
        // Security: Verify parent domain (optional but recommended)
        try {
            const parentOrigin = window.parent.location.origin;
            const currentOrigin = window.location.origin;
            
            if (parentOrigin !== currentOrigin) {
                console.warn(`⚠️ Cross-origin iframe detected: ${parentOrigin} -> ${currentOrigin}`);
                // Could add additional domain validation here
            }
        } catch (e) {
            // Cross-origin restrictions prevent access - this is actually good security
            console.log('🔒 Cross-origin restrictions active (secure)');
        }
    }

    async inheritFirebaseSecurely() {
        let attempts = 0;
        
        while (attempts < this.maxRetries) {
            try {
                // Check if parent has the required Firebase objects
                if (!window.parent) {
                    throw new Error('No parent window available');
                }
                
                if (!window.parent.VediAPI) {
                    throw new Error('Parent VediAPI not available');
                }
                
                if (!window.parent.firebase) {
                    throw new Error('Parent Firebase not available');
                }
                
                // Inherit Firebase objects
                window.VediAPI = window.parent.VediAPI;
                window.firebase = window.parent.firebase;
                
                console.log(`✅ [${this.pageName}] Firebase inherited from parent (attempt ${attempts + 1})`);
                return;
                
            } catch (error) {
                attempts++;
                console.log(`⏳ [${this.pageName}] Waiting for parent Firebase... (${attempts}/${this.maxRetries})`);
                
                if (attempts >= this.maxRetries) {
                    throw new Error(`Parent Firebase not available after ${this.maxRetries} attempts`);
                }
                
                await this.delay(this.retryDelay * attempts); // Exponential backoff
            }
        }
    }

    async inheritAllVediAPIFunctions() {
        console.log(`🔄 [${this.pageName}] Inheriting ALL VediAPI functions from parent...`);
        
        try {
            if (!window.parent || !window.parent.VediAPI) {
                throw new Error('Parent VediAPI not available');
            }

            // Get all function names from parent VediAPI
            const parentFunctions = Object.keys(window.parent.VediAPI);
            console.log(`📋 [${this.pageName}] Found ${parentFunctions.length} functions in parent VediAPI`);

            // Ensure local VediAPI exists
            if (!window.VediAPI) {
                window.VediAPI = {};
            }

            // Copy ALL functions from parent
            let inheritedCount = 0;
            parentFunctions.forEach(funcName => {
                if (typeof window.parent.VediAPI[funcName] === 'function') {
                    window.VediAPI[funcName] = window.parent.VediAPI[funcName];
                    inheritedCount++;
                }
            });

            console.log(`✅ [${this.pageName}] Successfully inherited ${inheritedCount} functions from parent`);

            // Specifically check for venue-sync functions
            const venueFunctions = [
                'getAllVenues',
                'getVenue', 
                'getRestaurantSyncStatus',
                'requestToJoinVenue',
                'cancelVenueRequest',
                'unsyncRestaurantFromVenue',
                'getRestaurantRequests',
                'logVenueActivity',
                'getAvailableVenuesForRestaurant',
                'checkVenueEligibility',
                'createVenueInvitation',
                'getVenueInvitations',
                'cancelInvitation',
                'acceptVenueInvitation',
                'declineVenueInvitation',
                'validateInviteCode',
                'approveRestaurantRequest',
                'denyRestaurantRequest',
                'syncRestaurantToVenue',
                'getVenueRestaurants',
                'getPendingRequestByRestaurant',
                'getVenueRequests'
            ];

            const availableVenueFunctions = venueFunctions.filter(func => 
                typeof window.VediAPI[func] === 'function'
            );

            console.log(`🏢 [${this.pageName}] Venue functions available: ${availableVenueFunctions.length}/${venueFunctions.length}`);
            console.log(`🏢 [${this.pageName}] Available venue functions:`, availableVenueFunctions);

            if (availableVenueFunctions.length === 0) {
                console.warn(`⚠️ [${this.pageName}] No venue functions found - venue features will be limited`);
            }

        } catch (error) {
            console.error(`❌ [${this.pageName}] Error inheriting VediAPI functions:`, error);
            throw error;
        }
    }

    async addMissingUtilityFunctions() {
        // Ensure VediAPI namespace exists
        if (!window.VediAPI) {
            window.VediAPI = {};
        }

        // Add missing utility functions only if they don't already exist

        // Generate unique invitation code
        if (!VediAPI.generateInviteCode) {
            VediAPI.generateInviteCode = function() {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let result = '';
                for (let i = 0; i < 8; i++) {
                    result += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return result;
            };
        }

        // Enhanced email validation
        if (!VediAPI.validateEmail) {
            VediAPI.validateEmail = function(email) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                return emailRegex.test(email);
            };
        }

        // Enhanced phone number validation
        if (!VediAPI.validatePhoneNumber) {
            VediAPI.validatePhoneNumber = function(phone) {
                // Remove all non-digit characters
                const cleaned = phone.replace(/\D/g, '');
                // Check if it's 10 or 11 digits (US format)
                return cleaned.length >= 10 && cleaned.length <= 11;
            };
        }

        // Remove undefined values from object
        if (!VediAPI.removeUndefinedValues) {
            VediAPI.removeUndefinedValues = function(obj) {
                const cleaned = {};
                for (const [key, value] of Object.entries(obj)) {
                    if (value !== undefined) {
                        cleaned[key] = value;
                    }
                }
                return cleaned;
            };
        }

        // Sanitize input string
        if (!VediAPI.sanitizeInput) {
            VediAPI.sanitizeInput = function(input) {
                if (typeof input !== 'string') return input;
                return input.trim().replace(/[<>]/g, '');
            };
        }

        // Start performance measurement
        if (!VediAPI.startPerformanceMeasurement) {
            VediAPI.startPerformanceMeasurement = function(operation) {
                const startTime = Date.now();
                return async function(success = true, metadata = {}) {
                    const duration = Date.now() - startTime;
                    console.log(`⚡ ${operation}: ${duration}ms ${success ? '✅' : '❌'}`, metadata);
                };
            };
        }

        // Track user activity (simplified version that doesn't hit Firebase)
        if (!VediAPI.trackUserActivity) {
            VediAPI.trackUserActivity = async function(action, metadata = {}) {
                console.log(`📊 User Activity: ${action}`, metadata);
                // Note: Actual Firebase tracking is disabled to reduce costs
                // This is just a console log placeholder
            };
        }

        // Track errors (simplified version that doesn't hit Firebase)
        if (!VediAPI.trackError) {
            VediAPI.trackError = async function(error, context = 'unknown', metadata = {}) {
                console.error(`❌ Error [${context}]:`, error.message, metadata);
                // Note: Actual Firebase error tracking is disabled to reduce costs
                // This is just a console log placeholder
            };
        }

        console.log(`🔧 [${this.pageName}] Missing utility functions added to VediAPI`);
    }

    async validateFirebaseIntegrity() {
        // Security: Validate that inherited Firebase has required functions
        for (const method of this.requiredMethods) {
            if (!VediAPI[method] || typeof VediAPI[method] !== 'function') {
                throw new Error(`Required VediAPI method '${method}' not available`);
            }
        }
        
        // Additional validation: Check if Firebase app is initialized
        if (!firebase.apps || firebase.apps.length === 0) {
            throw new Error('Firebase app not initialized in parent');
        }
        
        console.log(`✅ [${this.pageName}] Firebase integrity validated`);
    }

    async verifyAuthentication() {
        try {
            // Use timeout to prevent hanging
            const user = await Promise.race([
                VediAPI.getCurrentUser(),
                this.timeoutPromise(this.timeout, 'Authentication check timed out')
            ]);
            
            if (!user) {
                throw new Error('User not authenticated');
            }
            
            // Security: Basic user object validation
            if (!user.id || !user.email) {
                throw new Error('Invalid user object structure');
            }
            
            return user;
            
        } catch (error) {
            throw new Error(`Authentication verification failed: ${error.message}`);
        }
    }

    // Utility methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    timeoutPromise(ms, message) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error(message)), ms);
        });
    }
}

// Global initialization function
window.initializeSecurely = async function(pageName) {
    const initializer = new SecureIframeInitializer(pageName);
    return await initializer.initialize();
};

// Enhanced error handling with security context
window.showSecurityError = function(error) {
    const securityErrors = [
        'This page must be loaded in an iframe',
        'Parent Firebase not available',
        'User not authenticated',
        'Invalid user object structure'
    ];
    
    const isSecurityError = securityErrors.some(msg => error.message.includes(msg));
    
    if (isSecurityError) {
        // Security errors get special handling
        if (typeof showError === 'function') {
            showError('Security validation failed. Please refresh the main dashboard.');
        }
        
        // Optional: Communicate back to parent
        try {
            window.parent.postMessage({
                type: 'securityError',
                source: window.location.pathname,
                error: error.message
            }, window.location.origin);
        } catch (e) {
            // Ignore if can't communicate with parent
        }
    } else {
        if (typeof showError === 'function') {
            showError(error.message);
        }
    }
};

// Page-specific initialization functions
window.initializeRestaurantPage = async function(pageName) {
    // Only require essential methods - venue functions are optional
    const requiredMethods = [
        'getRestaurantByOwner',
        'updateRestaurant',
        'validateEmail',
        'validatePhoneNumber',
        'sanitizeInput',
        'removeUndefinedValues'
    ];
    const initializer = new SecureIframeInitializer(pageName, requiredMethods);
    
    const user = await initializer.initialize();
    
    // Load restaurant data
    const restaurant = await VediAPI.getRestaurantByOwner(user.id);
    if (!restaurant) {
        throw new Error('No restaurant found for user');
    }
    
    // Log available functions for debugging
    console.log('🔍 Available VediAPI functions:', Object.keys(VediAPI).length);
    console.log('🔍 Venue functions available:', {
        getAllVenues: typeof VediAPI.getAllVenues,
        getRestaurantSyncStatus: typeof VediAPI.getRestaurantSyncStatus,
        requestToJoinVenue: typeof VediAPI.requestToJoinVenue,
        cancelVenueRequest: typeof VediAPI.cancelVenueRequest,
        unsyncRestaurantFromVenue: typeof VediAPI.unsyncRestaurantFromVenue,
        getRestaurantRequests: typeof VediAPI.getRestaurantRequests
    });
    
    return { user, restaurant };
};

window.initializeIncidentsPage = async function(pageName) {
    const requiredMethods = ['getLossIncidents', 'createLossIncident', 'listenToLossIncidents'];
    const initializer = new SecureIframeInitializer(pageName, requiredMethods);
    
    const user = await initializer.initialize();
    
    const restaurant = await VediAPI.getRestaurantByOwner(user.id);
    if (!restaurant) {
        throw new Error('No restaurant found for user');
    }
    
    return { user, restaurant };
};

window.initializeOrdersPage = async function(pageName) {
    const requiredMethods = ['getOrders', 'createOrder', 'updateOrderStatus'];
    const initializer = new SecureIframeInitializer(pageName, requiredMethods);
    
    const user = await initializer.initialize();
    
    const restaurant = await VediAPI.getRestaurantByOwner(user.id);
    if (!restaurant) {
        throw new Error('No restaurant found for user');
    }
    
    return { user, restaurant };
};

window.initializeMenuPage = async function(pageName) {
    const requiredMethods = [
        'getRestaurantByOwner', 
        'getMenuCategories', 
        'getMenuItems',
        'createMenuCategory',
        'createMenuItem',
        'updateMenuItem',
        'deleteMenuItem',
        'updateMenuCategory',
        'deleteMenuCategory',
        'updateItemStock'
    ];
    const initializer = new SecureIframeInitializer(pageName, requiredMethods);
    
    const user = await initializer.initialize();
    
    // Load restaurant data
    const restaurant = await VediAPI.getRestaurantByOwner(user.id);
    if (!restaurant) {
        throw new Error('No restaurant found for user');
    }
    
    // Load menu data
    const categories = await VediAPI.getMenuCategories(restaurant.id);
    const menuItems = await VediAPI.getMenuItems(restaurant.id);
    
    return { 
        user, 
        restaurant, 
        categories: categories || [], 
        menuItems: menuItems || [] 
    };
};

// NEW: Venue management page initialization
window.initializeVenuePage = async function(pageName) {
    const requiredMethods = [
        'getVenueByManager',
        'updateVenue',
        'getAllVenues',
        'getVenueRestaurants',
        'getVenueRequests',
        'approveRestaurantRequest',
        'denyRestaurantRequest',
        'createVenueInvitation',
        'getVenueInvitations',
        'cancelInvitation'
    ];
    const initializer = new SecureIframeInitializer(pageName, requiredMethods);
    
    const user = await initializer.initialize();
    
    // Load venue data for venue managers
    let venue = null;
    if (typeof VediAPI.getVenueByManager === 'function') {
        venue = await VediAPI.getVenueByManager(user.id);
    }
    
    if (!venue) {
        throw new Error('No venue found for user - you must be a venue manager to access this page');
    }
    
    return { user, venue };
};

// NEW: Admin page initialization  
window.initializeAdminPage = async function(pageName) {
    const requiredMethods = [
        'getAllRestaurants',
        'getAllVenues', 
        'updateRestaurantVerification',
        'updateVenueVerification',
        'getSystemStats'
    ];
    const initializer = new SecureIframeInitializer(pageName, requiredMethods);
    
    const user = await initializer.initialize();
    
    // Verify admin permissions
    if (!user.isAdmin && !user.roles?.includes('admin')) {
        throw new Error('Access denied: Admin privileges required');
    }
    
    return { user };
};

// Global Firebase helper functions that are commonly needed
window.getFirebaseDb = function() {
    if (window.firebase && window.firebase.firestore) {
        return window.firebase.firestore();
    }
    throw new Error('Firebase Firestore not available');
};

window.getFirebaseAuth = function() {
    if (window.firebase && window.firebase.auth) {
        return window.firebase.auth();
    }
    throw new Error('Firebase Auth not available');
};

window.getFirebaseStorage = function() {
    if (window.firebase && window.firebase.storage) {
        return window.firebase.storage();
    }
    throw new Error('Firebase Storage not available');
};

// Utility function to check if we're in an iframe
window.isInIframe = function() {
    return window.self !== window.top;
};

// Utility function to communicate with parent window
window.sendMessageToParent = function(type, data = {}) {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            type: type,
            source: window.location.pathname,
            timestamp: Date.now(),
            ...data
        }, window.location.origin);
    }
};

// Enhanced debugging function
window.debugVediAPI = function() {
    if (!window.VediAPI) {
        console.log('❌ VediAPI not available');
        return;
    }
    
    const functions = Object.keys(window.VediAPI).filter(key => 
        typeof window.VediAPI[key] === 'function'
    );
    
    const venueFunctions = functions.filter(name => 
        name.toLowerCase().includes('venue') || 
        name.toLowerCase().includes('sync')
    );
    
    const restaurantFunctions = functions.filter(name => 
        name.toLowerCase().includes('restaurant')
    );
    
    const orderFunctions = functions.filter(name => 
        name.toLowerCase().includes('order')
    );
    
    const menuFunctions = functions.filter(name => 
        name.toLowerCase().includes('menu') || 
        name.toLowerCase().includes('item') || 
        name.toLowerCase().includes('category')
    );
    
    console.log('🔍 VediAPI Debug Information:');
    console.log(`📊 Total functions: ${functions.length}`);
    console.log(`🏢 Venue functions: ${venueFunctions.length}`, venueFunctions);
    console.log(`🏪 Restaurant functions: ${restaurantFunctions.length}`, restaurantFunctions);
    console.log(`📋 Order functions: ${orderFunctions.length}`, orderFunctions);
    console.log(`🍽️ Menu functions: ${menuFunctions.length}`, menuFunctions);
    
    return {
        total: functions.length,
        venue: venueFunctions,
        restaurant: restaurantFunctions,
        order: orderFunctions,
        menu: menuFunctions,
        all: functions
    };
};

console.log('🔐 Secure Iframe Initialization Module loaded');
console.log('🔧 Enhanced with utility functions for restaurant settings page');
console.log('✅ Available utilities: generateInviteCode, validateEmail, validatePhoneNumber');
console.log('✅ Available utilities: removeUndefinedValues, sanitizeInput, startPerformanceMeasurement');
console.log('✅ Available utilities: trackUserActivity, trackError (console-only versions)');
console.log('🔄 NEW: Inherits ALL VediAPI functions from parent, including venue-sync functions');
console.log('🎯 NEW: Added venue page, admin page, and enhanced debugging support');
