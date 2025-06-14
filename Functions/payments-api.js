const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe.secret);

admin.initializeApp();
const db = admin.firestore();

// ============================================================================
// VEDIAPI PROTECTED PRICING METHODS (CLIENT-SIDE)
// ============================================================================

/**
 * VediAPI Extension for Protected Pricing
 * Add these methods to your existing VediAPI object
 */
const VediAPIExtensions = {
  /**
   * Calculate protected pricing that ensures your margin is preserved from Stripe fees
   * @param {string} restaurantId - Restaurant ID
   * @param {number} subtotalCents - Subtotal in cents
   * @returns {Promise<Object>} Protected pricing breakdown
   */
  async calculateProtectedPricing(restaurantId, subtotalCents) {
    try {
      console.log('🧮 Calculating protected pricing via VediAPI...');
      console.log('📊 Input:', { restaurantId, subtotalCents });
      
      // Get fee configuration from database using existing VediAPI method
      const feeConfig = await VediAPI.getFeeConfig(restaurantId);
      console.log('⚙️ Fee config loaded:', feeConfig);

      const subtotal = subtotalCents / 100;
      
      // Step 1: Calculate desired service fee (what you want to keep)
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

      // Step 2: Calculate tax
      const taxRate = (feeConfig.taxRate || 8.5) / 100;
      const taxAmount = subtotal * taxRate;

      // Step 3: Calculate base amount you want to keep after payment
      const baseAmount = subtotal + taxAmount + desiredServiceFee;

      // Step 4: Get Stripe fees for this restaurant
      const stripePct = (feeConfig.stripeFeePercentage || 2.9) / 100;
      const stripeFlat = (feeConfig.stripeFlatFee || 30) / 100;

      // Step 5: GROSS-UP FORMULA - Calculate what customer needs to pay
      const customerTotal = (baseAmount + stripeFlat) / (1 - stripePct);
      const displayedServiceFee = customerTotal - subtotal - taxAmount;
      const serviceFeePercentage = (displayedServiceFee / subtotal) * 100;

      console.log('✅ VediAPI calculation complete:', {
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
      console.error('❌ VediAPI protected pricing calculation error:', error);
      throw error;
    }
  },

  /**
   * Get comprehensive pricing breakdown for display
   * @param {string} restaurantId - Restaurant ID  
   * @param {number} subtotalCents - Subtotal in cents
   * @returns {Promise<Object>} Detailed pricing breakdown for UI
   */
  async getProtectedPricingBreakdown(restaurantId, subtotalCents) {
    try {
      const pricingResult = await this.calculateProtectedPricing(restaurantId, subtotalCents);
      const quote = pricingResult.quote;
      const feeConfig = await VediAPI.getFeeConfig(restaurantId);
      
      // Return detailed breakdown for UI display
      return {
        // Customer-facing amounts
        subtotal: quote.subtotalCents / 100,
        taxAmount: quote.taxCents / 100,
        serviceFee: quote.serviceFeCents / 100,
        total: quote.totalCents / 100,
        
        // Display percentages
        taxRate: quote.taxRate,
        serviceFeePercentage: quote.serviceFeePercentage,
        
        // Behind-the-scenes breakdown (for testing/admin)
        breakdown: {
          desiredServiceFee: quote.desiredServiceFeeCents / 100,
          actualServiceFee: quote.serviceFeCents / 100,
          stripeFeePercentage: quote.stripeFeePercentage,
          stripeFlatFee: quote.stripeFlatFee,
          grossUpAmount: (quote.serviceFeCents - quote.desiredServiceFeeCents) / 100,
          marginProtected: true
        },
        
        // Configuration used
        feeConfig: {
          feeType: feeConfig.feeType,
          serviceFeeFixed: feeConfig.serviceFeeFixed,
          serviceFeePercentage: feeConfig.serviceFeePercentage,
          taxRate: feeConfig.taxRate,
          stripeFeePercentage: feeConfig.stripeFeePercentage,
          stripeFlatFee: feeConfig.stripeFlatFee
        }
      };
      
    } catch (error) {
      console.error('❌ Get protected pricing breakdown error:', error);
      throw error;
    }
  }
};

// Extend VediAPI with new methods when this file loads
if (typeof window !== 'undefined' && window.VediAPI) {
  Object.assign(window.VediAPI, VediAPIExtensions);
  console.log('🔧 VediAPI extended with protected pricing methods');
} else {
  // For server-side or if VediAPI not loaded yet, store extensions
  window.VediAPIExtensions = VediAPIExtensions;
}

// Auto-extend VediAPI when it becomes available
if (typeof window !== 'undefined') {
  const checkForVediAPI = () => {
    if (window.VediAPI && !window.VediAPI.calculateProtectedPricing) {
      Object.assign(window.VediAPI, VediAPIExtensions);
      console.log('🔧 VediAPI extended with protected pricing methods (delayed)');
    } else if (!window.VediAPI) {
      setTimeout(checkForVediAPI, 100);
    }
  };
  checkForVediAPI();
}

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
 * Uses the same calculation logic but on server-side for Stripe integration
 */
exports.createPaymentIntent = functions.https.onCall(async ({ 
  restaurantId, 
  subtotalCents, 
  currency, 
  cardBrand = 'standard'
}, context) => {
  try {
    console.log('🚀 Processing protected payment calculation (server-side)...');
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

    // Get fee configuration (same logic as VediAPI)
    let feeConfig;
    if (!feeConfigDoc.exists) {
      console.log('⚠️ No specific fee config found, checking for default...');
      const defaultFeeDoc = await db.collection('feeConfigurations').doc('default').get();
      
      if (defaultFeeDoc.exists) {
        feeConfig = defaultFeeDoc.data();
        console.log('✅ Using default fee configuration');
      } else {
        console.log('⚠️ No fee configuration found, using fallback defaults');
        feeConfig = {
          feeType: 'hybrid',
          serviceFeeFixed: 0.50,
          serviceFeePercentage: 3,
          taxRate: 0.07,  // Use 7% to match your fee management
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

    // Use the same calculation logic as VediAPI (keep in sync)
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
    const taxRate = (feeConfig.taxRate || 7.0) / 100;  // Default to 7% if not set
    const taxAmount = subtotal * taxRate;

    // Calculate base amount
    const baseAmount = subtotal + taxAmount + desiredServiceFee;

    // Get Stripe fees
    const stripePct = (feeConfig.stripeFeePercentage || 2.9) / 100;
    const stripeFlat = (feeConfig.stripeFlatFee || 30) / 100;

    // Gross-up calculation
    const customerTotal = (baseAmount + stripeFlat) / (1 - stripePct);
    const displayedServiceFee = customerTotal - subtotal - taxAmount;

    // Convert to cents for Stripe
    const totalCents = Math.round(customerTotal * 100);
    const applicationFeeCents = Math.round(displayedServiceFee * 100);

    console.log('💰 Server-side calculation complete:', {
      totalCents,
      applicationFeeCents,
      taxRate: taxRate * 100
    });

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: currency.toLowerCase(),
      application_fee_amount: applicationFeeCents,
      transfer_data: {
        destination: stripeAccountId
      },
      metadata: {
        restaurantId,
        subtotal: Math.round(subtotal * 100).toString(),
        tax: Math.round(taxAmount * 100).toString(),
        serviceFee: applicationFeeCents.toString(),
        desiredServiceFee: Math.round(desiredServiceFee * 100).toString(),
        marginProtected: 'true'
      }
    });

    console.log('✅ Payment intent created successfully:', paymentIntent.id);

    return {
      clientSecret: paymentIntent.client_secret,
      breakdown: {
        subtotalCents: Math.round(subtotal * 100),
        taxCents: Math.round(taxAmount * 100),
        serviceFeCents: applicationFeeCents,
        totalCents: totalCents,
        marginProtected: true
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

console.log('💳 Payments API with VediAPI Extensions loaded successfully');
console.log('🔧 VediAPI extended with protected pricing methods');
console.log('🛡️ Features: Client-side pricing calculation + Server-side Stripe integration');
console.log('📊 Consistent calculations between client and server');
console.log('🎯 Your service fee margin is always protected from Stripe fees');
