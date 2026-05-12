/**
 * TopDown3DAdapter.js
 * CampaignController adapter for the topdown-3d engine.
 * ESM Version.
 */

import EngineAdapter from '../shared/EngineAdapter.js';

export default class TopDown3DAdapter extends EngineAdapter {
    constructor() {
        super('topdown-3d');
        this.engine    = null;
        this._strategy = null;
        this._container = null;
        this._onLevelComplete = null;
        this.currentProject = null;
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
        const { default: TopDownGame3D } = await import('/engines/topdown-3d/main.js');

        this.engine = new TopDownGame3D(this._container);
        if (this.currentProject) {
            this.engine.currentProject = this.currentProject;
        }
        await this.engine.init();
        this.isLoaded = false;

        // Attach strategy helper
        const { default: TopDown3DStrategy } = await import('/engines/topdown-3d/TopDown3DStrategy.js');
        this._strategy = new TopDown3DStrategy(this.engine);

        // Connect engine events to CampaignController callbacks
        this._onLevelComplete = data => this._triggerLevelComplete(data);
        this.engine.on('levelComplete', this._onLevelComplete);

        this.isInitialized = true;
        console.log('[TopDown3DAdapter] initialized');
    }

    _resolveLevelPath(levelPath, projectName = null) {
        if (typeof levelPath !== 'string' || levelPath.trim() === '') {
            throw new Error('[TopDown3DAdapter] levelPath must be a non-empty string');
        }
        if (/^https?:\/\//i.test(levelPath) || levelPath.startsWith('/')) {
            return levelPath;
        }
        const normalizedPath = levelPath.replace(/^\.?\//, '');
        return projectName
            ? `/projects/${encodeURIComponent(projectName)}/${normalizedPath}`
            : `/${normalizedPath}`;
    }

    setProject(projectName) {
        this.currentProject = projectName || null;
        if (this.engine) {
            this.engine.currentProject = this.currentProject;
        }
    }

    async loadLevel(levelId, levelPath = null) {
        if (!this.isInitialized) throw new Error('[TopDown3DAdapter] not initialized');
        this.isLoaded = false;

        try {
            if (levelPath) {
                const path = this._resolveLevelPath(levelPath, this.currentProject ?? this.engine?.currentProject ?? null);
                const response = await fetch(path);
                if (!response.ok) {
                    throw new Error(`[TopDown3DAdapter] Failed to fetch levelPath "${path}" (HTTP ${response.status})`);
                }
                const levelData = await response.json();
                await this.engine.loadLevelFromData(levelData);
            } else {
                const projectName = this.currentProject ?? this.engine?.currentProject ?? null;
                if (!projectName) {
                    throw new Error(`[TopDown3DAdapter] Missing project context for level "${levelId}"`);
                }
                await this.engine.loadProject(projectName, levelId);
            }
            this.isLoaded = true;
            console.log(`[TopDown3DAdapter] level "${levelId}" loaded successfully`);
        } catch (error) {
            console.error(`[TopDown3DAdapter] Failed to load level "${levelId}":`, error);
            throw error;
        }
    }

    async unloadLevel() {
        if (!this.isLoaded) return;
        this.stop();
        this.isLoaded = false;
    }

    start() {
        if (!this.isInitialized || !this.isLoaded || !this.engine || this.engine.isRunning) return;
        this.engine._startLoop?.();
    }

    stop() {
        if (!this.engine || !this.engine.isRunning) return;
        this.engine._stopLoop?.();
    }

    pause() {
        if (!this.engine) return;
        if (typeof this.engine.pause === 'function') {
            this.engine.pause();
            return;
        }
        this.engine.isPaused = true;
    }

    resume() {
        if (!this.engine) return;
        if (typeof this.engine.resume === 'function') {
            this.engine.resume();
            return;
        }
        this.engine.isPaused = false;
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
        this.stop();
        if (this.engine && this._onLevelComplete) {
            this.engine.off?.('levelComplete', this._onLevelComplete);
        }
        this.engine?.dispose?.();
        if (this._container?.id === 'topdown3d-container') {
            this._container.remove();
        }
        this._container = null;
        this.engine     = null;
        this._strategy  = null;
        this._onLevelComplete = null;
        this.currentProject = null;
        this.isLoaded   = false;
        super.destroy();
    }
}

// Ensure global access if needed
if (typeof window !== 'undefined') {
    window.TopDown3DAdapter = TopDown3DAdapter;
}
