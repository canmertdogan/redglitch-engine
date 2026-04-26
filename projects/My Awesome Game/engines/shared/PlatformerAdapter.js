/**
 * PlatformerAdapter - Adapter for Platformer-2D engine
 * Wraps PlatformerGame to provide uniform Campaign Controller interface
 */
class PlatformerAdapter extends EngineAdapter {
    constructor() {
        super('platformer-2d');
        console.log('[PlatformerAdapter] Constructor called');
        this.username = null;
        this.completionChecker = null;
    }

    /**
     * Initialize the Platformer-2D engine
     * @returns {Promise<void>}
     */
    async initialize() {
        console.log('[PlatformerAdapter] Initialize called');
        if (this.isInitialized) {
            console.warn('PlatformerAdapter already initialized');
            return;
        }

        // Create new PlatformerGame instance
        if (typeof window.PlatformerGame === 'undefined') {
            throw new Error('Platformer-2D engine (window.PlatformerGame) not loaded');
        }

        this.engine = new window.PlatformerGame();
        window.game = this.engine;
        
        // Initialize engine
        await this.engine.init();
        
        this.isInitialized = true;
        console.log('PlatformerAdapter initialized');
    }

    /**
     * Load a level in the Platformer-2D engine
     * @param {string} levelId - Level identifier
     * @param {string} levelPath - Optional path to level file
     * @returns {Promise<void>}
     */
    async loadLevel(levelId, levelPath = null) {
        if (!this.isInitialized) {
            throw new Error('PlatformerAdapter not initialized');
        }

        console.log(`PlatformerAdapter loading level: ${levelId}`);

        // Try to load level, checking multiple paths if levelPath isn't provided
        if (levelPath) {
            await this.engine.loadLevel(levelId, levelPath);
        } else {
            // First try main dunyalar
            try {
                const mainPath = `dunyalar/${levelId}.json`;
                const check = await fetch(mainPath, { method: 'HEAD' });
                if (check.ok) {
                    await this.engine.loadLevel(levelId, mainPath);
                } else {
                    // Fallback to platformer subfolder
                    await this.engine.loadLevel(levelId, `dunyalar/platformer/${levelId}.json`);
                }
            } catch (e) {
                // Final fallback
                await this.engine.loadLevel(levelId);
            }
        }
        
        this.isLoaded = true;
        
        // Setup level completion callback
        this._setupLevelCompleteCallback();
        
        console.log(`PlatformerAdapter level ${levelId} loaded`);
    }

    /**
     * Trigger an ability in the engine
     * @param {string} abilityId - ID of the ability to use
     * @param {number} dirX - Target direction X
     * @param {number} dirY - Target direction Y
     * @returns {boolean}
     */
    useAbility(abilityId, dirX, dirY) {
        if (!this.engine || !this.engine.player) return false;
        
        console.log(`[PlatformerAdapter] useAbility: ${abilityId}`);
        
        // Platformer engine might not have a full ability system yet, 
        // but we can simulate basic actions like 'attack'
        if (abilityId === 'attack' || abilityId === 'fireball') {
            // Logic for platformer attack could go here
            // For now, just trigger a visual effect or console log
            if (this.engine.fx) {
                this.engine.fx.popText(this.engine.player.x, this.engine.player.y - 20, "ATTACK!", "#fff");
            }
            return true;
        }
        
        return false;
    }

    /**
     * Setup callback for level completion
     * @private
     */
    _setupLevelCompleteCallback() {
        this.engine.onLevelComplete = (data) => {
            console.log('[PlatformerAdapter] Level complete detected', data);
            
            if (this.levelCompleteCallback) {
                this.levelCompleteCallback(data);
            }
        };
    }

    /**
     * Unload current level
     * @returns {Promise<void>}
     */
    async unloadLevel() {
        if (!this.isLoaded) {
            return;
        }

        console.log('PlatformerAdapter unloading level');
        
        // Stop the game loop
        this.stop();
        
        // Clear level complete callback
        if (this.engine) {
            this.engine.onLevelComplete = null;
        }
        
        this.isLoaded = false;
    }

    /**
     * Get serializable game state
     * @returns {Object}
     */
    getState() {
        if (!this.engine) {
            return null;
        }

        return {
            currentLevelId: this.engine.currentLevelId,
            player: {
                x: this.engine.player.x,
                y: this.engine.player.y,
                hp: this.engine.player.hp,
                maxHp: this.engine.player.maxHp,
                coins: this.engine.player.coins,
                facingRight: this.engine.player.facingRight
            },
            collectibles: this.engine.collectibles.map(c => ({
                x: c.x,
                y: c.y,
                type: c.type,
                collected: c.collected
            })),
            checkpoints: this.engine.checkpoints.map(cp => ({
                x: cp.x,
                y: cp.y,
                activated: cp.activated
            })),
            lastCheckpoint: this.engine.lastCheckpoint,
            flags: this.engine.flags || {},
            inventory: this.engine.inventory ? [...this.engine.inventory] : []
        };
    }

    /**
     * Restore game state
     * @param {Object} state
     * @returns {Promise<void>}
     */
    async setState(state) {
        if (!this.engine || !state) {
            return;
        }

        console.log('PlatformerAdapter restoring state');

        // Restore player data
        if (state.player) {
            Object.assign(this.engine.player, state.player);
        }

        // Restore collectibles state
        if (state.collectibles && this.engine.collectibles) {
            state.collectibles.forEach((savedItem, idx) => {
                if (this.engine.collectibles[idx]) {
                    this.engine.collectibles[idx].collected = savedItem.collected;
                }
            });
        }

        // Restore checkpoints
        if (state.checkpoints && this.engine.checkpoints) {
            state.checkpoints.forEach((savedCp, idx) => {
                if (this.engine.checkpoints[idx]) {
                    this.engine.checkpoints[idx].activated = savedCp.activated;
                }
            });
        }

        // Restore last checkpoint
        if (state.lastCheckpoint) {
            this.engine.lastCheckpoint = state.lastCheckpoint;
        }

        // Restore flags
        if (state.flags) {
            this.engine.flags = {...state.flags};
        }

        // Restore inventory
        if (state.inventory) {
            this.engine.inventory = [...state.inventory];
        }
    }

    /**
     * Start the game loop
     */
    start() {
        if (this.engine && !this.engine.isRunning) {
            this.engine.isRunning = true;
            this.engine.loop();
        }
    }

    /**
     * Stop the game loop
     */
    stop() {
        if (this.engine) {
            this.engine.isRunning = false;
        }
    }

    /**
     * Pause the game
     */
    pause() {
        if (this.engine) {
            this.engine.pause();
        }
    }

    /**
     * Resume the game
     */
    resume() {
        if (this.engine) {
            this.engine.resume();
        }
    }

    /**
     * Get cross-engine player data
     * @returns {Object}
     */
    getPlayerData() {
        if (!this.engine || !this.engine.player) {
            return null;
        }

        return {
            hp: this.engine.player.hp,
            maxHp: this.engine.player.maxHp,
            coins: this.engine.player.coins,
            position: {
                x: this.engine.player.x,
                y: this.engine.player.y
            }
        };
    }

    /**
     * Set cross-engine player data
     * @param {Object} playerData
     */
    setPlayerData(playerData) {
        if (!this.engine || !playerData) {
            return;
        }

        if (playerData.hp !== undefined) {
            this.engine.player.hp = playerData.hp;
        }
        if (playerData.maxHp !== undefined) {
            this.engine.player.maxHp = playerData.maxHp;
        }
        if (playerData.coins !== undefined) {
            this.engine.player.coins = playerData.coins;
        }
    }

    /**
     * Get inventory
     * @returns {Array}
     */
    getInventory() {
        return this.engine ? (this.engine.inventory || []) : [];
    }

    /**
     * Set inventory
     * @param {Array} inventory 
     */
    setInventory(inventory) {
        if (this.engine) {
            this.engine.inventory = [...inventory];
        }
    }

    /**
     * Set flag
     * @param {string} key 
     * @param {any} value 
     */
    setFlag(key, value) {
        if (this.engine) {
            if (!this.engine.flags) {
                this.engine.flags = {};
            }
            this.engine.flags[key] = value;
        }
    }

    /**
     * Get flag
     * @param {string} key 
     * @returns {any}
     */
    getFlag(key) {
        return this.engine && this.engine.flags ? this.engine.flags[key] : undefined;
    }

    /**
     * Trigger level completion manually
     */
    completeLevelManually() {
        if (this.engine) {
            this.engine.completeLevel();
        }
    }

    /**
     * Destroy the adapter
     */
    destroy() {
        if (this.engine) {
            this.engine.onLevelComplete = null;
        }
        if (typeof super.destroy === 'function') {
            super.destroy();
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlatformerAdapter;
}
window.PlatformerAdapter = PlatformerAdapter;
