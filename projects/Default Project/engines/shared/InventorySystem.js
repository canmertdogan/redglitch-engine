/**
 * InventorySystem.js
 * Core inventory management for cross-engine campaign runtime
 */

window.InventorySystem = class InventorySystem {
    constructor() {
        this.items = [];
        this.maxSlots = 48;
        this.selectedSlot = null;
        this.currentFilter = 'all';
        this.hotbarSlots = [null, null, null, null]; // 4 hotbar slots
        this.searchQuery = '';
    }

    /**
     * Add item to inventory
     * @param {Object} itemData - Item definition
     * @param {number} quantity - Amount to add
     * @returns {boolean} Success
     */
    addItem(itemData, quantity = 1) {
        if (!itemData || !itemData.id) {
            console.error('Invalid item data');
            return false;
        }

        // Check if item is stackable and already exists
        if (itemData.stackable) {
            const existingItem = this.items.find(item => item.id === itemData.id);
            if (existingItem) {
                const maxStack = itemData.maxStack || 99;
                const newQuantity = existingItem.quantity + quantity;
                
                if (newQuantity <= maxStack) {
                    existingItem.quantity = newQuantity;
                    existingItem.metadata.isNew = true;
                    return true;
                } else {
                    // Overflow - max out existing stack and create new
                    const overflow = newQuantity - maxStack;
                    existingItem.quantity = maxStack;
                    
                    // Try to add overflow as new item
                    if (this.items.length < this.maxSlots) {
                        return this.addItem(itemData, overflow);
                    } else {
                        console.warn('Inventory full, lost overflow items');
                        return false;
                    }
                }
            }
        }

        // Add as new item
        if (this.items.length >= this.maxSlots) {
            console.warn('Inventory full');
            return false;
        }

        const newItem = {
            id: itemData.id,
            name: itemData.name,
            type: itemData.type || 'misc',
            icon: itemData.icon || 'default',
            description: itemData.description || '',
            rarity: itemData.rarity || 'common',
            stackable: itemData.stackable || false,
            maxStack: itemData.maxStack || 99,
            quantity: quantity,
            properties: itemData.properties || {},
            metadata: {
                acquiredAt: Date.now(),
                isNew: true
            }
        };

        this.items.push(newItem);
        return true;
    }

    /**
     * Remove item from inventory
     * @param {string} itemId - Item ID
     * @param {number} quantity - Amount to remove
     * @returns {boolean} Success
     */
    removeItem(itemId, quantity = 1) {
        const itemIndex = this.items.findIndex(item => item.id === itemId);
        if (itemIndex === -1) {
            console.warn(`Item ${itemId} not found`);
            return false;
        }

        const item = this.items[itemIndex];
        
        if (item.stackable) {
            item.quantity -= quantity;
            if (item.quantity <= 0) {
                this.items.splice(itemIndex, 1);
            }
        } else {
            this.items.splice(itemIndex, 1);
        }

        return true;
    }

    /**
     * Check if inventory has item
     * @param {string} itemId - Item ID
     * @param {number} quantity - Amount needed
     * @returns {boolean}
     */
    hasItem(itemId, quantity = 1) {
        const item = this.items.find(item => item.id === itemId);
        if (!item) return false;
        return item.quantity >= quantity;
    }

    /**
     * Get item by ID
     * @param {string} itemId - Item ID
     * @returns {Object|null}
     */
    getItem(itemId) {
        return this.items.find(item => item.id === itemId) || null;
    }

    /**
     * Get all items (optionally filtered)
     * @param {string} filterType - Filter by type (all, consumable, equipment, etc)
     * @returns {Array}
     */
    getItems(filterType = 'all') {
        if (filterType === 'all') {
            return [...this.items];
        }
        return this.items.filter(item => item.type === filterType);
    }

    /**
     * Get item count
     * @returns {number}
     */
    getItemCount() {
        return this.items.length;
    }

    /**
     * Get total quantity of all items
     * @returns {number}
     */
    getTotalQuantity() {
        return this.items.reduce((total, item) => total + item.quantity, 0);
    }

    /**
     * Sort inventory
     * @param {string} sortBy - Sort method (type, name, rarity, quantity)
     */
    sortInventory(sortBy = 'type') {
        switch (sortBy) {
            case 'type':
                this.items.sort((a, b) => a.type.localeCompare(b.type));
                break;
            case 'name':
                this.items.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'rarity':
                const rarityOrder = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
                this.items.sort((a, b) => (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0));
                break;
            case 'quantity':
                this.items.sort((a, b) => b.quantity - a.quantity);
                break;
            default:
                console.warn('Unknown sort method:', sortBy);
        }
    }

    /**
     * Clear all items
     */
    clearInventory() {
        this.items = [];
        this.selectedSlot = null;
    }

    /**
     * Use item (consumable)
     * @param {string} itemId - Item ID
     * @param {Function} callback - Callback with item data
     * @returns {boolean}
     */
    useItem(itemId, callback) {
        const item = this.getItem(itemId);
        if (!item) {
            console.warn(`Item ${itemId} not found`);
            return false;
        }

        if (item.type !== 'consumable') {
            console.warn(`Item ${itemId} is not consumable`);
            return false;
        }

        // Execute callback with item properties
        if (callback && typeof callback === 'function') {
            callback(item);
        }

        // Remove one from stack
        this.removeItem(itemId, 1);
        return true;
    }

    /**
     * Drop item from inventory
     * @param {string} itemId - Item ID
     * @param {number} quantity - Amount to drop
     * @returns {boolean}
     */
    dropItem(itemId, quantity = 1) {
        const item = this.getItem(itemId);
        if (!item) return false;

        // Prevent dropping key items
        if (item.type === 'key' || item.type === 'quest') {
            console.warn('Cannot drop key/quest items');
            return false;
        }

        return this.removeItem(itemId, quantity);
    }

    /**
     * Serialize inventory for save
     * @returns {Array}
     */
    serialize() {
        return this.items.map(item => ({
            id: item.id,
            quantity: item.quantity,
            metadata: item.metadata
        }));
    }

    /**
     * Deserialize inventory from save
     * @param {Array} savedItems - Saved item data
     * @param {Object} itemDefinitions - Full item definitions (optional if window.ItemDefinitions available)
     */
    deserialize(savedItems, itemDefinitions) {
        this.items = [];
        if (!savedItems) return;
        
        for (const savedItem of savedItems) {
            let itemDef = null;
            
            if (itemDefinitions && itemDefinitions[savedItem.id]) {
                itemDef = itemDefinitions[savedItem.id];
            } else if (window.ItemDefinitions && window.ItemDefinitions.hasItem(savedItem.id)) {
                itemDef = window.ItemDefinitions.getItem(savedItem.id);
            }

            if (itemDef) {
                this.addItem({
                    ...itemDef,
                    metadata: savedItem.metadata
                }, savedItem.quantity);
            } else {
                console.warn(`Item definition not found: ${savedItem.id}`);
            }
        }
    }

    /**
     * Mark all items as not new
     */
    clearNewFlags() {
        this.items.forEach(item => {
            if (item.metadata) {
                item.metadata.isNew = false;
            }
        });
    }

    /**
     * Get rarity color
     * @param {string} rarity - Rarity level
     * @returns {string} Hex color
     */
    static getRarityColor(rarity) {
        const colors = {
            common: '#fff',
            uncommon: '#2ecc71',
            rare: '#3498db',
            epic: '#9b59b6',
            legendary: '#ffd700'
        };
        return colors[rarity] || colors.common;
    }

    /**
     * Hotbar Methods
     */

    /**
     * Assign item to hotbar slot
     * @param {number} slotIndex - Hotbar slot (0-3)
     * @param {string} itemId - Item ID
     * @returns {boolean}
     */
    assignToHotbar(slotIndex, itemId) {
        if (slotIndex < 0 || slotIndex > 3) return false;
        
        const item = this.getItem(itemId);
        if (!item || item.type !== 'consumable') {
            console.warn('Only consumable items can be added to hotbar');
            return false;
        }

        this.hotbarSlots[slotIndex] = itemId;
        return true;
    }

    /**
     * Remove item from hotbar
     * @param {number} slotIndex - Hotbar slot (0-3)
     */
    clearHotbarSlot(slotIndex) {
        if (slotIndex >= 0 && slotIndex <= 3) {
            this.hotbarSlots[slotIndex] = null;
        }
    }

    /**
     * Get hotbar item
     * @param {number} slotIndex - Hotbar slot (0-3)
     * @returns {Object|null}
     */
    getHotbarItem(slotIndex) {
        if (slotIndex < 0 || slotIndex > 3) return null;
        const itemId = this.hotbarSlots[slotIndex];
        return itemId ? this.getItem(itemId) : null;
    }

    /**
     * Use hotbar item
     * @param {number} slotIndex - Hotbar slot (0-3)
     * @param {Function} callback - Callback with item data
     * @returns {boolean}
     */
    useHotbarItem(slotIndex, callback) {
        const itemId = this.hotbarSlots[slotIndex];
        if (!itemId) return false;

        const success = this.useItem(itemId, callback);
        
        // Clear hotbar slot if item is depleted
        if (!this.getItem(itemId)) {
            this.clearHotbarSlot(slotIndex);
        }

        return success;
    }

    /**
     * Search items by name
     * @param {string} query - Search query
     * @returns {Array}
     */
    searchItems(query) {
        if (!query) return this.getItems(this.currentFilter);
        
        const lowerQuery = query.toLowerCase();
        return this.items.filter(item => {
            const matchesFilter = this.currentFilter === 'all' || item.type === this.currentFilter;
            const matchesSearch = item.name.toLowerCase().includes(lowerQuery) ||
                                 item.description.toLowerCase().includes(lowerQuery);
            return matchesFilter && matchesSearch;
        });
    }
}
