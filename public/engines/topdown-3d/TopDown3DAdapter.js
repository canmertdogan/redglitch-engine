/**
 * TopDown3DAdapter.js — Phase 20
 * CampaignController adapter for the topdown-3d engine.
 *
 * Follows the same interface as TopDownAdapter / PlatformerAdapter so
 * CampaignController._switchEngine() can drive it uniformly.
 *
 * Loaded as a plain <script> (non-module) alongside the other adapters so
 * CampaignController can instantiate it with `new TopDown3DAdapter()`.
 * It dynamically imports the ES-module TopDownGame3D when needed.
 *
 * Registration: CampaignController._createAdapter() switch-case is patched
 * at the bottom of this file (adds case 'topdown-3d') without modifying the
 * original CampaignController source — it runs after CampaignController loads.
 */

/* global EngineAdapter, CrossEngineSerializer */

class TopDown3DAdapter extends EngineAdapter {
    constructor() {
        super('topdown-3d');
        /** @type {import('./main.js').default|null} */
        this.engine    = null;
        this._strategy = null;
        this._container = null;
        this._exitMonitor = null;
        this.exitTriggered = false;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    async initialize() {
        if (this.isInitialized) return;

        // Determine or create a container div for the engine canvas
        this._container = document.getElementById('game-container')
            ?? document.getElementById('canvas-container')
            ?? (() => {
                const div = document.createElement('div');
                div.id = 'topdown3d-container';
                div.style.cssText = 'position:fixed;inset:0;z-index:10;';
                document.body.appendChild(div);
                return div;
            })();

        // Dynamic import of the ES-module engine entry point
        const { default: TopDownGame3D } = await import(
            '/engines/topdown-3d/main.js'
        );

        this.engine = new TopDownGame3D();
        await this.engine.initialize(this._container);

        // Attach strategy helper
        const { default: TopDown3DStrategy } = await import(
            '/engines/topdown-3d/TopDown3DStrategy.js'
        );
        this._strategy = new TopDown3DStrategy(this.engine);

        // Connect engine events to CampaignController callbacks
        this.engine.on('levelComplete', data => this._triggerLevelComplete(data));

        this.isInitialized = true;
        console.log('[TopDown3DAdapter] initialized');
    }

    async loadLevel(levelId, _levelPath = null) {
        if (!this.isInitialized) throw new Error('[TopDown3DAdapter] not initialized');
        this.exitTriggered = false;
        await this.engine.loadProject(
            this.engine.currentProject ?? 'Topdown3D Demo', levelId
        );
        this.isLoaded = true;
        this._startExitMonitoring();
        console.log(`[TopDown3DAdapter] level "${levelId}" loaded`);
    }

    async unloadLevel() {
        if (!this.isLoaded) return;
        this._stopExitMonitoring();
        this.engine.stop?.();
        this.isLoaded = false;
    }

    start() {
        if (this.engine && !this.engine._running) this.engine.start?.();
    }

    stop() {
        this.engine?.stop?.();
    }

    pause() {
        if (this.engine) this.engine._paused = true;
    }

    resume() {
        if (this.engine) this.engine._paused = false;
    }

    // ── State ─────────────────────────────────────────────────────────────────
    getState() {
        return this._strategy?.getState() ?? null;
    }

    async setState(state) {
        await this._strategy?.setState(state);
    }

    getPlayerData() {
        return this._strategy?.getPlayerData() ?? null;
    }

    setPlayerData(playerData) {
        this._strategy?.setPlayerData(playerData);
    }

    // ── Strategy pass-through ─────────────────────────────────────────────────
    screenToMap(screenX, screenY) {
        return this._strategy?.screenToMap(screenX, screenY)
            ?? { wx: 0, wz: 0, wy: 0, hit: false };
    }

    commandUnitsTo(unitIds, screenX, screenY) {
        this._strategy?.commandUnitsTo(unitIds, screenX, screenY);
    }

    selectUnitsInRect(x0, y0, x1, y1, team = 0) {
        return this._strategy?.selectUnitsInRect(x0, y0, x1, y1, team) ?? [];
    }

    castAbilityAtScreen(casterId, abilityId, screenX, screenY) {
        return this._strategy?.castAbilityAtScreen(casterId, abilityId, screenX, screenY) ?? false;
    }

    // ── Abilities (unified interface) ─────────────────────────────────────────
    useAbility(abilityId, screenX, screenY) {
        const heroId = this.engine?.selectedUnits?.[0] ?? null;
        if (!heroId) return false;
        return this._strategy?.castAbilityAtScreen(heroId, abilityId, screenX, screenY) ?? false;
    }

    isAbilityReady(abilityId) {
        const heroId = this.engine?.selectedUnits?.[0] ?? null;
        if (!heroId || !this.engine?.abilities) return false;
        return this.engine.abilities.isReady(heroId, abilityId);
    }

    getCooldownFraction(abilityId) {
        const heroId = this.engine?.selectedUnits?.[0] ?? null;
        if (!heroId || !this.engine?.abilities) return 0;
        return this.engine.abilities.getCooldownFraction(heroId, abilityId);
    }

    // ── Exit monitoring ───────────────────────────────────────────────────────
    _startExitMonitoring() {
        this._stopExitMonitoring();
        // TopDownGame3D fires 'levelComplete' — we just watch engine flags
        // as a belt-and-suspenders fallback check every 200 ms.
        this._exitMonitor = setInterval(() => {
            if (!this.engine || this.exitTriggered) return;
            if (this.engine._levelComplete) {
                this.exitTriggered = true;
                this._stopExitMonitoring();
                this._triggerLevelComplete({
                    levelId:     this.engine._levelId,
                    playerState: this.getPlayerData(),
                });
            }
        }, 200);
    }

    _stopExitMonitoring() {
        if (this._exitMonitor) {
            clearInterval(this._exitMonitor);
            this._exitMonitor = null;
        }
    }

    _triggerLevelComplete(data) {
        if (this.levelCompleteCallback) {
            this.levelCompleteCallback({ engineType: 'topdown-3d', ...data });
        } else {
            console.warn('[TopDown3DAdapter] no levelCompleteCallback set');
        }
    }

    // ── Destroy ───────────────────────────────────────────────────────────────
    destroy() {
        console.log('[TopDown3DAdapter] destroying');
        this._stopExitMonitoring();
        this.engine?.dispose?.();
        if (this._container?.id === 'topdown3d-container') {
            this._container.remove();
        }
        this._container = null;
        this.engine     = null;
        this._strategy  = null;
        super.destroy?.();
    }
}

// ── Patch CampaignController factory (runs after CC loads) ────────────────────
// Hooks into the existing switch-case by wrapping _createAdapter at runtime.
(function patchCampaignController() {
    if (typeof window === 'undefined') return;

    // Store the patch in a queue; apply once CampaignController is defined.
    const apply = () => {
        if (typeof CampaignController === 'undefined') return false;

        const proto = CampaignController.prototype;
        if (proto.__topdown3dPatched) return true;
        proto.__topdown3dPatched = true;

        const orig = proto._switchEngine;
        if (!orig) return true;

        proto._switchEngine = async function (newEngineType) {
            if (newEngineType === 'topdown-3d') {
                // Handle topdown-3d inline without modifying switch-case
                console.log('[CampaignController] Creating TopDown3DAdapter…');
                this._showTransitionScreen?.(newEngineType);

                const adapter = new TopDown3DAdapter();
                if (adapter.setCampaignController) adapter.setCampaignController(this);

                console.log('[CampaignController] Initializing topdown-3d adapter…');
                await adapter.initialize();

                if (this.playerData) adapter.setPlayerData(this.playerData);

                this.currentAdapter    = adapter;
                this.currentEngineType = 'topdown-3d';
                return;
            }
            return orig.call(this, newEngineType);
        };
        return true;
    };

    if (!apply()) {
        // Retry up to 5 s after page load
        let attempts = 0;
        const interval = setInterval(() => {
            if (apply() || ++attempts > 50) clearInterval(interval);
        }, 100);
    }
})();

// CommonJS compat
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TopDown3DAdapter;
}
