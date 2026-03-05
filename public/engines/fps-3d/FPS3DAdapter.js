/**
 * FPS3DAdapter.js — Phase 26 (extended Phase 35)
 * Adapter for the fps-3d engine, following the same EngineAdapter interface used
 * by TopDownAdapter, PlatformerAdapter etc. so CampaignController can drive
 * all engine types with a single uniform API.
 *
 * This adapter wraps `window.FPSGame` (the FPSGame class from fps-3d/main.js)
 * and exposes the standard lifecycle methods expected by CampaignController.
 */

class FPS3DAdapter extends EngineAdapter {
    constructor() {
        super('fps-3d');
        /** @type {FPSGame|null} */
        this.game         = null;
        this.username     = null;
        this.currentProject = null;
    }

    // ── EngineAdapter lifecycle ───────────────────────────────────────────────

    async initialize() {
        if (this.isInitialized) { console.warn('[FPS3DAdapter] already initialized'); return; }

        if (typeof window.FPSGame === 'undefined') {
            throw new Error('[FPS3DAdapter] window.FPSGame not loaded — ensure fps-3d engine scripts are in the manifest');
        }

        const container = document.getElementById('game-container') || document.body;
        this.game = new window.FPSGame(container);
        await this.game.init();

        this.isInitialized = true;
        console.log('[FPS3DAdapter] initialized');
    }

    /** @param {string} levelId @param {string|null} levelPath */
    async loadLevel(levelId, levelPath = null) {
        if (!this.isInitialized) throw new Error('[FPS3DAdapter] not initialized');

        const project = this.currentProject || '';
        await this.game.loadProject(project, levelId);
        this.isLoaded = true;
        console.log(`[FPS3DAdapter] level loaded: ${levelId}`);
    }

    async unloadLevel() {
        if (!this.isLoaded) return;
        this.game?.onLevelUnloaded?.();
        this.isLoaded = false;
        console.log('[FPS3DAdapter] level unloaded');
    }

    /** @returns {Object} serializable state snapshot */
    getState() {
        return this.game?.strategy?.getState() ?? {};
    }

    /** @param {Object} state — previously returned from getState() */
    async setState(state) {
        this.game?.strategy?.setState(state);
    }

    async start() {
        this.game?._startLoop?.();
    }

    async stop() {
        this.game?._stopLoop?.();
    }

    destroy() {
        this.game?.dispose?.();
        this.game         = null;
        this.isInitialized = false;
        this.isLoaded      = false;
        super.destroy();
        console.log('[FPS3DAdapter] destroyed');
    }

    // ── Cross-engine player data ──────────────────────────────────────────────

    getPlayerData() {
        if (!this.game) return null;
        const s = this.game.strategy;
        if (!s) return null;
        const pos    = s.getPlayerPosition();
        const state  = s.getState();
        return {
            position: pos,
            health:   state.health  ?? 100,
            ammo:     state.ammo    ?? {},
            flags:    state.flags   ?? {},
        };
    }

    setPlayerData(playerData) {
        if (!this.game || !playerData) return;
        const s = this.game.strategy;
        if (!s) return;
        if (playerData.position) s.setSpawnPoint(playerData.position);
        s.setState({
            health: playerData.health,
            ammo:   playerData.ammo,
            flags:  playerData.flags,
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** @param {string} username */
    setUsername(username) {
        this.username = username;
        if (this.game) this.game.username = username;
    }

    /** @param {string} projectName */
    setProject(projectName) {
        this.currentProject = projectName;
        if (this.game) this.game.currentProject = projectName;
    }
}

// Expose so CampaignController can instantiate it by engine-type string
if (typeof window !== 'undefined') {
    window.FPS3DAdapter = FPS3DAdapter;
}
