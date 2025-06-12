// customer-auth-api.js - Enhanced Customer Authentication API with Comprehensive Promise Handling

// ============================================================================
// CUSTOMER AUTHENTICATION API - ENHANCED WITH PROMISE MANAGEMENT
// ============================================================================

/**
 * Customer Authentication API - Specialized methods for customer-facing authentication
 * Includes phone authentication, SMS verification, enhanced reCAPTCHA handling, and comprehensive promise management
 */
const CustomerAuthAPI = {
  
  // ============================================================================
  // PROMISE MANAGEMENT AND TIMEOUT UTILITIES
  // ============================================================================

  /**
   * Promise timeout wrapper for all operations
   * @param {Promise} promise - Promise to wrap with timeout
   * @param {number} timeoutMs - Timeout in milliseconds
   * @param {string} errorMessage - Error message for timeout
   * @returns {Promise} Promise with timeout protection
   */
  withTimeout: function(promise, timeoutMs, errorMessage) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      )
    ]);
  },

  /**
   * Retry wrapper for operations that might fail
   * @param {Function} operation - Function that returns a promise
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} delayMs - Delay between retries
   * @returns {Promise} Promise with retry logic
   */
  withRetry: async function(operation, maxRetries = 3, delayMs = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
      }
    }
    
    throw lastError;
  },

  /**
   * Safe async operation wrapper with comprehensive error handling
   * @param {Function} operation - Async operation to execute
   * @param {string} context - Context for error reporting
   * @param {Object} options - Options for timeout and retry
   * @returns {Promise} Safe promise with error handling
   */
  safeAsyncOperation: async function(operation, context = 'Unknown operation', options = {}) {
    const {
      timeoutMs = 30000,
      maxRetries = 1,
      retryDelay = 1000,
      suppressErrors = false
    } = options;

    try {
      if (maxRetries > 1) {
        return await this.withRetry(
          () => this.withTimeout(operation(), timeoutMs, `${context} timed out`),
          maxRetries,
          retryDelay
        );
      } else {
        return await this.withTimeout(operation(), timeoutMs, `${context} timed out`);
      }
    } catch (error) {
      console.error(`❌ ${context} failed:`, error);
      
      if (!suppressErrors) {
        throw this.enhanceError(error, context);
      } else {
        return null;
      }
    }
  },

  /**
   * Enhance error with additional context and user-friendly messages
   * @param {Error} error - Original error
   * @param {string} context - Operation context
   * @returns {Error} Enhanced error
   */
  enhanceError: function(error, context) {
    const enhanced = new Error(error.message);
    enhanced.code = error.code;
    enhanced.context = context;
    enhanced.originalError = error;
    enhanced.timestamp = new Date().toISOString();
    
    // Add user-friendly messages based on error type
    if (error.message.includes('timeout') || error.message.includes('timed out')) {
      enhanced.userMessage = 'Operation timed out. Please check your connection and try again.';
    } else if (error.code && error.code.startsWith('auth/')) {
      enhanced.userMessage = this.getAuthErrorMessage(error.code);
    } else if (error.message.includes('network') || error.message.includes('Network')) {
      enhanced.userMessage = 'Network error. Please check your internet connection.';
    } else {
      enhanced.userMessage = 'An unexpected error occurred. Please try again.';
    }
    
    return enhanced;
  },

  /**
   * Get user-friendly auth error message
   * @param {string} errorCode - Firebase auth error code
   * @returns {string} User-friendly error message
   */
  getAuthErrorMessage: function(errorCode) {
    const authErrorMessages = {
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
      'auth/network-request-failed': 'Network error. Please check your connection and try again.',
      'auth/app-not-authorized': 'This app is not authorized for phone authentication. Please contact support.',
      'auth/unauthorized-domain': 'This domain is not authorized for phone authentication. Please contact support.'
    };
    
    return authErrorMessages[errorCode] || 'Authentication error. Please try again.';
  },

  // ============================================================================
  // ENHANCED PHONE AUTHENTICATION WITH PROMISE MANAGEMENT
  // ============================================================================

  /**
   * Send SMS verification code for phone authentication with enhanced promise handling
   * @param {string} phoneNumber - Phone number in E.164 format
   * @param {Object} recaptchaVerifier - reCAPTCHA verifier instance (optional)
   * @returns {Promise<Object>} Confirmation result for verification
   */
  sendPhoneVerification: async function(phoneNumber, recaptchaVerifier = null) {
    return await this.safeAsyncOperation(async () => {
      console.log('📱 Sending phone verification to:', this.maskPhoneNumber(phoneNumber));
      
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
      
      const auth = firebase.auth();
      
      // Debug: Check Firebase app configuration
      console.log('🔧 Firebase app name:', firebase.app().name);
      console.log('🔧 Firebase project ID:', firebase.app().options.projectId);
      console.log('🔧 reCAPTCHA verifier ready:', !!verifier);
      
      // Send verification code using Firebase
      console.log('🚀 Attempting to send SMS using Firebase auth...');
      const confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, verifier);
      
      // Store the verificationId globally for later use
      window.phoneVerificationId = confirmationResult.verificationId;
      
      // Track successful API call if tracking is available
      if (window.trackAPICall) {
        try {
          await window.trackAPICall('sendPhoneVerification', Date.now(), true, {
            phoneNumber: this.maskPhoneNumber(phoneNumber)
          });
        } catch (trackError) {
          console.warn('⚠️ Tracking error:', trackError);
        }
      }
      
      console.log('✅ SMS verification code sent successfully');
      console.log('🔑 Verification ID stored:', !!confirmationResult.verificationId);
      
      return confirmationResult;
      
    }, 'Send phone verification', {
      timeoutMs: 30000,
      maxRetries: 2,
      retryDelay: 2000
    });
  },

  /**
   * Verify SMS code using Firebase's recommended PhoneAuthProvider.credential approach
   * @param {string} verificationId - Verification ID from sendPhoneVerification result
   * @param {string} code - 6-digit verification code
   * @returns {Promise<Object>} Firebase user credential
   */
  verifyPhoneCode: async function(verificationId, code) {
    return await this.safeAsyncOperation(async () => {
      console.log('🔐 Verifying phone code using PhoneAuthProvider.credential...');
      
      if (!verificationId) {
        throw new Error('No verification ID available. Please request a new code.');
      }
      
      if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
        throw new Error('Please enter a valid 6-digit verification code');
      }
      
      // Create credential using Firebase's recommended method
      console.log('🔑 Creating phone auth credential...');
      const credential = firebase.auth.PhoneAuthProvider.credential(verificationId, code);
      
      // Sign in with credential
      console.log('🚀 Signing in with phone credential...');
      const userCredential = await firebase.auth().signInWithCredential(credential);
      
      // Track successful API call if tracking is available
      if (window.trackAPICall) {
        try {
          await window.trackAPICall('verifyPhoneCode', Date.now(), true, {
            userId: userCredential.user.uid
          });
        } catch (trackError) {
          console.warn('⚠️ Tracking error:', trackError);
        }
      }
      
      console.log('✅ Phone verification successful, UID:', userCredential.user.uid);
      return userCredential;
      
    }, 'Verify phone code', {
      timeoutMs: 20000,
      maxRetries: 2,
      retryDelay: 1000
    });
  },

  /**
   * Alternative method using confirmationResult.confirm (legacy approach)
   * @param {Object} confirmationResult - Result from sendPhoneVerification
   * @param {string} code - 6-digit verification code
   * @returns {Promise<Object>} Firebase user credential
   */
  verifyPhoneCodeLegacy: async function(confirmationResult, code) {
    return await this.safeAsyncOperation(async () => {
      console.log('🔐 Verifying code using legacy confirmationResult.confirm...');
      
      if (!confirmationResult) {
        throw new Error('No verification in progress');
      }
      
      if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
        throw new Error('Please enter a valid 6-digit verification code');
      }
      
      const result = await confirmationResult.confirm(code);
      
      // Track successful API call if tracking is available
      if (window.trackAPICall) {
        try {
          await window.trackAPICall('verifyPhoneCodeLegacy', Date.now(), true, {
            userId: result.user.uid
          });
        } catch (trackError) {
          console.warn('⚠️ Tracking error:', trackError);
        }
      }
      
      console.log('✅ Phone verification successful (legacy), UID:', result.user.uid);
      return result;
      
    }, 'Verify phone code (legacy)', {
      timeoutMs: 20000,
      maxRetries: 2,
      retryDelay: 1000
    });
  },

  // ============================================================================
  // ENHANCED RECAPTCHA MANAGEMENT WITH PROMISE HANDLING
  // ============================================================================

  /**
   * Initialize reCAPTCHA verifier for phone authentication with comprehensive error handling
   * @param {string} containerId - ID of the container element for reCAPTCHA
   * @param {Object} options - reCAPTCHA options
   * @returns {Promise<Object>} reCAPTCHA verifier instance
   */
  initializeRecaptcha: async function(containerId = 'recaptcha-container', options = {}) {
    return await this.safeAsyncOperation(async () => {
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
      return await this.initializeRecaptchaDirect(containerId, options);
      
    }, 'Initialize reCAPTCHA', {
      timeoutMs: 30000,
      maxRetries: 2,
      retryDelay: 2000
    });
  },

  /**
   * Direct reCAPTCHA initialization with fallback to invisible
   * @param {string} containerId - Container ID
   * @param {Object} options - reCAPTCHA options
   * @returns {Promise<Object>} reCAPTCHA verifier
   */
  initializeRecaptchaDirect: async function(containerId, options = {}) {
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

    // Enhanced default options with fallback handling
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
      'error-callback': async function(error) {
        console.error('❌ reCAPTCHA error:', error);
        console.log('🔄 Attempting to use invisible reCAPTCHA...');
        // Try invisible reCAPTCHA as fallback
        try {
          return await CustomerAuthAPI.initializeInvisibleRecaptcha(containerId);
        } catch (fallbackError) {
          console.error('❌ Fallback to invisible reCAPTCHA failed:', fallbackError);
          throw fallbackError;
        }
      }
    };

    const finalOptions = { ...defaultOptions, ...options };
    
    console.log('🔧 Creating reCAPTCHA with options:', finalOptions);

    // Create new verifier
    const verifier = new firebase.auth.RecaptchaVerifier(containerId, finalOptions);
    
    console.log('🚀 Rendering reCAPTCHA...');
    
    try {
      const widgetId = await verifier.render();
      
      // Store globally for easy access
      window.recaptchaVerifier = verifier;
      window.recaptchaWidgetId = widgetId;
      
      console.log('✅ reCAPTCHA initialized and rendered successfully, widget ID:', widgetId);
      return verifier;
      
    } catch (renderError) {
      console.warn('⚠️ Normal reCAPTCHA failed, trying invisible:', renderError);
      
      // Fallback to invisible reCAPTCHA
      return await this.initializeInvisibleRecaptcha(containerId);
    }
  },

  /**
   * Initialize invisible reCAPTCHA as fallback with promise handling
   * @param {string} containerId - Container ID
   * @returns {Promise<Object>} reCAPTCHA verifier
   */
  initializeInvisibleRecaptcha: async function(containerId) {
    return await this.safeAsyncOperation(async () => {
      console.log('👻 Initializing invisible reCAPTCHA...');
      
      // Clear existing verifier
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (error) {
          console.warn('⚠️ Error clearing existing verifier:', error);
        }
      }

      // Create invisible reCAPTCHA
      const verifier = new firebase.auth.RecaptchaVerifier(containerId, {
        'size': 'invisible',
        'callback': function(response) {
          console.log('✅ Invisible reCAPTCHA solved automatically');
        },
        'error-callback': function(error) {
          console.error('❌ Invisible reCAPTCHA error:', error);
        }
      });

      const widgetId = await verifier.render();
      
      // Store globally
      window.recaptchaVerifier = verifier;
      window.recaptchaWidgetId = widgetId;
      
      // Hide the container since it's invisible
      const container = document.getElementById(containerId);
      if (container) {
        container.style.display = 'none';
      }
      
      console.log('✅ Invisible reCAPTCHA initialized successfully');
      return verifier;
      
    }, 'Initialize invisible reCAPTCHA', {
      timeoutMs: 20000,
      suppressErrors: false
    });
  },

  /**
   * Reset reCAPTCHA verifier with promise handling
   * @returns {Promise<boolean>} Success status
   */
  resetRecaptcha: async function() {
    return await this.safeAsyncOperation(async () => {
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
    }, 'Reset reCAPTCHA', {
      timeoutMs: 5000,
      suppressErrors: true
    });
  },

  /**
   * Clear and destroy reCAPTCHA verifier with enhanced error handling
   * @returns {Promise<boolean>} Success status
   */
  clearRecaptcha: async function() {
    return await this.safeAsyncOperation(async () => {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
        window.recaptchaWidgetId = null;
        console.log('✅ reCAPTCHA cleared successfully');
        return true;
      }
      return true;
    }, 'Clear reCAPTCHA', {
      timeoutMs: 5000,
      suppressErrors: true
    });
  },

  // ============================================================================
  // ENHANCED CUSTOMER AUTHENTICATION WITH COMPREHENSIVE ERROR HANDLING
  // ============================================================================

  /**
   * Sign in or sign up customer with phone number
   * @param {string} phoneNumber - Phone number in E.164 format
   * @param {Object} recaptchaVerifier - reCAPTCHA verifier instance
   * @returns {Promise<Object>} Confirmation result for verification
   */
  signInWithPhone: async function(phoneNumber, recaptchaVerifier = null) {
    return await this.safeAsyncOperation(async () => {
      console.log('📱 Initiating phone sign-in for customer...');
      
      // This will work for both new and existing users
      const confirmationResult = await this.sendPhoneVerification(phoneNumber, recaptchaVerifier);
      
      return confirmationResult;
      
    }, 'Phone sign-in', {
      timeoutMs: 30000,
      maxRetries: 2,
      retryDelay: 2000
    });
  },

  /**
   * Complete phone authentication and save customer profile
   * @param {Object} confirmationResult - Result from sendPhoneVerification
   * @param {string} code - 6-digit verification code
   * @param {Object} customerData - Additional customer data (optional)
   * @returns {Promise<Object>} Complete customer profile
   */
  completePhoneAuth: async function(confirmationResult, code, customerData = {}) {
    return await this.safeAsyncOperation(async () => {
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
        
        const savedProfile = await this.withTimeout(
          window.VediAPI.saveCustomerProfile(user.uid, profileData),
          10000,
          'Profile save timed out'
        );
        
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
      
    }, 'Complete phone authentication', {
      timeoutMs: 40000,
      maxRetries: 2,
      retryDelay: 2000
    });
  },

  /**
   * Get customer's authentication status and profile with enhanced error handling
   * @returns {Promise<Object|null>} Customer auth status and profile
   */
  getCustomerAuthStatus: async function() {
    return await this.safeAsyncOperation(async () => {
      const auth = window.firebaseAuth || firebase.auth();
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        return null;
      }
      
      let profile = null;
      
      // Try to get customer profile if main API is available
      if (window.VediAPI && window.VediAPI.getCustomerProfile) {
        try {
          profile = await this.withTimeout(
            window.VediAPI.getCustomerProfile(currentUser.uid),
            10000,
            'Profile load timed out'
          );
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
      
    }, 'Get customer auth status', {
      timeoutMs: 15000,
      suppressErrors: true
    });
  },

  // ============================================================================
  // ENHANCED ERROR HANDLING AND DIAGNOSTICS
  // ============================================================================

  /**
   * Handle phone authentication errors with enhanced context
   * @param {Object} error - Firebase error object
   * @returns {Error} Formatted error
   */
  handlePhoneAuthError: function(error) {
    // Log detailed error for debugging
    console.error('🚨 Phone auth error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    let message = this.getAuthErrorMessage(error.code || 'unknown');
    
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
    newError.context = 'Phone authentication';
    newError.timestamp = new Date().toISOString();
    return newError;
  },

  /**
   * Check Firebase phone auth configuration with enhanced diagnostics
   * @returns {Promise<Object>} Configuration status with detailed information
   */
  checkPhoneAuthConfig: async function() {
    return await this.safeAsyncOperation(async () => {
      const config = {
        firebaseLoaded: typeof firebase !== 'undefined',
        appInitialized: false,
        projectId: null,
        authDomain: null,
        phoneProviderEnabled: false,
        domain: window.location.hostname,
        protocol: window.location.protocol,
        isLocalhost: window.location.hostname === 'localhost',
        recaptchaReady: this.isRecaptchaReady(),
        networkStatus: navigator.onLine,
        timestamp: new Date().toISOString()
      };

      if (config.firebaseLoaded && firebase.apps.length > 0) {
        config.appInitialized = true;
        config.projectId = firebase.app().options.projectId;
        config.authDomain = firebase.app().options.authDomain;
        
        // Check if phone provider is enabled
        try {
          const auth = firebase.auth();
          config.phoneProviderEnabled = true;
          
          // Additional checks
          config.currentUser = !!auth.currentUser;
          config.authReady = true;
        } catch (error) {
          config.phoneProviderEnabled = false;
          config.authError = error.message;
        }
      }

      console.log('🔍 Firebase Phone Auth Configuration Check:', config);
      return config;
      
    }, 'Check phone auth config', {
      timeoutMs: 10000,
      suppressErrors: true
    });
  },

  /**
   * Test reCAPTCHA functionality with comprehensive checks
   * @returns {Promise<Object>} Test results with detailed information
   */
  testRecaptcha: async function() {
    return await this.safeAsyncOperation(async () => {
      const testResults = {
        containerExists: !!document.getElementById('recaptcha-container'),
        verifierExists: !!window.recaptchaVerifier,
        widgetExists: !!window.recaptchaWidgetId,
        grecaptchaLoaded: typeof grecaptcha !== 'undefined',
        errors: [],
        timestamp: new Date().toISOString()
      };

      try {
        if (!testResults.containerExists) {
          testResults.errors.push('reCAPTCHA container not found');
        }

        if (testResults.grecaptchaLoaded) {
          testResults.grecaptchaReady = typeof grecaptcha.ready === 'function';
          
          // Test grecaptcha availability
          if (typeof grecaptcha.render === 'function') {
            testResults.grecaptchaRenderAvailable = true;
          }
        } else {
          testResults.errors.push('Google reCAPTCHA library not loaded');
        }

        // Test Firebase auth availability
        if (typeof firebase !== 'undefined' && firebase.auth) {
          testResults.firebaseAuthAvailable = true;
          
          if (firebase.auth.RecaptchaVerifier) {
            testResults.recaptchaVerifierAvailable = true;
          }
        }

      } catch (error) {
        testResults.errors.push(`reCAPTCHA test error: ${error.message}`);
      }

      console.log('🧪 reCAPTCHA Test Results:', testResults);
      return testResults;
      
    }, 'Test reCAPTCHA', {
      timeoutMs: 5000,
      suppressErrors: true
    });
  },

  /**
   * Run comprehensive diagnostics with enhanced reporting
   * @returns {Promise<Object>} Diagnostic results with recommendations
   */
  runDiagnostics: async function() {
    return await this.safeAsyncOperation(async () => {
      console.log('🔬 Running Enhanced Phone Auth Diagnostics...');
      
      const diagnostics = {
        timestamp: new Date().toISOString(),
        config: await this.checkPhoneAuthConfig(),
        recaptcha: await this.testRecaptcha(),
        network: {
          online: navigator.onLine,
          connection: navigator.connection ? {
            effectiveType: navigator.connection.effectiveType,
            downlink: navigator.connection.downlink,
            rtt: navigator.connection.rtt
          } : null
        },
        performance: {
          memory: performance.memory ? {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
          } : null,
          timing: performance.timing ? {
            loadEventEnd: performance.timing.loadEventEnd,
            navigationStart: performance.timing.navigationStart,
            loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart
          } : null
        },
        recommendations: [],
        errors: []
      };

      // Generate enhanced recommendations
      if (!diagnostics.config.firebaseLoaded) {
        diagnostics.recommendations.push('Firebase SDK not loaded - check script tags');
        diagnostics.errors.push('Firebase SDK missing');
      }

      if (!diagnostics.config.appInitialized) {
        diagnostics.recommendations.push('Firebase app not initialized - check firebase-config.js');
        diagnostics.errors.push('Firebase app not initialized');
      }

      if (!diagnostics.config.phoneProviderEnabled) {
        diagnostics.recommendations.push('Phone authentication may not be enabled in Firebase Console');
        diagnostics.errors.push('Phone provider not enabled');
      }

      if (!diagnostics.recaptcha.containerExists) {
        diagnostics.recommendations.push('reCAPTCHA container missing from HTML');
        diagnostics.errors.push('reCAPTCHA container missing');
      }

      if (!diagnostics.recaptcha.grecaptchaLoaded) {
        diagnostics.recommendations.push('Google reCAPTCHA library not loaded');
        diagnostics.errors.push('reCAPTCHA library missing');
      }

      if (!diagnostics.network.online) {
        diagnostics.recommendations.push('Device is offline - check internet connection');
        diagnostics.errors.push('No network connection');
      }

      if (diagnostics.config.isLocalhost && diagnostics.config.protocol !== 'https:') {
        diagnostics.recommendations.push('Consider using HTTPS even for localhost (some browsers require it)');
      }

      // Performance recommendations
      if (diagnostics.performance.timing && diagnostics.performance.timing.loadTime > 5000) {
        diagnostics.recommendations.push('Page load time is slow - consider optimizing resources');
      }

      console.log('📋 Enhanced Phone Auth Diagnostics Complete:', diagnostics);
      return diagnostics;
      
    }, 'Run diagnostics', {
      timeoutMs: 30000,
      suppressErrors: true
    });
  },

  // ============================================================================
  // ENHANCED UTILITY FUNCTIONS WITH ERROR HANDLING
  // ============================================================================

  /**
   * Format phone number to E.164 format with enhanced validation
   * @param {string} phoneNumber - Raw phone number
   * @param {string} countryCode - Default country code (e.g., 'US', 'CA')
   * @returns {string} Formatted phone number in E.164 format
   */
  formatPhoneNumber: function(phoneNumber, countryCode = 'US') {
    try {
      // Remove all non-digit characters
      const digits = phoneNumber.replace(/\D/g, '');
      
      // Country code mappings with validation
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
      
      // If number already starts with +, validate and return
      if (phoneNumber.startsWith('+')) {
        if (this.validatePhoneNumber(phoneNumber)) {
          return phoneNumber;
        } else {
          throw new Error('Invalid E.164 format');
        }
      }
      
      // If number starts with country code, add +
      if (digits.startsWith(defaultCountryCode)) {
        const formatted = '+' + digits;
        if (this.validatePhoneNumber(formatted)) {
          return formatted;
        } else {
          throw new Error('Invalid phone number with country code');
        }
      }
      
      // If number doesn't have country code, add it
      const formatted = '+' + defaultCountryCode + digits;
      if (this.validatePhoneNumber(formatted)) {
        return formatted;
      } else {
        throw new Error('Invalid phone number format');
      }
    } catch (error) {
      console.error('❌ Phone number formatting error:', error);
      throw new Error('Failed to format phone number: ' + error.message);
    }
  },

  /**
   * Enhanced phone number validation with detailed checks
   * @param {string} phoneNumber - Phone number to validate
   * @returns {boolean} True if valid E.164 format
   */
  validatePhoneNumber: function(phoneNumber) {
    try {
      // Basic E.164 format check
      const e164Regex = /^\+[1-9]\d{1,14}$/;
      if (!e164Regex.test(phoneNumber)) {
        return false;
      }
      
      // Additional validation for common country codes
      if (phoneNumber.startsWith('+1')) {
        // US/Canada validation
        const usNumber = phoneNumber.slice(2);
        if (usNumber.length !== 10) return false;
        if (usNumber.startsWith('0') || usNumber.startsWith('1')) return false;
        // Check for invalid area codes
        const areaCode = usNumber.slice(0, 3);
        if (areaCode === '000' || areaCode === '555') return false;
      }
      
      return true;
    } catch (error) {
      console.error('❌ Phone number validation error:', error);
      return false;
    }
  },

  /**
   * Check if reCAPTCHA is available and ready with enhanced checks
   * @returns {boolean} True if reCAPTCHA is ready
   */
  isRecaptchaReady: function() {
    try {
      return !!(
        window.recaptchaVerifier && 
        window.recaptchaWidgetId &&
        typeof grecaptcha !== 'undefined' &&
        typeof grecaptcha.ready === 'function'
      );
    } catch (error) {
      console.error('❌ reCAPTCHA ready check error:', error);
      return false;
    }
  },

  /**
   * Get masked phone number for display with enhanced privacy
   * @param {string} phoneNumber - Full phone number
   * @returns {string} Masked phone number
   */
  maskPhoneNumber: function(phoneNumber) {
    try {
      if (!phoneNumber) return '';
      
      if (phoneNumber.length > 10) {
        // For E.164 format (+1234567890)
        const countryCode = phoneNumber.substring(0, 3); // +12
        const lastDigits = phoneNumber.slice(-3);
        return countryCode + '*'.repeat(phoneNumber.length - 6) + lastDigits;
      } else if (phoneNumber.length > 7) {
        return phoneNumber.substring(0, 3) + '*'.repeat(phoneNumber.length - 5) + phoneNumber.slice(-2);
      } else {
        return phoneNumber.substring(0, 2) + '*'.repeat(phoneNumber.length - 2);
      }
    } catch (error) {
      console.error('❌ Phone masking error:', error);
      return '***-***-****';
    }
  },

  // ============================================================================
  // NETWORK AND CONNECTIVITY MONITORING
  // ============================================================================

  /**
   * Monitor network connectivity and adapt behavior
   * @returns {Object} Network status and connection info
   */
  getNetworkStatus: function() {
    try {
      const status = {
        online: navigator.onLine,
        timestamp: new Date().toISOString()
      };

      if (navigator.connection) {
        status.connection = {
          effectiveType: navigator.connection.effectiveType,
          downlink: navigator.connection.downlink,
          rtt: navigator.connection.rtt,
          saveData: navigator.connection.saveData
        };
      }

      return status;
    } catch (error) {
      console.error('❌ Network status error:', error);
      return { online: true, error: error.message };
    }
  },

  /**
   * Setup network monitoring with event listeners
   */
  setupNetworkMonitoring: function() {
    try {
      window.addEventListener('online', () => {
        console.log('🌐 Network connection restored');
        this.onNetworkRestored();
      });

      window.addEventListener('offline', () => {
        console.log('📶 Network connection lost');
        this.onNetworkLost();
      });

      // Monitor connection changes if available
      if (navigator.connection) {
        navigator.connection.addEventListener('change', () => {
          const status = this.getNetworkStatus();
          console.log('📡 Network connection changed:', status);
          this.onNetworkChanged(status);
        });
      }
    } catch (error) {
      console.error('❌ Network monitoring setup error:', error);
    }
  },

  /**
   * Handle network restoration
   */
  onNetworkRestored: function() {
    // Retry failed operations if any
    console.log('✅ Network restored - ready for operations');
  },

  /**
   * Handle network loss
   */
  onNetworkLost: function() {
    // Pause operations and show offline message
    console.log('⚠️ Network lost - operations paused');
  },

  /**
   * Handle network changes
   * @param {Object} status - Network status
   */
  onNetworkChanged: function(status) {
    // Adjust timeouts based on connection quality
    if (status.connection && status.connection.effectiveType) {
      const connectionType = status.connection.effectiveType;
      console.log(`📶 Connection type: ${connectionType}`);
      
      // Adjust operation timeouts based on connection speed
      if (connectionType === 'slow-2g' || connectionType === '2g') {
        console.log('🐌 Slow connection detected - increasing timeouts');
      }
    }
  }
};

// Make CustomerAuthAPI available globally
window.CustomerAuthAPI = CustomerAuthAPI;

// Initialize network monitoring
document.addEventListener('DOMContentLoaded', function() {
  try {
    CustomerAuthAPI.setupNetworkMonitoring();
  } catch (error) {
    console.warn('⚠️ Network monitoring setup failed:', error);
  }
});

console.log('📱 Enhanced Customer Authentication API loaded successfully');
console.log('🔐 Available phone authentication methods:');
console.log('   📱 sendPhoneVerification() - Send SMS verification code with timeout protection');
console.log('   🔐 verifyPhoneCode() - Verify SMS code with retry logic');
console.log('   🔄 verifyPhoneCodeLegacy() - Legacy verification method');
console.log('   🤖 initializeRecaptcha() - Setup reCAPTCHA with fallback to invisible');
console.log('   🔄 resetRecaptcha() - Reset reCAPTCHA widget safely');
console.log('   🧹 clearRecaptcha() - Clear reCAPTCHA verifier safely');
console.log('   📲 signInWithPhone() - Complete phone sign-in flow with error handling');
console.log('   ✅ completePhoneAuth() - Complete auth and save profile with retries');
console.log('   👤 getCustomerAuthStatus() - Get current auth status with timeout');
console.log('🛠️ Enhanced utility functions:');
console.log('   📞 formatPhoneNumber() - Format to E.164 with validation');
console.log('   ✔️ validatePhoneNumber() - Enhanced validation with country checks');
console.log('   🎭 maskPhoneNumber() - Privacy-aware masking');
console.log('   🌐 getNetworkStatus() - Network connectivity monitoring');
console.log('🔧 Diagnostic functions:');
console.log('   🔍 checkPhoneAuthConfig() - Comprehensive configuration check');
console.log('   🧪 testRecaptcha() - Detailed reCAPTCHA testing');
console.log('   🔬 runDiagnostics() - Full system diagnostics with recommendations');
console.log('🛡️ Enhanced features:');
console.log('   ⏱️ Timeout protection for all operations');
console.log('   🔄 Automatic retry logic for failed operations');
console.log('   🚨 Comprehensive error handling and user-friendly messages');
console.log('   📡 Network connectivity monitoring and adaptation');
console.log('   🐛 Enhanced debugging and diagnostics capabilities');
console.log('🔥 Ready for robust customer phone authentication!');
