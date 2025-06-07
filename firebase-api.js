// firebase-api.js - Complete Vedi Firebase API Implementation

const VediAPI = {
  // ============================================================================
  // AUTHENTICATION & USER MANAGEMENT
  // ============================================================================
  
  /**
   * Sign up a new user
   * @param {string} email - User email
   * @param {string} password - User password  
   * @param {Object} userData - Additional user data (name, accountType)
   * @returns {Promise<Object>} User object
   */
  async signUp(email, password, userData) {
    try {
      // Create Firebase auth user
      const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;
      
      // Save additional user data to Firestore
      const userDoc = {
        email: email,
        name: userData.name,
        accountType: userData.accountType, // 'restaurant' or 'venue'
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await firebaseDb.collection('users').doc(user.uid).set(userDoc);
      
      console.log('✅ User created successfully:', user.uid);
      return { id: user.uid, ...userDoc, email };
      
    } catch (error) {
      console.error('❌ Sign up error:', error);
      throw new Error(this.getAuthErrorMessage(error.code));
    }
  },

  /**
   * Sign in existing user
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} User object with data
   */
  async signIn(email, password) {
    try {
      const userCredential = await firebaseAuth.signInWithEmailAndPassword(email, password);
      const user = userCredential.user;
      
      // Get user data from Firestore
      const userData = await this.getUserData(user.uid);
      
      console.log('✅ User signed in successfully:', user.uid);
      return userData;
      
    } catch (error) {
      console.error('❌ Sign in error:', error);
      throw new Error(this.getAuthErrorMessage(error.code));
    }
  },

  /**
   * Sign out current user
   */
  async signOut() {
    try {
      await firebaseAuth.signOut();
      console.log('✅ User signed out successfully');
    } catch (error) {
      console.error('❌ Sign out error:', error);
      throw error;
    }
  },

  /**
   * Get current authenticated user
   * @returns {Promise<Object|null>} Current user or null
   */
  async getCurrentUser() {
    return new Promise((resolve) => {
      const unsubscribe = firebaseAuth.onAuthStateChanged(async (user) => {
        unsubscribe();
        if (user) {
          try {
            const userData = await this.getUserData(user.uid);
            resolve(userData);
          } catch (error) {
            console.error('❌ Error getting user data:', error);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });
  },

  /**
   * Get user data from Firestore
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User data
   */
  async getUserData(userId) {
    try {
      const doc = await firebaseDb.collection('users').doc(userId).get();
      if (doc.exists) {
        return { id: doc.id, ...doc.data() };
      }
      throw new Error('User data not found');
    } catch (error) {
      console.error('❌ Get user data error:', error);
      throw error;
    }
  },

  /**
   * Check if email already exists
   * @param {string} email - Email to check
   * @returns {Promise<boolean>} True if email exists
   */
  async checkEmailExists(email) {
    try {
      const methods = await firebaseAuth.fetchSignInMethodsForEmail(email);
      return methods.length > 0;
    } catch (error) {
      console.error('❌ Check email error:', error);
      return false;
    }
  },

  // ============================================================================
  // RESTAURANT MANAGEMENT
  // ============================================================================

  /**
   * Create new restaurant
   * @param {Object} restaurantData - Restaurant information
   * @returns {Promise<Object>} Created restaurant
   */
  async createRestaurant(restaurantData) {
    try {
      const restaurant = {
        ...restaurantData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      const docRef = await firebaseDb.collection('restaurants').add(restaurant);
      const doc = await docRef.get();
      
      console.log('✅ Restaurant created:', docRef.id);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Create restaurant error:', error);
      throw error;
    }
  },

  /**
   * Update existing restaurant
   * @param {string} restaurantId - Restaurant ID
   * @param {Object} restaurantData - Updated data
   * @returns {Promise<Object>} Updated restaurant
   */
  async updateRestaurant(restaurantId, restaurantData) {
    try {
      const updateData = {
        ...restaurantData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await firebaseDb.collection('restaurants').doc(restaurantId).update(updateData);
      
      const doc = await firebaseDb.collection('restaurants').doc(restaurantId).get();
      
      console.log('✅ Restaurant updated:', restaurantId);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Update restaurant error:', error);
      throw error;
    }
  },

  /**
   * Get restaurant by owner user ID
   * @param {string} ownerUserId - Owner's user ID
   * @returns {Promise<Object|null>} Restaurant or null
   */
  async getRestaurantByOwner(ownerUserId) {
    try {
      const querySnapshot = await firebaseDb.collection('restaurants')
        .where('ownerUserId', '==', ownerUserId)
        .limit(1)
        .get();
      
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }
      return null;
      
    } catch (error) {
      console.error('❌ Get restaurant by owner error:', error);
      throw error;
    }
  },

  /**
   * Get restaurant by ID
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Restaurant data
   */
  async getRestaurant(restaurantId) {
    try {
      const doc = await firebaseDb.collection('restaurants').doc(restaurantId).get();
      if (doc.exists) {
        return { id: doc.id, ...doc.data() };
      }
      throw new Error('Restaurant not found');
    } catch (error) {
      console.error('❌ Get restaurant error:', error);
      throw error;
    }
  },

  // ============================================================================
  // MENU CATEGORIES MANAGEMENT
  // ============================================================================

  /**
   * Get all menu categories for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Array>} Array of categories
   */
  async getMenuCategories(restaurantId) {
    try {
      const querySnapshot = await firebaseDb.collection('menuCategories')
        .where('restaurantId', '==', restaurantId)
        .orderBy('order', 'asc')
        .get();
      
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
    } catch (error) {
      console.error('❌ Get menu categories error:', error);
      throw error;
    }
  },

  /**
   * Create new menu category
   * @param {Object} categoryData - Category data
   * @returns {Promise<Object>} Created category
   */
  async createMenuCategory(categoryData) {
    try {
      const category = {
        ...categoryData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      const docRef = await firebaseDb.collection('menuCategories').add(category);
      const doc = await docRef.get();
      
      console.log('✅ Menu category created:', docRef.id);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Create menu category error:', error);
      throw error;
    }
  },

  /**
   * Update menu category
   * @param {string} categoryId - Category ID
   * @param {Object} categoryData - Updated data
   * @returns {Promise<Object>} Updated category
   */
  async updateMenuCategory(categoryId, categoryData) {
    try {
      await firebaseDb.collection('menuCategories').doc(categoryId).update(categoryData);
      
      const doc = await firebaseDb.collection('menuCategories').doc(categoryId).get();
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Update menu category error:', error);
      throw error;
    }
  },

  /**
   * Delete menu category
   * @param {string} categoryId - Category ID
   */
  async deleteMenuCategory(categoryId) {
    try {
      await firebaseDb.collection('menuCategories').doc(categoryId).delete();
      console.log('✅ Menu category deleted:', categoryId);
    } catch (error) {
      console.error('❌ Delete menu category error:', error);
      throw error;
    }
  },

  // ============================================================================
  // MENU ITEMS MANAGEMENT
  // ============================================================================

  /**
   * Get all menu items for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Array>} Array of menu items
   */
  async getMenuItems(restaurantId) {
    try {
      const querySnapshot = await firebaseDb.collection('menuItems')
        .where('restaurantId', '==', restaurantId)
        .get();
      
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
    } catch (error) {
      console.error('❌ Get menu items error:', error);
      throw error;
    }
  },

  /**
   * Get menu items by category
   * @param {string} restaurantId - Restaurant ID
   * @param {string} categoryId - Category ID
   * @returns {Promise<Array>} Array of menu items
   */
  async getMenuItemsByCategory(restaurantId, categoryId) {
    try {
      const querySnapshot = await firebaseDb.collection('menuItems')
        .where('restaurantId', '==', restaurantId)
        .where('categoryId', '==', categoryId)
        .get();
      
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
    } catch (error) {
      console.error('❌ Get menu items by category error:', error);
      throw error;
    }
  },

  /**
   * Create new menu item
   * @param {Object} itemData - Menu item data
   * @returns {Promise<Object>} Created menu item
   */
  async createMenuItem(itemData) {
    try {
      const item = {
        ...itemData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      const docRef = await firebaseDb.collection('menuItems').add(item);
      const doc = await docRef.get();
      
      console.log('✅ Menu item created:', docRef.id);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Create menu item error:', error);
      throw error;
    }
  },

  /**
   * Update menu item
   * @param {string} itemId - Item ID
   * @param {Object} itemData - Updated data
   * @returns {Promise<Object>} Updated item
   */
  async updateMenuItem(itemId, itemData) {
    try {
      const updateData = {
        ...itemData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await firebaseDb.collection('menuItems').doc(itemId).update(updateData);
      
      const doc = await firebaseDb.collection('menuItems').doc(itemId).get();
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Update menu item error:', error);
      throw error;
    }
  },

  /**
   * Delete menu item
   * @param {string} itemId - Item ID
   */
  async deleteMenuItem(itemId) {
    try {
      await firebaseDb.collection('menuItems').doc(itemId).delete();
      console.log('✅ Menu item deleted:', itemId);
    } catch (error) {
      console.error('❌ Delete menu item error:', error);
      throw error;
    }
  },

  /**
   * Update item stock status
   * @param {string} itemId - Item ID
   * @param {boolean} inStock - Stock status
   * @returns {Promise<Object>} Updated item
   */
  async updateItemStock(itemId, inStock) {
    try {
      await firebaseDb.collection('menuItems').doc(itemId).update({
        inStock,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      const doc = await firebaseDb.collection('menuItems').doc(itemId).get();
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Update item stock error:', error);
      throw error;
    }
  },

  // ============================================================================
  // ORDER MANAGEMENT
  // ============================================================================

  /**
   * Create new order
   * @param {Object} orderData - Order information
   * @returns {Promise<Object>} Created order
   */
  async createOrder(orderData) {
    try {
      const order = {
        ...orderData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      const docRef = await firebaseDb.collection('orders').add(order);
      const doc = await docRef.get();
      
      console.log('✅ Order created:', orderData.orderNumber);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Create order error:', error);
      throw error;
    }
  },

  /**
   * Get order by order number
   * @param {string} orderNumber - Order number
   * @returns {Promise<Object>} Order data
   */
  async getOrderByNumber(orderNumber) {
    try {
      const querySnapshot = await firebaseDb.collection('orders')
        .where('orderNumber', '==', orderNumber)
        .limit(1)
        .get();
      
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }
      throw new Error('Order not found');
      
    } catch (error) {
      console.error('❌ Get order by number error:', error);
      throw error;
    }
  },

  /**
   * Get all orders for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @param {Object} options - Query options (limit, orderBy, etc.)
   * @returns {Promise<Array>} Array of orders
   */
  async getOrders(restaurantId, options = {}) {
    try {
      let query = firebaseDb.collection('orders')
        .where('restaurantId', '==', restaurantId);
      
      // Add ordering
      if (options.orderBy) {
        query = query.orderBy(options.orderBy, options.orderDirection || 'desc');
      } else {
        query = query.orderBy('createdAt', 'desc');
      }
      
      // Add limit
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      // Add status filter
      if (options.status) {
        query = query.where('status', '==', options.status);
      }
      
      const querySnapshot = await query.get();
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
    } catch (error) {
      console.error('❌ Get orders error:', error);
      throw error;
    }
  },

  /**
   * Get orders by customer phone
   * @param {string} customerPhone - Customer phone number
   * @returns {Promise<Array>} Array of customer orders
   */
  async getOrdersByCustomer(customerPhone) {
    try {
      const querySnapshot = await firebaseDb.collection('orders')
        .where('customerPhone', '==', customerPhone)
        .orderBy('createdAt', 'desc')
        .get();
      
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
    } catch (error) {
      console.error('❌ Get orders by customer error:', error);
      throw error;
    }
  },

  /**
   * Update order status
   * @param {string} orderId - Order ID
   * @param {string} status - New status
   * @param {string} estimatedTime - Optional estimated time
   * @returns {Promise<Object>} Updated order
   */
  async updateOrderStatus(orderId, status, estimatedTime = null) {
    try {
      const updateData = {
        status,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      if (estimatedTime) {
        updateData.estimatedTime = estimatedTime;
      }
      
      await firebaseDb.collection('orders').doc(orderId).update(updateData);
      
      const doc = await firebaseDb.collection('orders').doc(orderId).get();
      console.log('✅ Order status updated:', orderId, status);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Update order status error:', error);
      throw error;
    }
  },

  /**
   * Get today's orders for a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Array>} Today's orders
   */
  async getTodaysOrders(restaurantId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const querySnapshot = await firebaseDb.collection('orders')
        .where('restaurantId', '==', restaurantId)
        .where('createdAt', '>=', today)
        .orderBy('createdAt', 'desc')
        .get();
      
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
    } catch (error) {
      console.error('❌ Get today\'s orders error:', error);
      throw error;
    }
  },

  // ============================================================================
  // VENUE MANAGEMENT (Future Features)
  // ============================================================================

  /**
   * Create new venue
   * @param {Object} venueData - Venue information
   * @returns {Promise<Object>} Created venue
   */
  async createVenue(venueData) {
    try {
      const venue = {
        ...venueData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      const docRef = await firebaseDb.collection('venues').add(venue);
      const doc = await docRef.get();
      
      console.log('✅ Venue created:', docRef.id);
      return { id: doc.id, ...doc.data() };
      
    } catch (error) {
      console.error('❌ Create venue error:', error);
      throw error;
    }
  },

  /**
   * Get venue by manager user ID
   * @param {string} managerUserId - Manager's user ID
   * @returns {Promise<Object|null>} Venue or null
   */
  async getVenueByManager(managerUserId) {
    try {
      const querySnapshot = await firebaseDb.collection('venues')
        .where('managerUserId', '==', managerUserId)
        .limit(1)
        .get();
      
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }
      return null;
      
    } catch (error) {
      console.error('❌ Get venue by manager error:', error);
      throw error;
    }
  },

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Generate unique order number
   * @returns {string} Unique order number
   */
  generateOrderNumber() {
    return Date.now().toString();
  },

  /**
   * Generate unique invite code
   * @returns {string} Random 8-character code
   */
  generateInviteCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  },

  /**
   * Convert Firebase timestamp to Date
   * @param {Object} timestamp - Firebase timestamp
   * @returns {Date} JavaScript Date object
   */
  timestampToDate(timestamp) {
    if (timestamp && timestamp.toDate) {
      return timestamp.toDate();
    }
    return new Date(timestamp);
  },

  /**
   * Get user-friendly auth error message
   * @param {string} errorCode - Firebase auth error code
   * @returns {string} User-friendly message
   */
  getAuthErrorMessage(errorCode) {
    const errorMessages = {
      'auth/email-already-in-use': 'This email is already registered. Please use a different email or try signing in.',
      'auth/weak-password': 'Password should be at least 6 characters long.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/user-not-found': 'No account found with this email. Please check your email or sign up.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Please check your connection and try again.',
      'auth/invalid-credential': 'Invalid email or password. Please try again.'
    };
    
    return errorMessages[errorCode] || 'An unexpected error occurred. Please try again.';
  },

  /**
   * Listen to real-time order updates
   * @param {string} restaurantId - Restaurant ID
   * @param {Function} callback - Callback function for updates
   * @returns {Function} Unsubscribe function
   */
  listenToOrders(restaurantId, callback) {
    return firebaseDb.collection('orders')
      .where('restaurantId', '==', restaurantId)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(orders);
      });
  },

  /**
   * Listen to specific order updates
   * @param {string} orderId - Order ID
   * @param {Function} callback - Callback function for updates
   * @returns {Function} Unsubscribe function
   */
  listenToOrder(orderId, callback) {
    return firebaseDb.collection('orders').doc(orderId)
      .onSnapshot(doc => {
        if (doc.exists) {
          callback({ id: doc.id, ...doc.data() });
        }
      });
  }
};

// Make VediAPI available globally
window.VediAPI = VediAPI;

// Legacy support - also make it available as FirebaseAPI for backward compatibility
window.FirebaseAPI = VediAPI;

console.log('🍽️ Vedi Firebase API loaded successfully');
console.log('📚 Available methods:', Object.keys(VediAPI));