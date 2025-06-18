// api/auth/user-management.js - User Profile and Account Management
/**
 * User Management Module
 * 
 * Handles comprehensive user profile management, account settings, preferences,
 * and administrative user operations. Provides functionality for both customer
 * profiles and business user accounts with proper security and validation.
 */

// ============================================================================
// CUSTOMER PROFILE MANAGEMENT
// ============================================================================

/**
 * Save or update customer profile in Firestore
 * @param {string} uid - Firebase user UID
 * @param {Object} profileData - Customer profile data
 * @returns {Promise<Object>} Saved customer profile data
 */
async function saveCustomerProfile(uid, profileData) {
  const endTracking = VediAPI.startPerformanceMeasurement('saveCustomerProfile');
  
  try {
    const db = getFirebaseDb();
    
    // Sanitize and validate profile data
    const cleanProfileData = VediAPI.removeUndefinedValues({
      phoneNumber: profileData.phoneNumber ? VediAPI.sanitizeInput(profileData.phoneNumber) : undefined,
      name: profileData.name ? VediAPI.sanitizeInput(profileData.name) : undefined,
      email: profileData.email ? VediAPI.sanitizeInput(profileData.email) : undefined,
      address: profileData.address ? VediAPI.sanitizeInput(profileData.address) : undefined,
      preferences: profileData.preferences || undefined,
      allergies: profileData.allergies ? VediAPI.sanitizeInput(profileData.allergies) : undefined,
      dietaryRestrictions: profileData.dietaryRestrictions || undefined,
      defaultPaymentMethod: profileData.defaultPaymentMethod || undefined
    });
    
    const profile = {
      ...cleanProfileData,
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Use merge to avoid overwriting existing data
    await db.collection('customerProfiles').doc(uid).set({
      ...profile,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    // Track profile update
    await VediAPI.trackUserActivity('customer_profile_updated', {
      userId: uid,
      fieldsUpdated: Object.keys(cleanProfileData)
    });
    
    await endTracking(true);
    
    console.log('✅ Customer profile saved for UID:', uid);
    return { id: uid, ...profile };
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'saveCustomerProfile', { uid });
    
    console.error('❌ Save customer profile error:', error);
    throw error;
  }
}

/**
 * Get customer profile by UID
 * @param {string} uid - Firebase user UID
 * @returns {Promise<Object|null>} Customer profile or null if not found
 */
async function getCustomerProfile(uid) {
  const endTracking = VediAPI.startPerformanceMeasurement('getCustomerProfile');
  
  try {
    const db = getFirebaseDb();
    
    const doc = await db.collection('customerProfiles').doc(uid).get();
    
    if (doc.exists) {
      await endTracking(true);
      return { id: doc.id, ...doc.data() };
    }
    
    await endTracking(true);
    return null;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getCustomerProfile', { uid });
    
    console.error('❌ Get customer profile error:', error);
    throw error;
  }
}

/**
 * Update customer preferences
 * @param {string} uid - Customer UID
 * @param {Object} preferences - New preferences
 * @returns {Promise<Object>} Updated customer profile
 */
async function updateCustomerPreferences(uid, preferences) {
  const endTracking = VediAPI.startPerformanceMeasurement('updateCustomerPreferences');
  
  try {
    const db = getFirebaseDb();
    
    // Validate preferences object
    const validPreferences = VediAPI.removeUndefinedValues({
      notifications: typeof preferences.notifications === 'boolean' ? preferences.notifications : undefined,
      smsUpdates: typeof preferences.smsUpdates === 'boolean' ? preferences.smsUpdates : undefined,
      emailUpdates: typeof preferences.emailUpdates === 'boolean' ? preferences.emailUpdates : undefined,
      marketing: typeof preferences.marketing === 'boolean' ? preferences.marketing : undefined,
      orderReminders: typeof preferences.orderReminders === 'boolean' ? preferences.orderReminders : undefined,
      language: preferences.language ? VediAPI.sanitizeInput(preferences.language) : undefined,
      currency: preferences.currency ? VediAPI.sanitizeInput(preferences.currency) : undefined
    });
    
    const updateData = {
      preferences: validPreferences,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('customerProfiles').doc(uid).update(updateData);
    
    // Get updated profile
    const updatedProfile = await getCustomerProfile(uid);
    
    await VediAPI.trackUserActivity('customer_preferences_updated', {
      userId: uid,
      preferencesUpdated: Object.keys(validPreferences)
    });
    
    await endTracking(true);
    
    console.log('✅ Customer preferences updated:', uid);
    return updatedProfile;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'updateCustomerPreferences', { uid });
    
    console.error('❌ Update customer preferences error:', error);
    throw error;
  }
}

/**
 * Get customer order history with pagination
 * @param {string} customerUID - Customer Firebase UID
 * @param {Object} options - Query options (limit, startAfter, etc.)
 * @returns {Promise<Array>} Array of customer orders
 */
async function getCustomerOrderHistory(customerUID, options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('getCustomerOrderHistory');
  
  try {
    const db = getFirebaseDb();
    
    let query = db.collection('orders')
      .where('customerUID', '==', customerUID)
      .orderBy('createdAt', 'desc');
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    if (options.startAfter) {
      query = query.startAfter(options.startAfter);
    }
    
    const querySnapshot = await query.get();
    const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    await endTracking(true);
    
    console.log('✅ Retrieved customer order history:', orders.length, 'orders');
    return orders;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getCustomerOrderHistory', { customerUID });
    
    console.error('❌ Get customer order history error:', error);
    throw error;
  }
}

// ============================================================================
// BUSINESS USER PROFILE MANAGEMENT
// ============================================================================

/**
 * Create business user profile (restaurant owner, venue manager)
 * @param {string} uid - Firebase user UID
 * @param {Object} businessData - Business profile data
 * @returns {Promise<Object>} Created business profile
 */
async function createBusinessProfile(uid, businessData) {
  const endTracking = VediAPI.startPerformanceMeasurement('createBusinessProfile');
  
  try {
    const db = getFirebaseDb();
    
    // Validate required business data
    if (!businessData.accountType || !['restaurant', 'venue'].includes(businessData.accountType)) {
      throw new Error('Valid account type (restaurant or venue) is required');
    }
    
    if (!businessData.businessName) {
      throw new Error('Business name is required');
    }
    
    const businessProfile = VediAPI.removeUndefinedValues({
      accountType: businessData.accountType,
      businessName: VediAPI.sanitizeInput(businessData.businessName),
      contactName: businessData.contactName ? VediAPI.sanitizeInput(businessData.contactName) : undefined,
      email: businessData.email ? VediAPI.sanitizeInput(businessData.email) : undefined,
      phone: businessData.phone ? VediAPI.sanitizeInput(businessData.phone) : undefined,
      address: businessData.address ? VediAPI.sanitizeInput(businessData.address) : undefined,
      city: businessData.city ? VediAPI.sanitizeInput(businessData.city) : undefined,
      state: businessData.state ? VediAPI.sanitizeInput(businessData.state) : undefined,
      zipCode: businessData.zipCode ? VediAPI.sanitizeInput(businessData.zipCode) : undefined,
      country: businessData.country ? VediAPI.sanitizeInput(businessData.country) : 'US',
      businessType: businessData.businessType ? VediAPI.sanitizeInput(businessData.businessType) : undefined,
      description: businessData.description ? VediAPI.sanitizeInput(businessData.description) : undefined,
      website: businessData.website ? VediAPI.sanitizeInput(businessData.website) : undefined,
      taxId: businessData.taxId ? VediAPI.sanitizeInput(businessData.taxId) : undefined,
      
      // Status and verification
      verified: false,
      status: 'pending',
      
      // Timestamps
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    await db.collection('businessProfiles').doc(uid).set(businessProfile);
    
    // Also create/update user record
    await db.collection('users').doc(uid).set({
      accountType: businessData.accountType,
      businessName: businessProfile.businessName,
      verified: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    await VediAPI.trackUserActivity('business_profile_created', {
      userId: uid,
      accountType: businessData.accountType,
      businessName: businessProfile.businessName
    });
    
    await endTracking(true);
    
    console.log('✅ Business profile created:', uid);
    return { id: uid, ...businessProfile };
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'createBusinessProfile', { uid });
    
    console.error('❌ Create business profile error:', error);
    throw error;
  }
}

/**
 * Update business profile information
 * @param {string} uid - Business user UID
 * @param {Object} updates - Profile updates
 * @returns {Promise<Object>} Updated business profile
 */
async function updateBusinessProfile(uid, updates) {
  const endTracking = VediAPI.startPerformanceMeasurement('updateBusinessProfile');
  
  try {
    const db = getFirebaseDb();
    
    // Sanitize updates
    const sanitizedUpdates = VediAPI.removeUndefinedValues({
      businessName: updates.businessName ? VediAPI.sanitizeInput(updates.businessName) : undefined,
      contactName: updates.contactName ? VediAPI.sanitizeInput(updates.contactName) : undefined,
      email: updates.email ? VediAPI.sanitizeInput(updates.email) : undefined,
      phone: updates.phone ? VediAPI.sanitizeInput(updates.phone) : undefined,
      address: updates.address ? VediAPI.sanitizeInput(updates.address) : undefined,
      city: updates.city ? VediAPI.sanitizeInput(updates.city) : undefined,
      state: updates.state ? VediAPI.sanitizeInput(updates.state) : undefined,
      zipCode: updates.zipCode ? VediAPI.sanitizeInput(updates.zipCode) : undefined,
      description: updates.description ? VediAPI.sanitizeInput(updates.description) : undefined,
      website: updates.website ? VediAPI.sanitizeInput(updates.website) : undefined,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    await db.collection('businessProfiles').doc(uid).update(sanitizedUpdates);
    
    // Get updated profile
    const updatedDoc = await db.collection('businessProfiles').doc(uid).get();
    const updatedProfile = { id: updatedDoc.id, ...updatedDoc.data() };
    
    await VediAPI.trackUserActivity('business_profile_updated', {
      userId: uid,
      fieldsUpdated: Object.keys(sanitizedUpdates)
    });
    
    await endTracking(true);
    
    console.log('✅ Business profile updated:', uid);
    return updatedProfile;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'updateBusinessProfile', { uid });
    
    console.error('❌ Update business profile error:', error);
    throw error;
  }
}

/**
 * Get business profile by UID
 * @param {string} uid - Business user UID
 * @returns {Promise<Object|null>} Business profile or null if not found
 */
async function getBusinessProfile(uid) {
  const endTracking = VediAPI.startPerformanceMeasurement('getBusinessProfile');
  
  try {
    const db = getFirebaseDb();
    
    const doc = await db.collection('businessProfiles').doc(uid).get();
    
    if (doc.exists) {
      await endTracking(true);
      return { id: doc.id, ...doc.data() };
    }
    
    await endTracking(true);
    return null;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getBusinessProfile', { uid });
    
    console.error('❌ Get business profile error:', error);
    throw error;
  }
}

// ============================================================================
// USER ACCOUNT MANAGEMENT
// ============================================================================

/**
 * Get comprehensive user profile (combines user data and specific profile type)
 * @param {string} uid - User UID
 * @returns {Promise<Object|null>} Complete user profile with type-specific data
 */
async function getCompleteUserProfile(uid) {
  const endTracking = VediAPI.startPerformanceMeasurement('getCompleteUserProfile');
  
  try {
    const db = getFirebaseDb();
    
    // Get base user data
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (!userDoc.exists) {
      await endTracking(true);
      return null;
    }
    
    const userData = { id: userDoc.id, ...userDoc.data() };
    let additionalProfile = null;
    
    // Get type-specific profile based on account type
    if (userData.accountType === 'customer') {
      additionalProfile = await getCustomerProfile(uid);
    } else if (['restaurant', 'venue'].includes(userData.accountType)) {
      additionalProfile = await getBusinessProfile(uid);
    }
    
    // Combine profiles
    const completeProfile = {
      ...userData,
      ...(additionalProfile || {}),
      profileType: userData.accountType,
      hasAdditionalProfile: !!additionalProfile
    };
    
    await endTracking(true);
    
    console.log('✅ Retrieved complete user profile:', uid);
    return completeProfile;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getCompleteUserProfile', { uid });
    
    console.error('❌ Get complete user profile error:', error);
    throw error;
  }
}

/**
 * Update user account status (for admin use)
 * @param {string} uid - User UID
 * @param {string} status - New status ('active', 'suspended', 'banned')
 * @param {string} reason - Reason for status change
 * @returns {Promise<void>} Resolves when status is updated
 */
async function updateUserStatus(uid, status, reason = '') {
  const endTracking = VediAPI.startPerformanceMeasurement('updateUserStatus');
  
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    // Validate status
    const validStatuses = ['active', 'suspended', 'banned'];
    if (!validStatuses.includes(status)) {
      throw new Error('Invalid status. Must be: active, suspended, or banned');
    }
    
    const updateData = {
      status: status,
      statusReason: VediAPI.sanitizeInput(reason),
      statusUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      statusUpdatedBy: auth.currentUser?.uid || 'system',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Update in both users and appropriate profile collection
    await db.collection('users').doc(uid).update(updateData);
    
    // Try to update business profile if it exists
    try {
      await db.collection('businessProfiles').doc(uid).update(updateData);
    } catch (error) {
      // Business profile might not exist, that's okay
    }
    
    // Try to update customer profile if it exists
    try {
      await db.collection('customerProfiles').doc(uid).update(updateData);
    } catch (error) {
      // Customer profile might not exist, that's okay
    }
    
    await VediAPI.trackUserActivity('user_status_updated', {
      targetUserId: uid,
      newStatus: status,
      reason: reason,
      updatedBy: auth.currentUser?.uid || 'system'
    });
    
    await endTracking(true);
    
    console.log('✅ User status updated:', uid, 'to', status);
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'updateUserStatus', { uid, status });
    
    console.error('❌ Update user status error:', error);
    throw error;
  }
}

/**
 * Delete user account and all associated data
 * @param {string} uid - User UID to delete
 * @param {boolean} hardDelete - Whether to permanently delete or just mark as deleted
 * @returns {Promise<void>} Resolves when account is deleted
 */
async function deleteUserAccount(uid, hardDelete = false) {
  const endTracking = VediAPI.startPerformanceMeasurement('deleteUserAccount');
  
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    
    // Security check - users can only delete their own account unless admin
    if (currentUser && currentUser.uid !== uid) {
      // TODO: Add admin role check here
      throw new Error('You can only delete your own account.');
    }
    
    if (hardDelete) {
      // Permanently delete all user data
      const batch = db.batch();
      
      // Delete from all possible collections
      batch.delete(db.collection('users').doc(uid));
      batch.delete(db.collection('customerProfiles').doc(uid));
      batch.delete(db.collection('businessProfiles').doc(uid));
      
      await batch.commit();
      
      // Delete Firebase auth account if it's the current user
      if (currentUser && currentUser.uid === uid) {
        await currentUser.delete();
      }
      
    } else {
      // Soft delete - mark as deleted but keep data for audit
      const deleteData = {
        deleted: true,
        deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
        deletedBy: currentUser?.uid || 'system',
        status: 'deleted'
      };
      
      // Update all profile collections
      await Promise.all([
        db.collection('users').doc(uid).update(deleteData).catch(() => {}),
        db.collection('customerProfiles').doc(uid).update(deleteData).catch(() => {}),
        db.collection('businessProfiles').doc(uid).update(deleteData).catch(() => {})
      ]);
    }
    
    await VediAPI.trackUserActivity('account_deleted', {
      deletedUserId: uid,
      hardDelete: hardDelete,
      deletedBy: currentUser?.uid || 'system'
    });
    
    await endTracking(true);
    
    console.log('✅ User account deleted:', uid, hardDelete ? '(permanent)' : '(soft delete)');
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'deleteUserAccount', { uid, hardDelete });
    
    console.error('❌ Delete user account error:', error);
    throw error;
  }
}

// ============================================================================
// USER SEARCH AND LISTING (ADMIN FUNCTIONS)
// ============================================================================

/**
 * Search users by various criteria (admin function)
 * @param {Object} searchCriteria - Search parameters
 * @param {Object} options - Query options (limit, orderBy, etc.)
 * @returns {Promise<Array>} Array of matching users
 */
async function searchUsers(searchCriteria = {}, options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('searchUsers');
  
  try {
    const db = getFirebaseDb();
    
    let query = db.collection('users');
    
    // Apply search filters
    if (searchCriteria.accountType) {
      query = query.where('accountType', '==', searchCriteria.accountType);
    }
    
    if (searchCriteria.status) {
      query = query.where('status', '==', searchCriteria.status);
    }
    
    if (searchCriteria.verified !== undefined) {
      query = query.where('verified', '==', searchCriteria.verified);
    }
    
    // Apply ordering
    if (options.orderBy) {
      query = query.orderBy(options.orderBy, options.orderDirection || 'desc');
    } else {
      query = query.orderBy('createdAt', 'desc');
    }
    
    // Apply limit
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    const querySnapshot = await query.get();
    const users = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    await endTracking(true);
    
    console.log('✅ User search completed:', users.length, 'results');
    return users;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'searchUsers', { searchCriteria, options });
    
    console.error('❌ Search users error:', error);
    throw error;
  }
}

/**
 * Get user statistics for admin dashboard
 * @param {string} timePeriod - Time period for statistics
 * @returns {Promise<Object>} User statistics
 */
async function getUserStatistics(timePeriod = 'month') {
  const endTracking = VediAPI.startPerformanceMeasurement('getUserStatistics');
  
  try {
    const db = getFirebaseDb();
    const startDate = VediAPI.getTimePeriodStart(timePeriod);
    
    // Get all users
    let usersQuery = db.collection('users');
    if (startDate) {
      usersQuery = usersQuery.where('createdAt', '>=', startDate);
    }
    
    const usersSnapshot = await usersQuery.get();
    const users = usersSnapshot.docs.map(doc => doc.data());
    
    // Calculate statistics
    const stats = {
      total: users.length,
      byAccountType: VediAPI.groupBy(users, 'accountType'),
      byStatus: VediAPI.groupBy(users, 'status'),
      verified: users.filter(user => user.verified).length,
      unverified: users.filter(user => !user.verified).length,
      timePeriod: timePeriod,
      generatedAt: new Date().toISOString()
    };
    
    // Calculate percentages
    if (stats.total > 0) {
      stats.verificationRate = ((stats.verified / stats.total) * 100).toFixed(1) + '%';
    } else {
      stats.verificationRate = '0%';
    }
    
    await endTracking(true);
    
    console.log('✅ User statistics generated:', stats);
    return stats;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getUserStatistics', { timePeriod });
    
    console.error('❌ Get user statistics error:', error);
    throw error;
  }
}

// ============================================================================
// GLOBAL EXPORTS AND VEDIAPI INTEGRATION
// ============================================================================

// Ensure VediAPI namespace exists
if (!window.VediAPI) {
  window.VediAPI = {};
}

// Attach user management functions to VediAPI
Object.assign(window.VediAPI, {
  // Customer profile management
  saveCustomerProfile,
  getCustomerProfile,
  updateCustomerPreferences,
  getCustomerOrderHistory,
  
  // Business profile management
  createBusinessProfile,
  updateBusinessProfile,
  getBusinessProfile,
  
  // General user account management
  getCompleteUserProfile,
  updateUserStatus,
  deleteUserAccount,
  
  // Admin functions
  searchUsers,
  getUserStatistics
});

console.log('👤 User Management Module loaded');
console.log('🛍️ Customer: saveCustomerProfile, getCustomerProfile, updateCustomerPreferences');
console.log('🏢 Business: createBusinessProfile, updateBusinessProfile, getBusinessProfile'); 
console.log('👥 General: getCompleteUserProfile, updateUserStatus, deleteUserAccount');
console.log('🔍 Admin: searchUsers, getUserStatistics');
console.log('📊 All functions include comprehensive tracking and validation');