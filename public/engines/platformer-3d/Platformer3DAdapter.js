/**
 * Platformer3DAdapter.js — Phase 51
 * Adapter for the platformer-3d engine, following the same EngineAdapter interface
 * used by FPS3DAdapter and TopDown3DAdapter so CampaignController can drive all
 * engine types with a single uniform API.
 *
 * This adapter wraps `window.Platformer3DGame` (from platformer-3d/main.js)
 * and exposes the standard lifecycle methods expected by CampaignController.
 */

class Platformer3DAdapter extends EngineAdapter {
    constructor() {
        super('platformer-3d');
        /** @type {Platformer3DGame|null} */
        this.game           = null;
        this.username       = null;
        this.currentProject = null;
    }

    // ── EngineAdapter lifecycle ───────────────────────────────────────────────

    async initialize() {
        if (this.isInitialized) { console.warn('[Platformer3DAdapter] already initialized'); return; }

        if (typeof window.Platformer3DGame === 'undefined') {
            throw new Error('[Platformer3DAdapter] window.Platformer3DGame not loaded — ensure platformer-3d engine scripts are in the manifest');
        }

        const container = document.getElementById('game-container') || document.body;
        this.game = new window.Platformer3DGame(container);
        await this.game.init();

        this.isInitialized = true;
        console.log('[Platformer3DAdapter] initialized');
    }

    /** @param {string} levelId @param {string|null} _levelPath */
    async loadLevel(levelId, _levelPath = null) {
        if (!this.isInitialized) throw new Error('[Platformer3DAdapter] not initialized');
        const project = this.currentProject || '';
        await this.game.loadProject(project, levelId);
        this.isLoaded = true;
        console.log(`[Platformer3DAdapter] level loaded: ${levelId}`);
    }

    async unloadLevel() {
        if (!this.isLoaded) return;
        this.game?.onLevelUnloaded?.();
        this.isLoaded = false;
        console.log('[Platformer3DAdapter] level unloaded');
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
        this.game?.destroy?.();
        this.game           = null;
        this.isInitialized  = false;
        this.isLoaded       = false;
        super.destroy();
        console.log('[Platformer3DAdapter] destroyed');
    }

    // ── Cross-engine player data ──────────────────────────────────────────────

    getPlayerData() {
        if (!this.game) return null;
        const s = this.game.strategy;
        if (!s) return null;
        const pos = s.getPlayerPosition();
        return {
            position: pos,
            health:   s.getState().health ?? 3,
            lives:    s.getLives(),
            coins:    s.getCoins(),
            score:    s.getScore(),
            flags:    {},
        };
    }

    setPlayerData(playerData) {
        if (!this.game || !playerData) return;
        const s = this.game.strategy;
        if (!s) return;
        if (playerData.position) s.setSpawnPoint(playerData.position);
        s.setState({
            health: playerData.health,
            lives:  playerData.lives,
            coins:  playerData.coins,
            score:  playerData.score,
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
    window.Platformer3DAdapter = Platformer3DAdapter;
}
