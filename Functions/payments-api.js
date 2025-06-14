const functions = require('firebase-functions');
const admin = require('firebase-admin');
const path = require('path');
const countryRates = require(path.join(__dirname, 'stripe-fees.json'));
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
 */
exports.createPaymentIntent = functions.https.onCall(async ({ 
  restaurantId, 
  subtotalCents, 
  currency, 
  cardBrand = 'standard', 
  chargeCurrency 
}, context) => {
  try {
    // Load restaurant and fee configuration data in parallel
    const [restaurantDoc, feeConfigDoc] = await Promise.all([
      db.collection('restaurants').doc(restaurantId).get(),
      db.collection('feeConfigurations').doc(restaurantId).get()
    ]);

    if (!restaurantDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Restaurant not found');
    }
    if (!feeConfigDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Fee configuration not found');
    }

    const restaurant = restaurantDoc.data();
    const feeConfig = feeConfigDoc.data();
    
    const { country = 'US', stripeAccountId } = restaurant;
    
    if (!stripeAccountId) {
      throw new functions.https.HttpsError('failed-precondition', 'Restaurant not connected to Stripe');
    }

    // Determine Stripe fee tier based on country and card details
    let stripeTier;
    const countryRate = countryRates[country];
    
    if (!countryRate) {
      throw new functions.https.HttpsError('invalid-argument', `Unsupported country: ${country}`);
    }

    // Handle UK's complex tier system
    if (country === 'GB') {
      if (cardBrand === 'premium') {
        stripeTier = countryRate.premium;
      } else if (chargeCurrency && chargeCurrency !== currency) {
        // EEA or international based on currency
        stripeTier = countryRate.eea || countryRate.international;
      } else {
        stripeTier = countryRate.standard;
      }
    } else {
      // For other countries, use domestic vs international
      if (chargeCurrency && chargeCurrency !== currency) {
        stripeTier = countryRate.international;
      } else {
        stripeTier = countryRate.domestic || countryRate.standard;
      }
    }

    if (!stripeTier) {
      throw new functions.https.HttpsError('internal', 'Could not determine appropriate Stripe fee tier');
    }

    // Calculate desired net revenue (service fee)
    const desiredNetCents = Math.round(
      (feeConfig.serviceFeeFixed || 0) * 100 + 
      subtotalCents * ((feeConfig.serviceFeePercentage || 0) / 100)
    );

    // Gross-up calculation to account for Stripe fees
    const stripePct = stripeTier.percentage;
    const stripeFlatCents = stripeTier.flat;
    const appFee = Math.round((desiredNetCents + stripeFlatCents) / (1 - stripePct / 100));

    // Calculate tax
    const taxCents = Math.round(subtotalCents * ((feeConfig.taxRate || 0) / 100));

    // Calculate total payment amount
    const totalCents = subtotalCents + taxCents + appFee;

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency,
      application_fee_amount: appFee,
      transfer_data: {
        destination: stripeAccountId
      }
    });

    // Return client secret and breakdown for UI display
    return {
      clientSecret: paymentIntent.client_secret,
      breakdown: {
        subtotalCents,
        taxCents,
        appFee,
        stripePct,
        stripeFlatCents,
        totalCents
      }
    };
  } catch (error) {
    console.error('Error creating payment intent:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to create payment intent');
  }
});
