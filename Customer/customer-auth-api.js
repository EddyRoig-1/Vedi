// customer-auth-api.js - Dedicated Customer Authentication API with Phone Auth & reCAPTCHA

// ============================================================================
// CUSTOMER AUTHENTICATION API - PHONE AUTH & ENHANCED FEATURES
// ============================================================================

/**
 * Customer Authentication API - Specialized methods for customer-facing authentication
 * Includes phone authentication, SMS verification, and enhanced reCAPTCHA handling
 */
const CustomerAuthAPI = {
  
  // ============================================================================
  // PHONE AUTHENTICATION WITH SMS VERIFICATION
  // ============================================================================

  /**
   * Send SMS verification code for phone authentication
   * @param {string} phoneNumber - Phone number in E.164 format
   * @param {Object} recaptchaVerifier - reCAPTCHA verifier instance (optional, will use global if not provided)
   * @returns {Promise<Object>} Confirmation result for verification
   */
  sendPhoneVerification: async function(phoneNumber, recaptchaVerifier = null) {
    const startTime = Date.now();
    try {
      console.log('📱 Sending phone verification to:', phoneNumber);
      
      // Try using firebase-config.js PhoneAuthHelper first
      if (typeof window.PhoneAuthHelper !== 'undefined') {
        console.log('🔧 Using firebase-config.js PhoneAuthHelper');
        try {
          const verifier = recaptchaVerifier || window.recaptchaVerifier;
          const result = await window.PhoneAuthHelper.sendVerificationCode(phoneNumber, verifier);
          
          // Track successful API call if tracking is available
          if (window.trackAPICall) {
            const responseTime = Date.now() - startTime;
            await window.trackAPICall('sendPhoneVerification', responseTime, true, {
              phoneNumber: phoneNumber.substring(0, 5) + '****'
            });
          }
          
          console.log('✅ SMS sent via PhoneAuthHelper');
          return result;
        } catch (helperError) {
          console.warn('⚠️ PhoneAuthHelper failed, falling back to direct method:', helperError);
        }
      }
      
      // Fallback to direct Firebase method
      // Use provided verifier or get from global
      const verifier = recaptchaVerifier || window.recaptchaVerifier;
      if (!verifier) {
        throw new Error('reCAPTCHA verifier not initialized');
      }
      
      // Validate phone number format (E.164)
      const e164Regex = /^\+[1-9]\d{1,14}$/;
      if (!e164Regex.test(phoneNumber)) {
        throw new Error('Invalid phone number format. Please use E.164 format (+1234567890)');
      }
      
      const auth = window.firebaseAuth || firebase.auth();
      
      // Debug: Check Firebase app configuration
      console.log('🔧 Firebase app name:', firebase.app().name);
      console.log('🔧 Firebase project ID:', firebase.app().options.projectId);
      console.log('🔧 reCAPTCHA verifier ready:', !!verifier);
      
      // Additional validation for US numbers
      if (phoneNumber.startsWith('+1')) {
        const usNumber = phoneNumber.slice(2);
        if (usNumber.length !== 10) {
          throw new Error('US phone numbers must be exactly 10 digits after country code');
        }
        // Check for invalid US number patterns
        if (usNumber.startsWith('0') || usNumber.startsWith('1')) {
          throw new Error('Invalid US phone number format. First digit cannot be 0 or 1');
        }
      }
      
      // Send verification code with enhanced error handling
      console.log('🚀 Attempting to send SMS...');
      const confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, verifier);
      
      // Track successful API call if tracking is available
      if (window.trackAPICall) {
        const responseTime = Date.now() - startTime;
        await window.trackAPICall('sendPhoneVerification', responseTime, true, {
          phoneNumber: phoneNumber.substring(0, 5) + '****' // Partial phone for privacy
        });
      }
      
      console.log('✅ SMS verification code sent successfully');
      return confirmationResult;
      
    } catch (error) {
      console.error('❌ Phone verification detailed error:', {
        code: error.code,
        message: error.message,
        phoneNumber: phoneNumber ? phoneNumber.substring(0, 5) + '****' : 'undefined',
        hasRecaptcha: !!recaptchaVerifier,
        hasGlobalRecaptcha: !!window.recaptchaVerifier,
        projectId: firebase.app().options.projectId
      });
      
      // Track failed API call if tracking is available
      if (window.trackAPICall) {
        const responseTime = Date.now() - startTime;
        await window.trackAPICall('sendPhoneVerification', responseTime, false, {
          error: error.code || error.message,
          phoneNumber: phoneNumber ? phoneNumber.substring(0, 5) + '****' : 'undefined'
        });
      }
      
      throw this.handlePhoneAuthError(error);
    }
  },

  /**
   * Verify SMS code and complete phone authentication
   * @param {Object} confirmationResult - Result from sendPhoneVerification
   * @param {string} code - 6-digit verification code
   * @returns {Promise<Object>} Firebase user credential
   */
  verifyPhoneCode: async function(confirmationResult, code) {
    const startTime = Date.now();
    try {
      console.log('🔐 Verifying phone code...');
      
      if (!confirmationResult) {
        throw new Error('No verification in progress');
      }
      
      if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
        throw new Error('Please enter a valid 6-digit verification code');
      }
      
      const result = await confirmationResult.confirm(code);
      
      // Track successful API call if tracking is available
      if (window.trackAPICall) {
        const responseTime = Date.now() - startTime;
        await window.trackAPICall('verifyPhoneCode', responseTime, true, {
          userId: result.user.uid
        });
      }
      
      console.log('✅ Phone verification successful, UID:', result.user.uid);
      return result;
      
    } catch (error) {
      // Track failed API call if tracking is available
      if (window.trackAPICall) {
        const responseTime = Date.now() - startTime;
        await window.trackAPICall('verifyPhoneCode', responseTime, false, {
          error: error.code || error.message
        });
      }
      
      console.error('❌ Phone code verification error:', error);
      throw this.handlePhoneAuthError(error);
    }
  },

  // ============================================================================
  // RECAPTCHA MANAGEMENT
  // ============================================================================

  /**
   * Initialize reCAPTCHA verifier for phone authentication
   * @param {string} containerId - ID of the container element for reCAPTCHA
   * @param {Object} options - reCAPTCHA options
   * @returns {Promise<Object>} reCAPTCHA verifier instance
   */
  initializeRecaptcha: async function(containerId = 'recaptcha-container', options = {}) {
    try {
      console.log('🔐 Initializing reCAPTCHA verifier...');
      
      // Check if Firebase is properly initialized
      if (typeof firebase === 'undefined') {
        throw new Error('Firebase not loaded');
      }
      
      if (!firebase.apps.length) {
        throw new Error('Firebase app not initialized');
      }
      
      console.log('🔧 Firebase project:', firebase.app().options.projectId);
      console.log('🔧 Current domain:', window.location.hostname);
      
      // Use the firebase-config.js helper if available
      if (typeof window.createRecaptchaVerifier === 'function') {
        console.log('🔧 Using firebase-config.js reCAPTCHA helper');
        
        try {
          const verifier = window.createRecaptchaVerifier(containerId, options);
          await verifier.render();
          console.log('✅ reCAPTCHA initialized via firebase-config helper');
          return verifier;
        } catch (configError) {
          console.warn('⚠️ firebase-config helper failed, falling back to direct method:', configError);
        }
      }
      
      // Fallback to direct initialization
      // Clear any existing verifier
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (clearError) {
          console.warn('⚠️ Error clearing existing reCAPTCHA:', clearError);
        }
        window.recaptchaVerifier = null;
      }

      // Clear the container
      const container = document.getElementById(containerId);
      if (!container) {
        throw new Error(`reCAPTCHA container with ID '${containerId}' not found`);
      }
      container.innerHTML = '';

      // Enhanced default options
      const defaultOptions = {
        'size': 'normal',
        'callback': function(response) {
          console.log('✅ reCAPTCHA solved, response length:', response.length);
          // Enable send button if available
          const sendBtn = document.getElementById('sendCodeBtn');
          if (sendBtn) sendBtn.disabled = false;
        },
        'expired-callback': function() {
          console.log('⏰ reCAPTCHA expired');
          // Disable send button if available
          const sendBtn = document.getElementById('sendCodeBtn');
          if (sendBtn) sendBtn.disabled = true;
        },
        'error-callback': function(error) {
          console.error('❌ reCAPTCHA error:', error);
        }
      };

      const finalOptions = { ...defaultOptions, ...options };
      
      console.log('🔧 Creating reCAPTCHA with options:', finalOptions);

      // Create new verifier
      const verifier = new firebase.auth.RecaptchaVerifier(containerId, finalOptions);
      
      console.log('🚀 Rendering reCAPTCHA...');
      
      // Render the reCAPTCHA with timeout
      const widgetId = await Promise.race([
        verifier.render(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('reCAPTCHA render timeout')), 30000)
        )
      ]);
      
      // Store globally for easy access
      window.recaptchaVerifier = verifier;
      window.recaptchaWidgetId = widgetId;
      
      console.log('✅ reCAPTCHA initialized and rendered successfully, widget ID:', widgetId);
      return verifier;
      
    } catch (error) {
      console.error('❌ reCAPTCHA initialization failed:', error);
      
      // Provide specific error messages
      if (error.message.includes('timeout')) {
        throw new Error('reCAPTCHA took too long to load. Please check your internet connection and try again.');
      } else if (error.message.includes('not found')) {
        throw new Error('reCAPTCHA container not found. Please refresh the page.');
      } else if (error.message.includes('Firebase')) {
        throw new Error('Firebase configuration error. Please contact support.');
      } else {
        throw new Error('Failed to initialize reCAPTCHA. Please refresh the page and try again.');
      }
    }
  },

  /**
   * Reset reCAPTCHA verifier
   * @returns {Promise<boolean>} Success status
   */
  resetRecaptcha: async function() {
    try {
      if (window.recaptchaVerifier && window.recaptchaWidgetId) {
        if (typeof grecaptcha !== 'undefined') {
          grecaptcha.reset(window.recaptchaWidgetId);
          console.log('✅ reCAPTCHA reset successfully');
          return true;
        } else {
          console.warn('⚠️ grecaptcha not available for reset');
          return false;
        }
      } else {
        console.warn('⚠️ No reCAPTCHA to reset');
        return false;
      }
    } catch (error) {
      console.error('❌ Error resetting reCAPTCHA:', error);
      return false;
    }
  },

  /**
   * Clear and destroy reCAPTCHA verifier
   * @returns {boolean} Success status
   */
  clearRecaptcha: function() {
    try {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
        window.recaptchaWidgetId = null;
        console.log('✅ reCAPTCHA cleared successfully');
        return true;
      }
      return true;
    } catch (error) {
      console.error('❌ Error clearing reCAPTCHA:', error);
      return false;
    }
  },

  // ============================================================================
  // ENHANCED CUSTOMER AUTHENTICATION
  // ============================================================================

  /**
   * Sign in or sign up customer with phone number
   * @param {string} phoneNumber - Phone number in E.164 format
   * @param {Object} recaptchaVerifier - reCAPTCHA verifier instance
   * @returns {Promise<Object>} Confirmation result for verification
   */
  signInWithPhone: async function(phoneNumber, recaptchaVerifier = null) {
    try {
      console.log('📱 Initiating phone sign-in for customer...');
      
      // This will work for both new and existing users
      const confirmationResult = await this.sendPhoneVerification(phoneNumber, recaptchaVerifier);
      
      return confirmationResult;
      
    } catch (error) {
      console.error('❌ Phone sign-in error:', error);
      throw error;
    }
  },

  /**
   * Complete phone authentication and save customer profile
   * @param {Object} confirmationResult - Result from sendPhoneVerification
   * @param {string} code - 6-digit verification code
   * @param {Object} customerData - Additional customer data (optional)
   * @returns {Promise<Object>} Complete customer profile
   */
  completePhoneAuth: async function(confirmationResult, code, customerData = {}) {
    try {
      console.log('🔐 Completing phone authentication...');
      
      // Verify the SMS code
      const userCredential = await this.verifyPhoneCode(confirmationResult, code);
      const user = userCredential.user;
      
      // Check if we have the main API available for customer profiles
      if (window.VediAPI && window.VediAPI.saveCustomerProfile) {
        // Save or update customer profile
        const profileData = {
          phoneNumber: user.phoneNumber,
          name: customerData.name || '',
          email: customerData.email || '',
          preferences: customerData.preferences || {},
          ...customerData
        };
        
        const savedProfile = await window.VediAPI.saveCustomerProfile(user.uid, profileData);
        
        console.log('✅ Phone authentication completed and profile saved');
        return {
          user: user,
          profile: savedProfile,
          isNewUser: userCredential.additionalUserInfo?.isNewUser || false
        };
      } else {
        console.log('✅ Phone authentication completed (no profile API available)');
        return {
          user: user,
          profile: null,
          isNewUser: userCredential.additionalUserInfo?.isNewUser || false
        };
      }
      
    } catch (error) {
      console.error('❌ Complete phone auth error:', error);
      throw error;
    }
  },

  /**
   * Get customer's authentication status and profile
   * @returns {Promise<Object|null>} Customer auth status and profile
   */
  getCustomerAuthStatus: async function() {
    try {
      const auth = window.firebaseAuth || firebase.auth();
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        return null;
      }
      
      let profile = null;
      
      // Try to get customer profile if main API is available
      if (window.VediAPI && window.VediAPI.getCustomerProfile) {
        try {
          profile = await window.VediAPI.getCustomerProfile(currentUser.uid);
        } catch (error) {
          console.warn('⚠️ Could not load customer profile:', error);
        }
      }
      
      return {
        user: {
          uid: currentUser.uid,
          phoneNumber: currentUser.phoneNumber,
          email: currentUser.email,
          displayName: currentUser.displayName,
          isAnonymous: currentUser.isAnonymous
        },
        profile: profile,
        isAuthenticated: true
      };
      
    } catch (error) {
      console.error('❌ Get customer auth status error:', error);
      return null;
    }
  },

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  /**
   * Handle phone authentication errors
   * @param {Object} error - Firebase error object
   * @returns {Error} Formatted error
   */
  handlePhoneAuthError(error) {
    const phoneErrorMessages = {
      'auth/invalid-phone-number': 'Please enter a valid phone number.',
      'auth/too-many-requests': 'Too many attempts. Please wait 24 hours or try a different phone number.',
      'auth/invalid-verification-code': 'Invalid verification code. Please try again.',
      'auth/code-expired': 'Verification code has expired. Please request a new one.',
      'auth/captcha-check-failed': 'reCAPTCHA verification failed. Please solve the reCAPTCHA and try again.',
      'auth/quota-exceeded': 'SMS quota exceeded. Please try again later or contact support.',
      'auth/operation-not-allowed': 'Phone authentication is not enabled. Please contact support.',
      'auth/missing-verification-code': 'Please enter the verification code.',
      'auth/invalid-verification-id': 'Invalid verification session. Please start over.',
      'auth/internal-error': 'SMS service configuration error. Please contact support.',
      'auth/internal-error-encountered': 'Firebase SMS service is not properly configured. Please contact support.',
      'auth/network-request-failed': 'Network error. Please check your connection and try again.',
      'auth/app-not-authorized': 'This app is not authorized for phone authentication. Please contact support.',
      'auth/unauthorized-domain': 'This domain is not authorized for phone authentication. Please contact support.'
    };
    
    // Log detailed error for debugging
    console.error('🚨 Phone auth error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    
    let message = phoneErrorMessages[error.code] || error.message || 'Phone authentication failed. Please try again.';
    
    // Special handling for internal errors
    if (error.code === 'auth/internal-error-encountered' || error.code === 'auth/internal-error') {
      message = 'SMS service is not properly configured. This usually means:\n\n' +
                '1. Phone authentication is not enabled in Firebase Console\n' +
                '2. Your app is not properly configured for SMS\n' +
                '3. There may be billing issues with your Firebase project\n\n' +
                'Please contact support for assistance.';
    }
    
    const newError = new Error(message);
    newError.code = error.code;
    newError.originalError = error;
    return newError;
  },

  // ============================================================================
  // DEBUGGING AND DIAGNOSTICS
  // ============================================================================

  /**
   * Check Firebase phone auth configuration
   * @returns {Object} Configuration status
   */
  checkPhoneAuthConfig: function() {
    const config = {
      firebaseLoaded: typeof firebase !== 'undefined',
      appInitialized: false,
      projectId: null,
      authDomain: null,
      phoneProviderEnabled: false,
      domain: window.location.hostname,
      protocol: window.location.protocol,
      isLocalhost: window.location.hostname === 'localhost',
      recaptchaReady: this.isRecaptchaReady()
    };

    if (config.firebaseLoaded && firebase.apps.length > 0) {
      config.appInitialized = true;
      config.projectId = firebase.app().options.projectId;
      config.authDomain = firebase.app().options.authDomain;
      
      // Check if phone provider is enabled (this is approximate)
      try {
        const auth = firebase.auth();
        config.phoneProviderEnabled = true; // If we can access auth, assume it's configured
      } catch (error) {
        config.phoneProviderEnabled = false;
      }
    }

    console.log('🔍 Firebase Phone Auth Configuration Check:', config);
    return config;
  },

  /**
   * Test reCAPTCHA functionality
   * @returns {Promise<Object>} Test results
   */
  testRecaptcha: async function() {
    const testResults = {
      containerExists: !!document.getElementById('recaptcha-container'),
      verifierExists: !!window.recaptchaVerifier,
      widgetExists: !!window.recaptchaWidgetId,
      grecaptchaLoaded: typeof grecaptcha !== 'undefined',
      errors: []
    };

    try {
      if (!testResults.containerExists) {
        testResults.errors.push('reCAPTCHA container not found');
      }

      if (testResults.grecaptchaLoaded) {
        testResults.grecaptchaReady = typeof grecaptcha.ready === 'function';
      } else {
        testResults.errors.push('Google reCAPTCHA library not loaded');
      }

    } catch (error) {
      testResults.errors.push(`reCAPTCHA test error: ${error.message}`);
    }

    console.log('🧪 reCAPTCHA Test Results:', testResults);
    return testResults;
  },

  /**
   * Run comprehensive diagnostics
   * @returns {Promise<Object>} Diagnostic results
   */
  runDiagnostics: async function() {
    console.log('🔬 Running Phone Auth Diagnostics...');
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      config: this.checkPhoneAuthConfig(),
      recaptcha: await this.testRecaptcha(),
      recommendations: []
    };

    // Generate recommendations
    if (!diagnostics.config.firebaseLoaded) {
      diagnostics.recommendations.push('Firebase SDK not loaded - check script tags');
    }

    if (!diagnostics.config.appInitialized) {
      diagnostics.recommendations.push('Firebase app not initialized - check firebase-config.js');
    }

    if (!diagnostics.config.phoneProviderEnabled) {
      diagnostics.recommendations.push('Phone authentication may not be enabled in Firebase Console');
    }

    if (!diagnostics.recaptcha.containerExists) {
      diagnostics.recommendations.push('reCAPTCHA container missing from HTML');
    }

    if (!diagnostics.recaptcha.grecaptchaLoaded) {
      diagnostics.recommendations.push('Google reCAPTCHA library not loaded');
    }

    if (diagnostics.config.isLocalhost && diagnostics.config.protocol !== 'https:') {
      diagnostics.recommendations.push('Consider using HTTPS even for localhost (some browsers require it)');
    }

    console.log('📋 Phone Auth Diagnostics Complete:', diagnostics);
    return diagnostics;
  },

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Format phone number to E.164 format
   * @param {string} phoneNumber - Raw phone number
   * @param {string} countryCode - Default country code (e.g., 'US', 'CA')
   * @returns {string} Formatted phone number in E.164 format
   */
  formatPhoneNumber: function(phoneNumber, countryCode = 'US') {
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Country code mappings
    const countryCodes = {
      'US': '1',
      'CA': '1',
      'GB': '44',
      'AU': '61',
      'DE': '49',
      'FR': '33',
      'IT': '39',
      'ES': '34',
      'BR': '55',
      'IN': '91',
      'CN': '86',
      'JP': '81',
      'KR': '82'
    };
    
    const defaultCountryCode = countryCodes[countryCode] || '1';
    
    // If number already starts with +, return as-is (assuming it's already E.164)
    if (phoneNumber.startsWith('+')) {
      return phoneNumber;
    }
    
    // If number starts with country code, add +
    if (digits.startsWith(defaultCountryCode)) {
      return '+' + digits;
    }
    
    // If number doesn't have country code, add it
    return '+' + defaultCountryCode + digits;
  },

  /**
   * Validate phone number format
   * @param {string} phoneNumber - Phone number to validate
   * @returns {boolean} True if valid E.164 format
   */
  validatePhoneNumber: function(phoneNumber) {
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phoneNumber);
  },

  /**
   * Check if reCAPTCHA is available and ready
   * @returns {boolean} True if reCAPTCHA is ready
   */
  isRecaptchaReady: function() {
    return !!(window.recaptchaVerifier && window.recaptchaWidgetId);
  },

  /**
   * Get masked phone number for display
   * @param {string} phoneNumber - Full phone number
   * @returns {string} Masked phone number
   */
  maskPhoneNumber: function(phoneNumber) {
    if (!phoneNumber) return '';
    
    if (phoneNumber.length > 7) {
      return phoneNumber.substring(0, 5) + '****' + phoneNumber.slice(-2);
    }
    
    return phoneNumber.substring(0, 3) + '****';
  }
};

// Make CustomerAuthAPI available globally
window.CustomerAuthAPI = CustomerAuthAPI;

console.log('📱 Customer Authentication API loaded successfully');
console.log('🔐 Available phone authentication methods:');
console.log('   📱 sendPhoneVerification() - Send SMS verification code');
console.log('   🔐 verifyPhoneCode() - Verify SMS code');
console.log('   🤖 initializeRecaptcha() - Setup reCAPTCHA verifier');
console.log('   🔄 resetRecaptcha() - Reset reCAPTCHA widget');
console.log('   🧹 clearRecaptcha() - Clear reCAPTCHA verifier');
console.log('   📲 signInWithPhone() - Complete phone sign-in flow');
console.log('   ✅ completePhoneAuth() - Complete auth and save profile');
console.log('   👤 getCustomerAuthStatus() - Get current auth status');
console.log('🛠️ Utility functions:');
console.log('   📞 formatPhoneNumber() - Format to E.164');
console.log('   ✔️ validatePhoneNumber() - Validate format');
console.log('   🎭 maskPhoneNumber() - Mask for display');
console.log('🔥 Ready for customer phone authentication!');
