// api/business/venue-sync.js - Venue-Restaurant Sync Operations  
/**
 * Venue Sync Module
 * 
 * Handles venue-restaurant relationship synchronization including the methods
 * from the restaurant-venue-sync.js file. Manages invitations, requests,
 * approvals, and venue-restaurant associations with comprehensive tracking.
 */

// ============================================================================
// RESTAURANT-INITIATED REQUESTS
// ============================================================================

/**
 * Restaurant requests to join a venue
 * @param {string} restaurantId - Restaurant ID making the request
 * @param {string} venueId - Target venue ID
 * @param {string} message - Optional message to venue manager
 * @returns {Promise<Object>} Created request
 */
async function requestToJoinVenue(restaurantId, venueId, message = '') {
  const endTracking = VediAPI.startPerformanceMeasurement('requestToJoinVenue');
  
  try {
    console.log('🏪 Restaurant requesting to join venue:', { restaurantId, venueId });
    
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    // Get restaurant and venue info for the request
    let restaurant, venue;
    
    try {
      if (typeof VediAPI.getRestaurant === 'function') {
        restaurant = await VediAPI.getRestaurant(restaurantId);
      } else {
        restaurant = await getRestaurantById(restaurantId);
      }
    } catch (error) {
      throw new Error('Could not find restaurant: ' + error.message);
    }
    
    try {
      if (typeof VediAPI.getVenue === 'function') {
        venue = await VediAPI.getVenue(venueId);
      } else {
        throw new Error('Venue service not available');
      }
    } catch (error) {
      throw new Error('Could not find venue: ' + error.message);
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

    // Create the venue request
    const requestData = {
      restaurantId: restaurantId,
      restaurantName: restaurant.name,
      restaurantEmail: restaurant.email || 'Not provided',
      restaurantCuisine: restaurant.cuisineType || 'Not specified',
      restaurantAddress: restaurant.address || 'Not provided',
      venueId: venueId,
      venueName: venue.name,
      venueAddress: venue.address || 'Not provided',
      status: 'pending',
      message: VediAPI.sanitizeInput(message.trim()),
      requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
      requestedByUserId: auth.currentUser?.uid || null,
      type: 'restaurant_request'
    };

    // Save to venueRequests collection
    const docRef = await db.collection('venueRequests').add(requestData);

    // Add activity log to venue if function is available
    if (typeof VediAPI.logVenueActivity === 'function') {
      await VediAPI.logVenueActivity(venueId, {
        type: 'request',
        title: 'New Restaurant Join Request',
        description: `${restaurant.name} has requested to join the venue`,
        metadata: {
          restaurantId: restaurantId,
          restaurantName: restaurant.name,
          requestId: docRef.id
        }
      });
    }

    // Track activity if function is available
    if (typeof VediAPI.trackUserActivity === 'function') {
      await VediAPI.trackUserActivity('venue_join_requested', {
        restaurantId: restaurantId,
        venueId: venueId,
        requestId: docRef.id
      });
    }

    await endTracking(true);

    console.log('✅ Venue join request created:', docRef.id);
    return { id: docRef.id, ...requestData };

  } catch (error) {
    await endTracking(false, { error: error.message });
    if (typeof VediAPI.trackError === 'function') {
      await VediAPI.trackError(error, 'requestToJoinVenue', { restaurantId, venueId });
    }
    
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
  const endTracking = VediAPI.startPerformanceMeasurement('cancelVenueRequest');
  
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

    // Add activity log if function is available
    if (typeof VediAPI.logVenueActivity === 'function') {
      await VediAPI.logVenueActivity(request.venueId, {
        type: 'request',
        title: 'Restaurant Request Cancelled',
        description: `${request.restaurantName} cancelled their join request`,
        metadata: {
          restaurantId: request.restaurantId,
          restaurantName: request.restaurantName,
          requestId: requestId
        }
      });
    }

    await endTracking(true);
    console.log('✅ Venue request cancelled successfully');

  } catch (error) {
    await endTracking(false, { error: error.message });
    if (typeof VediAPI.trackError === 'function') {
      await VediAPI.trackError(error, 'cancelVenueRequest', { requestId });
    }
    
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
  const endTracking = VediAPI.startPerformanceMeasurement('getRestaurantRequests');
  
  try {
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
    if (typeof VediAPI.trackError === 'function') {
      await VediAPI.trackError(error, 'getRestaurantRequests', { restaurantId });
    }
    
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
  const endTracking = VediAPI.startPerformanceMeasurement('createVenueInvitation');
  
  try {
    console.log('📨 Creating venue invitation:', { venueId, restaurantData });
    
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    // Get venue info
    const venue = await VediAPI.getVenue(venueId);
    
    // Generate unique invitation code
    const inviteCode = VediAPI.generateInviteCode();
    
    // Create invitation data
    const invitationData = {
      venueId: venueId,
      venueName: venue.name,
      venueAddress: venue.address || 'Address not provided',
      venueDescription: venue.description || 'No description provided',
      restaurantName: VediAPI.sanitizeInput(restaurantData.restaurantName),
      contactEmail: VediAPI.sanitizeInput(restaurantData.contactEmail),
      personalMessage: VediAPI.sanitizeInput(personalMessage.trim()),
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

    // Add activity log if function is available
    if (typeof VediAPI.logVenueActivity === 'function') {
      await VediAPI.logVenueActivity(venueId, {
        type: 'invitation',
        title: 'Invitation Sent',
        description: `Invitation sent to ${restaurantData.restaurantName}`,
        metadata: {
          restaurantName: restaurantData.restaurantName,
          contactEmail: restaurantData.contactEmail,
          invitationId: docRef.id,
          inviteCode: inviteCode
        }
      });
    }

    await endTracking(true);

    console.log('✅ Venue invitation created:', docRef.id);
    return { 
      id: docRef.id, 
      ...invitationData,
      invitationLink: invitationLink
    };

  } catch (error) {
    await endTracking(false, { error: error.message });
    if (typeof VediAPI.trackError === 'function') {
      await VediAPI.trackError(error, 'createVenueInvitation', { venueId });
    }
    
    console.error('❌ Error creating venue invitation:', error);
    throw error;
  }
}

/**
 * Get invitations for a venue
 * @param {string} venueId - Venue ID
 * @param {string} status - Optional status filter ('pending', 'accepted', 'declined', 'expired', 'cancelled')
 * @returns {Promise<Array>} Array of invitations
 */
async function getVenueInvitations(venueId, status = null) {
  const endTracking = VediAPI.startPerformanceMeasurement('getVenueInvitations');
  
  try {
    console.log('📨 Getting venue invitations:', venueId);
    
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

    console.log('✅ Retrieved venue invitations:', invitations.length);
    return invitations;

  } catch (error) {
    await endTracking(false, { error: error.message });
    if (typeof VediAPI.trackError === 'function') {
      await VediAPI.trackError(error, 'getVenueInvitations', { venueId });
    }
    
    console.error('❌ Error getting venue invitations:', error);
    throw error;
  }
}

/**
 * Cancel a pending invitation
 * @param {string} invitationId - Invitation ID to cancel
 * @returns {Promise<void>}
 */
async function cancelInvitation(invitationId) {
  const endTracking = VediAPI.startPerformanceMeasurement('cancelInvitation');
  
  try {
    console.log('❌ Cancelling invitation:', invitationId);
    
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    // Get invitation details first
    const invitationDoc = await db.collection('venueInvitations').doc(invitationId).get();
    if (!invitationDoc.exists) {
      throw new Error('Invitation not found');
    }

    const invitation = invitationDoc.data();
    
    // Verify invitation is still pending
    if (invitation.status !== 'pending') {
      throw new Error(`Invitation is already ${invitation.status}`);
    }

    // Update invitation status to cancelled
    await db.collection('venueInvitations').doc(invitationId).update({
      status: 'cancelled',
      cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
      cancelledByUserId: auth.currentUser?.uid || null
    });

    // Add activity log if function is available
    if (typeof VediAPI.logVenueActivity === 'function') {
      await VediAPI.logVenueActivity(invitation.venueId, {
        type: 'invitation',
        title: 'Invitation Cancelled',
        description: `Invitation to ${invitation.restaurantName} was cancelled`,
        metadata: {
          restaurantName: invitation.restaurantName,
          invitationId: invitationId
        }
      });
    }

    await endTracking(true);
    console.log('✅ Invitation cancelled successfully');

  } catch (error) {
    await endTracking(false, { error: error.message });
    if (typeof VediAPI.trackError === 'function') {
      await VediAPI.trackError(error, 'cancelInvitation', { invitationId });
    }
    
    console.error('❌ Error cancelling invitation:', error);
    throw error;
  }
}

/**
 * Restaurant owner accepts a venue invitation
 * @param {string} invitationId - Invitation ID to accept
 * @param {string} restaurantId - Restaurant ID accepting the invitation
 * @returns {Promise<Object>} Updated invitation and synced restaurant
 */
async function acceptVenueInvitation(invitationId, restaurantId) {
  try {
    console.log('✅ Accepting venue invitation:', { invitationId, restaurantId });
    
    const db = getFirebaseDb();
    
    // Get invitation details
    const invitationDoc = await db.collection('venueInvitations').doc(invitationId).get();
    if (!invitationDoc.exists) {
      throw new Error('Invitation not found');
    }

    const invitation = invitationDoc.data();
    
    // Verify invitation is still valid
    if (invitation.status !== 'pending') {
      throw new Error(`Invitation is already ${invitation.status}`);
    }

    // Check if invitation has expired
    if (invitation.expiresAt && new Date() > invitation.expiresAt.toDate()) {
      await db.collection('venueInvitations').doc(invitationId).update({
        status: 'expired'
      });
      throw new Error('Invitation has expired');
    }

    // Check if restaurant is available
    const restaurant = await getRestaurantById(restaurantId);
    if (restaurant.venueId) {
      throw new Error('Restaurant is already associated with a venue');
    }

    // Start transaction to ensure consistency
    await db.runTransaction(async (transaction) => {
      // Update invitation status
      transaction.update(db.collection('venueInvitations').doc(invitationId), {
        status: 'accepted',
        acceptedAt: firebase.firestore.FieldValue.serverTimestamp(),
        acceptedByUserId: firebase.auth().currentUser?.uid || null,
        restaurantId: restaurantId
      });

      // Sync restaurant to venue
      transaction.update(db.collection('restaurants').doc(restaurantId), {
        venueId: invitation.venueId,
        venueName: invitation.venueName,
        venueAddress: invitation.venueAddress,
        joinedVenueAt: firebase.firestore.FieldValue.serverTimestamp(),
        venueStatus: 'active',
        syncMethod: 'venue_invitation'
      });
    });

    // Add activity logs
    await Promise.all([
      addVenueActivity(invitation.venueId, {
        type: 'restaurant',
        title: 'Restaurant Joined via Invitation',
        description: `${restaurant.name} has accepted the invitation and joined the venue`,
        metadata: {
          restaurantId: restaurantId,
          restaurantName: restaurant.name,
          invitationId: invitationId,
          syncMethod: 'venue_invitation'
        }
      }),
      addRestaurantActivity(restaurantId, {
        type: 'venue',
        title: 'Accepted Venue Invitation',
        description: `Successfully joined ${invitation.venueName} via invitation`,
        metadata: {
          venueId: invitation.venueId,
          venueName: invitation.venueName,
          invitationId: invitationId
        }
      })
    ]);

    console.log('✅ Venue invitation accepted and restaurant synced successfully');
    return { id: invitationId, ...invitation, status: 'accepted', restaurantId };

  } catch (error) {
    console.error('❌ Error accepting venue invitation:', error);
    throw new Error(`Failed to accept invitation: ${error.message}`);
  }
}

/**
 * Restaurant owner declines a venue invitation
 * @param {string} invitationId - Invitation ID to decline
 * @returns {Promise<void>}
 */
async function declineVenueInvitation(invitationId) {
  try {
    console.log('❌ Declining venue invitation:', invitationId);
    
    const db = getFirebaseDb();
    
    // Get invitation details
    const invitationDoc = await db.collection('venueInvitations').doc(invitationId).get();
    if (!invitationDoc.exists) {
      throw new Error('Invitation not found');
    }

    const invitation = invitationDoc.data();

    // Update invitation status
    await db.collection('venueInvitations').doc(invitationId).update({
      status: 'declined',
      declinedAt: firebase.firestore.FieldValue.serverTimestamp(),
      declinedByUserId: firebase.auth().currentUser?.uid || null
    });

    // Add activity log if function is available
    await addVenueActivity(invitation.venueId, {
      type: 'invitation',
      title: 'Invitation Declined',
      description: `${invitation.restaurantName} declined the venue invitation`,
      metadata: {
        restaurantName: invitation.restaurantName,
        invitationId: invitationId
      }
    });

    console.log('✅ Venue invitation declined successfully');

  } catch (error) {
    console.error('❌ Error declining venue invitation:', error);
    throw new Error(`Failed to decline invitation: ${error.message}`);
  }
}

/**
 * Validate invitation code and get invitation
 * @param {string} inviteCode - Invitation code to validate
 * @returns {Promise<Object|null>} Valid invitation or null
 */
async function validateInviteCode(inviteCode) {
  try {
    const db = getFirebaseDb();
    
    const querySnapshot = await db.collection('venueInvitations')
      .where('inviteCode', '==', inviteCode)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      const invitation = { id: doc.id, ...doc.data() };
      
      // Check if expired
      if (invitation.expiresAt && new Date() > invitation.expiresAt.toDate()) {
        await db.collection('venueInvitations').doc(doc.id).update({
          status: 'expired'
        });
        return null;
      }
      
      return invitation;
    }

    return null;

  } catch (error) {
    console.error('❌ Error validating invite code:', error);
    return null;
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
  const endTracking = VediAPI.startPerformanceMeasurement('approveRestaurantRequest');
  
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

    // Check if restaurant is still available (not joined another venue)
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
        syncMethod: 'restaurant_request'
      });
    });

    // Update venue statistics if function is available
    if (typeof VediAPI.updateVenueStatistics === 'function') {
      await VediAPI.updateVenueStatistics(request.venueId);
    }

    // Add activity logs
    await Promise.all([
      VediAPI.logVenueActivity(request.venueId, {
        type: 'restaurant',
        title: 'Restaurant Request Approved',
        description: `${request.restaurantName} has been approved and joined the venue`,
        metadata: {
          restaurantId: request.restaurantId,
          restaurantName: request.restaurantName,
          requestId: requestId,
          syncMethod: 'restaurant_request'
        }
      })
    ]);

    await endTracking(true);

    console.log('✅ Restaurant request approved and synced successfully');
    return { id: requestId, ...request, status: 'approved' };

  } catch (error) {
    await endTracking(false, { error: error.message });
    if (typeof VediAPI.trackError === 'function') {
      await VediAPI.trackError(error, 'approveRestaurantRequest', { requestId });
    }
    
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
  const endTracking = VediAPI.startPerformanceMeasurement('denyRestaurantRequest');
  
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
      denialReason: VediAPI.sanitizeInput(reason.trim())
    });

    // Add activity log if function is available
    if (typeof VediAPI.logVenueActivity === 'function') {
      await VediAPI.logVenueActivity(request.venueId, {
        type: 'request',
        title: 'Restaurant Request Denied',
        description: `Request from ${request.restaurantName} was denied`,
        metadata: {
          restaurantId: request.restaurantId,
          restaurantName: request.restaurantName,
          requestId: requestId,
          reason: reason
        }
      });
    }

    await endTracking(true);

    console.log('✅ Restaurant request denied successfully');

  } catch (error) {
    await endTracking(false, { error: error.message });
    if (typeof VediAPI.trackError === 'function') {
      await VediAPI.trackError(error, 'denyRestaurantRequest', { requestId });
    }
    
    console.error('❌ Error denying restaurant request:', error);
    throw error;
  }
}

/**
 * Manually sync a restaurant to a venue (admin function)
 * @param {string} restaurantId - Restaurant ID to sync
 * @param {string} venueId - Target venue ID
 * @param {string} syncReason - Reason for manual sync
 * @returns {Promise<Object>} Updated restaurant
 */
async function syncRestaurantToVenue(restaurantId, venueId, syncReason = 'Manual sync') {
  const endTracking = VediAPI.startPerformanceMeasurement('syncRestaurantToVenue');
  
  try {
    console.log('🔄 Manually syncing restaurant to venue:', { restaurantId, venueId });
    
    // Get venue and restaurant info
    const [restaurant, venue] = await Promise.all([
      getRestaurantById(restaurantId),
      VediAPI.getVenue(venueId)
    ]);

    // Check if restaurant is already synced to another venue
    if (restaurant.venueId && restaurant.venueId !== venueId) {
      throw new Error(`Restaurant is already synced to venue: ${restaurant.venueName || restaurant.venueId}`);
    }

    // Update restaurant with venue association
    const updatedRestaurant = await VediAPI.updateRestaurant(restaurantId, {
      venueId: venueId,
      venueName: venue.name,
      venueAddress: venue.address || 'Address not provided',
      joinedVenueAt: firebase.firestore.FieldValue.serverTimestamp(),
      venueStatus: 'active',
      syncMethod: 'manual_sync',
      syncReason: VediAPI.sanitizeInput(syncReason)
    });

    // Update venue statistics if function is available
    if (typeof VediAPI.updateVenueStatistics === 'function') {
      await VediAPI.updateVenueStatistics(venueId);
    }

    // Add activity log if function is available
    if (typeof VediAPI.logVenueActivity === 'function') {
      await VediAPI.logVenueActivity(venueId, {
        type: 'restaurant',
        title: 'Restaurant Manually Synced',
        description: `${restaurant.name} was manually synced to the venue`,
        metadata: {
          restaurantId: restaurantId,
          restaurantName: restaurant.name,
          syncMethod: 'manual_sync',
          syncReason: syncReason
        }
      });
    }

    await endTracking(true);

    console.log('✅ Restaurant manually synced to venue successfully');
    return updatedRestaurant;

  } catch (error) {
    await endTracking(false, { error: error.message });
    if (typeof VediAPI.trackError === 'function') {
      await VediAPI.trackError(error, 'syncRestaurantToVenue', { restaurantId, venueId });
    }
    
    console.error('❌ Error syncing restaurant to venue:', error);
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
  const endTracking = VediAPI.startPerformanceMeasurement('unsyncRestaurantFromVenue');
  
  try {
    console.log('🔄 Unsyncing restaurant from venue:', restaurantId);
    
    // Get current restaurant info
    let restaurant;
    if (typeof VediAPI.getRestaurant === 'function') {
      restaurant = await VediAPI.getRestaurant(restaurantId);
    } else {
      restaurant = await getRestaurantById(restaurantId);
    }
    
    if (!restaurant.venueId) {
      throw new Error('Restaurant is not currently associated with any venue');
    }

    const previousVenueId = restaurant.venueId;
    const previousVenueName = restaurant.venueName;

    // Update restaurant to remove venue association
    let updatedRestaurant;
    if (typeof VediAPI.updateRestaurant === 'function') {
      updatedRestaurant = await VediAPI.updateRestaurant(restaurantId, {
        venueId: null,
        venueName: null,
        venueAddress: null,
        leftVenueAt: firebase.firestore.FieldValue.serverTimestamp(),
        venueStatus: null,
        unsyncReason: VediAPI.sanitizeInput(reason)
      });
    } else {
      throw new Error('Restaurant update service not available');
    }

    // Update venue statistics if function is available
    if (typeof VediAPI.updateVenueStatistics === 'function') {
      try {
        await VediAPI.updateVenueStatistics(previousVenueId);
      } catch (error) {
        console.warn('⚠️ Could not update venue statistics:', error);
      }
    }

    // Add activity log if function is available
    if (typeof VediAPI.logVenueActivity === 'function') {
      try {
        await VediAPI.logVenueActivity(previousVenueId, {
          type: 'restaurant',
          title: 'Restaurant Left Venue',
          description: `${restaurant.name} has left the venue`,
          metadata: {
            restaurantId: restaurantId,
            restaurantName: restaurant.name,
            reason: reason
          }
        });
      } catch (error) {
        console.warn('⚠️ Could not log venue activity:', error);
      }
    }

    await endTracking(true);

    console.log('✅ Restaurant unsynced from venue successfully');
    return updatedRestaurant;

  } catch (error) {
    await endTracking(false, { error: error.message });
    if (typeof VediAPI.trackError === 'function') {
      await VediAPI.trackError(error, 'unsyncRestaurantFromVenue', { restaurantId });
    }
    
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
  const endTracking = VediAPI.startPerformanceMeasurement('getRestaurantSyncStatus');
  
  try {
    // Try to get restaurant using available function
    let restaurant = null;
    if (typeof VediAPI.getRestaurant === 'function') {
      restaurant = await VediAPI.getRestaurant(restaurantId);
    } else {
      restaurant = await getRestaurantById(restaurantId);
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
    if (typeof VediAPI.trackError === 'function') {
      await VediAPI.trackError(error, 'getRestaurantSyncStatus', { restaurantId });
    }
    
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

/**
 * Get all restaurants associated with a venue (uses existing VediAPI method)
 * @param {string} venueId - Venue ID
 * @returns {Promise<Array>} Array of restaurants in venue
 */
async function getVenueRestaurants(venueId) {
  const endTracking = VediAPI.startPerformanceMeasurement('getVenueRestaurants');
  
  try {
    console.log('🍽️ Getting venue restaurants:', venueId);
    
    const restaurants = await VediAPI.getRestaurantsByVenue(venueId);

    await endTracking(true);

    console.log('✅ Retrieved venue restaurants:', restaurants.length);
    return restaurants;

  } catch (error) {
    await endTracking(false, { error: error.message });
    if (typeof VediAPI.trackError === 'function') {
      await VediAPI.trackError(error, 'getVenueRestaurants', { venueId });
    }
    
    console.error('❌ Error getting venue restaurants:', error);
    throw error;
  }
}

// ============================================================================
// ENHANCED FUNCTIONS FOR RESTAURANT SETTINGS PAGE
// ============================================================================

/**
 * Get all venues that a restaurant can potentially join
 * @param {string} restaurantId - Restaurant ID
 * @param {Object} filters - Additional filters
 * @returns {Promise<Array>} Array of available venues
 */
async function getAvailableVenuesForRestaurant(restaurantId, filters = {}) {
  try {
    const db = getFirebaseDb();
    
    // Get restaurant details if VediAPI.getRestaurant is available
    let restaurant = null;
    if (typeof VediAPI.getRestaurant === 'function') {
      restaurant = await VediAPI.getRestaurant(restaurantId);
    }
    
    // Get all active venues
    let venues = [];
    if (typeof VediAPI.getAllVenues === 'function') {
      venues = await VediAPI.getAllVenues({
        status: 'active',
        verified: true,
        ...filters
      });
    }
    
    // Filter venues that might be relevant (same city/state) if restaurant data available
    if (restaurant && restaurant.city) {
      venues = venues.filter(venue => 
        venue.city.toLowerCase() === restaurant.city.toLowerCase() ||
        venue.state === restaurant.state
      );
    }
    
    console.log('✅ Found available venues for restaurant:', venues.length);
    return venues;
    
  } catch (error) {
    console.error('❌ Error getting available venues:', error);
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
    
    // Get restaurant and venue if functions are available
    let restaurant = null;
    let venue = null;
    
    if (typeof VediAPI.getRestaurant === 'function') {
      restaurant = await VediAPI.getRestaurant(restaurantId);
    }
    
    if (typeof VediAPI.getVenue === 'function') {
      venue = await VediAPI.getVenue(venueId);
    }
    
    // Check if restaurant is already associated
    if (restaurant && restaurant.venueId) {
      eligibility.eligible = false;
      eligibility.reasons.push('Restaurant is already associated with a venue');
    }
    
    // Check if venue has reached max restaurants
    if (venue && venue.maxRestaurants && venue.restaurantCount >= venue.maxRestaurants) {
      eligibility.eligible = false;
      eligibility.reasons.push('Venue has reached maximum number of restaurants');
    }
    
    // Check if venue requires approval and has pending request
    if (venue && venue.requireApproval) {
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
// HELPER FUNCTIONS
// ============================================================================

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
      throw new Error('Restaurant not found');
    }
    
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('❌ Error getting restaurant by ID:', error);
    throw error;
  }
}

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
 * Get all pending requests for a venue
 * @param {string} venueId - Venue ID
 * @returns {Promise<Array>} Array of pending requests
 */
async function getVenueRequests(venueId) {
  const endTracking = VediAPI.startPerformanceMeasurement('getVenueRequests');
  
  try {
    const db = getFirebaseDb();
    
    const querySnapshot = await db.collection('venueRequests')
      .where('venueId', '==', venueId)
      .where('status', 'in', ['pending', 'approved', 'denied'])
      .orderBy('requestedAt', 'desc')
      .get();

    const requests = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    await endTracking(true);

    console.log('✅ Retrieved venue requests:', requests.length);
    return requests;

  } catch (error) {
    await endTracking(false, { error: error.message });
    if (typeof VediAPI.trackError === 'function') {
      await VediAPI.trackError(error, 'getVenueRequests', { venueId });
    }
    
    console.error('❌ Error getting venue requests:', error);
    throw error;
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
    
    const activityData = {
      venueId: venueId,
      ...activity,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: firebase.auth().currentUser?.uid || null
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
    
    const activityData = {
      restaurantId: restaurantId,
      ...activity,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: firebase.auth().currentUser?.uid || null
    };

    await db.collection('restaurantActivity').add(activityData);

  } catch (error) {
    console.error('❌ Error adding restaurant activity:', error);
    // Don't throw - activity logging shouldn't break main functionality
  }
}

// ============================================================================
// GLOBAL EXPORTS AND VEDIAPI INTEGRATION
// ============================================================================

// Ensure VediAPI namespace exists
if (!window.VediAPI) {
  window.VediAPI = {};
}

// Attach venue sync functions to VediAPI
Object.assign(window.VediAPI, {
  // Restaurant-initiated requests
  requestToJoinVenue,
  cancelVenueRequest,
  getRestaurantRequests,
  
  // Venue-initiated invitations  
  createVenueInvitation,
  getVenueInvitations,
  cancelInvitation,
  acceptVenueInvitation,
  declineVenueInvitation,
  validateInviteCode,
  
  // Approval processes
  approveRestaurantRequest,
  denyRestaurantRequest,
  
  // Core sync functionality
  syncRestaurantToVenue,
  unsyncRestaurantFromVenue,
  getRestaurantSyncStatus,
  
  // Venue management
  getVenueRestaurants,
  
  // Enhanced functions for settings page
  getAvailableVenuesForRestaurant,
  checkVenueEligibility,
  
  // Helper functions
  getPendingRequestByRestaurant,
  getVenueRequests,
  addVenueActivity,
  addRestaurantActivity,
  getRestaurantById
});

// Create VenueSync namespace for restaurant-settings.html compatibility
window.VenueSync = {
  getRestaurantSyncStatus: VediAPI.getRestaurantSyncStatus,
  requestToJoinVenue: VediAPI.requestToJoinVenue,
  cancelVenueRequest: VediAPI.cancelVenueRequest,
  unsyncRestaurantFromVenue: VediAPI.unsyncRestaurantFromVenue,
  getRestaurantRequests: VediAPI.getRestaurantRequests,
  acceptVenueInvitation: VediAPI.acceptVenueInvitation,
  declineVenueInvitation: VediAPI.declineVenueInvitation,
  validateInviteCode: VediAPI.validateInviteCode,
  getAvailableVenuesForRestaurant: VediAPI.getAvailableVenuesForRestaurant,
  checkVenueEligibility: VediAPI.checkVenueEligibility
};

console.log('🔄 Venue Sync Module loaded');
console.log('🏪 Restaurant requests: requestToJoinVenue, cancelVenueRequest, getRestaurantRequests');
console.log('🏢 Venue invitations: createVenueInvitation, getVenueInvitations, cancelInvitation');
console.log('📨 Invitation responses: acceptVenueInvitation, declineVenueInvitation, validateInviteCode');
console.log('✅ Approval: approveRestaurantRequest, denyRestaurantRequest');
console.log('🔗 Sync: syncRestaurantToVenue, unsyncRestaurantFromVenue, getRestaurantSyncStatus');
console.log('🍽️ Management: getVenueRestaurants');
console.log('📋 Queries: getVenueRequests, getPendingRequestByRestaurant');
console.log('🔧 Enhanced: getAvailableVenuesForRestaurant, checkVenueEligibility for settings page');
console.log('🎯 Complete venue-restaurant relationship management with enhanced error handling');
