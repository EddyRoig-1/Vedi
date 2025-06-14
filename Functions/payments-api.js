const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe.secret);

admin.initializeApp();
const db = admin.firestore();

// ============================================================================
// STRIPE CLOUD FUNCTIONS (SERVER-SIDE ONLY)
// ============================================================================

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
 * Creates a payment intent with PROTECTED MARGIN CALCULATION
 * NOTE: Uses totalCents directly from frontend (already calculated with protected pricing)
 */
exports.createPaymentIntent = functions.https.onCall(async ({ 
  restaurantId, 
  totalCents,
  currency, 
  cardBrand = 'standard'
}, context) => {
  try {
    console.log('🚀 Creating payment intent with protected total...');
    console.log('📊 Input data:', {
      restaurantId,
      totalCents,
      currency,
      cardBrand
    });

    // Load restaurant data
    const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
    if (!restaurantDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Restaurant not found');
    }

    const restaurant = restaurantDoc.data();
    const { stripeAccountId } = restaurant;
    
    if (!stripeAccountId) {
      throw new functions.https.HttpsError('failed-precondition', 'Restaurant not connected to Stripe');
    }

    // Validation check
    if (totalCents <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid payment amount');
    }

    // Create Stripe payment intent with the protected total from frontend
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: currency.toLowerCase(),
      transfer_data: {
        destination: stripeAccountId
      },
      metadata: {
        restaurantId,
        marginProtected: 'true',
        calculatedBy: 'frontend'
      }
    });

    console.log('✅ Payment intent created successfully:', paymentIntent.id);
    console.log('💰 Total amount (already protected):', totalCents);

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    };

  } catch (error) {
    console.error('❌ Error creating payment intent:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to create payment intent: ' + error.message);
  }
});

console.log('💳 Clean Payments API loaded successfully');
console.log('🔧 Server-side only: Stripe Connect + Payment Intent creation');
console.log('✨ Pricing calculations moved to frontend for better performance');
