// api/auth/email-auth.js - Email/Password Authentication
/**
 * Email Authentication Module
 * 
 * Handles traditional email/password authentication including user registration,
 * login, password management, and email verification. Provides secure user
 * account management with proper error handling and tracking.
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
    enhanced.userMessage = window.VediAPI?.getAuthErrorMessage ? window.VediAPI.getAuthErrorMessage(error.code) : error.message;
  } else if (error.message.includes('network') || error.message.includes('Network')) {
    enhanced.userMessage = 'Network error. Please check your internet connection.';
  } else {
    enhanced.userMessage = 'An unexpected error occurred. Please try again.';
  }
  
  return enhanced;
}

// ============================================================================
// EMAIL/PASSWORD AUTHENTICATION
// ============================================================================

/**
 * Sign up a new user with email and password
 * Creates Firebase auth user and saves additional user data to Firestore
 * @param {string} email - User email address
 * @param {string} password - User password (minimum 6 characters)
 * @param {Object} userData - Additional user data (name, accountType, etc.)
 * @returns {Promise<Object>} Created user object with profile data
 */
async function signUp(email, password, userData) {
  const endTracking = window.VediAPI?.startPerformanceMeasurement ? window.VediAPI.startPerformanceMeasurement('signUp') : () => {};
  
  try {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    
    // Validate input data
    if (!window.VediAPI?.validateEmail || !window.VediAPI.validateEmail(email)) {
      throw new Error('Please enter a valid email address.');
    }
    
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }
    
    if (!userData.name || !userData.accountType) {
      throw new Error('Name and account type are required.');
    }
    
    // Create Firebase auth user
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // Update display name
    await user.updateProfile({
      displayName: userData.name
    });
    
    // Save additional user data to Firestore
    const userDoc = {
      email: email,
      name: window.VediAPI?.sanitizeInput ? window.VediAPI.sanitizeInput(userData.name) : userData.name,
      accountType: userData.accountType, // 'restaurant', 'venue', or 'customer'
      phone: userData.phone || '',
      address: userData.address || '',
      preferences: userData.preferences || {},
      emailVerified: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('users').doc(user.uid).set(userDoc);
    
    // Track successful signup
    if (window.VediAPI?.trackUserActivity) {
      await window.VediAPI.trackUserActivity('signup', {
        accountType: userData.accountType,
        email: email,
        method: 'email'
      });
    }
    
    // Update session with user ID
    if (window.VediAPI?.updateSessionUser) {
      await window.VediAPI.updateSessionUser(user.uid);
    }
    
    await endTracking(true);
    
    console.log('✅ User created successfully:', user.uid);
    return { id: user.uid, ...userDoc, email };
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    if (window.VediAPI?.trackError) {
      await window.VediAPI.trackError(error, 'email_signup', { email });
    }
    
    console.error('❌ Sign up error:', error);
    throw new Error(window.VediAPI?.getAuthErrorMessage ? window.VediAPI.getAuthErrorMessage(error.code) : error.message);
  }
}

/**
 * Sign in existing user with email and password
 * Authenticates user and retrieves their profile data
 * @param {string} email - User email address
 * @param {string} password - User password
 * @returns {Promise<Object>} User object with complete profile data
 */
async function signIn(email, password) {
  const endTracking = window.VediAPI?.startPerformanceMeasurement ? window.VediAPI.startPerformanceMeasurement('signIn') : () => {};
  
  try {
    const auth = getFirebaseAuth();
    
    // Validate input
    if (!window.VediAPI?.validateEmail || !window.VediAPI.validateEmail(email)) {
      throw new Error('Please enter a valid email address.');
    }
    
    if (!password) {
      throw new Error('Password is required.');
    }
    
    // Authenticate with Firebase
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // Get user data from Firestore and update last login
    const userData = await getUserData(user.uid);
    
    // Update last login timestamp
    const db = getFirebaseDb();
    await db.collection('users').doc(user.uid).update({
      lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Track successful login
    if (window.VediAPI?.trackUserActivity) {
      await window.VediAPI.trackUserActivity('login', {
        accountType: userData.accountType,
        email: email,
        method: 'email'
      });
    }
    
    // Update session with user ID
    if (window.VediAPI?.updateSessionUser) {
      await window.VediAPI.updateSessionUser(user.uid);
    }
    
    await endTracking(true);
    
    console.log('✅ User signed in successfully:', user.uid);
    return userData;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    if (window.VediAPI?.trackError) {
      await window.VediAPI.trackError(error, 'email_signin', { email });
    }
    
    console.error('❌ Sign in error:', error);
    throw new Error(window.VediAPI?.getAuthErrorMessage ? window.VediAPI.getAuthErrorMessage(error.code) : error.message);
  }
}

/**
 * Sign out current user
 * Clears authentication state and tracks logout event
 * @returns {Promise<void>} Resolves when user is signed out
 */
async function signOut() {
  const endTracking = window.VediAPI?.startPerformanceMeasurement ? window.VediAPI.startPerformanceMeasurement('signOut') : () => {};
  
  try {
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    
    if (currentUser) {
      // Track logout before signing out
      if (window.VediAPI?.trackUserActivity) {
        await window.VediAPI.trackUserActivity('logout', {
          userId: currentUser.uid,
          method: 'manual'
        });
      }
    }
    
    await auth.signOut();
    
    await endTracking(true);
    console.log('✅ User signed out successfully');
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    if (window.VediAPI?.trackError) {
      await window.VediAPI.trackError(error, 'signout');
    }
    
    console.error('❌ Sign out error:', error);
    throw error;
  }
}

/**
 * Get current authenticated user with real-time auth state
 * @returns {Promise<Object|null>} Current user data or null if not authenticated
 */
async function getCurrentUser() {
  return new Promise((resolve) => {
    const auth = getFirebaseAuth();
    
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      unsubscribe();
      
      if (user) {
        try {
          const userData = await getUserData(user.uid);
          resolve(userData);
        } catch (error) {
          console.error('❌ Error getting user data:', error);
          if (window.VediAPI?.trackError) {
            await window.VediAPI.trackError(error, 'getCurrentUser');
          }
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Get user data from Firestore by user ID
 * @param {string} userId - Firebase user ID
 * @returns {Promise<Object>} User profile data
 */
async function getUserData(userId) {
  const endTracking = window.VediAPI?.startPerformanceMeasurement ? window.VediAPI.startPerformanceMeasurement('getUserData') : () => {};
  
  try {
    const db = getFirebaseDb();
    
    const doc = await db.collection('users').doc(userId).get();
    
    if (doc.exists) {
      const userData = { id: doc.id, ...doc.data() };
      await endTracking(true);
      return userData;
    }
    
    throw new Error('User data not found');
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    if (window.VediAPI?.trackError) {
      await window.VediAPI.trackError(error, 'getUserData', { userId });
    }
    
    console.error('❌ Get user data error:', error);
    throw error;
  }
}

/**
 * Update user profile information
 * @param {string} userId - User ID to update
 * @param {Object} updates - Profile updates
 * @returns {Promise<Object>} Updated user data
 */
async function updateUserProfile(userId, updates) {
  const endTracking = window.VediAPI?.startPerformanceMeasurement ? window.VediAPI.startPerformanceMeasurement('updateUserProfile') : () => {};
  
  try {
    const db = getFirebaseDb();
    
    // Sanitize updates
    const sanitizedUpdates = window.VediAPI?.removeUndefinedValues ? window.VediAPI.removeUndefinedValues({
      name: updates.name ? (window.VediAPI?.sanitizeInput ? window.VediAPI.sanitizeInput(updates.name) : updates.name) : undefined,
      phone: updates.phone ? (window.VediAPI?.sanitizeInput ? window.VediAPI.sanitizeInput(updates.phone) : updates.phone) : undefined,
      address: updates.address ? (window.VediAPI?.sanitizeInput ? window.VediAPI.sanitizeInput(updates.address) : updates.address) : undefined,
      preferences: updates.preferences || undefined,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }) : updates;
    
    await db.collection('users').doc(userId).update(sanitizedUpdates);
    
    // Get updated user data
    const updatedUser = await getUserData(userId);
    
    if (window.VediAPI?.trackUserActivity) {
      await window.VediAPI.trackUserActivity('profile_update', {
        userId,
        fieldsUpdated: Object.keys(sanitizedUpdates)
      });
    }
    
    await endTracking(true);
    
    console.log('✅ User profile updated:', userId);
    return updatedUser;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    if (window.VediAPI?.trackError) {
      await window.VediAPI.trackError(error, 'updateUserProfile', { userId });
    }
    
    console.error('❌ Update user profile error:', error);
    throw error;
  }
}

// ============================================================================
// PASSWORD MANAGEMENT
// ============================================================================

/**
 * Send password reset email
 * @param {string} email - Email address to send reset link to
 * @returns {Promise<void>} Resolves when reset email is sent
 */
async function sendPasswordResetEmail(email) {
  const endTracking = window.VediAPI?.startPerformanceMeasurement ? window.VediAPI.startPerformanceMeasurement('sendPasswordResetEmail') : () => {};
  
  try {
    const auth = getFirebaseAuth();
    
    if (!window.VediAPI?.validateEmail || !window.VediAPI.validateEmail(email)) {
      throw new Error('Please enter a valid email address.');
    }
    
    await auth.sendPasswordResetEmail(email);
    
    if (window.VediAPI?.trackUserActivity) {
      await window.VediAPI.trackUserActivity('password_reset_requested', { email });
    }
    
    await endTracking(true);
    console.log('✅ Password reset email sent to:', email);
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    if (window.VediAPI?.trackError) {
      await window.VediAPI.trackError(error, 'sendPasswordResetEmail', { email });
    }
    
    console.error('❌ Send password reset error:', error);
    throw new Error(window.VediAPI?.getAuthErrorMessage ? window.VediAPI.getAuthErrorMessage(error.code) : error.message);
  }
}

/**
 * Update user password (requires current authentication)
 * @param {string} newPassword - New password (minimum 6 characters)
 * @returns {Promise<void>} Resolves when password is updated
 */
async function updatePassword(newPassword) {
  const endTracking = window.VediAPI?.startPerformanceMeasurement ? window.VediAPI.startPerformanceMeasurement('updatePassword') : () => {};
  
  try {
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      throw new Error('No user is currently signed in.');
    }
    
    if (!newPassword || newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters long.');
    }
    
    await currentUser.updatePassword(newPassword);
    
    if (window.VediAPI?.trackUserActivity) {
      await window.VediAPI.trackUserActivity('password_updated', {
        userId: currentUser.uid
      });
    }
    
    await endTracking(true);
    console.log('✅ Password updated successfully');
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    if (window.VediAPI?.trackError) {
      await window.VediAPI.trackError(error, 'updatePassword');
    }
    
    console.error('❌ Update password error:', error);
    throw new Error(window.VediAPI?.getAuthErrorMessage ? window.VediAPI.getAuthErrorMessage(error.code) : error.message);
  }
}

// ============================================================================
// EMAIL VERIFICATION
// ============================================================================

/**
 * Send email verification to current user
 * @returns {Promise<void>} Resolves when verification email is sent
 */
async function sendEmailVerification() {
  const endTracking = window.VediAPI?.startPerformanceMeasurement ? window.VediAPI.startPerformanceMeasurement('sendEmailVerification') : () => {};
  
  try {
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      throw new Error('No user is currently signed in.');
    }
    
    if (currentUser.emailVerified) {
      throw new Error('Email is already verified.');
    }
    
    await currentUser.sendEmailVerification();
    
    if (window.VediAPI?.trackUserActivity) {
      await window.VediAPI.trackUserActivity('email_verification_sent', {
        userId: currentUser.uid,
        email: currentUser.email
      });
    }
    
    await endTracking(true);
    console.log('✅ Email verification sent');
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    if (window.VediAPI?.trackError) {
      await window.VediAPI.trackError(error, 'sendEmailVerification');
    }
    
    console.error('❌ Send email verification error:', error);
    throw new Error(window.VediAPI?.getAuthErrorMessage ? window.VediAPI.getAuthErrorMessage(error.code) : error.message);
  }
}

/**
 * Check if email already exists in the system
 * @param {string} email - Email address to check
 * @returns {Promise<boolean>} True if email exists, false otherwise
 */
async function checkEmailExists(email) {
  const endTracking = window.VediAPI?.startPerformanceMeasurement ? window.VediAPI.startPerformanceMeasurement('checkEmailExists') : () => {};
  
  try {
    const auth = getFirebaseAuth();
    
    if (!window.VediAPI?.validateEmail || !window.VediAPI.validateEmail(email)) {
      throw new Error('Please enter a valid email address.');
    }
    
    const methods = await auth.fetchSignInMethodsForEmail(email);
    const exists = methods.length > 0;
    
    await endTracking(true);
    return exists;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    
    // Don't track this as an error - it's expected for checking availability
    console.warn('⚠️ Check email error:', error.message);
    return false;
  }
}

// ============================================================================
// ACCOUNT MANAGEMENT
// ============================================================================

/**
 * Delete user account and all associated data
 * @param {string} userId - User ID to delete
 * @returns {Promise<void>} Resolves when account is deleted
 */
async function deleteUserAccount(userId) {
  const endTracking = window.VediAPI?.startPerformanceMeasurement ? window.VediAPI.startPerformanceMeasurement('deleteUserAccount') : () => {};
  
  try {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    const currentUser = auth.currentUser;
    
    if (!currentUser || currentUser.uid !== userId) {
      throw new Error('You can only delete your own account.');
    }
    
    // Track account deletion before removing data
    if (window.VediAPI?.trackUserActivity) {
      await window.VediAPI.trackUserActivity('account_deleted', {
        userId,
        email: currentUser.email
      });
    }
    
    // Delete user data from Firestore
    await db.collection('users').doc(userId).delete();
    
    // Delete Firebase auth account
    await currentUser.delete();
    
    await endTracking(true);
    console.log('✅ User account deleted:', userId);
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    if (window.VediAPI?.trackError) {
      await window.VediAPI.trackError(error, 'deleteUserAccount', { userId });
    }
    
    console.error('❌ Delete user account error:', error);
    throw new Error(window.VediAPI?.getAuthErrorMessage ? window.VediAPI.getAuthErrorMessage(error.code) : error.message);
  }
}

// ============================================================================
// GLOBAL EXPORTS AND VEDIAPI INTEGRATION
// ============================================================================

// Ensure VediAPI namespace exists
if (!window.VediAPI) {
  window.VediAPI = {};
}

// Safe wrapper function - use tracking if available, otherwise return function as-is
function safeWrap(methodName, originalMethod) {
  if (typeof window.withTracking === 'function') {
    return window.withTracking(methodName, originalMethod);
  } else if (window.VediAPI && typeof window.VediAPI.withTracking === 'function') {
    return window.VediAPI.withTracking(methodName, originalMethod);
  } else {
    console.warn(`⚠️ withTracking not available for ${methodName}, using unwrapped function`);
    return originalMethod;
  }
}

// Attach email authentication functions to VediAPI with safe wrapping
const emailAuthFunctions = {
  // INJECTED: Promise utilities from customer-auth-api (no tracking needed)
  withTimeout,
  withRetry,
  safeAsyncOperation,
  enhanceError,
  
  // Core authentication (safely wrapped)
  signUp: safeWrap('signUp', signUp),
  signIn: safeWrap('signIn', signIn),
  signOut: safeWrap('signOut', signOut),
  getCurrentUser: safeWrap('getCurrentUser', getCurrentUser),
  getUserData: safeWrap('getUserData', getUserData),
  updateUserProfile: safeWrap('updateUserProfile', updateUserProfile),
  
  // Password management (safely wrapped)
  sendPasswordResetEmail: safeWrap('sendPasswordResetEmail', sendPasswordResetEmail),
  updatePassword: safeWrap('updatePassword', updatePassword),
  
  // Email verification (safely wrapped)
  sendEmailVerification: safeWrap('sendEmailVerification', sendEmailVerification),
  checkEmailExists: safeWrap('checkEmailExists', checkEmailExists),
  
  // Account management (safely wrapped)
  deleteUserAccount: safeWrap('deleteUserAccount', deleteUserAccount)
};

// Attach functions to VediAPI
Object.assign(window.VediAPI, emailAuthFunctions);

// Also make getCurrentUser available directly on window for debugging
window.getCurrentUser = getCurrentUser;

// Debug logging
console.log('📧 Enhanced Email Authentication Module loaded');
console.log('🔧 INJECTED: Promise utilities - withTimeout, withRetry, safeAsyncOperation, enhanceError');
console.log('🔐 Functions: signUp, signIn, signOut, getCurrentUser, getUserData');
console.log('🔑 Password: sendPasswordResetEmail, updatePassword');
console.log('✉️ Verification: sendEmailVerification, checkEmailExists');
console.log('👤 Management: updateUserProfile, deleteUserAccount');
console.log('📊 All functions include performance tracking and error handling');

// Additional debug logging
console.log('🔍 VediAPI.getCurrentUser available:', typeof window.VediAPI.getCurrentUser);
console.log('🔍 window.getCurrentUser available:', typeof window.getCurrentUser);
