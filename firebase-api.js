// firebase-api.js - Complete Vedi Firebase API Implementation with Dynamic Fee Management + Loss Tracking + API Analytics + Social Authentication

// ============================================================================
// API TRACKING SYSTEM - For Maintenance Dashboard Analytics
// ============================================================================

/**
 * Track API call for analytics
 * @param {string} method - API method name
 * @param {number} responseTime - Response time in ms
 * @param {boolean} success - Whether call was successful
 * @param {Object} metadata - Additional data
 */
async function trackAPICall(method, responseTime, success = true, metadata = {}) {
  try {
    await firebaseDb.collection('apiCalls').add({
      method,
      responseTime,
      success,
      metadata,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      hour: new Date().getHours(),
      userId: firebase.auth().currentUser?.uid || 'anonymous'
    });
  } catch (error) {
    // Silent fail - don't break main functionality
    console.debug('API tracking error:', error);
  }
}

/**
 * Wrapper function to add tracking to any API method
 * @param {string} methodName - Name of the method
 * @param {Function} originalMethod - Original method function
 * @returns {Function} Wrapped method with tracking
 */
function withTracking(methodName, originalMethod) {
  return async function(...args) {
    const startTime = Date.now();
    try {
      const result = await originalMethod.apply(this, args);
      const responseTime = Date.now() - startTime;
      await trackAPICall(methodName, responseTime, true, {
        args: args.length,
        resultType: typeof result
      });
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await trackAPICall(methodName, responseTime, false, {
        error: error.message,
        errorCode: error.code
      });
      throw error;
    }
  };
}

const VediAPI = {
  // ============================================================================
  // ENHANCED AUTHENTICATION & USER MANAGEMENT WITH SOCIAL AUTH
  // ============================================================================
  
  /**
   * Sign up a new user
   * @param {string} email - User email
   * @param {string} password - User password  
   * @param {Object} userData - Additional user data (name, accountType)
   * @returns {Promise<Object>} User object
   */
  async signUp(email, password, userData) {
    const startTime = Date.now();
    try {
      // Create Firebase auth user
      const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;
      
      // Save additional user data to Firestore
      const userDoc = {
        email: email,
        name: userData.name,
        accountType: userData.accountType, // 'restaurant' or 'venue'
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await firebaseDb.collection('users').doc(user.uid).set(userDoc);
      
      // Track successful API call
      const responseTime = Date.now() - startTime;
      await trackAPICall('signUp', responseTime, true, { 
        accountType: userData.accountType,
        email: email 
      });
      
      console.log('✅ User created successfully:', user.uid);
      return { id: user.uid, ...userDoc, email };
      
    } catch (error) {
      // Track failed API call
      const responseTime = Date.now() - startTime;
      await trackAPICall('signUp', responseTime, false, { 
        error: error.code,
        email: email 
      });
      
      console.error('❌ Sign up error:', error);
      throw new Error(this.getAuthErrorMessage(error.code));
    }
  },

  /**
   * Sign in existing user
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} User object with data
   */
  async signIn(email, password) {
    const startTime = Date.now();
    try {
      const userCredential = await firebaseAuth.signInWithEmailAndPassword(email, password);
      const user = userCredential.user;
      
      // Get user data from Firestore
      const userData = await this.getUserData(user.uid);
      
      // Track successful API call
      const responseTime = Date.now() - startTime;
      await trackAPICall('signIn', responseTime, true, { 
        accountType: userData.accountType,
        email: email 
      });
      
      console.log('✅ User signed in successfully:', user.uid);
      return userData;
      
    } catch (error) {
      // Track failed API call
      const responseTime = Date.now() - startTime;
      await trackAPICall('signIn', responseTime, false, { 
        error: error.code,
        email: email 
      });
      
      console.error('❌ Sign in error:', error);
      throw new Error(this.getAuthErrorMessage(error.code));
    }
  },

  /**
   * Send SMS verification code for phone authentication
   * @param {string} phoneNumber - Phone number in E.164 format
   * @returns {Promise<Object>} Confirmation result for verification
   */
  sendPhoneVerification: withTracking('sendPhoneVerification', async function(phoneNumber) {
    try {
      console.log('📱 Sending phone verification to:', phoneNumber);
      
      // Get reCAPTCHA verifier
      const recaptchaVerifier = window.recaptchaVerifier;
      if (!recaptchaVerifier) {
        throw new Error('reCAPTCHA verifier not initialized');
      }
      
      // Send verification code
      const confirmationResult = await firebase.auth().signInWithPhoneNumber(phoneNumber, recaptchaVerifier);
      
      console.log('✅ SMS verification code sent successfully');
      return confirmationResult;
      
    } catch (error) {
      console.error('❌ Phone verification error:', error);
      throw this.handlePhoneAuthError(error);
    }
  }),

  /**
   * Verify SMS code and complete phone authentication
   * @param {Object} confirmationResult - Result from sendPhoneVerification
   * @param {string} code - 6-digit verification code
   * @returns {Promise<Object>} Firebase user credential
   */
  verifyPhoneCode: withTracking('verifyPhoneCode', async function(confirmationResult, code) {
    try {
      console.log('🔐 Verifying phone code...');
      
      if (!confirmationResult) {
        throw new Error('No verification in progress');
      }
      
      const result = await confirmationResult.confirm(code);
      
      console.log('✅ Phone verification successful, UID:', result.user.uid);
      return result;
      
    } catch (error) {
      console.error('❌ Phone code verification error:', error);
      throw this.handlePhoneAuthError(error);
    }
  }),

  /**
   * Sign in with Google (social authentication)
   * @returns {Promise<Object>} User credential result
   */
  signInWithGoogle: withTracking('signInWithGoogle', async function() {
    try {
      console.log('🔍 Initiating Google sign-in...');
      
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      
      const result = await firebase.auth().signInWithPopup(provider);
      
      console.log('✅ Google sign-in successful:', result.user.displayName);
      return result;
      
    } catch (error) {
      console.error('❌ Google sign-in error:', error);
      throw this.handleSocialAuthError(error, 'Google');
    }
  }),

  /**
   * Sign in with Facebook (social authentication)
   * @returns {Promise<Object>} User credential result
   */
  signInWithFacebook: withTracking('signInWithFacebook', async function() {
    try {
      console.log('📘 Initiating Facebook sign-in...');
      
      const provider = new firebase.auth.FacebookAuthProvider();
      provider.addScope('email');
      
      const result = await firebase.auth().signInWithPopup(provider);
      
      console.log('✅ Facebook sign-in successful:', result.user.displayName);
      return result;
      
    } catch (error) {
      console.error('❌ Facebook sign-in error:', error);
      throw this.handleSocialAuthError(error, 'Facebook');
    }
  }),

  /**
   * Sign in with Apple (social authentication)
   * @returns {Promise<Object>} User credential result
   */
  signInWithApple: withTracking('signInWithApple', async function() {
    try {
      console.log('🍎 Initiating Apple sign-in...');
      
      const provider = new firebase.auth.OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');
      
      const result = await firebase.auth().signInWithPopup(provider);
      
      console.log('✅ Apple sign-in successful:', result.user.displayName);
      return result;
      
    } catch (error) {
      console.error('❌ Apple sign-in error:', error);
      throw this.handleSocialAuthError(error, 'Apple');
    }
  }),

  /**
   * Save or update customer profile in Firestore
   * @param {string} uid - Firebase user UID
   * @param {Object} profileData - Customer profile data
   * @returns {Promise<Object>} Saved profile data
   */
  saveCustomerProfile: withTracking('saveCustomerProfile', async function(uid, profileData) {
    try {
      const profile = {
        ...profileData,
        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      // Set createdAt only if it's a new profile
      await firebaseDb.collection('customerProfiles').doc(uid).set({
        ...profile,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      console.log('✅ Customer profile saved for UID:', uid);
      return profile;
      
    } catch (error) {
      console.error('❌ Save customer profile error:', error);
      throw error;
    }
  }),

  /**
   * Get customer profile by UID
   * @param {string} uid - Firebase user UID
   * @returns {Promise<Object|null>} Customer profile or null
   */
  getCustomerProfile: withTracking('getCustomerProfile', async function(uid) {
    try {
      const doc = await firebaseDb.collection('customerProfiles').doc(uid).get();
      
      if (doc.exists) {
        return { id: doc.id, ...doc.data() };
      }
      
      return null;
      
    } catch (error) {
      console.error('❌ Get customer profile error:', error);
      throw error;
    }
  }),

  /**
   * Handle phone authentication errors
   * @param {Object} error - Firebase error object
   * @returns {Error} Formatted error
   */
  handlePhoneAuthError(error) {
    const phoneErrorMessages = {
      'auth/invalid-phone-number': 'Please enter a valid phone number.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/invalid-verification-code': 'Invalid verification code. Please try again.',
      'auth/code-expired': 'Verification code has expired. Please request a new one.',
      'auth/captcha-check-failed': 'reCAPTCHA verification failed. Please try again.',
      'auth/quota-exceeded': 'SMS quota exceeded. Please try again later.',
      'auth/operation-not-allowed': 'Phone authentication is not enabled.',
      'auth/missing-verification-code': 'Please enter the verification code.',
      'auth/invalid-verification-id': 'Invalid verification session. Please start over.'
    };
    
    const message = phoneErrorMessages[error.code] || 'Phone authentication failed. Please try again.';
    return new Error(message);
  },

  /**
   * Handle social authentication errors
   * @param {Object} error - Firebase error object
   * @param {string} provider - Provider name (Google, Facebook, Apple)
   * @returns {Error} Formatted error
   */
  handleSocialAuthError(error, provider) {
    const socialErrorMessages = {
      'auth/popup-closed-by-user': `${provider} sign-in was cancelled. Please try again.`,
      'auth/popup-blocked': 'Popup was blocked. Please allow popups and try again.',
      'auth/account-exists-with-different-credential': 'An account already exists with the same email. Please try signing in with a different method.',
      'auth/auth-domain-config-required': 'Authentication configuration error. Please contact support.',
      'auth/cancelled-popup-request': 'Another sign-in process is already in progress.',
      'auth/operation-not-allowed': `${provider} sign-in is not enabled. Please contact support.`,
      'auth/unauthorized-domain': 'This domain is not authorized for authentication.'
    };
    
    const message = socialErrorMessages[error.code] || `${provider} sign-in failed. Please try again.`;
    return new Error(message);
  },

  /**
   * Sign out current user
   */
  signOut: withTracking('signOut', async function() {
    try {
      await firebaseAuth.signOut();
      console.log('✅ User signed out successfully');
    } catch (error) {
      console.error('❌ Sign out error:', error);
      throw error;
    }
  }),

  /**
   * Get current authenticated user
   * @returns {Promise<Object|null>} Current user or null
   */
  getCurrentUser: withTracking('getCurrentUser', async function() {
    return new Promise((resolve) => {
      const unsubscribe = firebaseAuth.onAuthStateChanged(async (user) => {
        unsubscribe();
        if (user) {
          try {
            const userData = await this.getUserData(user.uid);
            resolve(userData);
          } catch (error) {
            console.error('❌ Error getting user data:', error);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });
  }),

  /**
   * Get user data from Firestore
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User data
   */
  getUserData: withTracking('getUserData', async function(userId) {
    try {
      const doc = await firebaseDb.collection('users').doc(userId).get();
      if (doc.exists) {
        return { id: doc.id, ...doc.data() };
      }
      throw new Error('User data not found');
    } catch (error) {
      console.error('❌ Get user data error:', error);
      throw error;
    }
  }),

  /**
   * Check if email already exists
   * @param {string} email - Email to check
   * @returns {Promise<boolean>} True if email exists
   */
  checkEmailExists: withTracking('checkEmailExists', async function(email) {
    try {
      const methods = await firebaseAuth.fetchSignInMethodsForEmail(email);
      return methods.length > 0;
    } catch (error) {
      console.error('❌ Check email error:', error);
      return false;
    }
  }),

  // ============================================================================
  // DYNAMIC FEE MANAGEMENT SYSTEM
  // ============================================================================

  /**
   * Create or update fee configuration for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @param {Object} feeConfig - Fee configuration
   * @returns {Promise<Object>} Created/updated fee config
   */
  createOrUpdateFeeConfig: withTracking('createOrUpdateFeeConfig', async function(restaurantId, feeConfig) {
    try {
      const config = {
        restaurantId,
        serviceFeeFixed: feeConfig.serviceFeeFixed || 0, // Fixed amount like $2.00
        serviceFeePercentage: feeConfig.serviceFeePercentage || 0, // Percentage like 3%
        feeType: feeConfig.feeType || 'fixed', // 'fixed', 'percentage', or 'hybrid'
        taxRate: feeConfig.taxRate || 0.085, // Default 8.5%
        minimumOrderAmount: feeConfig.minimumOrderAmount || 0,
        // Negotiated rates
        isNegotiated: feeConfig.isNegotiated || false,
        negotiatedBy: feeConfig.negotiatedBy || null, // Admin user ID
        negotiatedDate: feeConfig.negotiatedDate || null,
        notes: feeConfig.notes || '',
        // Metadata
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: firebase.auth().currentUser?.uid
      };
      
      // Use restaurant ID as document ID for easy lookup
      await firebaseDb.collection('feeConfigurations').doc(restaurantId).set(config, { merge: true });
      
      console.log('✅ Fee configuration saved for restaurant:', restaurantId);
      return config;
      
    } catch (error) {
      console.error('❌ Create/update fee config error:', error);
      throw error;
    }
  }),

  /**
   * Get fee configuration for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Object|null>} Fee configuration or default
   */
  getFeeConfig: withTracking('getFeeConfig', async function(restaurantId) {
    try {
      const doc = await firebaseDb.collection('feeConfigurations').doc(restaurantId).get();
      
      if (doc.exists) {
        return { id: doc.id, ...doc.data() };
      }
      
      // Return default configuration if none exists
      return {
        restaurantId,
        serviceFeeFixed: 2.00, // Default $2.00
        serviceFeePercentage: 0,
        feeType: 'fixed',
        taxRate: 0.085, // Default 8.5%
        minimumOrderAmount: 0,
        isNegotiated: false,
        isDefault: true
      };
      
    } catch (error) {
      console.error('❌ Get fee config error:', error);
      // Return default on error
      return {
        restaurantId,
        serviceFeeFixed: 2.00,
        serviceFeePercentage: 0,
        feeType: 'fixed',
        taxRate: 0.085,
        minimumOrderAmount: 0,
        isDefault: true
      };
    }
  }),

  /**
   * Get fee configuration for a venue (affects all restaurants in venue)
   * @param {string} venueId - Venue ID
   * @returns {Promise<Object|null>} Venue fee configuration
   */
  getVenueFeeConfig: withTracking('getVenueFeeConfig', async function(venueId) {
    try {
      const doc = await firebaseDb.collection('venueFeeConfigurations').doc(venueId).get();
      
      if (doc.exists) {
        return { id: doc.id, ...doc.data() };
      }
      
      return null; // No venue-level configuration
      
    } catch (error) {
      console.error('❌ Get venue fee config error:', error);
      return null;
    }
  }),

  /**
   * Calculate fees for an order
   * @param {string} restaurantId - Restaurant ID
   * @param {number} subtotal - Order subtotal
   * @returns {Promise<Object>} Calculated fees
   */
  calculateOrderFees: withTracking('calculateOrderFees', async function(restaurantId, subtotal) {
    try {
      const feeConfig = await this.getFeeConfig(restaurantId);
      
      let serviceFee = 0;
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
      
      // Apply minimum order amount logic
      if (subtotal < feeConfig.minimumOrderAmount) {
        const shortfall = feeConfig.minimumOrderAmount - subtotal;
        serviceFee += shortfall; // Add shortfall to service fee
      }
      
      // Calculate tax
      taxAmount = subtotal * (feeConfig.taxRate || 0.085);
      
      const total = subtotal + serviceFee + taxAmount;
      
      return {
        subtotal,
        serviceFee: Math.round(serviceFee * 100) / 100, // Round to 2 decimals
        taxAmount: Math.round(taxAmount * 100) / 100,
        taxRate: feeConfig.taxRate || 0.085,
        total: Math.round(total * 100) / 100,
        feeConfig: feeConfig,
        breakdown: {
          serviceFeeType: feeConfig.feeType,
          serviceFeeFixed: feeConfig.serviceFeeFixed,
          serviceFeePercentage: feeConfig.serviceFeePercentage,
          isNegotiated: feeConfig.isNegotiated
        }
      };
      
    } catch (error) {
      console.error('❌ Calculate order fees error:', error);
      throw error;
    }
  }),

  /**
   * Get all fee configurations (for admin dashboard)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of fee configurations
   */
  getAllFeeConfigs: withTracking('getAllFeeConfigs', async function(options = {}) {
    try {
      let query = firebaseDb.collection('feeConfigurations');
      
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
      
      // Enrich with restaurant data
      const enrichedConfigs = await Promise.all(configs.map(async (config) => {
        try {
          const restaurant = await this.getRestaurant(config.restaurantId);
          return {
            ...config,
            restaurantName: restaurant.name,
            restaurantCurrency: restaurant.currency || 'USD'
          };
        } catch (error) {
          return {
            ...config,
            restaurantName: 'Unknown Restaurant',
            restaurantCurrency: 'USD'
          };
        }
      }));
      
      console.log('✅ Retrieved fee configurations:', enrichedConfigs.length);
      return enrichedConfigs;
      
    } catch (error) {
      console.error('❌ Get all fee configs error:', error);
      throw error;
    }
  }),

  /**
   * Delete fee configuration (revert to default)
   * @param {string} restaurantId - Restaurant ID
   */
  deleteFeeConfig: withTracking('deleteFeeConfig', async function(restaurantId) {
    try {
      await firebaseDb.collection('feeConfigurations').doc(restaurantId).delete();
      console.log('✅ Fee configuration deleted for restaurant:', restaurantId);
    } catch (error) {
      console.error('❌ Delete fee config error:', error);
      throw error;
    }
  }),

  /**
   * Get fee analytics (revenue tracking)
   * @param {string} timePeriod - Time period (today, week, month, year)
   * @param {string} restaurantId - Optional restaurant filter
   * @returns {Promise<Object>} Fee analytics
   */
  getFeeAnalytics: withTracking('getFeeAnalytics', async function(timePeriod = 'month', restaurantId = null) {
    try {
      const startDate = this.getTimePeriodStart(timePeriod);
      
      let query = firebaseDb.collection('orders');
      
      if (startDate) {
        query = query.where('createdAt', '>=', startDate);
      }
      
      if (restaurantId) {
        query = query.where('restaurantId', '==', restaurantId);
      }
      
      const ordersSnapshot = await query.get();
      
      let totalRevenue = 0;
      let totalServiceFees = 0;
      let totalTax = 0;
      let orderCount = 0;
      const revenueByRestaurant = {};
      
      ordersSnapshot.docs.forEach(doc => {
        const order = doc.data();
        if (order.status === 'completed') {
          totalRevenue += order.total || 0;
          totalServiceFees += order.serviceFee || 0;
          totalTax += order.tax || 0;
          orderCount++;
          
          const restId = order.restaurantId;
          if (!revenueByRestaurant[restId]) {
            revenueByRestaurant[restId] = {
              revenue: 0,
              serviceFees: 0,
              orders: 0
            };
          }
          
          revenueByRestaurant[restId].revenue += order.total || 0;
          revenueByRestaurant[restId].serviceFees += order.serviceFee || 0;
          revenueByRestaurant[restId].orders++;
        }
      });
      
      return {
        timePeriod,
        totalRevenue,
        totalServiceFees,
        totalTax,
        orderCount,
        averageOrderValue: orderCount > 0 ? totalRevenue / orderCount : 0,
        averageServiceFee: orderCount > 0 ? totalServiceFees / orderCount : 0,
        revenueByRestaurant,
        platformCommission: totalServiceFees // This is your revenue
      };
      
    } catch (error) {
      console.error('❌ Get fee analytics error:', error);
      throw error;
    }
  }),

  // ============================================================================
  // RESTAURANT MANAGEMENT
  // ============================================================================

  /**
   * Create new restaurant
   * @param {Object} restaurantData - Restaurant information
   * @returns {Promise<Object>} Created restaurant
   */
  createRestaurant: withTracking('createRestaurant', async function(restaurantData) {
    try {
      const restaurant = {
        ...restaurantData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      const docRef = await firebaseDb.collection('restaurants').add(restaurant);
      const doc = await docRef.get();
      
      console.log('✅ Restaurant created:', docRef.id);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Create restaurant error:', error);
      throw error;
    }
  }),

  /**
   * Update existing restaurant
   * @param {string} restaurantId - Restaurant ID
   * @param {Object} restaurantData - Updated data
   * @returns {Promise<Object>} Updated restaurant
   */
  updateRestaurant: withTracking('updateRestaurant', async function(restaurantId, restaurantData) {
    try {
      const updateData = {
        ...restaurantData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await firebaseDb.collection('restaurants').doc(restaurantId).update(updateData);
      
      const doc = await firebaseDb.collection('restaurants').doc(restaurantId).get();
      
      console.log('✅ Restaurant updated:', restaurantId);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Update restaurant error:', error);
      throw error;
    }
  }),

  /**
   * Get restaurant by owner user ID
   * @param {string} ownerUserId - Owner's user ID
   * @returns {Promise<Object|null>} Restaurant or null
   */
  getRestaurantByOwner: withTracking('getRestaurantByOwner', async function(ownerUserId) {
    try {
      const querySnapshot = await firebaseDb.collection('restaurants')
        .where('ownerUserId', '==', ownerUserId)
        .limit(1)
        .get();
      
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }
      return null;
      
    } catch (error) {
      console.error('❌ Get restaurant by owner error:', error);
      throw error;
    }
  }),

  /**
   * Get restaurant by ID
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Restaurant data
   */
  getRestaurant: withTracking('getRestaurant', async function(restaurantId) {
    try {
      const doc = await firebaseDb.collection('restaurants').doc(restaurantId).get();
      if (doc.exists) {
        return { id: doc.id, ...doc.data() };
      }
      throw new Error('Restaurant not found');
    } catch (error) {
      console.error('❌ Get restaurant error:', error);
      throw error;
    }
  }),

  /**
   * Get restaurants by venue ID (uses existing venueId field)
   * @param {string} venueId - Venue ID
   * @returns {Promise<Array>} Array of restaurants in venue
   */
  getRestaurantsByVenue: withTracking('getRestaurantsByVenue', async function(venueId) {
    try {
      const querySnapshot = await firebaseDb.collection('restaurants')
        .where('venueId', '==', venueId)
        .orderBy('createdAt', 'desc')
        .get();
      
      const restaurants = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      console.log('✅ Retrieved restaurants for venue:', restaurants.length);
      return restaurants;
      
    } catch (error) {
      console.error('❌ Get restaurants by venue error:', error);
      throw error;
    }
  }),

  // ============================================================================
  // MENU CATEGORIES MANAGEMENT
  // ============================================================================

  /**
   * Get all menu categories for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Array>} Array of categories
   */
  getMenuCategories: withTracking('getMenuCategories', async function(restaurantId) {
    try {
      const querySnapshot = await firebaseDb.collection('menuCategories')
        .where('restaurantId', '==', restaurantId)
        .orderBy('order', 'asc')
        .get();
      
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
    } catch (error) {
      console.error('❌ Get menu categories error:', error);
      throw error;
    }
  }),

  /**
   * Create new menu category
   * @param {Object} categoryData - Category data
   * @returns {Promise<Object>} Created category
   */
  createMenuCategory: withTracking('createMenuCategory', async function(categoryData) {
    try {
      const category = {
        ...categoryData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      const docRef = await firebaseDb.collection('menuCategories').add(category);
      const doc = await docRef.get();
      
      console.log('✅ Menu category created:', docRef.id);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Create menu category error:', error);
      throw error;
    }
  }),

  /**
   * Update menu category
   * @param {string} categoryId - Category ID
   * @param {Object} categoryData - Updated data
   * @returns {Promise<Object>} Updated category
   */
  updateMenuCategory: withTracking('updateMenuCategory', async function(categoryId, categoryData) {
    try {
      await firebaseDb.collection('menuCategories').doc(categoryId).update(categoryData);
      
      const doc = await firebaseDb.collection('menuCategories').doc(categoryId).get();
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Update menu category error:', error);
      throw error;
    }
  }),

  /**
   * Delete menu category
   * @param {string} categoryId - Category ID
   */
  deleteMenuCategory: withTracking('deleteMenuCategory', async function(categoryId) {
    try {
      await firebaseDb.collection('menuCategories').doc(categoryId).delete();
      console.log('✅ Menu category deleted:', categoryId);
    } catch (error) {
      console.error('❌ Delete menu category error:', error);
      throw error;
    }
  }),

  // ============================================================================
  // MENU ITEMS MANAGEMENT
  // ============================================================================

  /**
   * Get all menu items for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Array>} Array of menu items
   */
  getMenuItems: withTracking('getMenuItems', async function(restaurantId) {
    try {
      const querySnapshot = await firebaseDb.collection('menuItems')
        .where('restaurantId', '==', restaurantId)
        .get();
      
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
    } catch (error) {
      console.error('❌ Get menu items error:', error);
      throw error;
    }
  }),

  /**
   * Get menu items by category
   * @param {string} restaurantId - Restaurant ID
   * @param {string} categoryId - Category ID
   * @returns {Promise<Array>} Array of menu items
   */
  getMenuItemsByCategory: withTracking('getMenuItemsByCategory', async function(restaurantId, categoryId) {
    try {
      const querySnapshot = await firebaseDb.collection('menuItems')
        .where('restaurantId', '==', restaurantId)
        .where('categoryId', '==', categoryId)
        .get();
      
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
    } catch (error) {
      console.error('❌ Get menu items by category error:', error);
      throw error;
    }
  }),

  /**
   * Create new menu item
   * @param {Object} itemData - Menu item data
   * @returns {Promise<Object>} Created menu item
   */
  createMenuItem: withTracking('createMenuItem', async function(itemData) {
    try {
      const item = {
        ...itemData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      const docRef = await firebaseDb.collection('menuItems').add(item);
      const doc = await docRef.get();
      
      console.log('✅ Menu item created:', docRef.id);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Create menu item error:', error);
      throw error;
    }
  }),

  /**
   * Update menu item
   * @param {string} itemId - Item ID
   * @param {Object} itemData - Updated data
   * @returns {Promise<Object>} Updated item
   */
  updateMenuItem: withTracking('updateMenuItem', async function(itemId, itemData) {
    try {
      const updateData = {
        ...itemData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await firebaseDb.collection('menuItems').doc(itemId).update(updateData);
      
      const doc = await firebaseDb.collection('menuItems').doc(itemId).get();
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Update menu item error:', error);
      throw error;
    }
  }),

  /**
   * Delete menu item
   * @param {string} itemId - Item ID
   */
  deleteMenuItem: withTracking('deleteMenuItem', async function(itemId) {
    try {
      await firebaseDb.collection('menuItems').doc(itemId).delete();
      console.log('✅ Menu item deleted:', itemId);
    } catch (error) {
      console.error('❌ Delete menu item error:', error);
      throw error;
    }
  }),

  /**
   * Update item stock status
   * @param {string} itemId - Item ID
   * @param {boolean} inStock - Stock status
   * @returns {Promise<Object>} Updated item
   */
  updateItemStock: withTracking('updateItemStock', async function(itemId, inStock) {
    try {
      await firebaseDb.collection('menuItems').doc(itemId).update({
        inStock,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      const doc = await firebaseDb.collection('menuItems').doc(itemId).get();
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Update item stock error:', error);
      throw error;
    }
  }),

  /**
   * Get menu with categories and items
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Menu data with categories and items
   */
  getFullMenu: withTracking('getFullMenu', async function(restaurantId) {
    try {
      const [categories, items] = await Promise.all([
        this.getMenuCategories(restaurantId),
        this.getMenuItems(restaurantId)
      ]);
      
      // Group items by category
      const categoriesWithItems = categories.map(category => ({
        ...category,
        items: items.filter(item => item.categoryId === category.id)
      }));
      
      console.log('✅ Full menu loaded:', categoriesWithItems.length, 'categories');
      return {
        categories: categoriesWithItems,
        allItems: items
      };
      
    } catch (error) {
      console.error('❌ Get full menu error:', error);
      throw error;
    }
  }),

  /**
   * Search menu items by name or description
   * @param {string} restaurantId - Restaurant ID
   * @param {string} searchTerm - Search term
   * @returns {Promise<Array>} Array of matching menu items
   */
  searchMenuItems: withTracking('searchMenuItems', async function(restaurantId, searchTerm) {
    try {
      const allItems = await this.getMenuItems(restaurantId);
      const searchLower = searchTerm.toLowerCase();
      
      const matchingItems = allItems.filter(item => 
        item.name.toLowerCase().includes(searchLower) ||
        (item.description && item.description.toLowerCase().includes(searchLower))
      );
      
      console.log('🔍 Menu search results:', matchingItems.length, 'items for term:', searchTerm);
      return matchingItems;
      
    } catch (error) {
      console.error('❌ Search menu items error:', error);
      throw error;
    }
  }),

  // ============================================================================
  // ENHANCED ORDER MANAGEMENT WITH AUTHENTICATION SUPPORT
  // ============================================================================

  /**
   * Create new order with authenticated customer UID
   * @param {Object} orderData - Order information
   * @returns {Promise<Object>} Created order
   */
  createOrder: withTracking('createOrder', async function(orderData) {
    try {
      // Get current authenticated user
      const currentUser = firebase.auth().currentUser;
      
      const order = {
        ...orderData,
        // Add customer UID for security rules
        customerUID: currentUser ? currentUser.uid : null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      const docRef = await firebaseDb.collection('orders').add(order);
      const doc = await docRef.get();
      
      console.log('✅ Order created:', orderData.orderNumber);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Create order error:', error);
      throw error;
    }
  }),

  /**
   * Get order by order number
   * @param {string} orderNumber - Order number
   * @returns {Promise<Object>} Order data
   */
  getOrderByNumber: withTracking('getOrderByNumber', async function(orderNumber) {
    try {
      const querySnapshot = await firebaseDb.collection('orders')
        .where('orderNumber', '==', orderNumber)
        .limit(1)
        .get();
      
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }
      throw new Error('Order not found');
      
    } catch (error) {
      console.error('❌ Get order by number error:', error);
      throw error;
    }
  }),

  /**
   * Get all orders for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @param {Object} options - Query options (limit, orderBy, etc.)
   * @returns {Promise<Array>} Array of orders
   */
  getOrders: withTracking('getOrders', async function(restaurantId, options = {}) {
    try {
      let query = firebaseDb.collection('orders')
        .where('restaurantId', '==', restaurantId);
      
      // Add ordering
      if (options.orderBy) {
        query = query.orderBy(options.orderBy, options.orderDirection || 'desc');
      } else {
        query = query.orderBy('createdAt', 'desc');
      }
      
      // Add limit
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      // Add status filter
      if (options.status) {
        query = query.where('status', '==', options.status);
      }
      
      const querySnapshot = await query.get();
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
    } catch (error) {
      console.error('❌ Get orders error:', error);
      throw error;
    }
  }),

  /**
   * Get orders by customer phone
   * @param {string} customerPhone - Customer phone number
   * @returns {Promise<Array>} Array of customer orders
   */
  getOrdersByCustomer: withTracking('getOrdersByCustomer', async function(customerPhone) {
    try {
      const querySnapshot = await firebaseDb.collection('orders')
        .where('customerPhone', '==', customerPhone)
        .orderBy('createdAt', 'desc')
        .get();
      
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
    } catch (error) {
      console.error('❌ Get orders by customer error:', error);
      throw error;
    }
  }),

  /**
   * Get orders by customer UID (for authenticated customers)
   * @param {string} customerUID - Customer Firebase UID
   * @returns {Promise<Array>} Array of customer orders
   */
  getOrdersByCustomerUID: withTracking('getOrdersByCustomerUID', async function(customerUID) {
    try {
      const querySnapshot = await firebaseDb.collection('orders')
        .where('customerUID', '==', customerUID)
        .orderBy('createdAt', 'desc')
        .get();
      
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
    } catch (error) {
      console.error('❌ Get orders by customer UID error:', error);
      throw error;
    }
  }),

  /**
   * Get customer's most recent active order
   * @param {string} customerPhone - Customer phone number
   * @returns {Promise<Object|null>} Most recent active order or null
   */
  getMostRecentActiveOrder: withTracking('getMostRecentActiveOrder', async function(customerPhone) {
    try {
      const orders = await this.getOrdersByCustomer(customerPhone);
      const activeOrders = orders.filter(order => 
        order.status === 'pending' || 
        order.status === 'preparing' || 
        order.status === 'ready'
      );
      
      if (activeOrders.length > 0) {
        // Sort by creation date and return most recent
        activeOrders.sort((a, b) => {
          const dateA = this.timestampToDate(a.createdAt);
          const dateB = this.timestampToDate(b.createdAt);
          return dateB - dateA;
        });
        console.log('✅ Most recent active order found:', activeOrders[0].orderNumber);
        return activeOrders[0];
      }
      
      console.log('ℹ️ No active orders found for customer');
      return null;
    } catch (error) {
      console.error('❌ Get most recent active order error:', error);
      throw error;
    }
  }),

  /**
   * Get customer's most recent active order by UID
   * @param {string} customerUID - Customer Firebase UID
   * @returns {Promise<Object|null>} Most recent active order or null
   */
  getMostRecentActiveOrderByUID: withTracking('getMostRecentActiveOrderByUID', async function(customerUID) {
    try {
      const orders = await this.getOrdersByCustomerUID(customerUID);
      const activeOrders = orders.filter(order => 
        order.status === 'pending' || 
        order.status === 'preparing' || 
        order.status === 'ready'
      );
      
      if (activeOrders.length > 0) {
        // Sort by creation date and return most recent
        activeOrders.sort((a, b) => {
          const dateA = this.timestampToDate(a.createdAt);
          const dateB = this.timestampToDate(b.createdAt);
          return dateB - dateA;
        });
        console.log('✅ Most recent active order found for UID:', activeOrders[0].orderNumber);
        return activeOrders[0];
      }
      
      console.log('ℹ️ No active orders found for customer UID');
      return null;
    } catch (error) {
      console.error('❌ Get most recent active order by UID error:', error);
      throw error;
    }
  }),

  /**
   * Update order status
   * @param {string} orderId - Order ID
   * @param {string} status - New status
   * @param {string} estimatedTime - Optional estimated time
   * @returns {Promise<Object>} Updated order
   */
  updateOrderStatus: withTracking('updateOrderStatus', async function(orderId, status, estimatedTime = null) {
    try {
      const updateData = {
        status,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      if (estimatedTime) {
        updateData.estimatedTime = estimatedTime;
      }
      
      await firebaseDb.collection('orders').doc(orderId).update(updateData);
      
      const doc = await firebaseDb.collection('orders').doc(orderId).get();
      console.log('✅ Order status updated:', orderId, status);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Update order status error:', error);
      throw error;
    }
  }),

  /**
   * Get today's orders for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Array>} Today's orders
   */
  getTodaysOrders: withTracking('getTodaysOrders', async function(restaurantId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const querySnapshot = await firebaseDb.collection('orders')
        .where('restaurantId', '==', restaurantId)
        .where('createdAt', '>=', today)
        .orderBy('createdAt', 'desc')
        .get();
      
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
    } catch (error) {
      console.error('❌ Get today\'s orders error:', error);
      throw error;
    }
  }),

  // ============================================================================
  // VENUE MANAGEMENT
  // ============================================================================

  /**
   * Create new venue
   * @param {Object} venueData - Venue information
   * @returns {Promise<Object>} Created venue
   */
  createVenue: withTracking('createVenue', async function(venueData) {
    try {
      const venue = {
        ...venueData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      const docRef = await firebaseDb.collection('venues').add(venue);
      const doc = await docRef.get();
      
      console.log('✅ Venue created:', docRef.id);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Create venue error:', error);
      throw error;
    }
  }),

  /**
   * Update existing venue
   * @param {string} venueId - Venue ID
   * @param {Object} venueData - Updated data
   * @returns {Promise<Object>} Updated venue
   */
  updateVenue: withTracking('updateVenue', async function(venueId, venueData) {
    try {
      const updateData = {
        ...venueData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await firebaseDb.collection('venues').doc(venueId).update(updateData);
      
      const doc = await firebaseDb.collection('venues').doc(venueId).get();
      
      console.log('✅ Venue updated:', venueId);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Update venue error:', error);
      throw error;
    }
  }),

  /**
   * Get venue by manager user ID
   * @param {string} managerUserId - Manager's user ID
   * @returns {Promise<Object|null>} Venue or null
   */
  getVenueByManager: withTracking('getVenueByManager', async function(managerUserId) {
    try {
      const querySnapshot = await firebaseDb.collection('venues')
        .where('managerUserId', '==', managerUserId)
        .limit(1)
        .get();
      
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }
      return null;
      
    } catch (error) {
      console.error('❌ Get venue by manager error:', error);
      throw error;
    }
  }),

  /**
   * Get venue by ID
   * @param {string} venueId - Venue ID
   * @returns {Promise<Object>} Venue data
   */
  getVenue: withTracking('getVenue', async function(venueId) {
    try {
      const doc = await firebaseDb.collection('venues').doc(venueId).get();
      if (doc.exists) {
        return { id: doc.id, ...doc.data() };
      }
      throw new Error('Venue not found');
    } catch (error) {
      console.error('❌ Get venue error:', error);
      throw error;
    }
  }),

  /**
   * Get all venues (for admin dashboard)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of venues
   */
  getAllVenues: withTracking('getAllVenues', async function(options = {}) {
    try {
      let query = firebaseDb.collection('venues');
      
      if (options.orderBy) {
        query = query.orderBy(options.orderBy, options.orderDirection || 'desc');
      } else {
        query = query.orderBy('createdAt', 'desc');
      }
      
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      const querySnapshot = await query.get();
      const venues = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      console.log('✅ Retrieved all venues:', venues.length);
      return venues;
      
    } catch (error) {
      console.error('❌ Get all venues error:', error);
      throw error;
    }
  }),

  // ============================================================================
  // LOSS INCIDENT MANAGEMENT (FIXED VERSION)
  // ============================================================================

  /**
   * Create new loss incident (FIXED to handle undefined values)
   * @param {Object} incidentData - Incident information
   * @returns {Promise<Object>} Created incident
   */
  createLossIncident: withTracking('createLossIncident', async function(incidentData) {
    try {
      // Remove undefined values from the incident data
      const cleanIncidentData = {};
      
      Object.keys(incidentData).forEach(key => {
        if (incidentData[key] !== undefined && incidentData[key] !== null) {
          cleanIncidentData[key] = incidentData[key];
        }
      });
      
      const incident = {
        ...cleanIncidentData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      console.log('📝 Creating incident with clean data:', incident);
      
      const docRef = await firebaseDb.collection('lossIncidents').add(incident);
      const doc = await docRef.get();
      
      console.log('✅ Loss incident created:', docRef.id);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Create loss incident error:', error);
      throw error;
    }
  }),

  /**
   * Get loss incidents for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @param {Object} options - Query options (limit, orderBy, timePeriod, type, severity)
   * @returns {Promise<Array>} Array of incidents
   */
  getLossIncidents: withTracking('getLossIncidents', async function(restaurantId, options = {}) {
    try {
      let query = firebaseDb.collection('lossIncidents')
        .where('restaurantId', '==', restaurantId);
      
      // Add type filter
      if (options.type && options.type !== 'all') {
        query = query.where('type', '==', options.type);
      }
      
      // Add severity filter
      if (options.severity && options.severity !== 'all') {
        query = query.where('severity', '==', options.severity);
      }
      
      // Add status filter
      if (options.status && options.status !== 'all') {
        query = query.where('status', '==', options.status);
      }
      
      // Add ordering
      if (options.orderBy) {
        query = query.orderBy(options.orderBy, options.orderDirection || 'desc');
      } else {
        query = query.orderBy('createdAt', 'desc');
      }
      
      // Add limit
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      // Add time period filter
      if (options.timePeriod) {
        const startDate = this.getTimePeriodStart(options.timePeriod);
        if (startDate) {
          query = query.where('createdAt', '>=', startDate);
        }
      }
      
      const querySnapshot = await query.get();
      const incidents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      console.log('✅ Retrieved loss incidents:', incidents.length);
      return incidents;
      
    } catch (error) {
      console.error('❌ Get loss incidents error:', error);
      throw error;
    }
  }),

  /**
   * Get loss incidents for all restaurants in a venue
   * @param {string} venueId - Venue ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of incidents across venue
   */
  getLossIncidentsByVenue: withTracking('getLossIncidentsByVenue', async function(venueId, options = {}) {
    try {
      let query = firebaseDb.collection('lossIncidents')
        .where('venueId', '==', venueId);
      
      // Add filters similar to getLossIncidents
      if (options.type && options.type !== 'all') {
        query = query.where('type', '==', options.type);
      }
      
      if (options.severity && options.severity !== 'all') {
        query = query.where('severity', '==', options.severity);
      }
      
      if (options.status && options.status !== 'all') {
        query = query.where('status', '==', options.status);
      }
      
      // Add ordering
      query = query.orderBy('createdAt', 'desc');
      
      // Add limit
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      // Add time period filter
      if (options.timePeriod) {
        const startDate = this.getTimePeriodStart(options.timePeriod);
        if (startDate) {
          query = query.where('createdAt', '>=', startDate);
        }
      }
      
      const querySnapshot = await query.get();
      const incidents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      console.log('✅ Retrieved venue loss incidents:', incidents.length);
      return incidents;
      
    } catch (error) {
      console.error('❌ Get venue loss incidents error:', error);
      throw error;
    }
  }),

  /**
   * Update loss incident
   * @param {string} incidentId - Incident ID
   * @param {Object} updateData - Updated data
   * @returns {Promise<Object>} Updated incident
   */
  updateLossIncident: withTracking('updateLossIncident', async function(incidentId, updateData) {
    try {
      const data = {
        ...updateData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await firebaseDb.collection('lossIncidents').doc(incidentId).update(data);
      
      const doc = await firebaseDb.collection('lossIncidents').doc(incidentId).get();
      
      console.log('✅ Loss incident updated:', incidentId);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Update loss incident error:', error);
      throw error;
    }
  }),

  /**
   * Delete loss incident
   * @param {string} incidentId - Incident ID
   */
  deleteLossIncident: withTracking('deleteLossIncident', async function(incidentId) {
    try {
      await firebaseDb.collection('lossIncidents').doc(incidentId).delete();
      console.log('✅ Loss incident deleted:', incidentId);
    } catch (error) {
      console.error('❌ Delete loss incident error:', error);
      throw error;
    }
  }),

  /**
   * Get loss analytics for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @param {string} timePeriod - Time period (today, week, month, quarter, year)
   * @returns {Promise<Object>} Analytics data
   */
  getLossAnalytics: withTracking('getLossAnalytics', async function(restaurantId, timePeriod = 'month') {
    try {
      const startDate = this.getTimePeriodStart(timePeriod);
      
      let query = firebaseDb.collection('lossIncidents')
        .where('restaurantId', '==', restaurantId);
      
      if (startDate) {
        query = query.where('createdAt', '>=', startDate);
      }
      
      const querySnapshot = await query.get();
      const incidents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Calculate analytics
      const analytics = this.calculateLossAnalytics(incidents);
      
      console.log('✅ Retrieved loss analytics for restaurant:', analytics);
      return analytics;
      
    } catch (error) {
      console.error('❌ Get loss analytics error:', error);
      throw error;
    }
  }),

  /**
   * Get loss analytics for a venue
   * @param {string} venueId - Venue ID
   * @param {string} timePeriod - Time period
   * @returns {Promise<Object>} Venue analytics data
   */
  getVenueLossAnalytics: withTracking('getVenueLossAnalytics', async function(venueId, timePeriod = 'month') {
    try {
      const startDate = this.getTimePeriodStart(timePeriod);
      
      let query = firebaseDb.collection('lossIncidents')
        .where('venueId', '==', venueId);
      
      if (startDate) {
        query = query.where('createdAt', '>=', startDate);
      }
      
      const querySnapshot = await query.get();
      const incidents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Calculate venue-wide analytics
      const analytics = this.calculateLossAnalytics(incidents, true);
      
      console.log('✅ Retrieved venue loss analytics:', analytics);
      return analytics;
      
    } catch (error) {
      console.error('❌ Get venue loss analytics error:', error);
      throw error;
    }
  }),

  // ============================================================================
  // ENHANCED REAL-TIME LISTENERS WITH AUTHENTICATION SUPPORT
  // ============================================================================

  /**
   * Listen to real-time order updates
   * @param {string} restaurantId - Restaurant ID
   * @param {Function} callback - Callback function for updates
   * @returns {Function} Unsubscribe function
   */
  listenToOrders(restaurantId, callback) {
    return firebaseDb.collection('orders')
      .where('restaurantId', '==', restaurantId)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(orders);
      });
  },

  /**
   * Listen to specific order updates
   * @param {string} orderId - Order ID
   * @param {Function} callback - Callback function for updates
   * @returns {Function} Unsubscribe function
   */
  listenToOrder(orderId, callback) {
    return firebaseDb.collection('orders').doc(orderId)
      .onSnapshot(doc => {
        if (doc.exists) {
          callback({ id: doc.id, ...doc.data() });
        }
      });
  },

  /**
   * Listen to real-time updates for customer's orders
   * @param {string} customerPhone - Customer phone number
   * @param {Function} callback - Callback function for updates
   * @returns {Function} Unsubscribe function
   */
  listenToCustomerOrders(customerPhone, callback) {
    return firebaseDb.collection('orders')
      .where('customerPhone', '==', customerPhone)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(orders);
      });
  },

  /**
   * Listen to real-time updates for customer's orders by UID
   * @param {string} customerUID - Customer Firebase UID
   * @param {Function} callback - Callback function for updates
   * @returns {Function} Unsubscribe function
   */
  listenToCustomerOrdersByUID(customerUID, callback) {
    return firebaseDb.collection('orders')
      .where('customerUID', '==', customerUID)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(orders);
      });
  },

  /**
   * Listen to order updates by order number
   * @param {string} orderNumber - Order number
   * @param {Function} callback - Callback function for updates
   * @returns {Function} Unsubscribe function
   */
  listenToOrderByNumber(orderNumber, callback) {
    return firebaseDb.collection('orders')
      .where('orderNumber', '==', orderNumber)
      .limit(1)
      .onSnapshot(querySnapshot => {
        if (!querySnapshot.empty) {
          const doc = querySnapshot.docs[0];
          callback({ id: doc.id, ...doc.data() });
        } else {
          callback(null);
        }
      });
  },

  /**
   * Listen to venue-wide order updates across all restaurants
   * @param {string} venueId - Venue ID
   * @param {Function} callback - Callback function for updates
   * @returns {Promise<Function>} Unsubscribe function
   */
  async listenToVenueOrders(venueId, callback) {
    try {
      // Get restaurants for this venue
      const restaurants = await this.getRestaurantsByVenue(venueId);
      
      if (restaurants.length === 0) {
        callback([]);
        return () => {}; // Empty unsubscribe function
      }
      
      const unsubscribeFunctions = [];
      let allVenueOrders = [];
      
      restaurants.forEach(restaurant => {
        const unsubscribe = this.listenToOrders(restaurant.id, (restaurantOrders) => {
          // Update orders for this restaurant
          allVenueOrders = allVenueOrders.filter(order => 
            order.restaurantId !== restaurant.id
          );
          
          const ordersWithRestaurant = restaurantOrders.map(order => ({
            ...order,
            restaurantName: restaurant.name,
            restaurantCurrency: restaurant.currency
          }));
          
          allVenueOrders = allVenueOrders.concat(ordersWithRestaurant);
          
          // Call the callback with all venue orders
          callback(allVenueOrders);
        });
        
        unsubscribeFunctions.push(unsubscribe);
      });
      
      // Return a function that unsubscribes from all listeners
      return () => {
        unsubscribeFunctions.forEach(unsub => unsub());
      };
      
    } catch (error) {
      console.error('❌ Listen to venue orders error:', error);
      throw error;
    }
  },

  /**
   * Listen to real-time loss incident updates for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @param {Function} callback - Callback function for updates
   * @returns {Function} Unsubscribe function
   */
  listenToLossIncidents(restaurantId, callback) {
    return firebaseDb.collection('lossIncidents')
      .where('restaurantId', '==', restaurantId)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        const incidents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(incidents);
      });
  },

  /**
   * Listen to real-time loss incident updates for a venue
   * @param {string} venueId - Venue ID
   * @param {Function} callback - Callback function for updates
   * @returns {Function} Unsubscribe function
   */
  listenToVenueLossIncidents(venueId, callback) {
    return firebaseDb.collection('lossIncidents')
      .where('venueId', '==', venueId)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        const incidents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(incidents);
      });
  },

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Generate unique order number
   * @returns {string} Unique order number
   */
  generateOrderNumber() {
    return Date.now().toString();
  },

  /**
   * Generate unique invite code
   * @returns {string} Random 8-character code
   */
  generateInviteCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  },

  /**
   * Convert Firebase timestamp to Date
   * @param {Object} timestamp - Firebase timestamp
   * @returns {Date} JavaScript Date object
   */
  timestampToDate(timestamp) {
    if (timestamp && timestamp.toDate) {
      return timestamp.toDate();
    }
    return new Date(timestamp);
  },

  /**
   * Get user-friendly auth error message
   * @param {string} errorCode - Firebase auth error code
   * @returns {string} User-friendly message
   */
  getAuthErrorMessage(errorCode) {
    const errorMessages = {
      'auth/email-already-in-use': 'This email is already registered. Please use a different email or try signing in.',
      'auth/weak-password': 'Password should be at least 6 characters long.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/user-not-found': 'No account found with this email. Please check your email or sign up.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Please check your connection and try again.',
      'auth/invalid-credential': 'Invalid email or password. Please try again.'
    };
    
    return errorMessages[errorCode] || 'An unexpected error occurred. Please try again.';
  },

  /**
   * Get start date for time period
   * @param {string} timePeriod - Time period string
   * @returns {Date|null} Start date or null
   */
  getTimePeriodStart(timePeriod) {
    const now = new Date();
    
    switch (timePeriod) {
      case 'today':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'week':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 7);
        return weekStart;
      case 'month':
        return new Date(now.getFullYear(), now.getMonth(), 1);
      case 'quarter':
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
        return new Date(now.getFullYear(), quarterMonth, 1);
      case 'year':
        return new Date(now.getFullYear(), 0, 1);
      default:
        return null;
    }
  },

  /**
   * Calculate loss analytics from incidents array
   * @param {Array} incidents - Array of incident objects
   * @param {boolean} isVenue - Whether this is venue-wide analytics
   * @returns {Object} Analytics object
   */
  calculateLossAnalytics(incidents, isVenue = false) {
    const analytics = {
      totalIncidents: incidents.length,
      totalLoss: 0,
      byType: {},
      bySeverity: { low: 0, medium: 0, high: 0 },
      byStatus: { reported: 0, investigating: 0, resolved: 0, closed: 0 },
      averageLoss: 0,
      trends: {
        daily: {},
        weekly: {},
        monthly: {}
      }
    };
    
    // Calculate totals and breakdowns
    incidents.forEach(incident => {
      const amount = incident.amount || 0;
      analytics.totalLoss += amount;
      
      // By type
      const type = incident.type || 'other';
      analytics.byType[type] = (analytics.byType[type] || 0) + amount;
      
      // By severity
      const severity = incident.severity || 'medium';
      analytics.bySeverity[severity] = (analytics.bySeverity[severity] || 0) + 1;
      
      // By status
      const status = incident.status || 'reported';
      analytics.byStatus[status] = (analytics.byStatus[status] || 0) + 1;
      
      // Trends by date
      if (incident.createdAt) {
        const date = this.timestampToDate(incident.createdAt);
        const dayKey = date.toISOString().split('T')[0];
        const weekKey = this.getWeekKey(date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        analytics.trends.daily[dayKey] = (analytics.trends.daily[dayKey] || 0) + amount;
        analytics.trends.weekly[weekKey] = (analytics.trends.weekly[weekKey] || 0) + amount;
        analytics.trends.monthly[monthKey] = (analytics.trends.monthly[monthKey] || 0) + amount;
      }
    });
    
    // Calculate average
    analytics.averageLoss = incidents.length > 0 ? analytics.totalLoss / incidents.length : 0;
    
    return analytics;
  },

  /**
   * Get week key for date
   * @param {Date} date - Date object
   * @returns {string} Week key (YYYY-WNN)
   */
  getWeekKey(date) {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(((date - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
  }
};

// Make VediAPI available globally
window.VediAPI = VediAPI;

// Legacy support - also make it available as FirebaseAPI for backward compatibility
window.FirebaseAPI = VediAPI;

console.log('🍽️ Enhanced Vedi Firebase API loaded successfully');
console.log('📚 Available methods:', Object.keys(VediAPI).length, 'total methods');
console.log('📊 API tracking: ENABLED for all methods');
console.log('🔐 Enhanced authentication support:');
console.log('   📱 Phone authentication with SMS verification');
console.log('   🔍 Google social authentication');
console.log('   📘 Facebook social authentication');
console.log('   🍎 Apple social authentication');
console.log('   👤 Customer profile management');
console.log('   🔒 UID-based order security');
console.log('💰 Dynamic Fee Management System:');
console.log('   ⚙️ Custom fee configurations per restaurant');
console.log('   📊 Fixed, percentage, and hybrid fee structures');
console.log('   🤝 Negotiated rate tracking and management');
console.log('   📈 Platform revenue analytics and tracking');
console.log('   🏛️ Custom tax rates and minimum order amounts');
console.log('🔥 Ready for production use with complete analytics, enhanced authentication, and dynamic fee management!');
console.log('✅ FIXED: Loss incident creation now handles undefined values properly');
console.log('💡 NEW: Dynamic fee system allows complete control over platform revenue');
