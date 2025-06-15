// vediapi-pricing-extensions.js - Enhanced with Venue Fee Management
// UPDATED VERSION with venue fee configuration and calculation support

/**
 * VediAPI Extensions for Protected Pricing with Venue Fee Support (Browser Version)
 * Ensures your platform margin is preserved from Stripe processing fees
 * NOW INCLUDES: Venue fee management and calculation
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
   * Get complete fee configuration including venue fees
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Complete fee configuration
   */
  async getCompleteFeeConfig(restaurantId) {
    try {
      this.debug('📋 Getting complete fee configuration for restaurant:', restaurantId);
      
      // Get base fee config from VediAPI
      const baseFeeConfig = await VediAPI.getFeeConfig(restaurantId);
      this.debug('📋 Base fee config:', baseFeeConfig);
      
      // Try to get venue-specific configuration
      let venueFeeConfig = null;
      if (baseFeeConfig.venueId) {
        try {
          // Check if restaurant belongs to a venue and get venue fee configuration
          const restaurant = await VediAPI.getRestaurant(restaurantId);
          if (restaurant.venueId) {
            venueFeeConfig = await VediAPI.getVenueFeeConfig(restaurant.venueId);
            this.debug('🏢 Venue fee config:', venueFeeConfig);
          }
        } catch (error) {
          this.debug('⚠️ No venue fee config found:', error.message);
        }
      }
      
      // Combine configurations
      const completeFeeConfig = {
        ...baseFeeConfig,
        // Venue fee configuration
        venueFeePercentage: venueFeeConfig?.defaultFeePercentage || baseFeeConfig.venueFeePercentage || 0,
        venueId: venueFeeConfig?.venueId || null,
        venueName: venueFeeConfig?.venueName || null,
        // Override with restaurant-specific venue fee if set
        restaurantVenueFeeOverride: baseFeeConfig.venueFeePercentage || null
      };
      
      this.debug('✅ Complete fee configuration:', completeFeeConfig);
      return completeFeeConfig;
      
    } catch (error) {
      console.error('❌ Error getting complete fee config:', error);
      throw error;
    }
  },

  /**
   * Calculate protected pricing with venue fee support
   * @param {string} restaurantId - Restaurant ID
   * @param {number} subtotalCents - Subtotal in cents
   * @returns {Promise<Object>} Protected pricing breakdown including venue fees
   */
  async calculateProtectedPricing(restaurantId, subtotalCents) {
    try {
      this.debug('🧮 Starting protected pricing calculation with venue fees...');
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
      
      // Get complete fee configuration including venue fees
      this.debug('🔄 Fetching complete fee configuration...');
      const feeConfig = await this.getCompleteFeeConfig(restaurantId);
      this.debug('⚙️ Complete fee config loaded:', feeConfig);
      
      // Validate fee config
      if (!feeConfig) {
        throw new Error(`No fee configuration found for restaurant ${restaurantId}`);
      }

      const subtotal = subtotalCents / 100;
      this.debug('💰 Subtotal:', subtotal);
      
      // Step 1: Calculate desired service fee (platform fee)
      let desiredServiceFee = 0;
      
      const feeType = feeConfig.feeType || 'fixed';
      const fixedFee = feeConfig.serviceFeeFixed || 0;
      const percentageFee = feeConfig.serviceFeePercentage || 0;
      
      this.debug('🎯 Platform fee structure:', { feeType, fixedFee, percentageFee });
      
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
      
      this.debug('💵 Desired platform service fee:', desiredServiceFee);

      // Step 2: Calculate venue fee
      let desiredVenueFee = 0;
      const venueFeePercentage = feeConfig.venueFeePercentage || 0;
      
      if (venueFeePercentage > 0) {
        desiredVenueFee = subtotal * (venueFeePercentage / 100);
        this.debug('🏢 Desired venue fee:', desiredVenueFee, `(${venueFeePercentage}%)`);
      } else {
        this.debug('🏢 No venue fee configured');
      }

      // Step 3: Calculate tax
      const taxRate = feeConfig.taxRate || 0.085; // Default to 8.5% if not set
      const taxAmount = subtotal * taxRate;
      this.debug('🏛️ Tax calculation:', { taxRate: taxRate * 100 + '%', taxAmount });

      // Step 4: Calculate base amount (what we want to keep after payment processing)
      const baseAmount = subtotal + taxAmount + desiredServiceFee + desiredVenueFee;
      this.debug('📋 Base amount (subtotal + tax + platform fee + venue fee):', baseAmount);

      // Step 5: Get Stripe fees for this restaurant
      const stripePct = (feeConfig.stripeFeePercentage || 2.9) / 100;
      const stripeFlat = (feeConfig.stripeFlatFee || 30) / 100;
      this.debug('💳 Stripe fees:', { 
        percentage: stripePct * 100 + '%', 
        flat: stripeFlat,
        flatCents: feeConfig.stripeFlatFee || 30
      });

      // Step 6: GROSS-UP FORMULA - Calculate what customer needs to pay
      // Formula: customerTotal = (baseAmount + stripeFlat) / (1 - stripePct)
      const customerTotal = (baseAmount + stripeFlat) / (1 - stripePct);
      
      // Calculate displayed fees
      const displayedServiceFee = customerTotal - subtotal - taxAmount - (customerTotal - subtotal - taxAmount) * (venueFeePercentage / 100);
      const displayedVenueFee = (customerTotal - subtotal - taxAmount) * (venueFeePercentage / 100);
      
      const serviceFeePercentage = subtotal > 0 ? (displayedServiceFee / subtotal) * 100 : 0;
      const venueFeeDisplayPercentage = venueFeePercentage; // This remains the same

      this.debug('🎯 Gross-up calculation result:', {
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
      
      this.debug('🔍 Verification:', {
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
          venueFeCents: Math.round(displayedVenueFee * 100), // NEW: Venue fee
          totalCents: Math.round(customerTotal * 100),
          serviceFeePercentage: Number(serviceFeePercentage.toFixed(2)),
          venueFeePercentage: Number(venueFeeDisplayPercentage.toFixed(2)), // NEW: Venue fee percentage
          taxRate: Number((taxRate * 100).toFixed(2)),
          desiredServiceFeeCents: Math.round(desiredServiceFee * 100),
          desiredVenueFeeCents: Math.round(desiredVenueFee * 100), // NEW: Desired venue fee
          stripeFeePercentage: Number((stripePct * 100).toFixed(2)),
          stripeFlatFee: feeConfig.stripeFlatFee || 30,
          marginProtected: true,
          venueId: feeConfig.venueId, // NEW: Venue information
          venueName: feeConfig.venueName, // NEW: Venue name
          calculationTimestamp: new Date().toISOString()
        }
      };

      this.debug('✅ Protected pricing calculation with venue fees complete:', result.quote);
      return result;

    } catch (error) {
      console.error('❌ VediAPI protected pricing calculation with venue fees error:', error);
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
   * Get comprehensive pricing breakdown for display including venue fees
   * @param {string} restaurantId - Restaurant ID  
   * @param {number} subtotalCents - Subtotal in cents
   * @returns {Promise<Object>} Detailed pricing breakdown for UI including venue fees
   */
  async getProtectedPricingBreakdown(restaurantId, subtotalCents) {
    try {
      this.debug('📊 Getting protected pricing breakdown with venue fees...');
      
      const pricingResult = await this.calculateProtectedPricing(restaurantId, subtotalCents);
      const quote = pricingResult.quote;
      const feeConfig = await this.getCompleteFeeConfig(restaurantId);
      
      const breakdown = {
        // Customer-facing amounts (what they see and pay)
        subtotal: quote.subtotalCents / 100,
        taxAmount: quote.taxCents / 100,
        serviceFee: quote.serviceFeCents / 100,
        venueFee: quote.venueFeCents / 100, // NEW: Venue fee
        total: quote.totalCents / 100,
        
        // Display percentages
        taxRate: quote.taxRate,
        serviceFeePercentage: quote.serviceFeePercentage,
        venueFeePercentage: quote.venueFeePercentage, // NEW: Venue fee percentage
        
        // Behind-the-scenes breakdown (for testing/admin)
        breakdown: {
          desiredServiceFee: quote.desiredServiceFeeCents / 100,
          desiredVenueFee: quote.desiredVenueFeeCents / 100, // NEW: Desired venue fee
          actualServiceFee: quote.serviceFeCents / 100,
          actualVenueFee: quote.venueFeCents / 100, // NEW: Actual venue fee
          stripeFeePercentage: quote.stripeFeePercentage,
          stripeFlatFee: quote.stripeFlatFee,
          grossUpAmount: ((quote.serviceFeCents + quote.venueFeCents) - (quote.desiredServiceFeeCents + quote.desiredVenueFeeCents)) / 100,
          marginProtected: quote.marginProtected,
          calculationMethod: 'vediapi-extensions-with-venue'
        },
        
        // Venue information
        venue: {
          venueId: quote.venueId,
          venueName: quote.venueName,
          feePercentage: quote.venueFeePercentage,
          monthlyEarnings: (quote.venueFeCents / 100) * 30 // Estimated monthly earnings
        },
        
        // Configuration used
        feeConfig: {
          restaurantId,
          feeType: feeConfig.feeType,
          serviceFeeFixed: feeConfig.serviceFeeFixed,
          serviceFeePercentage: feeConfig.serviceFeePercentage,
          venueFeePercentage: feeConfig.venueFeePercentage, // NEW: Venue fee config
          taxRate: feeConfig.taxRate,
          stripeFeePercentage: feeConfig.stripeFeePercentage,
          stripeFlatFee: feeConfig.stripeFlatFee,
          isNegotiated: feeConfig.isNegotiated || false
        },
        
        // Metadata
        meta: {
          timestamp: quote.calculationTimestamp,
          version: '2.1.0', // Updated version with venue support
          includesVenueFees: true
        }
      };
      
      this.debug('✅ Pricing breakdown with venue fees complete:', breakdown);
      return breakdown;
      
    } catch (error) {
      console.error('❌ Get protected pricing breakdown with venue fees error:', error);
      throw error;
    }
  },

  /**
   * Test the pricing calculation with venue fees using sample data
   */
  async testPricingCalculation(restaurantId) {
    try {
      console.log('🧪 Testing VediAPI pricing calculation with venue fees...');
      
      const testAmounts = [2500, 4600, 10000]; // $25, $46, $100
      
      for (const amount of testAmounts) {
        console.log(`\n💰 Testing $${amount/100} order:`);
        try {
          const result = await this.getProtectedPricingBreakdown(restaurantId, amount);
          console.log('  📊 Results:', {
            subtotal: `$${result.subtotal}`,
            tax: `$${result.taxAmount} (${result.taxRate}%)`,
            serviceFee: `$${result.serviceFee} (${result.serviceFeePercentage.toFixed(1)}%)`,
            venueFee: `$${result.venueFee} (${result.venueFeePercentage.toFixed(1)}%)`, // NEW
            total: `$${result.total}`,
            marginProtected: result.breakdown.marginProtected,
            venue: result.venue.venueName || 'No venue'
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
   * Get diagnostic information about the current state including venue support
   */
  getDiagnostics() {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      vediAPIAvailable: typeof VediAPI !== 'undefined',
      vediAPIMethods: typeof VediAPI !== 'undefined' ? Object.keys(VediAPI) : [],
      extensionsLoaded: typeof this.calculateProtectedPricing === 'function',
      venueFeeSupportEnabled: true, // NEW: Indicates venue fee support
      windowVediAPI: typeof window.VediAPI !== 'undefined',
      globalVediAPI: typeof globalThis.VediAPI !== 'undefined'
    };
    
    if (typeof VediAPI !== 'undefined') {
      diagnostics.requiredMethods = {
        getFeeConfig: typeof VediAPI.getFeeConfig === 'function',
        getVenueFeeConfig: typeof VediAPI.getVenueFeeConfig === 'function', // NEW
        calculateProtectedPricing: typeof VediAPI.calculateProtectedPricing === 'function',
        getProtectedPricingBreakdown: typeof VediAPI.getProtectedPricingBreakdown === 'function'
      };
    }
    
    return diagnostics;
  }
};

// Rest of the extension manager code remains the same...
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
   * Extend VediAPI with pricing methods including venue support
   */
  extendVediAPI() {
    const vediAPI = this.findVediAPI();
    
    if (!vediAPI) {
      return false;
    }
    
    // Extend the API with our methods including venue support
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
      this.log('✅ VediAPI successfully extended with pricing methods including venue fee support');
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
      this.log('🚀 Initializing VediAPI Pricing Extensions with Venue Fee Support...');
      
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
        this.log('🎉 VediAPI Pricing Extensions with Venue Fee Support fully initialized and verified!');
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

console.log('💰 VediAPI Pricing Extensions v2.1.0 loaded');
console.log('🛡️ Features: Protected margin calculation, venue fee support, comprehensive debugging, robust loading');
console.log('🏢 NEW: Full venue fee management and calculation support');
console.log('🔧 Debug functions: window.testVediAPIPricing(restaurantId), window.getVediAPIDiagnostics()');
console.log('🔄 Manual init: window.initializeVediAPIExtensions()');
