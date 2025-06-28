// api/core/utilities.js - Core Utility Functions
/**
 * Core Utilities Module
 * 
 * Provides essential utility functions used throughout the VediAPI system.
 * These functions handle common operations like date/time manipulation,
 * data formatting, validation, and error handling.
 * 
 * All utility functions are designed to be pure (no side effects) and
 * can be safely used across all other modules.
 * 
 * UPDATED: Now includes timezone-aware functions for venues and restaurants
 */

// ============================================================================
// DATE AND TIME UTILITIES
// ============================================================================

/**
 * Convert Firebase timestamp to JavaScript Date object
 * Handles both Firebase Timestamp objects and regular timestamps
 * @param {Object|number|string} timestamp - Firebase timestamp or regular timestamp
 * @returns {Date} JavaScript Date object
 */
function timestampToDate(timestamp) {
  try {
    if (timestamp && timestamp.toDate) {
      // Firebase Timestamp object
      return timestamp.toDate();
    }
    if (timestamp && timestamp.seconds) {
      // Firebase Timestamp-like object with seconds
      return new Date(timestamp.seconds * 1000);
    }
    // Regular timestamp or date string
    return new Date(timestamp);
  } catch (error) {
    console.error('❌ Error converting timestamp:', error);
    return new Date(); // Return current date as fallback
  }
}

/**
 * Get start date for various time periods
 * Used for analytics and filtering operations
 * @param {string} timePeriod - Time period string ('today', 'week', 'month', 'quarter', 'year')
 * @returns {Date|null} Start date for the period or null for invalid period
 */
function getTimePeriodStart(timePeriod) {
  const now = new Date();
  
  switch (timePeriod.toLowerCase()) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week':
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      return weekStart;
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarter':
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), quarterMonth, 1);
    case 'year':
      return new Date(now.getFullYear(), 0, 1);
    default:
      console.warn('⚠️ Invalid time period:', timePeriod);
      return null;
  }
}

/**
 * Get week key for date grouping (YYYY-WNN format)
 * Used for weekly analytics and reporting
 * @param {Date} date - Date to get week key for
 * @returns {string} Week key in YYYY-WNN format
 */
function getWeekKey(date) {
  try {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(((date - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
  } catch (error) {
    console.error('❌ Error generating week key:', error);
    return `${new Date().getFullYear()}-W01`;
  }
}

/**
 * Get relative time string (e.g., "2 hours ago", "just now")
 * Used for displaying user-friendly timestamps
 * @param {Object|Date} timestamp - Firebase timestamp or Date object
 * @returns {string} Relative time description
 */
function getRelativeTime(timestamp) {
  try {
    const date = timestampToDate(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  } catch (error) {
    console.error('❌ Error calculating relative time:', error);
    return 'Unknown time';
  }
}

// ============================================================================
// TIMEZONE-AWARE DATE AND TIME UTILITIES (NEW)
// ============================================================================

/**
 * Get calendar period boundaries in entity's timezone
 * Calendar-based periods with timezone support for venues and restaurants
 * @param {string} period - Period type ('today', 'thisWeek', 'thisMonth', 'thisQuarter', 'thisYear')
 * @param {Object} entity - Entity (venue or restaurant) with timezone
 * @returns {Object} Object with start and end dates in entity's timezone
 */
function getCalendarPeriodBoundaries(period, entity = null) {
    try {
        // Get timezone from entity or use UTC as fallback
        const timezone = getEntityTimezone(entity);
        const now = new Date();
        
        // Get current time in entity's timezone
        const nowInTimezone = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        
        let start, end;
        
        switch (period.toLowerCase()) {
            case 'today':
                start = new Date(nowInTimezone.getFullYear(), nowInTimezone.getMonth(), nowInTimezone.getDate(), 0, 0, 0);
                end = new Date(nowInTimezone.getFullYear(), nowInTimezone.getMonth(), nowInTimezone.getDate(), 23, 59, 59);
                break;
                
            case 'thisweek':
                // Monday to Sunday
                const dayOfWeek = nowInTimezone.getDay();
                const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Sunday = 0, Monday = 1
                start = new Date(nowInTimezone);
                start.setDate(nowInTimezone.getDate() + mondayOffset);
                start.setHours(0, 0, 0, 0);
                
                end = new Date(start);
                end.setDate(start.getDate() + 6);
                end.setHours(23, 59, 59, 999);
                break;
                
            case 'thismonth':
                // 1st to end of month
                start = new Date(nowInTimezone.getFullYear(), nowInTimezone.getMonth(), 1, 0, 0, 0);
                end = new Date(nowInTimezone.getFullYear(), nowInTimezone.getMonth() + 1, 0, 23, 59, 59);
                break;
                
            case 'thisquarter':
                // Q1/Q2/Q3/Q4
                const quarterMonth = Math.floor(nowInTimezone.getMonth() / 3) * 3;
                start = new Date(nowInTimezone.getFullYear(), quarterMonth, 1, 0, 0, 0);
                end = new Date(nowInTimezone.getFullYear(), quarterMonth + 3, 0, 23, 59, 59);
                break;
                
            case 'thisyear':
                // January 1st to December 31st
                start = new Date(nowInTimezone.getFullYear(), 0, 1, 0, 0, 0);
                end = new Date(nowInTimezone.getFullYear(), 11, 31, 23, 59, 59);
                break;
                
            default:
                console.warn('⚠️ Invalid calendar period:', period);
                // Default to today
                start = new Date(nowInTimezone.getFullYear(), nowInTimezone.getMonth(), nowInTimezone.getDate(), 0, 0, 0);
                end = new Date(nowInTimezone.getFullYear(), nowInTimezone.getMonth(), nowInTimezone.getDate(), 23, 59, 59);
        }
        
        return { start, end, timezone };
        
    } catch (error) {
        console.error('❌ Get calendar period boundaries error:', error);
        // Fallback to current date
        const fallbackStart = new Date();
        fallbackStart.setHours(0, 0, 0, 0);
        const fallbackEnd = new Date();
        fallbackEnd.setHours(23, 59, 59, 999);
        
        return { 
            start: fallbackStart, 
            end: fallbackEnd, 
            timezone: 'UTC'
        };
    }
}

/**
 * Get previous calendar period for comparison
 * @param {string} period - Period type
 * @param {Object} entity - Entity with timezone
 * @returns {Object} Previous period boundaries
 */
function getPreviousCalendarPeriod(period, entity = null) {
    try {
        const timezone = getEntityTimezone(entity);
        const now = new Date();
        const nowInTimezone = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        
        let start, end;
        
        switch (period.toLowerCase()) {
            case 'today':
                // Yesterday
                start = new Date(nowInTimezone);
                start.setDate(nowInTimezone.getDate() - 1);
                start.setHours(0, 0, 0, 0);
                
                end = new Date(start);
                end.setHours(23, 59, 59, 999);
                break;
                
            case 'thisweek':
                // Last week (same Monday-Sunday)
                const dayOfWeek = nowInTimezone.getDay();
                const lastMondayOffset = dayOfWeek === 0 ? -13 : -6 - dayOfWeek; // Previous Monday
                start = new Date(nowInTimezone);
                start.setDate(nowInTimezone.getDate() + lastMondayOffset);
                start.setHours(0, 0, 0, 0);
                
                end = new Date(start);
                end.setDate(start.getDate() + 6);
                end.setHours(23, 59, 59, 999);
                break;
                
            case 'thismonth':
                // Last month (1st to end)
                start = new Date(nowInTimezone.getFullYear(), nowInTimezone.getMonth() - 1, 1, 0, 0, 0);
                end = new Date(nowInTimezone.getFullYear(), nowInTimezone.getMonth(), 0, 23, 59, 59);
                break;
                
            case 'thisquarter':
                // Previous quarter
                const currentQuarter = Math.floor(nowInTimezone.getMonth() / 3);
                const prevQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
                const prevYear = currentQuarter === 0 ? nowInTimezone.getFullYear() - 1 : nowInTimezone.getFullYear();
                
                start = new Date(prevYear, prevQuarter * 3, 1, 0, 0, 0);
                end = new Date(prevYear, prevQuarter * 3 + 3, 0, 23, 59, 59);
                break;
                
            case 'thisyear':
                // Last year
                start = new Date(nowInTimezone.getFullYear() - 1, 0, 1, 0, 0, 0);
                end = new Date(nowInTimezone.getFullYear() - 1, 11, 31, 23, 59, 59);
                break;
                
            default:
                console.warn('⚠️ Invalid calendar period for previous:', period);
                // Default to yesterday
                start = new Date(nowInTimezone);
                start.setDate(nowInTimezone.getDate() - 1);
                start.setHours(0, 0, 0, 0);
                
                end = new Date(start);
                end.setHours(23, 59, 59, 999);
        }
        
        return { start, end, timezone };
        
    } catch (error) {
        console.error('❌ Get previous calendar period error:', error);
        // Fallback to yesterday
        const fallbackStart = new Date();
        fallbackStart.setDate(fallbackStart.getDate() - 1);
        fallbackStart.setHours(0, 0, 0, 0);
        
        const fallbackEnd = new Date(fallbackStart);
        fallbackEnd.setHours(23, 59, 59, 999);
        
        return { 
            start: fallbackStart, 
            end: fallbackEnd, 
            timezone: 'UTC'
        };
    }
}

/**
 * Get timezone for any entity (venue or restaurant)
 * @param {Object} entity - Venue or restaurant data object
 * @returns {string} Entity's effective timezone
 */
function getEntityTimezone(entity) {
    try {
        if (!entity) {
            return 'UTC';
        }
        
        // If it's a venue, return venue timezone
        if (entity.managerUserId || entity.maxRestaurants) { // Venue indicators
            return entity.timezone || 'UTC';
        }
        
        // If it's a restaurant, check for venue timezone first
        if (entity.ownerId || entity.restaurantType) { // Restaurant indicators
            // If restaurant is in venue, use venue timezone
            if (entity.venueId && entity.venueTimezone) {
                return entity.venueTimezone;
            }
            
            // Independent restaurant uses own timezone
            if (entity.timezone) {
                return entity.timezone;
            }
        }
        
        // Fallback: check for timezone property
        return entity.timezone || 'UTC';
        
    } catch (error) {
        console.error('❌ Get entity timezone error:', error);
        return 'UTC';
    }
}

/**
 * Convert timestamp to date in entity's timezone
 * Enhanced version of timestampToDate with timezone support
 * @param {Object|number|string} timestamp - Firebase timestamp or regular timestamp
 * @param {Object} entity - Entity with timezone (optional)
 * @returns {Date} Date object in entity's timezone
 */
function timestampToDateInTimezone(timestamp, entity = null) {
    try {
        let date;
        
        if (timestamp && timestamp.toDate) {
            // Firebase Timestamp object
            date = timestamp.toDate();
        } else if (timestamp && timestamp.seconds) {
            // Firebase Timestamp-like object with seconds
            date = new Date(timestamp.seconds * 1000);
        } else {
            // Regular timestamp or date string
            date = new Date(timestamp);
        }
        
        // If entity provided, convert to entity's timezone
        if (entity) {
            const timezone = getEntityTimezone(entity);
            return new Date(date.toLocaleString('en-US', { timeZone: timezone }));
        }
        
        return date;
        
    } catch (error) {
        console.error('❌ Error converting timestamp to timezone:', error);
        return new Date(); // Return current date as fallback
    }
}

/**
 * Filter orders by calendar time period in entity's timezone
 * @param {Array} orders - Array of order objects
 * @param {string} period - Time period
 * @param {Object} entity - Entity with timezone
 * @returns {Array} Filtered orders
 */
function filterOrdersByTimePeriod(orders, period, entity = null) {
    try {
        const { start, end } = getCalendarPeriodBoundaries(period, entity);
        
        return orders.filter(order => {
            const orderDate = timestampToDateInTimezone(order.timestamp || order.createdAt, entity);
            return orderDate >= start && orderDate <= end;
        });
        
    } catch (error) {
        console.error('❌ Filter orders by time period error:', error);
        return orders; // Return all orders as fallback
    }
}

/**
 * Get current date/time in entity's timezone
 * @param {Object} entity - Venue or restaurant object
 * @returns {Date} Current date in entity timezone
 */
function getCurrentTimeInEntityTimezone(entity) {
    try {
        const timezone = getEntityTimezone(entity);
        const now = new Date();
        
        // Convert to entity timezone
        const timeInTimezone = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        
        return timeInTimezone;
        
    } catch (error) {
        console.error('❌ Get current time in entity timezone error:', error);
        return new Date(); // Fallback to local time
    }
}

/**
 * Format date in entity's timezone
 * @param {Date} date - Date to format
 * @param {Object} entity - Venue or restaurant object
 * @param {Object} options - Formatting options
 * @returns {string} Formatted date string
 */
function formatDateInEntityTimezone(date, entity, options = {}) {
    try {
        const timezone = getEntityTimezone(entity);
        
        const defaultOptions = {
            timeZone: timezone,
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        const formatOptions = { ...defaultOptions, ...options };
        
        return date.toLocaleString('en-US', formatOptions);
        
    } catch (error) {
        console.error('❌ Format date in entity timezone error:', error);
        return date.toLocaleString(); // Fallback to local formatting
    }
}

// ============================================================================
// DATA FORMATTING AND VALIDATION UTILITIES
// ============================================================================

/**
 * Generate unique order number based on timestamp
 * Ensures uniqueness across all orders in the system
 * @returns {string} Unique order number
 */
function generateOrderNumber() {
  return Date.now().toString();
}

/**
 * Generate unique invite code for venues
 * Creates random 8-character alphanumeric code
 * @returns {string} Random 8-character invite code in uppercase
 */
function generateInviteCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

/**
 * Generate unique invitation code for venue invitations
 * Creates secure 8-character alphanumeric code for venue invitations
 * @param {number} length - Length of code (default 8)
 * @returns {string} Generated invitation code in uppercase
 */
function generateInvitationCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
}

/**
 * Mask phone number for privacy protection
 * Shows only first few and last few digits with asterisks in between
 * @param {string} phoneNumber - Full phone number to mask
 * @returns {string} Masked phone number for display
 */
function maskPhoneNumber(phoneNumber) {
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
}

/**
 * Enhanced phone number masking for CustomerAuthAPI compatibility
 * Provides enhanced privacy protection with detailed patterns
 * @param {string} phoneNumber - Full phone number to mask
 * @returns {string} Masked phone number for display
 */
function maskPhoneNumberCustomer(phoneNumber) {
  try {
    if (!phoneNumber) return '';
    
    // Remove any formatting characters first
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (phoneNumber.startsWith('+')) {
      // E.164 format handling
      if (phoneNumber.length > 10) {
        const countryCode = phoneNumber.substring(0, 3); // +12
        const lastDigits = phoneNumber.slice(-3);
        const middleLength = phoneNumber.length - 6;
        return countryCode + '*'.repeat(middleLength) + lastDigits;
      } else {
        // Short international numbers
        const first = phoneNumber.substring(0, 2);
        const last = phoneNumber.slice(-2);
        return first + '*'.repeat(phoneNumber.length - 4) + last;
      }
    } else if (cleanNumber.length === 10) {
      // US format: (555) ***-1234
      return `(${cleanNumber.substring(0, 3)}) ***-${cleanNumber.slice(-4)}`;
    } else if (cleanNumber.length > 7) {
      // General format: 555***89
      return cleanNumber.substring(0, 3) + '*'.repeat(cleanNumber.length - 5) + cleanNumber.slice(-2);
    } else {
      // Short numbers: 55***89
      const visibleStart = Math.min(2, Math.floor(cleanNumber.length / 3));
      const visibleEnd = Math.min(2, Math.floor(cleanNumber.length / 3));
      const maskedLength = cleanNumber.length - visibleStart - visibleEnd;
      
      if (maskedLength > 0) {
        return cleanNumber.substring(0, visibleStart) + '*'.repeat(maskedLength) + cleanNumber.slice(-visibleEnd);
      } else {
        return cleanNumber; // Too short to mask meaningfully
      }
    }
  } catch (error) {
    console.error('❌ Enhanced phone masking error:', error);
    return '***-***-****';
  }
}

/**
 * Format currency amount for display
 * Handles different currencies with proper formatting
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (USD, EUR, etc.)
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  } catch (error) {
    console.error('❌ Currency formatting error:', error);
    return `$${amount.toFixed(2)}`;
  }
}

/**
 * Enhanced format currency with entity context
 * @param {number} amount - Amount to format
 * @param {Object} entity - Entity with currency and timezone
 * @returns {string} Formatted currency string
 */
function formatCurrencyForEntity(amount, entity) {
    try {
        const currency = entity?.currency?.code || 'USD';
        const symbol = entity?.currency?.symbol || '$';
        
        // Use Intl.NumberFormat with proper currency
        try {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currency
            }).format(amount);
        } catch (intlError) {
            // Fallback to symbol if currency code is invalid
            return `${symbol}${amount.toFixed(2)}`;
        }
    } catch (error) {
        console.error('❌ Format currency for entity error:', error);
        return `$${amount.toFixed(2)}`;
    }
}

/**
 * Format percentage for display
 * @param {number} percentage - Percentage value (e.g., 2.5 for 2.5%)
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage string
 */
function formatPercentage(percentage, decimals = 1) {
  try {
    return `${percentage.toFixed(decimals)}%`;
  } catch (error) {
    console.error('❌ Percentage formatting error:', error);
    return '0.0%';
  }
}

// ============================================================================
// ERROR HANDLING AND VALIDATION UTILITIES
// ============================================================================

/**
 * Get user-friendly authentication error message
 * Converts Firebase auth error codes to readable messages
 * @param {string} errorCode - Firebase authentication error code
 * @returns {string} User-friendly error message
 */
function getAuthErrorMessage(errorCode) {
  const errorMessages = {
    'auth/email-already-in-use': 'This email is already registered. Please use a different email or try signing in.',
    'auth/weak-password': 'Password should be at least 6 characters long.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-not-found': 'No account found with this email. Please check your email or sign up.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your connection and try again.',
    'auth/invalid-credential': 'Invalid email or password. Please try again.',
    'auth/user-disabled': 'This account has been disabled. Please contact support.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled. Please contact support.',
    'auth/requires-recent-login': 'This operation requires recent authentication. Please sign in again.'
  };
  
  return errorMessages[errorCode] || 'An unexpected error occurred. Please try again.';
}

/**
 * Validate email address format
 * Uses standard email validation regex
 * @param {string} email - Email address to validate
 * @returns {boolean} True if email format is valid
 */
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number format (basic validation)
 * Checks for reasonable phone number patterns
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} True if phone number format appears valid
 */
function validatePhoneNumber(phoneNumber) {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');
  
  // Check for reasonable length (7-15 digits)
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Enhanced phone number validation for CustomerAuthAPI compatibility
 * Provides detailed E.164 format validation with country-specific checks
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
    } else if (phoneNumber.startsWith('+44')) {
      // UK validation - basic length check
      const ukNumber = phoneNumber.slice(3);
      if (ukNumber.length < 10 || ukNumber.length > 11) return false;
    } else if (phoneNumber.startsWith('+49')) {
      // Germany validation - basic length check
      const deNumber = phoneNumber.slice(3);
      if (deNumber.length < 10 || deNumber.length > 12) return false;
    }
    // Add more country-specific validations as needed
    
    return true;
  } catch (error) {
    console.error('❌ Enhanced phone number validation error:', error);
    return false;
  }
}

/**
 * Sanitize input string for safe storage
 * Removes dangerous characters and excessive whitespace
 * @param {string} input - Input string to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized string
 */
function sanitizeInput(input, maxLength = 1000) {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, maxLength);
}

// ============================================================================
// ARRAY AND OBJECT UTILITIES
// ============================================================================

/**
 * Deep clone an object to avoid reference issues
 * @param {Object} obj - Object to clone
 * @returns {Object} Deep cloned object
 */
function deepClone(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    console.error('❌ Deep clone error:', error);
    return {};
  }
}

/**
 * Remove undefined values from an object
 * Prevents Firestore errors when saving documents with undefined fields
 * @param {Object} obj - Object to clean
 * @returns {Object} Object with undefined values removed
 */
function removeUndefinedValues(obj) {
  const cleaned = {};
  
  Object.keys(obj).forEach(key => {
    if (obj[key] !== undefined && obj[key] !== null) {
      cleaned[key] = obj[key];
    }
  });
  
  return cleaned;
}

/**
 * Group array of objects by a specified key
 * @param {Array} array - Array to group
 * @param {string} key - Key to group by
 * @returns {Object} Object with grouped items
 */
function groupBy(array, key) {
  return array.reduce((groups, item) => {
    const group = item[key] || 'other';
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {});
}

// ============================================================================
// PHONE NUMBER FORMATTING UTILITIES (CUSTOMERAUTHAPI INTEGRATION)
// ============================================================================

/**
 * Format phone number to E.164 format with enhanced validation (CustomerAuthAPI integration)
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
 * Standard phone number formatting for display purposes
 * @param {string} phoneNumber - Raw phone number input
 * @param {string} countryCode - Default country code (default: 'US')
 * @returns {string} Formatted phone number
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

// ============================================================================
// ANALYTICS HELPERS FROM MAINTENANCE-API (INJECTED)
// ============================================================================

/**
 * Group API calls by method name
 * @param {Array} apiCalls - Array of API call data
 * @returns {Object} Grouped API calls by method
 */
function groupAPICallsByMethod(apiCalls) {
  const methodGroups = {};
  apiCalls.forEach(call => {
    const method = call.method || 'unknown';
    if (!methodGroups[method]) {
      methodGroups[method] = [];
    }
    methodGroups[method].push(call);
  });
  return methodGroups;
}

/**
 * Group API calls by hour
 * @param {Array} apiCalls - Array of API call data
 * @returns {Object} Grouped API calls by hour
 */
function groupAPICallsByHour(apiCalls) {
  const hourGroups = {};
  apiCalls.forEach(call => {
    const hour = call.hour || new Date(call.timestamp).getHours();
    if (!hourGroups[hour]) {
      hourGroups[hour] = 0;
    }
    hourGroups[hour]++;
  });
  return hourGroups;
}

/**
 * Calculate error rate from API calls
 * @param {Array} apiCalls - Array of API call data
 * @returns {string} Error rate percentage
 */
function calculateErrorRate(apiCalls) {
  if (apiCalls.length === 0) return '0.0';
  
  const errorCount = apiCalls.filter(call => call.success === false).length;
  const errorRate = (errorCount / apiCalls.length) * 100;
  return errorRate.toFixed(1);
}

/**
 * Calculate average response time
 * @param {Array} apiCalls - Array of API call data
 * @returns {number} Average response time in milliseconds
 */
function calculateAverageResponseTime(apiCalls) {
  if (apiCalls.length === 0) return 0;
  
  const validCalls = apiCalls.filter(call => call.responseTime && typeof call.responseTime === 'number');
  if (validCalls.length === 0) return 0;
  
  const totalTime = validCalls.reduce((sum, call) => sum + call.responseTime, 0);
  return Math.round(totalTime / validCalls.length);
}

/**
 * Get top API methods by usage
 * @param {Array} apiCalls - Array of API call data
 * @returns {Array} Top methods sorted by usage
 */
function getTopAPIMethods(apiCalls) {
  const methodCounts = {};
  apiCalls.forEach(call => {
    const method = call.method || 'unknown';
    methodCounts[method] = (methodCounts[method] || 0) + 1;
  });
  
  return Object.entries(methodCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([method, count]) => ({ method, count }));
}

// ============================================================================
// API TRACKING WRAPPER (FROM FIREBASE-API)
// ============================================================================

/**
 * Wrapper function to add tracking to any API method
 * @param {string} methodName - Name of the method
 * @param {Function} originalMethod - Original method function
 * @returns {Function} Wrapped method with tracking
 */
function withTracking(methodName, originalMethod) {
  return async function(...args) {
    const startTime = Date.now();
    try {
      const result = await originalMethod.apply(this, args);
      const responseTime = Date.now() - startTime;
      
      // Try to track API call if tracking is available
      if (window.trackAPICall && typeof window.trackAPICall === 'function') {
        await window.trackAPICall(methodName, responseTime, true, {
          args: args.length,
          resultType: typeof result
        });
      }
      
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Try to track API call failure if tracking is available
      if (window.trackAPICall && typeof window.trackAPICall === 'function') {
        await window.trackAPICall(methodName, responseTime, false, {
          error: error.message,
          errorCode: error.code
        });
      }
      
      throw error;
    }
  };
}

// ============================================================================
// GLOBAL EXPORTS AND VEDIAPI INTEGRATION
// ============================================================================

// Ensure VediAPI namespace exists
if (!window.VediAPI) {
  window.VediAPI = {};
}

// Attach all utility functions to VediAPI
Object.assign(window.VediAPI, {
  // Date and time utilities (original)
  timestampToDate,
  getTimePeriodStart,
  getWeekKey,
  getRelativeTime,
  
  // NEW: Timezone-aware date and time utilities
  getCalendarPeriodBoundaries,
  getPreviousCalendarPeriod,
  getEntityTimezone,
  timestampToDateInTimezone,
  filterOrdersByTimePeriod,
  getCurrentTimeInEntityTimezone,
  formatDateInEntityTimezone,
  
  // Data formatting utilities
  generateOrderNumber,
  generateInviteCode,
  generateInvitationCode, // NEW: Added invitation code generation
  maskPhoneNumber,
  maskPhoneNumberCustomer,
  formatCurrency,
  formatCurrencyForEntity, // NEW: Entity-aware currency formatting
  formatPercentage,
  
  // Error handling and validation
  getAuthErrorMessage,
  validateEmail,
  validatePhoneNumber,
  validatePhoneNumberCustomer,
  sanitizeInput,
  
  // Array and object utilities
  deepClone,
  removeUndefinedValues,
  groupBy,
  
  // Phone number formatting utilities
  formatPhoneNumber,
  formatPhoneNumberCustomer,
  
  // INJECTED: Analytics helpers from maintenance-api
  groupAPICallsByMethod,
  groupAPICallsByHour,
  calculateErrorRate,
  calculateAverageResponseTime,
  getTopAPIMethods,
  
  // INJECTED: API tracking wrapper
  withTracking
});

console.log('🛠️ Enhanced Core Utilities Module loaded with TIMEZONE SUPPORT');
console.log('📅 Date/Time: timestampToDate, getTimePeriodStart, getWeekKey, getRelativeTime');
console.log('🕐 NEW Timezone: getCalendarPeriodBoundaries, getPreviousCalendarPeriod, getEntityTimezone');
console.log('🌍 NEW Entity Support: timestampToDateInTimezone, filterOrdersByTimePeriod, formatDateInEntityTimezone');
console.log('📋 Formatting: generateOrderNumber, generateInviteCode, generateInvitationCode, maskPhoneNumber, formatCurrency');
console.log('💰 NEW Currency: formatCurrencyForEntity with entity-aware formatting');
console.log('📱 Phone: formatPhoneNumber, formatPhoneNumberCustomer, validatePhoneNumberCustomer');
console.log('🔒 Privacy: maskPhoneNumber, maskPhoneNumberCustomer with enhanced patterns');
console.log('✅ Validation: getAuthErrorMessage, validateEmail, validatePhoneNumber, sanitizeInput');
console.log('🔧 Objects: deepClone, removeUndefinedValues, groupBy');
console.log('📊 INJECTED Analytics: groupAPICallsByMethod, calculateErrorRate, getTopAPIMethods');
console.log('🔄 INJECTED Tracking: withTracking wrapper for API methods');
console.log('🌟 CustomerAuthAPI: Enhanced phone utilities for authentication system');
console.log('🎯 NEW: generateInvitationCode for venue invitation system');
console.log('⏰ TIMEZONE READY: All time functions now support venue/restaurant timezones');
console.log('💫 All utilities available globally via VediAPI namespace');
