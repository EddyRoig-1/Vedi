/**
 * Staff Authentication and Permission System
 * Handles role-based access control for restaurant staff with dynamic roles
 */

class StaffAuth {
    
    /**
     * Available pages in the system (hardcoded)
     */
    static AVAILABLE_PAGES = [
        'dashboard',
        'incident-reports', 
        'menu-management',
        'orders',
        'pos-order',
        'qr-generator',
        'restaurant-analytics',
        'restaurant-settings',
        'restaurant-staff',
        'staff-management'
    ];

    /**
     * Default roles that every restaurant starts with
     */
    static DEFAULT_ROLES = [
        {
            roleId: 'basic',
            name: 'Basic Permissions',
            pages: ['orders', 'restaurant-staff'],
            isDefault: true
        },
        {
            roleId: 'advanced',
            name: 'Advanced Permissions', 
            pages: ['orders', 'pos-order', 'incident-reports', 'restaurant-staff'],
            isDefault: true
        },
        {
            roleId: 'full',
            name: 'Full Permissions',
            pages: ['dashboard', 'orders', 'pos-order', 'incident-reports', 'restaurant-staff', 'menu-management', 'restaurant-settings'],
            isDefault: true
        }
    ];

    /**
     * Owner permissions (always hardcoded - full access)
     */
    static OWNER_PERMISSIONS = {
        role: 'owner',
        name: 'Owner',
        pages: ['*'], // All pages
        isDefault: false
    };

    /**
     * Cache for restaurant roles to avoid repeated database calls
     */
    static roleCache = new Map();

    /**
     * Get all available pages in the system
     * @returns {Array} Array of available page names
     */
    static getAvailablePages() {
        return [...this.AVAILABLE_PAGES];
    }

    /**
     * Initialize default roles for a restaurant
     * @param {string} restaurantId - Restaurant ID
     * @returns {Promise<void>}
     */
    static async initializeDefaultRoles(restaurantId) {
        try {
            console.log(`🔧 Initializing default roles for restaurant: ${restaurantId}`);
            
            // Check if roles already exist
            const existingRoles = await this.getRestaurantRoles(restaurantId);
            if (existingRoles.length > 0) {
                console.log('✅ Restaurant already has roles initialized');
                return;
            }

            // Create default roles
            const batch = firebase.firestore().batch();
            
            this.DEFAULT_ROLES.forEach(role => {
                const roleRef = firebase.firestore().collection('restaurant_roles').doc();
                batch.set(roleRef, {
                    ...role,
                    restaurantId: restaurantId,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });

            await batch.commit();
            console.log('✅ Default roles initialized successfully');
            
            // Clear cache for this restaurant
            this.roleCache.delete(restaurantId);
            
        } catch (error) {
            console.error('❌ Failed to initialize default roles:', error);
            throw error;
        }
    }

    /**
     * Get all roles for a restaurant
     * @param {string} restaurantId - Restaurant ID
     * @param {boolean} useCache - Whether to use cached data
     * @returns {Promise<Array>} Array of role objects
     */
    static async getRestaurantRoles(restaurantId, useCache = true) {
        try {
            // Check cache first
            if (useCache && this.roleCache.has(restaurantId)) {
                return this.roleCache.get(restaurantId);
            }

            console.log(`🔍 Loading roles for restaurant: ${restaurantId}`);
            
            const rolesSnapshot = await firebase.firestore()
                .collection('restaurant_roles')
                .where('restaurantId', '==', restaurantId)
                .orderBy('createdAt', 'asc')
                .get();

            const roles = rolesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Cache the results
            this.roleCache.set(restaurantId, roles);
            
            console.log(`✅ Loaded ${roles.length} roles for restaurant`);
            return roles;
            
        } catch (error) {
            console.error('❌ Failed to get restaurant roles:', error);
            throw error;
        }
    }

    /**
     * Get a specific role by ID
     * @param {string} restaurantId - Restaurant ID
     * @param {string} roleId - Role ID
     * @returns {Promise<Object|null>} Role object or null
     */
    static async getRole(restaurantId, roleId) {
        try {
            const roles = await this.getRestaurantRoles(restaurantId);
            return roles.find(role => role.roleId === roleId) || null;
        } catch (error) {
            console.error('❌ Failed to get role:', error);
            return null;
        }
    }

    /**
     * Create a new custom role
     * @param {string} restaurantId - Restaurant ID
     * @param {Object} roleData - Role data {roleId, name, pages}
     * @returns {Promise<string>} Document ID of created role
     */
    static async createRole(restaurantId, roleData) {
        try {
            console.log(`🔧 Creating new role: ${roleData.name}`);
            
            // Validate pages
            const invalidPages = roleData.pages.filter(page => !this.AVAILABLE_PAGES.includes(page));
            if (invalidPages.length > 0) {
                throw new Error(`Invalid pages: ${invalidPages.join(', ')}`);
            }

            // Check if roleId already exists (to prevent duplicates)
            const existingRole = await this.getRole(restaurantId, roleData.roleId);
            if (existingRole) {
                // If role exists, generate a unique ID by appending a number
                let counter = 1;
                let uniqueRoleId = `${roleData.roleId}-${counter}`;
                
                while (await this.getRole(restaurantId, uniqueRoleId)) {
                    counter++;
                    uniqueRoleId = `${roleData.roleId}-${counter}`;
                }
                
                roleData.roleId = uniqueRoleId;
                console.log(`🔄 Role ID already exists, using: ${uniqueRoleId}`);
            }

            const roleRef = firebase.firestore().collection('restaurant_roles').doc();
            await roleRef.set({
                restaurantId: restaurantId,
                roleId: roleData.roleId,
                name: roleData.name,
                pages: roleData.pages,
                isDefault: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Clear cache
            this.roleCache.delete(restaurantId);
            
            console.log('✅ Role created successfully with ID:', roleData.roleId);
            return roleRef.id;
            
        } catch (error) {
            console.error('❌ Failed to create role:', error);
            throw error;
        }
    }

    /**
     * Update an existing role
     * @param {string} restaurantId - Restaurant ID
     * @param {string} roleId - Role ID to update
     * @param {Object} updateData - Data to update {name?, pages?}
     * @returns {Promise<void>}
     */
    static async updateRole(restaurantId, roleId, updateData) {
        try {
            console.log(`🔧 Updating role: ${roleId}`);
            
            // Validate pages if provided
            if (updateData.pages) {
                const invalidPages = updateData.pages.filter(page => !this.AVAILABLE_PAGES.includes(page));
                if (invalidPages.length > 0) {
                    throw new Error(`Invalid pages: ${invalidPages.join(', ')}`);
                }
            }

            // Find the role document
            const rolesSnapshot = await firebase.firestore()
                .collection('restaurant_roles')
                .where('restaurantId', '==', restaurantId)
                .where('roleId', '==', roleId)
                .limit(1)
                .get();

            if (rolesSnapshot.empty) {
                throw new Error(`Role '${roleId}' not found`);
            }

            const roleDoc = rolesSnapshot.docs[0];
            await roleDoc.ref.update({
                ...updateData,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Clear cache
            this.roleCache.delete(restaurantId);
            
            console.log('✅ Role updated successfully');
            
        } catch (error) {
            console.error('❌ Failed to update role:', error);
            throw error;
        }
    }

    /**
     * Delete a role (only custom roles, not default ones)
     * @param {string} restaurantId - Restaurant ID
     * @param {string} roleId - Role ID to delete
     * @returns {Promise<void>}
     */
    static async deleteRole(restaurantId, roleId) {
        try {
            console.log(`🔧 Deleting role: ${roleId}`);
            
            // Find the role document
            const rolesSnapshot = await firebase.firestore()
                .collection('restaurant_roles')
                .where('restaurantId', '==', restaurantId)
                .where('roleId', '==', roleId)
                .limit(1)
                .get();

            if (rolesSnapshot.empty) {
                throw new Error(`Role '${roleId}' not found`);
            }

            const roleData = rolesSnapshot.docs[0].data();
            
            // Prevent deletion of default roles
            if (roleData.isDefault) {
                throw new Error('Cannot delete default roles');
            }

            // Check if any staff members have this role
            const staffSnapshot = await firebase.firestore()
                .collection('staff_members')
                .where('restaurantId', '==', restaurantId)
                .where('role', '==', roleId)
                .limit(1)
                .get();

            if (!staffSnapshot.empty) {
                throw new Error('Cannot delete role that is assigned to staff members');
            }

            // Delete the role
            await rolesSnapshot.docs[0].ref.delete();
            
            // Clear cache
            this.roleCache.delete(restaurantId);
            
            console.log('✅ Role deleted successfully');
            
        } catch (error) {
            console.error('❌ Failed to delete role:', error);
            throw error;
        }
    }

    /**
     * Check if current user has required permission level
     * @param {string} requiredRole - Required permission level
     * @returns {Promise<boolean>} True if user has permission
     */
    static async checkStaffPermission(requiredRole) {
        try {
            const currentUser = firebase.auth().currentUser;
            if (!currentUser) {
                console.log('❌ No authenticated user');
                return false;
            }

            const userProfile = await this.getStaffProfile(currentUser.uid);
            if (!userProfile) {
                console.log('❌ User profile not found');
                return false;
            }

            const hasPermission = await this.hasRequiredPermission(userProfile.role, requiredRole, userProfile.restaurantId);
            console.log(`🔒 Permission check: ${userProfile.role} vs ${requiredRole} = ${hasPermission}`);
            
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
                    uid: uid,
                    permissions: this.OWNER_PERMISSIONS
                };
            }

            // Check if user is staff member (exists in staff_members collection)
            const staffProfile = await this.getStaffMemberProfile(uid);
            if (staffProfile) {
                // Get role permissions from database
                const rolePermissions = await this.getRole(staffProfile.restaurantId, staffProfile.role);
                
                return {
                    ...staffProfile,
                    isOwner: false,
                    uid: uid,
                    permissions: rolePermissions
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
     * @param {string} restaurantId - Restaurant ID
     * @returns {Promise<boolean>} True if user has access
     */
    static async hasPageAccess(staffRole, pageName, restaurantId) {
        try {
            // Owner has access to everything
            if (staffRole === 'owner') return true;

            // Get role permissions from database
            const rolePermissions = await this.getRole(restaurantId, staffRole);
            if (!rolePermissions) return false;

            // Check if page is in allowed pages
            return rolePermissions.pages.includes(pageName) || rolePermissions.pages.includes('*');
            
        } catch (error) {
            console.error('❌ Failed to check page access:', error);
            return false;
        }
    }

    /**
     * Check if user role has required permission level
     * @param {string} userRole - User's current role
     * @param {string} requiredRole - Required role
     * @param {string} restaurantId - Restaurant ID
     * @returns {Promise<boolean>} True if user has permission
     */
    static async hasRequiredPermission(userRole, requiredRole, restaurantId) {
        try {
            // Owner always has all permissions
            if (userRole === 'owner') return true;

            // Get role permissions from database
            const userRoleData = await this.getRole(restaurantId, userRole);
            const requiredRoleData = await this.getRole(restaurantId, requiredRole);

            if (!userRoleData || !requiredRoleData) return false;

            // For now, simple role matching - can be enhanced later
            return userRole === requiredRole || userRole === 'owner';
            
        } catch (error) {
            console.error('❌ Failed to check required permission:', error);
            return false;
        }
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

            // Initialize default roles if needed
            if (userProfile.isOwner) {
                await this.initializeDefaultRoles(userProfile.restaurantId);
            }

            // Check page access
            const hasAccess = await this.hasPageAccess(userProfile.role, pageName, userProfile.restaurantId);
            if (!hasAccess) {
                console.log(`❌ User ${userProfile.role} denied access to ${pageName}`);
                this.redirectToUnauthorized();
                throw new Error('Access denied');
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
     * @param {string} restaurantId - Restaurant ID
     * @returns {Promise<Array>} Array of navigation items
     */
    static async getNavigationItems(userRole, restaurantId) {
        try {
            // Owner gets all pages
            if (userRole === 'owner') {
                return this.AVAILABLE_PAGES.map(page => ({
                    name: this.getPageDisplayName(page),
                    page: page,
                    accessible: true
                }));
            }

            // Get role permissions from database
            const rolePermissions = await this.getRole(restaurantId, userRole);
            if (!rolePermissions) return [];

            return this.AVAILABLE_PAGES.map(page => ({
                name: this.getPageDisplayName(page),
                page: page,
                accessible: rolePermissions.pages.includes(page)
            }));
            
        } catch (error) {
            console.error('❌ Failed to get navigation items:', error);
            return [];
        }
    }

    /**
     * Get display name for a page
     * @param {string} pageName - Internal page name
     * @returns {string} Display name
     */
    static getPageDisplayName(pageName) {
        const displayNames = {
            'dashboard': 'Dashboard',
            'incident-reports': 'Incident Reports',
            'menu-management': 'Menu Management',
            'orders': 'Orders',
            'pos-order': 'POS System',
            'qr-generator': 'QR Codes',
            'restaurant-analytics': 'Analytics',
            'restaurant-settings': 'Settings',
            'restaurant-staff': 'Staff Clock',
            'staff-management': 'Staff Management'
        };
        
        return displayNames[pageName] || pageName;
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
                
                // Check if user is restaurant owner by accountType
                if (userData.accountType === 'restaurant') {
                    console.log('✅ User is restaurant owner (accountType: restaurant)');
                    
                    // Get their restaurant - try both field names
                    let restaurantSnapshot = await firebase.firestore()
                        .collection('restaurants')
                        .where('ownerUserId', '==', uid)
                        .limit(1)
                        .get();

                    // If not found with ownerUserId, try ownerId as fallback
                    if (restaurantSnapshot.empty) {
                        restaurantSnapshot = await firebase.firestore()
                            .collection('restaurants')
                            .where('ownerId', '==', uid)
                            .limit(1)
                            .get();
                    }

                    if (!restaurantSnapshot.empty) {
                        const restaurant = restaurantSnapshot.docs[0];
                        return {
                            id: restaurant.id,
                            ...restaurant.data(),
                            ownerName: userData.name || userData.displayName || 'Restaurant Owner',
                            ownerEmail: userData.email || ''
                        };
                    } else {
                        console.log('⚠️ Restaurant owner found but no restaurant document');
                        return {
                            id: null,
                            name: 'Restaurant (No Details)',
                            ownerName: userData.name || userData.displayName || 'Restaurant Owner',
                            ownerEmail: userData.email || ''
                        };
                    }
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
     * Check if user can manage staff (add, edit, delete staff members)
     * @param {string} uid - User ID
     * @returns {Promise<boolean>} True if user can manage staff
     */
    static async canManageStaff(uid) {
        try {
            const profile = await this.getStaffProfile(uid);
            if (!profile) return false;
            
            // Check if user has custom staff management permission
            if (profile.customPermissions && profile.customPermissions.manageStaff) {
                return true;
            }
            
            // Default: Only owners can manage staff
            return profile.role === 'owner';
            
        } catch (error) {
            console.error('❌ Failed to check staff management permission:', error);
            return false;
        }
    }

    /**
     * Calculate staff member earnings for a date range
     * @param {string} staffUID - Staff member UID
     * @param {string} restaurantId - Restaurant ID
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Object>} Earnings data
     */
    static async calculateStaffEarnings(staffUID, restaurantId, startDate, endDate) {
        try {
            // Get staff member details for hourly rate
            const staffSnapshot = await firebase.firestore()
                .collection('staff_members')
                .where('uid', '==', staffUID)
                .where('restaurantId', '==', restaurantId)
                .limit(1)
                .get();

            if (staffSnapshot.empty) {
                throw new Error('Staff member not found');
            }

            const staffData = staffSnapshot.docs[0].data();
            const hourlyRate = staffData.hourlyRate || 0;

            // Get time records for the date range
            const timeRecordsSnapshot = await firebase.firestore()
                .collection('staff_time_records')
                .where('staffUID', '==', staffUID)
                .where('restaurantId', '==', restaurantId)
                .where('date', '>=', startDate)
                .where('date', '<=', endDate)
                .where('status', '==', 'clocked_out')
                .get();

            let totalHours = 0;
            let totalShifts = 0;
            const dailyHours = {};

            timeRecordsSnapshot.forEach(doc => {
                const record = doc.data();
                if (record.totalHours) {
                    totalHours += record.totalHours;
                    totalShifts++;
                    
                    if (!dailyHours[record.date]) {
                        dailyHours[record.date] = 0;
                    }
                    dailyHours[record.date] += record.totalHours;
                }
            });

            const totalEarnings = totalHours * hourlyRate;

            return {
                staffUID,
                staffName: staffData.name,
                hourlyRate,
                totalHours: Math.round(totalHours * 100) / 100,
                totalShifts,
                totalEarnings: Math.round(totalEarnings * 100) / 100,
                dailyHours,
                startDate,
                endDate
            };

        } catch (error) {
            console.error('❌ Failed to calculate staff earnings:', error);
            throw error;
        }
    }

    /**
     * Redirect user to appropriate login page
     */
    static redirectToStaffLogin() {
        const currentUrl = window.location.pathname;
        const params = new URLSearchParams(window.location.search);
        
        // Preserve current page for redirect after login
        params.set('redirect', currentUrl);
        
        window.location.href = `../login.html?${params.toString()}`;
    }

    /**
     * Redirect user to unauthorized page
     */
    static redirectToUnauthorized() {
        window.location.href = '../unauthorized.html';
    }

    /**
     * Clear role cache for a restaurant
     * @param {string} restaurantId - Restaurant ID
     */
    static clearRoleCache(restaurantId) {
        this.roleCache.delete(restaurantId);
    }

    /**
     * Clear all role cache
     */
    static clearAllRoleCache() {
        this.roleCache.clear();
    }

    /**
     * Generate a unique role ID from role name
     * @param {string} roleName - Role name
     * @returns {string} Generated role ID
     */
    static generateRoleId(roleName) {
        // Convert to lowercase, replace spaces with hyphens, remove special characters
        return roleName.toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .substring(0, 50) // Limit length
            .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
    }

    /**
     * Validate role data before creation/update
     * @param {Object} roleData - Role data to validate
     * @returns {Object} Validated and cleaned role data
     */
    static validateRoleData(roleData) {
        const cleaned = {
            name: roleData.name?.trim(),
            pages: Array.isArray(roleData.pages) ? roleData.pages : [],
            roleId: roleData.roleId || this.generateRoleId(roleData.name)
        };

        // Validate required fields
        if (!cleaned.name) {
            throw new Error('Role name is required');
        }

        if (cleaned.pages.length === 0) {
            throw new Error('At least one page must be selected');
        }

        // Validate pages
        const invalidPages = cleaned.pages.filter(page => !this.AVAILABLE_PAGES.includes(page));
        if (invalidPages.length > 0) {
            throw new Error(`Invalid pages: ${invalidPages.join(', ')}`);
        }

        return cleaned;
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
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StaffAuth;
}

// Make available globally
window.StaffAuth = StaffAuth;

console.log('✅ Dynamic Staff Authentication System loaded');
