/**
 * Unified3DGame.js — Single entry point for ALL RedGlitch 3D games.
 *
 * Replaces FPSGame, TopDownGame3D, and Platformer3DGame with one class that:
 *   1. Instantiates Game3DCore (shared init, loop, save/load)
 *   2. Dynamically loads the correct mode module based on engineType
 *   3. Exposes backward-compatible globals (window.FPSGame, etc.)
 *   4. Provides a uniform public API for runtime-loader & campaign system
 *
 * Usage:
 *   const game = new Unified3DGame(container, { engineType: 'fps-3d' });
 *   await game.init();
 *   await game.login('player1');
 *   await game.loadProject('MyProject', 'level1');
 */

import Game3DCore from './Game3DCore.js';

// ── Mode registry ─────────────────────────────────────────────────────────────

const MODE_REGISTRY = Object.freeze({
    'fps-3d':        () => import('./modes/FPSMode.js'),
    'topdown-3d':    () => import('./modes/TopDownMode.js'),
    'platformer-3d': () => import('./modes/PlatformerMode.js'),
});

// ── Unified3DGame ─────────────────────────────────────────────────────────────

export default class Unified3DGame {

    /**
     * @param {HTMLElement|string} container  DOM element or selector
     * @param {object}             [options]
     * @param {string}             [options.engineType='fps-3d']  Initial mode
     */
    constructor(container, options = {}) {
        /** @type {HTMLElement} */
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        if (!this.container) {
            this.container = document.getElementById('game-container')
                || document.getElementById('game-viewport')
                || document.body;
        }

        /** @type {string} */
        this._requestedType = options.engineType || 'fps-3d';

        /** @type {object} */
        this._options = options;

        /** @type {Game3DCore|null} */
        this.core = null;

        /** @type {boolean} */
        this._initialized = false;
    }

    // ── Public API (matches legacy engines) ──────────────────────────────────

    /**
     * init() — Create shared systems and load the mode module.
     * @param {string} [engineType]  Override initial type (used by campaign switchEngine)
     */
    async init(engineType) {
        const type = engineType || this._requestedType;
        console.log(`[Unified3DGame] init(${type})`);

        // Create the core game instance
        this.core = new Game3DCore(this.container, {
            ...this._options,
            engineType: type,
        });

        // Init all shared systems
        await this.core.initCore();

        // Load and set the mode module
        await this._loadAndSetMode(type);

        // Expose backward-compatible globals
        this._exposeGlobals();

        this._initialized = true;
        console.log(`[Unified3DGame] Ready (mode: ${type})`);

        return this;
    }

    /**
     * switchMode(engineType) — Hot-swap mode at runtime (e.g. campaign engine switch).
     * Preserves the core systems but replaces the active mode module.
     */
    async switchMode(engineType) {
        if (!this.core) throw new Error('[Unified3DGame] Not initialised — call init() first');
        console.log(`[Unified3DGame] switchMode → ${engineType}`);

        // Pause during switch
        this.core.pause();

        // Unload current level
        await this.core.unloadLevel3D();

        // Load new mode
        await this._loadAndSetMode(engineType);

        // Update requested type
        this._requestedType = engineType;

        // Re-expose globals
        this._exposeGlobals();

        // Resume
        this.core.resume();

        console.log(`[Unified3DGame] switchMode complete → ${engineType}`);
    }

    /** Set username and start the game loop. */
    async login(username) {
        if (!this.core) throw new Error('[Unified3DGame] Not initialised');
        await this.core.login(username);
    }

    /** Load a project level from the server. */
    async loadProject(projectName, levelId) {
        if (!this.core) throw new Error('[Unified3DGame] Not initialised');
        await this.core.loadProject(projectName, levelId);
    }

    /** Load a level directly from JSON data (playtest mode). */
    async loadLevelFromData(levelData) {
        if (!this.core) throw new Error('[Unified3DGame] Not initialised');
        await this.core.loadLevelFromData(levelData);
    }

    async saveGame(slot) { await this.core?.saveGame(slot); }
    async loadGame(slot) { await this.core?.loadGame(slot); }
    pause()  { this.core?.pause(); }
    resume() { this.core?.resume(); }
    toggle() { this.core?.toggle(); }

    dispose() {
        this.core?.dispose();
        this.core = null;
        this._initialized = false;
    }

    // ── Event emitter delegation ──────────────────────────────────────────────

    on(event, cb)  { this.core?.on(event, cb); }
    off(event, cb) { this.core?.off(event, cb); }
    emit(event, data) { this.core?.emit(event, data); }

    // ── Property proxies ─────────────────────────────────────────────────────

    get engineType3D()   { return this.core?.engineType3D ?? this._requestedType; }
    get isRunning()      { return this.core?.isRunning ?? false; }
    get isPaused()       { return this.core?.isPaused ?? false; }
    get gameTime()       { return this.core?.gameTime ?? 0; }
    get currentProject() { return this.core?.currentProject ?? null; }
    get mode()           { return this.core?.mode ?? null; }
    get scene()          { return this.core?.scene ?? null; }
    get renderer3d()     { return this.core?.renderer3d ?? null; }
    get camera3d()       { return this.core?.camera3d ?? null; }
    get physics()        { return this.core?.physics ?? null; }
    get input()          { return this.core?.input ?? null; }
    get audio()          { return this.core?.audio ?? null; }

    // Forward lifecycle callbacks
    set onReady(fn)      { if (this.core) this.core.onReady = fn; }
    set onLevelReady(fn) { if (this.core) this.core.onLevelReady = fn; }
    set onGameOver(fn)   { if (this.core) this.core.onGameOver = fn; }

    /** Level completion helper (called by modes, forwarded for campaign compat) */
    completeLevel(data) { return this.core?.completeLevel(data); }

    // ── Internal ──────────────────────────────────────────────────────────────

    async _loadAndSetMode(engineType) {
        const loader = MODE_REGISTRY[engineType];
        if (!loader) {
            throw new Error(`[Unified3DGame] Unknown engine type: "${engineType}". Valid: ${Object.keys(MODE_REGISTRY).join(', ')}`);
        }

        const module = await loader();
        const ModeClass = module.default;
        const modeInstance = new ModeClass();

        await this.core.setMode(modeInstance);
    }

    /**
     * Expose backward-compatible globals so existing runtime-loader,
     * campaign adapter, and project index.html files continue to work.
     */
    _exposeGlobals() {
        // Primary unified global
        window.Unified3DGame = this;

        // Legacy globals — all point to the same Unified3DGame instance
        window.FPSGame          = this;
        window.TopDownGame3D    = this;
        window.Platformer3DGame = this;

        // Common engine reference
        window.game3d = this;
    }

    // ── Static factory ────────────────────────────────────────────────────────

    /**
     * Convenience factory that reads engineType from URL params or project config.
     * @param {HTMLElement} container
     * @param {object}      [overrides]
     * @returns {Promise<Unified3DGame>}
     */
    static async create(container, overrides = {}) {
        // Read URL params
        const params = new URLSearchParams(window.location.search);
        let engineType = params.get('engine') || overrides.engineType;

        // Fallback: try fetching project config
        if (!engineType) {
            try {
                const res = await fetch('/api/projects/current');
                if (res.ok) {
                    const config = await res.json();
                    engineType = config.engineType || 'fps-3d';
                }
            } catch (_e) {
                engineType = 'fps-3d';
            }
        }

        const game = new Unified3DGame(container, { ...overrides, engineType });
        await game.init();
        return game;
    }
}
