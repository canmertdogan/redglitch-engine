/**
 * EngineAdapter - Base interface for all engine adapters
 * Provides a uniform API for Campaign Controller to interact with different engine types
 */
class EngineAdapter {
    constructor(engineType) {
        if (new.target === EngineAdapter) {
            throw new TypeError("Cannot construct EngineAdapter instances directly");
        }
        
        this.engineType = engineType;
        this.engine = null;
        this.isInitialized = false;
        this.isLoaded = false;
        this.levelCompleteCallback = null;
        this.stateChangeCallback = null;
        this.campaignController = null;
    }

    /**
     * Link to the campaign controller
     * @param {Object} controller 
     */
    setCampaignController(controller) {
        this.campaignController = controller;
    }

    /**
     * Set a campaign variable from within the engine
     * @param {string} key 
     * @param {any} value 
     */
    setVariable(key, value) {
        if (this.campaignController) {
            this.campaignController.setVariable(key, value);
        } else {
            console.warn('[EngineAdapter] No CampaignController linked, variable not saved:', key);
        }
    }

    /**
     * Get a campaign variable
     * @param {string} key 
     */
    getVariable(key) {
        if (this.campaignController) {
            return this.campaignController.getVariable(key);
        }
        return 0;
    }

    /**
     * Initialize the engine instance
     * @returns {Promise<void>}
     */
    async initialize() {
        throw new Error("initialize() must be implemented by subclass");
    }

    /**
     * Load a specific level
     * @param {string} levelId - The level identifier
     * @param {string} levelPath - Path to level file (optional)
     * @returns {Promise<void>}
     */
    async loadLevel(levelId, levelPath = null) {
        throw new Error("loadLevel() must be implemented by subclass");
    }

    /**
     * Unload current level and cleanup
     * @returns {Promise<void>}
     */
    async unloadLevel() {
        throw new Error("unloadLevel() must be implemented by subclass");
    }

    /**
     * Get current game state for serialization
     * @returns {Object} Serializable game state
     */
    getState() {
        throw new Error("getState() must be implemented by subclass");
    }

    /**
     * Restore game state from serialized data
     * @param {Object} state - Previously serialized state
     * @returns {Promise<void>}
     */
    async setState(state) {
        throw new Error("setState() must be implemented by subclass");
    }

    /**
     * Start the game loop
     */
    start() {
        throw new Error("start() must be implemented by subclass");
    }

    /**
     * Stop the game loop
     */
    stop() {
        throw new Error("stop() must be implemented by subclass");
    }

    /**
     * Pause the game
     */
    pause() {
        throw new Error("pause() must be implemented by subclass");
    }

    /**
     * Resume the game
     */
    resume() {
        throw new Error("resume() must be implemented by subclass");
    }

    /**
     * Destroy the engine and free resources
     */
    destroy() {
        if (this.engine) {
            this.stop();
            this.engine = null;
        }
        this.isInitialized = false;
        this.isLoaded = false;
        this.levelCompleteCallback = null;
        this.stateChangeCallback = null;
    }

    /**
     * Register callback for level completion
     * @param {Function} callback - Called when level is completed
     */
    onLevelComplete(callback) {
        this.levelCompleteCallback = callback;
    }

    /**
     * Register callback for state changes
     * @param {Function} callback - Called when game state changes
     */
    onStateChange(callback) {
        this.stateChangeCallback = callback;
    }

    /**
     * Get current player data (cross-engine compatible)
     * @returns {Object} Player data
     */
    getPlayerData() {
        throw new Error("getPlayerData() must be implemented by subclass");
    }

    /**
     * Set player data (cross-engine compatible)
     * @param {Object} playerData - Player data to restore
     */
    setPlayerData(playerData) {
        throw new Error("setPlayerData() must be implemented by subclass");
    }

    /**
     * Get engine-specific metadata
     * @returns {Object} Engine metadata
     */
    getMetadata() {
        return {
            engineType: this.engineType,
            isInitialized: this.isInitialized,
            isLoaded: this.isLoaded
        };
    }

    /**
     * Handle window resize
     */
    resize() {
        if (this.engine && this.engine.resize) {
            this.engine.resize();
        }
    }

    /**
     * Trigger level completion (called by subclasses)
     * @param {Object} completionData - Data about level completion
     */
    _triggerLevelComplete(completionData = {}) {
        console.log(`[EngineAdapter:${this.engineType}] Triggering level complete. Callback exists: ${!!this.levelCompleteCallback}`);
        if (this.levelCompleteCallback) {
            try {
                this.levelCompleteCallback({
                    engineType: this.engineType,
                    ...completionData
                });
                console.log(`[EngineAdapter:${this.engineType}] Callback executed successfully.`);
            } catch (e) {
                console.error(`[EngineAdapter:${this.engineType}] Error in level complete callback:`, e);
            }
        } else {
            console.warn(`[EngineAdapter:${this.engineType}] No level complete callback registered!`);
        }
    }

    /**
     * Trigger state change (called by subclasses)
     * @param {Object} stateData - Changed state data
     */
    _triggerStateChange(stateData = {}) {
        if (this.stateChangeCallback) {
            this.stateChangeCallback({
                engineType: this.engineType,
                ...stateData
            });
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EngineAdapter;
}

// Make available globally for browser context
if (typeof window !== 'undefined') {
    window.EngineAdapter = EngineAdapter;
}

// ES6 export for modern module imports
export default EngineAdapter;
