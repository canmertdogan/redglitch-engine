/**
 * FPS3DAdapter.js
 * Adapter for the fps-3d engine.
 * ESM Version.
 */

import EngineAdapter from '../shared/EngineAdapter.js';

export default class FPS3DAdapter extends EngineAdapter {
    constructor() {
        super('fps-3d');
        this.game         = null;
        this.username     = null;
        this.currentProject = null;
        this._onLevelComplete = null;
    }

    // ── EngineAdapter lifecycle ───────────────────────────────────────────────

    async initialize() {
        if (this.isInitialized) { console.warn('[FPS3DAdapter] already initialized'); return; }

        const container = document.getElementById('game-container')
            ?? document.getElementById('canvas-container')
            ?? (() => {
                const div = document.createElement('div');
                div.id = 'fps3d-container';
                div.style.cssText = 'position:fixed;inset:0;z-index:10;';
                document.body.appendChild(div);
                return div;
            })();

        const { default: FPSGame } = await import('/engines/fps-3d/main.js');
        
        this.game = new FPSGame(container);
        if (this.currentProject) {
            this.game.currentProject = this.currentProject;
        }
        this.engine = this.game;
        await this.game.init();

        this._onLevelComplete = (data = {}) => {
            this._triggerLevelComplete({
                levelId: data.levelId ?? this.game?._levelId ?? null,
                playerState: data.playerState ?? this.getPlayerData(),
                ...data,
            });
        };
        this.game.on?.('levelComplete', this._onLevelComplete);

        const { default: FPS3DStrategy } = await import('/engines/fps-3d/FPS3DStrategy.js');
        this.game.strategy = new FPS3DStrategy(this.game);

        this.isInitialized = true;
        this.isLoaded = false;
        console.log('[FPS3DAdapter] initialized');
    }

    async loadLevel(levelId, levelPath = null) {
        if (!this.isInitialized) throw new Error('[FPS3DAdapter] not initialized');
        this.isLoaded = false;

        try {
            if (levelPath) {
                const path = this._resolveLevelPath(levelPath, this.currentProject ?? this.game?.currentProject ?? null);
                const response = await fetch(path);
                if (!response.ok) {
                    throw new Error(`[FPS3DAdapter] Failed to fetch levelPath "${path}" (HTTP ${response.status})`);
                }
                const levelData = await response.json();
                await this.game.loadLevelFromData(levelData);
            } else {
                const project = this.currentProject ?? this.game?.currentProject ?? null;
                if (!project) {
                    throw new Error(`[FPS3DAdapter] Missing project context for level "${levelId}"`);
                }
                await this.game.loadProject(project, levelId);
            }
            this.isLoaded = true;
            console.log(`[FPS3DAdapter] level "${levelId}" loaded successfully`);
        } catch (error) {
            console.error(`[FPS3DAdapter] Failed to load level "${levelId}":`, error);
            this.isLoaded = false;
            throw error;
        }
    }

    async unloadLevel() {
        if (!this.isLoaded) return;
        this.stop();
        this.game?.onLevelUnloaded?.();
        this.isLoaded = false;
        console.log('[FPS3DAdapter] level unloaded');
    }

    getState() {
        return this.game?.strategy?.getState() ?? {};
    }

    async setState(state) {
        this.game?.strategy?.setState(state);
    }

    start() {
        if (!this.isInitialized || !this.isLoaded || !this.game || this.game.isRunning) return;
        this.game._startLoop?.();
    }

    stop() {
        if (!this.game || !this.game.isRunning) return;
        this.game._stopLoop?.();
    }

    pause() {
        if (!this.game) return;
        if (typeof this.game.pause === 'function') {
            this.game.pause();
            return;
        }
        this.game.isPaused = true;
    }

    resume() {
        if (!this.game) return;
        if (typeof this.game.resume === 'function') {
            this.game.resume();
            return;
        }
        this.game.isPaused = false;
    }

    destroy() {
        this.stop();
        if (this.game && this._onLevelComplete) {
            this.game.off?.('levelComplete', this._onLevelComplete);
        }
        this.game?.dispose?.();
        this.game         = null;
        this.engine       = null;
        this._onLevelComplete = null;
        this.currentProject = null;
        this.isLoaded     = false;
        super.destroy();
        console.log('[FPS3DAdapter] destroyed');
    }

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

    useAbility(abilityId, dirX, dirY) {
        if (!this.game || !this.game.strategy) return false;
        return this.game.strategy.useAbility?.(abilityId, dirX, dirY) ?? false;
    }

    isAbilityReady(abilityId) {
        if (!this.game || !this.game.strategy) return false;
        return this.game.strategy.isAbilityReady?.(abilityId) ?? true;
    }

    getCooldownFraction(abilityId) {
        if (!this.game || !this.game.strategy) return 0;
        return this.game.strategy.getCooldownFraction?.(abilityId) ?? 0;
    }

    setUsername(username) {
        this.username = username;
        if (this.game) this.game.username = username;
    }

    setProject(projectName) {
        this.currentProject = projectName || null;
        if (this.game) this.game.currentProject = this.currentProject;
    }

    _resolveLevelPath(levelPath, projectName = null) {
        if (typeof levelPath !== 'string' || levelPath.trim() === '') {
            throw new Error('[FPS3DAdapter] levelPath must be a non-empty string');
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
    window.FPS3DAdapter = FPS3DAdapter;
}
