// api/payments/fee-configurations.js - Fee Configuration Management
/**
 * Fee Configurations Module
 * 
 * Handles fee configuration management including platform fees, venue fees,
 * Stripe fees, and custom fee arrangements. All fees stored in dollars for
 * consistency. Enhanced with venue fee support in feeConfigurations collection.
 */

// ============================================================================
// FEE CONFIGURATION CRUD OPERATIONS
// ============================================================================

/**
 * Create or update fee configuration for a restaurant - ENHANCED with venue fee support
 * @param {string} restaurantId - Restaurant ID
 * @param {Object} feeConfig - Fee configuration including venue fees
 * @returns {Promise<Object>} Created/updated fee config
 */
async function createOrUpdateFeeConfig(restaurantId, feeConfig) {
  const endTracking = VediAPI.startPerformanceMeasurement('createOrUpdateFeeConfig');
  
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    // Get restaurant data to include venue information
    let restaurantData = null;
    try {
      restaurantData = await VediAPI.getRestaurant(restaurantId);
    } catch (error) {
      console.warn('Could not fetch restaurant data:', error);
    }
    
    const config = VediAPI.removeUndefinedValues({
      restaurantId,
      
      // Platform/Service fees (managed by app admin)
      serviceFeeFixed: feeConfig.serviceFeeFixed || 0,
      serviceFeePercentage: feeConfig.serviceFeePercentage || 0,
      feeType: feeConfig.feeType || 'fixed',
      taxRate: feeConfig.taxRate || 0.085,
      minimumOrderAmount: feeConfig.minimumOrderAmount || 0,
      
      // Stripe fee configuration (managed by app admin) - FIXED: ALL IN DOLLARS
      stripeFeePercentage: feeConfig.stripeFeePercentage || 2.9,
      stripeFlatFee: feeConfig.stripeFlatFee || 0.30, // FIXED: In dollars, not cents
      
      // ENHANCED: Venue fee configuration (stored here but managed by venue dashboard)
      venueFeePercentage: feeConfig.venueFeePercentage || 0,
      venueId: restaurantData?.venueId || feeConfig.venueId || null,
      venueName: restaurantData?.venueName || feeConfig.venueName || null,
      
      // Negotiated rates
      isNegotiated: feeConfig.isNegotiated || false,
      negotiatedBy: feeConfig.negotiatedBy || null,
      negotiatedDate: feeConfig.negotiatedDate || null,
      notes: feeConfig.notes ? VediAPI.sanitizeInput(feeConfig.notes) : '',
      
      // Metadata
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser?.uid
    });
    
    // Use restaurant ID as document ID for easy lookup
    await db.collection('feeConfigurations').doc(restaurantId).set(config, { merge: true });
    
    // Track fee configuration update
    await VediAPI.trackUserActivity('fee_config_updated', {
      restaurantId: restaurantId,
      feeType: config.feeType,
      serviceFeeFixed: config.serviceFeeFixed,
      serviceFeePercentage: config.serviceFeePercentage,
      venueFeePercentage: config.venueFeePercentage,
      isNegotiated: config.isNegotiated
    });
    
    await endTracking(true);
    
    console.log('✅ Fee configuration saved with venue fees:', restaurantId);
    return config;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'createOrUpdateFeeConfig', { restaurantId });
    
    console.error('❌ Create/update fee config error:', error);
    throw error;
  }
}

/**
 * Update venue fee percentage for a restaurant (called from venue dashboard)
 * @param {string} restaurantId - Restaurant ID
 * @param {number} venueFeePercentage - New venue fee percentage
 * @param {string} updatedBy - User ID who made the change
 * @returns {Promise<Object>} Updated fee configuration
 */
async function updateVenueFeePercentage(restaurantId, venueFeePercentage, updatedBy = null) {
  const endTracking = VediAPI.startPerformanceMeasurement('updateVenueFeePercentage');
  
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    // Get current fee config or create default if doesn't exist
    let currentConfig = await getFeeConfig(restaurantId);
    
    // If it's a default config, create a real one
    if (currentConfig.isDefault) {
      delete currentConfig.isDefault;
      delete currentConfig.id;
      currentConfig.restaurantId = restaurantId;
    }
    
    // Update venue fee percentage
    const updateData = {
      ...currentConfig,
      venueFeePercentage: venueFeePercentage || 0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      venueFeeUpdatedBy: updatedBy || auth.currentUser?.uid,
      venueFeeUpdatedDate: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('feeConfigurations').doc(restaurantId).set(updateData, { merge: true });
    
    // Track venue fee update
    await VediAPI.trackUserActivity('venue_fee_updated', {
      restaurantId: restaurantId,
      newVenueFeePercentage: venueFeePercentage,
      updatedBy: updatedBy || auth.currentUser?.uid
    });
    
    await endTracking(true);
    
    console.log('✅ Venue fee percentage updated:', restaurantId, venueFeePercentage + '%');
    return updateData;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'updateVenueFeePercentage', { restaurantId });
    
    console.error('❌ Update venue fee percentage error:', error);
    throw error;
  }
}

/**
 * Get fee configuration for a restaurant - ENHANCED with venue fee defaults
 * @param {string} restaurantId - Restaurant ID
 * @returns {Promise<Object|null>} Fee configuration including venue fees
 */
async function getFeeConfig(restaurantId) {
  const endTracking = VediAPI.startPerformanceMeasurement('getFeeConfig');
  
  try {
    const db = getFirebaseDb();
    
    const doc = await db.collection('feeConfigurations').doc(restaurantId).get();
    
    if (doc.exists) {
      const config = { id: doc.id, ...doc.data() };
      
      // Ensure venue fee percentage is included
      if (config.venueFeePercentage === undefined) {
        config.venueFeePercentage = 0;
      }
      
      await endTracking(true);
      return config;
    }
    
    // Return default configuration if none exists - ENHANCED with venue fee
    const defaultConfig = {
      restaurantId,
      serviceFeeFixed: 2.00,
      serviceFeePercentage: 0,
      feeType: 'fixed',
      taxRate: 0.085,
      minimumOrderAmount: 0,
      stripeFeePercentage: 2.9,
      stripeFlatFee: 0.30, // FIXED: In dollars
      venueFeePercentage: 0, // ENHANCED: Default venue fee
      venueId: null,
      venueName: null,
      isNegotiated: false,
      isDefault: true
    };
    
    await endTracking(true);
    return defaultConfig;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getFeeConfig', { restaurantId });
    
    // Return default on error - ENHANCED with venue fee
    return {
      restaurantId,
      serviceFeeFixed: 2.00,
      serviceFeePercentage: 0,
      feeType: 'fixed',
      taxRate: 0.085,
      minimumOrderAmount: 0,
      stripeFeePercentage: 2.9,
      stripeFlatFee: 0.30, // FIXED: In dollars
      venueFeePercentage: 0, // ENHANCED: Default venue fee
      isDefault: true
    };
  }
}

/**
 * Calculate fees for an order - ENHANCED to include venue fees
 * INJECTED FROM: firebase-api.js calculateOrderFees method
 * @param {string} restaurantId - Restaurant ID
 * @param {number} subtotal - Order subtotal
 * @returns {Promise<Object>} Calculated fees including venue fees
 */
async function calculateOrderFees(restaurantId, subtotal) {
  const endTracking = VediAPI.startPerformanceMeasurement('calculateOrderFees');
  
  try {
    const feeConfig = await getFeeConfig(restaurantId);
    
    let serviceFee = 0;
    let venueFee = 0;
    let stripeFee = 0;
    let taxAmount = 0;
    
    // Calculate service fee based on configuration
    switch (feeConfig.feeType) {
      case 'fixed':
        serviceFee = feeConfig.serviceFeeFixed || 0;
        break;
      case 'percentage':
        serviceFee = (subtotal * (feeConfig.serviceFeePercentage / 100));
        break;
      case 'hybrid':
        serviceFee = feeConfig.serviceFeeFixed + (subtotal * (feeConfig.serviceFeePercentage / 100));
        break;
      default:
        serviceFee = feeConfig.serviceFeeFixed || 2.00;
    }
    
    // ENHANCED: Calculate venue fee
    venueFee = (subtotal * ((feeConfig.venueFeePercentage || 0) / 100));
    
    // Apply minimum order amount logic
    if (subtotal < feeConfig.minimumOrderAmount) {
      const shortfall = feeConfig.minimumOrderAmount - subtotal;
      serviceFee += shortfall; // Add shortfall to service fee
    }
    
    // Calculate Stripe fees
    const stripePercentage = (feeConfig.stripeFeePercentage || 2.9) / 100;
    const stripeFlatDollars = feeConfig.stripeFlatFee || 0.30;
    stripeFee = (subtotal * stripePercentage) + stripeFlatDollars;
    
    // Calculate tax
    taxAmount = subtotal * (feeConfig.taxRate || 0.085);
    
    const total = subtotal + serviceFee + venueFee + stripeFee + taxAmount;
    
    const result = {
      subtotal,
      serviceFee: Math.round(serviceFee * 100) / 100,
      venueFee: Math.round(venueFee * 100) / 100, // ENHANCED: Venue fee
      stripeFee: Math.round(stripeFee * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      taxRate: feeConfig.taxRate || 0.085,
      total: Math.round(total * 100) / 100,
      feeConfig: feeConfig,
      breakdown: {
        serviceFeeType: feeConfig.feeType,
        serviceFeeFixed: feeConfig.serviceFeeFixed,
        serviceFeePercentage: feeConfig.serviceFeePercentage,
        venueFeePercentage: feeConfig.venueFeePercentage, // ENHANCED: Venue fee percentage
        venueId: feeConfig.venueId, // ENHANCED: Venue ID
        stripeFeePercentage: feeConfig.stripeFeePercentage,
        stripeFlatFee: feeConfig.stripeFlatFee,
        isNegotiated: feeConfig.isNegotiated
      }
    };
    
    await endTracking(true);
    return result;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'calculateOrderFees', { restaurantId });
    
    console.error('❌ Calculate order fees error:', error);
    throw error;
  }
}

/**
 * Get fee analytics - ENHANCED to include venue fee revenue tracking
 * INJECTED FROM: firebase-api.js getFeeAnalytics method
 * @param {string} timePeriod - Time period (today, week, month, year)
 * @param {string} restaurantId - Optional restaurant filter
 * @returns {Promise<Object>} Fee analytics including venue fees
 */
async function getFeeAnalytics(timePeriod = 'month', restaurantId = null) {
  const endTracking = VediAPI.startPerformanceMeasurement('getFeeAnalytics');
  
  try {
    const db = getFirebaseDb();
    const startDate = VediAPI.getTimePeriodStart(timePeriod);
    
    let query = db.collection('orders');
    
    if (startDate) {
      query = query.where('createdAt', '>=', startDate);
    }
    
    if (restaurantId) {
      query = query.where('restaurantId', '==', restaurantId);
    }
    
    const ordersSnapshot = await query.get();
    
    let totalRevenue = 0;
    let totalServiceFees = 0;
    let totalVenueFees = 0; // ENHANCED: Track venue fees
    let totalStripeFees = 0;
    let totalTax = 0;
    let orderCount = 0;
    const revenueByRestaurant = {};
    const revenueByVenue = {}; // ENHANCED: Track venue revenue
    
    ordersSnapshot.docs.forEach(doc => {
      const order = doc.data();
      if (order.status === 'completed') {
        totalRevenue += order.total || 0;
        totalServiceFees += order.serviceFee || 0;
        totalVenueFees += order.venueFee || 0; // ENHANCED: Add venue fees
        totalStripeFees += order.stripeFee || 0;
        totalTax += order.tax || 0;
        orderCount++;
        
        const restId = order.restaurantId;
        const venueId = order.venueId; // ENHANCED: Get venue ID from order
        
        if (!revenueByRestaurant[restId]) {
          revenueByRestaurant[restId] = {
            revenue: 0,
            serviceFees: 0,
            venueFees: 0, // ENHANCED: Track venue fees per restaurant
            stripeFees: 0,
            orders: 0
          };
        }
        
        revenueByRestaurant[restId].revenue += order.total || 0;
        revenueByRestaurant[restId].serviceFees += order.serviceFee || 0;
        revenueByRestaurant[restId].venueFees += order.venueFee || 0; // ENHANCED
        revenueByRestaurant[restId].stripeFees += order.stripeFee || 0;
        revenueByRestaurant[restId].orders++;
        
        // ENHANCED: Track venue revenue if venue exists
        if (venueId) {
          if (!revenueByVenue[venueId]) {
            revenueByVenue[venueId] = {
              revenue: 0,
              venueFees: 0,
              orders: 0,
              restaurants: new Set()
            };
          }
          
          revenueByVenue[venueId].revenue += order.total || 0;
          revenueByVenue[venueId].venueFees += order.venueFee || 0;
          revenueByVenue[venueId].orders++;
          revenueByVenue[venueId].restaurants.add(restId);
        }
      }
    });
    
    // Convert venue restaurant sets to counts
    Object.keys(revenueByVenue).forEach(venueId => {
      revenueByVenue[venueId].restaurantCount = revenueByVenue[venueId].restaurants.size;
      delete revenueByVenue[venueId].restaurants;
    });
    
    const result = {
      timePeriod,
      totalRevenue,
      totalServiceFees,
      totalVenueFees, // ENHANCED: Include venue fees
      totalStripeFees,
      totalTax,
      orderCount,
      averageOrderValue: orderCount > 0 ? totalRevenue / orderCount : 0,
      averageServiceFee: orderCount > 0 ? totalServiceFees / orderCount : 0,
      averageVenueFee: orderCount > 0 ? totalVenueFees / orderCount : 0, // ENHANCED
      averageStripeFee: orderCount > 0 ? totalStripeFees / orderCount : 0,
      revenueByRestaurant,
      revenueByVenue, // ENHANCED: Venue revenue breakdown
      platformCommission: totalServiceFees, // Your platform revenue
      venueCommission: totalVenueFees, // ENHANCED: Venue revenue
      stripeCommission: totalStripeFees // Stripe's revenue
    };
    
    await endTracking(true);
    return result;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getFeeAnalytics');
    
    console.error('❌ Get fee analytics error:', error);
    throw error;
  }
}

/**
 * Calculate protected pricing with enhanced venue fee support
 * INJECTED FROM: vediapi-pricing-extensions.js calculateProtectedPricing method
 * @param {string} restaurantId - Restaurant ID
 * @param {number} subtotalCents - Subtotal in cents
 * @returns {Promise<Object>} Protected pricing breakdown including venue fees
 */
async function calculateProtectedPricing(restaurantId, subtotalCents) {
  const endTracking = VediAPI.startPerformanceMeasurement('calculateProtectedPricing');
  
  try {
    console.log('🧮 Starting protected pricing calculation with venue fees...');
    console.log('📊 Input:', { restaurantId, subtotalCents });
    
    // Validate inputs
    if (!restaurantId) {
      throw new Error('Restaurant ID is required');
    }
    
    if (!subtotalCents || subtotalCents <= 0) {
      throw new Error('Valid subtotal in cents is required');
    }
    
    // Get complete fee configuration including venue fees
    console.log('🔄 Fetching complete fee configuration...');
    const feeConfig = await getFeeConfig(restaurantId);
    console.log('⚙️ Complete fee config loaded:', feeConfig);
    
    // Validate fee config
    if (!feeConfig) {
      throw new Error(`No fee configuration found for restaurant ${restaurantId}`);
    }

    const subtotal = subtotalCents / 100;
    console.log('💰 Subtotal:', subtotal);
    
    // Step 1: Calculate desired service fee (platform fee)
    let desiredServiceFee = 0;
    
    const feeType = feeConfig.feeType || 'fixed';
    const fixedFee = feeConfig.serviceFeeFixed || 0;
    const percentageFee = feeConfig.serviceFeePercentage || 0;
    
    console.log('🎯 Platform fee structure:', { feeType, fixedFee, percentageFee });
    
    switch (feeType) {
      case 'fixed':
        desiredServiceFee = fixedFee;
        break;
      case 'percentage':
        desiredServiceFee = subtotal * (percentageFee / 100);
        break;
      case 'hybrid':
        desiredServiceFee = fixedFee + (subtotal * (percentageFee / 100));
        break;
      default:
        console.log('⚠️ Unknown fee type, defaulting to fixed');
        desiredServiceFee = fixedFee;
    }
    
    console.log('💵 Desired platform service fee:', desiredServiceFee);

    // Step 2: Calculate venue fee (now from feeConfigurations collection)
    let desiredVenueFee = 0;
    const venueFeePercentage = feeConfig.venueFeePercentage || 0;
    
    if (venueFeePercentage > 0) {
      desiredVenueFee = subtotal * (venueFeePercentage / 100);
      console.log('🏢 Desired venue fee:', desiredVenueFee, `(${venueFeePercentage}%)`);
    } else {
      console.log('🏢 No venue fee configured');
    }

    // Step 3: Calculate tax
    const taxRate = feeConfig.taxRate || 0.085; // Default to 8.5% if not set
    const taxAmount = subtotal * taxRate;
    console.log('🏛️ Tax calculation:', { taxRate: taxRate * 100 + '%', taxAmount });

    // Step 4: Calculate base amount (what we want to keep after payment processing)
    const baseAmount = subtotal + taxAmount + desiredServiceFee + desiredVenueFee;
    console.log('📋 Base amount (subtotal + tax + platform fee + venue fee):', baseAmount);

    // Step 5: Get Stripe fees for this restaurant
    const stripePct = (feeConfig.stripeFeePercentage || 2.9) / 100;
    const stripeFlat = (feeConfig.stripeFlatFee || 0.30);
    console.log('💳 Stripe fees:', { 
      percentage: stripePct * 100 + '%', 
      flat: stripeFlat
    });

    // Step 6: GROSS-UP FORMULA - Calculate what customer needs to pay
    // Formula: customerTotal = (baseAmount + stripeFlat) / (1 - stripePct)
    const customerTotal = (baseAmount + stripeFlat) / (1 - stripePct);
    
    // Calculate displayed fees
    const displayedServiceFee = customerTotal - subtotal - taxAmount - (customerTotal - subtotal - taxAmount) * (venueFeePercentage / 100);
    const displayedVenueFee = (customerTotal - subtotal - taxAmount) * (venueFeePercentage / 100);
    
    const serviceFeePercentage = subtotal > 0 ? (displayedServiceFee / subtotal) * 100 : 0;
    const venueFeeDisplayPercentage = venueFeePercentage; // This remains the same

    console.log('🎯 Gross-up calculation result:', {
      customerTotal,
      displayedServiceFee,
      displayedVenueFee,
      serviceFeePercentage: serviceFeePercentage.toFixed(2) + '%',
      venueFeePercentage: venueFeeDisplayPercentage + '%'
    });

    // Verify our calculation
    const calculatedStripeFee = (customerTotal * stripePct) + stripeFlat;
    const netToRestaurant = customerTotal - calculatedStripeFee;
    const actualPlatformMargin = netToRestaurant - subtotal - taxAmount - displayedVenueFee;
    const actualVenueMargin = displayedVenueFee;
    
    console.log('🔍 Verification:', {
      stripeFeeCharged: calculatedStripeFee,
      netToRestaurant,
      actualPlatformMarginReceived: actualPlatformMargin,
      actualVenueMarginReceived: actualVenueMargin,
      desiredPlatformMargin: desiredServiceFee,
      desiredVenueMargin: desiredVenueFee,
      platformMarginDifference: Math.abs(actualPlatformMargin - desiredServiceFee),
      venueMarginDifference: Math.abs(actualVenueMargin - desiredVenueFee)
    });

    const result = {
      quote: {
        subtotalCents: Math.round(subtotal * 100),
        taxCents: Math.round(taxAmount * 100),
        serviceFeCents: Math.round(displayedServiceFee * 100),
        venueFeCents: Math.round(displayedVenueFee * 100), // Venue fee
        totalCents: Math.round(customerTotal * 100),
        serviceFeePercentage: Number(serviceFeePercentage.toFixed(2)),
        venueFeePercentage: Number(venueFeeDisplayPercentage.toFixed(2)), // Venue fee percentage
        taxRate: Number((taxRate * 100).toFixed(2)),
        desiredServiceFeeCents: Math.round(desiredServiceFee * 100),
        desiredVenueFeeCents: Math.round(desiredVenueFee * 100), // Desired venue fee
        stripeFeePercentage: Number((stripePct * 100).toFixed(2)),
        stripeFlatFee: Number((stripeFlat * 100).toFixed(0)), // In cents for display
        marginProtected: true,
        venueId: feeConfig.venueId, // Venue information
        venueName: feeConfig.venueName, // Venue name
        calculationTimestamp: new Date().toISOString()
      }
    };

    await endTracking(true);
    console.log('✅ Protected pricing calculation with venue fees complete:', result.quote);
    return result;

  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'calculateProtectedPricing', { restaurantId });
    
    console.error('❌ VediAPI protected pricing calculation with venue fees error:', error);
    console.error('📍 Error details:', {
      restaurantId,
      subtotalCents,
      errorMessage: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get comprehensive pricing breakdown for display including venue fees
 * INJECTED FROM: vediapi-pricing-extensions.js getProtectedPricingBreakdown method
 * @param {string} restaurantId - Restaurant ID  
 * @param {number} subtotalCents - Subtotal in cents
 * @returns {Promise<Object>} Detailed pricing breakdown for UI including venue fees
 */
async function getProtectedPricingBreakdown(restaurantId, subtotalCents) {
  const endTracking = VediAPI.startPerformanceMeasurement('getProtectedPricingBreakdown');
  
  try {
    console.log('📊 Getting protected pricing breakdown with venue fees...');
    
    const pricingResult = await calculateProtectedPricing(restaurantId, subtotalCents);
    const quote = pricingResult.quote;
    const feeConfig = await getFeeConfig(restaurantId);
    
    const breakdown = {
      // Customer-facing amounts (what they see and pay)
      subtotal: quote.subtotalCents / 100,
      taxAmount: quote.taxCents / 100,
      serviceFee: quote.serviceFeCents / 100,
      venueFee: quote.venueFeCents / 100, // Venue fee
      total: quote.totalCents / 100,
      
      // Display percentages
      taxRate: quote.taxRate,
      serviceFeePercentage: quote.serviceFeePercentage,
      venueFeePercentage: quote.venueFeePercentage, // Venue fee percentage
      
      // Behind-the-scenes breakdown (for testing/admin)
      breakdown: {
        desiredServiceFee: quote.desiredServiceFeeCents / 100,
        desiredVenueFee: quote.desiredVenueFeeCents / 100, // Desired venue fee
        actualServiceFee: quote.serviceFeCents / 100,
        actualVenueFee: quote.venueFeCents / 100, // Actual venue fee
        stripeFeePercentage: quote.stripeFeePercentage,
        stripeFlatFee: quote.stripeFlatFee,
        grossUpAmount: ((quote.serviceFeCents + quote.venueFeCents) - (quote.desiredServiceFeeCents + quote.desiredVenueFeeCents)) / 100,
        marginProtected: quote.marginProtected,
        calculationMethod: 'vediapi-extensions-with-enhanced-venue'
      },
      
      // Enhanced venue information
      venue: {
        venueId: quote.venueId,
        venueName: quote.venueName,
        feePercentage: quote.venueFeePercentage,
        monthlyEarnings: (quote.venueFeCents / 100) * 30, // Estimated monthly earnings
        feeSource: 'feeConfigurations' // Indicates fees come from feeConfigurations collection
      },
      
      // Configuration used
      feeConfig: {
        restaurantId,
        feeType: feeConfig.feeType,
        serviceFeeFixed: feeConfig.serviceFeeFixed,
        serviceFeePercentage: feeConfig.serviceFeePercentage,
        venueFeePercentage: feeConfig.venueFeePercentage, // Venue fee config
        taxRate: feeConfig.taxRate,
        stripeFeePercentage: feeConfig.stripeFeePercentage,
        stripeFlatFee: feeConfig.stripeFlatFee,
        isNegotiated: feeConfig.isNegotiated || false,
        dataSource: 'feeConfigurations' // Indicates all fees from one collection
      },
      
      // Metadata
      meta: {
        timestamp: quote.calculationTimestamp,
        version: '2.2.0', // Updated version with enhanced venue support
        includesVenueFees: true,
        venueFeeSource: 'feeConfigurations'
      }
    };
    
    await endTracking(true);
    console.log('✅ Pricing breakdown with enhanced venue fees complete:', breakdown);
    return breakdown;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getProtectedPricingBreakdown', { restaurantId });
    
    console.error('❌ Get protected pricing breakdown with venue fees error:', error);
    throw error;
  }
}

/**
 * Get all fee configurations - ENHANCED to include venue fee information
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of fee configurations with venue fees
 */
async function getAllFeeConfigs(options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('getAllFeeConfigs');
  
  try {
    const db = getFirebaseDb();
    
    let query = db.collection('feeConfigurations');
    
    if (options.orderBy) {
      query = query.orderBy(options.orderBy, options.orderDirection || 'desc');
    } else {
      query = query.orderBy('updatedAt', 'desc');
    }
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    const querySnapshot = await query.get();
    const configs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Enrich with restaurant data and ensure venue fee is included
    const enrichedConfigs = await Promise.all(configs.map(async (config) => {
      try {
        const restaurant = await VediAPI.getRestaurant(config.restaurantId);
        
        // Ensure venue fee percentage is included
        if (config.venueFeePercentage === undefined) {
          config.venueFeePercentage = 0;
        }
        
        return {
          ...config,
          restaurantName: restaurant.name,
          restaurantCurrency: restaurant.currency || 'USD',
          venueId: restaurant.venueId || config.venueId,
          venueName: restaurant.venueName || config.venueName
        };
      } catch (error) {
        return {
          ...config,
          restaurantName: 'Unknown Restaurant',
          restaurantCurrency: 'USD',
          venueFeePercentage: config.venueFeePercentage || 0
        };
      }
    }));
    
    await endTracking(true);
    
    console.log('✅ Retrieved fee configurations with venue fees:', enrichedConfigs.length);
    return enrichedConfigs;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getAllFeeConfigs');
    
    console.error('❌ Get all fee configs error:', error);
    throw error;
  }
}

/**
 * Sync venue fee changes across all restaurants in a venue
 * @param {string} venueId - Venue ID
 * @param {number} newVenueFeePercentage - New venue fee percentage
 * @param {string} updatedBy - User ID who made the change
 * @returns {Promise<Array>} Array of updated restaurant fee configs
 */
async function syncVenueFeeAcrossRestaurants(venueId, newVenueFeePercentage, updatedBy = null) {
  const endTracking = VediAPI.startPerformanceMeasurement('syncVenueFeeAcrossRestaurants');
  
  try {
    console.log('🔄 Syncing venue fee across all restaurants in venue:', venueId);
    
    // Get all restaurants in this venue
    const restaurants = await VediAPI.getRestaurantsByVenue(venueId);
    
    if (restaurants.length === 0) {
      console.log('⚠️ No restaurants found in venue:', venueId);
      await endTracking(true);
      return [];
    }
    
    // Update venue fee for each restaurant
    const updatePromises = restaurants.map(restaurant => 
      updateVenueFeePercentage(restaurant.id, newVenueFeePercentage, updatedBy)
    );
    
    const updatedConfigs = await Promise.all(updatePromises);
    
    // Track bulk venue fee sync
    await VediAPI.trackUserActivity('venue_fee_bulk_sync', {
      venueId: venueId,
      newVenueFeePercentage: newVenueFeePercentage,
      restaurantCount: restaurants.length,
      updatedBy: updatedBy
    });
    
    await endTracking(true);
    
    console.log('✅ Venue fee synced across', restaurants.length, 'restaurants');
    return updatedConfigs;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'syncVenueFeeAcrossRestaurants', { venueId });
    
    console.error('❌ Sync venue fee error:', error);
    throw error;
  }
}

/**
 * Delete fee configuration (revert to default)
 * @param {string} restaurantId - Restaurant ID
 */
async function deleteFeeConfig(restaurantId) {
  const endTracking = VediAPI.startPerformanceMeasurement('deleteFeeConfig');
  
  try {
    const db = getFirebaseDb();
    
    await db.collection('feeConfigurations').doc(restaurantId).delete();
    
    // Track fee config deletion
    await VediAPI.trackUserActivity('fee_config_deleted', {
      restaurantId: restaurantId
    });
    
    await endTracking(true);
    
    console.log('✅ Fee configuration deleted for restaurant:', restaurantId);
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'deleteFeeConfig', { restaurantId });
    
    console.error('❌ Delete fee config error:', error);
    throw error;
  }
}

// ============================================================================
// UI EVENT HANDLERS
// ============================================================================

/**
 * Handle edit restaurant fee button click
 * @param {string} restaurantId - Restaurant ID to edit
 */
function editRestaurantFee(restaurantId) {
    console.log('🔄 Opening edit modal for restaurant:', restaurantId);
    
    // Simple prompt-based editing (can be enhanced with modals later)
    const newFeeType = prompt('Select fee type:\n1. fixed\n2. percentage\n3. hybrid\n\nEnter fee type:');
    
    if (!newFeeType || !['fixed', 'percentage', 'hybrid'].includes(newFeeType)) {
        if (window.Utils) {
            Utils.showAlert('Invalid fee type. Please enter: fixed, percentage, or hybrid', 'error');
        } else {
            alert('Invalid fee type. Please enter: fixed, percentage, or hybrid');
        }
        return;
    }
    
    let serviceFeeFixed = 0;
    let serviceFeePercentage = 0;
    
    if (newFeeType === 'fixed' || newFeeType === 'hybrid') {
        const fixedFeeInput = prompt('Enter fixed fee amount (in dollars, e.g., 2.50):');
        serviceFeeFixed = parseFloat(fixedFeeInput) || 0;
        
        if (serviceFeeFixed < 0) {
            alert('Fixed fee cannot be negative');
            return;
        }
    }
    
    if (newFeeType === 'percentage' || newFeeType === 'hybrid') {
        const percentageFeeInput = prompt('Enter percentage fee (e.g., 5 for 5%):');
        serviceFeePercentage = parseFloat(percentageFeeInput) || 0;
        
        if (serviceFeePercentage < 0 || serviceFeePercentage > 100) {
            alert('Percentage fee must be between 0 and 100');
            return;
        }
    }
    
    // Update fee configuration using existing VediAPI function
    const feeConfig = {
        feeType: newFeeType,
        serviceFeeFixed: serviceFeeFixed,
        serviceFeePercentage: serviceFeePercentage
    };
    
    console.log('💾 Updating fee config:', feeConfig);
    
    VediAPI.createOrUpdateFeeConfig(restaurantId, feeConfig)
        .then(() => {
            if (window.Utils) {
                Utils.showAlert('Fee configuration updated successfully!', 'success');
            } else {
                alert('Fee configuration updated successfully!');
            }
            
            // Reload the restaurant configs if DataManager exists
            if (window.DataManager && window.DataManager.loadRestaurantConfigs) {
                DataManager.loadRestaurantConfigs();
            } else {
                location.reload(); // Fallback: reload page
            }
        })
        .catch(error => {
            console.error('❌ Error updating fee config:', error);
            if (window.Utils) {
                Utils.showAlert('Error updating fee configuration: ' + error.message, 'error');
            } else {
                alert('Error updating fee configuration: ' + error.message);
            }
        });
}

/**
 * Handle delete restaurant fee button click
 * @param {string} restaurantId - Restaurant ID to delete config for
 */
function deleteRestaurantFee(restaurantId) {
    console.log('🗑️ Attempting to delete fee config for restaurant:', restaurantId);
    
    // Confirm deletion
    const confirmed = confirm(
        'Are you sure you want to delete this fee configuration?\n\n' +
        'This will revert the restaurant to default fee settings.\n\n' +
        'This action cannot be undone.'
    );
    
    if (!confirmed) {
        console.log('❌ Fee config deletion cancelled by user');
        return;
    }
    
    console.log('💾 Deleting fee configuration...');
    
    VediAPI.deleteFeeConfig(restaurantId)
        .then(() => {
            if (window.Utils) {
                Utils.showAlert('Fee configuration deleted successfully! Restaurant reverted to default fees.', 'success');
            } else {
                alert('Fee configuration deleted successfully! Restaurant reverted to default fees.');
            }
            
            // Reload the restaurant configs if DataManager exists
            if (window.DataManager && window.DataManager.loadRestaurantConfigs) {
                DataManager.loadRestaurantConfigs();
            } else {
                location.reload(); // Fallback: reload page
            }
        })
        .catch(error => {
            console.error('❌ Error deleting fee config:', error);
            if (window.Utils) {
                Utils.showAlert('Error deleting fee configuration: ' + error.message, 'error');
            } else {
                alert('Error deleting fee configuration: ' + error.message);
            }
        });
}

// ============================================================================
// GLOBAL EXPORTS AND VEDIAPI INTEGRATION
// ============================================================================

// Ensure VediAPI namespace exists
if (!window.VediAPI) {
  window.VediAPI = {};
}

// Attach fee configuration functions to VediAPI
Object.assign(window.VediAPI, {
  // Core CRUD operations
  createOrUpdateFeeConfig,
  getFeeConfig,
  getAllFeeConfigs,
  deleteFeeConfig,
  
  // Venue fee management
  updateVenueFeePercentage,
  syncVenueFeeAcrossRestaurants,
  
  // INJECTED: Fee calculation methods from firebase-api.js
  calculateOrderFees,
  getFeeAnalytics,
  
  // INJECTED: Dynamic pricing methods from vediapi-pricing-extensions.js
  calculateProtectedPricing,
  getProtectedPricingBreakdown
});

// Export UI handlers globally so HTML onclick can find them
window.editRestaurantFee = editRestaurantFee;
window.deleteRestaurantFee = deleteRestaurantFee;

console.log('💰 Enhanced Fee Configurations Module loaded');
console.log('📝 CRUD: createOrUpdateFeeConfig, getFeeConfig, getAllFeeConfigs, deleteFeeConfig');
console.log('🏢 ENHANCED: Venue fee management with updateVenueFeePercentage');
console.log('🔄 SYNC: syncVenueFeeAcrossRestaurants for bulk venue updates');
console.log('💳 FIXED: All fees stored consistently in dollars (stripeFlatFee: $0.30)');
console.log('📊 INTEGRATED: Venue fees in feeConfigurations collection');
console.log('📊 INJECTED: calculateOrderFees, getFeeAnalytics from firebase-api.js');
console.log('💰 INJECTED: calculateProtectedPricing, getProtectedPricingBreakdown from vediapi-pricing-extensions.js');
console.log('🔧 UI Event Handlers added: editRestaurantFee, deleteRestaurantFee');
console.log('✅ Single source of truth for all fee configurations with comprehensive pricing and UI management');