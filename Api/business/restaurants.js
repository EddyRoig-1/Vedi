// api/business/restaurants.js - Restaurant Management
/**
 * Restaurant Management Module
 * 
 * Handles all restaurant-related operations including creation, updates,
 * restaurant profile management, and restaurant-specific queries.
 * Integrates with venue system and provides comprehensive restaurant data management.
 */

// ============================================================================
// RESTAURANT CRUD OPERATIONS
// ============================================================================

/**
 * Create new restaurant with comprehensive validation
 * @param {Object} restaurantData - Complete restaurant information
 * @returns {Promise<Object>} Created restaurant with ID
 */
async function createRestaurant(restaurantData) {
  const endTracking = VediAPI.startPerformanceMeasurement('createRestaurant');
  
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    // Validate required fields
    const requiredFields = ['name', 'address', 'city', 'state', 'phone', 'email', 'cuisineType'];
    for (const field of requiredFields) {
      if (!restaurantData[field]) {
        throw new Error(`${field} is required`);
      }
    }
    
    // Validate email format
    if (!VediAPI.validateEmail(restaurantData.email)) {
      throw new Error('Please provide a valid email address');
    }
    
    // Validate phone format
    if (!VediAPI.validatePhoneNumber(restaurantData.phone)) {
      throw new Error('Please provide a valid phone number');
    }
    
    // Clean and structure restaurant data
    const restaurant = VediAPI.removeUndefinedValues({
      // Basic Information
      name: VediAPI.sanitizeInput(restaurantData.name),
      description: restaurantData.description ? VediAPI.sanitizeInput(restaurantData.description) : '',
      cuisineType: VediAPI.sanitizeInput(restaurantData.cuisineType),
      
      // Contact Information
      email: VediAPI.sanitizeInput(restaurantData.email.toLowerCase()),
      phone: VediAPI.sanitizeInput(restaurantData.phone),
      website: restaurantData.website ? VediAPI.sanitizeInput(restaurantData.website) : '',
      
      // Address Information
      address: VediAPI.sanitizeInput(restaurantData.address),
      city: VediAPI.sanitizeInput(restaurantData.city),
      state: VediAPI.sanitizeInput(restaurantData.state),
      zipCode: restaurantData.zipCode ? VediAPI.sanitizeInput(restaurantData.zipCode) : '',
      country: restaurantData.country ? VediAPI.sanitizeInput(restaurantData.country) : 'US',
      
      // Business Information
      licenseNumber: restaurantData.licenseNumber ? VediAPI.sanitizeInput(restaurantData.licenseNumber) : '',
      taxId: restaurantData.taxId ? VediAPI.sanitizeInput(restaurantData.taxId) : '',
      currency: restaurantData.currency || 'USD',
      
      // Operational Settings
      isOnline: restaurantData.isOnline !== false, // Default to true
      acceptingOrders: restaurantData.acceptingOrders !== false, // Default to true
      deliveryEnabled: restaurantData.deliveryEnabled || false,
      pickupEnabled: restaurantData.pickupEnabled !== false, // Default to true
      
      // Venue Association (if provided)
      venueId: restaurantData.venueId || null,
      venueName: restaurantData.venueName || null,
      venueAddress: restaurantData.venueAddress || null,
      
      // Operating Hours (if provided)
      operatingHours: restaurantData.operatingHours || null,
      
      // Owner Information
      ownerUserId: auth.currentUser?.uid || restaurantData.ownerUserId,
      ownerName: restaurantData.ownerName ? VediAPI.sanitizeInput(restaurantData.ownerName) : '',
      
      // Status and Verification
      status: 'active',
      verified: false,
      verificationStatus: 'pending',
      
      // Timestamps
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Add to database
    const docRef = await db.collection('restaurants').add(restaurant);
    const doc = await docRef.get();
    const createdRestaurant = { id: doc.id, ...doc.data() };
    
    // Track restaurant creation
    await VediAPI.trackUserActivity('restaurant_created', {
      restaurantId: docRef.id,
      restaurantName: restaurant.name,
      cuisineType: restaurant.cuisineType,
      ownerUserId: restaurant.ownerUserId,
      hasVenue: !!restaurant.venueId
    });
    
    await endTracking(true);
    
    console.log('✅ Restaurant created successfully:', docRef.id);
    return createdRestaurant;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'createRestaurant', { restaurantName: restaurantData.name });
    
    console.error('❌ Create restaurant error:', error);
    throw error;
  }
}

/**
 * Update existing restaurant information
 * @param {string} restaurantId - Restaurant ID to update
 * @param {Object} restaurantData - Updated restaurant data
 * @returns {Promise<Object>} Updated restaurant
 */
async function updateRestaurant(restaurantId, restaurantData) {
  const endTracking = VediAPI.startPerformanceMeasurement('updateRestaurant');
  
  try {
    const db = getFirebaseDb();
    
    // Validate restaurant exists
    const existingDoc = await db.collection('restaurants').doc(restaurantId).get();
    if (!existingDoc.exists) {
      throw new Error('Restaurant not found');
    }
    
    // Sanitize and validate updates
    const updates = VediAPI.removeUndefinedValues({
      // Basic Information
      name: restaurantData.name ? VediAPI.sanitizeInput(restaurantData.name) : undefined,
      description: restaurantData.description !== undefined ? VediAPI.sanitizeInput(restaurantData.description) : undefined,
      cuisineType: restaurantData.cuisineType ? VediAPI.sanitizeInput(restaurantData.cuisineType) : undefined,
      
      // Contact Information
      email: restaurantData.email ? VediAPI.sanitizeInput(restaurantData.email.toLowerCase()) : undefined,
      phone: restaurantData.phone ? VediAPI.sanitizeInput(restaurantData.phone) : undefined,
      website: restaurantData.website !== undefined ? VediAPI.sanitizeInput(restaurantData.website) : undefined,
      
      // Address Information
      address: restaurantData.address ? VediAPI.sanitizeInput(restaurantData.address) : undefined,
      city: restaurantData.city ? VediAPI.sanitizeInput(restaurantData.city) : undefined,
      state: restaurantData.state ? VediAPI.sanitizeInput(restaurantData.state) : undefined,
      zipCode: restaurantData.zipCode !== undefined ? VediAPI.sanitizeInput(restaurantData.zipCode) : undefined,
      country: restaurantData.country ? VediAPI.sanitizeInput(restaurantData.country) : undefined,
      
      // Business Information
      licenseNumber: restaurantData.licenseNumber !== undefined ? VediAPI.sanitizeInput(restaurantData.licenseNumber) : undefined,
      taxId: restaurantData.taxId !== undefined ? VediAPI.sanitizeInput(restaurantData.taxId) : undefined,
      currency: restaurantData.currency ? VediAPI.sanitizeInput(restaurantData.currency) : undefined,
      
      // Operational Settings
      isOnline: restaurantData.isOnline !== undefined ? restaurantData.isOnline : undefined,
      acceptingOrders: restaurantData.acceptingOrders !== undefined ? restaurantData.acceptingOrders : undefined,
      deliveryEnabled: restaurantData.deliveryEnabled !== undefined ? restaurantData.deliveryEnabled : undefined,
      pickupEnabled: restaurantData.pickupEnabled !== undefined ? restaurantData.pickupEnabled : undefined,
      
      // Venue Association
      venueId: restaurantData.venueId !== undefined ? restaurantData.venueId : undefined,
      venueName: restaurantData.venueName !== undefined ? restaurantData.venueName : undefined,
      venueAddress: restaurantData.venueAddress !== undefined ? restaurantData.venueAddress : undefined,
      
      // Operating Hours
      operatingHours: restaurantData.operatingHours !== undefined ? restaurantData.operatingHours : undefined,
      
      // Status Updates
      status: restaurantData.status ? VediAPI.sanitizeInput(restaurantData.status) : undefined,
      verified: restaurantData.verified !== undefined ? restaurantData.verified : undefined,
      verificationStatus: restaurantData.verificationStatus ? VediAPI.sanitizeInput(restaurantData.verificationStatus) : undefined,
      
      // Always update timestamp
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Validate email if provided
    if (updates.email && !VediAPI.validateEmail(updates.email)) {
      throw new Error('Please provide a valid email address');
    }
    
    // Validate phone if provided
    if (updates.phone && !VediAPI.validatePhoneNumber(updates.phone)) {
      throw new Error('Please provide a valid phone number');
    }
    
    // Update restaurant
    await db.collection('restaurants').doc(restaurantId).update(updates);
    
    // Get updated restaurant
    const updatedDoc = await db.collection('restaurants').doc(restaurantId).get();
    const updatedRestaurant = { id: updatedDoc.id, ...updatedDoc.data() };
    
    // Track restaurant update
    await VediAPI.trackUserActivity('restaurant_updated', {
      restaurantId: restaurantId,
      fieldsUpdated: Object.keys(updates),
      restaurantName: updatedRestaurant.name
    });
    
    await endTracking(true);
    
    console.log('✅ Restaurant updated successfully:', restaurantId);
    return updatedRestaurant;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'updateRestaurant', { restaurantId });
    
    console.error('❌ Update restaurant error:', error);
    throw error;
  }
}

/**
 * Get restaurant by ID with full details
 * @param {string} restaurantId - Restaurant ID
 * @returns {Promise<Object>} Restaurant data
 */
async function getRestaurant(restaurantId) {
  const endTracking = VediAPI.startPerformanceMeasurement('getRestaurant');
  
  try {
    const db = getFirebaseDb();
    
    const doc = await db.collection('restaurants').doc(restaurantId).get();
    
    if (!doc.exists) {
      throw new Error('Restaurant not found');
    }
    
    const restaurant = { id: doc.id, ...doc.data() };
    
    await endTracking(true);
    
    console.log('✅ Restaurant retrieved:', restaurantId);
    return restaurant;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getRestaurant', { restaurantId });
    
    console.error('❌ Get restaurant error:', error);
    throw error;
  }
}

/**
 * Get restaurant by owner user ID
 * @param {string} ownerUserId - Owner's user ID
 * @returns {Promise<Object|null>} Restaurant data or null if not found
 */
async function getRestaurantByOwner(ownerUserId) {
  const endTracking = VediAPI.startPerformanceMeasurement('getRestaurantByOwner');
  
  try {
    const db = getFirebaseDb();
    
    const querySnapshot = await db.collection('restaurants')
      .where('ownerUserId', '==', ownerUserId)
      .limit(1)
      .get();
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      const restaurant = { id: doc.id, ...doc.data() };
      
      await endTracking(true);
      
      console.log('✅ Restaurant found for owner:', ownerUserId);
      return restaurant;
    }
    
    await endTracking(true);
    return null;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getRestaurantByOwner', { ownerUserId });
    
    console.error('❌ Get restaurant by owner error:', error);
    throw error;
  }
}

/**
 * Get restaurants by venue ID
 * @param {string} venueId - Venue ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of restaurants in the venue
 */
async function getRestaurantsByVenue(venueId, options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('getRestaurantsByVenue');
  
  try {
    const db = getFirebaseDb();
    
    let query = db.collection('restaurants')
      .where('venueId', '==', venueId);
    
    // Add status filter if specified
    if (options.status) {
      query = query.where('status', '==', options.status);
    }
    
    // Add ordering
    if (options.orderBy) {
      query = query.orderBy(options.orderBy, options.orderDirection || 'asc');
    } else {
      query = query.orderBy('name', 'asc');
    }
    
    // Add limit
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    const querySnapshot = await query.get();
    const restaurants = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    await endTracking(true);
    
    console.log('✅ Retrieved restaurants for venue:', restaurants.length, 'restaurants');
    return restaurants;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getRestaurantsByVenue', { venueId });
    
    console.error('❌ Get restaurants by venue error:', error);
    throw error;
  }
}

/**
 * Get all restaurants with filtering and pagination
 * @param {Object} options - Query options (filters, sorting, pagination)
 * @returns {Promise<Array>} Array of restaurants
 */
async function getAllRestaurants(options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('getAllRestaurants');
  
  try {
    const db = getFirebaseDb();
    
    let query = db.collection('restaurants');
    
    // Apply filters
    if (options.status) {
      query = query.where('status', '==', options.status);
    }
    
    if (options.cuisineType) {
      query = query.where('cuisineType', '==', options.cuisineType);
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
    
    if (options.isOnline !== undefined) {
      query = query.where('isOnline', '==', options.isOnline);
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
    const restaurants = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    await endTracking(true);
    
    console.log('✅ Retrieved restaurants:', restaurants.length, 'total');
    return restaurants;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getAllRestaurants', { options });
    
    console.error('❌ Get all restaurants error:', error);
    throw error;
  }
}

// ============================================================================
// RESTAURANT STATUS MANAGEMENT
// ============================================================================

/**
 * Update restaurant online/offline status
 * @param {string} restaurantId - Restaurant ID
 * @param {boolean} isOnline - Online status
 * @param {string} reason - Optional reason for going offline
 * @returns {Promise<Object>} Updated restaurant
 */
async function updateRestaurantStatus(restaurantId, isOnline, reason = '') {
  const endTracking = VediAPI.startPerformanceMeasurement('updateRestaurantStatus');
  
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    const updateData = {
      isOnline: isOnline,
      acceptingOrders: isOnline, // If offline, stop accepting orders
      statusUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      statusUpdatedBy: auth.currentUser?.uid || 'system',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Add offline reason if going offline
    if (!isOnline && reason.trim()) {
      updateData.offlineReason = VediAPI.sanitizeInput(reason.trim());
    } else if (isOnline) {
      // Clear offline reason when going online
      updateData.offlineReason = firebase.firestore.FieldValue.delete();
    }
    
    await db.collection('restaurants').doc(restaurantId).update(updateData);
    
    // Get updated restaurant
    const updatedRestaurant = await getRestaurant(restaurantId);
    
    // Track status change
    await VediAPI.trackUserActivity('restaurant_status_changed', {
      restaurantId: restaurantId,
      restaurantName: updatedRestaurant.name,
      newStatus: isOnline ? 'online' : 'offline',
      reason: reason || 'No reason provided'
    });
    
    await endTracking(true);
    
    console.log('✅ Restaurant status updated:', restaurantId, isOnline ? 'ONLINE' : 'OFFLINE');
    return updatedRestaurant;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'updateRestaurantStatus', { restaurantId, isOnline });
    
    console.error('❌ Update restaurant status error:', error);
    throw error;
  }
}

/**
 * Update restaurant verification status (admin function)
 * @param {string} restaurantId - Restaurant ID
 * @param {boolean} verified - Verification status
 * @param {string} verificationNotes - Notes about verification
 * @returns {Promise<Object>} Updated restaurant
 */
async function updateRestaurantVerification(restaurantId, verified, verificationNotes = '') {
  const endTracking = VediAPI.startPerformanceMeasurement('updateRestaurantVerification');
  
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
    
    await db.collection('restaurants').doc(restaurantId).update(updateData);
    
    // Get updated restaurant
    const updatedRestaurant = await getRestaurant(restaurantId);
    
    // Track verification change
    await VediAPI.trackUserActivity('restaurant_verification_updated', {
      restaurantId: restaurantId,
      restaurantName: updatedRestaurant.name,
      verified: verified,
      verifiedBy: auth.currentUser?.uid || 'system'
    });
    
    await endTracking(true);
    
    console.log('✅ Restaurant verification updated:', restaurantId, verified ? 'VERIFIED' : 'REJECTED');
    return updatedRestaurant;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'updateRestaurantVerification', { restaurantId, verified });
    
    console.error('❌ Update restaurant verification error:', error);
    throw error;
  }
}

// ============================================================================
// RESTAURANT SEARCH AND DISCOVERY
// ============================================================================

/**
 * Search restaurants by name, cuisine, or location
 * @param {string} searchTerm - Search term
 * @param {Object} filters - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of matching restaurants
 */
async function searchRestaurants(searchTerm, filters = {}, options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('searchRestaurants');
  
  try {
    // For now, we'll get all restaurants and filter in memory
    // In production, consider using Algolia or Elasticsearch for better search
    const allRestaurants = await getAllRestaurants({
      status: 'active',
      isOnline: true,
      verified: true,
      limit: 1000 // Reasonable limit for search
    });
    
    const searchLower = searchTerm.toLowerCase();
    
    let matchingRestaurants = allRestaurants.filter(restaurant => {
      // Search in name, cuisine type, and city
      const nameMatch = restaurant.name.toLowerCase().includes(searchLower);
      const cuisineMatch = restaurant.cuisineType.toLowerCase().includes(searchLower);
      const cityMatch = restaurant.city.toLowerCase().includes(searchLower);
      const descriptionMatch = restaurant.description && restaurant.description.toLowerCase().includes(searchLower);
      
      return nameMatch || cuisineMatch || cityMatch || descriptionMatch;
    });
    
    // Apply additional filters
    if (filters.cuisineType) {
      matchingRestaurants = matchingRestaurants.filter(r => r.cuisineType === filters.cuisineType);
    }
    
    if (filters.city) {
      matchingRestaurants = matchingRestaurants.filter(r => r.city === filters.city);
    }
    
    if (filters.state) {
      matchingRestaurants = matchingRestaurants.filter(r => r.state === filters.state);
    }
    
    if (filters.deliveryEnabled !== undefined) {
      matchingRestaurants = matchingRestaurants.filter(r => r.deliveryEnabled === filters.deliveryEnabled);
    }
    
    if (filters.pickupEnabled !== undefined) {
      matchingRestaurants = matchingRestaurants.filter(r => r.pickupEnabled === filters.pickupEnabled);
    }
    
    // Apply sorting
    if (options.sortBy) {
      matchingRestaurants.sort((a, b) => {
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
      matchingRestaurants = matchingRestaurants.slice(0, options.limit);
    }
    
    // Track search
    await VediAPI.trackUserActivity('restaurant_search', {
      searchTerm: searchTerm,
      filters: filters,
      resultsCount: matchingRestaurants.length
    });
    
    await endTracking(true);
    
    console.log('🔍 Restaurant search results:', matchingRestaurants.length, 'matches for:', searchTerm);
    return matchingRestaurants;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'searchRestaurants', { searchTerm, filters });
    
    console.error('❌ Search restaurants error:', error);
    throw error;
  }
}

/**
 * Get restaurants by cuisine type
 * @param {string} cuisineType - Cuisine type to filter by
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of restaurants with specified cuisine
 */
async function getRestaurantsByCuisine(cuisineType, options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('getRestaurantsByCuisine');
  
  try {
    const restaurants = await getAllRestaurants({
      cuisineType: cuisineType,
      status: 'active',
      isOnline: true,
      verified: true,
      ...options
    });
    
    await endTracking(true);
    
    console.log('✅ Retrieved restaurants by cuisine:', restaurants.length, cuisineType);
    return restaurants;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getRestaurantsByCuisine', { cuisineType });
    
    console.error('❌ Get restaurants by cuisine error:', error);
    throw error;
  }
}

/**
 * Get restaurants in a specific location
 * @param {string} city - City name
 * @param {string} state - State abbreviation (optional)
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of restaurants in the location
 */
async function getRestaurantsByLocation(city, state = null, options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('getRestaurantsByLocation');
  
  try {
    const queryOptions = {
      city: city,
      status: 'active',
      isOnline: true,
      verified: true,
      ...options
    };
    
    if (state) {
      queryOptions.state = state;
    }
    
    const restaurants = await getAllRestaurants(queryOptions);
    
    await endTracking(true);
    
    console.log('✅ Retrieved restaurants by location:', restaurants.length, `in ${city}${state ? ', ' + state : ''}`);
    return restaurants;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getRestaurantsByLocation', { city, state });
    
    console.error('❌ Get restaurants by location error:', error);
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

// Attach restaurant management functions to VediAPI
Object.assign(window.VediAPI, {
  // Core CRUD operations
  createRestaurant,
  updateRestaurant,
  getRestaurant,
  getRestaurantByOwner,
  getRestaurantsByVenue,
  getAllRestaurants,
  
  // Status management
  updateRestaurantStatus,
  updateRestaurantVerification,
  
  // Search and discovery
  searchRestaurants,
  getRestaurantsByCuisine,
  getRestaurantsByLocation
});

console.log('🏪 Restaurant Management Module loaded');
console.log('📝 CRUD: createRestaurant, updateRestaurant, getRestaurant, getRestaurantByOwner');
console.log('🏢 Venue: getRestaurantsByVenue - venue association support');
console.log('📊 Listing: getAllRestaurants with advanced filtering and pagination');
console.log('🔄 Status: updateRestaurantStatus, updateRestaurantVerification');
console.log('🔍 Search: searchRestaurants, getRestaurantsByCuisine, getRestaurantsByLocation');
console.log('✅ Comprehensive validation, tracking, and error handling included');