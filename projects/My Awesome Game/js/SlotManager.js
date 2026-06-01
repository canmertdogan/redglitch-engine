/**
 * SlotManager - Backend system for managing campaign save slots
 * Handles CRUD operations, validation, and slot utilities
 */

class SlotManager {
    static TOTAL_SLOTS = 5;
    static STORAGE_KEY_PREFIX = 'redglitch_slot_';

    /**
     * Get all slots
     */
    static async getAllSlots() {
        const slots = [];
        
        for (let i = 1; i <= this.TOTAL_SLOTS; i++) {
            const slot = await this.getSlot(i);
            slots.push(slot);
        }
        
        return slots;
    }

    /**
     * Get a specific slot by ID
     */
    static async getSlot(slotId) {
        // Validate slot ID
        if (slotId < 1 || slotId > this.TOTAL_SLOTS) {
            throw new Error(`Invalid slot ID: ${slotId}. Must be between 1 and ${this.TOTAL_SLOTS}`);
        }

        // Try to load from storage
        const slotData = await this._loadSlotData(slotId);
        
        if (slotData) {
            try {
                return CampaignSlot.fromJSON(slotData);
            } catch (error) {
                console.error(`Failed to parse slot ${slotId}:`, error);
                // Return empty slot if corrupted
                return new CampaignSlot(slotId);
            }
        }
        
        // Return empty slot if not found
        return new CampaignSlot(slotId);
    }

    /**
     * Create or update a slot
     */
    static async saveSlot(slot) {
        if (!(slot instanceof CampaignSlot)) {
            throw new Error('Invalid slot object');
        }

        // Validate slot data
        if (!slot.validate()) {
            throw new Error('Invalid slot data');
        }

        // Increment save count
        if (!slot.isEmpty) {
            slot.incrementSaveCount();
        }

        // Save to storage
        await this._saveSlotData(slot.slotId, slot.toJSON());
        
        console.log(`[SlotManager] Slot ${slot.slotId} saved successfully`);
        return slot;
    }

    /**
     * Delete a slot
     */
    static async deleteSlot(slotId) {
        // Validate slot ID
        if (slotId < 1 || slotId > this.TOTAL_SLOTS) {
            throw new Error(`Invalid slot ID: ${slotId}`);
        }

        await this._deleteSlotData(slotId);
        console.log(`[SlotManager] Slot ${slotId} deleted`);
    }

    /**
     * Check if a slot is empty
     */
    static async isSlotEmpty(slotId) {
        const slot = await this.getSlot(slotId);
        return slot.isEmpty;
    }

    /**
     * Get available (empty) slots
     */
    static async getAvailableSlots() {
        const slots = await this.getAllSlots();
        return slots.filter(slot => slot.isEmpty);
    }

    /**
     * Get occupied slots
     */
    static async getOccupiedSlots() {
        const slots = await this.getAllSlots();
        return slots.filter(slot => !slot.isEmpty);
    }

    /**
     * Get slot metadata only (for UI display)
     */
    static async getSlotMetadata(slotId) {
        const slot = await this.getSlot(slotId);
        return slot.getSummary();
    }

    /**
     * Get all slot metadata
     */
    static async getAllSlotMetadata() {
        const slots = await this.getAllSlots();
        return slots.map(slot => slot.getSummary());
    }

    /**
     * Create a new slot with campaign
     */
    static async createSlot(slotId, campaignFile, campaignData, playerName = 'Player') {
        // Check if slot is empty
        const existingSlot = await this.getSlot(slotId);
        if (!existingSlot.isEmpty) {
            throw new Error(`Slot ${slotId} is already occupied`);
        }

        // Create new slot
        const slot = new CampaignSlot(slotId);
        slot.load(campaignFile, campaignData, playerName);

        // Save to storage
        await this.saveSlot(slot);
        
        console.log(`[SlotManager] Created new slot ${slotId} with campaign: ${campaignData.name}`);
        return slot;
    }

    /**
     * Update slot progress
     */
    static async updateProgress(slotId, currentNode, globalFlags = {}) {
        const slot = await this.getSlot(slotId);
        
        if (slot.isEmpty) {
            throw new Error(`Cannot update empty slot ${slotId}`);
        }

        slot.updateProgress(currentNode, globalFlags);
        await this.saveSlot(slot);
        
        return slot;
    }

    /**
     * Update slot player data
     */
    static async updatePlayer(slotId, playerData) {
        const slot = await this.getSlot(slotId);
        
        if (slot.isEmpty) {
            throw new Error(`Cannot update empty slot ${slotId}`);
        }

        slot.updatePlayer(playerData);
        await this.saveSlot(slot);
        
        return slot;
    }

    /**
     * Update play time
     */
    static async updatePlayTime(slotId, deltaSeconds) {
        const slot = await this.getSlot(slotId);
        
        if (slot.isEmpty) return;

        slot.updatePlayTime(deltaSeconds);
        await this.saveSlot(slot);
    }

    /**
     * Copy slot to another slot
     */
    static async copySlot(sourceSlotId, targetSlotId) {
        if (sourceSlotId === targetSlotId) {
            throw new Error('Cannot copy slot to itself');
        }

        const sourceSlot = await this.getSlot(sourceSlotId);
        
        if (sourceSlot.isEmpty) {
            throw new Error(`Cannot copy empty slot ${sourceSlotId}`);
        }

        const targetSlot = await this.getSlot(targetSlotId);
        
        if (!targetSlot.isEmpty) {
            throw new Error(`Target slot ${targetSlotId} is already occupied`);
        }

        // Clone source slot
        const clonedSlot = sourceSlot.clone();
        clonedSlot.slotId = targetSlotId;
        clonedSlot.metadata.created = new Date().toISOString();
        clonedSlot.metadata.saves = 0;

        await this.saveSlot(clonedSlot);
        
        console.log(`[SlotManager] Copied slot ${sourceSlotId} to slot ${targetSlotId}`);
        return clonedSlot;
    }

    /**
     * Export slot as JSON string
     */
    static async exportSlot(slotId) {
        const slot = await this.getSlot(slotId);
        
        if (slot.isEmpty) {
            throw new Error(`Cannot export empty slot ${slotId}`);
        }

        return JSON.stringify(slot.toJSON(), null, 2);
    }

    /**
     * Import slot from JSON string
     */
    static async importSlot(slotId, jsonString) {
        try {
            const slotData = JSON.parse(jsonString);
            
            // Override slot ID
            slotData.slotId = slotId;
            
            // Create slot from data
            const slot = CampaignSlot.fromJSON(slotData);
            
            // Validate
            if (!slot.validate()) {
                throw new Error('Invalid slot data');
            }

            // Save
            await this.saveSlot(slot);
            
            console.log(`[SlotManager] Imported slot ${slotId}`);
            return slot;
        } catch (error) {
            throw new Error(`Failed to import slot: ${error.message}`);
        }
    }

    /**
     * Clear all slots (for testing/reset)
     */
    static async clearAllSlots() {
        for (let i = 1; i <= this.TOTAL_SLOTS; i++) {
            await this.deleteSlot(i);
        }
        console.log('[SlotManager] All slots cleared');
    }

    // ============================================
    // Storage Layer (platform-specific)
    // ============================================

    /**
     * Load slot data from storage
     */
    static async _loadSlotData(slotId) {
        // Detect platform
        if (this._isElectron()) {
            return await this._loadFromFile(slotId);
        } else if (this._isWeb()) {
            return this._loadFromLocalStorage(slotId);
        } else {
            throw new Error('Unsupported platform');
        }
    }

    /**
     * Save slot data to storage
     */
    static async _saveSlotData(slotId, data) {
        // Detect platform
        if (this._isElectron()) {
            await this._saveToFile(slotId, data);
        } else if (this._isWeb()) {
            this._saveToLocalStorage(slotId, data);
        } else {
            throw new Error('Unsupported platform');
        }
    }

    /**
     * Delete slot data from storage
     */
    static async _deleteSlotData(slotId) {
        // Detect platform
        if (this._isElectron()) {
            await this._deleteFile(slotId);
        } else if (this._isWeb()) {
            this._deleteFromLocalStorage(slotId);
        } else {
            throw new Error('Unsupported platform');
        }
    }

    // ============================================
    // Electron File System Storage
    // ============================================

    static async _loadFromFile(slotId) {
        try {
            const response = await fetch(`/api/slots/${slotId}`);
            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.warn(`Failed to load slot ${slotId}:`, error);
            return null;
        }
    }

    static async _saveToFile(slotId, data) {
        try {
            const response = await fetch(`/api/slots/${slotId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                throw new Error('Failed to save slot');
            }
        } catch (error) {
            console.error(`Failed to save slot ${slotId}:`, error);
            throw error;
        }
    }

    static async _deleteFile(slotId) {
        try {
            const response = await fetch(`/api/slots/${slotId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete slot');
            }
        } catch (error) {
            console.error(`Failed to delete slot ${slotId}:`, error);
            throw error;
        }
    }

    // ============================================
    // Web localStorage Storage
    // ============================================

    static _loadFromLocalStorage(slotId) {
        try {
            const key = this.STORAGE_KEY_PREFIX + slotId;
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.warn(`Failed to load slot ${slotId} from localStorage:`, error);
            return null;
        }
    }

    static _saveToLocalStorage(slotId, data) {
        try {
            const key = this.STORAGE_KEY_PREFIX + slotId;
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error(`Failed to save slot ${slotId} to localStorage:`, error);
            throw error;
        }
    }

    static _deleteFromLocalStorage(slotId) {
        try {
            const key = this.STORAGE_KEY_PREFIX + slotId;
            localStorage.removeItem(key);
        } catch (error) {
            console.error(`Failed to delete slot ${slotId} from localStorage:`, error);
            throw error;
        }
    }

    // ============================================
    // Platform Detection
    // ============================================

    static _isElectron() {
        return typeof window !== 'undefined' && 
               window.process && 
               window.process.type === 'renderer';
    }

    static _isWeb() {
        return typeof window !== 'undefined' && 
               typeof localStorage !== 'undefined';
    }
}

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SlotManager;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.SlotManager = SlotManager;
}
