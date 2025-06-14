// vediapi-pricing-extensions.js - Browser-compatible VediAPI extensions
// Place this file in your main directory (same level as firebase-api.js)

/**
 * VediAPI Extensions for Protected Pricing (Browser Version)
 */
const VediAPIPricingExtensions = {
  /**
   * Calculate protected pricing that ensures your margin is preserved from Stripe fees
   * @param {string} restaurantId - Restaurant ID
   * @param {number} subtotalCents - Subtotal in cents
   * @returns {Promise<Object>} Protected pricing breakdown
   */
  async calculateProtectedPricing(restaurantId, subtotalCents) {
    try {
      console.log('🧮 Calculating protected pricing via VediAPI extensions...');
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

      console.log('✅ VediAPI extension calculation complete:', {
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

// Wait for VediAPI to be available, then extend it
function extendVediAPI() {
  if (typeof window !== 'undefined' && window.VediAPI) {
    // Extend VediAPI with pricing methods
    Object.assign(window.VediAPI, VediAPIPricingExtensions);
    console.log('🔧 VediAPI extended with protected pricing methods');
    console.log('✅ New methods available: calculateProtectedPricing, getProtectedPricingBreakdown');
    return true;
  }
  return false;
}

// Try to extend immediately
if (!extendVediAPI()) {
  // If VediAPI not ready yet, wait for it
  let attempts = 0;
  const maxAttempts = 50; // 5 seconds max
  
  const checkForVediAPI = () => {
    if (extendVediAPI()) {
      console.log('🔧 VediAPI extended with protected pricing methods (delayed)');
    } else if (attempts < maxAttempts) {
      attempts++;
      setTimeout(checkForVediAPI, 100);
    } else {
      console.warn('⚠️ VediAPI not found after 5 seconds - pricing extensions not loaded');
    }
  };
  
  checkForVediAPI();
}

console.log('💰 VediAPI Pricing Extensions loaded');
console.log('🛡️ Protected pricing calculations available in browser');
