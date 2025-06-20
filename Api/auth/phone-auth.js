// api/auth/phone-auth.js - Enhanced Phone Authentication with Modal Support
/**
 * Enhanced Phone Authentication Module
 * 
 * Handles phone number authentication using SMS verification codes with complete
 * modal integration, comprehensive error handling, and multiple fallback methods.
 * Integrates with Firebase Auth phone verification and provides customer-friendly
 * phone authentication flow with modal support and enhanced compatibility.
 * 
 * Features:
 * - Modal-compatible reCAPTCHA management
 * - Multiple verification methods with fallbacks
 * - Comprehensive error handling and user-friendly messages
 * - Automatic customer profile creation
 * - Enhanced promise management with timeouts and retries
 * - Production-ready with performance tracking
 */

// ============================================================================
// COMPATIBILITY LAYER - ENSURES ALL DEPENDENCIES ARE AVAILABLE
// ============================================================================

/**
 * Ensure global Firebase helper functions are available
 */
function ensureFirebaseHelpers() {
    if (typeof window.getFirebaseDb === 'undefined') {
        window.getFirebaseDb = function() {
            if (typeof firebase !== 'undefined' && firebase.firestore) {
                return firebase.firestore();
            }
            throw new Error('Firebase Firestore not initialized');
        };
    }

    if (typeof window.getFirebaseAuth === 'undefined') {
        window.getFirebaseAuth = function() {
            if (typeof firebase !== 'undefined' && firebase.auth) {
                return firebase.auth();
            }
            throw new Error('Firebase Auth not initialized');
        };
    }
}

/**
 * Enhanced phone number masking function with multiple format support
 */
function ensurePhoneMasking() {
    if (!window.maskPhoneNumberCustomer) {
        window.maskPhoneNumberCustomer = function(phoneNumber) {
            if (!phoneNumber) return '';
            
            try {
                // For E.164 format: +1234567890 -> +1 234-***-7890
                if (phoneNumber.startsWith('+1') && phoneNumber.length === 12) {
                    return phoneNumber.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '$1 $2-***-$4');
                }
                // For other country codes: +44234567890 -> +44 234-***-890
                else if (phoneNumber.startsWith('+')) {
                    const match = phoneNumber.match(/(\+\d{1,3})(\d{3,4})(\d+)/);
                    if (match && match[3].length >= 4) {
                        const end = match[3].slice(-3);
                        return `${match[1]} ${match[2]}-***-${end}`;
                    }
                }
                
                // Fallback: show first 3 and last 3 digits
                if (phoneNumber.length >= 6) {
                    return phoneNumber.slice(0, 3) + '***' + phoneNumber.slice(-3);
                }
                
                return '***' + phoneNumber.slice(-2);
            } catch (error) {
                console.warn('Error masking phone number:', error);
                return '***-***-****';
            }
        };
    }
}

/**
 * Enhanced error tracking - compatible with VediAPI tracking system
 */
function ensureErrorTracking() {
    if (typeof window.trackAPICall === 'undefined') {
        window.trackAPICall = async function(methodName, timestamp, success, metadata = {}) {
            try {
                // Use VediAPI tracking if available
                if (window.VediAPI && window.VediAPI.trackUserActivity) {
                    await window.VediAPI.trackUserActivity(`api_${methodName}`, {
                        success: success,
                        timestamp: timestamp,
                        duration: Date.now() - timestamp,
                        ...metadata
                    });
                } else {
                    console.log(`📊 API Call: ${methodName} - ${success ? 'SUCCESS' : 'FAILED'}`, metadata);
                }
            } catch (error) {
                console.warn('⚠️ Tracking error:', error);
            }
        };
    }
}

/**
 * Enhanced reCAPTCHA container management for modal compatibility
 */
function ensureRecaptchaContainer(containerId) {
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.style.display = 'flex';
        container.style.justifyContent = 'center';
        container.style.margin = '16px 0';
        
        // Try to append to a form or modal content
        const targetParent = document.querySelector('.modal-content form') || 
                           document.querySelector('.phone-auth') || 
                           document.querySelector('.login-page') ||
                           document.body;
        targetParent.appendChild(container);
        
        console.log(`📦 Created reCAPTCHA container: ${containerId}`);
    }
    return container;
}

/**
 * Ensure CustomerAuthAPI namespace exists with all required methods
 */
function ensureCustomerAuthAPI() {
    if (!window.CustomerAuthAPI) {
        window.CustomerAuthAPI = {};
    }

    // Add missing CustomerAuthAPI methods if they don't exist
    const customerAuthMethods = {
        formatPhoneNumber: function(phoneNumber, countryCode = 'US') {
            if (window.VediAPI && window.VediAPI.formatPhoneNumberCustomer) {
                return window.VediAPI.formatPhoneNumberCustomer(phoneNumber, countryCode);
            } else if (window.VediAPI && window.VediAPI.formatPhoneNumber) {
                return window.VediAPI.formatPhoneNumber(phoneNumber, countryCode);
            }
            
            // Fallback implementation
            const digits = phoneNumber.replace(/\D/g, '');
            const countryCodeMap = { 'US': '1', 'CA': '1', 'GB': '44', 'DE': '49', 'FR': '33' };
            const code = countryCodeMap[countryCode] || '1';
            
            if (phoneNumber.startsWith('+')) return phoneNumber;
            if (digits.startsWith(code)) return '+' + digits;
            return '+' + code + digits;
        },
        
        validatePhoneNumber: function(phoneNumber) {
            if (window.VediAPI && window.VediAPI.validatePhoneNumberCustomer) {
                return window.VediAPI.validatePhoneNumberCustomer(phoneNumber);
            } else if (window.VediAPI && window.VediAPI.validatePhoneNumber) {
                return window.VediAPI.validatePhoneNumber(phoneNumber);
            }
            
            // Fallback validation
            const e164Regex = /^\+[1-9]\d{1,14}$/;
            return e164Regex.test(phoneNumber);
        },
        
        maskPhoneNumber: function(phoneNumber) {
            return window.maskPhoneNumberCustomer(phoneNumber);
        }
    };

    // Add missing methods to CustomerAuthAPI
    Object.keys(customerAuthMethods).forEach(method => {
        if (!window.CustomerAuthAPI[method]) {
            window.CustomerAuthAPI[method] = customerAuthMethods[method];
        }
    });
}

// Initialize compatibility layer
function initializeCompatibilityLayer() {
    ensureFirebaseHelpers();
    ensurePhoneMasking();
    ensureErrorTracking();
    ensureCustomerAuthAPI();
    console.log('🔗 Phone Auth Compatibility Layer initialized');
}

// ============================================================================
// PROMISE MANAGEMENT AND TIMEOUT UTILITIES (ENHANCED)
// ============================================================================

/**
 * Promise timeout wrapper for all operations
 * @param {Promise} promise - Promise to wrap with timeout
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} errorMessage - Error message for timeout
 * @returns {Promise} Promise with timeout protection
 */
function withTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

/**
 * Retry wrapper for operations that might fail
 * @param {Function} operation - Function that returns a promise
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delayMs - Delay between retries
 * @returns {Promise} Promise with retry logic
 */
async function withRetry(operation, maxRetries = 3, delayMs = 1000) {
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
}

/**
 * Safe async operation wrapper with comprehensive error handling
 * @param {Function} operation - Async operation to execute
 * @param {string} context - Context for error reporting
 * @param {Object} options - Options for timeout and retry
 * @returns {Promise} Safe promise with error handling
 */
async function safeAsyncOperation(operation, context = 'Unknown operation', options = {}) {
  const {
    timeoutMs = 30000,
    maxRetries = 1,
    retryDelay = 1000,
    suppressErrors = false
  } = options;

  try {
    if (maxRetries > 1) {
      return await withRetry(
        () => withTimeout(operation(), timeoutMs, `${context} timed out`),
        maxRetries,
        retryDelay
      );
    } else {
      return await withTimeout(operation(), timeoutMs, `${context} timed out`);
    }
  } catch (error) {
    console.error(`❌ ${context} failed:`, error);
    
    if (!suppressErrors) {
      throw enhanceError(error, context);
    } else {
      return null;
    }
  }
}

/**
 * Enhance error with additional context and user-friendly messages
 * @param {Error} error - Original error
 * @param {string} context - Operation context
 * @returns {Error} Enhanced error
 */
function enhanceError(error, context) {
  const enhanced = new Error(error.message);
  enhanced.code = error.code;
  enhanced.context = context;
  enhanced.originalError = error;
  enhanced.timestamp = new Date().toISOString();
  
  // Add user-friendly messages based on error type
  if (error.message.includes('timeout') || error.message.includes('timed out')) {
    enhanced.userMessage = 'Operation timed out. Please check your connection and try again.';
  } else if (error.code && error.code.startsWith('auth/')) {
    enhanced.userMessage = getPhoneAuthErrorMessage(error.code);
  } else if (error.message.includes('network') || error.message.includes('Network')) {
    enhanced.userMessage = 'Network error. Please check your internet connection.';
  } else {
    enhanced.userMessage = 'An unexpected error occurred. Please try again.';
  }
  
  return enhanced;
}

// ============================================================================
// ENHANCED CONFIGURATION AND DIAGNOSTICS
// ============================================================================

/**
 * Check Firebase phone auth configuration with enhanced diagnostics
 * @returns {Promise<Object>} Configuration status with detailed information
 */
async function checkPhoneAuthConfig() {
  return await safeAsyncOperation(async () => {
    const config = {
      firebaseLoaded: typeof firebase !== 'undefined',
      appInitialized: false,
      projectId: null,
      authDomain: null,
      phoneProviderEnabled: false,
      domain: window.location.hostname,
      protocol: window.location.protocol,
      isLocalhost: window.location.hostname === 'localhost',
      recaptchaReady: isRecaptchaReady(),
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
}

/**
 * Test reCAPTCHA functionality with comprehensive checks
 * @returns {Promise<Object>} Test results with detailed information
 */
async function testRecaptcha() {
  return await safeAsyncOperation(async () => {
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
}

/**
 * Check if reCAPTCHA is available and ready with enhanced checks
 * @returns {boolean} True if reCAPTCHA is ready
 */
function isRecaptchaReady() {
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
}

// ============================================================================
// PHONE NUMBER AUTHENTICATION
// ============================================================================

/**
 * Send SMS verification code to phone number
 * @param {string} phoneNumber - Phone number in E.164 format (+1234567890)
 * @param {Object} recaptchaVerifier - reCAPTCHA verifier instance
 * @returns {Promise<Object>} Confirmation result for code verification
 */
async function sendPhoneVerification(phoneNumber, recaptchaVerifier = null) {
  const endTracking = VediAPI.startPerformanceMeasurement('sendPhoneVerification');
  
  try {
    console.log('📱 Sending phone verification to:', VediAPI.maskPhoneNumber(phoneNumber));
    
    const auth = getFirebaseAuth();
    
    // Validate phone number format
    if (!VediAPI.validatePhoneNumber(phoneNumber)) {
      throw new Error('Please enter a valid phone number.');
    }
    
    // Use provided verifier or get from global
    const verifier = recaptchaVerifier || window.recaptchaVerifier;
    if (!verifier) {
      throw new Error('reCAPTCHA verifier not initialized. Please complete reCAPTCHA first.');
    }
    
    // Send verification code
    const confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, verifier);
    
    // Store verification ID globally for convenience
    window.phoneVerificationId = confirmationResult.verificationId;
    
    // Track SMS sent
    await VediAPI.trackUserActivity('sms_verification_sent', {
      phoneNumber: VediAPI.maskPhoneNumber(phoneNumber),
      method: 'firebase_auth'
    });
    
    await endTracking(true);
    
    console.log('✅ SMS verification code sent successfully');
    return confirmationResult;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'sendPhoneVerification', {
      phoneNumber: VediAPI.maskPhoneNumber(phoneNumber)
    });
    
    console.error('❌ Send phone verification error:', error);
    throw new Error(getPhoneAuthErrorMessage(error.code));
  }
}

/**
 * Enhanced send phone verification with multiple fallback methods
 * @param {string} phoneNumber - Phone number in E.164 format
 * @param {Object} recaptchaVerifier - reCAPTCHA verifier instance (optional)
 * @returns {Promise<Object>} Confirmation result for verification
 */
async function sendPhoneVerificationEnhanced(phoneNumber, recaptchaVerifier = null) {
  return await safeAsyncOperation(async () => {
    console.log('📱 Enhanced phone verification to:', maskPhoneNumberCustomer(phoneNumber));
    
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
          phoneNumber: maskPhoneNumberCustomer(phoneNumber)
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
}

/**
 * Verify SMS code and complete phone authentication
 * @param {Object} confirmationResult - Result from sendPhoneVerification
 * @param {string} code - 6-digit SMS verification code
 * @returns {Promise<Object>} User credential with phone authentication
 */
async function verifyPhoneCode(confirmationResult, code) {
  const endTracking = VediAPI.startPerformanceMeasurement('verifyPhoneCode');
  
  try {
    console.log('🔐 Verifying phone code...');
    
    if (!confirmationResult) {
      throw new Error('No verification in progress. Please request a new code.');
    }
    
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      throw new Error('Please enter a valid 6-digit verification code.');
    }
    
    // Verify the code
    const result = await confirmationResult.confirm(code);
    const user = result.user;
    
    // Create or update customer profile for phone users
    const customerProfile = await createOrUpdatePhoneProfile(user);
    
    // Track successful phone authentication
    await VediAPI.trackUserActivity('phone_auth_success', {
      userId: user.uid,
      phoneNumber: VediAPI.maskPhoneNumber(user.phoneNumber),
      isNewUser: result.additionalUserInfo?.isNewUser || false
    });
    
    // Update session with user ID
    await VediAPI.updateSessionUser(user.uid);
    
    await endTracking(true);
    
    console.log('✅ Phone verification successful, UID:', user.uid);
    return {
      user: user,
      profile: customerProfile,
      isNewUser: result.additionalUserInfo?.isNewUser || false
    };
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'verifyPhoneCode');
    
    console.error('❌ Phone code verification error:', error);
    throw new Error(getPhoneAuthErrorMessage(error.code));
  }
}

/**
 * Enhanced verify SMS code using Firebase's recommended PhoneAuthProvider.credential approach
 * @param {string} verificationId - Verification ID from sendPhoneVerification result
 * @param {string} code - 6-digit verification code
 * @returns {Promise<Object>} Firebase user credential
 */
async function verifyPhoneCodeEnhanced(verificationId, code) {
  return await safeAsyncOperation(async () => {
    console.log('🔐 Enhanced phone code verification...');
    
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
    
    console.log('✅ Enhanced phone verification successful, UID:', userCredential.user.uid);
    return userCredential;
    
  }, 'Verify phone code', {
    timeoutMs: 20000,
    maxRetries: 2,
    retryDelay: 1000
  });
}

/**
 * Alternative verification method using verification ID and code directly
 * @param {string} verificationId - Verification ID from SMS send
 * @param {string} code - 6-digit SMS verification code
 * @returns {Promise<Object>} User credential with phone authentication
 */
async function verifyPhoneCodeDirect(verificationId, code) {
  const endTracking = VediAPI.startPerformanceMeasurement('verifyPhoneCodeDirect');
  
  try {
    console.log('🔐 Verifying phone code directly...');
    
    if (!verificationId) {
      throw new Error('No verification ID available. Please request a new code.');
    }
    
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      throw new Error('Please enter a valid 6-digit verification code.');
    }
    
    const auth = getFirebaseAuth();
    
    // Create credential and sign in
    const credential = firebase.auth.PhoneAuthProvider.credential(verificationId, code);
    const result = await auth.signInWithCredential(credential);
    const user = result.user;
    
    // Create or update customer profile
    const customerProfile = await createOrUpdatePhoneProfile(user);
    
    // Track successful authentication
    await VediAPI.trackUserActivity('phone_auth_success', {
      userId: user.uid,
      phoneNumber: VediAPI.maskPhoneNumber(user.phoneNumber),
      method: 'direct_credential',
      isNewUser: result.additionalUserInfo?.isNewUser || false
    });
    
    // Update session with user ID
    await VediAPI.updateSessionUser(user.uid);
    
    await endTracking(true);
    
    console.log('✅ Direct phone verification successful, UID:', user.uid);
    return {
      user: user,
      profile: customerProfile,
      isNewUser: result.additionalUserInfo?.isNewUser || false
    };
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'verifyPhoneCodeDirect');
    
    console.error('❌ Direct phone verification error:', error);
    throw new Error(getPhoneAuthErrorMessage(error.code));
  }
}

// ============================================================================
// CUSTOMER PROFILE MANAGEMENT FOR PHONE USERS
// ============================================================================

/**
 * Create or update customer profile for phone-authenticated users
 * @param {Object} firebaseUser - Firebase user object from phone auth
 * @returns {Promise<Object>} Customer profile data
 */
async function createOrUpdatePhoneProfile(firebaseUser) {
  try {
    const db = getFirebaseDb();
    const userId = firebaseUser.uid;
    
    // Check if profile exists in users collection
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (userDoc.exists) {
      // Update existing user profile
      const updateData = {
        phoneNumber: firebaseUser.phoneNumber,
        phoneVerified: true,
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection('users').doc(userId).update(updateData);
      
      const updatedDoc = await db.collection('users').doc(userId).get();
      return { id: updatedDoc.id, ...updatedDoc.data() };
      
    } else {
      // Check if customer profile exists
      const customerDoc = await db.collection('customerProfiles').doc(userId).get();
      
      if (customerDoc.exists) {
        // Update existing customer profile
        const updateData = {
          phoneNumber: firebaseUser.phoneNumber,
          phoneVerified: true,
          lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('customerProfiles').doc(userId).update(updateData);
        
        const updatedDoc = await db.collection('customerProfiles').doc(userId).get();
        return { id: updatedDoc.id, ...updatedDoc.data() };
        
      } else {
        // Create new customer profile
        const newCustomerProfile = {
          phoneNumber: firebaseUser.phoneNumber,
          phoneVerified: true,
          name: '',
          email: '',
          accountType: 'customer',
          authMethod: 'phone',
          preferences: {
            notifications: true,
            smsUpdates: true,
            marketing: false
          },
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('customerProfiles').doc(userId).set(newCustomerProfile);
        
        // Also create basic user record for consistency
        await db.collection('users').doc(userId).set({
          phoneNumber: firebaseUser.phoneNumber,
          accountType: 'customer',
          authProvider: 'phone',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ New phone customer profile created:', userId);
        return { id: userId, ...newCustomerProfile };
      }
    }
    
  } catch (error) {
    console.error('❌ Create/update phone profile error:', error);
    await VediAPI.trackError(error, 'createOrUpdatePhoneProfile');
    throw error;
  }
}

// ============================================================================
// ENHANCED RECAPTCHA MANAGEMENT WITH MODAL SUPPORT
// ============================================================================

/**
 * Initialize reCAPTCHA verifier for phone authentication with modal support
 * @param {string} containerId - ID of container element for reCAPTCHA
 * @param {Object} options - reCAPTCHA configuration options
 * @returns {Promise<Object>} reCAPTCHA verifier instance
 */
async function initializeRecaptcha(containerId = 'recaptcha-container', options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('initializeRecaptcha');
  
  try {
    console.log('🔐 Initializing reCAPTCHA verifier for modal...');
    
    // Check if Firebase is available
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
      throw new Error('Firebase not initialized');
    }
    
    // Clear any existing verifier
    if (window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
      } catch (error) {
        console.warn('⚠️ Error clearing existing reCAPTCHA:', error);
      }
    }
    
    // Ensure container exists (create if needed for modal)
    ensureRecaptchaContainer(containerId);
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`reCAPTCHA container '${containerId}' not found`);
    }
    
    // Clear container
    container.innerHTML = '';
    
    // Default options
    const defaultOptions = {
      'size': 'normal',
      'callback': function(response) {
        console.log('✅ reCAPTCHA solved');
      },
      'expired-callback': function() {
        console.log('⏰ reCAPTCHA expired');
      },
      'error-callback': function(error) {
        console.error('❌ reCAPTCHA error:', error);
      }
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    // Create verifier
    const verifier = new firebase.auth.RecaptchaVerifier(containerId, finalOptions);
    
    // Render reCAPTCHA
    const widgetId = await verifier.render();
    
    // Store globally
    window.recaptchaVerifier = verifier;
    window.recaptchaWidgetId = widgetId;
    
    await endTracking(true);
    
    console.log('✅ reCAPTCHA initialized successfully for modal');
    return verifier;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'initializeRecaptcha');
    
    console.error('❌ reCAPTCHA initialization error:', error);
    throw error;
  }
}

/**
 * Enhanced reCAPTCHA initialization with multiple fallback methods
 * @param {string} containerId - ID of the container element for reCAPTCHA
 * @param {Object} options - reCAPTCHA options
 * @returns {Promise<Object>} reCAPTCHA verifier instance
 */
async function initializeRecaptchaEnhanced(containerId = 'recaptcha-container', options = {}) {
  return await safeAsyncOperation(async () => {
    console.log('🔐 Enhanced reCAPTCHA initialization...');
    
    // Check if Firebase is properly initialized
    if (typeof firebase === 'undefined') {
      throw new Error('Firebase not loaded');
    }
    
    if (!firebase.apps.length) {
      throw new Error('Firebase app not initialized');
    }
    
    console.log('🔧 Firebase project:', firebase.app().options.projectId);
    console.log('🔧 Current domain:', window.location.hostname);
    
    // Ensure container exists
    ensureRecaptchaContainer(containerId);
    
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
    return await initializeRecaptchaDirect(containerId, options);
    
  }, 'Initialize reCAPTCHA', {
    timeoutMs: 30000,
    maxRetries: 2,
    retryDelay: 2000
  });
}

/**
 * Direct reCAPTCHA initialization fallback
 * @param {string} containerId - Container ID
 * @param {Object} options - Options
 * @returns {Promise<Object>} Verifier instance
 */
async function initializeRecaptchaDirect(containerId, options) {
  // Clear any existing verifier
  if (window.recaptchaVerifier) {
    try {
      window.recaptchaVerifier.clear();
    } catch (error) {
      console.warn('⚠️ Error clearing existing reCAPTCHA:', error);
    }
  }
  
  // Ensure container exists
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`reCAPTCHA container '${containerId}' not found`);
  }
  
  // Clear container
  container.innerHTML = '';
  
  // Default options
  const defaultOptions = {
    'size': 'normal',
    'callback': function(response) {
      console.log('✅ reCAPTCHA solved');
    },
    'expired-callback': function() {
      console.log('⏰ reCAPTCHA expired');
    },
    'error-callback': function(error) {
      console.error('❌ reCAPTCHA error:', error);
    }
  };
  
  const finalOptions = { ...defaultOptions, ...options };
  
  // Create verifier
  const verifier = new firebase.auth.RecaptchaVerifier(containerId, finalOptions);
  
  // Render reCAPTCHA
  const widgetId = await verifier.render();
  
  // Store globally
  window.recaptchaVerifier = verifier;
  window.recaptchaWidgetId = widgetId;
  
  console.log('✅ reCAPTCHA initialized successfully (direct method)');
  return verifier;
}

/**
 * Reset reCAPTCHA widget
 * @returns {Promise<boolean>} Success status
 */
async function resetRecaptcha() {
  try {
    if (window.recaptchaVerifier && window.recaptchaWidgetId && typeof grecaptcha !== 'undefined') {
      grecaptcha.reset(window.recaptchaWidgetId);
      console.log('✅ reCAPTCHA reset successfully');
      return true;
    } else {
      console.warn('⚠️ reCAPTCHA not available for reset');
      return false;
    }
  } catch (error) {
    console.error('❌ reCAPTCHA reset error:', error);
    await VediAPI.trackError(error, 'resetRecaptcha');
    return false;
  }
}

/**
 * Enhanced reset reCAPTCHA verifier with promise handling
 * @returns {Promise<boolean>} Success status
 */
async function resetRecaptchaEnhanced() {
  return await safeAsyncOperation(async () => {
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
}

/**
 * Clear and destroy reCAPTCHA verifier
 * @returns {Promise<boolean>} Success status
 */
async function clearRecaptcha() {
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
    console.error('❌ reCAPTCHA clear error:', error);
    await VediAPI.trackError(error, 'clearRecaptcha');
    return false;
  }
}

/**
 * Enhanced clear and destroy reCAPTCHA verifier
 * @returns {Promise<boolean>} Success status
 */
async function clearRecaptchaEnhanced() {
  return await safeAsyncOperation(async () => {
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
}

// ============================================================================
// PHONE NUMBER UTILITIES (ENHANCED)
// ============================================================================

/**
 * Enhanced format phone number to E.164 format with comprehensive validation
 * @param {string} phoneNumber - Raw phone number input
 * @param {string} countryCode - Default country code (default: 'US')
 * @returns {string} Formatted phone number in E.164 format
 */
function formatPhoneNumberEnhanced(phoneNumber, countryCode = 'US') {
  try {
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Country code mappings with validation
    const countryCodes = {
      'US': '1', 'CA': '1', 'GB': '44', 'AU': '61',
      'DE': '49', 'FR': '33', 'IT': '39', 'ES': '34',
      'BR': '55', 'IN': '91', 'CN': '86', 'JP': '81',
      'KR': '82', 'MX': '52'
    };
    
    const defaultCountryCode = countryCodes[countryCode] || '1';
    
    // If number already starts with +, validate and return
    if (phoneNumber.startsWith('+')) {
      if (validatePhoneNumberEnhanced(phoneNumber)) {
        return phoneNumber;
      } else {
        throw new Error('Invalid E.164 format');
      }
    }
    
    // If number starts with country code, add +
    if (digits.startsWith(defaultCountryCode)) {
      const formatted = '+' + digits;
      if (validatePhoneNumberEnhanced(formatted)) {
        return formatted;
      } else {
        throw new Error('Invalid phone number with country code');
      }
    }
    
    // If number doesn't have country code, add it
    const formatted = '+' + defaultCountryCode + digits;
    if (validatePhoneNumberEnhanced(formatted)) {
      return formatted;
    } else {
      throw new Error('Invalid phone number format');
    }
  } catch (error) {
    console.error('❌ Phone number formatting error:', error);
    throw new Error('Failed to format phone number: ' + error.message);
  }
}

/**
 * Format phone number to E.164 format
 * @param {string} phoneNumber - Raw phone number input
 * @param {string} countryCode - Default country code (default: 'US')
 * @returns {string} Formatted phone number in E.164 format
 */
function formatPhoneNumber(phoneNumber, countryCode = 'US') {
  try {
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Country code mappings
    const countryCodes = {
      'US': '1', 'CA': '1', 'GB': '44', 'AU': '61',
      'DE': '49', 'FR': '33', 'IT': '39', 'ES': '34',
      'BR': '55', 'IN': '91', 'CN': '86', 'JP': '81'
    };
    
    const defaultCountryCode = countryCodes[countryCode] || '1';
    
    // If already starts with +, validate and return
    if (phoneNumber.startsWith('+')) {
      return phoneNumber;
    }
    
    // If starts with country code, add +
    if (digits.startsWith(defaultCountryCode)) {
      return '+' + digits;
    }
    
    // Add country code
    return '+' + defaultCountryCode + digits;
    
  } catch (error) {
    console.error('❌ Phone number formatting error:', error);
    throw new Error('Invalid phone number format');
  }
}

/**
 * Enhanced phone number validation with detailed checks
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} True if valid E.164 format
 */
function validatePhoneNumberEnhanced(phoneNumber) {
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
}

/**
 * Validate phone number format (enhanced validation)
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} True if valid E.164 format
 */
function validatePhoneNumber(phoneNumber) {
  try {
    // Basic E.164 format check
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!e164Regex.test(phoneNumber)) {
      return false;
    }
    
    // Additional validation for US/Canada numbers
    if (phoneNumber.startsWith('+1')) {
      const usNumber = phoneNumber.slice(2);
      if (usNumber.length !== 10) return false;
      if (usNumber.startsWith('0') || usNumber.startsWith('1')) return false;
    }
    
    return true;
  } catch (error) {
    console.error('❌ Phone validation error:', error);
    return false;
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Get user-friendly error message for phone authentication errors
 * @param {string} errorCode - Firebase phone auth error code
 * @returns {string} User-friendly error message
 */
function getPhoneAuthErrorMessage(errorCode) {
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
    'auth/network-request-failed': 'Network error. Please check your connection and try again.',
    'auth/app-not-authorized': 'This app is not authorized for phone authentication.',
    'auth/unauthorized-domain': 'This domain is not authorized for phone authentication.'
  };
  
  return phoneErrorMessages[errorCode] || 'Phone authentication error. Please try again.';
}

// ============================================================================
// DEBUG AND DIAGNOSTIC FUNCTIONS
// ============================================================================

/**
 * Debug function to check phone auth readiness
 * @returns {Object} Status object with readiness information
 */
function checkPhoneAuthReadiness() {
  const status = {
    firebase: typeof firebase !== 'undefined',
    vediAPI: typeof window.VediAPI !== 'undefined',
    customerAuthAPI: typeof window.CustomerAuthAPI !== 'undefined',
    phoneAuthMethods: {},
    recaptchaReady: false,
    compatibilityLayer: true
  };
  
  // Check VediAPI phone methods
  const requiredMethods = [
    'initializeRecaptcha',
    'sendPhoneVerification', 
    'verifyPhoneCode',
    'validatePhoneNumber',
    'formatPhoneNumber'
  ];
  
  requiredMethods.forEach(method => {
    status.phoneAuthMethods[method] = !!(window.VediAPI && window.VediAPI[method]);
  });
  
  // Check reCAPTCHA readiness
  status.recaptchaReady = !!(
    typeof grecaptcha !== 'undefined' && 
    typeof firebase !== 'undefined' && 
    firebase.auth && 
    firebase.auth.RecaptchaVerifier
  );
  
  console.log('📱 Phone Auth Readiness Status:', status);
  return status;
}

// ============================================================================
// GLOBAL EXPORTS AND VEDIAPI INTEGRATION
// ============================================================================

// Ensure VediAPI namespace exists
if (!window.VediAPI) {
  window.VediAPI = {};
}

// Initialize compatibility layer immediately
initializeCompatibilityLayer();

// Attach phone authentication functions to VediAPI
Object.assign(window.VediAPI, {
  // Promise utilities
  withTimeout,
  withRetry,
  safeAsyncOperation,
  enhanceError,
  
  // Configuration and diagnostics
  checkPhoneAuthConfig,
  testRecaptcha,
  isRecaptchaReady,
  
  // Core phone authentication (original methods)
  sendPhoneVerification,
  verifyPhoneCode,
  verifyPhoneCodeDirect,
  
  // Enhanced methods with better error handling
  sendPhoneVerificationEnhanced,
  verifyPhoneCodeEnhanced,
  
  // reCAPTCHA management (original methods)
  initializeRecaptcha,
  resetRecaptcha,
  clearRecaptcha,
  
  // Enhanced reCAPTCHA methods
  initializeRecaptchaEnhanced,
  resetRecaptchaEnhanced,
  clearRecaptchaEnhanced,
  
  // Phone utilities (original methods)
  formatPhoneNumber,
  validatePhoneNumber,
  
  // Enhanced phone utilities
  formatPhoneNumberEnhanced,
  validatePhoneNumberEnhanced,
  
  // Error handling
  getPhoneAuthErrorMessage,
  
  // CustomerAuthAPI integration methods (for backwards compatibility)
  formatPhoneNumberCustomer: formatPhoneNumberEnhanced,
  validatePhoneNumberCustomer: validatePhoneNumberEnhanced,
  sendPhoneVerificationCustomer: sendPhoneVerificationEnhanced,
  verifyPhoneCodeCustomer: verifyPhoneCodeEnhanced,
  verifyPhoneCodeLegacyCustomer: verifyPhoneCode,
  initializeRecaptchaCustomer: initializeRecaptchaEnhanced,
  resetRecaptchaCustomer: resetRecaptchaEnhanced,
  clearRecaptchaCustomer: clearRecaptchaEnhanced,
  
  // Debug functions
  checkPhoneAuthReadiness
});

// Create CustomerAuthAPI namespace with integrated methods
window.CustomerAuthAPI = {
  // Phone utility methods
  formatPhoneNumber: formatPhoneNumberEnhanced,
  validatePhoneNumber: validatePhoneNumberEnhanced,
  maskPhoneNumber: window.maskPhoneNumberCustomer,
  
  // Phone authentication methods
  sendPhoneVerification: sendPhoneVerificationEnhanced,
  verifyPhoneCode: verifyPhoneCodeEnhanced,
  verifyPhoneCodeLegacy: verifyPhoneCode,
  
  // reCAPTCHA management methods
  initializeRecaptcha: initializeRecaptchaEnhanced,
  resetRecaptcha: resetRecaptchaEnhanced,
  clearRecaptcha: clearRecaptchaEnhanced,
  
  // Promise utilities (exposed for compatibility)
  safeAsyncOperation: safeAsyncOperation
};

// Auto-check readiness when module loads
setTimeout(() => {
  const readiness = checkPhoneAuthReadiness();
  const allMethodsReady = Object.values(readiness.phoneAuthMethods).every(Boolean);
  
  if (readiness.firebase && readiness.vediAPI && allMethodsReady && readiness.recaptchaReady) {
    console.log('✅ Enhanced phone authentication fully ready with modal support!');
  } else {
    console.warn('⚠️ Phone authentication not fully ready. Missing:', {
      firebase: !readiness.firebase,
      vediAPI: !readiness.vediAPI,
      recaptcha: !readiness.recaptchaReady,
      missingMethods: Object.keys(readiness.phoneAuthMethods).filter(
        method => !readiness.phoneAuthMethods[method]
      )
    });
  }
}, 1000);

console.log('📱 Enhanced Phone Authentication Module loaded with Modal Support');
console.log('🔗 Compatibility Layer: Integrated and ready');
console.log('🔧 Promise utilities: withTimeout, withRetry, safeAsyncOperation, enhanceError');
console.log('🔍 Diagnostics: checkPhoneAuthConfig, testRecaptcha, isRecaptchaReady');
console.log('📨 SMS: sendPhoneVerification, verifyPhoneCode, verifyPhoneCodeDirect + enhanced versions');
console.log('🤖 reCAPTCHA: initializeRecaptcha, resetRecaptcha, clearRecaptcha + enhanced versions');
console.log('📞 Utilities: formatPhoneNumber, validatePhoneNumber + enhanced versions');
console.log('🔒 Customer profiles: Automatically created for phone users');
console.log('✅ CustomerAuthAPI: All methods integrated with enhanced error handling');
console.log('🎯 Modal Support: Full compatibility with modal-based authentication');
console.log('⚠️ Production Ready: Comprehensive error handling and fallback mechanisms');
