/**
 * Staff Authentication and Permission System
 * Handles role-based access control for restaurant staff
 */

class StaffAuth {
    
    /**
     * Permission levels and their access rights
     */
    static PERMISSION_LEVELS = {
        owner: {
            level: 0,
            name: 'Owner',
            pages: ['*'], // All pages
            features: ['*'] // All features
        },
        full: {
            level: 1,
            name: 'Full Permissions',
            pages: ['dashboard', 'orders', 'pos-order', 'loss-reports', 'staff-clock', 'menu-management', 'restaurant-settings'],
            features: ['view_orders', 'create_orders', 'view_reports', 'manage_staff', 'manage_menu', 'view_settings', 'clock_in_out']
        },
        advanced: {
            level: 2,
            name: 'Advanced Permissions',
            pages: ['orders', 'pos-order', 'loss-reports', 'staff-clock'],
            features: ['view_orders', 'create_orders', 'view_reports', 'clock_in_out']
        },
        basic: {
            level: 3,
            name: 'Basic Permissions',
            pages: ['orders', 'staff-clock'],
            features: ['view_orders', 'clock_in_out']
        }
    };

    /**
     * Check if current user has required permission level
     * @param {string} requiredRole - Required permission level (owner, full, advanced, basic)
     * @returns {Promise<boolean>} True if user has permission
     */
    static async checkStaffPermission(requiredRole) {
        try {
            const currentUser = firebase.auth().currentUser;
            if (!currentUser) {
                console.log('❌ No authenticated user');
                return false;
            }

            const userRole = await this.getUserRole(currentUser.uid);
            if (!userRole) {
                console.log('❌ User role not found');
                return false;
            }

            const hasPermission = this.hasRequiredPermission(userRole, requiredRole);
            console.log(`🔒 Permission check: ${userRole} vs ${requiredRole} = ${hasPermission}`);
            
            return hasPermission;
            
        } catch (error) {
            console.error('❌ Permission check failed:', error);
            return false;
        }
    }

    /**
     * Get current user's role and profile
     * @param {string} uid - User ID
     * @returns {Promise<Object|null>} User role and profile data
     */
    static async getStaffProfile(uid) {
        try {
            // Check if user is restaurant owner (exists in users collection)
            const ownerRestaurant = await this.checkIfOwner(uid);
            if (ownerRestaurant) {
                return {
                    role: 'owner',
                    name: ownerRestaurant.ownerName,
                    email: ownerRestaurant.ownerEmail,
                    restaurantId: ownerRestaurant.id,
                    restaurantName: ownerRestaurant.name,
                    isOwner: true,
                    uid: uid
                };
            }

            // Check if user is staff member (exists in staff_members collection)
            const staffProfile = await this.getStaffMemberProfile(uid);
            if (staffProfile) {
                return {
                    ...staffProfile,
                    isOwner: false,
                    uid: uid
                };
            }

            return null;
            
        } catch (error) {
            console.error('❌ Failed to get staff profile:', error);
            return null;
        }
    }

    /**
     * Check if user has access to a specific page
     * @param {string} staffRole - User's role
     * @param {string} pageName - Page name to check
     * @returns {boolean} True if user has access
     */
    static hasPageAccess(staffRole, pageName) {
        const permissions = this.PERMISSION_LEVELS[staffRole];
        if (!permissions) return false;

        // Owner has access to everything
        if (staffRole === 'owner') return true;

        // Check if page is in allowed pages
        return permissions.pages.includes(pageName) || permissions.pages.includes('*');
    }

    /**
     * Check if user has access to a specific feature
     * @param {string} staffRole - User's role
     * @param {string} featureName - Feature name to check
     * @returns {boolean} True if user has access
     */
    static hasFeatureAccess(staffRole, featureName) {
        const permissions = this.PERMISSION_LEVELS[staffRole];
        if (!permissions) return false;

        // Owner has access to everything
        if (staffRole === 'owner') return true;

        // Check if feature is in allowed features
        return permissions.features.includes(featureName) || permissions.features.includes('*');
    }

    /**
     * Redirect user to appropriate login page
     */
    static redirectToStaffLogin() {
        const currentUrl = window.location.pathname;
        const params = new URLSearchParams(window.location.search);
        
        // Preserve current page for redirect after login
        params.set('redirect', currentUrl);
        
        window.location.href = `login.html?${params.toString()}`;
    }

    /**
     * Redirect user to unauthorized page
     */
    static redirectToUnauthorized() {
        window.location.href = 'unauthorized.html';
    }

    /**
     * Get user's role from database
     * @param {string} uid - User ID
     * @returns {Promise<string|null>} User role or null
     */
    static async getUserRole(uid) {
        try {
            // Check if owner (exists in users collection)
            const ownerRestaurant = await this.checkIfOwner(uid);
            if (ownerRestaurant) {
                return 'owner';
            }

            // Check if staff (exists in staff_members collection)
            const staffProfile = await this.getStaffMemberProfile(uid);
            if (staffProfile) {
                return staffProfile.role;
            }

            return null;
            
        } catch (error) {
            console.error('❌ Failed to get user role:', error);
            return null;
        }
    }

    /**
     * Check if user is restaurant owner
     * @param {string} uid - User ID
     * @returns {Promise<Object|null>} Restaurant data or null
     */
    static async checkIfOwner(uid) {
        try {
            // Check in users collection first
            const userDoc = await firebase.firestore()
                .collection('users')
                .doc(uid)
                .get();

            if (userDoc.exists) {
                const userData = userDoc.data();
                // If user exists in users collection, they're an owner
                
                // Get their restaurant
                const restaurantSnapshot = await firebase.firestore()
                    .collection('restaurants')
                    .where('ownerId', '==', uid)
                    .limit(1)
                    .get();

                if (!restaurantSnapshot.empty) {
                    return {
                        id: restaurantSnapshot.docs[0].id,
                        ...restaurantSnapshot.docs[0].data(),
                        ownerName: userData.name || userData.displayName || 'Restaurant Owner',
                        ownerEmail: userData.email || ''
                    };
                }
            }

            return null;
            
        } catch (error) {
            console.error('❌ Failed to check owner status:', error);
            return null;
        }
    }

    /**
     * Get staff member profile
     * @param {string} uid - User ID
     * @returns {Promise<Object|null>} Staff profile or null
     */
    static async getStaffMemberProfile(uid) {
        try {
            const staffSnapshot = await firebase.firestore()
                .collection('staff_members')
                .where('uid', '==', uid)
                .where('isActive', '==', true)
                .limit(1)
                .get();

            if (!staffSnapshot.empty) {
                const staffData = staffSnapshot.docs[0].data();
                
                // Get restaurant name
                const restaurantDoc = await firebase.firestore()
                    .collection('restaurants')
                    .doc(staffData.restaurantId)
                    .get();
                
                return {
                    id: staffSnapshot.docs[0].id,
                    ...staffData,
                    restaurantName: restaurantDoc.exists ? restaurantDoc.data().name : 'Unknown Restaurant'
                };
            }

            return null;
            
        } catch (error) {
            console.error('❌ Failed to get staff profile:', error);
            return null;
        }
    }

    /**
     * Check if user role has required permission level
     * @param {string} userRole - User's current role
     * @param {string} requiredRole - Required role
     * @returns {boolean} True if user has permission
     */
    static hasRequiredPermission(userRole, requiredRole) {
        const userPermissions = this.PERMISSION_LEVELS[userRole];
        const requiredPermissions = this.PERMISSION_LEVELS[requiredRole];

        if (!userPermissions || !requiredPermissions) {
            return false;
        }

        // Lower level number = higher permission
        return userPermissions.level <= requiredPermissions.level;
    }

    /**
     * Initialize page protection
     * @param {string} requiredRole - Required role for this page
     * @param {string} pageName - Current page name
     * @returns {Promise<Object>} User profile if authorized
     */
    static async initializePageProtection(requiredRole, pageName) {
        try {
            console.log(`🔒 Initializing page protection for ${pageName} (requires: ${requiredRole})`);
            
            // Check if user is authenticated
            const currentUser = firebase.auth().currentUser;
            if (!currentUser) {
                console.log('❌ User not authenticated');
                this.redirectToStaffLogin();
                throw new Error('User not authenticated');
            }

            // Get user profile
            const userProfile = await this.getStaffProfile(currentUser.uid);
            if (!userProfile) {
                console.log('❌ User profile not found');
                this.redirectToUnauthorized();
                throw new Error('User profile not found');
            }

            // Check page access
            if (!this.hasPageAccess(userProfile.role, pageName)) {
                console.log(`❌ User ${userProfile.role} denied access to ${pageName}`);
                this.redirectToUnauthorized();
                throw new Error('Access denied');
            }

            // Check role permission
            if (!this.hasRequiredPermission(userProfile.role, requiredRole)) {
                console.log(`❌ User ${userProfile.role} lacks required permission ${requiredRole}`);
                this.redirectToUnauthorized();
                throw new Error('Insufficient permissions');
            }

            console.log(`✅ Access granted to ${pageName} for ${userProfile.role}`);
            return userProfile;
            
        } catch (error) {
            console.error('❌ Page protection failed:', error);
            throw error;
        }
    }

    /**
     * Generate navigation menu based on user role
     * @param {string} userRole - User's role
     * @returns {Array} Array of navigation items
     */
    static getNavigationItems(userRole) {
        const permissions = this.PERMISSION_LEVELS[userRole];
        if (!permissions) return [];

        const allNavItems = [
            { name: 'Dashboard', page: 'dashboard', icon: 'dashboard', requiredRole: 'full' },
            { name: 'Orders', page: 'orders', icon: 'orders', requiredRole: 'basic' },
            { name: 'POS System', page: 'pos-order', icon: 'pos', requiredRole: 'advanced' },
            { name: 'Loss Reports', page: 'loss-reports', icon: 'reports', requiredRole: 'advanced' },
            { name: 'Staff Clock', page: 'staff-clock', icon: 'clock', requiredRole: 'basic' },
            { name: 'Menu Management', page: 'menu-management', icon: 'menu', requiredRole: 'full' },
            { name: 'Settings', page: 'restaurant-settings', icon: 'settings', requiredRole: 'full' }
        ];

        return allNavItems.filter(item => {
            return this.hasRequiredPermission(userRole, item.requiredRole);
        });
    }

    /**
     * Check if user is currently clocked in
     * @param {string} uid - User ID
     * @param {string} restaurantId - Restaurant ID
     * @returns {Promise<boolean>} True if clocked in
     */
    static async isUserClockedIn(uid, restaurantId) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            const clockedInSnapshot = await firebase.firestore()
                .collection('staff_time_records')
                .where('staffUID', '==', uid)
                .where('restaurantId', '==', restaurantId)
                .where('date', '==', today)
                .where('status', '==', 'clocked_in')
                .limit(1)
                .get();

            return !clockedInSnapshot.empty;
            
        } catch (error) {
            console.error('❌ Failed to check clock in status:', error);
            return false;
        }
    }

    /**
     * Clock in user
     * @param {string} uid - User ID
     * @param {string} restaurantId - Restaurant ID
     * @returns {Promise<boolean>} True if successful
     */
    static async clockIn(uid, restaurantId) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // Check if already clocked in
            const alreadyClockedIn = await this.isUserClockedIn(uid, restaurantId);
            if (alreadyClockedIn) {
                throw new Error('Already clocked in today');
            }

            // Create clock in record
            await firebase.firestore().collection('staff_time_records').add({
                staffUID: uid,
                restaurantId: restaurantId,
                clockInTime: firebase.firestore.FieldValue.serverTimestamp(),
                clockOutTime: null,
                status: 'clocked_in',
                date: today,
                totalHours: null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            return true;
            
        } catch (error) {
            console.error('❌ Clock in failed:', error);
            throw error;
        }
    }

    /**
     * Get user's current clock in record
     * @param {string} uid - User ID
     * @param {string} restaurantId - Restaurant ID
     * @returns {Promise<Object|null>} Clock in record or null
     */
    static async getCurrentClockInRecord(uid, restaurantId) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            const clockInSnapshot = await firebase.firestore()
                .collection('staff_time_records')
                .where('staffUID', '==', uid)
                .where('restaurantId', '==', restaurantId)
                .where('date', '==', today)
                .where('status', '==', 'clocked_in')
                .limit(1)
                .get();

            if (!clockInSnapshot.empty) {
                return {
                    id: clockInSnapshot.docs[0].id,
                    ...clockInSnapshot.docs[0].data()
                };
            }

            return null;
            
        } catch (error) {
            console.error('❌ Failed to get clock in record:', error);
            return null;
        }
    }

    /**
     * Utility function to wait for Firebase authentication
     * @returns {Promise<Object>} Current user or null
     */
    static waitForAuth() {
        return new Promise((resolve) => {
            const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
                unsubscribe();
                resolve(user);
            });
        });
    }

    /**
     * Debug function to log user permissions
     * @param {string} uid - User ID
     */
    static async debugUserPermissions(uid) {
        try {
            const profile = await this.getStaffProfile(uid);
            if (profile) {
                console.log('🔍 User Debug Info:', {
                    role: profile.role,
                    name: profile.name,
                    restaurantId: profile.restaurantId,
                    permissions: this.PERMISSION_LEVELS[profile.role],
                    availablePages: this.getNavigationItems(profile.role)
                });
            } else {
                console.log('🔍 User Debug Info: No profile found');
            }
        } catch (error) {
            console.error('❌ Debug failed:', error);
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StaffAuth;
}

// Make available globally
window.StaffAuth = StaffAuth;

console.log('✅ Staff Authentication System loaded');
