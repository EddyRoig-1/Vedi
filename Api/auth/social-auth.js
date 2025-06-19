// api/auth/social-auth.js - Social Media Authentication
/**
 * Social Authentication Module
 * 
 * Handles authentication through social media providers including Google,
 * Facebook, and Apple. Provides seamless integration with Firebase Auth
 * social providers and manages user profile creation for social users.
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
    enhanced.userMessage = getSocialAuthErrorMessage(error.code);
  } else if (error.message.includes('network') || error.message.includes('Network')) {
    enhanced.userMessage = 'Network error. Please check your internet connection.';
  } else {
    enhanced.userMessage = 'An unexpected error occurred. Please try again.';
  }
  
  return enhanced;
}

/**
 * Get user-friendly error message for social authentication errors
 * @param {string} errorCode - Firebase social auth error code
 * @returns {string} User-friendly error message
 */
function getSocialAuthErrorMessage(errorCode) {
  const socialErrorMessages = {
    'auth/popup-closed-by-user': 'Sign-in was cancelled. Please try again.',
    'auth/popup-blocked': 'Popup was blocked by your browser. Please allow popups and try again.',
    'auth/account-exists-with-different-credential': 'An account already exists with the same email address but different sign-in credentials. Please try signing in with a different method.',
    'auth/auth-domain-config-required': 'Authentication configuration error. Please contact support.',
    'auth/cancelled-popup-request': 'Another sign-in process is already in progress. Please wait and try again.',
    'auth/operation-not-allowed': 'Social sign-in is not enabled. Please contact support.',
    'auth/unauthorized-domain': 'This domain is not authorized for authentication. Please contact support.',
    'auth/user-disabled': 'Your account has been disabled. Please contact support.',
    'auth/user-not-found': 'No account found. Please sign up first.',
    'auth/credential-already-in-use': 'This social account is already linked to another user.',
    'auth/email-already-in-use': 'An account with this email already exists. Please try signing in instead.',
    'auth/requires-recent-login': 'This operation requires recent authentication. Please sign in again.',
    'auth/provider-already-linked': 'Social account is already linked to your account.',
    'auth/no-such-provider': 'Social provider is not linked to your account.'
  };
  
  return socialErrorMessages[errorCode] || 'Social authentication error. Please try again.';
}

// ============================================================================
// CUSTOMER LOGIN INTEGRATION - CALLBACK SYSTEM
// ============================================================================

/**
 * Execute success callback after social authentication
 * This bridges the VediAPI social auth with customer login pages
 * @param {Object} user - Firebase user object
 * @param {string} provider - Provider name ('google', 'facebook', 'apple')
 * @param {Object} profile - User profile data
 */
async function executeSocialAuthCallback(user, provider, profile) {
  try {
    console.log('🔗 Executing social auth callback for customer login...');
    
    // Check if there's a global callback function defined by the customer login page
    if (typeof window.handleSocialSignInSuccess === 'function') {
      console.log('✅ Found handleSocialSignInSuccess callback, executing...');
      await window.handleSocialSignInSuccess(user, provider, profile);
    } else if (typeof handleSocialSignInSuccess === 'function') {
      console.log('✅ Found global handleSocialSignInSuccess function, executing...');
      await handleSocialSignInSuccess(user, provider, profile);
    } else {
      console.warn('⚠️ No handleSocialSignInSuccess callback found - user will remain on login page');
      
      // Fallback: Try to detect if we're on a customer login page and redirect
      if (window.location.pathname.includes('customer-login') || 
          window.location.search.includes('restaurant=')) {
        console.log('🔄 Detected customer login page, attempting automatic redirect...');
        await attemptCustomerLoginRedirect(user, provider);
      }
    }
    
  } catch (error) {
    console.error('❌ Error executing social auth callback:', error);
    
    // Show user-friendly error message
    if (typeof window.showError === 'function') {
      window.showError('Authentication successful, but failed to complete sign-in. Please try again.');
    }
  }
}

/**
 * Attempt automatic redirect for customer login pages when no callback is found
 * @param {Object} user - Firebase user object
 * @param {string} provider - Provider name
 */
async function attemptCustomerLoginRedirect(user, provider) {
  try {
    // Extract URL parameters for restaurant info
    const urlParams = new URLSearchParams(window.location.search);
    const restaurantId = urlParams.get('restaurant') || urlParams.get('r');
    const tableNumber = urlParams.get('table');
    const tableLocation = urlParams.get('location');
    
    if (!restaurantId) {
      console.warn('⚠️ No restaurant ID found in URL - cannot redirect');
      return;
    }
    
    // Build redirect URL to menu
    const redirectParams = new URLSearchParams();
    redirectParams.set('restaurant', restaurantId);
    if (tableNumber) redirectParams.set('table', tableNumber);
    if (tableLocation) redirectParams.set('location', tableLocation);
    redirectParams.set('name', encodeURIComponent(user.displayName || 'Guest User'));
    if (user.email) redirectParams.set('email', user.email);
    redirectParams.set('session', 'social');
    redirectParams.set('provider', provider);
    
    const redirectUrl = `menu.html?${redirectParams.toString()}`;
    
    console.log('🔄 Redirecting to menu:', redirectUrl);
    
    // Show success message before redirect
    if (typeof window.showSuccess === 'function') {
      window.showSuccess(`Welcome ${user.displayName?.split(' ')[0] || 'Guest'}! Redirecting to menu...`);
    }
    
    // Redirect after short delay
    setTimeout(() => {
      window.location.href = redirectUrl;
    }, 1500);
    
  } catch (error) {
    console.error('❌ Error attempting automatic redirect:', error);
  }
}

// ============================================================================
// GOOGLE AUTHENTICATION
// ============================================================================

/**
 * Sign in with Google using Firebase Auth popup
 * Handles Google OAuth flow and creates user profile if needed
 * @param {Object} options - Configuration options for Google sign-in
 * @returns {Promise<Object>} User credential result with profile data
 */
async function signInWithGoogle(options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('signInWithGoogle');
  
  try {
    console.log('🔍 Initiating Google sign-in...');
    
    const auth = getFirebaseAuth();
    const provider = new firebase.auth.GoogleAuthProvider();
    
    // Configure Google provider scopes
    provider.addScope('profile');
    provider.addScope('email');
    
    // Add custom parameters if provided
    if (options.prompt) {
      provider.setCustomParameters({ prompt: options.prompt });
    }
    
    // Perform Google sign-in
    const result = await auth.signInWithPopup(provider);
    const user = result.user;
    const credential = firebase.auth.GoogleAuthProvider.credentialFromResult(result);
    
    // Create or update user profile
    const userProfile = await createOrUpdateSocialProfile(user, 'google', {
      accessToken: credential?.accessToken,
      idToken: credential?.idToken
    });
    
    // Track successful Google sign-in
    await VediAPI.trackUserActivity('login', {
      accountType: userProfile.accountType || 'customer',
      email: user.email,
      method: 'google',
      isNewUser: result.additionalUserInfo?.isNewUser || false
    });
    
    // Update session with user ID
    await VediAPI.updateSessionUser(user.uid);
    
    await endTracking(true);
    
    console.log('✅ Google sign-in successful:', user.displayName);
    
    const authResult = {
      user: user,
      profile: userProfile,
      credential: credential,
      isNewUser: result.additionalUserInfo?.isNewUser || false
    };
    
    // FIXED: Execute callback for customer login integration
    await executeSocialAuthCallback(user, 'google', userProfile);
    
    return authResult;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'google_signin');
    
    console.error('❌ Google sign-in error:', error);
    throw handleSocialAuthError(error, 'Google');
  }
}

// ============================================================================
// FACEBOOK AUTHENTICATION
// ============================================================================

/**
 * Sign in with Facebook using Firebase Auth popup
 * Handles Facebook OAuth flow and creates user profile if needed
 * @param {Object} options - Configuration options for Facebook sign-in
 * @returns {Promise<Object>} User credential result with profile data
 */
async function signInWithFacebook(options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('signInWithFacebook');
  
  try {
    console.log('📘 Initiating Facebook sign-in...');
    
    const auth = getFirebaseAuth();
    const provider = new firebase.auth.FacebookAuthProvider();
    
    // Configure Facebook provider scopes
    provider.addScope('email');
    provider.addScope('public_profile');
    
    // Add custom parameters if provided
    if (options.display) {
      provider.setCustomParameters({ display: options.display });
    }
    
    // Perform Facebook sign-in
    const result = await auth.signInWithPopup(provider);
    const user = result.user;
    const credential = firebase.auth.FacebookAuthProvider.credentialFromResult(result);
    
    // Create or update user profile
    const userProfile = await createOrUpdateSocialProfile(user, 'facebook', {
      accessToken: credential?.accessToken
    });
    
    // Track successful Facebook sign-in
    await VediAPI.trackUserActivity('login', {
      accountType: userProfile.accountType || 'customer',
      email: user.email,
      method: 'facebook',
      isNewUser: result.additionalUserInfo?.isNewUser || false
    });
    
    // Update session with user ID
    await VediAPI.updateSessionUser(user.uid);
    
    await endTracking(true);
    
    console.log('✅ Facebook sign-in successful:', user.displayName);
    
    const authResult = {
      user: user,
      profile: userProfile,
      credential: credential,
      isNewUser: result.additionalUserInfo?.isNewUser || false
    };
    
    // FIXED: Execute callback for customer login integration
    await executeSocialAuthCallback(user, 'facebook', userProfile);
    
    return authResult;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'facebook_signin');
    
    console.error('❌ Facebook sign-in error:', error);
    throw handleSocialAuthError(error, 'Facebook');
  }
}

// ============================================================================
// APPLE AUTHENTICATION
// ============================================================================

/**
 * Sign in with Apple using Firebase Auth popup
 * Handles Apple OAuth flow and creates user profile if needed
 * @param {Object} options - Configuration options for Apple sign-in
 * @returns {Promise<Object>} User credential result with profile data
 */
async function signInWithApple(options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('signInWithApple');
  
  try {
    console.log('🍎 Initiating Apple sign-in...');
    
    const auth = getFirebaseAuth();
    const provider = new firebase.auth.OAuthProvider('apple.com');
    
    // Configure Apple provider scopes
    provider.addScope('email');
    provider.addScope('name');
    
    // Add custom parameters if provided
    if (options.locale) {
      provider.setCustomParameters({ locale: options.locale });
    }
    
    // Perform Apple sign-in
    const result = await auth.signInWithPopup(provider);
    const user = result.user;
    const credential = firebase.auth.OAuthProvider.credentialFromResult(result);
    
    // Create or update user profile
    const userProfile = await createOrUpdateSocialProfile(user, 'apple', {
      accessToken: credential?.accessToken,
      idToken: credential?.idToken
    });
    
    // Track successful Apple sign-in
    await VediAPI.trackUserActivity('login', {
      accountType: userProfile.accountType || 'customer',
      email: user.email,
      method: 'apple',
      isNewUser: result.additionalUserInfo?.isNewUser || false
    });
    
    // Update session with user ID
    await VediAPI.updateSessionUser(user.uid);
    
    await endTracking(true);
    
    console.log('✅ Apple sign-in successful:', user.displayName);
    
    const authResult = {
      user: user,
      profile: userProfile,
      credential: credential,
      isNewUser: result.additionalUserInfo?.isNewUser || false
    };
    
    // FIXED: Execute callback for customer login integration
    await executeSocialAuthCallback(user, 'apple', userProfile);
    
    return authResult;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'apple_signin');
    
    console.error('❌ Apple sign-in error:', error);
    throw handleSocialAuthError(error, 'Apple');
  }
}

// ============================================================================
// SOCIAL PROFILE MANAGEMENT
// ============================================================================

/**
 * Create or update user profile for social authentication
 * Handles both new social users and existing users linking accounts
 * @param {Object} firebaseUser - Firebase user object from social sign-in
 * @param {string} provider - Social provider name ('google', 'facebook', 'apple')
 * @param {Object} credentials - Provider credentials and tokens
 * @returns {Promise<Object>} Created or updated user profile
 */
async function createOrUpdateSocialProfile(firebaseUser, provider, credentials = {}) {
  try {
    const db = getFirebaseDb();
    const userId = firebaseUser.uid;
    
    // Check if user profile already exists
    const existingProfile = await db.collection('users').doc(userId).get();
    
    if (existingProfile.exists) {
      // Update existing profile with social login info
      const updateData = {
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
        [`${provider}Connected`]: true,
        [`${provider}ConnectedAt`]: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      // Update email if not set or if it changed
      if (!existingProfile.data().email || existingProfile.data().email !== firebaseUser.email) {
        updateData.email = firebaseUser.email;
      }
      
      // Update display name if not set
      if (!existingProfile.data().name && firebaseUser.displayName) {
        updateData.name = VediAPI.sanitizeInput(firebaseUser.displayName);
      }
      
      await db.collection('users').doc(userId).update(updateData);
      
      // Return updated profile
      const updatedDoc = await db.collection('users').doc(userId).get();
      return { id: updatedDoc.id, ...updatedDoc.data() };
      
    } else {
      // Create new social user profile
      const newProfile = {
        email: firebaseUser.email || '',
        name: VediAPI.sanitizeInput(firebaseUser.displayName || ''),
        accountType: 'customer', // Default for social users
        phone: firebaseUser.phoneNumber || '',
        emailVerified: firebaseUser.emailVerified || false,
        photoURL: firebaseUser.photoURL || '',
        
        // Social provider info
        authProvider: provider,
        [`${provider}Connected`]: true,
        [`${provider}ConnectedAt`]: firebase.firestore.FieldValue.serverTimestamp(),
        
        // Timestamps
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
        
        // Default preferences
        preferences: {
          notifications: true,
          marketing: false
        }
      };
      
      await db.collection('users').doc(userId).set(newProfile);
      
      // Track new social user creation
      await VediAPI.trackUserActivity('signup', {
        accountType: 'customer',
        email: firebaseUser.email,
        method: provider,
        provider: provider
      });
      
      console.log('✅ New social user profile created:', userId);
      return { id: userId, ...newProfile };
    }
    
  } catch (error) {
    console.error('❌ Create/update social profile error:', error);
    await VediAPI.trackError(error, 'createOrUpdateSocialProfile', { provider });
    throw error;
  }
}

/**
 * Link social provider to existing account
 * Allows users to add social login to existing email accounts
 * @param {string} provider - Provider to link ('google', 'facebook', 'apple')
 * @returns {Promise<Object>} Updated user credential
 */
async function linkSocialProvider(provider) {
  const endTracking = VediAPI.startPerformanceMeasurement('linkSocialProvider');
  
  try {
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      throw new Error('No user is currently signed in.');
    }
    
    let authProvider;
    switch (provider.toLowerCase()) {
      case 'google':
        authProvider = new firebase.auth.GoogleAuthProvider();
        authProvider.addScope('profile');
        authProvider.addScope('email');
        break;
      case 'facebook':
        authProvider = new firebase.auth.FacebookAuthProvider();
        authProvider.addScope('email');
        break;
      case 'apple':
        authProvider = new firebase.auth.OAuthProvider('apple.com');
        authProvider.addScope('email');
        authProvider.addScope('name');
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
    
    // Link the provider
    const result = await currentUser.linkWithPopup(authProvider);
    
    // Update user profile with linked provider info
    const db = getFirebaseDb();
    await db.collection('users').doc(currentUser.uid).update({
      [`${provider}Connected`]: true,
      [`${provider}ConnectedAt`]: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    await VediAPI.trackUserActivity('social_account_linked', {
      userId: currentUser.uid,
      provider: provider
    });
    
    await endTracking(true);
    
    console.log(`✅ ${provider} account linked successfully`);
    return result;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'linkSocialProvider', { provider });
    
    console.error(`❌ Link ${provider} account error:`, error);
    throw handleSocialAuthError(error, provider);
  }
}

/**
 * Unlink social provider from current account
 * @param {string} providerId - Provider ID to unlink
 * @returns {Promise<void>} Resolves when provider is unlinked
 */
async function unlinkSocialProvider(providerId) {
  const endTracking = VediAPI.startPerformanceMeasurement('unlinkSocialProvider');
  
  try {
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      throw new Error('No user is currently signed in.');
    }
    
    // Check that user has other sign-in methods
    if (currentUser.providerData.length <= 1) {
      throw new Error('Cannot unlink the only sign-in method. Please add another sign-in method first.');
    }
    
    await currentUser.unlink(providerId);
    
    // Update user profile
    const db = getFirebaseDb();
    const provider = providerId.split('.')[0]; // Extract provider name
    await db.collection('users').doc(currentUser.uid).update({
      [`${provider}Connected`]: false,
      [`${provider}UnlinkedAt`]: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    await VediAPI.trackUserActivity('social_account_unlinked', {
      userId: currentUser.uid,
      provider: provider
    });
    
    await endTracking(true);
    
    console.log(`✅ ${provider} account unlinked successfully`);
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'unlinkSocialProvider', { providerId });
    
    console.error('❌ Unlink social provider error:', error);
    throw handleSocialAuthError(error, 'Social provider');
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Handle social authentication errors with user-friendly messages
 * @param {Object} error - Firebase error object
 * @param {string} provider - Provider name for context
 * @returns {Error} Formatted error with user-friendly message
 */
function handleSocialAuthError(error, provider) {
  const socialErrorMessages = {
    'auth/popup-closed-by-user': `${provider} sign-in was cancelled. Please try again.`,
    'auth/popup-blocked': 'Popup was blocked by your browser. Please allow popups and try again.',
    'auth/account-exists-with-different-credential': 'An account already exists with the same email address but different sign-in credentials. Please try signing in with a different method.',
    'auth/auth-domain-config-required': 'Authentication configuration error. Please contact support.',
    'auth/cancelled-popup-request': 'Another sign-in process is already in progress. Please wait and try again.',
    'auth/operation-not-allowed': `${provider} sign-in is not enabled. Please contact support.`,
    'auth/unauthorized-domain': 'This domain is not authorized for authentication. Please contact support.',
    'auth/user-disabled': 'Your account has been disabled. Please contact support.',
    'auth/user-not-found': 'No account found. Please sign up first.',
    'auth/credential-already-in-use': `This ${provider} account is already linked to another user.`,
    'auth/email-already-in-use': 'An account with this email already exists. Please try signing in instead.',
    'auth/requires-recent-login': 'This operation requires recent authentication. Please sign in again.',
    'auth/provider-already-linked': `${provider} account is already linked to your account.`,
    'auth/no-such-provider': `${provider} is not linked to your account.`
  };
  
  const message = socialErrorMessages[error.code] || `${provider} sign-in failed. Please try again.`;
  
  const enhancedError = new Error(message);
  enhancedError.code = error.code;
  enhancedError.originalError = error;
  enhancedError.provider = provider;
  
  return enhancedError;
}

// ============================================================================
// SOCIAL ACCOUNT UTILITIES
// ============================================================================

/**
 * Get list of linked social providers for current user
 * @returns {Promise<Array>} Array of linked provider information
 */
async function getLinkedProviders() {
  try {
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      return [];
    }
    
    return currentUser.providerData.map(provider => ({
      providerId: provider.providerId,
      uid: provider.uid,
      displayName: provider.displayName,
      email: provider.email,
      photoURL: provider.photoURL
    }));
    
  } catch (error) {
    console.error('❌ Get linked providers error:', error);
    await VediAPI.trackError(error, 'getLinkedProviders');
    return [];
  }
}

/**
 * Check if specific provider is linked to current user
 * @param {string} providerId - Provider ID to check
 * @returns {boolean} True if provider is linked
 */
function isProviderLinked(providerId) {
  try {
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      return false;
    }
    
    return currentUser.providerData.some(provider => provider.providerId === providerId);
    
  } catch (error) {
    console.error('❌ Check provider linked error:', error);
    return false;
  }
}

// ============================================================================
// GLOBAL EXPORTS AND VEDIAPI INTEGRATION
// ============================================================================

// Ensure VediAPI namespace exists
if (!window.VediAPI) {
  window.VediAPI = {};
}

// Attach social authentication functions to VediAPI
Object.assign(window.VediAPI, {
  // INJECTED: Promise utilities from customer-auth-api
  withTimeout,
  withRetry,
  safeAsyncOperation,
  enhanceError,
  
  // INJECTED: Social auth error handling
  getSocialAuthErrorMessage,
  
  // Social sign-in methods
  signInWithGoogle,
  signInWithFacebook,
  signInWithApple,
  
  // Account linking
  linkSocialProvider,
  unlinkSocialProvider,
  
  // Utilities
  getLinkedProviders,
  isProviderLinked,
  
  // Error handling
  handleSocialAuthError,
  
  // FIXED: Customer login integration
  executeSocialAuthCallback,
  attemptCustomerLoginRedirect
});

console.log('🌐 Enhanced Social Authentication Module loaded');
console.log('🔧 INJECTED: Promise utilities - withTimeout, withRetry, safeAsyncOperation, enhanceError');
console.log('🔧 INJECTED: Error handling - getSocialAuthErrorMessage');
console.log('🔍 Google: signInWithGoogle - OAuth with profile and email scopes');
console.log('📘 Facebook: signInWithFacebook - OAuth with email and public_profile');
console.log('🍎 Apple: signInWithApple - OAuth with email and name scopes');
console.log('🔗 Linking: linkSocialProvider, unlinkSocialProvider');
console.log('📊 Utilities: getLinkedProviders, isProviderLinked');
console.log('🛡️ Comprehensive error handling with user-friendly messages');
console.log('🔗 FIXED: Customer login integration with callback system and auto-redirect');
