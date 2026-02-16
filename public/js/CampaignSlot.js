/**
 * CampaignSlot - Data structure for a single campaign save slot
 * Manages slot state, campaign data, player data, and metadata
 */

class CampaignSlot {
    constructor(slotId) {
        this.slotId = slotId;
        this.isEmpty = true;
        this.campaign = null;
        this.player = null;
        this.metadata = null;
    }

    /**
     * Initialize a new campaign in this slot
     */
    load(campaignFile, campaignData, playerName = 'Player') {
        this.isEmpty = false;
        
        this.campaign = {
            name: campaignData.name || 'Unnamed Campaign',
            description: campaignData.description || '',
            file: campaignFile,
            startNode: campaignData.startNode || 'start',
            currentNode: campaignData.startNode || 'start',
            globalFlags: {},
            visitedNodes: [],
            completedNodes: [],
            totalNodes: Object.keys(campaignData.nodes || {}).length,
            completionPercent: 0
        };

        this.player = {
            name: playerName,
            stats: {
                hp: 100,
                maxHp: 100,
                mana: 50,
                maxMana: 50,
                stamina: 100,
                maxStamina: 100,
                level: 1,
                exp: 0
            },
            inventory: [],
            equipment: {},
            quests: [],
            achievements: [],
            skills: []
        };

        this.metadata = {
            created: new Date().toISOString(),
            lastPlayed: new Date().toISOString(),
            playTime: 0, // seconds
            saves: 0,
            version: '1.0.0'
        };

        return this;
    }

    /**
     * Update campaign progress
     */
    updateProgress(currentNode, globalFlags = {}) {
        if (this.isEmpty) return;

        this.campaign.currentNode = currentNode;
        this.campaign.globalFlags = { ...this.campaign.globalFlags, ...globalFlags };

        // Track visited nodes
        if (!this.campaign.visitedNodes.includes(currentNode)) {
            this.campaign.visitedNodes.push(currentNode);
        }

        // Calculate completion percentage
        this.campaign.completionPercent = this.calculateCompletion();
        
        // Update metadata
        this.updateLastPlayed();
    }

    /**
     * Mark a node as completed
     */
    completeNode(nodeId) {
        if (this.isEmpty) return;
        
        if (!this.campaign.completedNodes.includes(nodeId)) {
            this.campaign.completedNodes.push(nodeId);
        }
        
        this.campaign.completionPercent = this.calculateCompletion();
    }

    /**
     * Calculate completion percentage
     */
    calculateCompletion() {
        if (this.isEmpty || !this.campaign.totalNodes) return 0;
        
        const completed = this.campaign.completedNodes.length;
        const total = this.campaign.totalNodes;
        
        return Math.round((completed / total) * 100);
    }

    /**
     * Update player state
     */
    updatePlayer(playerData) {
        if (this.isEmpty) return;

        // Deep merge player data
        if (playerData.stats) {
            this.player.stats = { ...this.player.stats, ...playerData.stats };
        }
        if (playerData.inventory) {
            this.player.inventory = playerData.inventory;
        }
        if (playerData.equipment) {
            this.player.equipment = playerData.equipment;
        }
        if (playerData.quests) {
            this.player.quests = playerData.quests;
        }
        if (playerData.achievements) {
            this.player.achievements = playerData.achievements;
        }
        if (playerData.skills) {
            this.player.skills = playerData.skills;
        }

        this.updateLastPlayed();
    }

    /**
     * Update play time
     */
    updatePlayTime(deltaSeconds) {
        if (this.isEmpty) return;
        this.metadata.playTime += deltaSeconds;
    }

    /**
     * Update last played timestamp
     */
    updateLastPlayed() {
        if (this.isEmpty) return;
        this.metadata.lastPlayed = new Date().toISOString();
    }

    /**
     * Increment save count
     */
    incrementSaveCount() {
        if (this.isEmpty) return;
        this.metadata.saves++;
    }

    /**
     * Clear the slot
     */
    clear() {
        this.isEmpty = true;
        this.campaign = null;
        this.player = null;
        this.metadata = null;
    }

    /**
     * Get formatted play time
     */
    getFormattedPlayTime() {
        if (this.isEmpty) return '0h 0m';
        
        const seconds = this.metadata.playTime;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    /**
     * Get relative time since last played
     */
    getRelativeTime() {
        if (this.isEmpty) return '';
        
        const lastPlayed = new Date(this.metadata.lastPlayed);
        const now = new Date();
        const diffMs = now - lastPlayed;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 60) {
            return `${diffMins}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else if (diffDays < 7) {
            return `${diffDays}d ago`;
        } else {
            return lastPlayed.toLocaleDateString();
        }
    }

    /**
     * Check if campaign is complete
     */
    isComplete() {
        if (this.isEmpty) return false;
        return this.campaign.completionPercent >= 100;
    }

    /**
     * Serialize to JSON
     */
    toJSON() {
        return {
            slotId: this.slotId,
            isEmpty: this.isEmpty,
            campaign: this.campaign,
            player: this.player,
            metadata: this.metadata
        };
    }

    /**
     * Deserialize from JSON
     */
    static fromJSON(json) {
        const slot = new CampaignSlot(json.slotId);
        slot.isEmpty = json.isEmpty;
        slot.campaign = json.campaign;
        slot.player = json.player;
        slot.metadata = json.metadata;
        return slot;
    }

    /**
     * Validate slot data
     */
    validate() {
        if (this.isEmpty) return true;

        // Check required campaign fields
        if (!this.campaign || !this.campaign.name || !this.campaign.file) {
            return false;
        }

        // Check required player fields
        if (!this.player || !this.player.name) {
            return false;
        }

        // Check required metadata fields
        if (!this.metadata || !this.metadata.created || !this.metadata.lastPlayed) {
            return false;
        }

        return true;
    }

    /**
     * Create a copy of this slot
     */
    clone() {
        const json = this.toJSON();
        return CampaignSlot.fromJSON(json);
    }

    /**
     * Get slot summary for UI display
     */
    getSummary() {
        if (this.isEmpty) {
            return {
                slotId: this.slotId,
                isEmpty: true,
                label: 'EMPTY SLOT',
                sublabel: 'Start a new campaign'
            };
        }

        return {
            slotId: this.slotId,
            isEmpty: false,
            campaignName: this.campaign.name,
            progress: this.campaign.completionPercent,
            playTime: this.getFormattedPlayTime(),
            relativeTime: this.getRelativeTime(),
            isComplete: this.isComplete(),
            playerName: this.player.name,
            saves: this.metadata.saves
        };
    }
}

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CampaignSlot;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.CampaignSlot = CampaignSlot;
}
