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
 * Creates a payment intent with PROTECTED MARGIN CALCULATION
 * Input: subtotalCents (from checkout)
 * Output: Protected total that ensures your margin is preserved
 */
exports.createPaymentIntent = functions.https.onCall(async ({ 
  restaurantId, 
  subtotalCents, 
  currency, 
  cardBrand = 'standard', 
  chargeCurrency 
}, context) => {
  try {
    console.log('🚀 Processing protected payment calculation...');
    console.log('📊 Input data:', {
      restaurantId,
      subtotalCents,
      currency,
      cardBrand
    });

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

    console.log('⚙️ Fee configuration loaded:', {
      feeType: feeConfig.feeType,
      serviceFeeFixed: feeConfig.serviceFeeFixed,
      serviceFeePercentage: feeConfig.serviceFeePercentage,
      taxRate: feeConfig.taxRate,
      stripeFeePercentage: feeConfig.stripeFeePercentage,
      stripeFlatFee: feeConfig.stripeFlatFee
    });

    // STEP 1: Calculate subtotal in dollars
    const subtotal = subtotalCents / 100;
    console.log('💰 Subtotal:', subtotal);

    // STEP 2: Calculate desired service fee (what you want to keep)
    let desiredServiceFee = 0;
    if (feeConfig.feeType === 'fixed') {
      desiredServiceFee = feeConfig.serviceFeeFixed || 0;
    } else if (feeConfig.feeType === 'percentage') {
      const percentage = (feeConfig.serviceFeePercentage || 0) / 100;
      desiredServiceFee = subtotal * percentage;
    } else if (feeConfig.feeType === 'hybrid') {
      const percentage = (feeConfig.serviceFeePercentage || 0) / 100;
      desiredServiceFee = (feeConfig.serviceFeeFixed || 0) + (subtotal * percentage);
    }

    console.log('🎯 Desired service fee (what you want to keep):', desiredServiceFee);

    // STEP 3: Calculate tax
    const taxRate = (feeConfig.taxRate || 8.5) / 100;
    const taxAmount = subtotal * taxRate;
    console.log('🏛️ Tax calculation:', {
      rate: (taxRate * 100).toFixed(1) + '%',
      amount: taxAmount
    });

    // STEP 4: Calculate base amount you want to keep after payment
    const baseAmount = subtotal + taxAmount + desiredServiceFee;
    console.log('📦 Base amount to protect:', baseAmount);

    // STEP 5: Get Stripe fees for this restaurant from database
    const stripePct = (feeConfig.stripeFeePercentage || 2.9) / 100; // Convert to decimal
    const stripeFlatCents = feeConfig.stripeFlatFee || 30; // In cents
    const stripeFlat = stripeFlatCents / 100; // Convert to dollars

    console.log('💳 Stripe fees for this restaurant:', {
      percentage: (stripePct * 100).toFixed(1) + '%',
      flatFee: '$' + stripeFlat.toFixed(2)
    });

    // STEP 6: GROSS-UP FORMULA - Calculate what customer needs to pay
    // Formula: (baseAmount + stripeFlat) / (1 - stripePct)
    const customerTotal = (baseAmount + stripeFlat) / (1 - stripePct);

    console.log('🧮 Gross-up calculation:');
    console.log('   Formula: (' + baseAmount + ' + ' + stripeFlat + ') / (1 - ' + stripePct + ')');
    console.log('   Customer pays:', customerTotal);

    // STEP 7: Verify the math works
    const actualStripeTotal = (customerTotal * stripePct) + stripeFlat;
    const actualNetReceived = customerTotal - actualStripeTotal;
    
    console.log('🔍 Verification:');
    console.log('   Customer pays:', customerTotal);
    console.log('   Stripe takes:', actualStripeTotal);
    console.log('   You receive:', actualNetReceived);
    console.log('   Target was:', baseAmount);
    console.log('   Difference:', Math.abs(actualNetReceived - baseAmount));

    // STEP 8: Calculate what shows as "Service Fee" to customer
    const displayedServiceFee = customerTotal - subtotal - taxAmount;
    
    // STEP 9: Calculate dynamic service fee percentage for display
    const serviceFeePercentage = (displayedServiceFee / subtotal) * 100;

    console.log('📊 Customer-facing breakdown:');
    console.log('   Subtotal:', subtotal);
    console.log('   Tax:', taxAmount);
    console.log('   Displayed Service Fee:', displayedServiceFee);
    console.log('   Service Fee %:', serviceFeePercentage.toFixed(1) + '%');
    console.log('   Total:', customerTotal);

    // STEP 10: Convert to cents for Stripe
    const totalCents = Math.round(customerTotal * 100);
    const subtotalCentsCalc = Math.round(subtotal * 100);
    const taxCents = Math.round(taxAmount * 100);
    const serviceFeCents = Math.round(displayedServiceFee * 100);
    const desiredServiceFeeCents = Math.round(desiredServiceFee * 100);

    // STEP 11: Calculate application fee (what goes to your platform)
    // This should be the displayed service fee since that includes the gross-up
    const applicationFeeCents = serviceFeCents;

    console.log('💰 Final amounts in cents:');
    console.log('   Total charge:', totalCents);
    console.log('   Application fee:', applicationFeeCents);
    console.log('   To restaurant:', totalCents - applicationFeeCents);

    // Validation check
    if (totalCents <= 0 || applicationFeeCents < 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid payment amounts calculated');
    }

    // STEP 12: Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: currency.toLowerCase(),
      application_fee_amount: applicationFeeCents,
      transfer_data: {
        destination: stripeAccountId
      },
      metadata: {
        restaurantId,
        subtotal: subtotalCentsCalc.toString(),
        tax: taxCents.toString(),
        serviceFee: serviceFeCents.toString(),
        desiredServiceFee: desiredServiceFeeCents.toString(),
        marginProtected: 'true'
      }
    });

    console.log('✅ Payment intent created successfully:', paymentIntent.id);
    console.log('🛡️ Margin protection applied - you will receive exactly:', desiredServiceFee);

    // STEP 13: Return client secret and detailed breakdown
    return {
      clientSecret: paymentIntent.client_secret,
      breakdown: {
        // Customer-facing amounts
        subtotalCents: subtotalCentsCalc,
        taxCents: taxCents,
        serviceFeCents: serviceFeCents, // What customer pays as "service fee"
        totalCents: totalCents,
        
        // Behind-the-scenes amounts
        desiredServiceFeeCents: desiredServiceFeeCents, // What you actually wanted
        actualServiceFeeCents: serviceFeCents, // What customer pays (includes gross-up)
        marginProtectionApplied: serviceFeCents - desiredServiceFeeCents, // Gross-up amount
        
        // Display information
        serviceFeePercentage: serviceFeePercentage,
        taxRate: taxRate * 100,
        
        // Configuration used
        feeType: feeConfig.feeType,
        stripeFeePercentage: stripePct * 100,
        stripeFlatFee: stripeFlatCents,
        
        // Verification data
        verification: {
          customerPays: totalCents,
          stripeTakes: Math.round(actualStripeTotal * 100),
          youReceive: Math.round(actualNetReceived * 100),
          targetWas: Math.round(baseAmount * 100)
        }
      }
    };

  } catch (error) {
    console.error('❌ Error creating protected payment intent:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to create payment intent: ' + error.message);
  }
});

/**
 * FIXED: Helper function to calculate protected pricing with CORS support
 * Used for testing or price quotes without creating payment intent
 */
exports.calculateProtectedPricing = functions.https.onCall(async ({ 
  restaurantId, 
  subtotalCents 
}, context) => {
  try {
    console.log('🧮 Calculating protected pricing quote...');
    console.log('📊 Input:', { restaurantId, subtotalCents });
    
    // Load fee configuration from database
    const [feeConfigDoc] = await Promise.all([
      db.collection('feeConfigurations').doc(restaurantId).get()
    ]);

    let feeConfig;
    if (!feeConfigDoc.exists) {
      console.log('⚠️ No restaurant-specific config, checking default...');
      const defaultFeeDoc = await db.collection('feeConfigurations').doc('default').get();
      feeConfig = defaultFeeDoc.exists ? defaultFeeDoc.data() : {
        feeType: 'hybrid',
        serviceFeeFixed: 0.50,
        serviceFeePercentage: 3,
        taxRate: 8.5,
        stripeFeePercentage: 2.9,
        stripeFlatFee: 30
      };
    } else {
      feeConfig = feeConfigDoc.data();
      console.log('✅ Using restaurant-specific fee configuration');
    }

    console.log('⚙️ Fee config:', feeConfig);

    const subtotal = subtotalCents / 100;
    
    // Calculate desired service fee
    let desiredServiceFee = 0;
    if (feeConfig.feeType === 'fixed') {
      desiredServiceFee = feeConfig.serviceFeeFixed || 0;
    } else if (feeConfig.feeType === 'percentage') {
      const percentage = (feeConfig.serviceFeePercentage || 0) / 100;
      desiredServiceFee = subtotal * percentage;
    } else if (feeConfig.feeType === 'hybrid') {
      const percentage = (feeConfig.serviceFeePercentage || 0) / 100;
      desiredServiceFee = (feeConfig.serviceFeeFixed || 0) + (subtotal * percentage);
    }

    // Calculate tax
    const taxRate = (feeConfig.taxRate || 8.5) / 100;
    const taxAmount = subtotal * taxRate;

    // Calculate base amount
    const baseAmount = subtotal + taxAmount + desiredServiceFee;

    // Get Stripe fees
    const stripePct = (feeConfig.stripeFeePercentage || 2.9) / 100;
    const stripeFlat = (feeConfig.stripeFlatFee || 30) / 100;

    // Gross-up calculation
    const customerTotal = (baseAmount + stripeFlat) / (1 - stripePct);
    const displayedServiceFee = customerTotal - subtotal - taxAmount;
    const serviceFeePercentage = (displayedServiceFee / subtotal) * 100;

    console.log('✅ Calculation complete:', {
      subtotal,
      taxAmount,
      displayedServiceFee,
      customerTotal,
      taxRate: taxRate * 100,
      serviceFeePercentage
    });

    return {
      quote: {
        subtotalCents: Math.round(subtotal * 100),
        taxCents: Math.round(taxAmount * 100),
        serviceFeCents: Math.round(displayedServiceFee * 100),
        totalCents: Math.round(customerTotal * 100),
        serviceFeePercentage: serviceFeePercentage,
        taxRate: taxRate * 100,
        desiredServiceFeeCents: Math.round(desiredServiceFee * 100),
        stripeFeePercentage: stripePct * 100,
        stripeFlatFee: (feeConfig.stripeFlatFee || 30),
        marginProtected: true
      }
    };

  } catch (error) {
    console.error('❌ Error calculating protected pricing quote:', error);
    throw new functions.https.HttpsError('internal', 'Failed to calculate pricing quote: ' + error.message);
  }
});

console.log('💳 Protected Margin Payment API loaded successfully');
console.log('🛡️ Features: Margin protection, dynamic fees, secure gross-up calculation');
console.log('📊 All calculations done securely in backend');
console.log('🎯 Your service fee margin is always protected from Stripe fees');
console.log('🔧 CORS enabled for web app access');
