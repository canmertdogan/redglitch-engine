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
        this._onLevelComplete = null;
        this._chainedOnLevelComplete = null;
        this._levelCompletionSent = false;
    }

    // ── EngineAdapter lifecycle ───────────────────────────────────────────────

    async initialize() {
        if (this.isInitialized) { console.warn('[Platformer3DAdapter] already initialized'); return; }

        // Determine or create a container div for the engine canvas
        const container = document.getElementById('game-container')
            ?? document.getElementById('canvas-container')
            ?? (() => {
                const div = document.createElement('div');
                div.id = 'platformer3d-container';
                div.style.cssText = 'position:fixed;inset:0;z-index:10;';
                document.body.appendChild(div);
                return div;
            })();

        // Dynamic import of the ES-module engine entry point
        const { default: Platformer3DGame } = await import('/engines/platformer-3d/main.js');
        
        this.game = new Platformer3DGame(container);
        if (this.currentProject) {
            this.game.currentProject = this.currentProject;
        }
        this.engine = this.game;
        await this.game.init();

        this._chainedOnLevelComplete = this.game.onLevelComplete;
        this._onLevelComplete = (data = {}) => {
            if (typeof this._chainedOnLevelComplete === 'function') {
                this._chainedOnLevelComplete(data);
            }
            if (this._levelCompletionSent) return;
            this._levelCompletionSent = true;
            this._triggerLevelComplete({
                levelId: data.levelId ?? this.game?._levelId ?? null,
                playerState: this.getPlayerData(),
                ...data,
            });
        };
        this.game.onLevelComplete = this._onLevelComplete;

        // Attach strategy helper
        const { default: Platformer3DStrategy } = await import('/engines/platformer-3d/Platformer3DStrategy.js');
        this.game.strategy = new Platformer3DStrategy(this.game);

        this.isInitialized = true;
        this.isLoaded = false;
        console.log('[Platformer3DAdapter] initialized');
    }

    /** @param {string} levelId @param {string|null} levelPath */
    async loadLevel(levelId, levelPath = null) {
        if (!this.isInitialized) throw new Error('[Platformer3DAdapter] not initialized');
        this.isLoaded = false;
        this._levelCompletionSent = false;
        
        try {
            if (levelPath) {
                const path = this._resolveLevelPath(levelPath, this.currentProject ?? this.game?.currentProject ?? null);
                const response = await fetch(path);
                if (!response.ok) {
                    throw new Error(`[Platformer3DAdapter] Failed to fetch levelPath "${path}" (HTTP ${response.status})`);
                }
                const levelData = await response.json();
                await this.game.loadLevelFromData(levelData);
            } else {
                const project = this.currentProject ?? this.game?.currentProject ?? null;
                if (!project) {
                    throw new Error(`[Platformer3DAdapter] Missing project context for level "${levelId}"`);
                }
                await this.game.loadProject(project, levelId);
            }
            this.isLoaded = true;
            console.log(`[Platformer3DAdapter] level "${levelId}" loaded successfully`);
        } catch (error) {
            console.error(`[Platformer3DAdapter] Failed to load level "${levelId}":`, error);
            this.isLoaded = false;
            throw error;
        }
    }

    async unloadLevel() {
        if (!this.isLoaded) return;
        this.stop();
        this.game?.onLevelUnloaded?.();
        this.isLoaded = false;
        this._levelCompletionSent = false;
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
        if (this.game && this.game.onLevelComplete === this._onLevelComplete) {
            this.game.onLevelComplete = this._chainedOnLevelComplete ?? null;
        }
        this.game?.destroy?.();
        this.game           = null;
        this.engine         = null;
        this._onLevelComplete = null;
        this._chainedOnLevelComplete = null;
        this._levelCompletionSent = false;
        this.currentProject = null;
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

    // ── Abilities (unified interface) ─────────────────────────────────────────

    useAbility(abilityId, dirX, dirY) {
        // Platformer abilities (double jump, dash, etc)
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

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** @param {string} username */
    setUsername(username) {
        this.username = username;
        if (this.game) this.game.username = username;
    }

    /** @param {string} projectName */
    setProject(projectName) {
        this.currentProject = projectName || null;
        if (this.game) this.game.currentProject = this.currentProject;
    }

    _resolveLevelPath(levelPath, projectName = null) {
        if (typeof levelPath !== 'string' || levelPath.trim() === '') {
            throw new Error('[Platformer3DAdapter] levelPath must be a non-empty string');
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

// Expose so CampaignController can instantiate it by engine-type string
if (typeof window !== 'undefined') {
    window.Platformer3DAdapter = Platformer3DAdapter;
}
