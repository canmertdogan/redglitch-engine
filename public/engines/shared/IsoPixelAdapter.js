/**
 * IsoPixelAdapter - Adapter for ISO-Pixel engine
 * Wraps IsoGame to provide uniform Campaign Controller interface
 */
class IsoPixelAdapter extends EngineAdapter {
    constructor() {
        super('iso-pixel');
        this.username = null;
        this.completionChecker = null;
        this._debugCounter = 0;
    }

    async initialize() {
        if (this.isInitialized) return;
        if (typeof IsoGame === 'undefined') throw new Error('ISO-Pixel engine not loaded');
        this.engine = new IsoGame();
        window.game = this.engine;
        this.setupLiveBridge();
        this.isInitialized = true;
    }

    /**
     * Locate an active entity by ID in ISO mode
     * @param {string} id
     */
    findEntityById(id) {
        if (!this.engine) return null;
        if (this.engine.player && this.engine.player.id === id) return this.engine.player;
        if (this.engine.entities) {
            const ent = this.engine.entities.find(e => e.id === id || (e.def && e.def.id === id));
            if (ent) return ent;
        }
        return null;
    }

    /**
     * Find all entities spawned from a specific prefab
     * @param {string} prefabId
     */
    findEntitiesByPrefabId(prefabId) {
        if (!this.engine || !this.engine.entities) return [];
        return this.engine.entities.filter(e => e.prefabId === prefabId || (e.def && e.def.prefabId === prefabId));
    }

    async loadLevel(levelId, levelPath = null) {
        if (!this.isInitialized) throw new Error('Adapter not initialized');
        const path = levelPath || `dunyalar/${levelId}.json`;
        try {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            this.engine.levelMetadata = data;
            this.engine.map = data;
            
            if (!this.engine.initialized) {
                await this.engine.init();
                this.engine.initialized = true;
            } else {
                await this.engine.loadLevelData(data);
            }
            
            const spawn = data.spawnPoint || data.spawn || { x: 5, y: 5, z: 0 };
            this.engine.player.x = spawn.x;
            this.engine.player.y = spawn.y;
            this.engine.player.z = spawn.z || 0;
            if (this.engine.camera) { this.engine.camera.x = spawn.x; this.engine.camera.y = spawn.y; }
            if (this.engine.spawnEntities) this.engine.spawnEntities();
            
            this.isLoaded = true;
            this._startCompletionMonitoring();
        } catch (error) {
            console.error('IsoPixelAdapter load failed:', error);
            throw error;
        }
    }

    async unloadLevel() {
        if (!this.isLoaded) return;
        this._stopCompletionMonitoring();
        this.stop();
        this.engine.map = [];
        this.engine.levelMetadata = null;
        this.isLoaded = false;
    }

    getState() {
        if (!this.engine) return null;
        return {
            levelMetadata: this.engine.levelMetadata,
            player: this._serializePlayer(),
            flags: this.engine.flags || {}
        };
    }

    async setState(state) {
        if (!this.engine || !state) return;
        if (state.player) this._deserializePlayer(state.player);
        if (state.flags) this.engine.flags = {...state.flags};
        if (this.engine.syncHUDStats) this.engine.syncHUDStats();
    }

    start() {
        if (this.engine && !this.engine.running) {
            this.engine.running = true;
            this.engine.loop(performance.now());
        }
    }

    stop() {
        if (this.engine) this.engine.running = false;
    }

    getPlayerData() {
        return this.engine?.player ? this._serializePlayer() : null;
    }

    setPlayerData(playerData) {
        if (this.engine && playerData) this._deserializePlayer(playerData);
    }

    _serializePlayer() {
        return window.CrossEngineSerializer.serializePlayerState(this.engine);
    }

    _deserializePlayer(playerData) {
        window.CrossEngineSerializer.deserializePlayerState(this.engine, playerData, false);
    }
    
    useAbility(abilityId, dirX, dirY) {
        if (!this.engine || !this.engine.combat) return false;
        return this.engine.combat.useAbility(abilityId, dirX, dirY);
    }

    _startCompletionMonitoring() {
        this._stopCompletionMonitoring();
        this._debugCounter = 0;
        this.completionChecker = setInterval(() => {
            if (!this.engine || !this.engine.running) return;

            if (this.engine.levelComplete === true) {
                this._stopCompletionMonitoring();
                if (this.levelCompleteCallback) this.levelCompleteCallback({ engineType: this.engineType, levelId: this.engine.levelMetadata?.name });
                this.engine.levelComplete = false;
                return;
            }

            const exits = [];
            if (this.engine.levelMetadata?.exitPoint) exits.push(this.engine.levelMetadata.exitPoint);
            if (this.engine.levelMetadata?.decorations) {
                exits.push(...this.engine.levelMetadata.decorations.filter(d => d.type === 'exit'));
            }

            if (exits.length > 0) {
                const p = this.engine.player;
                for (const exit of exits) {
                    const dx = p.x - (exit.x + 0.5);
                    const dy = p.y - (exit.y + 0.5);
                    if (Math.abs((p.z || 0) - (exit.z || 0)) > 2.5) continue;
                    if (Math.sqrt(dx*dx + dy*dy) < 1.0) {
                        this._stopCompletionMonitoring();
                        if (this.levelCompleteCallback) this.levelCompleteCallback({ engineType: this.engineType, levelId: this.engine.levelMetadata.name });
                        return;
                    }
                }
            }
            this._debugCounter++;
        }, 100);
    }

    _stopCompletionMonitoring() {
        if (this.completionChecker) { clearInterval(this.completionChecker); this.completionChecker = null; }
    }

    destroy() {
        this._stopCompletionMonitoring();
        if (this.engine && this.engine.destroy) this.engine.destroy();
        super.destroy();
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = IsoPixelAdapter;
if (typeof window !== 'undefined') window.IsoPixelAdapter = IsoPixelAdapter;
