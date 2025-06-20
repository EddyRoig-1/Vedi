// api/orders/order_management.js - Order Management
/**
 * Order Management Module
 * 
 * Handles core order CRUD operations, status management, and lifecycle updates.
 * Focuses on database interactions and order state management.
 * Note: getOrders function removed - use order-tracking.js for order retrieval
 */

// ============================================================================
// ORDER CRUD OPERATIONS
// ============================================================================

/**
 * Create new order with authenticated customer UID
 * @param {Object} orderData - Order information
 * @returns {Promise<Object>} Created order
 */
async function createOrder(orderData) {
  const endTracking = VediAPI.startPerformanceMeasurement('createOrder');
  
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    // FIXED: Validate required fields - phone is now optional
    if (!orderData.restaurantId || !orderData.items) {
      throw new Error('Restaurant ID and items are required');
    }
    
    if (!Array.isArray(orderData.items) || orderData.items.length === 0) {
      throw new Error('Order must contain at least one item');
    }
    
    // Get current authenticated user
    const currentUser = auth.currentUser;
    
    // Generate order number if not provided
    const orderNumber = orderData.orderNumber || VediAPI.generateOrderNumber();
    
    const order = VediAPI.removeUndefinedValues({
      orderNumber: orderNumber,
      restaurantId: orderData.restaurantId,
      restaurantName: orderData.restaurantName || '',
      
      // Customer information - phone is now optional
      customerPhone: orderData.customerPhone ? VediAPI.sanitizeInput(orderData.customerPhone) : '',
      customerName: orderData.customerName ? VediAPI.sanitizeInput(orderData.customerName) : '',
      customerEmail: orderData.customerEmail ? VediAPI.sanitizeInput(orderData.customerEmail) : '',
      customerUID: currentUser ? currentUser.uid : null, // For security rules
      
      // Order items and pricing
      items: orderData.items, // Array of items with quantities
      subtotal: parseFloat(orderData.subtotal) || 0,
      tax: parseFloat(orderData.tax) || 0,
      serviceFee: parseFloat(orderData.serviceFee) || 0,
      venueFee: parseFloat(orderData.venueFee) || 0, // Venue fee support
      deliveryFee: parseFloat(orderData.deliveryFee) || 0,
      total: parseFloat(orderData.total) || 0,
      
      // Order type and details
      orderType: orderData.orderType || 'pickup', // pickup, delivery, dine-in
      status: 'pending',
      paymentStatus: orderData.paymentStatus || 'pending',
      paymentMethod: orderData.paymentMethod || '',
      
      // Delivery/pickup information
      deliveryAddress: orderData.deliveryAddress || null,
      scheduledFor: orderData.scheduledFor || null,
      specialInstructions: orderData.specialInstructions ? VediAPI.sanitizeInput(orderData.specialInstructions) : '',
      
      // Venue information (if restaurant is in a venue)
      venueId: orderData.venueId || null,
      venueName: orderData.venueName || null,
      
      // Timestamps
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    const docRef = await db.collection('orders').add(order);
    const doc = await docRef.get();
    const createdOrder = { id: doc.id, ...doc.data() };
    
    // Track order creation - handle optional phone
    const phoneForTracking = orderData.customerPhone ? VediAPI.maskPhoneNumber(orderData.customerPhone) : 'not_provided';
    
    await VediAPI.trackUserActivity('order_created', {
      orderId: docRef.id,
      orderNumber: orderNumber,
      restaurantId: orderData.restaurantId,
      customerPhone: phoneForTracking,
      total: order.total,
      itemCount: order.items.length,
      orderType: order.orderType,
      hasPhoneNumber: !!orderData.customerPhone // Track if phone was provided
    });
    
    await endTracking(true);
    
    console.log('✅ Order created:', orderNumber, orderData.customerPhone ? 'with SMS notifications' : 'without SMS notifications');
    return createdOrder;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    
    // Handle optional phone in error tracking too
    const phoneForTracking = orderData.customerPhone ? VediAPI.maskPhoneNumber(orderData.customerPhone) : 'not_provided';
    
    await VediAPI.trackError(error, 'createOrder', { 
      restaurantId: orderData.restaurantId,
      customerPhone: phoneForTracking
    });
    
    console.error('❌ Create order error:', error);
    throw error;
  }
}

/**
 * Get order by order number
 * @param {string} orderNumber - Order number
 * @returns {Promise<Object>} Order data
 */
async function getOrderByNumber(orderNumber) {
  const endTracking = VediAPI.startPerformanceMeasurement('getOrderByNumber');
  
  try {
    const db = getFirebaseDb();
    
    const querySnapshot = await db.collection('orders')
      .where('orderNumber', '==', orderNumber)
      .limit(1)
      .get();
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      const order = { id: doc.id, ...doc.data() };
      
      await endTracking(true);
      return order;
    }
    
    throw new Error('Order not found');
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getOrderByNumber', { orderNumber });
    
    console.error('❌ Get order by number error:', error);
    throw error;
  }
}

/**
 * Update order status
 * @param {string} orderId - Order ID
 * @param {string} status - New status
 * @param {string} estimatedTime - Optional estimated time
 * @returns {Promise<Object>} Updated order
 */
async function updateOrderStatus(orderId, status, estimatedTime = null) {
  const endTracking = VediAPI.startPerformanceMeasurement('updateOrderStatus');
  
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    const updateData = {
      status: status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      statusUpdatedBy: auth.currentUser?.uid || 'system'
    };
    
    if (estimatedTime) {
      updateData.estimatedTime = VediAPI.sanitizeInput(estimatedTime);
    }
    
    // Add status-specific timestamps
    switch (status) {
      case 'confirmed':
        updateData.confirmedAt = firebase.firestore.FieldValue.serverTimestamp();
        break;
      case 'preparing':
        updateData.preparingAt = firebase.firestore.FieldValue.serverTimestamp();
        break;
      case 'ready':
        updateData.readyAt = firebase.firestore.FieldValue.serverTimestamp();
        break;
      case 'completed':
        updateData.completedAt = firebase.firestore.FieldValue.serverTimestamp();
        break;
      case 'cancelled':
        updateData.cancelledAt = firebase.firestore.FieldValue.serverTimestamp();
        break;
    }
    
    await db.collection('orders').doc(orderId).update(updateData);
    
    // Get updated order
    const doc = await db.collection('orders').doc(orderId).get();
    const updatedOrder = { id: doc.id, ...doc.data() };
    
    // Track status change
    await VediAPI.trackUserActivity('order_status_updated', {
      orderId: orderId,
      orderNumber: updatedOrder.orderNumber,
      newStatus: status,
      restaurantId: updatedOrder.restaurantId,
      estimatedTime: estimatedTime
    });
    
    await endTracking(true);
    
    console.log('✅ Order status updated:', orderId, status);
    return updatedOrder;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'updateOrderStatus', { orderId, status });
    
    console.error('❌ Update order status error:', error);
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

// Attach order management functions to VediAPI
Object.assign(window.VediAPI, {
  // Core CRUD operations (getOrders removed - use order-tracking.js)
  createOrder,
  getOrderByNumber,
  
  // Status management
  updateOrderStatus
});

console.log('📋 Order Management Module loaded');
console.log('📝 CRUD: createOrder, getOrderByNumber (getOrders available in order-tracking.js)');
console.log('🔄 Status: updateOrderStatus with comprehensive tracking');
console.log('📱 Phone number is now OPTIONAL for social auth users');
