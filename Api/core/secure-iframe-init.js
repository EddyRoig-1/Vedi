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
            
            // Step 3: Validate inherited Firebase
            await this.validateFirebaseIntegrity();
            
            // Step 4: Verify authentication state
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
    const requiredMethods = ['getRestaurantByOwner'];
    const initializer = new SecureIframeInitializer(pageName, requiredMethods);
    
    const user = await initializer.initialize();
    
    // Load restaurant data
    const restaurant = await VediAPI.getRestaurantByOwner(user.id);
    if (!restaurant) {
        throw new Error('No restaurant found for user');
    }
    
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

console.log('🔐 Secure Iframe Initialization Module loaded');
