// vediapi-pricing-extensions.js - Complete VediAPI Pricing Extensions
// COMPREHENSIVE VERSION with robust loading, debugging, and error handling

/**
 * VediAPI Extensions for Protected Pricing (Browser Version)
 * Ensures your platform margin is preserved from Stripe processing fees
 */
const VediAPIPricingExtensions = {
  
  // Debug flag for detailed logging
  DEBUG: true,
  
  /**
   * Log debug information if debugging is enabled
   */
  debug(...args) {
    if (this.DEBUG) {
      console.log('🔧 [VediAPI Extensions]', ...args);
    }
  },

  /**
   * Validate that VediAPI is properly loaded with required methods
   */
  validateVediAPI() {
    if (typeof VediAPI === 'undefined' || !VediAPI) {
      throw new Error('VediAPI is not available');
    }
    
    const requiredMethods = ['getFeeConfig'];
    const missingMethods = requiredMethods.filter(method => 
      typeof VediAPI[method] !== 'function'
    );
    
    if (missingMethods.length > 0) {
      throw new Error(`VediAPI missing required methods: ${missingMethods.join(', ')}`);
    }
    
    this.debug('✅ VediAPI validation passed');
    return true;
  },

  /**
   * Calculate protected pricing that ensures your margin is preserved from Stripe fees
   * @param {string} restaurantId - Restaurant ID
   * @param {number} subtotalCents - Subtotal in cents
   * @returns {Promise<Object>} Protected pricing breakdown
   */
  async calculateProtectedPricing(restaurantId, subtotalCents) {
    try {
      this.debug('🧮 Starting protected pricing calculation...');
      this.debug('📊 Input:', { restaurantId, subtotalCents });
      
      // Validate inputs
      if (!restaurantId) {
        throw new Error('Restaurant ID is required');
      }
      
      if (!subtotalCents || subtotalCents <= 0) {
        throw new Error('Valid subtotal in cents is required');
      }
      
      // Validate VediAPI availability
      this.validateVediAPI();
      
      // Get fee configuration from database
      this.debug('🔄 Fetching fee configuration...');
      const feeConfig = await VediAPI.getFeeConfig(restaurantId);
      this.debug('⚙️ Fee config loaded:', feeConfig);
      
      // Validate fee config
      if (!feeConfig) {
        throw new Error(`No fee configuration found for restaurant ${restaurantId}`);
      }

      const subtotal = subtotalCents / 100;
      this.debug('💰 Subtotal:', subtotal);
      
      // Step 1: Calculate desired service fee (what you want to keep)
      let desiredServiceFee = 0;
      
      const feeType = feeConfig.feeType || 'fixed';
      const fixedFee = feeConfig.serviceFeeFixed || 0;
      const percentageFee = feeConfig.serviceFeePercentage || 0;
      
      this.debug('🎯 Fee structure:', { feeType, fixedFee, percentageFee });
      
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
          this.debug('⚠️ Unknown fee type, defaulting to fixed');
          desiredServiceFee = fixedFee;
      }
      
      this.debug('💵 Desired service fee:', desiredServiceFee);

      // Step 2: Calculate tax
      const taxRate = feeConfig.taxRate || 0.085; // Default to 8.5% if not set
      const taxAmount = subtotal * taxRate;
      this.debug('🏛️ Tax calculation:', { taxRate: taxRate * 100 + '%', taxAmount });

      // Step 3: Calculate base amount you want to keep after payment
      const baseAmount = subtotal + taxAmount + desiredServiceFee;
      this.debug('📋 Base amount (subtotal + tax + desired fee):', baseAmount);

      // Step 4: Get Stripe fees for this restaurant
      const stripePct = (feeConfig.stripeFeePercentage || 2.9) / 100;
      const stripeFlat = (feeConfig.stripeFlatFee || 30) / 100;
      this.debug('💳 Stripe fees:', { 
        percentage: stripePct * 100 + '%', 
        flat: stripeFlat,
        flatCents: feeConfig.stripeFlatFee || 30
      });

      // Step 5: GROSS-UP FORMULA - Calculate what customer needs to pay
      // Formula: customerTotal = (baseAmount + stripeFlat) / (1 - stripePct)
      const customerTotal = (baseAmount + stripeFlat) / (1 - stripePct);
      const displayedServiceFee = customerTotal - subtotal - taxAmount;
      const serviceFeePercentage = subtotal > 0 ? (displayedServiceFee / subtotal) * 100 : 0;

      this.debug('🎯 Gross-up calculation result:', {
        customerTotal,
        displayedServiceFee,
        serviceFeePercentage: serviceFeePercentage.toFixed(2) + '%'
      });

      // Verify our calculation
      const calculatedStripeFee = (customerTotal * stripePct) + stripeFlat;
      const netToRestaurant = customerTotal - calculatedStripeFee;
      const actualMargin = netToRestaurant - subtotal - taxAmount;
      
      this.debug('🔍 Verification:', {
        stripeFeeCharged: calculatedStripeFee,
        netToRestaurant,
        actualMarginReceived: actualMargin,
        desiredMargin: desiredServiceFee,
        marginDifference: Math.abs(actualMargin - desiredServiceFee)
      });

      const result = {
        quote: {
          subtotalCents: Math.round(subtotal * 100),
          taxCents: Math.round(taxAmount * 100),
          serviceFeCents: Math.round(displayedServiceFee * 100),
          totalCents: Math.round(customerTotal * 100),
          serviceFeePercentage: Number(serviceFeePercentage.toFixed(2)),
          taxRate: Number((taxRate * 100).toFixed(2)),
          desiredServiceFeeCents: Math.round(desiredServiceFee * 100),
          stripeFeePercentage: Number((stripePct * 100).toFixed(2)),
          stripeFlatFee: feeConfig.stripeFlatFee || 30,
          marginProtected: true,
          calculationTimestamp: new Date().toISOString()
        }
      };

      this.debug('✅ Protected pricing calculation complete:', result.quote);
      return result;

    } catch (error) {
      console.error('❌ VediAPI protected pricing calculation error:', error);
      console.error('📍 Error details:', {
        restaurantId,
        subtotalCents,
        errorMessage: error.message,
        stack: error.stack
      });
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
      this.debug('📊 Getting protected pricing breakdown...');
      
      const pricingResult = await this.calculateProtectedPricing(restaurantId, subtotalCents);
      const quote = pricingResult.quote;
      const feeConfig = await VediAPI.getFeeConfig(restaurantId);
      
      const breakdown = {
        // Customer-facing amounts (what they see and pay)
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
          marginProtected: quote.marginProtected,
          calculationMethod: 'vediapi-extensions'
        },
        
        // Configuration used
        feeConfig: {
          restaurantId,
          feeType: feeConfig.feeType,
          serviceFeeFixed: feeConfig.serviceFeeFixed,
          serviceFeePercentage: feeConfig.serviceFeePercentage,
          taxRate: feeConfig.taxRate,
          stripeFeePercentage: feeConfig.stripeFeePercentage,
          stripeFlatFee: feeConfig.stripeFlatFee,
          isNegotiated: feeConfig.isNegotiated || false
        },
        
        // Metadata
        meta: {
          timestamp: quote.calculationTimestamp,
          version: '2.0.0'
        }
      };
      
      this.debug('✅ Pricing breakdown complete:', breakdown);
      return breakdown;
      
    } catch (error) {
      console.error('❌ Get protected pricing breakdown error:', error);
      throw error;
    }
  },

  /**
   * Test the pricing calculation with sample data
   */
  async testPricingCalculation(restaurantId) {
    try {
      console.log('🧪 Testing VediAPI pricing calculation...');
      
      const testAmounts = [2500, 4600, 10000]; // $25, $46, $100
      
      for (const amount of testAmounts) {
        console.log(`\n💰 Testing $${amount/100} order:`);
        try {
          const result = await this.getProtectedPricingBreakdown(restaurantId, amount);
          console.log('  📊 Results:', {
            subtotal: `$${result.subtotal}`,
            tax: `$${result.taxAmount} (${result.taxRate}%)`,
            serviceFee: `$${result.serviceFee} (${result.serviceFeePercentage.toFixed(1)}%)`,
            total: `$${result.total}`,
            marginProtected: result.breakdown.marginProtected
          });
        } catch (error) {
          console.error(`  ❌ Test failed for $${amount/100}:`, error.message);
        }
      }
      
    } catch (error) {
      console.error('❌ Test failed:', error);
    }
  },

  /**
   * Get diagnostic information about the current state
   */
  getDiagnostics() {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      vediAPIAvailable: typeof VediAPI !== 'undefined',
      vediAPIMethods: typeof VediAPI !== 'undefined' ? Object.keys(VediAPI) : [],
      extensionsLoaded: typeof this.calculateProtectedPricing === 'function',
      windowVediAPI: typeof window.VediAPI !== 'undefined',
      globalVediAPI: typeof globalThis.VediAPI !== 'undefined'
    };
    
    if (typeof VediAPI !== 'undefined') {
      diagnostics.requiredMethods = {
        getFeeConfig: typeof VediAPI.getFeeConfig === 'function',
        calculateProtectedPricing: typeof VediAPI.calculateProtectedPricing === 'function',
        getProtectedPricingBreakdown: typeof VediAPI.getProtectedPricingBreakdown === 'function'
      };
    }
    
    return diagnostics;
  }
};

/**
 * Enhanced VediAPI Extension Manager
 */
const VediAPIExtensionManager = {
  
  DEBUG: true,
  maxAttempts: 150, // 15 seconds max wait time
  attemptInterval: 100, // Check every 100ms
  
  log(...args) {
    if (this.DEBUG) {
      console.log('🔧 [Extension Manager]', ...args);
    }
  },

  /**
   * Find VediAPI in various possible locations
   */
  findVediAPI() {
    const possibleLocations = [
      () => window.VediAPI,
      () => window.FirebaseAPI,
      () => globalThis.VediAPI,
      () => globalThis.FirebaseAPI,
      () => typeof VediAPI !== 'undefined' ? VediAPI : null,
      () => typeof FirebaseAPI !== 'undefined' ? FirebaseAPI : null
    ];
    
    for (let i = 0; i < possibleLocations.length; i++) {
      try {
        const api = possibleLocations[i]();
        if (api && typeof api === 'object' && Object.keys(api).length > 0) {
          this.log(`Found VediAPI at location ${i + 1}:`, Object.keys(api).slice(0, 5));
          return api;
        }
      } catch (error) {
        // Silent fail - try next location
      }
    }
    
    return null;
  },

  /**
   * Extend VediAPI with pricing methods
   */
  extendVediAPI() {
    const vediAPI = this.findVediAPI();
    
    if (!vediAPI) {
      return false;
    }
    
    // Extend the API with our methods
    Object.assign(vediAPI, VediAPIPricingExtensions);
    
    // Ensure it's available in all possible locations
    if (typeof window !== 'undefined') {
      window.VediAPI = vediAPI;
    }
    if (typeof globalThis !== 'undefined') {
      globalThis.VediAPI = vediAPI;
    }
    
    // Verify the extension worked
    const hasExtensions = typeof vediAPI.calculateProtectedPricing === 'function' &&
                         typeof vediAPI.getProtectedPricingBreakdown === 'function';
    
    if (hasExtensions) {
      this.log('✅ VediAPI successfully extended with pricing methods');
      this.log('📊 Total VediAPI methods:', Object.keys(vediAPI).length);
      return true;
    } else {
      this.log('❌ Failed to extend VediAPI with pricing methods');
      return false;
    }
  },

  /**
   * Wait for VediAPI to become available and extend it
   */
  async waitForVediAPIAndExtend() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      
      const checkAndExtend = () => {
        this.log(`Attempt ${attempts + 1}/${this.maxAttempts} to find and extend VediAPI...`);
        
        if (this.extendVediAPI()) {
          this.log(`✅ VediAPI extended successfully after ${attempts + 1} attempts (${(attempts + 1) * this.attemptInterval}ms)`);
          resolve(true);
          return;
        }
        
        attempts++;
        
        if (attempts >= this.maxAttempts) {
          const diagnostics = VediAPIPricingExtensions.getDiagnostics();
          this.log('❌ Failed to extend VediAPI after max attempts');
          this.log('📊 Final diagnostics:', diagnostics);
          reject(new Error(`VediAPI not found after ${this.maxAttempts * this.attemptInterval}ms`));
          return;
        }
        
        setTimeout(checkAndExtend, this.attemptInterval);
      };
      
      checkAndExtend();
    });
  },

  /**
   * Initialize the extensions with comprehensive error handling
   */
  async initialize() {
    try {
      this.log('🚀 Initializing VediAPI Pricing Extensions...');
      
      // Try immediate extension first
      if (this.extendVediAPI()) {
        this.log('✅ VediAPI extended immediately');
        return true;
      }
      
      // If not available immediately, wait for it
      this.log('⏳ VediAPI not immediately available, waiting...');
      await this.waitForVediAPIAndExtend();
      
      // Run a quick test to ensure everything works
      this.log('🧪 Running extension verification test...');
      const diagnostics = VediAPIPricingExtensions.getDiagnostics();
      this.log('📊 Extension diagnostics:', diagnostics);
      
      if (diagnostics.extensionsLoaded && diagnostics.requiredMethods?.getFeeConfig) {
        this.log('🎉 VediAPI Pricing Extensions fully initialized and verified!');
        return true;
      } else {
        throw new Error('Extension verification failed');
      }
      
    } catch (error) {
      console.error('❌ Failed to initialize VediAPI Pricing Extensions:', error);
      
      // Provide helpful debugging information
      const diagnostics = VediAPIPricingExtensions.getDiagnostics();
      console.error('📊 Diagnostics at time of failure:', diagnostics);
      console.error('💡 Troubleshooting tips:');
      console.error('   1. Ensure firebase-api.js is loaded before this file');
      console.error('   2. Check browser console for Firebase initialization errors');
      console.error('   3. Verify Firebase configuration is correct');
      
      throw error;
    }
  }
};

// Auto-initialize when script loads
(async () => {
  try {
    await VediAPIExtensionManager.initialize();
  } catch (error) {
    console.warn('⚠️ Auto-initialization failed, manual initialization may be required');
    console.warn('💡 Call window.initializeVediAPIExtensions() to retry');
  }
})();

// Expose initialization function globally for manual retry
window.initializeVediAPIExtensions = () => VediAPIExtensionManager.initialize();
window.testVediAPIPricing = (restaurantId) => VediAPIPricingExtensions.testPricingCalculation(restaurantId);
window.getVediAPIDiagnostics = () => VediAPIPricingExtensions.getDiagnostics();

console.log('💰 VediAPI Pricing Extensions v2.0.0 loaded');
console.log('🛡️ Features: Protected margin calculation, comprehensive debugging, robust loading');
console.log('🔧 Debug functions: window.testVediAPIPricing(restaurantId), window.getVediAPIDiagnostics()');
console.log('🔄 Manual init: window.initializeVediAPIExtensions()');
