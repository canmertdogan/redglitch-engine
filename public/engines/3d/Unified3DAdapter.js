/**
 * Unified3DAdapter.js
 * Campaign adapter for the merged RedGlitch3DGame engine.
 * Handles all 3D modes (fps-3d, topdown-3d, platformer-3d) through a single
 * adapter with hot-swap mode switching via game.switchMode().
 *
 * ESM module — imported by CampaignController._loadEngineScripts().
 */

import EngineAdapter from '../shared/EngineAdapter.js';

export default class Unified3DAdapter extends EngineAdapter {

    constructor(engineType = 'fps-3d') {
        super(engineType);
        this.game              = null;  // RedGlitch3DGame instance
        this.username          = null;
        this.currentProject    = null;
        this._requestedType    = engineType;
        this._onLevelComplete  = null;
    }

    // ── EngineAdapter lifecycle ───────────────────────────────────────────────

    async initialize() {
        if (this.isInitialized) { console.warn('[Unified3DAdapter] already initialized'); return; }

        const container = document.getElementById('game-container')
            ?? document.getElementById('canvas-container')
            ?? (() => {
                const div = document.createElement('div');
                div.id = 'unified3d-container';
                div.style.cssText = 'position:fixed;inset:0;z-index:10;';
                document.body.appendChild(div);
                return div;
            })();

        const { default: RedGlitch3DGame } = await import('/engines/3d/main.js');

        this.game = new RedGlitch3DGame(container, { mode: this._requestedType });
        await this.game.init(this._requestedType);

        if (this.currentProject) {
            this.game.currentProject = this.currentProject;
        }

        this.engine = this.game;

        // Wire level-complete callback
        this._onLevelComplete = (data = {}) => {
            this._triggerLevelComplete({
                levelId:     data.levelId ?? null,
                playerState: data.playerState ?? this.getPlayerData(),
                ...data,
            });
        };
        this.game.on('levelComplete', this._onLevelComplete);

        this.isInitialized = true;
        this.isLoaded      = false;
        
        // Phase 5: Setup Live Bridge
        this.setupLiveBridge();
        
        console.log(`[Unified3DAdapter] initialized (mode: ${this._requestedType})`);
    }

    /**
     * Locate an active entity by ID in 3D
     * @param {string} id
     */
    findEntityById(id) {
        if (!this.game || !this.game.gameState || !this.game.gameState.entities) return null;
        
        // Search through runtime entities (they are wrapped in EntityDef or similar in gameState)
        const entity = this.game.gameState.entities.find(e => e.id === id || e.name === id);
        return entity || null;
    }

    /**
     * Switch the internal mode WITHOUT full re-init.
     * Called by CampaignController when transitioning between 3D engine types.
     */
    async switchMode(newEngineType) {
        if (!this.game) throw new Error('[Unified3DAdapter] not initialized');
        this._requestedType = newEngineType;
        this.engineType     = newEngineType;
        await this.game.switchMode(newEngineType);
        console.log(`[Unified3DAdapter] switchMode → ${newEngineType}`);
    }

    async loadLevel(levelId, levelPath = null) {
        if (!this.isInitialized) throw new Error('[Unified3DAdapter] not initialized');
        this.isLoaded = false;

        try {
            if (levelPath) {
                const path = this._resolveLevelPath(levelPath, this.currentProject);
                const response = await fetch(path);
                if (!response.ok) {
                    throw new Error(`[Unified3DAdapter] Failed to fetch "${path}" (HTTP ${response.status})`);
                }
                const levelData = await response.json();
                await this.game.loadLevelFromData(levelData);
            } else {
                const project = this.currentProject ?? null;
                if (!project) {
                    throw new Error(`[Unified3DAdapter] Missing project context for level "${levelId}"`);
                }
                await this.game.loadProject(project, levelId);
            }
            this.isLoaded = true;
            console.log(`[Unified3DAdapter] level "${levelId}" loaded`);
        } catch (error) {
            console.error(`[Unified3DAdapter] Failed to load level "${levelId}":`, error);
            this.isLoaded = false;
            throw error;
        }
    }

    async unloadLevel() {
        if (!this.isLoaded) return;
        this.stop();
        this.isLoaded = false;
        console.log('[Unified3DAdapter] level unloaded');
    }

    getState() {
        return this.game?._getPlayerState?.() ?? {};
    }

    async setState(state) {
        if (!this.game || !state) return;
        if (state.health !== undefined) this.game._health = state.health;
        if (state.ammo   !== undefined) this.game._ammo   = state.ammo;
        if (state.lives  !== undefined) this.game._lives  = state.lives;
        if (state.coins  !== undefined) this.game._coins  = state.coins;
        if (state.score  !== undefined) this.game._score  = state.score;
    }

    start() {
        if (!this.isInitialized || !this.isLoaded || !this.game || this.game.isRunning) return;
        this.game._startLoop();
    }

    stop() {
        if (!this.game || !this.game.isRunning) return;
        this.game._stopLoop();
    }

    pause()  { this.game?.pause(); }
    resume() { this.game?.resume(); }

    destroy() {
        this.stop();
        if (this.game && this._onLevelComplete) {
            this.game.off('levelComplete', this._onLevelComplete);
        }
        this.game?.dispose?.();
        this.game              = null;
        this.engine            = null;
        this._onLevelComplete  = null;
        this.currentProject    = null;
        this.isLoaded          = false;
        super.destroy();
        console.log('[Unified3DAdapter] destroyed');
    }

    // ── Player data ──────────────────────────────────────────────────────────

    getPlayerData() {
        if (!this.game) return null;
        return this.game._getPlayerState?.() ?? null;
    }

    setPlayerData(playerData) {
        if (!this.game || !playerData) return;
        if (playerData.health !== undefined) this.game._health = playerData.health;
        if (playerData.ammo   !== undefined) this.game._ammo   = playerData.ammo;
        if (playerData.lives  !== undefined) this.game._lives  = playerData.lives;
        if (playerData.coins  !== undefined) this.game._coins  = playerData.coins;
        if (playerData.score  !== undefined) this.game._score  = playerData.score;
        if (playerData.position) this.game.strategy?.setSpawnPoint?.(playerData.position);
    }

    // ── Ability system (forwarded) ───────────────────────────────────────────

    useAbility(abilityId, dirX, dirY) {
        return this.game?.abilities?.castAbility?.(abilityId, dirX, dirY)
            ?? this.game?.weaponSystem?.fire?.() ?? false;
    }

    isAbilityReady(abilityId) {
        return this.game?.abilities?.isReady?.(abilityId) ?? true;
    }

    getCooldownFraction(abilityId) {
        return this.game?.abilities?.getCooldownFraction?.(abilityId) ?? 0;
    }

    // ── Config setters ───────────────────────────────────────────────────────

    setUsername(username) {
        this.username = username;
        if (this.game) this.game.username = username;
    }

    setProject(projectName) {
        this.currentProject = projectName || null;
        if (this.game) this.game.currentProject = this.currentProject;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    _resolveLevelPath(levelPath, projectName = null) {
        if (typeof levelPath !== 'string' || levelPath.trim() === '') {
            throw new Error('[Unified3DAdapter] levelPath must be a non-empty string');
        }
        if (/^https?:\/\//i.test(levelPath) || levelPath.startsWith('/')) {
            return levelPath;
        }
        const normalizedPath = levelPath.replace(/^\.?\//, '');
        return projectName
            ? `/projects/${encodeURIComponent(projectName)}/${normalizedPath}`
            : `/${normalizedPath}`;
    }
}

if (typeof window !== 'undefined') {
    window.Unified3DAdapter = Unified3DAdapter;
}
