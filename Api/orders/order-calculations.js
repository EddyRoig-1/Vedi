// api/orders/order_calculations.js - Order Calculations
/**
 * Order Calculations Module
 * 
 * Handles all order calculation logic including fees, taxes, splits,
 * and payment processing calculations.
 */

// ============================================================================
// FEE CONFIGURATION AND CALCULATION METHODS
// ============================================================================

/**
 * Get fee configuration for a restaurant (integrates with your VediAPI system)
 */
async function getFeeConfig(restaurantId) {
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

/**
 * Calculate order subtotal from items array
 * @param {Array} items - Array of order items with price and quantity
 * @returns {number} Subtotal amount
 */
function calculateOrderSubtotal(items) {
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return 0;
    }
    
    const subtotal = items.reduce((total, item) => {
      const itemPrice = parseFloat(item.price) || 0;
      const itemQuantity = parseInt(item.quantity) || 0;
      return total + (itemPrice * itemQuantity);
    }, 0);
    
    return Math.round(subtotal * 100) / 100; // Round to 2 decimal places
    
  } catch (error) {
    console.error('❌ Calculate subtotal error:', error);
    throw new Error('Failed to calculate order subtotal');
  }
}

/**
 * Calculate tax amount for an order
 * @param {number} subtotal - Order subtotal
 * @param {number} taxRate - Tax rate (e.g., 0.085 for 8.5%)
 * @returns {number} Tax amount
 */
function calculateTax(subtotal, taxRate = 0.085) {
  try {
    const taxAmount = subtotal * taxRate;
    return Math.round(taxAmount * 100) / 100; // Round to 2 decimal places
  } catch (error) {
    console.error('❌ Calculate tax error:', error);
    throw new Error('Failed to calculate tax amount');
  }
}

/**
 * Apply fees to order and calculate final amounts
 * @param {string} restaurantId - Restaurant ID for fee config
 * @param {number} subtotal - Order subtotal
 * @param {Object} options - Additional options (taxRate, etc.)
 * @returns {Promise<Object>} Complete fee breakdown
 */
async function applyFees(restaurantId, subtotal, options = {}) {
  try {
    console.log('💰 Applying fees for order:', { restaurantId, subtotal });
    
    const feeConfig = await getFeeConfig(restaurantId);
    const taxRate = options.taxRate || feeConfig.taxRate || 0.085;
    
    // Calculate tax
    const taxAmount = calculateTax(subtotal, taxRate);
    
    // Calculate service fee
    let serviceFee = 0;
    switch (feeConfig.feeType) {
      case 'fixed':
        serviceFee = feeConfig.serviceFeeFixed || 0;
        break;
      case 'percentage':
        serviceFee = subtotal * (feeConfig.serviceFeePercentage / 100);
        break;
      case 'hybrid':
        serviceFee = (feeConfig.serviceFeeFixed || 0) + (subtotal * (feeConfig.serviceFeePercentage / 100));
        break;
      default:
        serviceFee = feeConfig.serviceFeeFixed || 0;
    }
    
    // Calculate venue fee if applicable
    let venueFee = 0;
    if (feeConfig.venueEnabled && feeConfig.venueFeePercentage > 0) {
      venueFee = subtotal * (feeConfig.venueFeePercentage / 100);
    }
    
    // Calculate delivery fee if provided
    const deliveryFee = parseFloat(options.deliveryFee) || 0;
    
    // Calculate total
    const total = subtotal + taxAmount + serviceFee + venueFee + deliveryFee;
    
    const feeBreakdown = {
      subtotal: Math.round(subtotal * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      serviceFee: Math.round(serviceFee * 100) / 100,
      venueFee: Math.round(venueFee * 100) / 100,
      deliveryFee: Math.round(deliveryFee * 100) / 100,
      total: Math.round(total * 100) / 100,
      
      // Fee configuration details
      feeConfig: {
        feeType: feeConfig.feeType,
        serviceFeeFixed: feeConfig.serviceFeeFixed,
        serviceFeePercentage: feeConfig.serviceFeePercentage,
        venueFeePercentage: feeConfig.venueFeePercentage,
        taxRate: taxRate,
        venueEnabled: feeConfig.venueEnabled,
        venueId: feeConfig.venueId
      }
    };
    
    console.log('✅ Fee breakdown calculated:', feeBreakdown);
    return feeBreakdown;
    
  } catch (error) {
    console.error('❌ Apply fees error:', error);
    throw new Error(`Failed to apply fees: ${error.message}`);
  }
}

// ============================================================================
// GLOBAL EXPORTS AND VEDIAPI INTEGRATION
// ============================================================================

// Ensure VediAPI namespace exists
if (!window.VediAPI) {
  window.VediAPI = {};
}

// Attach order calculation functions to VediAPI
Object.assign(window.VediAPI, {
  // Order calculation methods
  getFeeConfig,
  calculatePaymentSplit,
  calculateOrderSubtotal,
  calculateTax,
  applyFees
});

console.log('🧮 Order Calculations Module loaded');
console.log('📊 Fee Config: getFeeConfig for restaurant fee structures');
console.log('💰 Payment: calculatePaymentSplit for three-way splitting');
console.log('🧮 Math: calculateOrderSubtotal, calculateTax, applyFees');