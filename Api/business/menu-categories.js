// api/business/menu-categories.js - Menu Category Management
/**
 * Menu Categories Module
 * 
 * Handles menu category operations including creation, updates, ordering,
 * and category-specific queries. Provides comprehensive menu organization
 * capabilities for restaurant management systems.
 */

// ============================================================================
// MENU CATEGORY CRUD OPERATIONS
// ============================================================================

/**
 * Get all menu categories for a restaurant
 * @param {string} restaurantId - Restaurant ID
 * @returns {Promise<Array>} Array of categories ordered by display order
 */
async function getMenuCategories(restaurantId) {
  const endTracking = VediAPI.startPerformanceMeasurement('getMenuCategories');
  
  try {
    const db = getFirebaseDb();
    
    if (!restaurantId) {
      throw new Error('Restaurant ID is required');
    }
    
    const querySnapshot = await db.collection('menuCategories')
      .where('restaurantId', '==', restaurantId)
      .orderBy('order', 'asc')
      .get();
    
    const categories = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    await endTracking(true);
    
    console.log('✅ Retrieved menu categories:', categories.length, 'categories');
    return categories;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getMenuCategories', { restaurantId });
    
    console.error('❌ Get menu categories error:', error);
    throw error;
  }
}

/**
 * Create new menu category
 * @param {Object} categoryData - Category information
 * @returns {Promise<Object>} Created category with ID
 */
async function createMenuCategory(categoryData) {
  const endTracking = VediAPI.startPerformanceMeasurement('createMenuCategory');
  
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    // Validate required fields
    if (!categoryData.name || !categoryData.restaurantId) {
      throw new Error('Category name and restaurant ID are required');
    }
    
    // Get next order number if not provided
    let order = categoryData.order;
    if (order === undefined || order === null) {
      const existingCategories = await getMenuCategories(categoryData.restaurantId);
      order = existingCategories.length;
    }
    
    // Clean and structure category data
    const category = VediAPI.removeUndefinedValues({
      restaurantId: categoryData.restaurantId,
      name: VediAPI.sanitizeInput(categoryData.name),
      description: categoryData.description ? VediAPI.sanitizeInput(categoryData.description) : '',
      order: order,
      isActive: categoryData.isActive !== false, // Default to true
      imageUrl: categoryData.imageUrl ? VediAPI.sanitizeInput(categoryData.imageUrl) : '',
      
      // Display settings
      showOnMenu: categoryData.showOnMenu !== false, // Default to true
      availableAllDay: categoryData.availableAllDay !== false, // Default to true
      availableFrom: categoryData.availableFrom || null,
      availableTo: categoryData.availableTo || null,
      
      // Metadata
      createdBy: auth.currentUser?.uid || 'system',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Add to database
    const docRef = await db.collection('menuCategories').add(category);
    const doc = await docRef.get();
    const createdCategory = { id: doc.id, ...doc.data() };
    
    // Track category creation
    await VediAPI.trackUserActivity('menu_category_created', {
      restaurantId: categoryData.restaurantId,
      categoryId: docRef.id,
      categoryName: category.name,
      order: category.order
    });
    
    await endTracking(true);
    
    console.log('✅ Menu category created:', docRef.id);
    return createdCategory;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'createMenuCategory', { 
      restaurantId: categoryData.restaurantId,
      categoryName: categoryData.name 
    });
    
    console.error('❌ Create menu category error:', error);
    throw error;
  }
}

/**
 * Update menu category
 * @param {string} categoryId - Category ID to update
 * @param {Object} categoryData - Updated category data
 * @returns {Promise<Object>} Updated category
 */
async function updateMenuCategory(categoryId, categoryData) {
  const endTracking = VediAPI.startPerformanceMeasurement('updateMenuCategory');
  
  try {
    const db = getFirebaseDb();
    
    // Validate category exists
    const existingDoc = await db.collection('menuCategories').doc(categoryId).get();
    if (!existingDoc.exists) {
      throw new Error('Menu category not found');
    }
    
    // Sanitize updates
    const updates = VediAPI.removeUndefinedValues({
      name: categoryData.name ? VediAPI.sanitizeInput(categoryData.name) : undefined,
      description: categoryData.description !== undefined ? VediAPI.sanitizeInput(categoryData.description) : undefined,
      order: categoryData.order !== undefined ? categoryData.order : undefined,
      isActive: categoryData.isActive !== undefined ? categoryData.isActive : undefined,
      imageUrl: categoryData.imageUrl !== undefined ? VediAPI.sanitizeInput(categoryData.imageUrl) : undefined,
      
      // Display settings
      showOnMenu: categoryData.showOnMenu !== undefined ? categoryData.showOnMenu : undefined,
      availableAllDay: categoryData.availableAllDay !== undefined ? categoryData.availableAllDay : undefined,
      availableFrom: categoryData.availableFrom !== undefined ? categoryData.availableFrom : undefined,
      availableTo: categoryData.availableTo !== undefined ? categoryData.availableTo : undefined,
      
      // Always update timestamp
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Update category
    await db.collection('menuCategories').doc(categoryId).update(updates);
    
    // Get updated category
    const updatedDoc = await db.collection('menuCategories').doc(categoryId).get();
    const updatedCategory = { id: updatedDoc.id, ...updatedDoc.data() };
    
    // Track category update
    await VediAPI.trackUserActivity('menu_category_updated', {
      restaurantId: updatedCategory.restaurantId,
      categoryId: categoryId,
      fieldsUpdated: Object.keys(updates),
      categoryName: updatedCategory.name
    });
    
    await endTracking(true);
    
    console.log('✅ Menu category updated:', categoryId);
    return updatedCategory;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'updateMenuCategory', { categoryId });
    
    console.error('❌ Update menu category error:', error);
    throw error;
  }
}

/**
 * Delete menu category
 * @param {string} categoryId - Category ID to delete
 * @returns {Promise<void>} Resolves when category is deleted
 */
async function deleteMenuCategory(categoryId) {
  const endTracking = VediAPI.startPerformanceMeasurement('deleteMenuCategory');
  
  try {
    const db = getFirebaseDb();
    
    // Get category data before deletion for tracking
    const categoryDoc = await db.collection('menuCategories').doc(categoryId).get();
    if (!categoryDoc.exists) {
      throw new Error('Menu category not found');
    }
    
    const categoryData = categoryDoc.data();
    
    // Check if category has menu items
    const itemsSnapshot = await db.collection('menuItems')
      .where('categoryId', '==', categoryId)
      .limit(1)
      .get();
    
    if (!itemsSnapshot.empty) {
      throw new Error('Cannot delete category that contains menu items. Please move or delete items first.');
    }
    
    // Delete category
    await db.collection('menuCategories').doc(categoryId).delete();
    
    // Track category deletion
    await VediAPI.trackUserActivity('menu_category_deleted', {
      restaurantId: categoryData.restaurantId,
      categoryId: categoryId,
      categoryName: categoryData.name
    });
    
    await endTracking(true);
    
    console.log('✅ Menu category deleted:', categoryId);
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'deleteMenuCategory', { categoryId });
    
    console.error('❌ Delete menu category error:', error);
    throw error;
  }
}

// ============================================================================
// CATEGORY ORDERING AND ORGANIZATION
// ============================================================================

/**
 * Reorder menu categories
 * @param {string} restaurantId - Restaurant ID
 * @param {Array} categoryOrder - Array of category IDs in new order
 * @returns {Promise<Array>} Updated categories in new order
 */
async function reorderMenuCategories(restaurantId, categoryOrder) {
  const endTracking = VediAPI.startPerformanceMeasurement('reorderMenuCategories');
  
  try {
    const db = getFirebaseDb();
    
    if (!Array.isArray(categoryOrder) || categoryOrder.length === 0) {
      throw new Error('Valid category order array is required');
    }
    
    // Update each category with its new order
    const batch = db.batch();
    
    categoryOrder.forEach((categoryId, index) => {
      const categoryRef = db.collection('menuCategories').doc(categoryId);
      batch.update(categoryRef, { 
        order: index,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    
    await batch.commit();
    
    // Get updated categories
    const updatedCategories = await getMenuCategories(restaurantId);
    
    // Track reorder operation
    await VediAPI.trackUserActivity('menu_categories_reordered', {
      restaurantId: restaurantId,
      newOrder: categoryOrder
    });
    
    await endTracking(true);
    
    console.log('✅ Menu categories reordered:', categoryOrder.length, 'categories');
    return updatedCategories;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'reorderMenuCategories', { restaurantId, categoryCount: categoryOrder?.length });
    
    console.error('❌ Reorder menu categories error:', error);
    throw error;
  }
}

/**
 * Toggle category active status
 * @param {string} categoryId - Category ID
 * @param {boolean} isActive - New active status
 * @returns {Promise<Object>} Updated category
 */
async function toggleCategoryStatus(categoryId, isActive) {
  const endTracking = VediAPI.startPerformanceMeasurement('toggleCategoryStatus');
  
  try {
    const updatedCategory = await updateMenuCategory(categoryId, { isActive });
    
    // Also update all items in category if deactivating
    if (!isActive) {
      const db = getFirebaseDb();
      const itemsSnapshot = await db.collection('menuItems')
        .where('categoryId', '==', categoryId)
        .get();
      
      if (!itemsSnapshot.empty) {
        const batch = db.batch();
        itemsSnapshot.docs.forEach(doc => {
          batch.update(doc.ref, { 
            isActive: false,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        });
        await batch.commit();
        
        console.log('✅ Deactivated', itemsSnapshot.docs.length, 'items in category');
      }
    }
    
    await endTracking(true);
    
    console.log('✅ Category status toggled:', categoryId, isActive ? 'ACTIVE' : 'INACTIVE');
    return updatedCategory;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'toggleCategoryStatus', { categoryId, isActive });
    
    console.error('❌ Toggle category status error:', error);
    throw error;
  }
}

// ============================================================================
// CATEGORY QUERIES AND ANALYTICS
// ============================================================================

/**
 * Get category with item count
 * @param {string} categoryId - Category ID
 * @returns {Promise<Object>} Category with item statistics
 */
async function getCategoryWithStats(categoryId) {
  const endTracking = VediAPI.startPerformanceMeasurement('getCategoryWithStats');
  
  try {
    const db = getFirebaseDb();
    
    // Get category
    const categoryDoc = await db.collection('menuCategories').doc(categoryId).get();
    if (!categoryDoc.exists) {
      throw new Error('Category not found');
    }
    
    const category = { id: categoryDoc.id, ...categoryDoc.data() };
    
    // Get item statistics
    const itemsSnapshot = await db.collection('menuItems')
      .where('categoryId', '==', categoryId)
      .get();
    
    const items = itemsSnapshot.docs.map(doc => doc.data());
    
    // Calculate statistics
    const stats = {
      totalItems: items.length,
      activeItems: items.filter(item => item.isActive !== false).length,
      inStockItems: items.filter(item => item.inStock !== false).length,
      outOfStockItems: items.filter(item => item.inStock === false).length,
      averagePrice: items.length > 0 ? 
        items.reduce((sum, item) => sum + (item.price || 0), 0) / items.length : 0
    };
    
    const categoryWithStats = {
      ...category,
      statistics: stats
    };
    
    await endTracking(true);
    
    console.log('✅ Category with stats retrieved:', categoryId);
    return categoryWithStats;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getCategoryWithStats', { categoryId });
    
    console.error('❌ Get category with stats error:', error);
    throw error;
  }
}

/**
 * Get categories with item counts for restaurant dashboard
 * @param {string} restaurantId - Restaurant ID
 * @returns {Promise<Array>} Categories with item statistics
 */
async function getCategoriesWithStats(restaurantId) {
  const endTracking = VediAPI.startPerformanceMeasurement('getCategoriesWithStats');
  
  try {
    // Get all categories
    const categories = await getMenuCategories(restaurantId);
    
    // Get item counts for each category
    const categoriesWithStats = await Promise.all(
      categories.map(async (category) => {
        const stats = await getCategoryWithStats(category.id);
        return stats;
      })
    );
    
    await endTracking(true);
    
    console.log('✅ Categories with stats retrieved:', categoriesWithStats.length, 'categories');
    return categoriesWithStats;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getCategoriesWithStats', { restaurantId });
    
    console.error('❌ Get categories with stats error:', error);
    throw error;
  }
}

/**
 * Search categories by name
 * @param {string} restaurantId - Restaurant ID
 * @param {string} searchTerm - Search term
 * @returns {Promise<Array>} Matching categories
 */
async function searchMenuCategories(restaurantId, searchTerm) {
  const endTracking = VediAPI.startPerformanceMeasurement('searchMenuCategories');
  
  try {
    const categories = await getMenuCategories(restaurantId);
    const searchLower = searchTerm.toLowerCase();
    
    const matchingCategories = categories.filter(category => 
      category.name.toLowerCase().includes(searchLower) ||
      (category.description && category.description.toLowerCase().includes(searchLower))
    );
    
    await endTracking(true);
    
    console.log('🔍 Category search results:', matchingCategories.length, 'matches for:', searchTerm);
    return matchingCategories;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'searchMenuCategories', { restaurantId, searchTerm });
    
    console.error('❌ Search menu categories error:', error);
    throw error;
  }
}

// ============================================================================
// CATEGORY VALIDATION AND UTILITIES
// ============================================================================

/**
 * Validate category availability based on time
 * @param {Object} category - Category object
 * @param {Date} checkTime - Time to check (defaults to current time)
 * @returns {boolean} True if category is available at the given time
 */
function isCategoryAvailable(category, checkTime = new Date()) {
  try {
    // Check if category is active
    if (category.isActive === false || category.showOnMenu === false) {
      return false;
    }
    
    // Check if available all day
    if (category.availableAllDay !== false) {
      return true;
    }
    
    // Check time-based availability
    if (category.availableFrom && category.availableTo) {
      const currentTimeStr = checkTime.toTimeString().slice(0, 5); // HH:MM format
      return currentTimeStr >= category.availableFrom && currentTimeStr <= category.availableTo;
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Category availability check error:', error);
    return false;
  }
}

/**
 * Get available categories for current time
 * @param {string} restaurantId - Restaurant ID
 * @param {Date} checkTime - Time to check availability (optional)
 * @returns {Promise<Array>} Available categories
 */
async function getAvailableCategories(restaurantId, checkTime = new Date()) {
  const endTracking = VediAPI.startPerformanceMeasurement('getAvailableCategories');
  
  try {
    const allCategories = await getMenuCategories(restaurantId);
    
    const availableCategories = allCategories.filter(category => 
      isCategoryAvailable(category, checkTime)
    );
    
    await endTracking(true);
    
    console.log('✅ Available categories:', availableCategories.length, 'of', allCategories.length);
    return availableCategories;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getAvailableCategories', { restaurantId });
    
    console.error('❌ Get available categories error:', error);
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

// Attach menu category functions to VediAPI
Object.assign(window.VediAPI, {
  // Core CRUD operations
  getMenuCategories,
  createMenuCategory,
  updateMenuCategory,
  deleteMenuCategory,
  
  // Organization and ordering
  reorderMenuCategories,
  toggleCategoryStatus,
  
  // Analytics and queries
  getCategoryWithStats,
  getCategoriesWithStats,
  searchMenuCategories,
  
  // Availability utilities
  isCategoryAvailable,
  getAvailableCategories
});

console.log('📁 Menu Categories Module loaded');
console.log('📝 CRUD: getMenuCategories, createMenuCategory, updateMenuCategory, deleteMenuCategory');
console.log('🔄 Organization: reorderMenuCategories, toggleCategoryStatus');
console.log('📊 Analytics: getCategoryWithStats, getCategoriesWithStats');
console.log('🔍 Search: searchMenuCategories with name and description matching');
console.log('⏰ Availability: isCategoryAvailable, getAvailableCategories with time-based logic');
console.log('✅ Comprehensive category management with ordering and availability controls');