const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe.secret);

admin.initializeApp();
const db = admin.firestore();

// ============================================================================
// VEDIAPI INTEGRATION & THREE-WAY PAYMENT SPLITTING
// ============================================================================

/**
 * Get fee configuration for a restaurant (integrates with your VediAPI system)
 */
async function getFeeConfig(restaurantId) {
  try {
    const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
    if (!restaurantDoc.exists) {
      throw new Error('Restaurant not found');
    }

    const restaurant = restaurantDoc.data();
    
    // Default VediAPI fee structure
    const defaultConfig = {
      feeType: 'percentage', // 'fixed', 'percentage', 'hybrid'
      serviceFeeFixed: 0,
      serviceFeePercentage: 3.5, // Your platform fee %
      taxRate: 0.085, // 8.5% default
      stripeFeePercentage: 2.9,
      stripeFlatFee: 30, // cents
      venueEnabled: false,
      venueFeePercentage: 0,
      isNegotiated: false
    };

    // Merge with restaurant-specific config
    const feeConfig = {
      ...defaultConfig,
      ...restaurant.feeConfig,
      // Venue-specific overrides - use restaurant's custom venue fee if set
      venueEnabled: restaurant.venueId ? true : false,
      venueFeePercentage: restaurant.venueFeePercentage || restaurant.venueFeePercentage || 0,
      venueId: restaurant.venueId || null
    };

    console.log('📊 Fee config loaded for', restaurantId, ':', feeConfig);
    return feeConfig;
  } catch (error) {
    console.error('Error loading fee config:', error);
    throw error;
  }
}

/**
 * Calculate three-way payment splitting with protected margins
 */
async function calculatePaymentSplit(restaurantId, totalCents) {
  try {
    console.log('🧮 Calculating payment split for:', { restaurantId, totalCents });
    
    const feeConfig = await getFeeConfig(restaurantId);
    const total = totalCents / 100;
    
    // Calculate Stripe fees (these come out first)
    const stripePct = feeConfig.stripeFeePercentage / 100;
    const stripeFlat = feeConfig.stripeFlatFee / 100;
    const stripeFeeAmount = (total * stripePct) + stripeFlat;
    const netAmount = total - stripeFeeAmount;
    
    console.log('💳 Stripe fees:', {
      percentage: stripePct * 100 + '%',
      flat: stripeFlat,
      total: stripeFeeAmount,
      netAmount
    });
    
    // Calculate your platform fee from the protected pricing
    let platformFee = 0;
    switch (feeConfig.feeType) {
      case 'fixed':
        platformFee = feeConfig.serviceFeeFixed;
        break;
      case 'percentage':
        // This should match what was calculated in your frontend pricing
        platformFee = netAmount * (feeConfig.serviceFeePercentage / 100);
        break;
      case 'hybrid':
        platformFee = feeConfig.serviceFeeFixed + (netAmount * (feeConfig.serviceFeePercentage / 100));
        break;
    }
    
    // Calculate venue fee if applicable
    let venueFee = 0;
    if (feeConfig.venueEnabled && feeConfig.venueFeePercentage > 0) {
      venueFee = netAmount * (feeConfig.venueFeePercentage / 100);
    }
    
    // Restaurant gets the remainder
    const restaurantAmount = netAmount - platformFee - venueFee;
    
    const split = {
      totalCents,
      stripeFeeAmount: Math.round(stripeFeeAmount * 100),
      platformFeeAmount: Math.round(platformFee * 100),
      venueFeeAmount: Math.round(venueFee * 100),
      restaurantAmount: Math.round(restaurantAmount * 100),
      netAmount: Math.round(netAmount * 100),
      
      // Metadata
      feeConfig,
      venueEnabled: feeConfig.venueEnabled,
      venueId: feeConfig.venueId,
      calculatedAt: new Date().toISOString()
    };
    
    console.log('💰 Payment split calculated:', split);
    
    // Validation
    const totalCheck = split.stripeFeeAmount + split.platformFeeAmount + 
                      split.venueFeeAmount + split.restaurantAmount;
    
    if (Math.abs(totalCheck - totalCents) > 1) { // Allow 1 cent rounding difference
      console.error('❌ Payment split validation failed:', {
        expected: totalCents,
        calculated: totalCheck,
        difference: totalCheck - totalCents
      });
      throw new Error('Payment split calculation error');
    }
    
    return split;
    
  } catch (error) {
    console.error('Error calculating payment split:', error);
    throw error;
  }
}

// ============================================================================
// STRIPE CONNECT ACCOUNT MANAGEMENT
// ============================================================================

/**
 * Create Stripe Express Connect account for restaurant owners
 */
exports.createRestaurantAccount = functions.https.onCall(async ({ restaurantId }, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
    if (!restaurantDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Restaurant not found');
    }

    const restaurant = restaurantDoc.data();
    
    // Check if already has Stripe account
    if (restaurant.stripeAccountId) {
      return { accountId: restaurant.stripeAccountId, alreadyExists: true };
    }

    const account = await stripe.accounts.create({
      type: 'express',
      country: restaurant.country || 'US',
      email: context.auth.token.email,
      business_type: 'company',
      metadata: {
        restaurantId,
        accountType: 'restaurant',
        createdBy: context.auth.uid
      }
    });

    await db.collection('restaurants').doc(restaurantId).update({
      stripeAccountId: account.id,
      stripeAccountCreated: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ Restaurant Stripe account created:', account.id);
    return { accountId: account.id, alreadyExists: false };
    
  } catch (error) {
    console.error('Error creating restaurant account:', error);
    throw new functions.https.HttpsError('internal', 'Failed to create restaurant account: ' + error.message);
  }
});

/**
 * Create Stripe Express Connect account for venue managers
 */
exports.createVenueAccount = functions.https.onCall(async ({ venueId }, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const venueDoc = await db.collection('venues').doc(venueId).get();
    if (!venueDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Venue not found');
    }

    const venue = venueDoc.data();
    
    if (venue.stripeAccountId) {
      return { accountId: venue.stripeAccountId, alreadyExists: true };
    }

    const account = await stripe.accounts.create({
      type: 'express',
      country: venue.country || 'US',
      email: context.auth.token.email,
      business_type: 'company',
      metadata: {
        venueId,
        accountType: 'venue',
        createdBy: context.auth.uid
      }
    });

    await db.collection('venues').doc(venueId).update({
      stripeAccountId: account.id,
      stripeAccountCreated: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ Venue Stripe account created:', account.id);
    return { accountId: account.id, alreadyExists: false };
    
  } catch (error) {
    console.error('Error creating venue account:', error);
    throw new functions.https.HttpsError('internal', 'Failed to create venue account: ' + error.message);
  }
});

/**
 * Create account onboarding link for Stripe Express
 */
exports.createAccountLink = functions.https.onCall(async ({ accountId, accountType = 'restaurant' }, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `https://yourapp.com/settings?reauth=true&type=${accountType}`,
      return_url: `https://yourapp.com/settings?connected=true&type=${accountType}`,
      type: 'account_onboarding'
    });

    return { url: link.url };
    
  } catch (error) {
    console.error('Error creating account link:', error);
    throw new functions.https.HttpsError('internal', 'Failed to create account link: ' + error.message);
  }
});

/**
 * Check Stripe account status
 */
exports.checkAccountStatus = functions.https.onCall(async ({ accountId }, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const account = await stripe.accounts.retrieve(accountId);
    
    return {
      id: account.id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      requirements: account.requirements,
      created: account.created
    };
    
  } catch (error) {
    console.error('Error checking account status:', error);
    throw new functions.https.HttpsError('internal', 'Failed to check account status: ' + error.message);
  }
});

// ============================================================================
// PAYMENT PROCESSING WITH THREE-WAY SPLITTING
// ============================================================================

/**
 * Create payment intent with automatic three-way splitting
 */
exports.createPaymentIntent = functions.https.onCall(async ({ 
  restaurantId, 
  totalCents,
  currency = 'usd',
  orderDetails = {}
}, context) => {
  try {
    console.log('🚀 Creating payment intent with three-way splitting...');
    console.log('📊 Input:', { restaurantId, totalCents, currency, orderDetails });

    // Validate inputs
    if (!restaurantId || !totalCents || totalCents <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid payment parameters');
    }

    // Load restaurant and venue data
    const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
    if (!restaurantDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Restaurant not found');
    }

    const restaurant = restaurantDoc.data();
    if (!restaurant.stripeAccountId) {
      throw new functions.https.HttpsError('failed-precondition', 'Restaurant not connected to Stripe');
    }

    // Calculate payment split
    const paymentSplit = await calculatePaymentSplit(restaurantId, totalCents);
    console.log('💰 Payment split:', paymentSplit);

    // Prepare transfers array
    const transfers = [];
    
    // Restaurant transfer (largest amount)
    transfers.push({
      destination: restaurant.stripeAccountId,
      amount: paymentSplit.restaurantAmount
    });

    // Venue transfer (if applicable)
    if (paymentSplit.venueEnabled && paymentSplit.venueFeeAmount > 0) {
      const venueDoc = await db.collection('venues').doc(paymentSplit.venueId).get();
      if (venueDoc.exists) {
        const venue = venueDoc.data();
        if (venue.stripeAccountId) {
          transfers.push({
            destination: venue.stripeAccountId,
            amount: paymentSplit.venueFeeAmount
          });
          console.log('🏢 Added venue transfer:', paymentSplit.venueFeeAmount);
        }
      }
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: currency.toLowerCase(),
      
      // Multiple transfers to different accounts
      transfer_data: transfers.length === 1 ? {
        destination: transfers[0].destination,
        amount: transfers[0].amount
      } : undefined,
      
      // For multiple transfers, we'll use separate transfer calls after payment
      
      metadata: {
        restaurantId,
        venueId: paymentSplit.venueId || '',
        platformFeeAmount: paymentSplit.platformFeeAmount.toString(),
        venueFeeAmount: paymentSplit.venueFeeAmount.toString(),
        restaurantAmount: paymentSplit.restaurantAmount.toString(),
        orderDetails: JSON.stringify(orderDetails),
        splitCalculatedAt: paymentSplit.calculatedAt
      }
    });

    // Store payment intent details for webhook processing
    await db.collection('payment_intents').doc(paymentIntent.id).set({
      paymentIntentId: paymentIntent.id,
      restaurantId,
      venueId: paymentSplit.venueId,
      paymentSplit,
      transfers,
      status: 'created',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ Payment intent created:', paymentIntent.id);
    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      paymentSplit: {
        platformFee: paymentSplit.platformFeeAmount / 100,
        venueFee: paymentSplit.venueFeeAmount / 100,
        restaurantAmount: paymentSplit.restaurantAmount / 100,
        venueEnabled: paymentSplit.venueEnabled
      }
    };

  } catch (error) {
    console.error('❌ Error creating payment intent:', error);
    throw new functions.https.HttpsError('internal', 'Failed to create payment intent: ' + error.message);
  }
});

/**
 * Handle successful payments and execute transfers
 */
exports.handlePaymentSuccess = functions.https.onCall(async ({ paymentIntentId }, context) => {
  try {
    console.log('🎉 Processing successful payment:', paymentIntentId);

    // Get payment intent data
    const paymentDoc = await db.collection('payment_intents').doc(paymentIntentId).get();
    if (!paymentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Payment intent not found');
    }

    const paymentData = paymentDoc.data();
    const { transfers, paymentSplit } = paymentData;

    // If we have multiple transfers, execute them separately
    if (transfers.length > 1) {
      console.log('💸 Executing multiple transfers...');
      
      for (const transfer of transfers) {
        try {
          const stripeTransfer = await stripe.transfers.create({
            amount: transfer.amount,
            currency: 'usd',
            destination: transfer.destination,
            metadata: {
              paymentIntentId,
              restaurantId: paymentData.restaurantId,
              venueId: paymentData.venueId || ''
            }
          });
          
          console.log('✅ Transfer created:', stripeTransfer.id, 'to', transfer.destination);
          
        } catch (transferError) {
          console.error('❌ Transfer failed:', transferError);
          // Continue with other transfers even if one fails
        }
      }
    }

    // Update payment status
    await db.collection('payment_intents').doc(paymentIntentId).update({
      status: 'completed',
      transfersExecuted: transfers.length,
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Create payment record for analytics
    await db.collection('payments').add({
      paymentIntentId,
      restaurantId: paymentData.restaurantId,
      venueId: paymentData.venueId,
      paymentSplit,
      status: 'completed',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ Payment processing completed');
    return { success: true, transfersExecuted: transfers.length };

  } catch (error) {
    console.error('❌ Error handling payment success:', error);
    throw new functions.https.HttpsError('internal', 'Failed to process payment: ' + error.message);
  }
});

// ============================================================================
// PAYMENT ANALYTICS & REPORTING
// ============================================================================

/**
 * Get payment analytics for restaurants
 */
exports.getRestaurantPayments = functions.https.onCall(async ({ 
  restaurantId, 
  startDate, 
  endDate, 
  limit = 50 
}, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    let query = db.collection('payments')
      .where('restaurantId', '==', restaurantId)
      .orderBy('createdAt', 'desc');

    if (startDate) {
      query = query.where('createdAt', '>=', new Date(startDate));
    }
    if (endDate) {
      query = query.where('createdAt', '<=', new Date(endDate));
    }

    const payments = await query.limit(limit).get();
    
    const results = payments.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString()
    }));

    return { payments: results, count: results.length };

  } catch (error) {
    console.error('Error getting restaurant payments:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get payments: ' + error.message);
  }
});

/**
 * Get payment analytics for venues
 */
exports.getVenuePayments = functions.https.onCall(async ({ 
  venueId, 
  startDate, 
  endDate, 
  limit = 50 
}, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

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
    
    const results = payments.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString()
    }));

    return { payments: results, count: results.length };

  } catch (error) {
    console.error('Error getting venue payments:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get payments: ' + error.message);
  }
});

/**
 * Get platform payment analytics (admin only)
 */
exports.getPlatformPayments = functions.https.onCall(async ({ 
  startDate, 
  endDate, 
  limit = 100 
}, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // TODO: Add admin role verification
    // const userDoc = await db.collection('users').doc(context.auth.uid).get();
    // if (!userDoc.data()?.role === 'admin') {
    //   throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    // }

    let query = db.collection('payments')
      .orderBy('createdAt', 'desc');

    if (startDate) {
      query = query.where('createdAt', '>=', new Date(startDate));
    }
    if (endDate) {
      query = query.where('createdAt', '<=', new Date(endDate));
    }

    const payments = await query.limit(limit).get();
    
    // Calculate platform totals
    let totalRevenue = 0;
    let totalPlatformFees = 0;
    let totalVenueFees = 0;
    let totalRestaurantPayouts = 0;

    const results = payments.docs.map(doc => {
      const data = doc.data();
      const split = data.paymentSplit || {};
      
      totalRevenue += (split.totalCents || 0) / 100;
      totalPlatformFees += (split.platformFeeAmount || 0) / 100;
      totalVenueFees += (split.venueFeeAmount || 0) / 100;
      totalRestaurantPayouts += (split.restaurantAmount || 0) / 100;

      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString()
      };
    });

    return { 
      payments: results, 
      count: results.length,
      totals: {
        totalRevenue,
        totalPlatformFees,
        totalVenueFees,
        totalRestaurantPayouts
      }
    };

  } catch (error) {
    console.error('Error getting platform payments:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get payments: ' + error.message);
  }
});

console.log('💰 Enhanced Payments API v2.0.0 loaded');
console.log('🏢 Features: Three-way splitting, VediAPI integration, Stripe Connect');
console.log('📊 Analytics: Restaurant, venue, and platform dashboards');
console.log('🔧 Protected margins: Your fees preserved from Stripe processing costs');
