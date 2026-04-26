/**
 * TopDownAdapter - Adapter for RPG-Topdown engine
 * Wraps window.Core to provide uniform Campaign Controller interface
 */
class TopDownAdapter extends EngineAdapter {
    constructor() {
        super('rpg-topdown');
        console.log('[TopDownAdapter] Constructor called');
        this.username = null;
        this.levelExitMonitor = null;
    }

    /**
     * Initialize the RPG-Topdown engine
     * @returns {Promise<void>}
     */
    async initialize() {
        console.log('[TopDownAdapter] Initialize called');
        if (this.isInitialized) {
            console.warn('TopDownAdapter already initialized');
            return;
        }

        // Create new Core instance
        if (typeof window.Core === 'undefined') {
            throw new Error('RPG-Topdown engine (window.Core) not loaded');
        }

        this.engine = new window.Core();
        
        // Core initializes in constructor, no init() method needed
        
        this.isInitialized = true;
        console.log('TopDownAdapter initialized');
    }

    /**
     * Load a level in the RPG-Topdown engine
     * @param {string} levelId - Level identifier (e.g., "level1", "forest_dungeon")
     * @param {string} levelPath - Optional path override
     * @returns {Promise<void>}
     */
    async loadLevel(levelId, levelPath = null) {
        if (!this.isInitialized) {
            throw new Error('TopDownAdapter not initialized');
        }

        console.log(`TopDownAdapter loading level: ${levelId}`);

        // Load the level using engine's loadLevel method
        await this.engine.loadLevel(levelId);
        
        this.isLoaded = true;
        
        // Start monitoring for level exit
        console.log('[TopDownAdapter] About to call _startExitMonitoring');
        try {
            this._startExitMonitoring();
            console.log('[TopDownAdapter] _startExitMonitoring call completed');
        } catch (error) {
            console.error('[TopDownAdapter] Error in _startExitMonitoring:', error);
        }
        
        console.log(`TopDownAdapter level ${levelId} loaded`);
    }

    /**
     * Unload current level
     * @returns {Promise<void>}
     */
    async unloadLevel() {
        if (!this.isLoaded) {
            return;
        }

        console.log('TopDownAdapter unloading level');
        
        // Stop exit monitoring
        this._stopExitMonitoring();
        
        // Stop the game loop
        this.stop();
        
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
            currentLevel: this.engine.currentLevel,
            currentLevelId: this.engine.currentLevelId,
            player: this._serializePlayer(),
            inventory: this.engine.inventory ? [...this.engine.inventory] : [],
            activeSkills: this.engine.activeSkills ? [...this.engine.activeSkills] : [null, null, null, null],
            flags: this.engine.flags || {},
            questProgress: this.engine.questSystem && this.engine.questSystem.getProgress ? 
                this.engine.questSystem.getProgress() : {},
            achievements: this.engine.achievementSystem && this.engine.achievementSystem.getUnlocked ? 
                this.engine.achievementSystem.getUnlocked() : 
                (this.engine.achievementSystem && this.engine.achievementSystem.unlockedAchievements ? 
                    [...this.engine.achievementSystem.unlockedAchievements] : [])
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

        console.log('TopDownAdapter restoring state');

        // Restore player data
        if (state.player) {
            this._deserializePlayer(state.player);
        }

        // Restore inventory
        if (state.inventory) {
            this.engine.inventory = [...state.inventory];
        }

        // Restore skills
        if (state.activeSkills) {
            this.engine.activeSkills = [...state.activeSkills];
        }

        // Restore flags
        if (state.flags) {
            this.engine.flags = {...state.flags};
        }

        // Restore quest progress
        if (state.questProgress && this.engine.questSystem) {
            this.engine.questSystem.restoreProgress(state.questProgress);
        }

        // Update HUD to reflect restored state
        if (this.engine.updateHUD) {
            this.engine.updateHUD();
        }
    }

    /**
     * Start the game loop
     */
    start() {
        if (this.engine && !this.engine.isRunning) {
            this.engine.isRunning = true;
            this.engine.gameLoop(performance.now());
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
            this.engine.isPaused = true;
        }
    }

    /**
     * Resume the game
     */
    resume() {
        if (this.engine) {
            this.engine.isPaused = false;
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

        return this._serializePlayer();
    }

    /**
     * Set cross-engine player data
     * @param {Object} playerData
     */
    setPlayerData(playerData) {
        if (!this.engine) {
            console.warn('TopDownAdapter: Engine not initialized');
            return;
        }
        
        if (!playerData) {
            console.log('TopDownAdapter: No player data to restore');
            return;
        }

        this._deserializePlayer(playerData);
    }

    /**
     * Serialize player data
     * @private
     * @returns {Object}
     */
    _serializePlayer() {
        if (!window.CrossEngineSerializer) {
            console.error('CrossEngineSerializer not loaded');
            return {};
        }
        return window.CrossEngineSerializer.serializePlayerState(this.engine);
    }

    /**
     * Deserialize player data
     * @private
     * @param {Object} playerData
     */
    _deserializePlayer(playerData) {
        if (!window.CrossEngineSerializer) {
            console.error('CrossEngineSerializer not loaded');
            return;
        }
        // Don't restore position for cross-engine transitions
        window.CrossEngineSerializer.deserializePlayerState(this.engine, playerData, false);
    }
    
    /**
     * Use an ability (unified combat interface)
     * @param {string} abilityId - Ability ID from AbilityDefinitions
     * @param {number} dirX - Direction X
     * @param {number} dirY - Direction Y
     * @returns {boolean} Success
     */
    useAbility(abilityId, dirX, dirY) {
        if (!this.engine) {
            console.warn('[TopDownAdapter] Engine not available');
            return false;
        }
        
        if (!window.AbilityDefinitions) {
            console.error('[TopDownAdapter] AbilityDefinitions not loaded');
            return false;
        }
        
        const abilityDef = window.AbilityDefinitions.getAbility(abilityId);
        if (!abilityDef) {
            console.error('[TopDownAdapter] Ability not found:', abilityId);
            return false;
        }
        
        // Check mana
        if (this.engine.player.mana < abilityDef.manaCost) {
            console.warn('[TopDownAdapter] Not enough mana');
            return false;
        }
        
        // Use existing engine skill system for projectiles
        if (abilityDef.type === 'projectile') {
            // Get player position
            const player = this.engine.player;
            const sw = player.width * player.scale;
            const sh = player.height * player.scale;
            
            // Spawn fireball using engine method
            if (this.engine.spawnFireball && this.engine.irabSprites) {
                // Use a random IRAB sprite (looks great!)
                const sprite = this.engine.irabSprites[Math.floor(Math.random() * this.engine.irabSprites.length)];
                const fb = this.engine.spawnFireball(
                    player.x + sw / 2,
                    player.y + sh / 2,
                    dirX, dirY, sprite
                );
                if (fb) {
                    fb.scale = 1.5;
                }
            }
        } else if (abilityDef.type === 'heal') {
            this.engine.player.hp = Math.min(this.engine.player.maxHp, this.engine.player.hp + (abilityDef.damage || 20));
            // Spawn heal particles
            const player = this.engine.player;
            const sw = player.width * player.scale;
            const sh = player.height * player.scale;
            if (this.engine.spawnParticle) {
                for (let i = 0; i < 15; i++) {
                    this.engine.spawnParticle(
                        player.x + sw / 2,
                        player.y + sh / 2,
                        (Math.random() - 0.5) * 100,
                        -Math.random() * 100,
                        '#2ecc71', 0.8, 4
                    );
                }
            }
        }
        
        // Consume mana
        this.engine.player.mana = Math.max(0, this.engine.player.mana - abilityDef.manaCost);
        
        // Update HUD
        if (this.engine.updateHUD) {
            this.engine.updateHUD();
        }
        
        return true;
    }
    
    /**
     * Check if ability is ready (not on cooldown)
     * @param {number} slotIndex - Ability slot (0-3)
     * @returns {boolean}
     */
    isAbilityReady(slotIndex) {
        // For now, always ready - cooldown tracking will be added later
        return true;
    }

    /**
     * Start monitoring for level exit
     * @private
     */
    _startExitMonitoring() {
        this._stopExitMonitoring();
        
        console.log('[TopDownAdapter] Starting exit monitoring');
        
        // Mark that we're monitoring
        this.exitTriggered = false;
        
        // Debug: log once to verify interval is running
        let debugCounter = 0;
        
        // Poll for level exit condition
        this.levelExitMonitor = setInterval(() => {
            if (!this.engine || !this.engine.mapSystem) {
                if (debugCounter === 0) console.log('[TopDownAdapter] No engine or mapSystem');
                return;
            }

            // Check if player touched exit
            const mapExit = this.engine.mapSystem.mapExit;
            const player = this.engine.player;
            
            // Debug log every 50 checks (5 seconds)
            if (debugCounter % 50 === 0) {
                console.log('[TopDownAdapter] Monitoring... mapExit:', !!mapExit, 'player:', !!player, 'triggered:', this.exitTriggered);
            }
            debugCounter++;
            
            if (mapExit && player && !this.exitTriggered) {
                // Use EXACT same calculation as engine (line 1514-1516 in main.js)
                const exitX = mapExit.x * 48;  // Hardcoded 48 like the engine
                const exitY = mapExit.y * 48;
                const distance = Math.sqrt((player.x - exitX) ** 2 + (player.y - exitY) ** 2);
                
                // Debug when close
                if (distance < 100) {
                    console.log('[TopDownAdapter] Close to exit! Distance:', distance.toFixed(2), 'Threshold: 50');
                }
                
                // Same threshold as engine (50px)
                if (distance < 50) {
                    // Check exit condition (if any)
                    // Note: RPG engine doesn't typically store levelMetadata in engine.currentLevel
                    // We might need to access it via campaignController or store it on load
                    
                    // Assuming we can check conditions if they exist
                    // For now, RPG TopDown relies on mapSystem exit which is usually unconditional
                    // But if we want to add conditions, we should do it here.
                    
                    // Since TopDownAdapter loads via engine.loadLevel, we don't always have metadata handy
                    // unless we store it.
                    
                    // TODO: Enhance RPG Core to support level metadata conditions
                    
                    console.log('[TopDownAdapter] Exit triggered! Distance:', distance);
                    this.exitTriggered = true;
                    this._stopExitMonitoring();
                    this._triggerLevelComplete({
                        levelId: this.engine.currentLevelId,
                        playerState: this.getPlayerData()
                    });
                }
            }
        }, 100); // Check every 100ms
    }

    /**
     * Stop monitoring for level exit
     * @private
     */
    _stopExitMonitoring() {
        if (this.levelExitMonitor) {
            clearInterval(this.levelExitMonitor);
            this.levelExitMonitor = null;
        }
    }
    
    /**
     * Trigger level completion callback
     * @private
     * @param {Object} data - Completion data
     */
    _triggerLevelComplete(data) {
        console.log('[TopDownAdapter] Level complete', data);
        
        // Call completion callback if set (from base class)
        if (this.levelCompleteCallback) {
            this.levelCompleteCallback({
                engineType: this.engineType,
                ...data
            });
        } else {
            console.warn('[TopDownAdapter] No levelCompleteCallback set');
        }
    }

    /**
     * Destroy the adapter
     */
    destroy() {
        console.log('[TopDownAdapter] Destroying...');
        this._stopExitMonitoring();
        
        if (this.engine && this.engine.destroy) {
            this.engine.destroy();
        }
        
        super.destroy();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TopDownAdapter;
}

// Make available globally for browser context
if (typeof window !== 'undefined') {
    window.TopDownAdapter = TopDownAdapter;
}
