// api/orders/order-tracking.js - Order Tracking
/**
 * Order Tracking Module
 * 
 * Handles order tracking, customer order queries, active order management,
 * and order filtering logic for customer-facing features.
 */

// ============================================================================
// CORE ORDER MANAGEMENT
// ============================================================================

/**
 * Get orders for a restaurant with filtering options
 * @param {string} restaurantId - Restaurant ID
 * @param {Object} options - Query options (limit, orderBy, startDate, endDate, status, etc.)
 * @returns {Promise<Array>} Array of orders
 */
async function getOrders(restaurantId, options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('getOrders');
  
  try {
    const db = getFirebaseDb();
    
    let query = db.collection('orders').where('restaurantId', '==', restaurantId);
    
    // Apply status filter
    if (options.status) {
      query = query.where('status', '==', options.status);
    }
    
    // Apply date filters
    if (options.startDate) {
      query = query.where('createdAt', '>=', options.startDate);
    }
    
    if (options.endDate) {
      query = query.where('createdAt', '<=', options.endDate);
    }
    
    // Apply ordering
    if (options.orderBy) {
      query = query.orderBy(options.orderBy, options.orderDirection || 'desc');
    } else {
      query = query.orderBy('createdAt', 'desc');
    }
    
    // Apply limit
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    // Apply pagination
    if (options.startAfter) {
      query = query.startAfter(options.startAfter);
    }
    
    const querySnapshot = await query.get();
    const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    await endTracking(true);
    
    console.log('✅ Retrieved orders:', orders.length, 'for restaurant:', restaurantId);
    return orders;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getOrders', { restaurantId, options });
    
    console.error('❌ Get orders error:', error);
    throw error;
  }
}

/**
 * Get order by ID
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>} Order data
 */
async function getOrder(orderId) {
  const endTracking = VediAPI.startPerformanceMeasurement('getOrder');
  
  try {
    const db = getFirebaseDb();
    
    const doc = await db.collection('orders').doc(orderId).get();
    
    if (!doc.exists) {
      throw new Error('Order not found');
    }
    
    const order = { id: doc.id, ...doc.data() };
    
    await endTracking(true);
    
    console.log('✅ Order retrieved:', orderId);
    return order;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getOrder', { orderId });
    
    console.error('❌ Get order error:', error);
    throw error;
  }
}

// ============================================================================
// CUSTOMER ORDER TRACKING
// ============================================================================

/**
 * Get orders by customer phone
 * @param {string} customerPhone - Customer phone number
 * @returns {Promise<Array>} Array of customer orders
 */
async function getOrdersByCustomer(customerPhone) {
  const endTracking = VediAPI.startPerformanceMeasurement('getOrdersByCustomer');
  
  try {
    const db = getFirebaseDb();
    
    const querySnapshot = await db.collection('orders')
      .where('customerPhone', '==', customerPhone)
      .orderBy('createdAt', 'desc')
      .get();
    
    const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    await endTracking(true);
    return orders;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getOrdersByCustomer', { 
      customerPhone: VediAPI.maskPhoneNumber(customerPhone) 
    });
    
    console.error('❌ Get orders by customer error:', error);
    throw error;
  }
}

/**
 * Get orders by customer UID (for authenticated customers)
 * @param {string} customerUID - Customer Firebase UID
 * @returns {Promise<Array>} Array of customer orders
 */
async function getOrdersByCustomerUID(customerUID) {
  const endTracking = VediAPI.startPerformanceMeasurement('getOrdersByCustomerUID');
  
  try {
    const db = getFirebaseDb();
    
    const querySnapshot = await db.collection('orders')
      .where('customerUID', '==', customerUID)
      .orderBy('createdAt', 'desc')
      .get();
    
    const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    await endTracking(true);
    return orders;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getOrdersByCustomerUID', { customerUID });
    
    console.error('❌ Get orders by customer UID error:', error);
    throw error;
  }
}

/**
 * Get customer profiles for a restaurant
 * @param {string} restaurantId - Restaurant ID
 * @param {Object} options - Query options (limit, orderBy, etc.)
 * @returns {Promise<Array>} Array of customer profiles
 */
async function getCustomerProfiles(restaurantId, options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('getCustomerProfiles');
  
  try {
    const db = getFirebaseDb();
    
    // Note: Customer profiles are stored globally but we can filter by orders
    // First approach: get all customer profiles that have placed orders at this restaurant
    const orders = await getOrders(restaurantId, { limit: 1000 });
    const customerUIDs = [...new Set(orders.map(order => order.customerUID).filter(uid => uid))];
    const customerPhones = [...new Set(orders.map(order => order.customerPhone).filter(phone => phone))];
    const customerEmails = [...new Set(orders.map(order => order.customerEmail).filter(email => email))];
    
    console.log('🔍 Found unique customer identifiers:', {
      uids: customerUIDs.length,
      phones: customerPhones.length, 
      emails: customerEmails.length
    });
    
    let customerProfiles = [];
    
    // Get profiles by UID (most reliable)
    if (customerUIDs.length > 0) {
      // Firebase 'in' queries are limited to 10 items, so we need to batch
      const batchSize = 10;
      for (let i = 0; i < customerUIDs.length; i += batchSize) {
        const batch = customerUIDs.slice(i, i + batchSize);
        
        // Try to find by uid field first
        try {
          const querySnapshot = await db.collection('customerProfiles')
            .where('uid', 'in', batch)
            .get();
          
          const batchProfiles = querySnapshot.docs.map(doc => ({ 
            id: doc.id, 
            uid: doc.data().uid || doc.id, // Use doc.id as uid if uid field is missing
            ...doc.data() 
          }));
          customerProfiles.push(...batchProfiles);
        } catch (error) {
          console.log('🔧 No uid field found, trying document IDs as UIDs');
        }
        
        // If no profiles found by uid field, try document IDs directly
        if (customerProfiles.length === 0) {
          for (const uid of batch) {
            try {
              const doc = await db.collection('customerProfiles').doc(uid).get();
              if (doc.exists) {
                customerProfiles.push({ 
                  id: doc.id, 
                  uid: doc.id, // Document ID is the UID
                  ...doc.data() 
                });
              }
            } catch (error) {
              console.warn('⚠️ Could not fetch profile for UID:', uid);
            }
          }
        }
      }
    }
    
    // If we didn't get enough profiles via UID, try phone numbers
    if (customerProfiles.length < customerPhones.length && customerPhones.length > 0) {
      const foundUIDs = new Set(customerProfiles.map(profile => profile.uid));
      const remainingPhones = customerPhones.filter(phone => {
        // Check if we already have a profile for an order with this phone
        const orderWithPhone = orders.find(order => order.customerPhone === phone);
        return orderWithPhone && !foundUIDs.has(orderWithPhone.customerUID);
      });
      
      if (remainingPhones.length > 0) {
        const batchSize = 10;
        for (let i = 0; i < remainingPhones.length; i += batchSize) {
          const batch = remainingPhones.slice(i, i + batchSize);
          try {
            const querySnapshot = await db.collection('customerProfiles')
              .where('phone', 'in', batch)
              .get();
            
            const batchProfiles = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            customerProfiles.push(...batchProfiles);
          } catch (phoneError) {
            console.warn('⚠️ Could not query by phone numbers:', phoneError.message);
          }
        }
      }
    }
    
    // Remove duplicates by UID or ID
    const uniqueProfiles = customerProfiles.reduce((acc, profile) => {
      const key = profile.uid || profile.id;
      if (!acc.has(key)) {
        acc.set(key, profile);
      }
      return acc;
    }, new Map());
    
    const finalProfiles = Array.from(uniqueProfiles.values());
    
    // Apply ordering
    if (options.orderBy) {
      finalProfiles.sort((a, b) => {
        const aVal = a[options.orderBy];
        const bVal = b[options.orderBy];
        
        if (options.orderDirection === 'asc') {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });
    }
    
    // Apply limit
    const limitedProfiles = options.limit ? finalProfiles.slice(0, options.limit) : finalProfiles;
    
    await endTracking(true);
    
    console.log('✅ Retrieved customer profiles:', limitedProfiles.length, 'for restaurant:', restaurantId);
    return limitedProfiles;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getCustomerProfiles', { restaurantId, options });
    
    console.error('❌ Get customer profiles error:', error);
    throw error;
  }
}

/**
 * Get customer's most recent active order
 * @param {string} customerPhone - Customer phone number
 * @returns {Promise<Object|null>} Most recent active order or null
 */
async function getMostRecentActiveOrder(customerPhone) {
  const endTracking = VediAPI.startPerformanceMeasurement('getMostRecentActiveOrder');
  
  try {
    const orders = await getOrdersByCustomer(customerPhone);
    const activeOrders = orders.filter(order => 
      order.status === 'pending' || 
      order.status === 'preparing' || 
      order.status === 'ready'
    );
    
    if (activeOrders.length > 0) {
      // Sort by creation date and return most recent
      activeOrders.sort((a, b) => {
        const dateA = VediAPI.timestampToDate(a.createdAt);
        const dateB = VediAPI.timestampToDate(b.createdAt);
        return dateB - dateA;
      });
      
      await endTracking(true);
      console.log('✅ Most recent active order found:', activeOrders[0].orderNumber);
      return activeOrders[0];
    }
    
    await endTracking(true);
    console.log('ℹ️ No active orders found for customer');
    return null;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getMostRecentActiveOrder', { 
      customerPhone: VediAPI.maskPhoneNumber(customerPhone) 
    });
    
    console.error('❌ Get most recent active order error:', error);
    throw error;
  }
}

/**
 * Get customer's most recent active order by UID (for authenticated customers)
 * @param {string} customerUID - Customer Firebase UID
 * @returns {Promise<Object|null>} Most recent active order or null
 */
async function getMostRecentActiveOrderByUID(customerUID) {
  const endTracking = VediAPI.startPerformanceMeasurement('getMostRecentActiveOrderByUID');
  
  try {
    const orders = await getOrdersByCustomerUID(customerUID);
    const activeOrders = orders.filter(order => 
      order.status === 'pending' || 
      order.status === 'preparing' || 
      order.status === 'ready'
    );
    
    if (activeOrders.length > 0) {
      // Sort by creation date and return most recent
      activeOrders.sort((a, b) => {
        const dateA = VediAPI.timestampToDate(a.createdAt);
        const dateB = VediAPI.timestampToDate(b.createdAt);
        return dateB - dateA;
      });
      
      await endTracking(true);
      console.log('✅ Most recent active order found by UID:', activeOrders[0].orderNumber);
      return activeOrders[0];
    }
    
    await endTracking(true);
    console.log('ℹ️ No active orders found for customer UID');
    return null;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getMostRecentActiveOrderByUID', { customerUID });
    
    console.error('❌ Get most recent active order by UID error:', error);
    throw error;
  }
}

/**
 * Get today's orders for a restaurant
 * @param {string} restaurantId - Restaurant ID
 * @returns {Promise<Array>} Today's orders
 */
async function getTodaysOrders(restaurantId) {
  const endTracking = VediAPI.startPerformanceMeasurement('getTodaysOrders');
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const orders = await getOrders(restaurantId, {
      startDate: today,
      orderBy: 'createdAt',
      orderDirection: 'desc'
    });
    
    await endTracking(true);
    
    console.log('✅ Retrieved today\'s orders:', orders.length, 'orders');
    return orders;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getTodaysOrders', { restaurantId });
    
    console.error('❌ Get today\'s orders error:', error);
    throw error;
  }
}

// ============================================================================
// ORDER ANALYTICS AND FILTERING
// ============================================================================

/**
 * Get orders for a specific date range
 * @param {string} restaurantId - Restaurant ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {Object} additionalOptions - Additional query options
 * @returns {Promise<Array>} Array of orders in date range
 */
async function getOrdersByDateRange(restaurantId, startDate, endDate, additionalOptions = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('getOrdersByDateRange');
  
  try {
    const options = {
      startDate: startDate,
      endDate: endDate,
      orderBy: 'createdAt',
      orderDirection: 'desc',
      ...additionalOptions
    };
    
    const orders = await getOrders(restaurantId, options);
    
    await endTracking(true);
    
    console.log('✅ Retrieved orders by date range:', orders.length, 'orders');
    return orders;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getOrdersByDateRange', { restaurantId, startDate, endDate });
    
    console.error('❌ Get orders by date range error:', error);
    throw error;
  }
}

/**
 * Get active orders for a restaurant
 * @param {string} restaurantId - Restaurant ID
 * @returns {Promise<Array>} Array of active orders
 */
async function getActiveOrders(restaurantId) {
  const endTracking = VediAPI.startPerformanceMeasurement('getActiveOrders');
  
  try {
    const orders = await getOrders(restaurantId, {
      orderBy: 'createdAt',
      orderDirection: 'desc',
      limit: 100 // Reasonable limit for active orders
    });
    
    // Filter for active statuses
    const activeOrders = orders.filter(order => 
      order.status === 'pending' || 
      order.status === 'preparing' || 
      order.status === 'ready'
    );
    
    await endTracking(true);
    
    console.log('✅ Retrieved active orders:', activeOrders.length, 'orders');
    return activeOrders;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getActiveOrders', { restaurantId });
    
    console.error('❌ Get active orders error:', error);
    throw error;
  }
}

/**
 * Get completed orders for a restaurant
 * @param {string} restaurantId - Restaurant ID
 * @param {Object} options - Additional options (limit, date range, etc.)
 * @returns {Promise<Array>} Array of completed orders
 */
async function getCompletedOrders(restaurantId, options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('getCompletedOrders');
  
  try {
    const queryOptions = {
      status: 'completed',
      orderBy: 'createdAt',
      orderDirection: 'desc',
      limit: options.limit || 100,
      ...options
    };
    
    const orders = await getOrders(restaurantId, queryOptions);
    
    await endTracking(true);
    
    console.log('✅ Retrieved completed orders:', orders.length, 'orders');
    return orders;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getCompletedOrders', { restaurantId });
    
    console.error('❌ Get completed orders error:', error);
    throw error;
  }
}

// ============================================================================
// GLOBAL EXPORTS AND VEDIAPI INTEGRATION
// ============================================================================

// Ensure VediAPI namespace exists
if (!window.VediAPI) {
  window.VediAPI = {};
}

// Attach order tracking functions to VediAPI
Object.assign(window.VediAPI, {
  // Core order management
  getOrders,
  getOrder,
  
  // Customer order tracking
  getOrdersByCustomer,
  getOrdersByCustomerUID,
  getCustomerProfiles,
  getMostRecentActiveOrder,
  getMostRecentActiveOrderByUID,
  
  // Date-based queries
  getTodaysOrders,
  getOrdersByDateRange,
  
  // Status-based queries
  getActiveOrders,
  getCompletedOrders
});

console.log('📍 Enhanced Order Tracking Module loaded');
console.log('🔧 Core: getOrders, getOrder - comprehensive order retrieval');
console.log('👤 Customer: getOrdersByCustomer, getOrdersByCustomerUID, getCustomerProfiles, getMostRecentActiveOrder, getMostRecentActiveOrderByUID');
console.log('📅 Date Queries: getTodaysOrders, getOrdersByDateRange with flexible filtering');
console.log('🔍 Status Queries: getActiveOrders, getCompletedOrders for real-time tracking');
console.log('✅ All venue-financials.html dependencies satisfied');
