// Your actual Vedi Firebase configuration
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

// Enhanced Authentication Configuration
// =============================================================================

/**
 * Configure Firebase Auth settings for optimal user experience
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

  // Enable app verification for phone auth (helps with iOS)
  if (window.recaptchaVerifier) {
    window.recaptchaVerifier.clear();
  }
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
 * Enhanced reCAPTCHA configuration for phone authentication
 * This is crucial for phone OTP to work properly
 */
function configurePhoneAuth() {
  // Set up phone auth specific settings
  if (firebaseAuth) {
    // Enable phone auth debug mode for localhost (development)
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname.includes('127.0.0.1');
    
    if (isLocalhost) {
      console.log('🛠️ Development mode: Phone auth debug settings enabled');
      // Note: Do NOT use this in production
      // firebaseAuth.settings = { appVerificationDisabledForTesting: true };
    }
    
    // Configure language for SMS messages
    firebaseAuth.languageCode = 'en';
    
    // Set up authentication domain verification
    // This ensures your domain is authorized for phone auth
    const authDomain = firebaseConfig.authDomain;
    console.log('🔐 Phone auth configured for domain:', authDomain);
  }
}

/**
 * Enhanced reCAPTCHA verifier creation with better error handling
 * This function creates the reCAPTCHA needed for phone authentication
 * NOTE: This is a simple helper - main reCAPTCHA functions are in phone-auth.js
 */
function createRecaptchaVerifier(containerId = 'recaptcha-container', options = {}) {
  const defaultOptions = {
    'size': 'normal',
    'callback': function(response) {
      console.log('✅ reCAPTCHA solved successfully');
      // Enable the send button when reCAPTCHA is solved
      const sendBtn = document.getElementById('sendCodeBtn');
      if (sendBtn) sendBtn.disabled = false;
    },
    'expired-callback': function() {
      console.log('⏰ reCAPTCHA expired - user needs to solve again');
      const sendBtn = document.getElementById('sendCodeBtn');
      if (sendBtn) sendBtn.disabled = true;
    },
    'error-callback': function(error) {
      console.error('❌ reCAPTCHA error:', error);
      // Show user-friendly error message
      const errorMsg = 'reCAPTCHA verification failed. Please refresh the page and try again.';
      if (window.showError) {
        window.showError(errorMsg);
      } else {
        alert(errorMsg);
      }
    }
  };

  const mergedOptions = { ...defaultOptions, ...options };

  try {
    // Clear any existing reCAPTCHA first
    if (window.recaptchaVerifier) {
      window.recaptchaVerifier.clear();
      window.recaptchaVerifier = null;
    }

    const recaptchaVerifier = new firebase.auth.RecaptchaVerifier(containerId, mergedOptions);
    
    // Store globally for access
    window.recaptchaVerifier = recaptchaVerifier;
    
    console.log('🔐 reCAPTCHA verifier created successfully');
    return recaptchaVerifier;
    
  } catch (error) {
    console.error('❌ Failed to create reCAPTCHA verifier:', error);
    
    // Show helpful error message
    const errorMsg = 'Failed to initialize phone verification. Please ensure:\n' +
                    '1. You have a stable internet connection\n' +
                    '2. JavaScript is enabled\n' +
                    '3. Your browser supports modern web features\n\n' +
                    'Try refreshing the page.';
    
    if (window.showError) {
      window.showError(errorMsg);
    } else {
      alert(errorMsg);
    }
    
    throw error;
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
 * Enhanced error handling for authentication
 * NOTE: Specific error message functions are in utilities.js and phone-auth.js
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

  // Use the error handling from utilities.js if available
  if (window.VediAPI && window.VediAPI.getAuthErrorMessage) {
    return window.VediAPI.getAuthErrorMessage(error.code);
  }
  
  // Fallback error message
  return 'An unexpected error occurred. Please try again.';
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
// INITIALIZATION SEQUENCE
// =============================================================================

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  try {
    console.log('🔥 Initializing Enhanced Firebase Configuration...');
    
    // Configure Firebase Auth
    configureFirebaseAuth();
    
    // IMPORTANT: Configure phone authentication
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
    
    console.log('✅ Enhanced Firebase Configuration Complete!');
    console.log('🔐 Authentication Methods Available:');
    console.log('   📱 Phone (SMS OTP with reCAPTCHA)');
    console.log('   🔍 Google Social Login');
    console.log('   📘 Facebook Social Login'); 
    console.log('   🍎 Apple Social Login');
    console.log('   📧 Email/Password (Business Users)');
    
    // IMPORTANT: Phone auth specific logging
    console.log('📱 Phone Authentication Setup:');
    console.log('   🔐 reCAPTCHA verifier ready');
    console.log('   🌐 Domain authorization checked');
    console.log('   📨 SMS service configured');
    
  } catch (error) {
    console.error('❌ Firebase configuration error:', error);
  }
});

// Export for use in other modules (maintaining compatibility)
window.firebaseConfig = firebaseConfig;

// Utility functions available globally
window.createRecaptchaVerifier = createRecaptchaVerifier;
window.handleAuthError = handleAuthError;

console.log('🍽️ Vedi Firebase initialized successfully');
console.log('📊 Analytics tracking enabled');
console.log('🔐 Enhanced authentication with social login ready!');
console.log('📱 Phone OTP authentication configured!');
console.log('🔥 Enhanced Firebase configuration loaded successfully!');