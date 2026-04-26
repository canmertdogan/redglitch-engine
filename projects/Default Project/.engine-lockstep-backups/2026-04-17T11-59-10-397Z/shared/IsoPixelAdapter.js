/**
 * IsoPixelAdapter - Adapter for ISO-Pixel engine
 * Wraps IsoGame to provide uniform Campaign Controller interface
 */
class IsoPixelAdapter extends EngineAdapter {
    constructor() {
        super('iso-pixel');
        this.username = null;
        this.completionChecker = null;
    }

    /**
     * Initialize the ISO-Pixel engine
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            console.warn('IsoPixelAdapter already initialized');
            return;
        }

        // Create new IsoGame instance
        if (typeof IsoGame === 'undefined') {
            throw new Error('ISO-Pixel engine (IsoGame) not loaded');
        }

        this.engine = new IsoGame();
        window.game = this.engine;
        
        // DON'T call init() yet - wait for loadLevel() to provide map data
        // Just set up the engine instance
        
        this.isInitialized = true;
        console.log('IsoPixelAdapter initialized');
    }

    /**
     * Load a level in the ISO-Pixel engine
     * @param {string} levelId - Level identifier
     * @param {string} levelPath - Optional path to level file
     * @returns {Promise<void>}
     */
    async loadLevel(levelId, levelPath = null) {
        if (!this.isInitialized) {
            throw new Error('IsoPixelAdapter not initialized');
        }

        console.log(`IsoPixelAdapter loading level: ${levelId}`);

        // Construct level path
        const path = levelPath || `dunyalar/${levelId}.json`;
        
        try {
            // Fetch level data
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to load level: ${response.status}`);
            }
            
            const levelData = await response.json();
            
            console.log('[IsoPixelAdapter] Level data loaded:', {
                hasMap: !!levelData.map,
                hasLayers: !!levelData.layers,
                width: levelData.width || levelData.map?.width,
                height: levelData.height || levelData.map?.height,
                hasZ: !!levelData.z,
                hasShapes: !!levelData.shapes,
                zLength: levelData.z?.length,
                shapesLength: levelData.shapes?.length
            });
            
            // Set levelMetadata with the full level data structure
            // The iso-pixel engine expects levelMetadata to contain the map data
            this.engine.levelMetadata = levelData;
            
            // Also keep a reference in this.engine.map for compatibility
            this.engine.map = levelData;
            
            console.log('[IsoPixelAdapter] Engine map set:', {
                mapWidth: this.engine.map.width,
                mapHeight: this.engine.map.height,
                hasLayers: !!this.engine.map.layers,
                layerCount: this.engine.map.layers?.length,
                hasZ: !!this.engine.map.z,
                hasShapes: !!this.engine.map.shapes,
                zLength: this.engine.map.z?.length,
                shapesLength: this.engine.map.shapes?.length
            });
            
            // NOW initialize the engine with the map loaded
            if (!this.engine.initialized) {
                // First time init (will call loadLevelData internally)
                await this.engine.init();
                this.engine.initialized = true;
            } else {
                // Engine already running, just reload level data
                console.log('[IsoPixelAdapter] Reloading level data into existing engine');
                await this.engine.loadLevelData(levelData);
            }
            
            // Set player spawn point (if metadata has spawnPoint, otherwise use spawn from levelData)
            const spawn = levelData.spawnPoint || levelData.spawn || { x: 5, y: 5, z: 0 };
            this.engine.player.x = spawn.x;
            this.engine.player.y = spawn.y;
            this.engine.player.z = spawn.z || 0;
            
            // Reset camera
            if (this.engine.camera) {
                this.engine.camera.x = this.engine.player.x;
                this.engine.camera.y = this.engine.player.y;
            }
            
            // Spawn dynamic entities (NPCs, Enemies) from decorations
            if (this.engine.spawnEntities) {
                this.engine.spawnEntities();
            }
            
            this.isLoaded = true;
            
            // Start completion monitoring
            this._startCompletionMonitoring();
            
            console.log(`IsoPixelAdapter level ${levelId} loaded`);
        } catch (error) {
            console.error('IsoPixelAdapter level load failed:', error);
            throw error;
        }
    }

    /**
     * Unload current level
     * @returns {Promise<void>}
     */
    async unloadLevel() {
        if (!this.isLoaded) {
            return;
        }

        console.log('IsoPixelAdapter unloading level');
        
        // Stop completion monitoring
        this._stopCompletionMonitoring();
        
        // Stop the game loop
        this.stop();
        
        // Clear level data
        this.engine.map = [];
        this.engine.levelMetadata = null;
        
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
            levelMetadata: this.engine.levelMetadata,
            player: this._serializePlayer(),
            flags: this.engine.flags || {},
            fxSettings: {
                weatherType: this.engine.fx?.weatherType,
                lightingPreset: this.engine.fx?.lightingPreset
            },
            shaderSettings: {
                preset: this.engine.shaders?.currentPreset
            }
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

        console.log('IsoPixelAdapter restoring state');

        // Restore player data
        if (state.player) {
            this._deserializePlayer(state.player);
        }

        // Restore flags
        if (state.flags) {
            this.engine.flags = {...state.flags};
        }

        // Restore FX settings
        if (state.fxSettings && this.engine.fx) {
            if (state.fxSettings.weatherType) {
                this.engine.fx.setWeather(state.fxSettings.weatherType);
            }
            if (state.fxSettings.lightingPreset) {
                this.engine.setLightingPreset(state.fxSettings.lightingPreset);
            }
        }

        // Restore shader settings
        if (state.shaderSettings && this.engine.shaders) {
            if (state.shaderSettings.preset) {
                this.engine.setShaderPreset(state.shaderSettings.preset);
            }
        }

        // Update HUD
        if (this.engine.syncHUDStats) {
            this.engine.syncHUDStats();
        }
    }

    /**
     * Start the game loop
     */
    start() {
        if (this.engine && !this.engine.running) {
            this.engine.running = true;
            this.engine.loop(performance.now());
        }
    }

    /**
     * Stop the game loop
     */
    stop() {
        if (this.engine) {
            this.engine.running = false;
        }
    }

    /**
     * Pause the game
     */
    pause() {
        if (this.engine) {
            this.engine.paused = true;
        }
    }

    /**
     * Resume the game
     */
    resume() {
        if (this.engine) {
            this.engine.paused = false;
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
        if (!this.engine || !playerData) {
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
        return window.CrossEngineSerializer.serializePlayerState(this.engine);
    }

    /**
     * Deserialize player data
     * @private
     * @param {Object} playerData
     */
    _deserializePlayer(playerData) {
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
        if (!this.engine || !this.engine.combat) {
            console.warn('[IsoPixelAdapter] Combat system not available');
            return false;
        }
        
        return this.engine.combat.useAbility(abilityId, dirX, dirY);
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
     * Start monitoring for level completion
     * ISO-Pixel doesn't have built-in completion detection, so we check for:
     * - Exit tile/object
     * - Objective completion flag
     * - Custom completion condition
     * @private
     */
    _startCompletionMonitoring() {
        this._stopCompletionMonitoring();
        console.log('[IsoPixelAdapter] Starting completion monitoring...');
        
        let debugCounter = 0;
        let firstTick = true;

        this.completionChecker = setInterval(() => {
            if (!this.engine) return;
            
            if (firstTick) {
                console.log('[IsoPixelAdapter] First tick metadata:', {
                    hasMetadata: !!this.engine.levelMetadata,
                    decorationsCount: this.engine.levelMetadata?.decorations?.length || 0,
                    exitPoint: this.engine.levelMetadata?.exitPoint
                });
                if (this.engine.levelMetadata?.decorations) {
                    const exits = this.engine.levelMetadata.decorations.filter(d => d.type === 'exit');
                    console.log(`[IsoPixelAdapter] Found ${exits.length} exit decorations`);
                }
                firstTick = false;
            }

            if (!this.engine.running) {
                if (debugCounter % 50 === 0) console.log('[IsoPixelAdapter] Monitoring paused: engine not running');
                debugCounter++;
                return;
            }

            // Check for completion flag (set by game logic)
            if (this.engine.levelComplete === true) {
                console.log('[IsoPixelAdapter] levelComplete flag detected');
                this._stopCompletionMonitoring();
                this._triggerLevelComplete({
                    levelId: this.engine.levelMetadata?.name,
                    playerState: this.getPlayerData()
                });
                this.engine.levelComplete = false;
                return;
            }

            // Collect all potential exits
            const exits = [];
            if (this.engine.levelMetadata?.exitPoint) {
                exits.push(this.engine.levelMetadata.exitPoint);
            }
            if (this.engine.levelMetadata?.decorations) {
                const decExits = this.engine.levelMetadata.decorations.filter(d => d.type === 'exit');
                exits.push(...decExits);
            }

            if (exits.length > 0) {
                const player = this.engine.player;
                let reachedExit = null;

                for (const exit of exits) {
                    // Simple distance check
                    // Center align check (exit tile center vs player center)
                    const ex = exit.x + 0.5; // Center of tile
                    const ey = exit.y + 0.5; // Center of tile
                    const ez = exit.z || 0;

                    const dx = player.x - ex;
                    const dy = player.y - ey;
                    const dz = (player.z || 0) - ez;
                    
                    // Relaxed 3D distance check (allow some vertical leeway)
                    // If Z is very different (> 2 blocks), ignore
                    if (Math.abs(dz) > 2.5) continue; 
                    
                    const distance = Math.sqrt(dx * dx + dy * dy); // 2D distance primarily

                    if (debugCounter % 50 === 0) {
                         // Only log first one to avoid spam
                         if (exits.indexOf(exit) === 0) {
                            console.log(`[IsoPixelAdapter] Exit check (nearest): Exit at (${ex}, ${ey}, ${ez}). Player at (${player.x.toFixed(2)}, ${player.y.toFixed(2)}, ${player.z.toFixed(2)}). Dist2D: ${distance.toFixed(2)}`);
                         }
                    }

                    if (distance < 1.0) { // Within 1.0 tile radius in 2D
                         reachedExit = exit;
                         break;
                    }
                }
                
                debugCounter++;

                if (reachedExit) {
                    // Check exit condition (if any)
                    const condition = this.engine.levelMetadata.exitCondition || reachedExit.condition;
                    
                    if (condition && this.campaignController) {
                        const canExit = this.campaignController.checkCondition(condition);
                        if (!canExit) {
                            // Optionally show locked message (once per second to avoid spam)
                            const now = Date.now();
                            if (!this._lastLockMsg || now - this._lastLockMsg > 2000) {
                                console.log('[IsoPixelAdapter] Exit locked by condition:', condition);
                                if (this.engine.hud) {
                                    this.engine.hud.showNotification(`Locked: ${condition.key || 'Requirement'} not met`, 'error');
                                }
                                this._lastLockMsg = now;
                            }
                            return;
                        }
                    }

                    console.log('[IsoPixelAdapter] Reached exit point!');
                    this._stopCompletionMonitoring();
                    this._triggerLevelComplete({
                        levelId: this.engine.levelMetadata.name,
                        playerState: this.getPlayerData()
                    });
                }
            } else {
                if (debugCounter % 100 === 0) console.log('[IsoPixelAdapter] No exit point found');
                debugCounter++;
            }
        }, 100);
    }

    /**
     * Stop completion monitoring
     * @private
     */
    _stopCompletionMonitoring() {
        if (this.completionChecker) {
            clearInterval(this.completionChecker);
            this.completionChecker = null;
        }
    }

    /**
     * Destroy the adapter
     */
    destroy() {
        this._stopCompletionMonitoring();
        super.destroy();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IsoPixelAdapter;
}
