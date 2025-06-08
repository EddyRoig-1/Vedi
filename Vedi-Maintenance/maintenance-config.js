// maintenance-config.js - Vedi Admin Configuration & Setup

// Firebase Configuration (same as main app)
const firebaseConfig = {
  apiKey: "AIzaSyDglG7Soj0eKu2SLoVby6n71S7gcQzHBPg",
  authDomain: "vedi00.firebaseapp.com",
  projectId: "vedi00",
  storageBucket: "vedi00.firebasestorage.app",
  messagingSenderId: "136867441640",
  appId: "1:136867441640:web:9ec709b63f5690f628125d",
  measurementId: "G-ZS0FKPTEY2"
};

// Initialize Firebase for maintenance dashboard
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Firebase service instances
const firebaseAuth = firebase.auth();
const firebaseDb = firebase.firestore();
const firebaseAnalytics = firebase.analytics();

// Maintenance Dashboard Configuration
const MAINTENANCE_CONFIG = {
  // Admin Access Settings
  ADMIN_ACCESS_CODE: 'VEDI2025ADMIN',
  ADMIN_SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  
  // Dashboard Refresh Intervals (in milliseconds)
  DASHBOARD_REFRESH_INTERVAL: 30000,    // 30 seconds
  ACTIVITY_REFRESH_INTERVAL: 10000,     // 10 seconds
  METRICS_REFRESH_INTERVAL: 60000,      // 1 minute
  HEALTH_CHECK_INTERVAL: 120000,        // 2 minutes
  
  // Data Limits
  MAX_ACTIVITY_ITEMS: 50,
  MAX_API_METHODS_DISPLAY: 20,
  MAX_USER_LIST_ITEMS: 100,
  
  // Chart Colors
  CHART_COLORS: {
    primary: '#667eea',
    secondary: '#764ba2',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#06b6d4',
    purple: '#8b5cf6'
  },
  
  // API Method Categories
  API_CATEGORIES: {
    'Authentication': {
      color: '#667eea',
      icon: '🔐',
      methods: ['signUp', 'signIn', 'signOut', 'getCurrentUser', 'getUserData', 'checkEmailExists']
    },
    'Restaurant': {
      color: '#10b981',
      icon: '🏪',
      methods: ['createRestaurant', 'updateRestaurant', 'getRestaurantByOwner', 'getRestaurant', 'getRestaurantsByVenue']
    },
    'Menu': {
      color: '#f59e0b',
      icon: '📋',
      methods: ['getMenuCategories', 'createMenuCategory', 'updateMenuCategory', 'deleteMenuCategory', 'getMenuItems', 'getMenuItemsByCategory', 'createMenuItem', 'updateMenuItem', 'deleteMenuItem', 'updateItemStock', 'getFullMenu', 'searchMenuItems']
    },
    'Orders': {
      color: '#ef4444',
      icon: '🛒',
      methods: ['createOrder', 'getOrderByNumber', 'getOrders', 'getOrdersByCustomer', 'getMostRecentActiveOrder', 'updateOrderStatus', 'getTodaysOrders']
    },
    'Venues': {
      color: '#8b5cf6',
      icon: '🏢',
      methods: ['createVenue', 'updateVenue', 'getVenueByManager', 'getVenue']
    },
    'Loss Tracking': {
      color: '#06b6d4',
      icon: '⚠️',
      methods: ['createLossIncident', 'getLossIncidents', 'getLossIncidentsByVenue', 'updateLossIncident', 'deleteLossIncident', 'getLossAnalytics', 'getVenueLossAnalytics']
    },
    'Real-time': {
      color: '#84cc16',
      icon: '🔴',
      methods: ['listenToOrders', 'listenToOrder', 'listenToCustomerOrders', 'listenToOrderByNumber', 'listenToVenueOrders', 'listenToLossIncidents', 'listenToVenueLossIncidents']
    }
  },
  
  // System Health Thresholds
  HEALTH_THRESHOLDS: {
    ERROR_RATE: {
      good: 1,      // < 1% error rate = good
      warning: 5,   // 1-5% error rate = warning
      critical: 10  // > 5% error rate = critical
    },
    RESPONSE_TIME: {
      good: 200,      // < 200ms = good
      warning: 500,   // 200-500ms = warning
      critical: 1000  // > 500ms = critical
    },
    ACTIVE_USERS: {
      minimum: 10,    // Minimum expected active users
      warning: 50,    // Warning if below this
      good: 100       // Good if above this
    }
  },
  
  // Notification Settings
  NOTIFICATIONS: {
    ENABLE_BROWSER_NOTIFICATIONS: true,
    ENABLE_EMAIL_ALERTS: false, // Would need backend setup
    CRITICAL_ERROR_THRESHOLD: 10, // Number of critical errors before alert
    SYSTEM_DOWN_ALERT: true
  },
  
  // Data Export Settings
  EXPORT: {
    MAX_RECORDS: 10000,
    SUPPORTED_FORMATS: ['CSV', 'JSON', 'Excel'],
    DEFAULT_FORMAT: 'CSV'
  },
  
  // UI Settings
  UI: {
    THEME: 'light', // 'light' or 'dark'
    ANIMATION_DURATION: 300, // milliseconds
    TOAST_DURATION: 5000,    // milliseconds
    MODAL_BACKDROP: true,
    AUTO_REFRESH: true
  },
  
  // Security Settings
  SECURITY: {
    SESSION_TRACKING: true,
    AUDIT_LOGGING: true,
    IP_LOGGING: false,  // Client-side only, limited value
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000 // 15 minutes
  }
};

// Utility Functions for Configuration
const MaintenanceUtils = {
  /**
   * Get API category for a method
   * @param {string} methodName - API method name
   * @returns {Object} Category info
   */
  getAPICategory(methodName) {
    for (const [categoryName, categoryData] of Object.entries(MAINTENANCE_CONFIG.API_CATEGORIES)) {
      if (categoryData.methods.includes(methodName)) {
        return {
          name: categoryName,
          color: categoryData.color,
          icon: categoryData.icon
        };
      }
    }
    return {
      name: 'Other',
      color: '#6b7280',
      icon: '❓'
    };
  },

  /**
   * Format numbers for display
   * @param {number} number - Number to format
   * @returns {string} Formatted number
   */
  formatNumber(number) {
    if (number >= 1000000) {
      return (number / 1000000).toFixed(1) + 'M';
    }
    if (number >= 1000) {
      return (number / 1000).toFixed(1) + 'K';
    }
    return number.toString();
  },

  /**
   * Get health status based on metric
   * @param {string} metric - Metric type
   * @param {number} value - Metric value
   * @returns {Object} Health status
   */
  getHealthStatus(metric, value) {
    const thresholds = MAINTENANCE_CONFIG.HEALTH_THRESHOLDS[metric.toUpperCase()];
    if (!thresholds) return { status: 'unknown', color: '#6b7280' };

    if (metric === 'ERROR_RATE') {
      if (value < thresholds.good) return { status: 'good', color: '#10b981' };
      if (value < thresholds.warning) return { status: 'warning', color: '#f59e0b' };
      return { status: 'critical', color: '#ef4444' };
    }

    if (metric === 'RESPONSE_TIME') {
      if (value < thresholds.good) return { status: 'good', color: '#10b981' };
      if (value < thresholds.warning) return { status: 'warning', color: '#f59e0b' };
      return { status: 'critical', color: '#ef4444' };
    }

    if (metric === 'ACTIVE_USERS') {
      if (value >= thresholds.good) return { status: 'good', color: '#10b981' };
      if (value >= thresholds.warning) return { status: 'warning', color: '#f59e0b' };
      return { status: 'critical', color: '#ef4444' };
    }

    return { status: 'unknown', color: '#6b7280' };
  },

  /**
   * Show toast notification
   * @param {string} message - Message to show
   * @param {string} type - Type: success, warning, error, info
   */
  showToast(message, type = 'info') {
    const colors = {
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#667eea'
    };

    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${colors[type] || colors.info};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
      font-weight: 500;
      max-width: 400px;
      animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, MAINTENANCE_CONFIG.UI.TOAST_DURATION);
  },

  /**
   * Check if user session is valid
   * @returns {boolean} True if session is valid
   */
  isSessionValid() {
    const lastActivity = localStorage.getItem('vedi_admin_last_activity');
    if (!lastActivity) return false;

    const sessionTime = Date.now() - parseInt(lastActivity);
    return sessionTime < MAINTENANCE_CONFIG.ADMIN_SESSION_TIMEOUT;
  },

  /**
   * Update session activity
   */
  updateSessionActivity() {
    localStorage.setItem('vedi_admin_last_activity', Date.now().toString());
  },

  /**
   * Clear admin session
   */
  clearSession() {
    localStorage.removeItem('vedi_admin_last_activity');
    localStorage.removeItem('vedi_admin_preferences');
  },

  /**
   * Get or set admin preferences
   * @param {Object} preferences - Preferences to set (optional)
   * @returns {Object} Current preferences
   */
  adminPreferences(preferences = null) {
    const key = 'vedi_admin_preferences';
    
    if (preferences) {
      localStorage.setItem(key, JSON.stringify(preferences));
      return preferences;
    }
    
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : {
      theme: MAINTENANCE_CONFIG.UI.THEME,
      autoRefresh: MAINTENANCE_CONFIG.UI.AUTO_REFRESH,
      notificationsEnabled: MAINTENANCE_CONFIG.NOTIFICATIONS.ENABLE_BROWSER_NOTIFICATIONS
    };
  },

  /**
   * Request browser notification permission
   */
  async requestNotificationPermission() {
    if (!MAINTENANCE_CONFIG.NOTIFICATIONS.ENABLE_BROWSER_NOTIFICATIONS) return false;
    
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  },

  /**
   * Send browser notification
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {string} icon - Notification icon
   */
  sendNotification(title, body, icon = '/favicon.ico') {
    if (!MAINTENANCE_CONFIG.NOTIFICATIONS.ENABLE_BROWSER_NOTIFICATIONS) return;
    if (Notification.permission !== 'granted') return;

    new Notification(title, {
      body,
      icon,
      badge: icon,
      requireInteraction: false
    });
  },

  /**
   * Export data to specified format
   * @param {Array} data - Data to export
   * @param {string} filename - Export filename
   * @param {string} format - Export format (CSV, JSON)
   */
  exportData(data, filename, format = 'CSV') {
    let content, mimeType;

    switch (format.toUpperCase()) {
      case 'CSV':
        content = this.convertToCSV(data);
        mimeType = 'text/csv';
        filename += '.csv';
        break;
      case 'JSON':
        content = JSON.stringify(data, null, 2);
        mimeType = 'application/json';
        filename += '.json';
        break;
      default:
        console.error('Unsupported export format:', format);
        return;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * Convert array of objects to CSV
   * @param {Array} data - Data array
   * @returns {string} CSV string
   */
  convertToCSV(data) {
    if (!data.length) return '';

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
        }).join(',')
      )
    ].join('\n');

    return csvContent;
  }
};

// Add CSS animations for toasts
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Make configuration available globally
window.MAINTENANCE_CONFIG = MAINTENANCE_CONFIG;
window.MaintenanceUtils = MaintenanceUtils;

// Initialize session tracking
MaintenanceUtils.updateSessionActivity();

// Set up session timeout checking
setInterval(() => {
  if (firebaseAuth.currentUser && !MaintenanceUtils.isSessionValid()) {
    MaintenanceUtils.showToast('Session expired. Please login again.', 'warning');
    firebaseAuth.signOut();
    window.location.href = 'admin-auth.html';
  }
}, 60000); // Check every minute

console.log('⚙️ Vedi Maintenance Config loaded successfully');
console.log('🎛️ Dashboard configuration: Ready');
console.log('🔧 Utility functions: Available');
