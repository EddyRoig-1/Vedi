// Your actual Vedi Firebase configuration - UPDATED FOR PRODUCTION PHONE AUTH
const firebaseConfig = {
    apiKey: "AIzaSyDglG7Soj0eKu2SLoVby6n71S7gcQzHBPg",
    authDomain: "vedi00.firebaseapp.com",
    projectId: "vedi00",
    storageBucket: "vedi00.firebasestorage.app",
    messagingSenderId: "136867441640",
    appId: "1:136867441640:web:9ec709b63f5690f628125d",
    measurementId: "G-ZS0FKPTEY2"
};

// Initialize Firebase for Vedi (maintaining your existing pattern)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
} else {
  firebase.app(); // Use existing app
}

// Initialize services (keeping your variable names for compatibility)
const auth = firebase.auth();
const db = firebase.firestore();
const analytics = firebase.analytics();

// Make available globally for Vedi app (your existing pattern)
window.firebaseAuth = auth;
window.firebaseDb = db;
window.firebaseAnalytics = analytics;

// Aliases for enhanced API compatibility
const firebaseAuth = auth;
const firebaseDb = db;
const firebaseAnalytics = analytics;

// Enhanced Authentication Configuration - PRODUCTION PHONE AUTH
// =============================================================================

/**
 * Configure Firebase Auth settings for optimal user experience - PRODUCTION MODE
 */
function configureFirebaseAuth() {
  // Set language preference (can be changed dynamically)
  firebaseAuth.languageCode = 'en'; // or firebaseAuth.useDeviceLanguage();
  
  // Configure auth state persistence
  firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => {
      console.log('🔐 Auth persistence set to LOCAL');
    })
    .catch((error) => {
      console.warn('⚠️ Auth persistence setting failed:', error);
    });

  // PRODUCTION PHONE AUTH - reCAPTCHA is REQUIRED
  console.log('🛡️ reCAPTCHA is REQUIRED for Firebase phone authentication');
  console.log('📱 Phone auth configured for PRODUCTION use');
  console.log('💰 Real SMS messages will be sent (charges apply)');
}

/**
 * Initialize social authentication providers
 */
function initializeSocialProviders() {
  // Google Provider Configuration
  const googleProvider = new firebase.auth.GoogleAuthProvider();
  googleProvider.addScope('profile');
  googleProvider.addScope('email');
  googleProvider.setCustomParameters({
    'prompt': 'select_account'
  });

  // Facebook Provider Configuration  
  const facebookProvider = new firebase.auth.FacebookAuthProvider();
  facebookProvider.addScope('email');
  facebookProvider.setCustomParameters({
    'display': 'popup'
  });

  // Apple Provider Configuration
  const appleProvider = new firebase.auth.OAuthProvider('apple.com');
  appleProvider.addScope('email');
  appleProvider.addScope('name');
  appleProvider.setCustomParameters({
    'locale': 'en'
  });

  // Twitter Provider Configuration (if needed)
  const twitterProvider = new firebase.auth.TwitterAuthProvider();

  // Store providers globally for easy access
  window.socialProviders = {
    google: googleProvider,
    facebook: facebookProvider,
    apple: appleProvider,
    twitter: twitterProvider
  };

  console.log('🔐 Social authentication providers initialized');
}

/**
 * Phone authentication configuration - PRODUCTION MODE
 * Real SMS messages will be sent with reCAPTCHA verification
 */
function configurePhoneAuth() {
  // Set up phone auth specific settings - PRODUCTION
  if (firebaseAuth) {
    // Configure language for SMS messages
    firebaseAuth.languageCode = 'en';
    
    // Set up authentication domain verification
    const authDomain = firebaseConfig.authDomain;
    console.log('🔐 Phone auth configured for domain:', authDomain);
    console.log('📱 PRODUCTION MODE: Real SMS will be sent');
    console.log('🛡️ reCAPTCHA verification: MANDATORY');
    console.log('💰 SMS charges apply to Firebase billing');
  }
}

/**
 * Domain authorization check for phone auth
 * Updated with your actual Firebase domains
 */
function checkDomainAuthorization() {
  const currentDomain = window.location.hostname;
  const authorizedDomains = [
    'localhost',
    '127.0.0.1',
    'vedi00.web.app',           // Your actual domain
    'vedi00.firebaseapp.com'    // Your actual domain
    // Add your custom domain here when you deploy to a custom domain
  ];
  
  const isAuthorized = authorizedDomains.some(domain => 
    currentDomain === domain || currentDomain.includes(domain)
  );
  
  if (!isAuthorized) {
    console.warn('⚠️ Current domain may not be authorized for phone auth:', currentDomain);
    console.log('🔧 Authorized domains in Firebase:', authorizedDomains);
    console.log('📝 To add domains: Firebase Console → Authentication → Settings → Authorized domains');
  } else {
    console.log('✅ Domain authorized for phone authentication:', currentDomain);
  }
  
  return isAuthorized;
}

/**
 * Enhanced authentication state listener
 */
function setupAuthStateListener() {
  firebaseAuth.onAuthStateChanged(async (user) => {
    if (user) {
      console.log('🔐 User authenticated:', {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        phoneNumber: user.phoneNumber,
        providerId: user.providerData[0]?.providerId,
        isAnonymous: user.isAnonymous,
        emailVerified: user.emailVerified
      });

      // Track authentication method
      if (firebaseAnalytics) {
        firebaseAnalytics.logEvent('login', {
          method: user.providerData[0]?.providerId || 'unknown'
        });
      }

      // Update last login timestamp in customer profile
      try {
        if (firebaseDb && user.uid) {
          await firebaseDb.collection('customerProfiles').doc(user.uid).update({
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      } catch (error) {
        console.debug('Could not update last login:', error);
      }

    } else {
      console.log('👤 User signed out');
      
      // Clean up any auth-related session data
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('customerSession');
        sessionStorage.removeItem('lastOrderConfirmed');
      }
    }
  });
}

/**
 * Enhanced error handling for authentication - PRODUCTION READY
 */
function handleAuthError(error) {
  console.error('🔥 Firebase Auth Error:', {
    code: error.code,
    message: error.message,
    details: error
  });

  // Track authentication errors
  if (firebaseAnalytics) {
    firebaseAnalytics.logEvent('login_error', {
      error_code: error.code,
      error_message: error.message
    });
  }

  // Production-ready error messages for phone auth
  switch (error.code) {
    case 'auth/invalid-phone-number':
      return 'Please enter a valid phone number with country code (e.g., +1 555-123-4567)';
    case 'auth/too-many-requests':
      return 'Too many SMS requests for this phone number. Please try again in a few hours.';
    case 'auth/captcha-check-failed':
      return 'Security verification failed. Please refresh the page and try again.';
    case 'auth/invalid-verification-code':
      return 'Invalid verification code. Please check your SMS and enter the correct 6-digit code.';
    case 'auth/code-expired':
      return 'Verification code expired. Please request a new code.';
    case 'auth/session-expired':
      return 'Session expired. Please start the verification process again.';
    case 'auth/missing-phone-number':
      return 'Phone number is required for SMS verification.';
    case 'auth/quota-exceeded':
      return 'Daily SMS limit exceeded. Please try again tomorrow or contact support.';
    default:
      return 'Authentication error occurred. Please try again or contact support.';
  }
}

/**
 * Initialize Firebase Security Rules awareness
 */
function logSecurityRulesInfo() {
  console.log('🔒 Firebase Security Rules Configuration:');
  console.log('   📱 Customer Authentication: Phone + Social (Google, Facebook, Apple)');
  console.log('   🏪 Business Authentication: Email/Password');
  console.log('   👥 Customer Access: Read/Write own orders and profile');
  console.log('   🏢 Business Access: Read/Write own restaurant/venue data');
  console.log('   🛡️ Admin Access: Full platform monitoring and analytics');
}

/**
 * Enhanced connection monitoring
 */
function setupConnectionMonitoring() {
  // Monitor Firestore connection
  firebaseDb.enableNetwork().then(() => {
    console.log('🌐 Firestore network enabled');
  }).catch((error) => {
    console.warn('⚠️ Firestore network error:', error);
  });

  // Monitor Auth connection
  firebaseAuth.onAuthStateChanged(() => {
    // This fires when connection state changes
  }, (error) => {
    console.warn('⚠️ Auth state error:', error);
  });

  // Listen for online/offline events
  window.addEventListener('online', () => {
    console.log('🌐 Back online - Firebase will automatically reconnect');
  });

  window.addEventListener('offline', () => {
    console.log('📴 Gone offline - Firebase will queue operations');
  });
}

/**
 * Development vs Production configuration
 */
function configureEnvironment() {
  const isProduction = window.location.hostname !== 'localhost' && 
                      !window.location.hostname.includes('127.0.0.1') &&
                      !window.location.hostname.includes('firebase');

  if (isProduction) {
    console.log('🚀 Running in PRODUCTION mode');
    
    // Production-specific configurations
    if (firebaseAnalytics) {
      firebaseAnalytics.logEvent('app_start', {
        environment: 'production'
      });
    }
  } else {
    console.log('🛠️ Running in DEVELOPMENT mode');
    
    // Development-specific configurations
    if (firebaseAnalytics) {
      firebaseAnalytics.logEvent('app_start', {
        environment: 'development'
      });
    }
  }

  return isProduction;
}

// =============================================================================
// PRODUCTION reCAPTCHA FUNCTIONS - REAL IMPLEMENTATION
// =============================================================================

/**
 * Create reCAPTCHA verifier for production phone auth
 */
function createRecaptchaVerifier(containerId = 'recaptcha-container', options = {}) {
  console.log('🛡️ Creating reCAPTCHA verifier for production phone auth');

  const defaultOptions = {
    'size': 'invisible',  // Use invisible if you want a badge-less experience
    'callback': function(response) {
      console.log('✅ reCAPTCHA solved successfully');
    },
    'expired-callback': function() {
      console.log('⏱️ reCAPTCHA expired - user needs to solve again');
    },
    'error-callback': function(error) {
      console.error('❌ reCAPTCHA error:', error);
    }
  };

  const finalOptions = { ...defaultOptions, ...options };

  // 🔁 Inject the new site key explicitly
  const verifier = new firebase.auth.RecaptchaVerifier(containerId, finalOptions, auth);
  verifier.render().then(widgetId => {
    console.log('✅ reCAPTCHA rendered with widget ID:', widgetId);
    // 🔒 Optional: store widget ID if needed
  });

  window.recaptchaVerifier = verifier; // ensure it's globally available
  return verifier;
}


  const finalOptions = { ...defaultOptions, ...options };
  
  return new firebase.auth.RecaptchaVerifier(containerId, finalOptions);
}

/**
 * Clear reCAPTCHA verifier
 */
function clearRecaptchaVerifier() {
  console.log('🧹 Clearing reCAPTCHA verifier');
  if (window.recaptchaVerifier) {
    try {
      window.recaptchaVerifier.clear();
      window.recaptchaVerifier = null;
      console.log('✅ reCAPTCHA verifier cleared successfully');
    } catch (error) {
      console.warn('⚠️ Error clearing reCAPTCHA verifier:', error);
    }
  }
}

/**
 * Reset reCAPTCHA (for error recovery)
 */
function resetRecaptcha() {
  console.log('🔄 Resetting reCAPTCHA');
  clearRecaptchaVerifier();
  return Promise.resolve();
}

// =============================================================================
// INITIALIZATION SEQUENCE - PRODUCTION PHONE AUTH
// =============================================================================

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  try {
    console.log('🔥 Initializing Vedi Firebase Configuration (PRODUCTION PHONE AUTH)...');
    
    // Configure Firebase Auth
    configureFirebaseAuth();
    
    // Configure phone authentication (PRODUCTION)
    configurePhoneAuth();
    
    // Check domain authorization for phone auth
    checkDomainAuthorization();
    
    // Initialize social providers
    initializeSocialProviders();
    
    // Setup auth state monitoring
    setupAuthStateListener();
    
    // Setup connection monitoring
    setupConnectionMonitoring();
    
    // Configure environment-specific settings
    const isProduction = configureEnvironment();
    
    // Log security rules information
    logSecurityRulesInfo();
    
    console.log('✅ Vedi Firebase Configuration Complete (PRODUCTION)!');
    console.log('🔐 Authentication Methods Available:');
    console.log('   📱 Phone (SMS OTP with mandatory reCAPTCHA)');
    console.log('   🔍 Google Social Login');
    console.log('   📘 Facebook Social Login'); 
    console.log('   🍎 Apple Social Login');
    console.log('   📧 Email/Password (Business Users)');
    
    // Phone auth specific logging (PRODUCTION)
    console.log('📱 Phone Authentication Setup (PRODUCTION):');
    console.log('   🛡️ reCAPTCHA verification: MANDATORY');
    console.log('   📱 Real SMS will be sent to phone numbers');
    console.log('   💰 SMS charges apply to your Firebase billing');
    console.log('   ⚠️ Rate limits apply to prevent abuse');
    console.log('   🚫 No test numbers - production use only');
    
  } catch (error) {
    console.error('❌ Firebase configuration error:', error);
  }
});

// Export for use in other modules (maintaining compatibility)
window.firebaseConfig = firebaseConfig;

// Utility functions available globally (PRODUCTION versions)
window.createRecaptchaVerifier = createRecaptchaVerifier;
window.clearRecaptchaVerifier = clearRecaptchaVerifier;
window.resetRecaptcha = resetRecaptcha;
window.handleAuthError = handleAuthError;

console.log('🍽️ Vedi Firebase initialized successfully (PRODUCTION PHONE AUTH)');
console.log('📊 Analytics tracking enabled');
console.log('🔐 Enhanced authentication with social login ready!');
console.log('📱 Phone authentication configured - reCAPTCHA REQUIRED!');
console.log('💰 Real SMS will be sent - charges apply!');
console.log('🔥 Production Firebase configuration loaded successfully!');
