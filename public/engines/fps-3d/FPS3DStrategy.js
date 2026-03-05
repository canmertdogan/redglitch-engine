/**
 * FPS3DStrategy.js — Phase 26
 * Strategy object for the fps-3d engine.
 *
 * Implements the same interface pattern used by the 2D engines and TopDown3DStrategy
 * so CampaignController can drive all engine types uniformly:
 *   initialize() → start() → loadLevel() → getState() / setState() → unloadLevel() → destroy()
 *
 * FPS-specific surface:
 *   getPlayerPosition()    → { x, y, z } world position of player camera rig
 *   setSpawnPoint(pos)     → override player spawn
 *   triggerDoor(id)        → toggle door/trigger-volume by id
 */

import * as THREE from '../../lib/three/three.module.js';

export default class FPS3DStrategy {
    /** @param {FPSGame} game — live FPSGame instance */
    constructor(game) {
        this._game = game;
    }

    // ── EngineStrategy interface ──────────────────────────────────────────────

    initialize() {
        console.log('[FPS3DStrategy] initialize()');
    }

    start() {
        console.log('[FPS3DStrategy] start()');
    }

    /** @param {object} levelData — parsed level JSON */
    loadLevel(levelData) {
        const game = this._game;
        // Spawn player at level-defined start position, fall back to origin
        const spawn = levelData?.playerSpawn ?? { x: 0, y: 1.8, z: 0 };
        game.fpsCamera?.setPosition(spawn.x, spawn.y, spawn.z);
        console.log(`[FPS3DStrategy] loadLevel: spawning at (${spawn.x}, ${spawn.y}, ${spawn.z})`);
    }

    unloadLevel() {
        console.log('[FPS3DStrategy] unloadLevel()');
    }

    destroy() {
        this._game = null;
        console.log('[FPS3DStrategy] destroy()');
    }

    // ── State snapshots ───────────────────────────────────────────────────────

    getState() {
        const game = this._game;
        if (!game) return {};
        return {
            playerPosition: this.getPlayerPosition(),
            health:         game._health,
            ammo:           game._ammo,
            levelId:        game._levelId,
            gameTime:       game.gameTime,
        };
    }

    setState(state) {
        const game = this._game;
        if (!game || !state) return;
        if (state.playerPosition) {
            const p = state.playerPosition;
            game.fpsCamera?.setPosition(p.x, p.y, p.z);
        }
        if (state.health   !== undefined) game._health = state.health;
        if (state.ammo     !== undefined) game._ammo   = state.ammo;
        if (state.gameTime !== undefined) game.gameTime = state.gameTime;
    }

    // ── FPS-specific helpers ──────────────────────────────────────────────────

    /** @returns {{ x:number, y:number, z:number }} */
    getPlayerPosition() {
        const pos = this._game?.fpsCamera?.getPosition();
        return pos ?? { x: 0, y: 0, z: 0 };
    }

    /** Override player spawn (e.g. checkpoint restore). */
    setSpawnPoint(pos) {
        this._game.fpsCamera?.setPosition(pos.x, pos.y, pos.z);
    }

    /** Toggle a door / trigger volume identified by string id. */
    triggerDoor(id) {
        const game = this._game;
        const obj  = game?.scene?.getObjectByName(id);
        if (!obj) { console.warn(`[FPS3DStrategy] triggerDoor: "${id}" not found`); return; }
        obj.userData.open = !obj.userData.open;
        console.log(`[FPS3DStrategy] triggerDoor "${id}" → ${obj.userData.open ? 'open' : 'closed'}`);
    }
}
