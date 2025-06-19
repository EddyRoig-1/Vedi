// api/business/menu-items.js - Menu Item Management
/**
 * Menu Items Module
 * 
 * Handles menu item operations including creation, updates, stock management,
 * pricing, and item-specific queries. Provides comprehensive menu item
 * management for restaurant systems with advanced search and filtering.
 */

// ============================================================================
// MENU ITEM CRUD OPERATIONS
// ============================================================================

/**
 * Get all menu items for a restaurant
 * @param {string} restaurantId - Restaurant ID
 * @param {Object} options - Query options (filters, sorting)
 * @returns {Promise<Array>} Array of menu items
 */
async function getMenuItems(restaurantId, options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('getMenuItems');
  
  try {
    const db = getFirebaseDb();
    
    if (!restaurantId) {
      throw new Error('Restaurant ID is required');
    }
    
    let query = db.collection('menuItems')
      .where('restaurantId', '==', restaurantId);
    
    // Apply filters
    if (options.categoryId) {
      query = query.where('categoryId', '==', options.categoryId);
    }
    
    if (options.isActive !== undefined) {
      query = query.where('isActive', '==', options.isActive);
    }
    
    if (options.inStock !== undefined) {
      query = query.where('inStock', '==', options.inStock);
    }
    
    // Apply ordering
    if (options.orderBy) {
      query = query.orderBy(options.orderBy, options.orderDirection || 'asc');
    }
    
    // Apply limit
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    const querySnapshot = await query.get();
    let items = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Sort by order within category if no specific ordering
    if (!options.orderBy) {
      items.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    
    await endTracking(true);
    
    console.log('✅ Retrieved menu items:', items.length, 'items');
    return items;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getMenuItems', { restaurantId });
    
    console.error('❌ Get menu items error:', error);
    throw error;
  }
}

/**
 * Get menu items by category
 * @param {string} restaurantId - Restaurant ID
 * @param {string} categoryId - Category ID
 * @returns {Promise<Array>} Array of menu items in category
 */
async function getMenuItemsByCategory(restaurantId, categoryId) {
  const endTracking = VediAPI.startPerformanceMeasurement('getMenuItemsByCategory');
  
  try {
    const items = await getMenuItems(restaurantId, { categoryId });
    
    await endTracking(true);
    
    console.log('✅ Retrieved items by category:', items.length, 'items');
    return items;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getMenuItemsByCategory', { restaurantId, categoryId });
    
    console.error('❌ Get menu items by category error:', error);
    throw error;
  }
}

/**
 * Create new menu item
 * @param {Object} itemData - Menu item information
 * @returns {Promise<Object>} Created menu item with ID
 */
async function createMenuItem(itemData) {
  const endTracking = VediAPI.startPerformanceMeasurement('createMenuItem');
  
  try {
    const db = getFirebaseDb();
    const auth = getFirebaseAuth();
    
    // Validate required fields
    if (!itemData.name || !itemData.restaurantId || !itemData.categoryId) {
      throw new Error('Item name, restaurant ID, and category ID are required');
    }
    
    if (!itemData.price || itemData.price <= 0) {
      throw new Error('Valid price is required');
    }
    
    // Get next order number if not provided
    let order = itemData.order;
    if (order === undefined || order === null) {
      const existingItems = await getMenuItemsByCategory(itemData.restaurantId, itemData.categoryId);
      order = existingItems.length;
    }
    
    // Clean and structure item data
    const item = VediAPI.removeUndefinedValues({
      restaurantId: itemData.restaurantId,
      categoryId: itemData.categoryId,
      name: VediAPI.sanitizeInput(itemData.name),
      description: itemData.description ? VediAPI.sanitizeInput(itemData.description) : '',
      price: parseFloat(itemData.price),
      order: order,
      
      // Status and availability
      isActive: itemData.isActive !== false, // Default to true
      inStock: itemData.inStock !== false, // Default to true
      
      // Item details
      imageUrl: itemData.image || '',
      prepTime: itemData.prepTime || 0, // minutes
      calories: itemData.calories || null,
      
      // Dietary information
      vegetarian: itemData.vegetarian || false,
      vegan: itemData.vegan || false,
      glutenFree: itemData.glutenFree || false,
      spicy: itemData.spicy || false,
      allergens: itemData.allergens || [],
      
      // Customization options
      modifiers: itemData.modifiers || [],
      customizable: itemData.customizable || false,
      
      // Inventory (if tracked)
      trackInventory: itemData.trackInventory || false,
      currentStock: itemData.currentStock || null,
      lowStockThreshold: itemData.lowStockThreshold || null,
      
      // Metadata
      createdBy: auth.currentUser?.uid || 'system',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Add to database
    const docRef = await db.collection('menuItems').add(item);
    const doc = await docRef.get();
    const createdItem = { id: doc.id, ...doc.data() };
    
    // Track item creation
    await VediAPI.trackUserActivity('menu_item_created', {
      restaurantId: itemData.restaurantId,
      categoryId: itemData.categoryId,
      itemId: docRef.id,
      itemName: item.name,
      price: item.price
    });
    
    await endTracking(true);
    
    console.log('✅ Menu item created:', docRef.id);
    return createdItem;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'createMenuItem', { 
      restaurantId: itemData.restaurantId,
      itemName: itemData.name 
    });
    
    console.error('❌ Create menu item error:', error);
    throw error;
  }
}

/**
 * Update menu item
 * @param {string} itemId - Item ID to update
 * @param {Object} itemData - Updated item data
 * @returns {Promise<Object>} Updated menu item
 */
async function updateMenuItem(itemId, itemData) {
  const endTracking = VediAPI.startPerformanceMeasurement('updateMenuItem');
  
  try {
    const db = getFirebaseDb();
    
    // Validate item exists
    const existingDoc = await db.collection('menuItems').doc(itemId).get();
    if (!existingDoc.exists) {
      throw new Error('Menu item not found');
    }
    
    // Sanitize updates
    const updates = VediAPI.removeUndefinedValues({
      name: itemData.name ? VediAPI.sanitizeInput(itemData.name) : undefined,
      description: itemData.description !== undefined ? VediAPI.sanitizeInput(itemData.description) : undefined,
      price: itemData.price !== undefined ? parseFloat(itemData.price) : undefined,
      order: itemData.order !== undefined ? itemData.order : undefined,
      categoryId: itemData.categoryId ? itemData.categoryId : undefined,
      
      // Status and availability
      isActive: itemData.isActive !== undefined ? itemData.isActive : undefined,
      inStock: itemData.inStock !== undefined ? itemData.inStock : undefined,
      
      // Item details
      imageUrl: itemData.image !== undefined ? itemData.image : undefined,
      prepTime: itemData.prepTime !== undefined ? itemData.prepTime : undefined,
      calories: itemData.calories !== undefined ? itemData.calories : undefined,
      
      // Dietary information
      vegetarian: itemData.vegetarian !== undefined ? itemData.vegetarian : undefined,
      vegan: itemData.vegan !== undefined ? itemData.vegan : undefined,
      glutenFree: itemData.glutenFree !== undefined ? itemData.glutenFree : undefined,
      spicy: itemData.spicy !== undefined ? itemData.spicy : undefined,
      allergens: itemData.allergens !== undefined ? itemData.allergens : undefined,
      
      // Customization options
      modifiers: itemData.modifiers !== undefined ? itemData.modifiers : undefined,
      customizable: itemData.customizable !== undefined ? itemData.customizable : undefined,
      
      // Inventory
      trackInventory: itemData.trackInventory !== undefined ? itemData.trackInventory : undefined,
      currentStock: itemData.currentStock !== undefined ? itemData.currentStock : undefined,
      lowStockThreshold: itemData.lowStockThreshold !== undefined ? itemData.lowStockThreshold : undefined,
      
      // Always update timestamp
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Validate price if provided
    if (updates.price !== undefined && (updates.price <= 0 || isNaN(updates.price))) {
      throw new Error('Valid price is required');
    }
    
    // Update item
    await db.collection('menuItems').doc(itemId).update(updates);
    
    // Get updated item
    const updatedDoc = await db.collection('menuItems').doc(itemId).get();
    const updatedItem = { id: updatedDoc.id, ...updatedDoc.data() };
    
    // Track item update
    await VediAPI.trackUserActivity('menu_item_updated', {
      restaurantId: updatedItem.restaurantId,
      itemId: itemId,
      fieldsUpdated: Object.keys(updates),
      itemName: updatedItem.name
    });
    
    await endTracking(true);
    
    console.log('✅ Menu item updated:', itemId);
    return updatedItem;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'updateMenuItem', { itemId });
    
    console.error('❌ Update menu item error:', error);
    throw error;
  }
}

/**
 * Delete menu item
 * @param {string} itemId - Item ID to delete
 * @returns {Promise<void>} Resolves when item is deleted
 */
async function deleteMenuItem(itemId) {
  const endTracking = VediAPI.startPerformanceMeasurement('deleteMenuItem');
  
  try {
    const db = getFirebaseDb();
    
    // Get item data before deletion for tracking
    const itemDoc = await db.collection('menuItems').doc(itemId).get();
    if (!itemDoc.exists) {
      throw new Error('Menu item not found');
    }
    
    const itemData = itemDoc.data();
    
    // Delete item
    await db.collection('menuItems').doc(itemId).delete();
    
    // Track item deletion
    await VediAPI.trackUserActivity('menu_item_deleted', {
      restaurantId: itemData.restaurantId,
      itemId: itemId,
      itemName: itemData.name,
      categoryId: itemData.categoryId
    });
    
    await endTracking(true);
    
    console.log('✅ Menu item deleted:', itemId);
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'deleteMenuItem', { itemId });
    
    console.error('❌ Delete menu item error:', error);
    throw error;
  }
}

// ============================================================================
// STOCK AND INVENTORY MANAGEMENT
// ============================================================================

/**
 * Update item stock status
 * @param {string} itemId - Item ID
 * @param {boolean} inStock - Stock status
 * @param {number} currentStock - Current stock quantity (optional)
 * @returns {Promise<Object>} Updated menu item
 */
async function updateItemStock(itemId, inStock, currentStock = null) {
  const endTracking = VediAPI.startPerformanceMeasurement('updateItemStock');
  
  try {
    const updates = { 
      inStock: inStock,
      stockUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (currentStock !== null) {
      updates.currentStock = currentStock;
    }
    
    const updatedItem = await updateMenuItem(itemId, updates);
    
    await endTracking(true);
    
    console.log('✅ Item stock updated:', itemId, inStock ? 'IN STOCK' : 'OUT OF STOCK');
    return updatedItem;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'updateItemStock', { itemId, inStock });
    
    console.error('❌ Update item stock error:', error);
    throw error;
  }
}

/**
 * Bulk update stock status for multiple items
 * @param {Array} stockUpdates - Array of {itemId, inStock, currentStock}
 * @returns {Promise<Array>} Array of update results
 */
async function bulkUpdateStock(stockUpdates) {
  const endTracking = VediAPI.startPerformanceMeasurement('bulkUpdateStock');
  
  try {
    const db = getFirebaseDb();
    
    if (!Array.isArray(stockUpdates) || stockUpdates.length === 0) {
      throw new Error('Valid stock updates array is required');
    }
    
    const batch = db.batch();
    const results = [];
    
    for (const update of stockUpdates) {
      try {
        const { itemId, inStock, currentStock } = update;
        
        if (!itemId) {
          results.push({ itemId: 'unknown', success: false, error: 'Item ID required' });
          continue;
        }
        
        const itemRef = db.collection('menuItems').doc(itemId);
        const updateData = {
          inStock: inStock,
          stockUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (currentStock !== undefined && currentStock !== null) {
          updateData.currentStock = currentStock;
        }
        
        batch.update(itemRef, updateData);
        results.push({ itemId, success: true });
        
      } catch (error) {
        results.push({ itemId: update.itemId || 'unknown', success: false, error: error.message });
      }
    }
    
    // Commit all updates
    await batch.commit();
    
    await endTracking(true);
    
    console.log('✅ Bulk stock update completed:', results.filter(r => r.success).length, 'successful');
    return results;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'bulkUpdateStock', { updateCount: stockUpdates?.length });
    
    console.error('❌ Bulk update stock error:', error);
    throw error;
  }
}

// ============================================================================
// MENU COMPILATION AND DISPLAY
// ============================================================================

/**
 * Get full menu with categories and items organized
 * @param {string} restaurantId - Restaurant ID
 * @param {Object} options - Display options (showInactive, etc.)
 * @returns {Promise<Object>} Complete menu structure
 */
async function getFullMenu(restaurantId, options = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('getFullMenu');
  
  try {
    // Get categories and items in parallel
    const [categories, items] = await Promise.all([
      VediAPI.getMenuCategories(restaurantId),
      getMenuItems(restaurantId)
    ]);
    
    // Filter categories and items based on options
    let filteredCategories = categories;
    let filteredItems = items;
    
    if (!options.showInactive) {
      filteredCategories = categories.filter(cat => cat.isActive !== false);
      filteredItems = items.filter(item => item.isActive !== false);
    }
    
    if (options.onlyInStock) {
      filteredItems = filteredItems.filter(item => item.inStock !== false);
    }
    
    if (options.onlyAvailable) {
      const currentTime = new Date();
      filteredCategories = filteredCategories.filter(cat => 
        VediAPI.isCategoryAvailable(cat, currentTime)
      );
    }
    
    // Group items by category
    const categoriesWithItems = filteredCategories.map(category => ({
      ...category,
      items: filteredItems
        .filter(item => item.categoryId === category.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
    }));
    
    // Calculate menu statistics
    const stats = {
      totalCategories: categoriesWithItems.length,
      totalItems: filteredItems.length,
      averagePrice: filteredItems.length > 0 ? 
        filteredItems.reduce((sum, item) => sum + (item.price || 0), 0) / filteredItems.length : 0,
      priceRange: {
        min: filteredItems.length > 0 ? Math.min(...filteredItems.map(item => item.price || 0)) : 0,
        max: filteredItems.length > 0 ? Math.max(...filteredItems.map(item => item.price || 0)) : 0
      },
      inStockItems: filteredItems.filter(item => item.inStock !== false).length,
      outOfStockItems: filteredItems.filter(item => item.inStock === false).length
    };
    
    const fullMenu = {
      restaurantId: restaurantId,
      categories: categoriesWithItems,
      allItems: filteredItems,
      statistics: stats,
      generatedAt: new Date().toISOString(),
      options: options
    };
    
    await endTracking(true);
    
    console.log('✅ Full menu compiled:', categoriesWithItems.length, 'categories,', filteredItems.length, 'items');
    return fullMenu;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'getFullMenu', { restaurantId });
    
    console.error('❌ Get full menu error:', error);
    throw error;
  }
}

/**
 * Search menu items by name, description, or dietary filters
 * @param {string} restaurantId - Restaurant ID
 * @param {string} searchTerm - Search term
 * @param {Object} filters - Dietary and other filters
 * @returns {Promise<Array>} Array of matching menu items
 */
async function searchMenuItems(restaurantId, searchTerm, filters = {}) {
  const endTracking = VediAPI.startPerformanceMeasurement('searchMenuItems');
  
  try {
    const allItems = await getMenuItems(restaurantId, { isActive: true });
    const searchLower = searchTerm.toLowerCase();
    
    let matchingItems = allItems.filter(item => {
      // Text search in name and description
      const nameMatch = item.name.toLowerCase().includes(searchLower);
      const descriptionMatch = item.description && item.description.toLowerCase().includes(searchLower);
      
      return nameMatch || descriptionMatch;
    });
    
    // Apply dietary filters
    if (filters.vegetarian) {
      matchingItems = matchingItems.filter(item => item.vegetarian === true);
    }
    
    if (filters.vegan) {
      matchingItems = matchingItems.filter(item => item.vegan === true);
    }
    
    if (filters.glutenFree) {
      matchingItems = matchingItems.filter(item => item.glutenFree === true);
    }
    
    if (filters.spicy !== undefined) {
      matchingItems = matchingItems.filter(item => item.spicy === filters.spicy);
    }
    
    // Price range filter
    if (filters.minPrice !== undefined) {
      matchingItems = matchingItems.filter(item => item.price >= filters.minPrice);
    }
    
    if (filters.maxPrice !== undefined) {
      matchingItems = matchingItems.filter(item => item.price <= filters.maxPrice);
    }
    
    // Category filter
    if (filters.categoryId) {
      matchingItems = matchingItems.filter(item => item.categoryId === filters.categoryId);
    }
    
    // Stock filter
    if (filters.inStock !== undefined) {
      matchingItems = matchingItems.filter(item => item.inStock === filters.inStock);
    }
    
    await endTracking(true);
    
    console.log('🔍 Menu search results:', matchingItems.length, 'matches for:', searchTerm);
    return matchingItems;
    
  } catch (error) {
    await endTracking(false, { error: error.message });
    await VediAPI.trackError(error, 'searchMenuItems', { restaurantId, searchTerm });
    
    console.error('❌ Search menu items error:', error);
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

// Attach menu item functions to VediAPI
Object.assign(window.VediAPI, {
  // Core CRUD operations
  getMenuItems,
  getMenuItemsByCategory,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  
  // Stock management
  updateItemStock,
  bulkUpdateStock,
  
  // Menu compilation and search
  getFullMenu,
  searchMenuItems
});

console.log('🍽️ Menu Items Module loaded');
console.log('📝 CRUD: getMenuItems, getMenuItemsByCategory, createMenuItem, updateMenuItem, deleteMenuItem');
console.log('📦 Stock: updateItemStock, bulkUpdateStock with batch operations');
console.log('📋 Menu: getFullMenu with complete category-item organization');
console.log('🔍 Search: searchMenuItems with dietary filters and price ranges');
console.log('🏷️ Features: Dietary tags, modifiers, inventory tracking, prep times');
console.log('✅ Comprehensive menu item management with advanced filtering capabilities');
