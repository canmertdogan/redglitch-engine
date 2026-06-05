/**
 * ModeInterface.js — Abstract contract for Unified3D mode modules.
 *
 * Each 3D game mode (FPS, TopDown, Platformer) extends this class and
 * plugs into Game3DCore's lifecycle.  The core calls these hooks at the
 * right moments; modes register their specific systems and drive their
 * own update logic.
 *
 * Subclass checklist:
 *   1.  Override `get modeId()` → return 'fps-3d' | 'topdown-3d' | 'platformer-3d'
 *   2.  Override `onInit(game)` → instantiate mode-specific systems
 *   3.  Override `onLevelLoaded(level)` → hydrate from level data
 *   4.  Override `update(dt)` → per-frame variable-step logic
 *   5.  (optional) Override `fixedUpdate(dt)` if physics sub-stepping is needed
 *   6.  (optional) Override `getPlayerData()` / `setPlayerData()` for save/load
 *   7.  Override `dispose()` → tear down systems
 */

export default class ModeInterface {

    constructor() {
        /** @type {import('./Game3DCore.js').default|null} Reference to the owning game */
        this.game = null;
    }

    // ── Identity ──────────────────────────────────────────────────────────────

    /**
     * Unique mode identifier — matches the legacy `engineType` string so that
     * existing level data continues to work.
     * @returns {string}
     */
    get modeId() {
        throw new Error('[ModeInterface] modeId getter must be overridden');
    }

    // ── Lifecycle hooks (called by Game3DCore) ────────────────────────────────

    /**
     * Called once after all shared systems (Renderer, Camera, Physics, etc.)
     * have been initialised.  Use this to create mode-specific systems.
     *
     * @param {import('./Game3DCore.js').default} game  The owning game instance
     * @returns {Promise<void>}
     */
    async onInit(game) {
        this.game = game;
    }

    /**
     * Called after Engine3DAdapter has populated the scene from level JSON.
     * Hydrate mode-specific systems from the level data here.
     *
     * @param {object} level  Validated, hydrated level data
     * @returns {Promise<void>}
     */
    async onLevelLoaded(level) {} // eslint-disable-line no-unused-vars

    /**
     * Called before the scene is cleared during level unload.
     * Tear down mode-specific level state here.
     */
    onLevelUnloaded() {}

    // ── Per-frame hooks ──────────────────────────────────────────────────────

    /**
     * Variable-step update — called once per frame with the capped delta.
     * Drive camera, VFX, HUD, audio sync, and anything framerate-dependent.
     *
     * @param {number} dt  Elapsed seconds (capped at 0.1)
     */
    update(dt) {} // eslint-disable-line no-unused-vars

    /**
     * Fixed-step update — called zero or more times per frame at FIXED_STEP
     * intervals inside the physics accumulator loop.  Drive physics bodies,
     * character controller fixed-step, etc.
     *
     * @param {number} dt  Fixed step size (usually 1/60)
     */
    fixedUpdate(dt) {} // eslint-disable-line no-unused-vars

    // ── Save / Load ──────────────────────────────────────────────────────────

    /**
     * Serialize mode-specific player state for saving.
     * Merged into the overall save payload by Game3DCore.
     * @returns {object}
     */
    getPlayerData() { return {}; }

    /**
     * Deserialize mode-specific player state after loading.
     * @param {object} data  Previously serialized via getPlayerData()
     * @returns {Promise<void>}
     */
    async setPlayerData(data) {} // eslint-disable-line no-unused-vars

    /**
     * Serialize mode-specific level state for saving.
     * @returns {object}
     */
    getLevelState() { return {}; }

    /**
     * Deserialize mode-specific level state after loading.
     * @param {object} state  Previously serialized via getLevelState()
     * @returns {Promise<void>}
     */
    async setLevelState(state) {} // eslint-disable-line no-unused-vars

    // ── Input helpers ────────────────────────────────────────────────────────

    /**
     * Called when pointer lock is requested (FPS mode) or released.
     * Override if mode needs pointer lock behaviour.
     */
    requestPointerLock() {}
    releasePointerLock() {}

    // ── Cleanup ──────────────────────────────────────────────────────────────

    /**
     * Dispose all mode-specific systems and detach event listeners.
     * Called by Game3DCore.dispose().
     */
    dispose() {
        this.game = null;
    }
}
