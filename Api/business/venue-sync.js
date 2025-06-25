// api/business/venue-sync.js - Complete Venue-Restaurant Sync Operations  
/**
 * Complete Venue Sync Module - UPDATED VERSION
 * 
 * Handles all venue-restaurant relationship synchronization including:
 * - Restaurant-initiated requests to join venues
 * - Venue-initiated invitations to restaurants
 * - Approval and denial workflows
 * - Restaurant-venue association management
 * - Status tracking and activity logging
 * 
 * FIXED: Enhanced venue discovery with better filtering and error handling
 */

// ============================================================================
// UTILITY FUNCTIONS AND HELPERS
// ============================================================================

/**
 * Get Firebase database instance
 */
function getFirebaseDb() {
    return window.firebaseDb || firebase.firestore();
}

/**
 * Get Firebase auth instance
 */
function getFirebaseAuth() {
    return window.firebaseAuth || firebase.auth();
}

/**
 * Generate unique invitation code
 */
function generateInviteCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Validate email address
 */
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Sanitize user input
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/[<>]/g, '');
}

/**
 * Performance measurement utility
 */
function startPerformanceMeasurement(operation) {
    const startTime = Date.now();
    return async function(success = true, metadata = {}) {
        const duration = Date.now() - startTime;
        console.log(`⚡ ${operation}: ${duration}ms ${success ? '✅' : '❌'}`, metadata);
    };
}

/**
 * Get relative time string
 */
function getRelativeTime(timestamp) {
    const date = timestamp && timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

// ============================================================================
// CORE CRUD FUNCTIONS - ESSENTIAL FOR PAGES TO WORK
// ============================================================================

/**
 * FIXED: Get all venues with improved filtering (status only, no verification required)
 * @param {Object} filters - Filter options (status, verified, limit, etc.)
 * @returns {Promise<Array>} Array of venues
 */
async function getAllVenues(filters = {}) {
    try {
        console.log('🔍 Getting all venues with filters:', filters);
        
        const db = getFirebaseDb();
        
        let query = db.collection('venues');
        
        // Apply basic filters that work well with Firestore
        if (filters.limit) {
            query = query.limit(filters.limit);
        } else {
            query = query.limit(100); // Default reasonable limit
        }
        
        // Order by name for consistent results
        query = query.orderBy('name');
        
        const snapshot = await query.get();
        
        console.log('📊 Raw venues from database:', snapshot.docs.length);
        
        let venues = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data
            };
        });
        
        // Apply filters in memory for more reliable filtering
        if (filters.status || filters.verified !== undefined) {
            venues = venues.filter(venue => {
                // Status filter - only check status, ignore verification
                if (filters.status) {
                    const venueStatus = venue.status || 'active'; // Default to active if not set
                    if (venueStatus !== filters.status) {
                        return false;
                    }
                }
                
                // Keep verified filter only if explicitly requested
                if (filters.verified !== undefined) {
                    const venueVerified = venue.verified !== false; // Default to true if not explicitly false
                    if (venueVerified !== filters.verified) {
                        return false;
                    }
                }
                
                return true;
            });
        }
        
        console.log('✅ Retrieved all venues after filtering:', venues.length);
        console.log('📋 Venues:', venues.map(v => ({ id: v.id, name: v.name, status: v.status, verified: v.verified })));
        
        return venues;
        
    } catch (error) {
        console.error('❌ Error getting all venues:', error);
        throw error;
    }
}

/**
 * Get venue by manager ID (for venue management dashboard)
 * @param {string} managerId - Manager user ID
 * @returns {Promise<Object|null>} Venue data or null
 */
async function getVenueByManager(managerId) {
    try {
        const db = getFirebaseDb();
        
        const venueQuery = await db.collection('venues')
            .where('managerUserId', '==', managerId)
            .limit(1)
            .get();
        
        if (venueQuery.empty) {
            return null;
        }
        
        const venueDoc = venueQuery.docs[0];
        const venue = { id: venueDoc.id, ...venueDoc.data() };
        
        console.log('✅ Retrieved venue by manager:', venue.name);
        return venue;
        
    } catch (error) {
        console.error('❌ Error getting venue by manager:', error);
        throw error;
    }
}

/**
 * Get restaurant by owner ID (for restaurant settings page)
 * @param {string} ownerId - Owner user ID
 * @returns {Promise<Object|null>} Restaurant data or null
 */
async function getRestaurantByOwner(ownerId) {
    try {
        const db = getFirebaseDb();
        
        const restaurantQuery = await db.collection('restaurants')
            .where('ownerUserId', '==', ownerId)
            .limit(1)
            .get();
        
        if (restaurantQuery.empty) {
            return null;
        }
        
        const restaurantDoc = restaurantQuery.docs[0];
        const restaurant = { id: restaurantDoc.id, ...restaurantDoc.data() };
        
        console.log('✅ Retrieved restaurant by owner:', restaurant.name);
        return restaurant;
        
    } catch (error) {
        console.error('❌ Error getting restaurant by owner:', error);
        throw error;
    }
}

/**
 * Update restaurant data
 * @param {string} restaurantId - Restaurant ID to update
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated restaurant data
 */
async function updateRestaurant(restaurantId, updateData) {
    try {
        const db = getFirebaseDb();
        
        // Add timestamp
        const dataWithTimestamp = {
            ...updateData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Update the restaurant
        await db.collection('restaurants').doc(restaurantId).update(dataWithTimestamp);
        
        // Get the updated restaurant
        const updatedDoc = await db.collection('restaurants').doc(restaurantId).get();
        const updatedRestaurant = { id: updatedDoc.id, ...updatedDoc.data() };
        
        console.log('✅ Restaurant updated successfully:', restaurantId);
        return updatedRestaurant;
        
    } catch (error) {
        console.error('❌ Error updating restaurant:', error);
        throw error;
    }
}

/**
 * Update venue data
 * @param {string} venueId - Venue ID to update
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated venue data
 */
async function updateVenue(venueId, updateData) {
    try {
        const db = getFirebaseDb();
        
        // Add timestamp
        const dataWithTimestamp = {
            ...updateData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Update the venue
        await db.collection('venues').doc(venueId).update(dataWithTimestamp);
        
        // Get the updated venue
        const updatedDoc = await db.collection('venues').doc(venueId).get();
        const updatedVenue = { id: updatedDoc.id, ...updatedDoc.data() };
        
        console.log('✅ Venue updated successfully:', venueId);
        return updatedVenue;
        
    } catch (error) {
        console.error('❌ Error updating venue:', error);
        throw error;
    }
}

/**
 * Get restaurant by ID directly from Firestore
 * @param {string} restaurantId - Restaurant ID
 * @returns {Promise<Object>} Restaurant data
 */
async function getRestaurantById(restaurantId) {
    try {
        const db = getFirebaseDb();
        const doc = await db.collection('restaurants').doc(restaurantId).get();
        
        if (!doc.exists) {
            return null;
        }
        
        return { id: doc.id, ...doc.data() };
    } catch (error) {
        console.error('❌ Error getting restaurant by ID:', error);
        throw error;
    }
}

/**
 * Get venue by ID directly from Firestore
 * @param {string} venueId - Venue ID
 * @returns {Promise<Object>} Venue data
 */
async function getVenueById(venueId) {
    try {
        const db = getFirebaseDb();
        const doc = await db.collection('venues').doc(venueId).get();
        
        if (!doc.exists) {
            return null;
        }
        
        return { id: doc.id, ...doc.data() };
    } catch (error) {
        console.error('❌ Error getting venue by ID:', error);
        throw error;
    }
}

// ============================================================================
// ENHANCED VENUE DISCOVERY - FIXED VERSION
// ============================================================================

/**
 * FIXED: Get all venues that a restaurant can potentially join (no verification required)
 * @param {string} restaurantId - Restaurant ID
 * @param {Object} filters - Additional filters
 * @returns {Promise<Array>} Array of available venues
 */
async function getAvailableVenuesForRestaurant(restaurantId, filters = {}) {
    const endTracking = startPerformanceMeasurement('getAvailableVenuesForRestaurant');
    
    try {
        console.log('🔍 Searching for available venues for restaurant:', restaurantId);
        
        const db = getFirebaseDb();
        
        // Get restaurant details
        let restaurant = null;
        try {
            restaurant = await getRestaurantById(restaurantId);
            console.log('📊 Restaurant data loaded:', restaurant?.name, 'Current venue:', restaurant?.venueId);
        } catch (error) {
            console.warn('⚠️ Could not get restaurant details:', error);
        }
        
        // Get ALL venues first with minimal filtering for better reliability
        let query = db.collection('venues');
        
        // Apply only basic limits and ordering
        const limit = filters.limit || 100;
        query = query.limit(limit);
        
        // Order by name for consistent results
        query = query.orderBy('name');
        
        console.log('🔍 Executing venue query with limit:', limit);
        const venuesSnapshot = await query.get();
        console.log('📊 Raw venues from database:', venuesSnapshot.docs.length);
        
        // Map all venues from database
        let venues = venuesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data
            };
        });
        
        console.log('📋 All venues before filtering:', venues.map(v => ({ 
            id: v.id, 
            name: v.name, 
            status: v.status, 
            verified: v.verified,
            city: v.city,
            state: v.state
        })));
        
        // Apply filters in memory - ONLY check status, NOT verification
        const filteredVenues = venues.filter(venue => {
            // Must have a name
            if (!venue.name || venue.name.trim() === '') {
                console.log(`❌ Venue ${venue.id} filtered out - no name`);
                return false;
            }
            
            // Don't show venue if restaurant is already associated with it
            if (restaurant && restaurant.venueId === venue.id) {
                console.log(`❌ Venue ${venue.name} filtered out - restaurant already associated`);
                return false;
            }
            
            // Status filter - only check for active status, ignore verification completely
            const venueStatus = venue.status;
            if (venueStatus && venueStatus !== 'active' && venueStatus !== 'open') {
                console.log(`❌ Venue ${venue.name} filtered out - status: ${venueStatus}`);
                return false;
            }
            
            // NO VERIFICATION CHECK - venues can be shown regardless of verification status
            
            console.log(`✅ Venue ${venue.name} passed all filters (status: ${venueStatus || 'undefined'}, verified: ${venue.verified})`);
            return true;
        });
        
        console.log('📊 Venues after filtering:', filteredVenues.length);
        
        // Sort venues by relevance if restaurant data is available
        if (restaurant && restaurant.city && filters.includeNearby) {
            filteredVenues.sort((a, b) => {
                // Prioritize same city
                const aSameCity = a.city && a.city.toLowerCase() === restaurant.city.toLowerCase();
                const bSameCity = b.city && b.city.toLowerCase() === restaurant.city.toLowerCase();
                
                if (aSameCity && !bSameCity) return -1;
                if (!aSameCity && bSameCity) return 1;
                
                // Then same state
                const aSameState = a.state === restaurant.state;
                const bSameState = b.state === restaurant.state;
                
                if (aSameState && !bSameState) return -1;
                if (!aSameState && bSameState) return 1;
                
                // Finally alphabetical
                return (a.name || '').localeCompare(b.name || '');
            });
            
            console.log('🗂️ Venues sorted by location relevance');
        }
        
        await endTracking(true);
        
        console.log('✅ Found available venues for restaurant:', filteredVenues.length);
        console.log('📋 Final available venues:', filteredVenues.map(v => ({ 
            id: v.id, 
            name: v.name, 
            city: v.city, 
            state: v.state,
            status: v.status,
            verified: v.verified
        })));
        
        return filteredVenues;
        
    } catch (error) {
        await endTracking(false, { error: error.message });
        console.error('❌ Error getting available venues:', error);
        
        // Log detailed error information for debugging
        console.error('🔍 Detailed error:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        
        // Return empty array but don't throw to prevent UI breakage
        return [];
    }
}

/**
 * Check if restaurant can join a specific venue
 * @param {string} restaurantId - Restaurant ID
 * @param {string} venueId - Venue ID
 * @returns {Promise<Object>} Eligibility status
 */
async function checkVenueEligibility(restaurantId, venueId) {
    try {
        const eligibility = {
            eligible: true,
            reasons: []
        };
        
        // Get restaurant and venue
        const [restaurant, venue] = await Promise.all([
            getRestaurantById(restaurantId),
            getVenueById(venueId)
        ]);
        
        if (!restaurant) {
            eligibility.eligible = false;
            eligibility.reasons.push('Restaurant not found');
            return eligibility;
        }
        
        if (!venue) {
            eligibility.eligible = false;
            eligibility.reasons.push('Venue not found');
            return eligibility;
        }
        
        // Check if restaurant is already associated
        if (restaurant.venueId) {
            eligibility.eligible = false;
            eligibility.reasons.push('Restaurant is already associated with a venue');
        }
        
        // Check if venue has reached max restaurants
        if (venue.maxRestaurants) {
            const venueRestaurants = await getVenueRestaurants(venueId);
            if (venueRestaurants.length >= venue.maxRestaurants) {
                eligibility.eligible = false;
                eligibility.reasons.push('Venue has reached maximum number of restaurants');
            }
        }
        
        // Check if venue requires approval and has pending request
        if (venue.requireApproval) {
            const pendingRequest = await getPendingRequestByRestaurant(restaurantId, venueId);
            if (pendingRequest) {
                eligibility.eligible = false;
                eligibility.reasons.push('A request to join this venue is already pending');
            }
        }
        
        return eligibility;
        
    } catch (error) {
        console.error('❌ Error checking venue eligibility:', error);
        return { eligible: false, reasons: ['Error checking eligibility'] };
    }
}

// ============================================================================
// RESTAURANT-INITIATED REQUESTS
// ============================================================================

/**
 * ENHANCED: Restaurant requests to join a venue
 * @param {string} restaurantId - Restaurant ID making the request
 * @param {string} venueId - Target venue ID
 * @param {string} message - Optional message to venue manager
 * @returns {Promise<Object>} Created request
 */
async function requestToJoinVenue(restaurantId, venueId, message = '') {
    const endTracking = startPerformanceMeasurement('requestToJoinVenue');
    
    try {
        console.log('🏪 Restaurant requesting to join venue:', { restaurantId, venueId });
        
        const db = getFirebaseDb();
        const auth = getFirebaseAuth();
        
        // Get restaurant and venue info for the request
        const [restaurant, venue] = await Promise.all([
            getRestaurantById(restaurantId),
            getVenueById(venueId)
        ]);
        
        if (!restaurant) {
            throw new Error('Restaurant not found');
        }
        
        if (!venue) {
            throw new Error('Venue not found');
        }

        // Check if restaurant is already associated with a venue
        if (restaurant.venueId) {
            throw new Error(`Restaurant is already associated with venue: ${restaurant.venueName || restaurant.venueId}`);
        }

        // Check if there's already a pending request
        const existingRequest = await getPendingRequestByRestaurant(restaurantId, venueId);
        if (existingRequest) {
            throw new Error('A request to join this venue is already pending');
        }

        // Create the venue request with comprehensive data
        const requestData = {
            restaurantId: restaurantId,
            restaurantName: restaurant.name || 'Unknown Restaurant',
            restaurantEmail: restaurant.email || 'Not provided',
            restaurantCuisine: restaurant.cuisineType || 'Not specified',
            restaurantAddress: restaurant.address || 'Not provided',
            restaurantCity: restaurant.city || 'Not provided',
            restaurantState: restaurant.state || 'Not provided',
            restaurantPhone: restaurant.phone || 'Not provided',
            venueId: venueId,
            venueName: venue.name || 'Unknown Venue',
            venueAddress: venue.address || 'Not provided',
            venueCity: venue.city || 'Not provided',
            venueState: venue.state || 'Not provided',
            status: 'pending',
            message: sanitizeInput(message.trim()),
            requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
            requestedByUserId: auth.currentUser?.uid || null,
            type: 'restaurant_request',
            // Add expiration (30 days)
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        };

        console.log('📝 Creating request with data:', requestData);

        // Save to venueRequests collection
        const docRef = await db.collection('venueRequests').add(requestData);

        console.log('✅ Request created with ID:', docRef.id);

        // Add activity log (non-critical)
        try {
            await addVenueActivity(venueId, {
                type: 'request',
                title: 'New Restaurant Join Request',
                description: `${restaurant.name} has requested to join the venue`,
                metadata: {
                    restaurantId: restaurantId,
                    restaurantName: restaurant.name,
                    requestId: docRef.id
                }
            });
        } catch (error) {
            console.warn('⚠️ Could not log venue activity:', error);
        }

        await endTracking(true);

        console.log('✅ Venue join request created:', docRef.id);
        return { id: docRef.id, ...requestData };

    } catch (error) {
        await endTracking(false, { error: error.message });
        console.error('❌ Error creating venue join request:', error);
        throw error;
    }
}

/**
 * Cancel a pending venue join request
 * @param {string} requestId - Request ID to cancel
 * @returns {Promise<void>}
 */
async function cancelVenueRequest(requestId) {
    const endTracking = startPerformanceMeasurement('cancelVenueRequest');
    
    try {
        console.log('❌ Cancelling venue request:', requestId);
        
        const db = getFirebaseDb();
        const auth = getFirebaseAuth();
        
        // Get request details first
        const requestDoc = await db.collection('venueRequests').doc(requestId).get();
        if (!requestDoc.exists) {
            throw new Error('Request not found');
        }

        const request = requestDoc.data();
        
        // Verify ownership (restaurant can only cancel their own requests)
        if (auth.currentUser && request.requestedByUserId !== auth.currentUser.uid) {
            throw new Error('You can only cancel your own requests');
        }

        // Update request status to cancelled
        await db.collection('venueRequests').doc(requestId).update({
            status: 'cancelled',
            cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
            cancelledByUserId: auth.currentUser?.uid || null
        });

        await endTracking(true);
        console.log('✅ Venue request cancelled successfully');

    } catch (error) {
        await endTracking(false, { error: error.message });
        console.error('❌ Error cancelling venue request:', error);
        throw error;
    }
}

/**
 * Get pending requests for a restaurant
 * @param {string} restaurantId - Restaurant ID
 * @returns {Promise<Array>} Array of pending requests
 */
async function getRestaurantRequests(restaurantId) {
    const endTracking = startPerformanceMeasurement('getRestaurantRequests');
    
    try {
        console.log('📋 Loading requests for restaurant:', restaurantId);
        
        const db = getFirebaseDb();
        
        const querySnapshot = await db.collection('venueRequests')
            .where('restaurantId', '==', restaurantId)
            .where('status', 'in', ['pending', 'approved', 'denied'])
            .orderBy('requestedAt', 'desc')
            .get();

        const requests = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        await endTracking(true);

        console.log('✅ Retrieved restaurant requests:', requests.length);
        return requests;

    } catch (error) {
        await endTracking(false, { error: error.message });
        console.error('❌ Error getting restaurant requests:', error);
        throw error;
    }
}

// ============================================================================
// VENUE-INITIATED INVITATIONS
// ============================================================================

/**
 * Venue manager creates an invitation for a restaurant
 * @param {string} venueId - Venue ID sending invitation
 * @param {Object} restaurantData - Restaurant info (name, email, etc.)
 * @param {string} personalMessage - Optional personal message
 * @returns {Promise<Object>} Created invitation with link
 */
async function createVenueInvitation(venueId, restaurantData, personalMessage = '') {
    const endTracking = startPerformanceMeasurement('createVenueInvitation');
    
    try {
        console.log('📨 Creating venue invitation:', { venueId, restaurantData });
        
        const db = getFirebaseDb();
        const auth = getFirebaseAuth();
        
        // Get venue info
        const venue = await getVenueById(venueId);
        if (!venue) {
            throw new Error('Venue not found');
        }
        
        // Generate unique invitation code
        const inviteCode = generateInviteCode();
        
        // Create invitation data
        const invitationData = {
            venueId: venueId,
            venueName: venue.name,
            venueAddress: venue.address || 'Address not provided',
            venueCity: venue.city || 'City not provided',
            venueState: venue.state || 'State not provided',
            venueDescription: venue.description || 'No description provided',
            restaurantName: sanitizeInput(restaurantData.restaurantName),
            contactEmail: sanitizeInput(restaurantData.contactEmail),
            personalMessage: sanitizeInput(personalMessage.trim()),
            inviteCode: inviteCode,
            status: 'pending',
            type: 'venue_invitation',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdByUserId: auth.currentUser?.uid || null,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
        };

        // Save to venueInvitations collection
        const docRef = await db.collection('venueInvitations').add(invitationData);

        // Generate invitation link
        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
        const invitationLink = `${baseUrl}venue-invitation.html?invite=${inviteCode}`;

        await endTracking(true);

        console.log('✅ Venue invitation created:', docRef.id);
        return { 
            id: docRef.id, 
            ...invitationData,
            invitationLink: invitationLink
        };

    } catch (error) {
        await endTracking(false, { error: error.message });
        console.error('❌ Error creating venue invitation:', error);
        throw error;
    }
}

/**
 * Get invitations for a venue
 * @param {string} venueId - Venue ID
 * @param {string} status - Optional status filter
 * @returns {Promise<Array>} Array of invitations
 */
async function getVenueInvitations(venueId, status = null) {
    const endTracking = startPerformanceMeasurement('getVenueInvitations');
    
    try {
        const db = getFirebaseDb();
        
        let query = db.collection('venueInvitations')
            .where('venueId', '==', venueId);
        
        if (status) {
            query = query.where('status', '==', status);
        }
        
        query = query.orderBy('createdAt', 'desc');
        
        const querySnapshot = await query.get();
        const invitations = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        await endTracking(true);
        return invitations;

    } catch (error) {
        await endTracking(false, { error: error.message });
        console.error('❌ Error getting venue invitations:', error);
        throw error;
    }
}

// ============================================================================
// APPROVAL AND SYNC PROCESSES
// ============================================================================

/**
 * Venue manager approves a restaurant join request
 * @param {string} requestId - Request ID to approve
 * @returns {Promise<Object>} Updated request and synced restaurant
 */
async function approveRestaurantRequest(requestId) {
    const endTracking = startPerformanceMeasurement('approveRestaurantRequest');
    
    try {
        console.log('✅ Approving restaurant request:', requestId);
        
        const db = getFirebaseDb();
        const auth = getFirebaseAuth();
        
        // Get request details
        const requestDoc = await db.collection('venueRequests').doc(requestId).get();
        if (!requestDoc.exists) {
            throw new Error('Request not found');
        }

        const request = requestDoc.data();
        
        // Verify request is still pending
        if (request.status !== 'pending') {
            throw new Error(`Request is already ${request.status}`);
        }

        // Check if restaurant is still available
        const restaurant = await getRestaurantById(request.restaurantId);
        if (restaurant.venueId && restaurant.venueId !== request.venueId) {
            throw new Error('Restaurant has already joined another venue');
        }

        // Start transaction to ensure consistency
        await db.runTransaction(async (transaction) => {
            // Update request status
            transaction.update(db.collection('venueRequests').doc(requestId), {
                status: 'approved',
                approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                approvedByUserId: auth.currentUser?.uid || null
            });

            // Sync restaurant to venue
            transaction.update(db.collection('restaurants').doc(request.restaurantId), {
                venueId: request.venueId,
                venueName: request.venueName,
                venueAddress: request.venueAddress,
                joinedVenueAt: firebase.firestore.FieldValue.serverTimestamp(),
                venueStatus: 'active',
                syncMethod: 'restaurant_request',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        await endTracking(true);

        console.log('✅ Restaurant request approved and synced successfully');
        return { id: requestId, ...request, status: 'approved' };

    } catch (error) {
        await endTracking(false, { error: error.message });
        console.error('❌ Error approving restaurant request:', error);
        throw error;
    }
}

/**
 * Venue manager denies a restaurant join request
 * @param {string} requestId - Request ID to deny
 * @param {string} reason - Optional reason for denial
 * @returns {Promise<void>}
 */
async function denyRestaurantRequest(requestId, reason = '') {
    const endTracking = startPerformanceMeasurement('denyRestaurantRequest');
    
    try {
        console.log('❌ Denying restaurant request:', requestId);
        
        const db = getFirebaseDb();
        const auth = getFirebaseAuth();
        
        // Get request details
        const requestDoc = await db.collection('venueRequests').doc(requestId).get();
        if (!requestDoc.exists) {
            throw new Error('Request not found');
        }

        const request = requestDoc.data();
        
        // Verify request is still pending
        if (request.status !== 'pending') {
            throw new Error(`Request is already ${request.status}`);
        }

        // Update request status to denied
        await db.collection('venueRequests').doc(requestId).update({
            status: 'denied',
            deniedAt: firebase.firestore.FieldValue.serverTimestamp(),
            deniedByUserId: auth.currentUser?.uid || null,
            denialReason: sanitizeInput(reason.trim())
        });

        await endTracking(true);
        console.log('✅ Restaurant request denied successfully');

    } catch (error) {
        await endTracking(false, { error: error.message });
        console.error('❌ Error denying restaurant request:', error);
        throw error;
    }
}

/**
 * Remove restaurant from venue (unsync)
 * @param {string} restaurantId - Restaurant ID to unsync
 * @param {string} reason - Reason for leaving venue
 * @returns {Promise<Object>} Updated restaurant
 */
async function unsyncRestaurantFromVenue(restaurantId, reason = 'Left venue') {
    const endTracking = startPerformanceMeasurement('unsyncRestaurantFromVenue');
    
    try {
        console.log('🔄 Unsyncing restaurant from venue:', restaurantId);
        
        // Get current restaurant info
        const restaurant = await getRestaurantById(restaurantId);
        
        if (!restaurant) {
            throw new Error('Restaurant not found');
        }
        
        if (!restaurant.venueId) {
            throw new Error('Restaurant is not currently associated with any venue');
        }

        // Update restaurant to remove venue association
        const db = getFirebaseDb();
        await db.collection('restaurants').doc(restaurantId).update({
            venueId: null,
            venueName: null,
            venueAddress: null,
            leftVenueAt: firebase.firestore.FieldValue.serverTimestamp(),
            venueStatus: null,
            unsyncReason: sanitizeInput(reason),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await endTracking(true);

        console.log('✅ Restaurant unsynced from venue successfully');
        return { ...restaurant, venueId: null, venueName: null };

    } catch (error) {
        await endTracking(false, { error: error.message });
        console.error('❌ Error unsyncing restaurant from venue:', error);
        throw error;
    }
}

/**
 * Get sync status for a restaurant
 * @param {string} restaurantId - Restaurant ID
 * @returns {Promise<Object>} Sync status information
 */
async function getRestaurantSyncStatus(restaurantId) {
    const endTracking = startPerformanceMeasurement('getRestaurantSyncStatus');
    
    try {
        // Get restaurant data
        const restaurant = await getRestaurantById(restaurantId);
        
        if (!restaurant) {
            throw new Error('Restaurant not found');
        }
        
        const status = {
            isAssociated: !!restaurant.venueId,
            venueId: restaurant.venueId || null,
            venueName: restaurant.venueName || null,
            joinedAt: restaurant.joinedVenueAt || null,
            syncMethod: restaurant.syncMethod || null,
            status: restaurant.venueStatus || null
        };

        // Get pending requests if not associated
        if (!status.isAssociated) {
            try {
                status.pendingRequests = await getRestaurantRequests(restaurantId);
            } catch (error) {
                console.warn('⚠️ Could not load pending requests:', error);
                status.pendingRequests = [];
            }
        }

        await endTracking(true);
        return status;

    } catch (error) {
        await endTracking(false, { error: error.message });
        console.error('❌ Error getting restaurant sync status:', error);
        
        // Return a default status object even on error
        return {
            isAssociated: false,
            venueId: null,
            venueName: null,
            joinedAt: null,
            syncMethod: null,
            status: null,
            pendingRequests: [],
            error: error.message
        };
    }
}

// ============================================================================
// VENUE AND REQUEST MANAGEMENT
// ============================================================================

/**
 * Get all restaurants associated with a venue
 * @param {string} venueId - Venue ID
 * @returns {Promise<Array>} Array of restaurants in venue
 */
async function getVenueRestaurants(venueId) {
    const endTracking = startPerformanceMeasurement('getVenueRestaurants');
    
    try {
        console.log('🍽️ Getting restaurants for venue:', venueId);
        
        const db = getFirebaseDb();
        const restaurantsQuery = await db.collection('restaurants')
            .where('venueId', '==', venueId)
            .get();

        const restaurants = restaurantsQuery.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log('📊 Found restaurants in venue:', restaurants.length);

        await endTracking(true);
        return restaurants;

    } catch (error) {
        await endTracking(false, { error: error.message });
        console.error('❌ Error getting venue restaurants:', error);
        throw error;
    }
}

/**
 * Alias for getVenueRestaurants
 * @param {string} venueId - Venue ID
 * @returns {Promise<Array>} Array of restaurants
 */
async function getRestaurantsByVenue(venueId) {
    return await getVenueRestaurants(venueId);
}

/**
 * ENHANCED: Get all pending requests for a venue
 * @param {string} venueId - Venue ID
 * @returns {Promise<Array>} Array of requests
 */
async function getVenueRequests(venueId) {
    const endTracking = startPerformanceMeasurement('getVenueRequests');
    
    try {
        console.log('📋 Loading requests for venue:', venueId);
        
        const db = getFirebaseDb();
        
        const querySnapshot = await db.collection('venueRequests')
            .where('venueId', '==', venueId)
            .orderBy('requestedAt', 'desc')
            .limit(50)
            .get();

        const requests = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log('📊 Loaded venue requests:', requests.length);

        await endTracking(true);
        return requests;

    } catch (error) {
        await endTracking(false, { error: error.message });
        console.error('❌ Error getting venue requests:', error);
        throw error;
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if restaurant has pending venue request for specific venue
 * @param {string} restaurantId - Restaurant ID
 * @param {string} venueId - Venue ID
 * @returns {Promise<Object|null>} Pending request or null
 */
async function getPendingRequestByRestaurant(restaurantId, venueId) {
    try {
        const db = getFirebaseDb();
        
        const querySnapshot = await db.collection('venueRequests')
            .where('restaurantId', '==', restaurantId)
            .where('venueId', '==', venueId)
            .where('status', '==', 'pending')
            .limit(1)
            .get();

        if (!querySnapshot.empty) {
            const doc = querySnapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        }

        return null;

    } catch (error) {
        console.error('❌ Error checking pending request:', error);
        return null;
    }
}

/**
 * Add activity log entry for a venue
 * @param {string} venueId - Venue ID
 * @param {Object} activity - Activity data
 * @returns {Promise<void>}
 */
async function addVenueActivity(venueId, activity) {
    try {
        const db = getFirebaseDb();
        const auth = getFirebaseAuth();
        
        const activityData = {
            venueId: venueId,
            ...activity,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: auth.currentUser?.uid || null
        };

        await db.collection('venueActivity').add(activityData);

    } catch (error) {
        console.error('❌ Error adding venue activity:', error);
        // Don't throw - activity logging shouldn't break main functionality
    }
}

/**
 * Add activity log entry for a restaurant
 * @param {string} restaurantId - Restaurant ID
 * @param {Object} activity - Activity data
 * @returns {Promise<void>}
 */
async function addRestaurantActivity(restaurantId, activity) {
    try {
        const db = getFirebaseDb();
        const auth = getFirebaseAuth();
        
        const activityData = {
            restaurantId: restaurantId,
            ...activity,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: auth.currentUser?.uid || null
        };

        await db.collection('restaurantActivity').add(activityData);

    } catch (error) {
        console.error('❌ Error adding restaurant activity:', error);
        // Don't throw - activity logging shouldn't break main functionality
    }
}

/**
 * Track user activity for analytics
 * @param {string} action - Action performed
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<void>}
 */
async function trackUserActivity(action, metadata = {}) {
    try {
        const db = getFirebaseDb();
        const auth = getFirebaseAuth();
        
        await db.collection('userActivity').add({
            action: action,
            userId: auth.currentUser?.uid || 'anonymous',
            metadata: metadata,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            userAgent: navigator.userAgent,
            url: window.location.href
        });
    } catch (error) {
        console.error('❌ Error tracking activity:', error);
        // Don't throw - tracking shouldn't break main functionality
    }
}

// ============================================================================
// DEBUG FUNCTIONS
// ============================================================================

/**
 * Debug function to test venue loading
 */
async function debugVenueLoading() {
    console.log('🔍 DEBUG: Testing venue loading...');
    
    try {
        // Test direct venue query
        const db = getFirebaseDb();
        const allVenuesSnapshot = await db.collection('venues').get();
        console.log('📊 Total venues in database:', allVenuesSnapshot.docs.length);
        
        allVenuesSnapshot.docs.forEach(doc => {
            const venue = doc.data();
            console.log('🏢 Venue:', {
                id: doc.id,
                name: venue.name,
                status: venue.status,
                verified: venue.verified,
                city: venue.city,
                state: venue.state
            });
        });
        
        // Test the getAvailableVenuesForRestaurant function
        const auth = getFirebaseAuth();
        if (auth.currentUser) {
            const restaurant = await getRestaurantByOwner(auth.currentUser.uid);
            if (restaurant) {
                const availableVenues = await getAvailableVenuesForRestaurant(restaurant.id, { includeNearby: true });
                console.log('🎯 Available venues for restaurant:', availableVenues);
            }
        }
        
    } catch (error) {
        console.error('❌ Debug venue loading failed:', error);
    }
}

// ============================================================================
// GLOBAL EXPORTS AND VEDIAPI INTEGRATION
// ============================================================================

// Ensure VediAPI namespace exists
if (typeof window !== 'undefined') {
    window.VediAPI = window.VediAPI || {};

    // Core CRUD functions (essential for pages to work)
    window.VediAPI.getAllVenues = getAllVenues;
    window.VediAPI.getVenueByManager = getVenueByManager;
    window.VediAPI.getRestaurantByOwner = getRestaurantByOwner;
    window.VediAPI.updateRestaurant = updateRestaurant;
    window.VediAPI.updateVenue = updateVenue;
    window.VediAPI.getRestaurantById = getRestaurantById;
    window.VediAPI.getVenueById = getVenueById;
    window.VediAPI.getRestaurantsByVenue = getRestaurantsByVenue;

    // Core venue-restaurant sync functions
    window.VediAPI.requestToJoinVenue = requestToJoinVenue;
    window.VediAPI.cancelVenueRequest = cancelVenueRequest;
    window.VediAPI.getRestaurantRequests = getRestaurantRequests;
    window.VediAPI.createVenueInvitation = createVenueInvitation;
    window.VediAPI.getVenueInvitations = getVenueInvitations;
    window.VediAPI.approveRestaurantRequest = approveRestaurantRequest;
    window.VediAPI.denyRestaurantRequest = denyRestaurantRequest;
    window.VediAPI.unsyncRestaurantFromVenue = unsyncRestaurantFromVenue;
    window.VediAPI.getRestaurantSyncStatus = getRestaurantSyncStatus;
    window.VediAPI.getVenueRestaurants = getVenueRestaurants;
    window.VediAPI.getVenueRequests = getVenueRequests;
    window.VediAPI.getAvailableVenuesForRestaurant = getAvailableVenuesForRestaurant;
    window.VediAPI.checkVenueEligibility = checkVenueEligibility;

    // Helper functions
    window.VediAPI.getPendingRequestByRestaurant = getPendingRequestByRestaurant;
    window.VediAPI.addVenueActivity = addVenueActivity;
    window.VediAPI.addRestaurantActivity = addRestaurantActivity;

    // Debug functions
    window.VediAPI.debugVenueLoading = debugVenueLoading;

    // Utility functions (only add if not already present)
    if (!window.VediAPI.validateEmail) {
        window.VediAPI.validateEmail = validateEmail;
    }
    if (!window.VediAPI.sanitizeInput) {
        window.VediAPI.sanitizeInput = sanitizeInput;
    }
    if (!window.VediAPI.startPerformanceMeasurement) {
        window.VediAPI.startPerformanceMeasurement = startPerformanceMeasurement;
    }
    if (!window.VediAPI.getRelativeTime) {
        window.VediAPI.getRelativeTime = getRelativeTime;
    }
    if (!window.VediAPI.generateInviteCode) {
        window.VediAPI.generateInviteCode = generateInviteCode;
    }
    if (!window.VediAPI.trackUserActivity) {
        window.VediAPI.trackUserActivity = trackUserActivity;
    }

    console.log('🔄 UPDATED Complete Venue Sync Module loaded successfully');
    console.log('🎯 Core CRUD functions: getAllVenues, getVenueByManager, getRestaurantByOwner, updateRestaurant, updateVenue');
    console.log('🏪 Restaurant functions: requestToJoinVenue, cancelVenueRequest, getRestaurantRequests, getRestaurantSyncStatus');
    console.log('🏢 Venue functions: createVenueInvitation, getVenueInvitations, getVenueRequests, getVenueRestaurants');
    console.log('✅ Approval functions: approveRestaurantRequest, denyRestaurantRequest');
    console.log('🔗 Sync functions: unsyncRestaurantFromVenue');
    console.log('🔧 FIXED Enhanced functions: getAvailableVenuesForRestaurant with improved filtering');
    console.log('🔍 DEBUG functions: debugVenueLoading for testing venue discovery');
    console.log('⚡ Enhanced venue-restaurant integration ready for production use');
}

// Export functions for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        // Core CRUD
        getAllVenues,
        getVenueByManager,
        getRestaurantByOwner,
        updateRestaurant,
        updateVenue,
        getRestaurantById,
        getVenueById,
        getRestaurantsByVenue,
        
        // Sync functions
        requestToJoinVenue,
        cancelVenueRequest,
        getRestaurantRequests,
        createVenueInvitation,
        getVenueInvitations,
        approveRestaurantRequest,
        denyRestaurantRequest,
        unsyncRestaurantFromVenue,
        getRestaurantSyncStatus,
        getVenueRestaurants,
        getVenueRequests,
        getAvailableVenuesForRestaurant,
        checkVenueEligibility,
        
        // Helpers
        getPendingRequestByRestaurant,
        addVenueActivity,
        addRestaurantActivity,
        
        // Debug
        debugVenueLoading,
        
        // Utilities
        validateEmail,
        sanitizeInput,
        generateInviteCode,
        getRelativeTime,
        startPerformanceMeasurement,
        trackUserActivity
    };
}
