// api/auth/phone-auth.js - Phone Authentication with reCAPTCHA v2 Invisible
/**
 * Phone Authentication Module with reCAPTCHA v2 Invisible
 * 
 * Properly implements Firebase phone authentication with reCAPTCHA v2 invisible
 * as required by Firebase for production environments.
 * 
 * @version 3.0.0 - Proper reCAPTCHA v2 Implementation
 */

// ============================================================================
// COMPATIBILITY LAYER
// ============================================================================

/**
 * Ensure essential helper functions exist
 */
function ensureHelpers() {
    // Firebase helpers
    if (typeof window.getFirebaseAuth === 'undefined') {
        window.getFirebaseAuth = () => {
            if (typeof firebase !== 'undefined' && firebase.auth) {
                return firebase.auth();
            }
            throw new Error('Firebase Auth not initialized');
        };
    }

    if (typeof window.getFirebaseDb === 'undefined') {
        window.getFirebaseDb = () => {
            if (typeof firebase !== 'undefined' && firebase.firestore) {
                return firebase.firestore();
            }
            throw new Error('Firebase Firestore not initialized');
        };
    }

    // Phone masking
    if (!window.maskPhoneNumber) {
        window.maskPhoneNumber = (phoneNumber) => {
            if (!phoneNumber) return '';
            try {
                if (phoneNumber.startsWith('+1') && phoneNumber.length === 12) {
                    return phoneNumber.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '$1 $2-***-$4');
                }
                if (phoneNumber.length >= 6) {
                    return phoneNumber.slice(0, 3) + '***' + phoneNumber.slice(-3);
                }
                return '***-***-****';
            } catch (error) {
                return '***-***-****';
            }
        };
    }

    // Error tracking
    if (typeof window.trackAPICall === 'undefined') {
        window.trackAPICall = async (methodName, timestamp, success, metadata = {}) => {
            console.log(`📊 ${methodName}: ${success ? 'SUCCESS' : 'FAILED'}`, metadata);
        };
    }
}

// ============================================================================
// reCAPTCHA v2 INVISIBLE MANAGEMENT
// ============================================================================

/**
 * Initialize reCAPTCHA v2 invisible verifier
 * @param {string} containerId - ID of the container element
 * @returns {Promise<firebase.auth.RecaptchaVerifier>} Configured reCAPTCHA verifier
 */
async function initializeRecaptchaVerifier(containerId = 'recaptcha_container') {
    try {
        console.log('🔒 Initializing reCAPTCHA v2 invisible verifier...');

        // Clear any existing verifier first
        clearRecaptchaVerifier();

        // Ensure container exists
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            container.style.display = 'none'; // Hidden for invisible reCAPTCHA
            document.body.appendChild(container);
            console.log('📦 Created reCAPTCHA container:', containerId);
        }

        // Initialize reCAPTCHA v2 invisible verifier
        window.recaptchaVerifierInstance = new firebase.auth.RecaptchaVerifier(containerId, {
            size: 'invisible',
            callback: (response) => {
                console.log('✅ reCAPTCHA solved successfully');
            },
            'expired-callback': () => {
                console.warn('⚠️ reCAPTCHA expired');
            },
            'error-callback': (error) => {
                console.error('❌ reCAPTCHA error:', error);
            }
        });

        // Render the reCAPTCHA
        console.log('🎨 Rendering reCAPTCHA v2 invisible...');
        await window.recaptchaVerifierInstance.render();
        
        console.log('✅ reCAPTCHA v2 invisible initialized successfully');
        return window.recaptchaVerifierInstance;

    } catch (error) {
        console.error('❌ Failed to initialize reCAPTCHA:', error);
        throw new Error(`reCAPTCHA initialization failed: ${error.message}`);
    }
}

/**
 * Clear reCAPTCHA verifier
 */
function clearRecaptchaVerifier() {
    if (window.recaptchaVerifierInstance) {
        try {
            window.recaptchaVerifierInstance.clear();
            window.recaptchaVerifierInstance = null;
            console.log('🧹 reCAPTCHA verifier cleared');
        } catch (error) {
            console.warn('⚠️ Error clearing reCAPTCHA verifier:', error);
        }
    }
}

/**
 * Reset reCAPTCHA verifier (for retry scenarios)
 */
async function resetRecaptchaVerifier(containerId = 'recaptcha_container') {
    try {
        console.log('🔄 Resetting reCAPTCHA verifier...');
        clearRecaptchaVerifier();
        await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay
        return await initializeRecaptchaVerifier(containerId);
    } catch (error) {
        console.error('❌ Failed to reset reCAPTCHA:', error);
        throw error;
    }
}

// ============================================================================
// PHONE AUTHENTICATION WITH reCAPTCHA v2
// ============================================================================

/**
 * Send SMS verification code with reCAPTCHA v2 invisible
 * @param {string} phoneNumber - Phone number in E.164 format (+1234567890)
 * @param {string} containerId - reCAPTCHA container ID
 * @returns {Promise<Object>} Confirmation result for code verification
 */
async function sendPhoneVerification(phoneNumber, containerId = 'recaptcha_container') {
    try {
        console.log('📱 Starting phone verification for:', window.maskPhoneNumber(phoneNumber));

        // Validate phone number format
        if (!validatePhoneNumber(phoneNumber)) {
            throw new Error('Please enter a valid phone number.');
        }

        const auth = window.getFirebaseAuth();
        if (!auth || typeof auth.signInWithPhoneNumber !== 'function') {
            throw new Error('Firebase Auth is not initialized correctly.');
        }

        // Initialize reCAPTCHA v2 invisible verifier
        const recaptchaVerifier = await initializeRecaptchaVerifier(containerId);

        console.log('📤 Sending SMS with reCAPTCHA v2 invisible...');

        // Send SMS verification code
        const confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, recaptchaVerifier);

        // Store verification ID globally for fallback
        window.phoneVerificationId = confirmationResult.verificationId;

        // Track success
        await window.trackAPICall('sendPhoneVerification', Date.now(), true, {
            phoneNumber: window.maskPhoneNumber(phoneNumber),
            hasRecaptcha: true
        });

        console.log('✅ SMS sent successfully with reCAPTCHA v2');
        return confirmationResult;

    } catch (error) {
        console.error('❌ SMS send error:', error);

        // Track failure
        await window.trackAPICall('sendPhoneVerification', Date.now(), false, {
            error: error.code || error.message,
            phoneNumber: window.maskPhoneNumber(phoneNumber)
        });

        // Handle specific reCAPTCHA errors
        if (error.code === 'auth/invalid-app-credential' || 
            error.code === 'auth/app-not-authorized') {
            throw new Error('reCAPTCHA configuration error. Please check your Firebase settings.');
        }

        if (error.code === 'auth/too-many-requests') {
            throw new Error('Too many verification attempts. Please try again later.');
        }

        throw new Error(getPhoneAuthErrorMessage(error.code || error.message));
    }
}

/**
 * Retry SMS sending with fresh reCAPTCHA
 * @param {string} phoneNumber - Phone number in E.164 format
 * @param {string} containerId - reCAPTCHA container ID
 * @returns {Promise<Object>} Confirmation result
 */
async function retrySendPhoneVerification(phoneNumber, containerId = 'recaptcha_container') {
    try {
        console.log('🔄 Retrying SMS send with fresh reCAPTCHA...');
        
        // Reset reCAPTCHA verifier
        await resetRecaptchaVerifier(containerId);
        
        // Retry sending
        return await sendPhoneVerification(phoneNumber, containerId);
        
    } catch (error) {
        console.error('❌ Retry SMS send failed:', error);
        throw error;
    }
}

/**
 * Verify SMS code and complete authentication
 * @param {Object} confirmationResult - Result from sendPhoneVerification
 * @param {string} code - 6-digit SMS verification code
 * @returns {Promise<Object>} User credential with phone authentication
 */
async function verifyPhoneCode(confirmationResult, code) {
    try {
        console.log('🔐 Verifying SMS code...');
        
        if (!confirmationResult) {
            throw new Error('No verification in progress. Please request a new code.');
        }
        
        if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
            throw new Error('Please enter a valid 6-digit verification code.');
        }
        
        // Verify the code
        const result = await confirmationResult.confirm(code);
        const user = result.user;
        
        // Create or update customer profile
        const customerProfile = await createOrUpdateCustomerProfile(user);
        
        // Clear reCAPTCHA after successful verification
        clearRecaptchaVerifier();
        
        // Track success
        await window.trackAPICall('verifyPhoneCode', Date.now(), true, {
            userId: user.uid,
            phoneNumber: window.maskPhoneNumber(user.phoneNumber),
            isNewUser: result.additionalUserInfo?.isNewUser || false
        });
        
        console.log('✅ Phone verification successful, UID:', user.uid);
        return {
            user: user,
            profile: customerProfile,
            isNewUser: result.additionalUserInfo?.isNewUser || false
        };
        
    } catch (error) {
        console.error('❌ Code verification error:', error);
        
        await window.trackAPICall('verifyPhoneCode', Date.now(), false, {
            error: error.code || error.message
        });
        
        // Handle specific verification errors
        if (error.code === 'auth/invalid-verification-code') {
            throw new Error('Invalid verification code. Please check and try again.');
        }
        
        if (error.code === 'auth/code-expired') {
            throw new Error('Verification code expired. Please request a new code.');
        }
        
        throw new Error(getPhoneAuthErrorMessage(error.code || error.message));
    }
}

/**
 * Alternative verification using verification ID directly
 * @param {string} verificationId - Verification ID from SMS send
 * @param {string} code - 6-digit SMS verification code
 * @returns {Promise<Object>} User credential
 */
async function verifyPhoneCodeDirect(verificationId, code) {
    try {
        console.log('🔐 Direct phone code verification...');
        
        if (!verificationId) {
            throw new Error('No verification ID. Please request a new code.');
        }
        
        if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
            throw new Error('Please enter a valid 6-digit verification code.');
        }
        
        const auth = window.getFirebaseAuth();
        
        // Create credential and sign in
        const credential = firebase.auth.PhoneAuthProvider.credential(verificationId, code);
        const result = await auth.signInWithCredential(credential);
        const user = result.user;
        
        // Create or update customer profile
        const customerProfile = await createOrUpdateCustomerProfile(user);
        
        // Clear reCAPTCHA after successful verification
        clearRecaptchaVerifier();
        
        // Track success
        await window.trackAPICall('verifyPhoneCodeDirect', Date.now(), true, {
            userId: user.uid,
            phoneNumber: window.maskPhoneNumber(user.phoneNumber)
        });
        
        console.log('✅ Direct verification successful, UID:', user.uid);
        return {
            user: user,
            profile: customerProfile,
            isNewUser: result.additionalUserInfo?.isNewUser || false
        };
        
    } catch (error) {
        console.error('❌ Direct verification error:', error);
        throw new Error(getPhoneAuthErrorMessage(error.code || error.message));
    }
}

// ============================================================================
// CUSTOMER PROFILE MANAGEMENT
// ============================================================================

/**
 * Create or update customer profile for phone users
 * @param {Object} firebaseUser - Firebase user object
 * @returns {Promise<Object>} Customer profile data
 */
async function createOrUpdateCustomerProfile(firebaseUser) {
    try {
        const db = window.getFirebaseDb();
        const userId = firebaseUser.uid;
        
        // Check for existing customer profile
        const customerDoc = await db.collection('customerProfiles').doc(userId).get();
        
        if (customerDoc.exists) {
            // Update existing profile
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
            const newProfile = {
                phoneNumber: firebaseUser.phoneNumber,
                phoneVerified: true,
                name: firebaseUser.displayName || '',
                email: firebaseUser.email || '',
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
            
            await db.collection('customerProfiles').doc(userId).set(newProfile);
            
            // Also create basic user record
            await db.collection('users').doc(userId).set({
                phoneNumber: firebaseUser.phoneNumber,
                accountType: 'customer',
                authProvider: 'phone',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log('✅ New customer profile created:', userId);
            return { id: userId, ...newProfile };
        }
        
    } catch (error) {
        console.error('❌ Profile creation error:', error);
        // Don't throw - return minimal profile
        return {
            id: firebaseUser.uid,
            phoneNumber: firebaseUser.phoneNumber,
            accountType: 'customer',
            authMethod: 'phone'
        };
    }
}

// ============================================================================
// PHONE NUMBER UTILITIES
// ============================================================================

/**
 * Format phone number to E.164 format
 * @param {string} phoneNumber - Raw phone number
 * @param {string} countryCode - Country code (default: US)
 * @returns {string} E.164 formatted number
 */
function formatPhoneNumber(phoneNumber, countryCode = 'US') {
    try {
        const digits = phoneNumber.replace(/\D/g, '');
        
        const countryCodes = {
            'US': '1', 'CA': '1', 'GB': '44', 'AU': '61',
            'DE': '49', 'FR': '33', 'IT': '39', 'ES': '34',
            'BR': '55', 'IN': '91', 'CN': '86', 'JP': '81',
            'KR': '82', 'MX': '52'
        };
        
        const defaultCode = countryCodes[countryCode] || '1';
        
        // Already E.164 format
        if (phoneNumber.startsWith('+')) {
            return phoneNumber;
        }
        
        // Has country code
        if (digits.startsWith(defaultCode)) {
            return '+' + digits;
        }
        
        // Add country code
        return '+' + defaultCode + digits;
        
    } catch (error) {
        console.error('❌ Phone formatting error:', error);
        throw new Error('Invalid phone number format');
    }
}

/**
 * Validate phone number E.164 format
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} True if valid
 */
function validatePhoneNumber(phoneNumber) {
    try {
        // Basic E.164 validation
        const e164Regex = /^\+[1-9]\d{1,14}$/;
        if (!e164Regex.test(phoneNumber)) {
            return false;
        }
        
        // US/Canada specific validation
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
 * Get user-friendly error messages
 * @param {string} errorCode - Firebase error code
 * @returns {string} User-friendly message
 */
function getPhoneAuthErrorMessage(errorCode) {
    const errorMessages = {
        'auth/invalid-phone-number': 'Please enter a valid phone number.',
        'auth/too-many-requests': 'Too many attempts. Please wait and try again later.',
        'auth/invalid-verification-code': 'Invalid verification code. Please try again.',
        'auth/code-expired': 'Verification code expired. Please request a new one.',
        'auth/quota-exceeded': 'SMS quota exceeded. Please try again later.',
        'auth/operation-not-allowed': 'Phone authentication not enabled. Contact support.',
        'auth/missing-verification-code': 'Please enter the verification code.',
        'auth/invalid-verification-id': 'Invalid verification session. Please start over.',
        'auth/network-request-failed': 'Network error. Check your connection and try again.',
        'auth/internal-error': 'Service error. Please contact support.',
        'auth/app-not-authorized': 'App not authorized for phone authentication.',
        'auth/unauthorized-domain': 'Domain not authorized for phone authentication.',
        'auth/invalid-app-credential': 'reCAPTCHA configuration error. Please contact support.'
    };
    
    return errorMessages[errorCode] || 'Phone authentication error. Please try again.';
}

// ============================================================================
// READINESS CHECK
// ============================================================================

/**
 * Check if phone auth is ready
 * @returns {Object} Readiness status
 */
function checkPhoneAuthReadiness() {
    const status = {
        firebase: typeof firebase !== 'undefined',
        auth: !!(typeof firebase !== 'undefined' && firebase.auth),
        firestore: !!(typeof firebase !== 'undefined' && firebase.firestore),
        recaptcha: typeof firebase !== 'undefined' && 
                  typeof firebase.auth !== 'undefined' && 
                  typeof firebase.auth.RecaptchaVerifier !== 'undefined',
        ready: false
    };
    
    // Overall readiness
    status.ready = status.firebase && status.auth && status.firestore && status.recaptcha;
    
    console.log('📱 Phone Auth Readiness (reCAPTCHA v2):', status);
    return status;
}

/**
 * Simple readiness check
 * @returns {boolean} True if ready
 */
function isPhoneAuthReady() {
    return !!(
        typeof firebase !== 'undefined' && 
        firebase.auth &&
        firebase.firestore &&
        firebase.auth.RecaptchaVerifier &&
        firebase.apps.length > 0
    );
}

// ============================================================================
// GLOBAL API INTEGRATION
// ============================================================================

// Initialize helpers
ensureHelpers();

// Ensure VediAPI namespace
if (!window.VediAPI) {
    window.VediAPI = {};
}

// Attach methods to VediAPI
Object.assign(window.VediAPI, {
    // Core phone auth methods (with reCAPTCHA v2)
    sendPhoneVerification,
    retrySendPhoneVerification,
    verifyPhoneCode,
    verifyPhoneCodeDirect,
    
    // reCAPTCHA management
    initializeRecaptchaVerifier,
    clearRecaptchaVerifier,
    resetRecaptchaVerifier,
    
    // Utility methods
    formatPhoneNumber,
    validatePhoneNumber,
    maskPhoneNumber: window.maskPhoneNumber,
    
    // Error handling
    getPhoneAuthErrorMessage,
    
    // Readiness checks
    checkPhoneAuthReadiness,
    isPhoneAuthReady,
    
    // Customer profile management
    createOrUpdateCustomerProfile
});

// Create CustomerAuthAPI namespace
window.CustomerAuthAPI = {
    // Phone methods with reCAPTCHA
    sendPhoneVerification,
    retrySendPhoneVerification,
    verifyPhoneCode,
    verifyPhoneCodeDirect,
    
    // reCAPTCHA methods
    initializeRecaptchaVerifier,
    clearRecaptchaVerifier,
    resetRecaptchaVerifier,
    
    // Utility methods
    formatPhoneNumber,
    validatePhoneNumber,
    maskPhoneNumber: window.maskPhoneNumber,
    
    // Profile management
    createOrUpdateCustomerProfile,
    
    // Readiness
    isReady: isPhoneAuthReady
};

// Auto-check readiness on load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const readiness = checkPhoneAuthReadiness();
        if (readiness.ready) {
            console.log('✅ Phone authentication ready with reCAPTCHA v2!');
        } else {
            console.warn('⚠️ Phone authentication not ready:', readiness);
        }
    }, 1000);
});

console.log('📱 Phone Authentication Module loaded');
console.log('🔒 reCAPTCHA: v2 Invisible Implementation (REQUIRED)');
console.log('✅ Methods: sendPhoneVerification, verifyPhoneCode, verifyPhoneCodeDirect');
console.log('🔧 reCAPTCHA Utils: initializeRecaptchaVerifier, clearRecaptchaVerifier, resetRecaptchaVerifier');
console.log('🛠️ Phone Utils: formatPhoneNumber, validatePhoneNumber, maskPhoneNumber');
console.log('👤 Profiles: Automatic customer profile creation');
console.log('🎯 Production Ready: Firebase + reCAPTCHA v2 invisible integration');
