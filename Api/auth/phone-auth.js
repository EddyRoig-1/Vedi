// api/auth/phone-auth.js - Phone Authentication with SMS Verification
/**
 * Phone Authentication Module
 * 
 * Handles phone number authentication using SMS verification codes.
 * Integrates with Firebase Auth phone verification and provides
 * customer-friendly phone authentication flow with comprehensive
 * error handling and reCAPTCHA management.
 * 
 * Note: This module provides basic phone auth infrastructure. 
 * For enhanced phone auth features, use the CustomerAuthAPI module.
 */

// ============================================================================
// PROMISE MANAGEMENT AND TIMEOUT UTILITIES (INJECTED FROM CUSTOMER-AUTH-API)
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
// ENHANCED CONFIGURATION AND DIAGNOSTICS (INJECTED FROM CUSTOMER-AUTH-API)
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
// CUSTOMER AUTH API INTEGRATION - PHONE METHODS
// ============================================================================

/**
 * Format phone number to E.164 format with enhanced validation (CustomerAuthAPI method)
 * @param {string} phoneNumber - Raw phone number
 * @param {string} countryCode - Default country code (e.g., 'US', 'CA')
 * @returns {string} Formatted phone number in E.164 format
 */
function formatPhoneNumberCustomer(phoneNumber, countryCode = 'US') {
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
      if (validatePhoneNumberCustomer(phoneNumber)) {
        return phoneNumber;
      } else {
        throw new Error('Invalid E.164 format');
      }
    }
    
    // If number starts with country code, add +
    if (digits.startsWith(defaultCountryCode)) {
      const formatted = '+' + digits;
      if (validatePhoneNumberCustomer(formatted)) {
        return formatted;
      } else {
        throw new Error('Invalid phone number with country code');
      }
    }
    
    // If number doesn't have country code, add it
    const formatted = '+' + defaultCountryCode + digits;
    if (validatePhoneNumberCustomer(formatted)) {
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
 * Enhanced phone number validation with detailed checks (CustomerAuthAPI method)
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} True if valid E.164 format
 */
function validatePhoneNumberCustomer(phoneNumber) {
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
 * Send SMS verification code for phone authentication (CustomerAuthAPI method)
 * @param {string} phoneNumber - Phone number in E.164 format
 * @param {Object} recaptchaVerifier - reCAPTCHA verifier instance (optional)
 * @returns {Promise<Object>} Confirmation result for verification
 */
async function sendPhoneVerificationCustomer(phoneNumber, recaptchaVerifier = null) {
  return await safeAsyncOperation(async () => {
    console.log('📱 Sending phone verification to:', maskPhoneNumberCustomer(phoneNumber));
    
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
 * Verify SMS code using Firebase's recommended PhoneAuthProvider.credential approach (CustomerAuthAPI method)
 * @param {string} verificationId - Verification ID from sendPhoneVerification result
 * @param {string} code - 6-digit verification code
 * @returns {Promise<Object>} Firebase user credential
 */
async function verifyPhoneCodeCustomer(verificationId, code) {
  return await safeAsyncOperation(async () => {
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
}

/**
 * Alternative method using confirmationResult.confirm (legacy approach) (CustomerAuthAPI method)
 * @param {Object} confirmationResult - Result from sendPhoneVerification
 * @param {string} code - 6-digit verification code
 * @returns {Promise<Object>} Firebase user credential
 */
async function verifyPhoneCodeLegacyCustomer(confirmationResult, code) {
  return await safeAsyncOperation(async () => {
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
// RECAPTCHA MANAGEMENT
// ============================================================================

/**
 * Initialize reCAPTCHA verifier for phone authentication
 * @param {string} containerId - ID of container element for reCAPTCHA
 * @param {Object} options - reCAPTCHA configuration options
 * @returns {Promise<Object>} reCAPTCHA verifier instance
 */
async function initializeRecaptcha(containerId = 'recaptcha-container', options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('initializeRecaptcha');
  
  try {
    console.log('🔐 Initializing reCAPTCHA verifier...');
    
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
    
    await endTracking(true);
    
    console.log('✅ reCAPTCHA initialized successfully');
    return verifier;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'initializeRecaptcha');
    
    console.error('❌ reCAPTCHA initialization error:', error);
    throw error;
  }
}

/**
 * Initialize reCAPTCHA verifier with enhanced error handling (CustomerAuthAPI method)
 * @param {string} containerId - ID of the container element for reCAPTCHA
 * @param {Object} options - reCAPTCHA options
 * @returns {Promise<Object>} reCAPTCHA verifier instance
 */
async function initializeRecaptchaCustomer(containerId = 'recaptcha-container', options = {}) {
  return await safeAsyncOperation(async () => {
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
 * Reset reCAPTCHA verifier with promise handling (CustomerAuthAPI method)
 * @returns {Promise<boolean>} Success status
 */
async function resetRecaptchaCustomer() {
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
 * Clear and destroy reCAPTCHA verifier with enhanced error handling (CustomerAuthAPI method)
 * @returns {Promise<boolean>} Success status
 */
async function clearRecaptchaCustomer() {
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
// PHONE NUMBER UTILITIES
// ============================================================================

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
// GLOBAL EXPORTS AND VEDIAPI INTEGRATION
// ============================================================================

// Ensure VediAPI namespace exists
if (!window.VediAPI) {
  window.VediAPI = {};
}

// Attach phone authentication functions to VediAPI
Object.assign(window.VediAPI, {
  // INJECTED: Promise utilities from customer-auth-api
  withTimeout,
  withRetry,
  safeAsyncOperation,
  enhanceError,
  
  // INJECTED: Configuration and diagnostics
  checkPhoneAuthConfig,
  testRecaptcha,
  isRecaptchaReady,
  
  // Core phone authentication
  sendPhoneVerification,
  verifyPhoneCode,
  verifyPhoneCodeDirect,
  
  // reCAPTCHA management
  initializeRecaptcha,
  resetRecaptcha,
  clearRecaptcha,
  
  // Phone utilities
  formatPhoneNumber,
  validatePhoneNumber,
  
  // Error handling
  getPhoneAuthErrorMessage,
  
  // CustomerAuthAPI integration methods
  formatPhoneNumberCustomer,
  validatePhoneNumberCustomer,
  sendPhoneVerificationCustomer,
  verifyPhoneCodeCustomer,
  verifyPhoneCodeLegacyCustomer,
  initializeRecaptchaCustomer,
  resetRecaptchaCustomer,
  clearRecaptchaCustomer
});

// Create CustomerAuthAPI namespace with integrated methods
window.CustomerAuthAPI = {
  // Phone utility methods
  formatPhoneNumber: formatPhoneNumberCustomer,
  validatePhoneNumber: validatePhoneNumberCustomer,
  maskPhoneNumber: function(phoneNumber) {
    // Use utilities.js method for masking
    return VediAPI.maskPhoneNumber(phoneNumber);
  },
  
  // Phone authentication methods
  sendPhoneVerification: sendPhoneVerificationCustomer,
  verifyPhoneCode: verifyPhoneCodeCustomer,
  verifyPhoneCodeLegacy: verifyPhoneCodeLegacyCustomer,
  
  // reCAPTCHA management methods
  initializeRecaptcha: initializeRecaptchaCustomer,
  resetRecaptcha: resetRecaptchaCustomer,
  clearRecaptcha: clearRecaptchaCustomer,
  
  // Promise utilities (exposed for compatibility)
  safeAsyncOperation: safeAsyncOperation
};

// Also make functions available globally for internal module use
window.getFirebaseDb = getFirebaseDb;
window.getFirebaseAuth = getFirebaseAuth;

console.log('📱 Enhanced Phone Authentication Module loaded with CustomerAuthAPI integration');
console.log('🔧 INJECTED: Promise utilities - withTimeout, withRetry, safeAsyncOperation, enhanceError');
console.log('🔍 INJECTED: Diagnostics - checkPhoneAuthConfig, testRecaptcha, isRecaptchaReady');
console.log('📨 SMS: sendPhoneVerification, verifyPhoneCode, verifyPhoneCodeDirect');
console.log('🤖 reCAPTCHA: initializeRecaptcha, resetRecaptcha, clearRecaptcha');
console.log('📞 Utilities: formatPhoneNumber, validatePhoneNumber');
console.log('🔒 Customer profiles automatically created for phone users');
console.log('✅ CustomerAuthAPI: All 9 methods integrated and available');
console.log('⚠️ Note: Enhanced phone auth features now available via CustomerAuthAPI namespace');