/**
 * FPS3DAdapter.js — Phase 26
 * Adapter for the fps-3d engine, following the same EngineAdapter interface used
 * by TopDown3DAdapter, PlatformerAdapter etc. so CampaignController can drive
 * all engine types with a single uniform API.
 *
 * This adapter wraps `window.FPSGame` (the FPSGame class from fps-3d/main.js)
 * and exposes the standard lifecycle methods expected by CampaignController.
 */

class FPS3DAdapter extends EngineAdapter {
    constructor() {
        super('fps-3d');
        /** @type {FPSGame|null} */
        this.game    = null;
        this.username = null;
    }

    // ── EngineAdapter lifecycle ───────────────────────────────────────────────

    async initialize() {
        if (this.isInitialized) { console.warn('[FPS3DAdapter] already initialized'); return; }

        if (typeof window.FPSGame === 'undefined') {
            throw new Error('[FPS3DAdapter] window.FPSGame not loaded');
        }

        const container = document.getElementById('game-container') || document.body;
        this.game = new window.FPSGame(container);
        await this.game.init();

        this.isInitialized = true;
        console.log('[FPS3DAdapter] initialized');
    }

    /** @param {string} levelId */
    async loadLevel(levelId) {
        if (!this.isInitialized) throw new Error('[FPS3DAdapter] not initialized');

        await this.game.loadProject(this.currentProject || '', levelId);
        this.isLoaded = true;
        console.log(`[FPS3DAdapter] level loaded: ${levelId}`);
    }

    async unloadLevel() {
        if (!this.isLoaded) return;
        this.game?.onLevelUnloaded?.();
        this.isLoaded = false;
        console.log('[FPS3DAdapter] level unloaded');
    }

    getState() {
        return this.game?.strategy?.getState() ?? {};
    }

    setState(state) {
        this.game?.strategy?.setState(state);
    }

    async start() {
        this.game?._startLoop();
    }

    async stop() {
        this.game?._stopLoop();
    }

    dispose() {
        this.game?.dispose();
        this.game = null;
        this.isInitialized = false;
        console.log('[FPS3DAdapter] disposed');
    }

    // ── Player data pass-through ──────────────────────────────────────────────

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
