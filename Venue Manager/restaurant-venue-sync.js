// restaurant-venue-sync.js - Venue-Restaurant Relationship Management System
// Handles all venue-restaurant associations, invitations, and sync operations

// ============================================================================
// VENUE-RESTAURANT SYNC API
// ============================================================================

/**
 * VenueSync - Handles all venue-restaurant relationship operations
 * Depends on VediAPI for basic CRUD operations and Firebase access
 */
const VenueSync = {

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
  async requestToJoinVenue(restaurantId, venueId, message = '') {
    try {
      console.log('🏪 Restaurant requesting to join venue:', { restaurantId, venueId });
      
      // Get restaurant and venue info for the request
      const [restaurant, venue] = await Promise.all([
        VediAPI.getRestaurant(restaurantId),
        VediAPI.getVenue(venueId)
      ]);

      // Check if restaurant is already associated with a venue
      if (restaurant.venueId) {
        throw new Error(`Restaurant is already associated with venue: ${restaurant.venueName || restaurant.venueId}`);
      }

      // Check if there's already a pending request
      const existingRequest = await this.getPendingRequestByRestaurant(restaurantId, venueId);
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
        message: message.trim(),
        requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
        requestedByUserId: firebase.auth().currentUser?.uid || null,
        type: 'restaurant_request' // Differentiates from venue invitations
      };

      // Save to venueRequests collection
      const db = getFirebaseDb();
      const docRef = await db.collection('venueRequests').add(requestData);

      // Add activity log to venue
      await this.addVenueActivity(venueId, {
        type: 'request',
        title: 'New Restaurant Join Request',
        description: `${restaurant.name} has requested to join the venue`,
        metadata: {
          restaurantId: restaurantId,
          restaurantName: restaurant.name,
          requestId: docRef.id
        }
      });

      console.log('✅ Venue join request created:', docRef.id);
      return { id: docRef.id, ...requestData };

    } catch (error) {
      console.error('❌ Error creating venue join request:', error);
      throw new Error(`Failed to request venue join: ${error.message}`);
    }
  },

  /**
   * Cancel a pending venue join request
   * @param {string} requestId - Request ID to cancel
   * @returns {Promise<void>}
   */
  async cancelVenueRequest(requestId) {
    try {
      console.log('❌ Cancelling venue request:', requestId);
      
      const db = getFirebaseDb();
      
      // Get request details first
      const requestDoc = await db.collection('venueRequests').doc(requestId).get();
      if (!requestDoc.exists) {
        throw new Error('Request not found');
      }

      const request = requestDoc.data();
      
      // Verify ownership (restaurant can only cancel their own requests)
      const currentUser = firebase.auth().currentUser;
      if (currentUser && request.requestedByUserId !== currentUser.uid) {
        throw new Error('You can only cancel your own requests');
      }

      // Update request status to cancelled
      await db.collection('venueRequests').doc(requestId).update({
        status: 'cancelled',
        cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
        cancelledByUserId: currentUser?.uid || null
      });

      // Add activity log
      await this.addVenueActivity(request.venueId, {
        type: 'request',
        title: 'Restaurant Request Cancelled',
        description: `${request.restaurantName} cancelled their join request`,
        metadata: {
          restaurantId: request.restaurantId,
          restaurantName: request.restaurantName,
          requestId: requestId
        }
      });

      console.log('✅ Venue request cancelled successfully');

    } catch (error) {
      console.error('❌ Error cancelling venue request:', error);
      throw new Error(`Failed to cancel request: ${error.message}`);
    }
  },

  /**
   * Get pending requests for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Array>} Array of pending requests
   */
  async getRestaurantRequests(restaurantId) {
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

      console.log('✅ Retrieved restaurant requests:', requests.length);
      return requests;

    } catch (error) {
      console.error('❌ Error getting restaurant requests:', error);
      throw new Error(`Failed to get restaurant requests: ${error.message}`);
    }
  },

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
  async createVenueInvitation(venueId, restaurantData, personalMessage = '') {
    try {
      console.log('📨 Creating venue invitation:', { venueId, restaurantData });
      
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
        restaurantName: restaurantData.restaurantName,
        contactEmail: restaurantData.contactEmail,
        personalMessage: personalMessage.trim(),
        inviteCode: inviteCode,
        status: 'pending',
        type: 'venue_invitation', // Differentiates from restaurant requests
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdByUserId: firebase.auth().currentUser?.uid || null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
      };

      // Save to venueInvitations collection
      const db = getFirebaseDb();
      const docRef = await db.collection('venueInvitations').add(invitationData);

      // Generate invitation link
      const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
      const invitationLink = `${baseUrl}venue-invitation.html?invite=${inviteCode}`;

      // Add activity log
      await this.addVenueActivity(venueId, {
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

      console.log('✅ Venue invitation created:', docRef.id);
      return { 
        id: docRef.id, 
        ...invitationData,
        invitationLink: invitationLink
      };

    } catch (error) {
      console.error('❌ Error creating venue invitation:', error);
      throw new Error(`Failed to create invitation: ${error.message}`);
    }
  },

  /**
   * Cancel a pending invitation
   * @param {string} invitationId - Invitation ID to cancel
   * @returns {Promise<void>}
   */
  async cancelInvitation(invitationId) {
    try {
      console.log('❌ Cancelling invitation:', invitationId);
      
      const db = getFirebaseDb();
      
      // Get invitation details first
      const invitationDoc = await db.collection('venueInvitations').doc(invitationId).get();
      if (!invitationDoc.exists) {
        throw new Error('Invitation not found');
      }

      const invitation = invitationDoc.data();
      
      // Update invitation status to cancelled
      await db.collection('venueInvitations').doc(invitationId).update({
        status: 'cancelled',
        cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
        cancelledByUserId: firebase.auth().currentUser?.uid || null
      });

      // Add activity log
      await this.addVenueActivity(invitation.venueId, {
        type: 'invitation',
        title: 'Invitation Cancelled',
        description: `Invitation to ${invitation.restaurantName} was cancelled`,
        metadata: {
          restaurantName: invitation.restaurantName,
          invitationId: invitationId
        }
      });

      console.log('✅ Invitation cancelled successfully');

    } catch (error) {
      console.error('❌ Error cancelling invitation:', error);
      throw new Error(`Failed to cancel invitation: ${error.message}`);
    }
  },

  /**
   * Get invitations for a venue
   * @param {string} venueId - Venue ID
   * @param {string} status - Optional status filter ('pending', 'accepted', 'declined', 'expired', 'cancelled')
   * @returns {Promise<Array>} Array of invitations
   */
  async getVenueInvitations(venueId, status = null) {
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

      console.log('✅ Retrieved venue invitations:', invitations.length);
      return invitations;

    } catch (error) {
      console.error('❌ Error getting venue invitations:', error);
      throw new Error(`Failed to get venue invitations: ${error.message}`);
    }
  },

  // ============================================================================
  // APPROVAL PROCESSES
  // ============================================================================

  /**
   * Venue manager approves a restaurant join request
   * @param {string} requestId - Request ID to approve
   * @returns {Promise<Object>} Updated request and synced restaurant
   */
  async approveRestaurantRequest(requestId) {
    try {
      console.log('✅ Approving restaurant request:', requestId);
      
      const db = getFirebaseDb();
      
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
      const restaurant = await VediAPI.getRestaurant(request.restaurantId);
      if (restaurant.venueId && restaurant.venueId !== request.venueId) {
        throw new Error('Restaurant has already joined another venue');
      }

      // Start transaction to ensure consistency
      await db.runTransaction(async (transaction) => {
        // Update request status
        transaction.update(db.collection('venueRequests').doc(requestId), {
          status: 'approved',
          approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
          approvedByUserId: firebase.auth().currentUser?.uid || null
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

      // Add activity logs
      await Promise.all([
        this.addVenueActivity(request.venueId, {
          type: 'restaurant',
          title: 'Restaurant Request Approved',
          description: `${request.restaurantName} has been approved and joined the venue`,
          metadata: {
            restaurantId: request.restaurantId,
            restaurantName: request.restaurantName,
            requestId: requestId,
            syncMethod: 'restaurant_request'
          }
        }),
        this.addRestaurantActivity(request.restaurantId, {
          type: 'venue',
          title: 'Joined Venue',
          description: `Successfully joined ${request.venueName}`,
          metadata: {
            venueId: request.venueId,
            venueName: request.venueName,
            requestId: requestId
          }
        })
      ]);

      console.log('✅ Restaurant request approved and synced successfully');
      return { id: requestId, ...request, status: 'approved' };

    } catch (error) {
      console.error('❌ Error approving restaurant request:', error);
      throw new Error(`Failed to approve request: ${error.message}`);
    }
  },

  /**
   * Venue manager denies a restaurant join request
   * @param {string} requestId - Request ID to deny
   * @param {string} reason - Optional reason for denial
   * @returns {Promise<void>}
   */
  async denyRestaurantRequest(requestId, reason = '') {
    try {
      console.log('❌ Denying restaurant request:', requestId);
      
      const db = getFirebaseDb();
      
      // Get request details
      const requestDoc = await db.collection('venueRequests').doc(requestId).get();
      if (!requestDoc.exists) {
        throw new Error('Request not found');
      }

      const request = requestDoc.data();

      // Update request status
      await db.collection('venueRequests').doc(requestId).update({
        status: 'denied',
        deniedAt: firebase.firestore.FieldValue.serverTimestamp(),
        deniedByUserId: firebase.auth().currentUser?.uid || null,
        denialReason: reason.trim()
      });

      // Add activity log
      await this.addVenueActivity(request.venueId, {
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

      console.log('✅ Restaurant request denied successfully');

    } catch (error) {
      console.error('❌ Error denying restaurant request:', error);
      throw new Error(`Failed to deny request: ${error.message}`);
    }
  },

  /**
   * Restaurant owner accepts a venue invitation
   * @param {string} invitationId - Invitation ID to accept
   * @param {string} restaurantId - Restaurant ID accepting the invitation
   * @returns {Promise<Object>} Updated invitation and synced restaurant
   */
  async acceptVenueInvitation(invitationId, restaurantId) {
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
      const restaurant = await VediAPI.getRestaurant(restaurantId);
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
        this.addVenueActivity(invitation.venueId, {
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
        this.addRestaurantActivity(restaurantId, {
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
  },

  /**
   * Restaurant owner declines a venue invitation
   * @param {string} invitationId - Invitation ID to decline
   * @returns {Promise<void>}
   */
  async declineVenueInvitation(invitationId) {
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

      // Add activity log
      await this.addVenueActivity(invitation.venueId, {
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
  },

  // ============================================================================
  // CORE SYNC FUNCTIONALITY
  // ============================================================================

  /**
   * Manually sync a restaurant to a venue (admin function)
   * @param {string} restaurantId - Restaurant ID to sync
   * @param {string} venueId - Target venue ID
   * @param {string} syncReason - Reason for manual sync
   * @returns {Promise<Object>} Updated restaurant
   */
  async syncRestaurantToVenue(restaurantId, venueId, syncReason = 'Manual sync') {
    try {
      console.log('🔄 Manually syncing restaurant to venue:', { restaurantId, venueId });
      
      // Get venue and restaurant info
      const [restaurant, venue] = await Promise.all([
        VediAPI.getRestaurant(restaurantId),
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
        syncReason: syncReason
      });

      // Add activity logs
      await Promise.all([
        this.addVenueActivity(venueId, {
          type: 'restaurant',
          title: 'Restaurant Manually Synced',
          description: `${restaurant.name} was manually synced to the venue`,
          metadata: {
            restaurantId: restaurantId,
            restaurantName: restaurant.name,
            syncMethod: 'manual_sync',
            syncReason: syncReason
          }
        }),
        this.addRestaurantActivity(restaurantId, {
          type: 'venue',
          title: 'Manually Synced to Venue',
          description: `Manually synced to ${venue.name}`,
          metadata: {
            venueId: venueId,
            venueName: venue.name,
            syncReason: syncReason
          }
        })
      ]);

      console.log('✅ Restaurant manually synced to venue successfully');
      return updatedRestaurant;

    } catch (error) {
      console.error('❌ Error syncing restaurant to venue:', error);
      throw new Error(`Failed to sync restaurant: ${error.message}`);
    }
  },

  /**
   * Remove restaurant from venue (unsync)
   * @param {string} restaurantId - Restaurant ID to unsync
   * @param {string} reason - Reason for leaving venue
   * @returns {Promise<Object>} Updated restaurant
   */
  async unsyncRestaurantFromVenue(restaurantId, reason = 'Left venue') {
    try {
      console.log('🔄 Unsyncing restaurant from venue:', restaurantId);
      
      // Get current restaurant info
      const restaurant = await VediAPI.getRestaurant(restaurantId);
      
      if (!restaurant.venueId) {
        throw new Error('Restaurant is not currently associated with any venue');
      }

      const previousVenueId = restaurant.venueId;
      const previousVenueName = restaurant.venueName;

      // Update restaurant to remove venue association
      const updatedRestaurant = await VediAPI.updateRestaurant(restaurantId, {
        venueId: null,
        venueName: null,
        venueAddress: null,
        leftVenueAt: firebase.firestore.FieldValue.serverTimestamp(),
        venueStatus: null,
        unsyncReason: reason
      });

      // Add activity logs
      await Promise.all([
        this.addVenueActivity(previousVenueId, {
          type: 'restaurant',
          title: 'Restaurant Left Venue',
          description: `${restaurant.name} has left the venue`,
          metadata: {
            restaurantId: restaurantId,
            restaurantName: restaurant.name,
            reason: reason
          }
        }),
        this.addRestaurantActivity(restaurantId, {
          type: 'venue',
          title: 'Left Venue',
          description: `Left ${previousVenueName}`,
          metadata: {
            previousVenueId: previousVenueId,
            previousVenueName: previousVenueName,
            reason: reason
          }
        })
      ]);

      console.log('✅ Restaurant unsynced from venue successfully');
      return updatedRestaurant;

    } catch (error) {
      console.error('❌ Error unsyncing restaurant from venue:', error);
      throw new Error(`Failed to unsync restaurant: ${error.message}`);
    }
  },

  /**
   * Get all restaurants associated with a venue (uses existing VediAPI method)
   * @param {string} venueId - Venue ID
   * @returns {Promise<Array>} Array of restaurants in venue
   */
  async getVenueRestaurants(venueId) {
    try {
      return await VediAPI.getRestaurantsByVenue(venueId);
    } catch (error) {
      console.error('❌ Error getting venue restaurants:', error);
      throw new Error(`Failed to get venue restaurants: ${error.message}`);
    }
  },

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  /**
   * Check if restaurant has pending venue request for specific venue
   * @param {string} restaurantId - Restaurant ID
   * @param {string} venueId - Venue ID
   * @returns {Promise<Object|null>} Pending request or null
   */
  async getPendingRequestByRestaurant(restaurantId, venueId) {
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
  },

  /**
   * Get all pending requests for a venue
   * @param {string} venueId - Venue ID
   * @returns {Promise<Array>} Array of pending requests
   */
  async getVenueRequests(venueId) {
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

      console.log('✅ Retrieved venue requests:', requests.length);
      return requests;

    } catch (error) {
      console.error('❌ Error getting venue requests:', error);
      throw new Error(`Failed to get venue requests: ${error.message}`);
    }
  },

  /**
   * Validate invitation code and get invitation
   * @param {string} inviteCode - Invitation code to validate
   * @returns {Promise<Object|null>} Valid invitation or null
   */
  async validateInviteCode(inviteCode) {
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
  },

  /**
   * Add activity log entry for a venue
   * @param {string} venueId - Venue ID
   * @param {Object} activity - Activity data
   * @returns {Promise<void>}
   */
  async addVenueActivity(venueId, activity) {
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
  },

  /**
   * Add activity log entry for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @param {Object} activity - Activity data
   * @returns {Promise<void>}
   */
  async addRestaurantActivity(restaurantId, activity) {
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
  },

  /**
   * Get sync status for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Sync status information
   */
  async getRestaurantSyncStatus(restaurantId) {
    try {
      const restaurant = await VediAPI.getRestaurant(restaurantId);
      
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
        status.pendingRequests = await this.getRestaurantRequests(restaurantId);
      }

      return status;

    } catch (error) {
      console.error('❌ Error getting restaurant sync status:', error);
      throw new Error(`Failed to get sync status: ${error.message}`);
    }
  }
};

// Make VenueSync available globally
window.VenueSync = VenueSync;

// Helper function to get Firebase database (matches firebase-api.js pattern)
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

console.log('🔄 VenueSync - Restaurant-Venue Relationship Management loaded successfully');
console.log('📚 Available VenueSync methods:');
console.log('   🏪 Restaurant-initiated: requestToJoinVenue, cancelVenueRequest, getRestaurantRequests');
console.log('   🏢 Venue-initiated: createVenueInvitation, cancelInvitation, getVenueInvitations');
console.log('   ✅ Approval processes: approveRestaurantRequest, denyRestaurantRequest');
console.log('   ✅ Invitation responses: acceptVenueInvitation, declineVenueInvitation');
console.log('   🔄 Core sync: syncRestaurantToVenue, unsyncRestaurantFromVenue, getVenueRestaurants');
console.log('   🔍 Utilities: validateInviteCode, getRestaurantSyncStatus, activity logging');
console.log('💫 Features: Two-way approval system, activity logging, expiration handling, transaction safety');
console.log('🔐 Security: User authentication checks, ownership validation, status verification');
console.log('🚀 Ready for integration with restaurant settings and venue management pages!');
