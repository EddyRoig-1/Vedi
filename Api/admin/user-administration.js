// admin/user_administration.js - User Management and Administration

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

// ============================================================================
// USER ADMINISTRATION API (EXACTLY LIKE YOUR VEDIAPI PATTERN)
// ============================================================================

const UserAdministrationAPI = {

  /**
   * Verify admin access for current user
   * @returns {Promise<boolean>} True if user is admin
   */
  async verifyAdminAccess() {
    const startTime = Date.now();
    try {
      const currentUser = getFirebaseAuth().currentUser;
      if (!currentUser) return false;
      
      const adminDoc = await getFirebaseDb().collection('adminUsers').doc(currentUser.uid).get();
      const result = adminDoc.exists;

      const responseTime = Date.now() - startTime;
      await trackAPICall('verifyAdminAccess', responseTime, true, { isAdmin: result });

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await trackAPICall('verifyAdminAccess', responseTime, false, { error: error.message });
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
    const startTime = Date.now();
    try {
      const adminDoc = await getFirebaseDb().collection('adminUsers').doc(adminId).get();
      if (adminDoc.exists) {
        const result = { id: adminDoc.id, ...adminDoc.data() };
        
        const responseTime = Date.now() - startTime;
        await trackAPICall('getAdminData', responseTime, true, { adminId });

        return result;
      }
      throw new Error('Admin not found');
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await trackAPICall('getAdminData', responseTime, false, { error: error.message, adminId });
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
    const startTime = Date.now();
    try {
      await getFirebaseDb().collection('adminLogs').add({
        adminId,
        action,
        metadata,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        userAgent: navigator.userAgent,
        ip: 'client-side'
      });

      const responseTime = Date.now() - startTime;
      await trackAPICall('logAdminAccess', responseTime, true, { action });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await trackAPICall('logAdminAccess', responseTime, false, { error: error.message });
      console.error('❌ Log admin access error:', error);
    }
  },

  /**
   * Get detailed user management data
   * @returns {Promise<Object>} User management data
   */
  async getUserManagementData() {
    const startTime = Date.now();
    try {
      const [usersSnapshot, restaurantsSnapshot, venuesSnapshot] = await Promise.all([
        getFirebaseDb().collection('users').get(),
        getFirebaseDb().collection('restaurants').get(),
        getFirebaseDb().collection('venues').get()
      ]);
      
      const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const restaurants = restaurantsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const venues = venuesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const result = {
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

      const responseTime = Date.now() - startTime;
      await trackAPICall('getUserManagementData', responseTime, true, { 
        totalUsers: result.totalUsers 
      });

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await trackAPICall('getUserManagementData', responseTime, false, { error: error.message });
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
    const startTime = Date.now();
    try {
      await getFirebaseDb().collection('users').doc(userId).update({
        suspended,
        suspensionReason: reason,
        suspendedAt: suspended ? firebase.firestore.FieldValue.serverTimestamp() : null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Log admin action
      const currentUser = getFirebaseAuth().currentUser;
      if (currentUser) {
        await this.logAdminAccess(currentUser.uid, 'user_status_update', {
          targetUserId: userId,
          suspended,
          reason
        });
      }

      const responseTime = Date.now() - startTime;
      await trackAPICall('updateUserStatus', responseTime, true, { 
        userId, suspended, reason 
      });
      
      console.log(`✅ User ${userId} ${suspended ? 'suspended' : 'activated'}`);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await trackAPICall('updateUserStatus', responseTime, false, { error: error.message });
      console.error('❌ Update user status error:', error);
      throw error;
    }
  },

  /**
   * Get all users with filtering and pagination
   * @param {Object} options - Query options (limit, orderBy, accountType, status)
   * @returns {Promise<Array>} Array of users
   */
  async getAllUsers(options = {}) {
    const startTime = Date.now();
    try {
      let query = getFirebaseDb().collection('users');
      
      // Add account type filter
      if (options.accountType && options.accountType !== 'all') {
        query = query.where('accountType', '==', options.accountType);
      }
      
      // Add status filter
      if (options.status) {
        if (options.status === 'suspended') {
          query = query.where('suspended', '==', true);
        } else if (options.status === 'active') {
          query = query.where('suspended', '==', false);
        }
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
      
      const querySnapshot = await query.get();
      const users = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const responseTime = Date.now() - startTime;
      await trackAPICall('getAllUsers', responseTime, true, { 
        userCount: users.length,
        options: Object.keys(options)
      });
      
      console.log('✅ Retrieved users:', users.length);
      return users;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await trackAPICall('getAllUsers', responseTime, false, { error: error.message });
      console.error('❌ Get all users error:', error);
      throw error;
    }
  },

  /**
   * Get user details by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User details with associated data
   */
  async getUserDetails(userId) {
    const startTime = Date.now();
    try {
      const userDoc = await getFirebaseDb().collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        throw new Error('User not found');
      }
      
      const user = { id: userDoc.id, ...userDoc.data() };
      
      // Get associated data based on account type
      let associatedData = {};
      
      if (user.accountType === 'restaurant') {
        try {
          const restaurantsSnapshot = await getFirebaseDb().collection('restaurants')
            .where('ownerUserId', '==', userId)
            .get();
          associatedData.restaurants = restaurantsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
          console.warn('Could not fetch restaurants for user:', error);
          associatedData.restaurants = [];
        }
      }
      
      if (user.accountType === 'venue') {
        try {
          const venuesSnapshot = await getFirebaseDb().collection('venues')
            .where('managerUserId', '==', userId)
            .get();
          associatedData.venues = venuesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
          console.warn('Could not fetch venues for user:', error);
          associatedData.venues = [];
        }
      }
      
      // Get recent orders if customer
      try {
        const ordersSnapshot = await getFirebaseDb().collection('orders')
          .where('customerUID', '==', userId)
          .orderBy('createdAt', 'desc')
          .limit(10)
          .get();
        associatedData.recentOrders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (error) {
        associatedData.recentOrders = [];
      }

      const result = {
        ...user,
        ...associatedData
      };

      const responseTime = Date.now() - startTime;
      await trackAPICall('getUserDetails', responseTime, true, { 
        userId, accountType: user.accountType 
      });

      return result;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await trackAPICall('getUserDetails', responseTime, false, { error: error.message, userId });
      console.error('❌ Get user details error:', error);
      throw error;
    }
  },

  /**
   * Search users by name, email, or phone
   * @param {string} searchTerm - Search term
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Matching users
   */
  async searchUsers(searchTerm, options = {}) {
    const startTime = Date.now();
    try {
      // Get all users (Firebase doesn't support text search natively)
      const usersSnapshot = await getFirebaseDb().collection('users').get();
      const allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const searchLower = searchTerm.toLowerCase();
      
      const matchingUsers = allUsers.filter(user => {
        const nameMatch = user.name && user.name.toLowerCase().includes(searchLower);
        const emailMatch = user.email && user.email.toLowerCase().includes(searchLower);
        const phoneMatch = user.phone && user.phone.includes(searchTerm);
        
        return nameMatch || emailMatch || phoneMatch;
      });
      
      // Apply account type filter if specified
      let filteredUsers = matchingUsers;
      if (options.accountType && options.accountType !== 'all') {
        filteredUsers = matchingUsers.filter(user => user.accountType === options.accountType);
      }

      const responseTime = Date.now() - startTime;
      await trackAPICall('searchUsers', responseTime, true, { 
        searchTerm, 
        resultsCount: filteredUsers.length 
      });
      
      console.log('🔍 User search results:', filteredUsers.length, 'users for term:', searchTerm);
      return filteredUsers;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await trackAPICall('searchUsers', responseTime, false, { error: error.message });
      console.error('❌ Search users error:', error);
      throw error;
    }
  },

  /**
   * Delete user account (permanent)
   * @param {string} userId - User ID
   * @param {string} reason - Reason for deletion
   */
  async deleteUser(userId, reason = '') {
    const startTime = Date.now();
    try {
      // First, get user data for logging
      const userDoc = await getFirebaseDb().collection('users').doc(userId).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      
      // Delete from Firestore
      await getFirebaseDb().collection('users').doc(userId).delete();
      
      // Log admin action
      const currentUser = getFirebaseAuth().currentUser;
      if (currentUser) {
        await this.logAdminAccess(currentUser.uid, 'user_deleted', {
          deletedUserId: userId,
          deletedUserEmail: userData.email,
          deletedUserName: userData.name,
          reason
        });
      }

      const responseTime = Date.now() - startTime;
      await trackAPICall('deleteUser', responseTime, true, { userId, reason });
      
      console.log('✅ User deleted:', userId);
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await trackAPICall('deleteUser', responseTime, false, { error: error.message });
      console.error('❌ Delete user error:', error);
      throw error;
    }
  },

  /**
   * Update user data (admin override)
   * @param {string} userId - User ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated user
   */
  async updateUserData(userId, updateData) {
    const startTime = Date.now();
    try {
      const sanitizedData = {
        ...updateData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      // Remove undefined values
      Object.keys(sanitizedData).forEach(key => {
        if (sanitizedData[key] === undefined) {
          delete sanitizedData[key];
        }
      });
      
      await getFirebaseDb().collection('users').doc(userId).update(sanitizedData);
      
      // Log admin action
      const currentUser = getFirebaseAuth().currentUser;
      if (currentUser) {
        await this.logAdminAccess(currentUser.uid, 'user_data_updated', {
          targetUserId: userId,
          updatedFields: Object.keys(updateData)
        });
      }
      
      const updatedDoc = await getFirebaseDb().collection('users').doc(userId).get();
      const result = { id: updatedDoc.id, ...updatedDoc.data() };

      const responseTime = Date.now() - startTime;
      await trackAPICall('updateUserData', responseTime, true, { 
        userId, 
        fieldsUpdated: Object.keys(updateData) 
      });
      
      console.log('✅ User data updated:', userId);
      return result;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await trackAPICall('updateUserData', responseTime, false, { error: error.message });
      console.error('❌ Update user data error:', error);
      throw error;
    }
  },

  // ============================================================================
  // HELPER METHODS (EXACTLY LIKE YOUR PATTERNS)
  // ============================================================================

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

  getRestaurantOwners(users, restaurants) {
    const owners = users.filter(user => user.accountType === 'restaurant');
    return owners.map(owner => {
      const ownedRestaurants = restaurants.filter(r => r.ownerUserId === owner.id);
      return {
        ...owner,
        restaurantCount: ownedRestaurants.length,
        restaurants: ownedRestaurants
      };
    });
  },

  getVenueManagers(users, venues) {
    const managers = users.filter(user => user.accountType === 'venue');
    return managers.map(manager => {
      const managedVenues = venues.filter(v => v.managerUserId === manager.id);
      return {
        ...manager,
        venueCount: managedVenues.length,
        venues: managedVenues
      };
    });
  },

  async getUserActivitySummary(users) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const activeUsers = users.filter(user => {
      const lastActive = this.timestampToDate(user.lastLoginAt || user.createdAt);
      return lastActive >= thirtyDaysAgo;
    });
    
    return {
      totalUsers: users.length,
      activeInLast30Days: activeUsers.length,
      activityRate: users.length > 0 ? ((activeUsers.length / users.length) * 100).toFixed(1) : '0.0'
    };
  },

  calculateOverallRetention(users) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const oldUsers = users.filter(user => {
      const createdAt = this.timestampToDate(user.createdAt);
      return createdAt <= thirtyDaysAgo;
    });
    
    const retainedUsers = oldUsers.filter(user => {
      const lastActive = this.timestampToDate(user.lastLoginAt || user.createdAt);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return lastActive >= sevenDaysAgo;
    });
    
    return oldUsers.length > 0 ? ((retainedUsers.length / oldUsers.length) * 100).toFixed(1) : '0.0';
  },

  timestampToDate(timestamp) {
    if (timestamp && timestamp.toDate) {
      return timestamp.toDate();
    }
    if (timestamp && timestamp.seconds) {
      return new Date(timestamp.seconds * 1000);
    }
    return new Date(timestamp);
  }
};

// Make available globally (EXACTLY LIKE YOUR PATTERN)
window.UserAdministrationAPI = UserAdministrationAPI;

// ============================================================================
// CRITICAL: DASHBOARD COMPATIBILITY - GLOBAL ADMIN FUNCTIONS
// ============================================================================

/**
 * Check if user is admin (Global function - REQUIRED by dashboard)
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} True if user is admin
 */
async function checkIfAdmin(userId) {
  const startTime = Date.now();
  try {
    const db = getFirebaseDb();
    const adminDoc = await db.collection('adminUsers').doc(userId).get();
    const result = adminDoc.exists;
    
    const responseTime = Date.now() - startTime;
    await trackAPICall('checkIfAdmin', responseTime, true, { userId, isAdmin: result });
    
    console.log('🔐 Admin check for user:', userId, '- Result:', result);
    return result;
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    await trackAPICall('checkIfAdmin', responseTime, false, { error: error.message });
    console.error('❌ Check admin status error:', error);
    return false; // Fail safely - deny admin access on error
  }
}

/**
 * Get admin data (Global function - REQUIRED by dashboard)
 * @param {string} userId - Admin user ID
 * @returns {Promise<Object>} Admin data
 */
async function getAdminData(userId) {
  const startTime = Date.now();
  try {
    const db = getFirebaseDb();
    const adminDoc = await db.collection('adminUsers').doc(userId).get();
    
    if (adminDoc.exists) {
      const result = { id: adminDoc.id, ...adminDoc.data() };
      
      const responseTime = Date.now() - startTime;
      await trackAPICall('getAdminData', responseTime, true, { userId });
      
      console.log('🔐 Admin data retrieved for:', result.name || userId);
      return result;
    } else {
      // Return fallback for non-admin users
      const fallback = { id: userId, name: 'Admin', role: 'user' };
      
      const responseTime = Date.now() - startTime;
      await trackAPICall('getAdminData', responseTime, true, { userId, isAdmin: false });
      
      return fallback;
    }
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    await trackAPICall('getAdminData', responseTime, false, { error: error.message });
    console.error('❌ Get admin data error:', error);
    
    // Return safe fallback
    return { id: userId, name: 'Admin', error: true };
  }
}

// CRITICAL: Export globally for dashboard compatibility
window.checkIfAdmin = checkIfAdmin;
window.getAdminData = getAdminData;

// ============================================================================
// DASHBOARD COMPATIBILITY - MISSING WRAPPER FUNCTIONS
// ============================================================================

/**
 * Function name alias for HTML compatibility
 * HTML calls checkAdminAccess() but we have checkIfAdmin()
 */
window.checkAdminAccess = checkIfAdmin;

/**
 * Global wrapper functions for HTML dashboard compatibility
 * These functions are called directly by the HTML buttons
 */
function viewUser(userId) {
  UserAdministrationAPI.getUserDetails(userId).then(user => {
    const details = `User Details:
    
Name: ${user.name || 'Unknown'}
Email: ${user.email || 'N/A'}
Account Type: ${user.accountType || 'user'}
Created: ${user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown'}
Status: ${user.suspended ? 'Suspended' : 'Active'}
Verified: ${user.verified ? 'Yes' : 'No'}`;
    
    alert(details);
  }).catch(error => {
    alert('Error loading user details: ' + error.message);
  });
}

function editUser(userId) {
  const newName = prompt('Enter new name (leave blank to skip):');
  const newEmail = prompt('Enter new email (leave blank to skip):');
  
  if (newName || newEmail) {
    const updates = {};
    if (newName && newName.trim()) updates.name = newName.trim();
    if (newEmail && newEmail.trim()) updates.email = newEmail.trim();
    
    UserAdministrationAPI.updateUserData(userId, updates).then(() => {
      alert('User updated successfully!');
      location.reload(); // Refresh the page to show changes
    }).catch(error => {
      alert('Error updating user: ' + error.message);
    });
  } else {
    alert('No changes made.');
  }
}

function deleteUser(userId) {
  if (confirm('⚠️ WARNING: This will permanently delete the user and all their data.\n\nThis action cannot be undone!\n\nAre you sure you want to continue?')) {
    const reason = prompt('Enter reason for deletion:') || 'Admin deletion';
    
    UserAdministrationAPI.deleteUser(userId, reason).then(() => {
      alert('User deleted successfully!');
      location.reload(); // Refresh the page to show changes
    }).catch(error => {
      alert('Error deleting user: ' + error.message);
    });
  }
}

// Export wrapper functions globally for HTML compatibility
window.viewUser = viewUser;
window.editUser = editUser;
window.deleteUser = deleteUser;

console.log('🔗 Dashboard compatibility functions added');
console.log('✅ viewUser, editUser, deleteUser now available globally');
console.log('✅ checkAdminAccess alias created for HTML compatibility');

console.log('👥 UserAdministrationAPI loaded successfully');
console.log('🔧 Available user management methods:', Object.keys(UserAdministrationAPI).length, 'total methods');
console.log('🔐 CRITICAL: Global admin functions exported for dashboard compatibility');
console.log('✅ checkIfAdmin and getAdminData now available globally');
console.log('🚨 Dashboard will fail without these functions!');
console.log('🚀 Ready for admin dashboard integration!');