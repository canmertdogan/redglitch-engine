/**
 * ItemDefinitions.js
 * Loads and manages item definitions from Item Studio
 * Provides normalization between Item Studio format and Campaign Runtime format
 */

class ItemDefinitions {
    constructor() {
        this.definitions = new Map();
        this.loaded = false;
    }

    /**
     * Load all item definitions from server
     * @returns {Promise<void>}
     */
    async load() {
        // Always ensure defaults are present
        this.createDefaultItems();

        try {
            const response = await fetch('/dunyalar/definitions/items.json');
            if (!response.ok) {
                console.warn('[ItemDefinitions] No items.json found, using defaults only');
                return;
            }
            
            const items = await response.json();
            
            // Normalize and store items (will override defaults if IDs match)
            items.forEach(item => {
                const normalized = this.normalizeItem(item);
                this.definitions.set(normalized.id, normalized);
            });
            
            this.loaded = true;
            console.log(`[ItemDefinitions] Loaded ${this.definitions.size} item definitions (merged with defaults)`);
        } catch (error) {
            console.error('[ItemDefinitions] Failed to load items:', error);
        }
    }

    /**
     * Create default items if none exist
     */
    createDefaultItems() {
        console.log('[ItemDefinitions] Creating default items');
        
        const defaults = [
            {
                id: 'health_potion',
                name: 'Health Potion',
                type: 'consumable',
                sprite: 'potion_red',
                rarity: 'common',
                stackable: true,
                maxStack: 99,
                description: 'Restores 50 HP',
                properties: { healAmount: 50 }
            },
            {
                id: 'mana_potion',
                name: 'Mana Potion',
                type: 'consumable',
                sprite: 'potion_blue',
                rarity: 'common',
                stackable: true,
                maxStack: 99,
                description: 'Restores 30 Mana',
                properties: { manaAmount: 30 }
            },
            {
                id: 'iron_sword',
                name: 'Iron Sword',
                type: 'equipment',
                sprite: 'sword',
                rarity: 'uncommon',
                stackable: false,
                maxStack: 1,
                description: 'A sturdy iron blade',
                properties: { damage: 15, attackSpeed: 1.0 }
            }
        ];

        defaults.forEach(item => {
            const normalized = this.normalizeItem(item);
            this.definitions.set(normalized.id, normalized);
        });

        this.loaded = true;
    }

    /**
     * Normalize item from Item Studio format to Inventory System format
     * Handles both old and new formats for backward compatibility
     * @param {Object} itemData - Raw item from Item Studio
     * @returns {Object} Normalized item
     */
    normalizeItem(itemData) {
        return {
            id: itemData.id,
            name: itemData.name,
            type: itemData.type,
            
            // Icon can be different from sprite for flexibility
            icon: itemData.icon || itemData.sprite || 'default',
            
            // Description - support both 'desc' and 'description'
            description: itemData.description || itemData.desc || '',
            
            // Rarity with default
            rarity: itemData.rarity || 'common',
            
            // Stacking - default true for consumables/materials, false otherwise
            stackable: itemData.stackable !== undefined ? itemData.stackable : 
                      (itemData.type === 'consumable' || itemData.type === 'material'),
            
            // Max stack size
            maxStack: itemData.maxStack || 
                     (itemData.stackable !== false ? 99 : 1),
            
            // Properties object - migrate old 'value' field if needed
            properties: itemData.properties || {
                value: itemData.value || 0
            },
            
            // Store original sprite for rendering
            sprite: itemData.sprite || 'default'
        };
    }

    /**
     * Get item definition by ID
     * @param {string} itemId - Item ID
     * @returns {Object|null} Item definition
     */
    getItem(itemId) {
        const item = this.definitions.get(itemId);
        if (!item) {
            console.warn(`[ItemDefinitions] Item not found: ${itemId}`);
            return null;
        }
        return item;
    }

    /**
     * Get all items of a specific type
     * @param {string} type - Item type
     * @returns {Array} Array of items
     */
    getItemsByType(type) {
        return Array.from(this.definitions.values())
            .filter(item => item.type === type);
    }

    /**
     * Get all items of a specific rarity
     * @param {string} rarity - Rarity level
     * @returns {Array} Array of items
     */
    getItemsByRarity(rarity) {
        return Array.from(this.definitions.values())
            .filter(item => item.rarity === rarity);
    }

    /**
     * Get all items
     * @returns {Array} All items
     */
    getAllItems() {
        return Array.from(this.definitions.values());
    }

    /**
     * Create item instance with quantity and metadata
     * @param {string} itemId - Item ID
     * @param {number} quantity - Quantity
     * @returns {Object|null} Item instance ready for inventory
     */
    createInstance(itemId, quantity = 1) {
        const definition = this.getItem(itemId);
        if (!definition) {
            console.error(`[ItemDefinitions] Cannot create instance of missing item: ${itemId}`);
            return null;
        }
        
        // Create a fresh copy with quantity and metadata
        return {
            ...definition,
            quantity: quantity,
            metadata: {
                acquiredAt: Date.now(),
                isNew: true
            }
        };
    }

    /**
     * Check if item exists
     * @param {string} itemId - Item ID
     * @returns {boolean}
     */
    hasItem(itemId) {
        return this.definitions.has(itemId);
    }

    /**
     * Get total number of defined items
     * @returns {number}
     */
    getCount() {
        return this.definitions.size;
    }

    /**
     * Search items by name
     * @param {string} query - Search query
     * @returns {Array} Matching items
     */
    searchItems(query) {
        if (!query) return this.getAllItems();
        
        const lowerQuery = query.toLowerCase();
        return Array.from(this.definitions.values())
            .filter(item => 
                item.name.toLowerCase().includes(lowerQuery) ||
                item.description.toLowerCase().includes(lowerQuery) ||
                item.id.toLowerCase().includes(lowerQuery)
            );
    }
}

// Create global instance
window.ItemDefinitions = new ItemDefinitions();

console.log('[ItemDefinitions] System initialized');
