/**
 * VediAPI Timezone Management
 * Handles timezone operations for venues and restaurants
 * Manages inheritance patterns and sync operations
 */

// Initialize timezone API
const TimezoneAPI = {
    // Common timezone options
    COMMON_TIMEZONES: [
        { value: 'America/New_York', label: 'Eastern Time (ET)', offset: 'UTC-5/-4' },
        { value: 'America/Chicago', label: 'Central Time (CT)', offset: 'UTC-6/-5' },
        { value: 'America/Denver', label: 'Mountain Time (MT)', offset: 'UTC-7/-6' },
        { value: 'America/Los_Angeles', label: 'Pacific Time (PT)', offset: 'UTC-8/-7' },
        { value: 'America/Phoenix', label: 'Arizona Time (MST)', offset: 'UTC-7' },
        { value: 'America/Anchorage', label: 'Alaska Time (AKST)', offset: 'UTC-9/-8' },
        { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)', offset: 'UTC-10' },
        { value: 'America/Toronto', label: 'Eastern Time - Canada', offset: 'UTC-5/-4' },
        { value: 'America/Vancouver', label: 'Pacific Time - Canada', offset: 'UTC-8/-7' },
        { value: 'Europe/London', label: 'London Time (GMT/BST)', offset: 'UTC+0/+1' },
        { value: 'Europe/Paris', label: 'Central European Time', offset: 'UTC+1/+2' },
        { value: 'Asia/Tokyo', label: 'Japan Standard Time', offset: 'UTC+9' },
        { value: 'Australia/Sydney', label: 'Australian Eastern Time', offset: 'UTC+10/+11' },
        { value: 'UTC', label: 'Coordinated Universal Time (UTC)', offset: 'UTC+0' }
    ],

    // Default timezone fallback
    DEFAULT_TIMEZONE: 'UTC'
};

// ============================================================================
// VENUE TIMEZONE OPERATIONS
// ============================================================================

/**
 * Update venue timezone
 * @param {string} venueId - Venue ID
 * @param {string} timezone - New timezone (e.g., 'America/New_York')
 * @returns {Promise<Object>} Update result
 */
TimezoneAPI.updateVenueTimezone = async function(venueId, timezone) {
    try {
        console.log(`🕐 Updating venue ${venueId} timezone to ${timezone}`);
        
        // Validate timezone
        if (!TimezoneAPI.isValidTimezone(timezone)) {
            throw new Error(`Invalid timezone: ${timezone}`);
        }
        
        const db = getFirebaseDb();
        const venueRef = db.collection('venues').doc(venueId);
        
        // Get current venue data
        const venueDoc = await venueRef.get();
        if (!venueDoc.exists) {
            throw new Error(`Venue ${venueId} not found`);
        }
        
        const venueData = venueDoc.data();
        const previousTimezone = venueData.timezone || TimezoneAPI.DEFAULT_TIMEZONE;
        
        // Update venue timezone
        const updateData = {
            timezone: timezone,
            previousTimezone: previousTimezone,
            timezoneUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await venueRef.update(updateData);
        
        // Sync all restaurants in venue to new timezone
        await TimezoneAPI.syncVenueTimezoneToRestaurants(venueId, timezone, previousTimezone);
        
        console.log(`✅ Venue timezone updated: ${previousTimezone} → ${timezone}`);
        
        return {
            success: true,
            venueId: venueId,
            newTimezone: timezone,
            previousTimezone: previousTimezone,
            restaurantsUpdated: true
        };
        
    } catch (error) {
        console.error('❌ Update venue timezone error:', error);
        throw error;
    }
};

/**
 * Sync venue timezone to all restaurants in venue
 * @param {string} venueId - Venue ID
 * @param {string} newTimezone - New timezone to apply
 * @param {string} previousTimezone - Previous timezone for logging
 * @returns {Promise<Object>} Sync result
 */
TimezoneAPI.syncVenueTimezoneToRestaurants = async function(venueId, newTimezone, previousTimezone = null) {
    try {
        console.log(`🔄 Syncing timezone ${newTimezone} to all restaurants in venue ${venueId}`);
        
        const db = getFirebaseDb();
        
        // Get all restaurants in venue
        const restaurantsQuery = await db.collection('restaurants')
            .where('venueId', '==', venueId)
            .get();
        
        if (restaurantsQuery.empty) {
            console.log('ℹ️ No restaurants found in venue for timezone sync');
            return { success: true, restaurantsUpdated: 0 };
        }
        
        // Update each restaurant
        const updatePromises = restaurantsQuery.docs.map(async (doc) => {
            const restaurantId = doc.id;
            const restaurantData = doc.data();
            
            const updateData = {
                timezone: newTimezone,
                venueTimezone: newTimezone,
                timezoneSource: 'venue',
                previousTimezone: restaurantData.timezone || previousTimezone,
                timezoneUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            console.log(`📍 Updating restaurant ${restaurantId} timezone to ${newTimezone}`);
            return db.collection('restaurants').doc(restaurantId).update(updateData);
        });
        
        await Promise.all(updatePromises);
        
        const restaurantCount = restaurantsQuery.docs.length;
        console.log(`✅ Updated ${restaurantCount} restaurants to timezone ${newTimezone}`);
        
        return {
            success: true,
            restaurantsUpdated: restaurantCount,
            venueId: venueId,
            newTimezone: newTimezone
        };
        
    } catch (error) {
        console.error('❌ Sync venue timezone to restaurants error:', error);
        throw error;
    }
};

// ============================================================================
// RESTAURANT TIMEZONE OPERATIONS
// ============================================================================

/**
 * Update restaurant timezone (only if not in venue)
 * @param {string} restaurantId - Restaurant ID
 * @param {string} timezone - New timezone
 * @returns {Promise<Object>} Update result
 */
TimezoneAPI.updateRestaurantTimezone = async function(restaurantId, timezone) {
    try {
        console.log(`🕐 Updating restaurant ${restaurantId} timezone to ${timezone}`);
        
        // Validate timezone
        if (!TimezoneAPI.isValidTimezone(timezone)) {
            throw new Error(`Invalid timezone: ${timezone}`);
        }
        
        const db = getFirebaseDb();
        const restaurantRef = db.collection('restaurants').doc(restaurantId);
        
        // Get current restaurant data
        const restaurantDoc = await restaurantRef.get();
        if (!restaurantDoc.exists) {
            throw new Error(`Restaurant ${restaurantId} not found`);
        }
        
        const restaurantData = restaurantDoc.data();
        
        // Check if restaurant is in a venue
        if (restaurantData.venueId) {
            throw new Error('Cannot update timezone: Restaurant is managed by venue. Contact venue manager to change timezone.');
        }
        
        const previousTimezone = restaurantData.timezone || TimezoneAPI.DEFAULT_TIMEZONE;
        
        // Update restaurant timezone
        const updateData = {
            timezone: timezone,
            timezoneSource: 'restaurant',
            previousTimezone: previousTimezone,
            timezoneUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await restaurantRef.update(updateData);
        
        console.log(`✅ Restaurant timezone updated: ${previousTimezone} → ${timezone}`);
        
        return {
            success: true,
            restaurantId: restaurantId,
            newTimezone: timezone,
            previousTimezone: previousTimezone
        };
        
    } catch (error) {
        console.error('❌ Update restaurant timezone error:', error);
        throw error;
    }
};

/**
 * Get restaurant's effective timezone (venue timezone if in venue, own timezone if independent)
 * @param {Object} restaurant - Restaurant data object
 * @returns {string} Effective timezone
 */
TimezoneAPI.getRestaurantEffectiveTimezone = function(restaurant) {
    try {
        // If restaurant is in venue, use venue timezone
        if (restaurant.venueId && restaurant.venueTimezone) {
            return restaurant.venueTimezone;
        }
        
        // If restaurant is in venue but no venue timezone set, use restaurant timezone
        if (restaurant.venueId && restaurant.timezone) {
            return restaurant.timezone;
        }
        
        // Independent restaurant uses own timezone
        if (restaurant.timezone) {
            return restaurant.timezone;
        }
        
        // Fallback to default
        console.warn(`⚠️ No timezone found for restaurant ${restaurant.id}, using default: ${TimezoneAPI.DEFAULT_TIMEZONE}`);
        return TimezoneAPI.DEFAULT_TIMEZONE;
        
    } catch (error) {
        console.error('❌ Get restaurant effective timezone error:', error);
        return TimezoneAPI.DEFAULT_TIMEZONE;
    }
};

/**
 * Sync restaurant timezone to venue when joining
 * @param {string} restaurantId - Restaurant ID
 * @param {string} venueId - Venue ID to join
 * @returns {Promise<Object>} Sync result
 */
TimezoneAPI.syncRestaurantTimezoneToVenue = async function(restaurantId, venueId) {
    try {
        console.log(`🔗 Syncing restaurant ${restaurantId} timezone to venue ${venueId}`);
        
        const db = getFirebaseDb();
        
        // Get venue timezone
        const venueDoc = await db.collection('venues').doc(venueId).get();
        if (!venueDoc.exists) {
            throw new Error(`Venue ${venueId} not found`);
        }
        
        const venueData = venueDoc.data();
        const venueTimezone = venueData.timezone || TimezoneAPI.DEFAULT_TIMEZONE;
        
        // Get restaurant data
        const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
        if (!restaurantDoc.exists) {
            throw new Error(`Restaurant ${restaurantId} not found`);
        }
        
        const restaurantData = restaurantDoc.data();
        const previousTimezone = restaurantData.timezone || TimezoneAPI.DEFAULT_TIMEZONE;
        
        // Update restaurant with venue timezone
        const updateData = {
            timezone: venueTimezone,
            venueTimezone: venueTimezone,
            timezoneSource: 'venue',
            previousIndependentTimezone: previousTimezone, // Store original timezone
            timezoneUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('restaurants').doc(restaurantId).update(updateData);
        
        console.log(`✅ Restaurant timezone synced to venue: ${previousTimezone} → ${venueTimezone}`);
        
        return {
            success: true,
            restaurantId: restaurantId,
            venueId: venueId,
            newTimezone: venueTimezone,
            previousTimezone: previousTimezone
        };
        
    } catch (error) {
        console.error('❌ Sync restaurant timezone to venue error:', error);
        throw error;
    }
};

/**
 * Remove restaurant from venue timezone management (when leaving venue)
 * @param {string} restaurantId - Restaurant ID
 * @returns {Promise<Object>} Update result
 */
TimezoneAPI.removeRestaurantFromVenueTimezone = async function(restaurantId) {
    try {
        console.log(`🔓 Removing restaurant ${restaurantId} from venue timezone management`);
        
        const db = getFirebaseDb();
        const restaurantRef = db.collection('restaurants').doc(restaurantId);
        
        // Get current restaurant data
        const restaurantDoc = await restaurantRef.get();
        if (!restaurantDoc.exists) {
            throw new Error(`Restaurant ${restaurantId} not found`);
        }
        
        const restaurantData = restaurantDoc.data();
        
        // Restore previous independent timezone or use default
        const restoredTimezone = restaurantData.previousIndependentTimezone || 
                                restaurantData.timezone || 
                                TimezoneAPI.DEFAULT_TIMEZONE;
        
        // Update restaurant to remove venue timezone management
        const updateData = {
            timezone: restoredTimezone,
            timezoneSource: 'restaurant',
            venueTimezone: firebase.firestore.FieldValue.delete(),
            previousIndependentTimezone: firebase.firestore.FieldValue.delete(),
            timezoneUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await restaurantRef.update(updateData);
        
        console.log(`✅ Restaurant timezone management removed, restored to: ${restoredTimezone}`);
        
        return {
            success: true,
            restaurantId: restaurantId,
            restoredTimezone: restoredTimezone
        };
        
    } catch (error) {
        console.error('❌ Remove restaurant from venue timezone error:', error);
        throw error;
    }
};

// ============================================================================
// UNIVERSAL TIMEZONE OPERATIONS
// ============================================================================

/**
 * Get timezone for any entity (venue or restaurant)
 * @param {Object} entity - Venue or restaurant data object
 * @returns {string} Entity's effective timezone
 */
TimezoneAPI.getEntityTimezone = function(entity) {
    try {
        if (!entity) {
            console.warn('⚠️ No entity provided, using default timezone');
            return TimezoneAPI.DEFAULT_TIMEZONE;
        }
        
        // If it's a venue, return venue timezone
        if (entity.managerUserId || entity.maxRestaurants) { // Venue indicators
            return entity.timezone || TimezoneAPI.DEFAULT_TIMEZONE;
        }
        
        // If it's a restaurant, use effective timezone logic
        if (entity.ownerId || entity.restaurantType) { // Restaurant indicators
            return TimezoneAPI.getRestaurantEffectiveTimezone(entity);
        }
        
        // Fallback: check for timezone property
        return entity.timezone || TimezoneAPI.DEFAULT_TIMEZONE;
        
    } catch (error) {
        console.error('❌ Get entity timezone error:', error);
        return TimezoneAPI.DEFAULT_TIMEZONE;
    }
};

/**
 * Get timezone information object
 * @param {string} timezone - Timezone string
 * @returns {Object} Timezone info with label, offset, etc.
 */
TimezoneAPI.getTimezoneInfo = function(timezone) {
    const timezoneInfo = TimezoneAPI.COMMON_TIMEZONES.find(tz => tz.value === timezone);
    
    if (timezoneInfo) {
        return timezoneInfo;
    }
    
    // Return basic info for unknown timezones
    return {
        value: timezone,
        label: timezone.replace(/_/g, ' ').replace('/', ' - '),
        offset: 'Unknown'
    };
};

/**
 * Validate timezone string
 * @param {string} timezone - Timezone to validate
 * @returns {boolean} True if valid
 */
TimezoneAPI.isValidTimezone = function(timezone) {
    try {
        // Try to create a date in the timezone
        new Date().toLocaleString('en-US', { timeZone: timezone });
        return true;
    } catch (error) {
        return false;
    }
};

/**
 * Get current date/time in entity's timezone
 * @param {Object} entity - Venue or restaurant object
 * @returns {Date} Current date in entity timezone
 */
TimezoneAPI.getCurrentTimeInEntityTimezone = function(entity) {
    try {
        const timezone = TimezoneAPI.getEntityTimezone(entity);
        const now = new Date();
        
        // Convert to entity timezone
        const timeInTimezone = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        
        return timeInTimezone;
        
    } catch (error) {
        console.error('❌ Get current time in entity timezone error:', error);
        return new Date(); // Fallback to local time
    }
};

/**
 * Format date in entity's timezone
 * @param {Date} date - Date to format
 * @param {Object} entity - Venue or restaurant object
 * @param {Object} options - Formatting options
 * @returns {string} Formatted date string
 */
TimezoneAPI.formatDateInEntityTimezone = function(date, entity, options = {}) {
    try {
        const timezone = TimezoneAPI.getEntityTimezone(entity);
        
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
};

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

/**
 * Batch update multiple restaurants to venue timezone
 * @param {Array} restaurantIds - Array of restaurant IDs
 * @param {string} venueId - Venue ID
 * @returns {Promise<Object>} Batch update result
 */
TimezoneAPI.batchSyncRestaurantsToVenue = async function(restaurantIds, venueId) {
    try {
        console.log(`🔄 Batch syncing ${restaurantIds.length} restaurants to venue ${venueId}`);
        
        const results = await Promise.allSettled(
            restaurantIds.map(restaurantId => 
                TimezoneAPI.syncRestaurantTimezoneToVenue(restaurantId, venueId)
            )
        );
        
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        
        console.log(`✅ Batch sync complete: ${successful} success, ${failed} failed`);
        
        return {
            success: true,
            total: restaurantIds.length,
            successful: successful,
            failed: failed,
            results: results
        };
        
    } catch (error) {
        console.error('❌ Batch sync restaurants error:', error);
        throw error;
    }
};

// ============================================================================
// UTILITIES.JS ENHANCED FUNCTIONS
// ============================================================================

/**
 * Enhanced get time period start with timezone support
 * Wrapper for existing getTimePeriodStart that adds timezone awareness
 * @param {string} timePeriod - Time period string
 * @param {Object} entity - Entity with timezone (optional)
 * @returns {Date} Start date in entity's timezone
 */
TimezoneAPI.getTimePeriodStartInTimezone = function(timePeriod, entity = null) {
    try {
        if (entity) {
            // Use calendar-based periods with timezone
            const { start } = TimezoneAPI.getCalendarPeriodBoundaries(timePeriod, entity);
            return start;
        } else {
            // Fallback to original getTimePeriodStart logic
            const now = new Date();
            
            switch (timePeriod.toLowerCase()) {
                case 'today':
                    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
                case 'week':
                case 'thisweek':
                    const weekStart = new Date(now);
                    weekStart.setDate(now.getDate() - 7);
                    return weekStart;
                case 'month':
                case 'thismonth':
                    return new Date(now.getFullYear(), now.getMonth(), 1);
                case 'quarter':
                case 'thisquarter':
                    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
                    return new Date(now.getFullYear(), quarterMonth, 1);
                case 'year':
                case 'thisyear':
                    return new Date(now.getFullYear(), 0, 1);
                default:
                    console.warn('⚠️ Invalid time period:', timePeriod);
                    return null;
            }
        }
    } catch (error) {
        console.error('❌ Get time period start in timezone error:', error);
        return new Date();
    }
};

/**
 * Get week key in entity's timezone
 * @param {Date} date - Date to get week key for
 * @param {Object} entity - Entity with timezone
 * @returns {string} Week key in YYYY-WNN format
 */
TimezoneAPI.getWeekKeyInTimezone = function(date, entity) {
    try {
        let targetDate = date;
        
        if (entity) {
            const timezone = TimezoneAPI.getEntityTimezone(entity);
            targetDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
        }
        
        const startOfYear = new Date(targetDate.getFullYear(), 0, 1);
        const weekNumber = Math.ceil(((targetDate - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
        return `${targetDate.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
        
    } catch (error) {
        console.error('❌ Error generating week key in timezone:', error);
        return `${new Date().getFullYear()}-W01`;
    }
};

/**
 * Get relative time in entity's timezone
 * @param {Object|Date} timestamp - Firebase timestamp or Date object
 * @param {Object} entity - Entity with timezone
 * @returns {string} Relative time description
 */
TimezoneAPI.getRelativeTimeInTimezone = function(timestamp, entity = null) {
    try {
        const date = TimezoneAPI.timestampToDateInTimezone(timestamp, entity);
        const now = entity ? TimezoneAPI.getCurrentTimeInEntityTimezone(entity) : new Date();
        
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        
        return TimezoneAPI.formatDateInEntityTimezone(date, entity, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        
    } catch (error) {
        console.error('❌ Error calculating relative time in timezone:', error);
        return 'Unknown time';
    }
};

// ============================================================================
// UTILITIES.JS INTEGRATION FUNCTIONS
// ============================================================================

/**
 * Get calendar period boundaries in entity's timezone
 * Updated version of getTimePeriodStart to support calendar-based periods and timezones
 * @param {string} period - Period type ('today', 'thisWeek', 'thisMonth', 'thisQuarter', 'thisYear')
 * @param {Object} entity - Entity (venue or restaurant) with timezone
 * @returns {Object} Object with start and end dates in entity's timezone
 */
TimezoneAPI.getCalendarPeriodBoundaries = function(period, entity) {
    try {
        const timezone = TimezoneAPI.getEntityTimezone(entity);
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
            timezone: TimezoneAPI.DEFAULT_TIMEZONE 
        };
    }
};

/**
 * Get previous calendar period for comparison
 * @param {string} period - Period type
 * @param {Object} entity - Entity with timezone
 * @returns {Object} Previous period boundaries
 */
TimezoneAPI.getPreviousCalendarPeriod = function(period, entity) {
    try {
        const timezone = TimezoneAPI.getEntityTimezone(entity);
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
            timezone: TimezoneAPI.DEFAULT_TIMEZONE 
        };
    }
};

/**
 * Convert timestamp to date in entity's timezone
 * Updated version of timestampToDate with timezone support
 * @param {Object|number|string} timestamp - Firebase timestamp or regular timestamp
 * @param {Object} entity - Entity with timezone (optional)
 * @returns {Date} Date object in entity's timezone
 */
TimezoneAPI.timestampToDateInTimezone = function(timestamp, entity = null) {
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
            const timezone = TimezoneAPI.getEntityTimezone(entity);
            return new Date(date.toLocaleString('en-US', { timeZone: timezone }));
        }
        
        return date;
        
    } catch (error) {
        console.error('❌ Error converting timestamp to timezone:', error);
        return new Date(); // Return current date as fallback
    }
};

/**
 * Filter orders by calendar time period in entity's timezone
 * @param {Array} orders - Array of order objects
 * @param {string} period - Time period
 * @param {Object} entity - Entity with timezone
 * @returns {Array} Filtered orders
 */
TimezoneAPI.filterOrdersByTimePeriod = function(orders, period, entity) {
    try {
        const { start, end } = TimezoneAPI.getCalendarPeriodBoundaries(period, entity);
        
        return orders.filter(order => {
            const orderDate = TimezoneAPI.timestampToDateInTimezone(order.timestamp || order.createdAt, entity);
            return orderDate >= start && orderDate <= end;
        });
        
    } catch (error) {
        console.error('❌ Filter orders by time period error:', error);
        return orders; // Return all orders as fallback
    }
};

/**
 * Get Firebase database instance
 * @returns {Object} Firestore database instance
 */
function getFirebaseDb() {
    if (typeof window !== 'undefined' && window.firebaseDb) {
        return window.firebaseDb;
    }
    if (typeof firebase !== 'undefined' && firebase.firestore) {
        return firebase.firestore();
    }
    throw new Error('Firebase not available');
}

// ============================================================================
// EXPORT/INITIALIZATION
// ============================================================================

// Make TimezoneAPI available globally
if (typeof window !== 'undefined') {
    window.TimezoneAPI = TimezoneAPI;
}

// Export for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TimezoneAPI;
}

console.log('🕐 TimezoneAPI initialized - Time functions only');
