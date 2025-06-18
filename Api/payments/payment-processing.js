// payments/payment_processing.js - Payment Processing with Three-Way Splitting

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

function withTracking(methodName, originalMethod) {
  return async function(...args) {
    const startTime = Date.now();
    try {
      const result = await originalMethod.apply(this, args);
      const responseTime = Date.now() - startTime;
      await trackAPICall(methodName, responseTime, true, {
        args: args.length,
        resultType: typeof result
      });
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await trackAPICall(methodName, responseTime, false, {
        error: error.message,
        errorCode: error.code
      });
      throw error;
    }
  };
}

// ============================================================================
// PAYMENT PROCESSING API (EXACTLY LIKE YOUR PATTERN)
// ============================================================================

const PaymentAPI = {

  /**
   * Get fee configuration for a restaurant (integrates with your VediAPI system)
   */
  async getFeeConfig(restaurantId) {
    try {
      const restaurantDoc = await getFirebaseDb().collection('restaurants').doc(restaurantId).get();
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
  },

  /**
   * Calculate three-way payment splitting with protected margins
   */
  async calculatePaymentSplit(restaurantId, totalCents) {
    try {
      console.log('🧮 Calculating payment split for:', { restaurantId, totalCents });
      
      const feeConfig = await this.getFeeConfig(restaurantId);
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
  },

  /**
   * Create Stripe Express Connect account for restaurant owners
   */
  createRestaurantAccount: withTracking('createRestaurantAccount', async function({ restaurantId }) {
    try {
      if (!getFirebaseAuth().currentUser) {
        throw new Error('User must be authenticated');
      }

      const restaurantDoc = await getFirebaseDb().collection('restaurants').doc(restaurantId).get();
      if (!restaurantDoc.exists) {
        throw new Error('Restaurant not found');
      }

      const restaurant = restaurantDoc.data();
      
      // Check if already has Stripe account
      if (restaurant.stripeAccountId) {
        return { accountId: restaurant.stripeAccountId, alreadyExists: true };
      }

      // Create Stripe account (would be actual Stripe API call in production)
      const account = {
        id: 'acct_' + Math.random().toString(36).substring(2, 15),
        type: 'express',
        country: restaurant.country || 'US',
        email: getFirebaseAuth().currentUser.email,
        business_type: 'company',
        metadata: {
          restaurantId,
          accountType: 'restaurant',
          createdBy: getFirebaseAuth().currentUser.uid
        }
      };

      await getFirebaseDb().collection('restaurants').doc(restaurantId).update({
        stripeAccountId: account.id,
        stripeAccountCreated: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log('✅ Restaurant Stripe account created:', account.id);
      return { accountId: account.id, alreadyExists: false };
      
    } catch (error) {
      console.error('Error creating restaurant account:', error);
      throw error;
    }
  }),

  /**
   * Create Stripe Express Connect account for venue managers
   */
  createVenueAccount: withTracking('createVenueAccount', async function({ venueId }) {
    try {
      if (!getFirebaseAuth().currentUser) {
        throw new Error('User must be authenticated');
      }

      const venueDoc = await getFirebaseDb().collection('venues').doc(venueId).get();
      if (!venueDoc.exists) {
        throw new Error('Venue not found');
      }

      const venue = venueDoc.data();
      
      if (venue.stripeAccountId) {
        return { accountId: venue.stripeAccountId, alreadyExists: true };
      }

      // Create Stripe account (would be actual Stripe API call in production)
      const account = {
        id: 'acct_' + Math.random().toString(36).substring(2, 15),
        type: 'express',
        country: venue.country || 'US',
        email: getFirebaseAuth().currentUser.email,
        business_type: 'company',
        metadata: {
          venueId,
          accountType: 'venue',
          createdBy: getFirebaseAuth().currentUser.uid
        }
      };

      await getFirebaseDb().collection('venues').doc(venueId).update({
        stripeAccountId: account.id,
        stripeAccountCreated: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log('✅ Venue Stripe account created:', account.id);
      return { accountId: account.id, alreadyExists: false };
      
    } catch (error) {
      console.error('Error creating venue account:', error);
      throw error;
    }
  }),

  /**
   * Create account onboarding link for Stripe Express
   */
  createAccountLink: withTracking('createAccountLink', async function({ accountId, accountType = 'restaurant' }) {
    try {
      if (!getFirebaseAuth().currentUser) {
        throw new Error('User must be authenticated');
      }

      // Create account link (would be actual Stripe API call in production)
      const link = {
        url: `https://yourapp.com/settings?reauth=true&type=${accountType}&account=${accountId}`,
        refresh_url: `https://yourapp.com/settings?reauth=true&type=${accountType}`,
        return_url: `https://yourapp.com/settings?connected=true&type=${accountType}`,
        type: 'account_onboarding'
      };

      return { url: link.url };
      
    } catch (error) {
      console.error('Error creating account link:', error);
      throw error;
    }
  }),

  /**
   * Check Stripe account status
   */
  checkAccountStatus: withTracking('checkAccountStatus', async function({ accountId }) {
    try {
      if (!getFirebaseAuth().currentUser) {
        throw new Error('User must be authenticated');
      }

      // Retrieve account status (would be actual Stripe API call in production)
      const account = {
        id: accountId,
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        requirements: {},
        created: Math.floor(Date.now() / 1000)
      };
      
      return account;
      
    } catch (error) {
      console.error('Error checking account status:', error);
      throw error;
    }
  }),

  /**
   * Create payment intent with automatic three-way splitting
   */
  createPaymentIntent: withTracking('createPaymentIntent', async function({ 
    restaurantId, 
    totalCents,
    currency = 'usd',
    orderDetails = {}
  }) {
    try {
      console.log('🚀 Creating payment intent with three-way splitting...');
      console.log('📊 Input:', { restaurantId, totalCents, currency, orderDetails });

      // Validate inputs
      if (!restaurantId || !totalCents || totalCents <= 0) {
        throw new Error('Invalid payment parameters');
      }

      // Load restaurant and venue data
      const restaurantDoc = await getFirebaseDb().collection('restaurants').doc(restaurantId).get();
      if (!restaurantDoc.exists) {
        throw new Error('Restaurant not found');
      }

      const restaurant = restaurantDoc.data();
      if (!restaurant.stripeAccountId) {
        throw new Error('Restaurant not connected to Stripe');
      }

      // Calculate payment split
      const paymentSplit = await this.calculatePaymentSplit(restaurantId, totalCents);
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
        const venueDoc = await getFirebaseDb().collection('venues').doc(paymentSplit.venueId).get();
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

      // Create payment intent (would be actual Stripe API call in production)
      const paymentIntent = {
        id: 'pi_' + Math.random().toString(36).substring(2, 15),
        amount: totalCents,
        currency: currency.toLowerCase(),
        client_secret: 'pi_' + Math.random().toString(36).substring(2, 15) + '_secret_' + Math.random().toString(36).substring(2, 15),
        
        // Multiple transfers to different accounts
        transfer_data: transfers.length === 1 ? {
          destination: transfers[0].destination,
          amount: transfers[0].amount
        } : undefined,
        
        metadata: {
          restaurantId,
          venueId: paymentSplit.venueId || '',
          platformFeeAmount: paymentSplit.platformFeeAmount.toString(),
          venueFeeAmount: paymentSplit.venueFeeAmount.toString(),
          restaurantAmount: paymentSplit.restaurantAmount.toString(),
          orderDetails: JSON.stringify(orderDetails),
          splitCalculatedAt: paymentSplit.calculatedAt
        }
      };

      // Store payment intent details for webhook processing
      await getFirebaseDb().collection('payment_intents').doc(paymentIntent.id).set({
        paymentIntentId: paymentIntent.id,
        restaurantId,
        venueId: paymentSplit.venueId,
        paymentSplit,
        transfers,
        status: 'created',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
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
      throw error;
    }
  }),

  /**
   * Handle successful payments and execute transfers
   */
  handlePaymentSuccess: withTracking('handlePaymentSuccess', async function({ paymentIntentId }) {
    try {
      console.log('🎉 Processing successful payment:', paymentIntentId);

      // Get payment intent data
      const paymentDoc = await getFirebaseDb().collection('payment_intents').doc(paymentIntentId).get();
      if (!paymentDoc.exists) {
        throw new Error('Payment intent not found');
      }

      const paymentData = paymentDoc.data();
      const { transfers, paymentSplit } = paymentData;

      // If we have multiple transfers, execute them separately
      if (transfers.length > 1) {
        console.log('💸 Executing multiple transfers...');
        
        for (const transfer of transfers) {
          try {
            // Create transfer (would be actual Stripe API call in production)
            const stripeTransfer = {
              id: 'tr_' + Math.random().toString(36).substring(2, 15),
              amount: transfer.amount,
              currency: 'usd',
              destination: transfer.destination,
              metadata: {
                paymentIntentId,
                restaurantId: paymentData.restaurantId,
                venueId: paymentData.venueId || ''
              }
            };
            
            console.log('✅ Transfer created:', stripeTransfer.id, 'to', transfer.destination);
            
          } catch (transferError) {
            console.error('❌ Transfer failed:', transferError);
            // Continue with other transfers even if one fails
          }
        }
      }

      // Update payment status
      await getFirebaseDb().collection('payment_intents').doc(paymentIntentId).update({
        status: 'completed',
        transfersExecuted: transfers.length,
        completedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Create payment record for analytics
      await getFirebaseDb().collection('payments').add({
        paymentIntentId,
        restaurantId: paymentData.restaurantId,
        venueId: paymentData.venueId,
        paymentSplit,
        status: 'completed',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log('✅ Payment processing completed');
      return { success: true, transfersExecuted: transfers.length };

    } catch (error) {
      console.error('❌ Error handling payment success:', error);
      throw error;
    }
  }),

  /**
   * Get payment analytics for restaurants
   */
  getRestaurantPayments: withTracking('getRestaurantPayments', async function({ 
    restaurantId, 
    startDate, 
    endDate, 
    limit = 50 
  }) {
    try {
      if (!getFirebaseAuth().currentUser) {
        throw new Error('User must be authenticated');
      }

      let query = getFirebaseDb().collection('payments')
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
      throw error;
    }
  }),

  /**
   * Get payment analytics for venues
   */
  getVenuePayments: withTracking('getVenuePayments', async function({ 
    venueId, 
    startDate, 
    endDate, 
    limit = 50 
  }) {
    try {
      if (!getFirebaseAuth().currentUser) {
        throw new Error('User must be authenticated');
      }

      let query = getFirebaseDb().collection('payments')
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
      throw error;
    }
  }),

  /**
   * Get platform payment analytics (admin only)
   */
  getPlatformPayments: withTracking('getPlatformPayments', async function({ 
    startDate, 
    endDate, 
    limit = 100 
  }) {
    try {
      if (!getFirebaseAuth().currentUser) {
        throw new Error('User must be authenticated');
      }

      // TODO: Add admin role verification

      let query = getFirebaseDb().collection('payments')
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
      throw error;
    }
  })
};

// Make available globally (EXACTLY LIKE YOUR PATTERN)
window.PaymentAPI = PaymentAPI;

console.log('💰 PaymentAPI loaded successfully');
console.log('🔧 Available payment methods:', Object.keys(PaymentAPI).length, 'total methods');
console.log('🚀 Ready for payment processing with three-way splitting!');