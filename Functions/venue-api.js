const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Use existing admin app if already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

// ============================================================================
// VENUE MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Create a new venue
 */
exports.createVenue = functions.https.onCall(async ({ venueData }, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Validate required fields
    const requiredFields = ['name', 'address', 'city', 'state', 'country'];
    for (const field of requiredFields) {
      if (!venueData[field]) {
        throw new functions.https.HttpsError('invalid-argument', `Missing required field: ${field}`);
      }
    }

    // Default venue structure
    const venue = {
      name: venueData.name,
      address: venueData.address,
      city: venueData.city,
      state: venueData.state,
      country: venueData.country || 'US',
      zipCode: venueData.zipCode || '',
      phone: venueData.phone || '',
      email: venueData.email || '',
      website: venueData.website || '',
      
      // Venue-specific settings
      defaultFeePercentage: venueData.defaultFeePercentage || 1.0, // 1% default venue fee
      allowCustomFees: venueData.allowCustomFees || true,
      requireApproval: venueData.requireApproval || false,
      
      // Manager/owner info
      managerId: context.auth.uid,
      managerEmail: context.auth.token.email,
      
      // Stripe info (will be set when connecting)
      stripeAccountId: null,
      stripeAccountStatus: 'not_connected',
      
      // Status
      status: 'active',
      verified: false,
      
      // Metadata
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth.uid
    };

    const venueRef = await db.collection('venues').add(venue);
    
    console.log('✅ Venue created:', venueRef.id);
    return { venueId: venueRef.id, venue };

  } catch (error) {
    console.error('Error creating venue:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to create venue: ' + error.message);
  }
});

/**
 * Get venue details
 */
exports.getVenue = functions.https.onCall(async ({ venueId }, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const venueDoc = await db.collection('venues').doc(venueId).get();
    if (!venueDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Venue not found');
    }

    const venue = { id: venueDoc.id, ...venueDoc.data() };
    
    // Remove sensitive data unless user is the manager
    if (venue.managerId !== context.auth.uid) {
      delete venue.stripeAccountId;
      delete venue.managerEmail;
    }

    return { venue };

  } catch (error) {
    console.error('Error getting venue:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to get venue: ' + error.message);
  }
});

/**
 * Update venue details
 */
exports.updateVenue = functions.https.onCall(async ({ venueId, updates }, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check if user is the venue manager
    const venueDoc = await db.collection('venues').doc(venueId).get();
    if (!venueDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Venue not found');
    }

    const venue = venueDoc.data();
    if (venue.managerId !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Only venue managers can update venue details');
    }

    // Sanitize updates - only allow certain fields to be updated
    const allowedFields = [
      'name', 'address', 'city', 'state', 'zipCode', 'phone', 'email', 'website',
      'defaultFeePercentage', 'allowCustomFees', 'requireApproval'
    ];
    
    const sanitizedUpdates = {};
    for (const field of allowedFields) {
      if (updates.hasOwnProperty(field)) {
        sanitizedUpdates[field] = updates[field];
      }
    }

    sanitizedUpdates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await db.collection('venues').doc(venueId).update(sanitizedUpdates);
    
    console.log('✅ Venue updated:', venueId);
    return { success: true };

  } catch (error) {
    console.error('Error updating venue:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to update venue: ' + error.message);
  }
});

/**
 * List venues (for admin or public directory)
 */
exports.listVenues = functions.https.onCall(async ({ 
  city, 
  state, 
  limit = 50, 
  includePrivate = false 
}, context) => {
  try {
    let query = db.collection('venues').where('status', '==', 'active');

    if (city) {
      query = query.where('city', '==', city);
    }
    if (state) {
      query = query.where('state', '==', state);
    }

    // If not authenticated or not admin, only show verified venues
    if (!context.auth || !includePrivate) {
      query = query.where('verified', '==', true);
    }

    const venues = await query.limit(limit).get();
    
    const results = venues.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        address: data.address,
        city: data.city,
        state: data.state,
        phone: data.phone,
        website: data.website,
        defaultFeePercentage: data.defaultFeePercentage,
        verified: data.verified
      };
    });

    return { venues: results, count: results.length };

  } catch (error) {
    console.error('Error listing venues:', error);
    throw new functions.https.HttpsError('internal', 'Failed to list venues: ' + error.message);
  }
});

// ============================================================================
// RESTAURANT-VENUE RELATIONSHIP MANAGEMENT
// ============================================================================

/**
 * Link a restaurant to a venue
 */
exports.linkRestaurantToVenue = functions.https.onCall(async ({ 
  restaurantId, 
  venueId, 
  customFeePercentage 
}, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Verify restaurant exists and user has permission
    const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
    if (!restaurantDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Restaurant not found');
    }

    const restaurant = restaurantDoc.data();
    // TODO: Add proper permission check for restaurant ownership

    // Verify venue exists
    const venueDoc = await db.collection('venues').doc(venueId).get();
    if (!venueDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Venue not found');
    }

    const venue = venueDoc.data();
    
    // Determine fee percentage
    let feePercentage = venue.defaultFeePercentage;
    
    if (customFeePercentage !== undefined) {
      if (!venue.allowCustomFees) {
        throw new functions.https.HttpsError('failed-precondition', 'Venue does not allow custom fees');
      }
      feePercentage = customFeePercentage;
    }

    // Create the relationship
    const linkData = {
      restaurantId,
      venueId,
      feePercentage,
      status: venue.requireApproval ? 'pending' : 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: venue.requireApproval ? null : 'auto',
      approvedAt: venue.requireApproval ? null : admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('restaurant_venue_links').add(linkData);

    // Update restaurant with venue info
    await db.collection('restaurants').doc(restaurantId).update({
      venueId: venueId,
      venueFeePercentage: feePercentage,
      venueStatus: linkData.status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ Restaurant linked to venue:', { restaurantId, venueId, feePercentage });
    return { success: true, status: linkData.status, feePercentage };

  } catch (error) {
    console.error('Error linking restaurant to venue:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to link restaurant to venue: ' + error.message);
  }
});

/**
 * Approve or reject a restaurant-venue link (venue manager only)
 */
exports.approveRestaurantLink = functions.https.onCall(async ({ 
  linkId, 
  approved, 
  reason 
}, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Get the link
    const linkDoc = await db.collection('restaurant_venue_links').doc(linkId).get();
    if (!linkDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Link not found');
    }

    const link = linkDoc.data();
    
    // Verify user is the venue manager
    const venueDoc = await db.collection('venues').doc(link.venueId).get();
    const venue = venueDoc.data();
    
    if (venue.managerId !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Only venue managers can approve links');
    }

    // Update link status
    const newStatus = approved ? 'active' : 'rejected';
    await db.collection('restaurant_venue_links').doc(linkId).update({
      status: newStatus,
      approvedBy: context.auth.uid,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectionReason: approved ? null : reason
    });

    // Update restaurant
    await db.collection('restaurants').doc(link.restaurantId).update({
      venueStatus: newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Restaurant link ${approved ? 'approved' : 'rejected'}:`, linkId);
    return { success: true, status: newStatus };

  } catch (error) {
    console.error('Error approving restaurant link:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to approve restaurant link: ' + error.message);
  }
});

/**
 * Get restaurants linked to a venue
 */
exports.getVenueRestaurants = functions.https.onCall(async ({ 
  venueId, 
  status = 'active' 
}, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Verify user has access to this venue
    const venueDoc = await db.collection('venues').doc(venueId).get();
    if (!venueDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Venue not found');
    }

    const venue = venueDoc.data();
    if (venue.managerId !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Access denied');
    }

    // Get links
    let query = db.collection('restaurant_venue_links').where('venueId', '==', venueId);
    
    if (status) {
      query = query.where('status', '==', status);
    }

    const links = await query.get();
    
    // Get restaurant details for each link
    const restaurants = [];
    for (const linkDoc of links.docs) {
      const linkData = linkDoc.data();
      
      const restaurantDoc = await db.collection('restaurants').doc(linkData.restaurantId).get();
      if (restaurantDoc.exists) {
        restaurants.push({
          linkId: linkDoc.id,
          restaurant: { id: restaurantDoc.id, ...restaurantDoc.data() },
          feePercentage: linkData.feePercentage,
          status: linkData.status,
          createdAt: linkData.createdAt?.toDate?.()?.toISOString()
        });
      }
    }

    return { restaurants, count: restaurants.length };

  } catch (error) {
    console.error('Error getting venue restaurants:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to get venue restaurants: ' + error.message);
  }
});

// ============================================================================
// VENUE PAYMENT ANALYTICS
// ============================================================================

/**
 * Get venue payment summary
 */
exports.getVenuePaymentSummary = functions.https.onCall(async ({ 
  venueId, 
  startDate, 
  endDate 
}, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Verify user has access to this venue
    const venueDoc = await db.collection('venues').doc(venueId).get();
    if (!venueDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Venue not found');
    }

    const venue = venueDoc.data();
    if (venue.managerId !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Access denied');
    }

    // Query payments for this venue
    let query = db.collection('payments').where('venueId', '==', venueId);
    
    if (startDate) {
      query = query.where('createdAt', '>=', new Date(startDate));
    }
    if (endDate) {
      query = query.where('createdAt', '<=', new Date(endDate));
    }

    const payments = await query.get();
    
    // Calculate totals
    let totalVenueEarnings = 0;
    let totalOrders = 0;
    let totalVolume = 0;
    const restaurantBreakdown = {};

    payments.docs.forEach(doc => {
      const payment = doc.data();
      const split = payment.paymentSplit || {};
      
      totalOrders++;
      totalVolume += (split.totalCents || 0) / 100;
      totalVenueEarnings += (split.venueFeeAmount || 0) / 100;
      
      // Track by restaurant
      const restaurantId = payment.restaurantId;
      if (!restaurantBreakdown[restaurantId]) {
        restaurantBreakdown[restaurantId] = {
          orders: 0,
          volume: 0,
          venueEarnings: 0
        };
      }
      
      restaurantBreakdown[restaurantId].orders++;
      restaurantBreakdown[restaurantId].volume += (split.totalCents || 0) / 100;
      restaurantBreakdown[restaurantId].venueEarnings += (split.venueFeeAmount || 0) / 100;
    });

    return {
      summary: {
        totalOrders,
        totalVolume,
        totalVenueEarnings,
        averageOrderValue: totalOrders > 0 ? totalVolume / totalOrders : 0,
        averageVenueFee: totalOrders > 0 ? totalVenueEarnings / totalOrders : 0
      },
      restaurantBreakdown,
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
        daysIncluded: startDate && endDate ? 
          Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) : null
      }
    };

  } catch (error) {
    console.error('Error getting venue payment summary:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to get payment summary: ' + error.message);
  }
});

/**
 * Get detailed venue payment history
 */
exports.getVenuePaymentHistory = functions.https.onCall(async ({ 
  venueId, 
  startDate, 
  endDate, 
  limit = 50 
}, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Verify user has access to this venue
    const venueDoc = await db.collection('venues').doc(venueId).get();
    if (!venueDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Venue not found');
    }

    const venue = venueDoc.data();
    if (venue.managerId !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Access denied');
    }

    // Query payments
    let query = db.collection('payments')
      .where('venueId', '==', venueId)
      .orderBy('createdAt', 'desc');
    
    if (startDate) {
      query = query.where('createdAt', '>=', new Date(startDate));
    }
    if (endDate) {
      query = query.where('createdAt', '<=', new Date(endDate));
    }

    const payments = await query.limit(limit).get();
    
    // Enrich with restaurant names
    const paymentHistory = [];
    for (const doc of payments.docs) {
      const payment = doc.data();
      
      // Get restaurant name
      let restaurantName = 'Unknown Restaurant';
      try {
        const restaurantDoc = await db.collection('restaurants').doc(payment.restaurantId).get();
        if (restaurantDoc.exists) {
          restaurantName = restaurantDoc.data().name;
        }
      } catch (error) {
        console.warn('Could not fetch restaurant name for', payment.restaurantId);
      }
      
      paymentHistory.push({
        id: doc.id,
        restaurantId: payment.restaurantId,
        restaurantName,
        paymentIntentId: payment.paymentIntentId,
        venueEarnings: (payment.paymentSplit?.venueFeeAmount || 0) / 100,
        totalAmount: (payment.paymentSplit?.totalCents || 0) / 100,
        feePercentage: payment.paymentSplit?.venueFeePercentage || 0,
        createdAt: payment.createdAt?.toDate?.()?.toISOString(),
        status: payment.status
      });
    }

    return { payments: paymentHistory, count: paymentHistory.length };

  } catch (error) {
    console.error('Error getting venue payment history:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to get payment history: ' + error.message);
  }
});

console.log('🏢 Venue API v1.0.0 loaded');
console.log('🔧 Features: Venue management, restaurant linking, payment analytics');
console.log('💰 Functions: Create venues, approve restaurants, track venue earnings');
console.log('📊 Analytics: Payment summaries, detailed history, restaurant breakdowns');
