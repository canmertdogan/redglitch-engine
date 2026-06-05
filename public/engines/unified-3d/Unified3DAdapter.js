/**
 * Unified3DAdapter.js
 * Campaign adapter for the Unified 3D Engine.
 * Replaces FPS3DAdapter, TopDown3DAdapter, and Platformer3DAdapter with a single
 * adapter that delegates to Unified3DGame.
 *
 * ESM module — imported by CampaignController._loadEngineScripts().
 */

import EngineAdapter from '../shared/EngineAdapter.js';

export default class Unified3DAdapter extends EngineAdapter {

    constructor(engineType = 'fps-3d') {
        super(engineType);
        this.game              = null;  // Unified3DGame instance
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

        const { default: Unified3DGame } = await import('/engines/unified-3d/Unified3DGame.js');

        this.game = new Unified3DGame(container, { engineType: this._requestedType });
        await this.game.init(this._requestedType);

        if (this.currentProject) {
            if (this.game.core) this.game.core.currentProject = this.currentProject;
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
        this.game.on?.('levelComplete', this._onLevelComplete);

        this.isInitialized = true;
        this.isLoaded      = false;
        console.log(`[Unified3DAdapter] initialized (mode: ${this._requestedType})`);
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
                    throw new Error(`[Unified3DAdapter] Failed to fetch levelPath "${path}" (HTTP ${response.status})`);
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
        return this.game?.mode?.getLevelState?.() ?? {};
    }

    async setState(state) {
        await this.game?.mode?.setLevelState?.(state);
    }

    start() {
        if (!this.isInitialized || !this.isLoaded || !this.game) return;
        this.game.core?._startLoop?.();
    }

    stop() {
        if (!this.game) return;
        this.game.core?._stopLoop?.();
    }

    pause()  { this.game?.pause(); }
    resume() { this.game?.resume(); }

    destroy() {
        this.stop();
        if (this.game && this._onLevelComplete) {
            this.game.off?.('levelComplete', this._onLevelComplete);
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
        return this.game?.mode?.getPlayerData?.() ?? null;
    }

    setPlayerData(playerData) {
        this.game?.mode?.setPlayerData?.(playerData);
    }

    // ── Ability system (forwarded to mode) ───────────────────────────────────

    useAbility(abilityId, dirX, dirY) {
        return this.game?.mode?.useAbility?.(abilityId, dirX, dirY) ?? false;
    }

    isAbilityReady(abilityId) {
        return this.game?.mode?.isAbilityReady?.(abilityId) ?? true;
    }

    getCooldownFraction(abilityId) {
        return this.game?.mode?.getCooldownFraction?.(abilityId) ?? 0;
    }

    // ── Config setters ───────────────────────────────────────────────────────

    setUsername(username) {
        this.username = username;
        if (this.game?.core) this.game.core.username = username;
    }

    setProject(projectName) {
        this.currentProject = projectName || null;
        if (this.game?.core) this.game.core.currentProject = this.currentProject;
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
