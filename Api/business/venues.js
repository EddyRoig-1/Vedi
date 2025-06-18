// api/business/venues.js - Venue Management
/**
 * Venue Management Module
 * 
 * Handles venue operations including creation, updates, venue-restaurant
 * relationships, and venue-specific analytics. Integrates with restaurant
 * management and provides comprehensive venue administration capabilities.
 */

// ============================================================================
// VENUE CRUD OPERATIONS
// ============================================================================

/**
 * Create new venue with comprehensive validation
 * @param {Object} venueData - Complete venue information
 * @returns {Promise<Object>} Created venue with ID
 */
async function createVenue(venueData) {
  const endTracking = VediAPI.startPerformanceMeasurement('createVenue');
  
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    // Validate required fields
    const requiredFields = ['name', 'address', 'city', 'state', 'country'];
    for (const field of requiredFields) {
      if (!venueData[field]) {
        throw new Error(`${field} is required`);
      }
    }
    
    // Validate email format if provided
    if (venueData.email && !VediAPI.validateEmail(venueData.email)) {
      throw new Error('Please provide a valid email address');
    }
    
    // Validate phone format if provided
    if (venueData.phone && !VediAPI.validatePhoneNumber(venueData.phone)) {
      throw new Error('Please provide a valid phone number');
    }
    
    // Clean and structure venue data
    const venue = VediAPI.removeUndefinedValues({
      // Basic Information
      name: VediAPI.sanitizeInput(venueData.name),
      description: venueData.description ? VediAPI.sanitizeInput(venueData.description) : '',
      type: venueData.type ? VediAPI.sanitizeInput(venueData.type) : 'mixed', // mall, plaza, building, etc.
      
      // Contact Information
      email: venueData.email ? VediAPI.sanitizeInput(venueData.email.toLowerCase()) : '',
      phone: venueData.phone ? VediAPI.sanitizeInput(venueData.phone) : '',
      website: venueData.website ? VediAPI.sanitizeInput(venueData.website) : '',
      
      // Address Information
      address: VediAPI.sanitizeInput(venueData.address),
      city: VediAPI.sanitizeInput(venueData.city),
      state: VediAPI.sanitizeInput(venueData.state),
      zipCode: venueData.zipCode ? VediAPI.sanitizeInput(venueData.zipCode) : '',
      country: VediAPI.sanitizeInput(venueData.country),
      
      // Business Information
      licenseNumber: venueData.licenseNumber ? VediAPI.sanitizeInput(venueData.licenseNumber) : '',
      taxId: venueData.taxId ? VediAPI.sanitizeInput(venueData.taxId) : '',
      
      // Venue-specific settings
      defaultFeePercentage: venueData.defaultFeePercentage || 1.0, // Default 1% venue fee
      allowCustomFees: venueData.allowCustomFees !== false, // Default to true
      requireApproval: venueData.requireApproval || false, // Default to false
      maxRestaurants: venueData.maxRestaurants || null, // Unlimited by default
      
      // Operating Information
      operatingHours: venueData.operatingHours || null,
      amenities: venueData.amenities || [],
      parkingAvailable: venueData.parkingAvailable || false,
      wifiAvailable: venueData.wifiAvailable || false,
      
      // Manager Information
      managerUserId: auth.currentUser?.uid || venueData.managerUserId,
      managerName: venueData.managerName ? VediAPI.sanitizeInput(venueData.managerName) : '',
      managerEmail: venueData.managerEmail ? VediAPI.sanitizeInput(venueData.managerEmail) : '',
      
      // Stripe Connect Information (will be set when connecting)
      stripeAccountId: null,
      stripeAccountStatus: 'not_connected',
      stripeOnboardingCompleted: false,
      
      // Status and Verification
      status: 'active',
      verified: false,
      verificationStatus: 'pending',
      
      // Statistics (will be updated as restaurants join)
      restaurantCount: 0,
      totalOrders: 0,
      totalRevenue: 0,
      
      // Timestamps
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Add to database
    const docRef = await db.collection('venues').add(venue);
    const doc = await docRef.get();
    const createdVenue = { id: doc.id, ...doc.data() };
    
    // Track venue creation
    await VediAPI.trackUserActivity('venue_created', {
      venueId: docRef.id,
      venueName: venue.name,
      venueType: venue.type,
      managerUserId: venue.managerUserId,
      defaultFeePercentage: venue.defaultFeePercentage
    });
    
    await endTracking(true);
    
    console.log('✅ Venue created successfully:', docRef.id);
    return createdVenue;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'createVenue', { venueName: venueData.name });
    
    console.error('❌ Create venue error:', error);
    throw error;
  }
}

/**
 * Update existing venue information
 * @param {string} venueId - Venue ID to update
 * @param {Object} venueData - Updated venue data
 * @returns {Promise<Object>} Updated venue
 */
async function updateVenue(venueId, venueData) {
  const endTracking = VediAPI.startPerformanceMeasurement('updateVenue');
  
  try {
    const db = getFirebaseDb();
    
    // Validate venue exists
    const existingDoc = await db.collection('venues').doc(venueId).get();
    if (!existingDoc.exists) {
      throw new Error('Venue not found');
    }
    
    // Sanitize and validate updates
    const updates = VediAPI.removeUndefinedValues({
      // Basic Information
      name: venueData.name ? VediAPI.sanitizeInput(venueData.name) : undefined,
      description: venueData.description !== undefined ? VediAPI.sanitizeInput(venueData.description) : undefined,
      type: venueData.type ? VediAPI.sanitizeInput(venueData.type) : undefined,
      
      // Contact Information
      email: venueData.email !== undefined ? (venueData.email ? VediAPI.sanitizeInput(venueData.email.toLowerCase()) : '') : undefined,
      phone: venueData.phone !== undefined ? (venueData.phone ? VediAPI.sanitizeInput(venueData.phone) : '') : undefined,
      website: venueData.website !== undefined ? VediAPI.sanitizeInput(venueData.website) : undefined,
      
      // Address Information
      address: venueData.address ? VediAPI.sanitizeInput(venueData.address) : undefined,
      city: venueData.city ? VediAPI.sanitizeInput(venueData.city) : undefined,
      state: venueData.state ? VediAPI.sanitizeInput(venueData.state) : undefined,
      zipCode: venueData.zipCode !== undefined ? VediAPI.sanitizeInput(venueData.zipCode) : undefined,
      country: venueData.country ? VediAPI.sanitizeInput(venueData.country) : undefined,
      
      // Business Information
      licenseNumber: venueData.licenseNumber !== undefined ? VediAPI.sanitizeInput(venueData.licenseNumber) : undefined,
      taxId: venueData.taxId !== undefined ? VediAPI.sanitizeInput(venueData.taxId) : undefined,
      
      // Venue-specific settings
      defaultFeePercentage: venueData.defaultFeePercentage !== undefined ? venueData.defaultFeePercentage : undefined,
      allowCustomFees: venueData.allowCustomFees !== undefined ? venueData.allowCustomFees : undefined,
      requireApproval: venueData.requireApproval !== undefined ? venueData.requireApproval : undefined,
      maxRestaurants: venueData.maxRestaurants !== undefined ? venueData.maxRestaurants : undefined,
      
      // Operating Information
      operatingHours: venueData.operatingHours !== undefined ? venueData.operatingHours : undefined,
      amenities: venueData.amenities !== undefined ? venueData.amenities : undefined,
      parkingAvailable: venueData.parkingAvailable !== undefined ? venueData.parkingAvailable : undefined,
      wifiAvailable: venueData.wifiAvailable !== undefined ? venueData.wifiAvailable : undefined,
      
      // Stripe Information
      stripeAccountId: venueData.stripeAccountId !== undefined ? venueData.stripeAccountId : undefined,
      stripeAccountStatus: venueData.stripeAccountStatus ? VediAPI.sanitizeInput(venueData.stripeAccountStatus) : undefined,
      stripeOnboardingCompleted: venueData.stripeOnboardingCompleted !== undefined ? venueData.stripeOnboardingCompleted : undefined,
      
      // Status Updates
      status: venueData.status ? VediAPI.sanitizeInput(venueData.status) : undefined,
      verified: venueData.verified !== undefined ? venueData.verified : undefined,
      verificationStatus: venueData.verificationStatus ? VediAPI.sanitizeInput(venueData.verificationStatus) : undefined,
      
      // Always update timestamp
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Validate email if provided
    if (updates.email && updates.email !== '' && !VediAPI.validateEmail(updates.email)) {
      throw new Error('Please provide a valid email address');
    }
    
    // Validate phone if provided
    if (updates.phone && updates.phone !== '' && !VediAPI.validatePhoneNumber(updates.phone)) {
      throw new Error('Please provide a valid phone number');
    }
    
    // Update venue
    await db.collection('venues').doc(venueId).update(updates);
    
    // Get updated venue
    const updatedDoc = await db.collection('venues').doc(venueId).get();
    const updatedVenue = { id: updatedDoc.id, ...updatedDoc.data() };
    
    // Track venue update
    await VediAPI.trackUserActivity('venue_updated', {
      venueId: venueId,
      fieldsUpdated: Object.keys(updates),
      venueName: updatedVenue.name
    });
    
    await endTracking(true);
    
    console.log('✅ Venue updated successfully:', venueId);
    return updatedVenue;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'updateVenue', { venueId });
    
    console.error('❌ Update venue error:', error);
    throw error;
  }
}

/**
 * Get venue by ID with full details
 * @param {string} venueId - Venue ID
 * @returns {Promise<Object>} Venue data
 */
async function getVenue(venueId) {
  const endTracking = VediAPI.startPerformanceMeasurement('getVenue');
  
  try {
    const db = getFirebaseDb();
    
    const doc = await db.collection('venues').doc(venueId).get();
    
    if (!doc.exists) {
      throw new Error('Venue not found');
    }
    
    const venue = { id: doc.id, ...doc.data() };
    
    await endTracking(true);
    
    console.log('✅ Venue retrieved:', venueId);
    return venue;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getVenue', { venueId });
    
    console.error('❌ Get venue error:', error);
    throw error;
  }
}

/**
 * Get venue by manager user ID
 * @param {string} managerUserId - Manager's user ID
 * @returns {Promise<Object|null>} Venue data or null if not found
 */
async function getVenueByManager(managerUserId) {
  const endTracking = VediAPI.startPerformanceMeasurement('getVenueByManager');
  
  try {
    const db = getFirebaseDb();
    
    const querySnapshot = await db.collection('venues')
      .where('managerUserId', '==', managerUserId)
      .limit(1)
      .get();
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      const venue = { id: doc.id, ...doc.data() };
      
      await endTracking(true);
      
      console.log('✅ Venue found for manager:', managerUserId);
      return venue;
    }
    
    await endTracking(true);
    return null;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getVenueByManager', { managerUserId });
    
    console.error('❌ Get venue by manager error:', error);
    throw error;
  }
}

/**
 * Get all venues with filtering and pagination
 * @param {Object} options - Query options (filters, sorting, pagination)
 * @returns {Promise<Array>} Array of venues
 */
async function getAllVenues(options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('getAllVenues');
  
  try {
    const db = getFirebaseDb();
    
    let query = db.collection('venues');
    
    // Apply filters
    if (options.status) {
      query = query.where('status', '==', options.status);
    }
    
    if (options.type) {
      query = query.where('type', '==', options.type);
    }
    
    if (options.city) {
      query = query.where('city', '==', options.city);
    }
    
    if (options.state) {
      query = query.where('state', '==', options.state);
    }
    
    if (options.verified !== undefined) {
      query = query.where('verified', '==', options.verified);
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
    
    // Apply pagination
    if (options.startAfter) {
      query = query.startAfter(options.startAfter);
    }
    
    const querySnapshot = await query.get();
    const venues = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    await endTracking(true);
    
    console.log('✅ Retrieved venues:', venues.length, 'total');
    return venues;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getAllVenues', { options });
    
    console.error('❌ Get all venues error:', error);
    throw error;
  }
}

// ============================================================================
// VENUE-RESTAURANT RELATIONSHIP MANAGEMENT
// ============================================================================

/**
 * Get venue dashboard with restaurant summary
 * @param {string} venueId - Venue ID
 * @returns {Promise<Object>} Venue dashboard data with restaurant statistics
 */
async function getVenueDashboard(venueId) {
  const endTracking = VediAPI.startPerformanceMeasurement('getVenueDashboard');
  
  try {
    // Get venue details
    const venue = await getVenue(venueId);
    
    // Get restaurants in this venue
    const restaurants = await VediAPI.getRestaurantsByVenue(venueId);
    
    // Calculate venue statistics
    const stats = {
      totalRestaurants: restaurants.length,
      activeRestaurants: restaurants.filter(r => r.status === 'active').length,
      onlineRestaurants: restaurants.filter(r => r.isOnline === true).length,
      verifiedRestaurants: restaurants.filter(r => r.verified === true).length,
      cuisineTypes: [...new Set(restaurants.map(r => r.cuisineType))],
      cities: [...new Set(restaurants.map(r => r.city))]
    };
    
    // Get recent venue activity (orders, new restaurants, etc.)
    const recentActivity = await getVenueRecentActivity(venueId, 10);
    
    const dashboard = {
      venue: venue,
      restaurants: restaurants,
      statistics: stats,
      recentActivity: recentActivity,
      generatedAt: new Date().toISOString()
    };
    
    await endTracking(true);
    
    console.log('✅ Venue dashboard generated:', venueId);
    return dashboard;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getVenueDashboard', { venueId });
    
    console.error('❌ Get venue dashboard error:', error);
    throw error;
  }
}

/**
 * Update venue statistics (called when restaurant data changes)
 * @param {string} venueId - Venue ID
 * @returns {Promise<Object>} Updated venue with new statistics
 */
async function updateVenueStatistics(venueId) {
  const endTracking = VediAPI.startPerformanceMeasurement('updateVenueStatistics');
  
  try {
    const db = getFirebaseDb();
    
    // Get current restaurants in venue
    const restaurants = await VediAPI.getRestaurantsByVenue(venueId);
    
    // TODO: Get venue orders for revenue calculation
    // This would require aggregating orders across all venue restaurants
    // For now, we'll update restaurant count and basic stats
    
    const stats = {
      restaurantCount: restaurants.length,
      activeRestaurantCount: restaurants.filter(r => r.status === 'active').length,
      verifiedRestaurantCount: restaurants.filter(r => r.verified === true).length,
      lastStatsUpdate: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('venues').doc(venueId).update(stats);
    
    // Get updated venue
    const updatedVenue = await getVenue(venueId);
    
    await endTracking(true);
    
    console.log('✅ Venue statistics updated:', venueId);
    return updatedVenue;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'updateVenueStatistics', { venueId });
    
    console.error('❌ Update venue statistics error:', error);
    throw error;
  }
}

// ============================================================================
// VENUE ACTIVITY AND ANALYTICS
// ============================================================================

/**
 * Get recent venue activity
 * @param {string} venueId - Venue ID
 * @param {number} limit - Number of activities to return
 * @returns {Promise<Array>} Array of recent activities
 */
async function getVenueRecentActivity(venueId, limit = 20) {
  const endTracking = VediAPI.startPerformanceMeasurement('getVenueRecentActivity');
  
  try {
    const db = getFirebaseDb();
    
    // Get recent activity from venueActivity collection
    const activitySnapshot = await db.collection('venueActivity')
      .where('venueId', '==', venueId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    
    const activities = activitySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    await endTracking(true);
    
    console.log('✅ Retrieved venue activity:', activities.length, 'activities');
    return activities;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getVenueRecentActivity', { venueId });
    
    console.error('❌ Get venue activity error:', error);
    // Return empty array on error rather than throwing
    return [];
  }
}

/**
 * Log venue activity
 * @param {string} venueId - Venue ID
 * @param {Object} activity - Activity data
 * @returns {Promise<void>} Resolves when activity is logged
 */
async function logVenueActivity(venueId, activity) {
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    const activityData = {
      venueId: venueId,
      type: activity.type || 'general',
      title: VediAPI.sanitizeInput(activity.title || 'Activity'),
      description: VediAPI.sanitizeInput(activity.description || ''),
      metadata: activity.metadata || {},
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser?.uid || 'system'
    };
    
    await db.collection('venueActivity').add(activityData);
    
    console.log('✅ Venue activity logged:', venueId, activity.type);
    
  } catch (error) {
    console.error('❌ Log venue activity error:', error);
    await VediAPI.trackError(error, 'logVenueActivity', { venueId, activityType: activity.type });
    // Don't throw - activity logging should be non-critical
  }
}

// ============================================================================
// VENUE SEARCH AND DISCOVERY
// ============================================================================

/**
 * Search venues by name or location
 * @param {string} searchTerm - Search term
 * @param {Object} filters - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of matching venues
 */
async function searchVenues(searchTerm, filters = {}, options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('searchVenues');
  
  try {
    // Get all active venues for search
    const allVenues = await getAllVenues({
      status: 'active',
      verified: true,
      limit: 1000
    });
    
    const searchLower = searchTerm.toLowerCase();
    
    let matchingVenues = allVenues.filter(venue => {
      // Search in name, type, city, and description
      const nameMatch = venue.name.toLowerCase().includes(searchLower);
      const typeMatch = venue.type && venue.type.toLowerCase().includes(searchLower);
      const cityMatch = venue.city.toLowerCase().includes(searchLower);
      const descriptionMatch = venue.description && venue.description.toLowerCase().includes(searchLower);
      
      return nameMatch || typeMatch || cityMatch || descriptionMatch;
    });
    
    // Apply additional filters
    if (filters.type) {
      matchingVenues = matchingVenues.filter(v => v.type === filters.type);
    }
    
    if (filters.city) {
      matchingVenues = matchingVenues.filter(v => v.city === filters.city);
    }
    
    if (filters.state) {
      matchingVenues = matchingVenues.filter(v => v.state === filters.state);
    }
    
    if (filters.minRestaurants) {
      matchingVenues = matchingVenues.filter(v => v.restaurantCount >= filters.minRestaurants);
    }
    
    // Apply sorting
    if (options.sortBy) {
      matchingVenues.sort((a, b) => {
        const aVal = a[options.sortBy] || '';
        const bVal = b[options.sortBy] || '';
        
        if (options.sortDirection === 'desc') {
          return bVal.toString().localeCompare(aVal.toString());
        } else {
          return aVal.toString().localeCompare(bVal.toString());
        }
      });
    }
    
    // Apply limit
    if (options.limit) {
      matchingVenues = matchingVenues.slice(0, options.limit);
    }
    
    // Track search
    await VediAPI.trackUserActivity('venue_search', {
      searchTerm: searchTerm,
      filters: filters,
      resultsCount: matchingVenues.length
    });
    
    await endTracking(true);
    
    console.log('🔍 Venue search results:', matchingVenues.length, 'matches for:', searchTerm);
    return matchingVenues;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'searchVenues', { searchTerm, filters });
    
    console.error('❌ Search venues error:', error);
    throw error;
  }
}

/**
 * Get venues by location
 * @param {string} city - City name
 * @param {string} state - State abbreviation (optional)
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of venues in the location
 */
async function getVenuesByLocation(city, state = null, options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('getVenuesByLocation');
  
  try {
    const queryOptions = {
      city: city,
      status: 'active',
      verified: true,
      ...options
    };
    
    if (state) {
      queryOptions.state = state;
    }
    
    const venues = await getAllVenues(queryOptions);
    
    await endTracking(true);
    
    console.log('✅ Retrieved venues by location:', venues.length, `in ${city}${state ? ', ' + state : ''}`);
    return venues;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getVenuesByLocation', { city, state });
    
    console.error('❌ Get venues by location error:', error);
    throw error;
  }
}

// ============================================================================
// VENUE VERIFICATION AND STATUS MANAGEMENT
// ============================================================================

/**
 * Update venue verification status (admin function)
 * @param {string} venueId - Venue ID
 * @param {boolean} verified - Verification status
 * @param {string} verificationNotes - Notes about verification
 * @returns {Promise<Object>} Updated venue
 */
async function updateVenueVerification(venueId, verified, verificationNotes = '') {
  const endTracking = VediAPI.startPerformanceMeasurement('updateVenueVerification');
  
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    const updateData = {
      verified: verified,
      verificationStatus: verified ? 'verified' : 'rejected',
      verificationNotes: VediAPI.sanitizeInput(verificationNotes),
      verifiedAt: verified ? firebase.firestore.FieldValue.serverTimestamp() : null,
      verifiedBy: auth.currentUser?.uid || 'system',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('venues').doc(venueId).update(updateData);
    
    // Get updated venue
    const updatedVenue = await getVenue(venueId);
    
    // Log activity
    await logVenueActivity(venueId, {
      type: 'verification',
      title: verified ? 'Venue Verified' : 'Venue Verification Rejected',
      description: verified ? 'Venue has been verified and approved' : `Verification rejected: ${verificationNotes}`,
      metadata: {
        verified: verified,
        verifiedBy: auth.currentUser?.uid || 'system',
        notes: verificationNotes
      }
    });
    
    // Track verification change
    await VediAPI.trackUserActivity('venue_verification_updated', {
      venueId: venueId,
      venueName: updatedVenue.name,
      verified: verified,
      verifiedBy: auth.currentUser?.uid || 'system'
    });
    
    await endTracking(true);
    
    console.log('✅ Venue verification updated:', venueId, verified ? 'VERIFIED' : 'REJECTED');
    return updatedVenue;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'updateVenueVerification', { venueId, verified });
    
    console.error('❌ Update venue verification error:', error);
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

// Attach venue management functions to VediAPI
Object.assign(window.VediAPI, {
  // Core CRUD operations
  createVenue,
  updateVenue,
  getVenue,
  getVenueByManager,
  getAllVenues,
  
  // Venue dashboard and analytics
  getVenueDashboard,
  updateVenueStatistics,
  getVenueRecentActivity,
  logVenueActivity,
  
  // Search and discovery
  searchVenues,
  getVenuesByLocation,
  
  // Verification and status
  updateVenueVerification
});

console.log('🏢 Venue Management Module loaded');
console.log('📝 CRUD: createVenue, updateVenue, getVenue, getVenueByManager, getAllVenues');
console.log('📊 Dashboard: getVenueDashboard, updateVenueStatistics, getVenueRecentActivity');
console.log('📝 Activity: logVenueActivity for comprehensive venue activity tracking');
console.log('🔍 Search: searchVenues, getVenuesByLocation with advanced filtering');
console.log('✅ Verification: updateVenueVerification for admin venue approval');
console.log('🎯 Ready for venue-restaurant relationship management and analytics');