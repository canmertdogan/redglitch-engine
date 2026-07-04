/**
 * TopDownAdapter - Adapter for RPG-Topdown engine
 * Wraps window.Core to provide uniform Campaign Controller interface
 */
class TopDownAdapter extends EngineAdapter {
    constructor() {
        super('rpg-topdown');
        this.username = null;
        this.levelExitMonitor = null;
        this._debugCounter = 0;
    }

    async initialize() {
        if (this.isInitialized) return;
        if (typeof window.Core === 'undefined') throw new Error('RPG-Topdown engine not loaded');
        this.engine = new window.Core();
        if (typeof this.engine.loadDefinitions === 'function') {
            await this.engine.loadDefinitions();
        }
        this.setupLiveBridge();
        this.isInitialized = true;
    }

    /**
     * Locate an active entity by ID
     * @param {string} id
     */
    findEntityById(id) {
        if (!this.engine) return null;
        if (this.engine.player && this.engine.player.id === id) return this.engine.player;
        
        // Search enemies
        if (this.engine.enemies) {
            const enemy = this.engine.enemies.find(e => e.id === id);
            if (enemy) return enemy;
        }
        
        // Search NPCs
        if (this.engine.npcs) {
            const npc = this.engine.npcs.find(n => n.id === id);
            if (npc) return npc;
        }
        
        return null;
    }

    /**
     * Find all entities spawned from a specific prefab
     * @param {string} prefabId
     */
    findEntitiesByPrefabId(prefabId) {
        if (!this.engine) return [];
        const results = [];
        
        if (this.engine.enemies) {
            results.push(...this.engine.enemies.filter(e => e.prefabId === prefabId));
        }
        
        if (this.engine.npcs) {
            results.push(...this.engine.npcs.filter(n => n.prefabId === prefabId));
        }
        
        return results;
    }

    async loadLevel(levelId, levelPath = null) {
        if (!this.isInitialized) throw new Error('Adapter not initialized');
        console.log(`[TopDownAdapter] Loading level: ${levelId}, path: ${levelPath}`);
        
        // Use engine's native loadLevel which already handles project context via window.ActiveProject
        await this.engine.loadLevel(levelId);
        this.isLoaded = true;
        this._startExitMonitoring();
    }

    async unloadLevel() {
        if (!this.isLoaded) return;
        this._stopExitMonitoring();
        this.stop();
        this.isLoaded = false;
    }

    getState() {
        if (!this.engine) return null;
        return {
            currentLevelId: this.engine.currentLevelId,
            player: this._serializePlayer(),
            inventory: this.engine.inventory ? [...this.engine.inventory] : [],
            flags: this.engine.flags || {}
        };
    }

    async setState(state) {
        if (!this.engine || !state) return;
        if (state.player) this._deserializePlayer(state.player);
        if (state.inventory) this.engine.inventory = [...state.inventory];
        if (state.flags) this.engine.flags = {...state.flags};
        if (this.engine.updateHUD) this.engine.updateHUD();
    }

    start() {
        if (this.engine && !this.engine.isRunning) {
            this.engine.isRunning = true;
            this.engine.gameLoop(performance.now());
        }
    }

    stop() {
        if (this.engine) this.engine.isRunning = false;
    }

    getPlayerData() {
        return this.engine?.player ? this._serializePlayer() : null;
    }

    setPlayerData(playerData) {
        if (this.engine && playerData) this._deserializePlayer(playerData);
    }

    _serializePlayer() {
        if (!window.CrossEngineSerializer) return {};
        return window.CrossEngineSerializer.serializePlayerState(this.engine);
    }

    _deserializePlayer(playerData) {
        if (!window.CrossEngineSerializer) return;
        window.CrossEngineSerializer.deserializePlayerState(this.engine, playerData, false);
    }
    
    /**
     * Restart the current level (used by retry from game-over)
     * @returns {Promise<void>}
     */
    async restart() {
        if (!this.engine) return;
        this.engine.isRunning = false;
        this.engine.player.hp = this.engine.player.maxHp;
        this.engine.player.mana = this.engine.player.maxMana;
        this.engine.player.stamina = this.engine.player.maxStamina;
        this.engine.levelComplete = false;
        const levelId = this.engine.currentLevelId;
        await this.engine.loadLevel(levelId);
        this.engine.isRunning = true;
        if (this.engine.gameLoop) this.engine.gameLoop(performance.now());
    }

    useAbility(abilityId, dirX, dirY) {
        if (!this.engine || !window.AbilityDefinitions) return false;
        const def = window.AbilityDefinitions.getAbility(abilityId);
        if (!def || this.engine.player.mana < def.mana) return false;
        
        if (def.type === 'projectile' && this.engine.spawnFireball) {
            const p = this.engine.player;
            const sprite = this.engine.irabSprites[Math.floor(Math.random() * this.engine.irabSprites.length)];
            this.engine.spawnFireball(p.x + (p.width*p.scale)/2, p.y + (p.height*p.scale)/2, dirX, dirY, sprite);
        } else if (def.type === 'heal') {
            this.engine.player.hp = Math.min(this.engine.player.maxHp, this.engine.player.hp + (def.healAmount || 20));
        }
        
        this.engine.player.mana = Math.max(0, this.engine.player.mana - def.mana);
        if (this.engine.updateHUD) this.engine.updateHUD();
        return true;
    }

    _startExitMonitoring() {
        this._stopExitMonitoring();
        this.exitTriggered = false;
        this.levelExitMonitor = setInterval(() => {
            if (!this.engine) return;
            
            // Check for levelComplete flag (set by engine)
            if (this.engine.levelComplete === true) {
                console.log('[TopDownAdapter] levelComplete flag detected');
                this.exitTriggered = true;
                this._stopExitMonitoring();
                if (this.levelCompleteCallback) {
                    this.levelCompleteCallback({ 
                        engineType: this.engineType, 
                        levelId: this.engine.currentLevelId 
                    });
                }
                this.engine.levelComplete = false;
                return;
            }

            // Check for trigger zones
            if (this.engine.mapSystem) {
                const p = this.engine.player;
                if (p && this.engine.mapSystem.isTriggerZone) {
                    const cx = p.x + (p.width || 16) * (p.scale || 3) / 2;
                    const cy = p.y + (p.height || 16) * (p.scale || 3) / 2;
                    if (this.engine.mapSystem.isTriggerZone(cx, cy)) {
                        console.log('[TopDownAdapter] Trigger zone detected');
                        this.exitTriggered = true;
                        this._stopExitMonitoring();
                        if (this.levelCompleteCallback) {
                            this.levelCompleteCallback({ 
                                engineType: this.engineType, 
                                levelId: this.engine.currentLevelId 
                            });
                        }
                        return;
                    }
                }
            }

            // Fallback: Check for exit distance manually if flag not used
            if (this.engine.mapSystem && this.engine.mapSystem.mapExit) {
                const exit = this.engine.mapSystem.mapExit;
                const p = this.engine.player;
                if (exit && p && !this.exitTriggered) {
                    const ts = 48; // RPG engine hardcodes 48
                    const dist = Math.sqrt((p.x - exit.x * ts)**2 + (p.y - exit.y * ts)**2);
                    if (dist < 50) {
                        this.exitTriggered = true;
                        this._stopExitMonitoring();
                        if (this.levelCompleteCallback) {
                            this.levelCompleteCallback({ 
                                engineType: this.engineType, 
                                levelId: this.engine.currentLevelId 
                            });
                        }
                    }
                }
            }
        }, 100);
    }

    _stopExitMonitoring() {
        if (this.levelExitMonitor) { clearInterval(this.levelExitMonitor); this.levelExitMonitor = null; }
    }

    destroy() {
        this._stopExitMonitoring();
        if (this.engine && this.engine.destroy) this.engine.destroy();
        super.destroy();
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = TopDownAdapter;
if (typeof window !== 'undefined') window.TopDownAdapter = TopDownAdapter;
