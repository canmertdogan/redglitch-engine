/**
 * Platformer3DStrategy.js — Phase 51
 * Strategy object for the platformer-3d engine.
 *
 * Implements the same interface pattern as FPS3DStrategy / TopDown3DStrategy
 * so CampaignController can drive all engine types uniformly:
 *   initialize() → start() → loadLevel() → getState() / setState() → unloadLevel() → destroy()
 *
 * Platformer-specific surface:
 *   getPlayerPosition()     → { x, y, z } world position of player
 *   setSpawnPoint(pos)      → override player respawn origin
 *   getLives()              → current life count
 *   getScore()              → current score
 *   addEnvZone(pos, r, t)   → add ambient VFX zone by world position
 */

import * as THREE from '../../lib/three/three.module.js';

export default class Platformer3DStrategy {
    /** @param {Platformer3DGame} game — live Platformer3DGame instance */
    constructor(game) {
        this._game = game;
    }

    // ── EngineStrategy interface ──────────────────────────────────────────────

    initialize() {
        console.log('[Platformer3DStrategy] initialize()');
    }

    start() {
        console.log('[Platformer3DStrategy] start()');
    }

    /** @param {object} levelData — parsed level JSON */
    loadLevel(levelData) {
        const game  = this._game;
        const spawn = levelData?.playerSpawn ?? levelData?.checkpoints?.find?.(c => c.id === 'start') ?? { x: 0, y: 2, z: 0 };
        game._setPlayerPosition?.(spawn.x, spawn.y, spawn.z);
        console.log(`[Platformer3DStrategy] loadLevel: spawn at (${spawn.x}, ${spawn.y}, ${spawn.z})`);
    }

    unloadLevel() {
        console.log('[Platformer3DStrategy] unloadLevel()');
    }

    destroy() {
        this._game = null;
        console.log('[Platformer3DStrategy] destroy()');
    }

    // ── State snapshots ───────────────────────────────────────────────────────

    getState() {
        const g = this._game;
        if (!g) return {};
        return {
            playerPosition: this.getPlayerPosition(),
            lives:          g._lives  ?? 3,
            health:         g._health ?? 3,
            coins:          g._coins  ?? 0,
            score:          g._score  ?? 0,
            levelId:        g._levelId ?? null,
        };
    }

    setState(state) {
        const g = this._game;
        if (!g || !state) return;
        if (state.playerPosition) {
            const p = state.playerPosition;
            g._setPlayerPosition?.(p.x, p.y, p.z);
        }
        if (state.lives  !== undefined) g._lives  = state.lives;
        if (state.health !== undefined) g._health = state.health;
        if (state.coins  !== undefined) g._coins  = state.coins;
        if (state.score  !== undefined) g._score  = state.score;
    }

    // ── Platformer-specific helpers ──────────────────────────────────────────

    getPlayerPosition() {
        const pos = this._game?._getPlayerPosition?.();
        if (!pos) return { x: 0, y: 0, z: 0 };
        return { x: pos.x, y: pos.y, z: pos.z };
    }

    setSpawnPoint(pos) {
        this._game?._setPlayerPosition?.(pos.x, pos.y, pos.z);
    }

    getLives()  { return this._game?._lives  ?? 0; }
    getScore()  { return this._game?._score  ?? 0; }
    getCoins()  { return this._game?._coins  ?? 0; }

    /**
     * Add a persistent ambient VFX zone by world position.
     * @param {{x,y,z}} pos
     * @param {number}  radius
     * @param {'magic'|'snow'|'leaves'} type
     */
    addEnvZone(pos, radius, type = 'magic') {
        const v = new THREE.Vector3(pos.x, pos.y, pos.z);
        return this._game?.vfx?.addEnvZone?.(v, radius, type) ?? null;
    }

    removeEnvZone(zone) {
        this._game?.vfx?.removeEnvZone?.(zone);
    }
}
