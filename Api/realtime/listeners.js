// api/realtime/listeners.js - Real-time Data Listeners
/**
 * Real-time Listeners Module
 * 
 * Handles all real-time data subscriptions using Firebase Firestore listeners.
 * Provides comprehensive real-time updates for orders, restaurants, venues,
 * and other critical data with proper error handling and cleanup.
 */

// ============================================================================
// ORDER REAL-TIME LISTENERS
// ============================================================================

/**
 * Listen to real-time order updates for a restaurant
 * @param {string} restaurantId - Restaurant ID
 * @param {Function} callback - Callback function for updates
 * @returns {Function} Unsubscribe function
 */
function listenToOrders(restaurantId, callback) {
  try {
    const db = getFirebaseDb();
    
    console.log('🔄 Starting real-time order listener for restaurant:', restaurantId);
    
    return db.collection('orders')
      .where('restaurantId', '==', restaurantId)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        try {
          const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          console.log('📡 Real-time order update:', orders.length, 'orders');
          callback(orders);
          
        } catch (error) {
          console.error('❌ Order listener callback error:', error);
          VediAPI.trackError(error, 'listenToOrders_callback', { restaurantId });
        }
      }, error => {
        console.error('❌ Order listener error:', error);
        VediAPI.trackError(error, 'listenToOrders', { restaurantId });
        
        // Call callback with empty array on error to avoid breaking UI
        callback([]);
      });
      
  } catch (error) {
    console.error('❌ Listen to orders setup error:', error);
    VediAPI.trackError(error, 'listenToOrders_setup', { restaurantId });
    
    // Return empty function to avoid breaking code
    return () => {};
  }
}

/**
 * Listen to specific order updates
 * @param {string} orderId - Order ID
 * @param {Function} callback - Callback function for updates
 * @returns {Function} Unsubscribe function
 */
function listenToOrder(orderId, callback) {
  try {
    const db = getFirebaseDb();
    
    console.log('🔄 Starting real-time listener for order:', orderId);
    
    return db.collection('orders').doc(orderId)
      .onSnapshot(doc => {
        try {
          if (doc.exists) {
            const order = { id: doc.id, ...doc.data() };
            console.log('📡 Real-time order update:', order.orderNumber);
            callback(order);
          } else {
            console.warn('⚠️ Order not found:', orderId);
            callback(null);
          }
        } catch (error) {
          console.error('❌ Single order listener callback error:', error);
          VediAPI.trackError(error, 'listenToOrder_callback', { orderId });
        }
      }, error => {
        console.error('❌ Single order listener error:', error);
        VediAPI.trackError(error, 'listenToOrder', { orderId });
        callback(null);
      });
      
  } catch (error) {
    console.error('❌ Listen to order setup error:', error);
    VediAPI.trackError(error, 'listenToOrder_setup', { orderId });
    return () => {};
  }
}

/**
 * Listen to real-time updates for customer's orders by phone
 * @param {string} customerPhone - Customer phone number
 * @param {Function} callback - Callback function for updates
 * @returns {Function} Unsubscribe function
 */
function listenToCustomerOrders(customerPhone, callback) {
  try {
    const db = getFirebaseDb();
    
    console.log('🔄 Starting customer order listener for:', VediAPI.maskPhoneNumber(customerPhone));
    
    return db.collection('orders')
      .where('customerPhone', '==', customerPhone)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        try {
          const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          console.log('📡 Customer order update:', orders.length, 'orders');
          callback(orders);
          
        } catch (error) {
          console.error('❌ Customer order listener callback error:', error);
          VediAPI.trackError(error, 'listenToCustomerOrders_callback', { 
            customerPhone: VediAPI.maskPhoneNumber(customerPhone) 
          });
        }
      }, error => {
        console.error('❌ Customer order listener error:', error);
        VediAPI.trackError(error, 'listenToCustomerOrders', { 
          customerPhone: VediAPI.maskPhoneNumber(customerPhone) 
        });
        callback([]);
      });
      
  } catch (error) {
    console.error('❌ Listen to customer orders setup error:', error);
    VediAPI.trackError(error, 'listenToCustomerOrders_setup', { 
      customerPhone: VediAPI.maskPhoneNumber(customerPhone) 
    });
    return () => {};
  }
}

/**
 * Listen to real-time updates for customer's orders by UID
 * @param {string} customerUID - Customer Firebase UID
 * @param {Function} callback - Callback function for updates
 * @returns {Function} Unsubscribe function
 */
function listenToCustomerOrdersByUID(customerUID, callback) {
  try {
    const db = getFirebaseDb();
    
    console.log('🔄 Starting customer order listener by UID:', customerUID);
    
    return db.collection('orders')
      .where('customerUID', '==', customerUID)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        try {
          const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          console.log('📡 Customer order update by UID:', orders.length, 'orders');
          callback(orders);
          
        } catch (error) {
          console.error('❌ Customer order UID listener callback error:', error);
          VediAPI.trackError(error, 'listenToCustomerOrdersByUID_callback', { customerUID });
        }
      }, error => {
        console.error('❌ Customer order UID listener error:', error);
        VediAPI.trackError(error, 'listenToCustomerOrdersByUID', { customerUID });
        callback([]);
      });
      
  } catch (error) {
    console.error('❌ Listen to customer orders by UID setup error:', error);
    VediAPI.trackError(error, 'listenToCustomerOrdersByUID_setup', { customerUID });
    return () => {};
  }
}

/**
 * Listen to order by order number for customer tracking
 * @param {string} orderNumber - Order number
 * @param {Function} callback - Callback function for updates
 * @returns {Function} Unsubscribe function
 */
function listenToOrderByNumber(orderNumber, callback) {
  try {
    const db = getFirebaseDb();
    
    console.log('🔄 Starting order tracking by number:', orderNumber);
    
    return db.collection('orders')
      .where('orderNumber', '==', orderNumber)
      .limit(1)
      .onSnapshot(querySnapshot => {
        try {
          if (!querySnapshot.empty) {
            const doc = querySnapshot.docs[0];
            const order = { id: doc.id, ...doc.data() };
            
            console.log('📡 Order tracking update:', orderNumber, order.status);
            callback(order);
          } else {
            console.warn('⚠️ Order not found by number:', orderNumber);
            callback(null);
          }
        } catch (error) {
          console.error('❌ Order tracking callback error:', error);
          VediAPI.trackError(error, 'listenToOrderByNumber_callback', { orderNumber });
        }
      }, error => {
        console.error('❌ Order tracking listener error:', error);
        VediAPI.trackError(error, 'listenToOrderByNumber', { orderNumber });
        callback(null);
      });
      
  } catch (error) {
    console.error('❌ Listen to order by number setup error:', error);
    VediAPI.trackError(error, 'listenToOrderByNumber_setup', { orderNumber });
    return () => {};
  }
}

// ============================================================================
// VENUE-WIDE LISTENERS
// ============================================================================

/**
 * Listen to venue-wide order updates across all restaurants
 * @param {string} venueId - Venue ID
 * @param {Function} callback - Callback function for updates
 * @returns {Promise<Function>} Unsubscribe function
 */
async function listenToVenueOrders(venueId, callback) {
  try {
    console.log('🔄 Starting venue-wide order listener for:', venueId);
    
    // Get restaurants for this venue
    const restaurants = await VediAPI.getRestaurantsByVenue(venueId);
    
    if (restaurants.length === 0) {
      console.log('⚠️ No restaurants found in venue:', venueId);
      callback([]);
      return () => {}; // Empty unsubscribe function
    }
    
    const unsubscribeFunctions = [];
    let allVenueOrders = [];
    
    restaurants.forEach(restaurant => {
      const unsubscribe = listenToOrders(restaurant.id, (restaurantOrders) => {
        try {
          // Update orders for this restaurant
          allVenueOrders = allVenueOrders.filter(order => 
            order.restaurantId !== restaurant.id
          );
          
          const ordersWithRestaurant = restaurantOrders.map(order => ({
            ...order,
            restaurantName: restaurant.name,
            restaurantCurrency: restaurant.currency || 'USD'
          }));
          
          allVenueOrders = allVenueOrders.concat(ordersWithRestaurant);
          
          // Sort by creation date
          allVenueOrders.sort((a, b) => {
            const dateA = VediAPI.timestampToDate(a.createdAt);
            const dateB = VediAPI.timestampToDate(b.createdAt);
            return dateB - dateA;
          });
          
          console.log('📡 Venue-wide order update:', allVenueOrders.length, 'total orders');
          callback(allVenueOrders);
          
        } catch (error) {
          console.error('❌ Venue order aggregation error:', error);
          VediAPI.trackError(error, 'listenToVenueOrders_aggregation', { venueId, restaurantId: restaurant.id });
        }
      });
      
      unsubscribeFunctions.push(unsubscribe);
    });
    
    // Return a function that unsubscribes from all listeners
    return () => {
      console.log('🔄 Unsubscribing from', unsubscribeFunctions.length, 'venue order listeners');
      unsubscribeFunctions.forEach(unsub => unsub());
    };
    
  } catch (error) {
    console.error('❌ Listen to venue orders error:', error);
    VediAPI.trackError(error, 'listenToVenueOrders', { venueId });
    
    callback([]);
    return () => {};
  }
}

// ============================================================================
// RESTAURANT STATUS LISTENERS
// ============================================================================

/**
 * Listen to restaurant status changes in real-time
 * @param {string} restaurantId - Restaurant ID
 * @param {Function} callback - Callback function for status updates
 * @returns {Function} Unsubscribe function
 */
function listenToRestaurantStatus(restaurantId, callback) {
  try {
    const db = getFirebaseDb();
    
    console.log('🔄 Starting restaurant status listener:', restaurantId);
    
    return db.collection('restaurants').doc(restaurantId)
      .onSnapshot(doc => {
        try {
          if (doc.exists) {
            const data = doc.data();
            const status = {
              isOnline: data.isOnline !== false,
              offlineReason: data.offlineReason || '',
              statusUpdatedAt: data.statusUpdatedAt,
              statusUpdatedBy: data.statusUpdatedBy,
              restaurantName: data.name,
              restaurantId: restaurantId,
              timestamp: new Date().toISOString()
            };
            
            console.log('📡 Restaurant status update:', data.name, status.isOnline ? 'ONLINE' : 'OFFLINE');
            callback(status);
            
          } else {
            console.warn('⚠️ Restaurant not found:', restaurantId);
            callback({
              isOnline: false,
              offlineReason: 'Restaurant not found',
              error: 'Restaurant document not found'
            });
          }
        } catch (error) {
          console.error('❌ Restaurant status callback error:', error);
          VediAPI.trackError(error, 'listenToRestaurantStatus_callback', { restaurantId });
        }
      }, error => {
        console.error('❌ Restaurant status listener error:', error);
        VediAPI.trackError(error, 'listenToRestaurantStatus', { restaurantId });
        
        // Default to online on error to avoid blocking customers
        callback({
          isOnline: true,
          offlineReason: '',
          error: error.message
        });
      });
      
  } catch (error) {
    console.error('❌ Listen to restaurant status setup error:', error);
    VediAPI.trackError(error, 'listenToRestaurantStatus_setup', { restaurantId });
    return () => {};
  }
}

// ============================================================================
// AVAILABILITY STATUS LISTENERS (INJECTED FROM AVAILABLE-STATUS-API)
// ============================================================================

/**
 * Listen to multiple restaurants status changes (for venue managers)
 * @param {Array} restaurantIds - Array of restaurant IDs
 * @param {Function} callback - Callback function for status updates
 * @returns {Function} Unsubscribe function
 */
function listenToMultipleRestaurantStatus(restaurantIds, callback) {
  try {
    if (!Array.isArray(restaurantIds) || restaurantIds.length === 0) {
      throw new Error('Valid restaurant IDs array is required');
    }
    
    console.log('🔄 Starting multi-restaurant status listener for', restaurantIds.length, 'restaurants');
    
    const unsubscribeFunctions = [];
    const statusMap = {};
    
    // Create individual listeners for each restaurant
    restaurantIds.forEach(restaurantId => {
      const unsubscribe = listenToRestaurantStatus(restaurantId, (status) => {
        statusMap[restaurantId] = status;
        
        // Call callback with all current statuses
        callback({
          statuses: { ...statusMap },
          updatedRestaurant: restaurantId,
          timestamp: new Date().toISOString()
        });
      });
      
      unsubscribeFunctions.push(unsubscribe);
    });
    
    // Return function that unsubscribes from all listeners
    return () => {
      console.log('🔄 Unsubscribing from', unsubscribeFunctions.length, 'restaurant status listeners');
      unsubscribeFunctions.forEach(unsub => unsub());
    };
    
  } catch (error) {
    console.error('❌ Listen to multiple restaurant status error:', error);
    return () => {};
  }
}

// ============================================================================
// LOSS INCIDENT LISTENERS
// ============================================================================

/**
 * Listen to real-time loss incident updates for a restaurant
 * @param {string} restaurantId - Restaurant ID
 * @param {Function} callback - Callback function for updates
 * @returns {Function} Unsubscribe function
 */
function listenToLossIncidents(restaurantId, callback) {
  try {
    const db = getFirebaseDb();
    
    console.log('🔄 Starting loss incident listener for restaurant:', restaurantId);
    
    return db.collection('lossIncidents')
      .where('restaurantId', '==', restaurantId)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        try {
          const incidents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          console.log('📡 Loss incident update:', incidents.length, 'incidents');
          callback(incidents);
          
        } catch (error) {
          console.error('❌ Loss incident listener callback error:', error);
          VediAPI.trackError(error, 'listenToLossIncidents_callback', { restaurantId });
        }
      }, error => {
        console.error('❌ Loss incident listener error:', error);
        VediAPI.trackError(error, 'listenToLossIncidents', { restaurantId });
        callback([]);
      });
      
  } catch (error) {
    console.error('❌ Listen to loss incidents setup error:', error);
    VediAPI.trackError(error, 'listenToLossIncidents_setup', { restaurantId });
    return () => {};
  }
}

/**
 * Listen to real-time loss incident updates for a venue
 * @param {string} venueId - Venue ID
 * @param {Function} callback - Callback function for updates
 * @returns {Function} Unsubscribe function
 */
function listenToVenueLossIncidents(venueId, callback) {
  try {
    const db = getFirebaseDb();
    
    console.log('🔄 Starting venue loss incident listener:', venueId);
    
    return db.collection('lossIncidents')
      .where('venueId', '==', venueId)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        try {
          const incidents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          console.log('📡 Venue loss incident update:', incidents.length, 'incidents');
          callback(incidents);
          
        } catch (error) {
          console.error('❌ Venue loss incident callback error:', error);
          VediAPI.trackError(error, 'listenToVenueLossIncidents_callback', { venueId });
        }
      }, error => {
        console.error('❌ Venue loss incident listener error:', error);
        VediAPI.trackError(error, 'listenToVenueLossIncidents', { venueId });
        callback([]);
      });
      
  } catch (error) {
    console.error('❌ Listen to venue loss incidents setup error:', error);
    VediAPI.trackError(error, 'listenToVenueLossIncidents_setup', { venueId });
    return () => {};
  }
}

// ============================================================================
// LISTENER MANAGEMENT UTILITIES
// ============================================================================

/**
 * Create a composite listener that manages multiple subscriptions
 * @param {Array} listeners - Array of listener functions
 * @returns {Function} Single unsubscribe function for all listeners
 */
function createCompositeListener(listeners) {
  const unsubscribeFunctions = [];
  
  // Execute all listener functions and collect unsubscribe functions
  listeners.forEach(listenerFn => {
    try {
      const unsubscribe = listenerFn();
      if (typeof unsubscribe === 'function') {
        unsubscribeFunctions.push(unsubscribe);
      }
    } catch (error) {
      console.error('❌ Composite listener setup error:', error);
      VediAPI.trackError(error, 'createCompositeListener');
    }
  });
  
  // Return single unsubscribe function
  return () => {
    console.log('🔄 Unsubscribing from', unsubscribeFunctions.length, 'composite listeners');
    unsubscribeFunctions.forEach(unsub => {
      try {
        unsub();
      } catch (error) {
        console.error('❌ Unsubscribe error:', error);
      }
    });
  };
}

/**
 * Auto-cleanup listener that unsubscribes when page unloads
 * @param {Function} listenerFunction - Listener function to auto-cleanup
 * @returns {Function} Unsubscribe function
 */
function createAutoCleanupListener(listenerFunction) {
  const unsubscribe = listenerFunction();
  
  // Auto-cleanup on page unload
  const cleanup = () => {
    try {
      unsubscribe();
    } catch (error) {
      console.error('❌ Auto-cleanup error:', error);
    }
  };
  
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);
  
  // Return manual unsubscribe that also removes event listeners
  return () => {
    cleanup();
    window.removeEventListener('beforeunload', cleanup);
    window.removeEventListener('pagehide', cleanup);
  };
}

// ============================================================================
// GLOBAL EXPORTS AND VEDIAPI INTEGRATION
// ============================================================================

// Ensure VediAPI namespace exists
if (!window.VediAPI) {
  window.VediAPI = {};
}

// Attach real-time listener functions to VediAPI
Object.assign(window.VediAPI, {
  // Order listeners
  listenToOrders,
  listenToOrder,
  listenToCustomerOrders,
  listenToCustomerOrdersByUID,
  listenToOrderByNumber,
  
  // Venue listeners
  listenToVenueOrders,
  
  // Restaurant status listeners
  listenToRestaurantStatus,
  
  // INJECTED: Multiple restaurant status listener from available-status-api
  listenToMultipleRestaurantStatus,
  
  // Loss incident listeners
  listenToLossIncidents,
  listenToVenueLossIncidents,
  
  // Listener utilities
  createCompositeListener,
  createAutoCleanupListener
});

console.log('📡 Enhanced Real-time Listeners Module loaded');
console.log('📋 Order: listenToOrders, listenToOrder, listenToOrderByNumber');
console.log('👤 Customer: listenToCustomerOrders, listenToCustomerOrdersByUID');
console.log('🏢 Venue: listenToVenueOrders with multi-restaurant aggregation');
console.log('🔄 Status: listenToRestaurantStatus for online/offline updates');
console.log('🔄 INJECTED: listenToMultipleRestaurantStatus from available-status-api');
console.log('📊 Incidents: listenToLossIncidents, listenToVenueLossIncidents');
console.log('🛠️ Utilities: createCompositeListener, createAutoCleanupListener');
console.log('✅ Comprehensive real-time data with error handling and auto-cleanup');