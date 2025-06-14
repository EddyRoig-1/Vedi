const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe.secret);

admin.initializeApp();
const db = admin.firestore();

/**
 * Creates a Stripe Express Connect account for a restaurant
 */
exports.createConnectedAccount = functions.https.onCall(async ({ restaurantId }, context) => {
  try {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Load restaurant data from Firestore
    const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
    if (!restaurantDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Restaurant not found');
    }

    const restaurant = restaurantDoc.data();
    const { country = 'US' } = restaurant;

    // Create Stripe Express Connect account
    const account = await stripe.accounts.create({
      type: 'express',
      country,
      email: context.auth.token.email,
      business_type: 'company'
    });

    // Update restaurant document with Stripe account ID
    await db.collection('restaurants').doc(restaurantId).update({
      stripeAccountId: account.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { accountId: account.id };
  } catch (error) {
    console.error('Error creating connected account:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to create connected account');
  }
});

/**
 * Creates an account link for Stripe Express onboarding
 */
exports.createAccountLink = functions.https.onCall(async ({ restaurantId }, context) => {
  try {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Load Stripe account ID from restaurant document
    const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
    if (!restaurantDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Restaurant not found');
    }

    const { stripeAccountId } = restaurantDoc.data();
    if (!stripeAccountId) {
      throw new functions.https.HttpsError('failed-precondition', 'No Stripe account found for restaurant');
    }

    // Create account link for onboarding
    const link = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: 'https://your.app/settings?reauth=true',
      return_url: 'https://your.app/settings?connected=true',
      type: 'account_onboarding'
    });

    return { url: link.url };
  } catch (error) {
    console.error('Error creating account link:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to create account link');
  }
});

/**
 * Creates a payment intent with proper fee calculation and gross-up
 * UPDATED: Uses only database-stored fee configurations (no more stripe-fees.json)
 */
exports.createPaymentIntent = functions.https.onCall(async ({ 
  restaurantId, 
  subtotalCents, 
  currency, 
  cardBrand = 'standard', 
  chargeCurrency 
}, context) => {
  try {
    console.log('🔄 Processing payment intent for restaurant:', restaurantId);
    console.log('💰 Subtotal:', subtotalCents, 'cents');

    // Load restaurant and fee configuration data in parallel
    const [restaurantDoc, feeConfigDoc] = await Promise.all([
      db.collection('restaurants').doc(restaurantId).get(),
      db.collection('feeConfigurations').doc(restaurantId).get()
    ]);

    if (!restaurantDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Restaurant not found');
    }

    // If no specific fee config exists, try to get default configuration
    let feeConfig;
    if (!feeConfigDoc.exists) {
      console.log('⚠️ No specific fee config found, checking for default...');
      const defaultFeeDoc = await db.collection('feeConfigurations').doc('default').get();
      
      if (defaultFeeDoc.exists) {
        feeConfig = defaultFeeDoc.data();
        console.log('✅ Using default fee configuration');
      } else {
        // Fallback to hardcoded defaults if no config exists at all
        console.log('⚠️ No fee configuration found, using fallback defaults');
        feeConfig = {
          feeType: 'hybrid',
          serviceFeeFixed: 0.50,
          serviceFeePercentage: 3,
          taxRate: 8.5,
          stripeFeePercentage: 2.9,
          stripeFlatFee: 30
        };
      }
    } else {
      feeConfig = feeConfigDoc.data();
      console.log('✅ Using restaurant-specific fee configuration');
    }

    const restaurant = restaurantDoc.data();
    const { stripeAccountId } = restaurant;
    
    if (!stripeAccountId) {
      throw new functions.https.HttpsError('failed-precondition', 'Restaurant not connected to Stripe');
    }

    // Get Stripe fee configuration from database (not JSON file)
    const stripePct = feeConfig.stripeFeePercentage || 2.9; // Default 2.9%
    const stripeFlatCents = feeConfig.stripeFlatFee || 30; // Default 30 cents

    console.log('💳 Using Stripe fees from database:', {
      percentage: stripePct + '%',
      flatFee: stripeFlatCents + '¢'
    });

    // FIXED: Calculate desired net revenue (service fee) with proper percentage handling
    let serviceFeeAmount = 0;
    
    if (feeConfig.feeType === 'fixed') {
      serviceFeeAmount = (feeConfig.serviceFeeFixed || 0) * 100; // Convert to cents
    } else if (feeConfig.feeType === 'percentage') {
      serviceFeeAmount = subtotalCents * ((feeConfig.serviceFeePercentage || 0) / 100);
    } else if (feeConfig.feeType === 'hybrid') {
      serviceFeeAmount = (feeConfig.serviceFeeFixed || 0) * 100 + 
                        subtotalCents * ((feeConfig.serviceFeePercentage || 0) / 100);
    }

    const desiredNetCents = Math.round(serviceFeeAmount);

    console.log('🧮 Service fee calculation:', {
      feeType: feeConfig.feeType,
      serviceFeeFixed: feeConfig.serviceFeeFixed,
      serviceFeePercentage: feeConfig.serviceFeePercentage,
      calculatedServiceFeeCents: desiredNetCents
    });

    // Gross-up calculation to account for Stripe fees
    // Formula: (desired_net + stripe_flat) / (1 - stripe_percentage/100)
    const appFee = Math.round((desiredNetCents + stripeFlatCents) / (1 - stripePct / 100));

    // Calculate tax (also fix percentage handling here)
    const taxRate = feeConfig.taxRate || 8.5; // Default 8.5%
    const taxCents = Math.round(subtotalCents * (taxRate / 100));

    // Calculate total payment amount
    const totalCents = subtotalCents + taxCents + appFee;

    // Calculate what actually goes to Stripe vs what you keep
    const actualStripeFee = Math.round(appFee * (stripePct / 100) + stripeFlatCents);
    const actualNetRevenue = appFee - actualStripeFee;

    console.log('📊 Final fee breakdown:', {
      subtotalCents,
      desiredNetCents,
      appFee,
      actualStripeFee,
      actualNetRevenue,
      taxCents,
      totalCents,
      stripeFeeConfig: {
        percentage: stripePct,
        flatCents: stripeFlatCents
      }
    });

    // Validation check
    if (totalCents <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid payment amount calculated');
    }

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: currency.toLowerCase(),
      application_fee_amount: appFee,
      transfer_data: {
        destination: stripeAccountId
      },
      metadata: {
        restaurantId,
        subtotal: subtotalCents.toString(),
        serviceFee: desiredNetCents.toString(),
        tax: taxCents.toString()
      }
    });

    console.log('✅ Payment intent created successfully:', paymentIntent.id);

    // Return client secret and detailed breakdown for UI display
    return {
      clientSecret: paymentIntent.client_secret,
      breakdown: {
        subtotalCents,
        taxCents,
        serviceFee: appFee, // This is the total app fee (what customer pays)
        originalServiceFee: desiredNetCents, // This is what you actually want to keep
        stripeFee: actualStripeFee, // This is what goes to Stripe
        netRevenue: actualNetRevenue, // This is what you actually keep after Stripe fees
        stripePct,
        stripeFlatCents,
        totalCents,
        feeBreakdown: {
          type: feeConfig.feeType,
          fixed: feeConfig.serviceFeeFixed,
          percentage: feeConfig.serviceFeePercentage,
          taxRate: taxRate
        }
      }
    };

  } catch (error) {
    console.error('❌ Error creating payment intent:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to create payment intent: ' + error.message);
  }
});
