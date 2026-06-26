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

import * as THREE from '/lib/three/three.module.js';

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

    // ── Campaign ability interface ────────────────────────────────────────────

    constructor(game) {
        this._game = game;
        this._abilityCooldowns = new Map();
        this._doubleJumpUsed = false;
        this._dashUsed = false;
        this._groundPoundUsed = false;
        this._abilityConfigs = {
            double_jump: { cooldown: 0.3, staminaCost: 20 },
            dash: { cooldown: 2, staminaCost: 30, distance: 6, duration: 0.25 },
            ground_pound: { cooldown: 0.8, staminaCost: 40, radius: 3, damage: 50 },
            wall_jump: { cooldown: 0.1, staminaCost: 10, boost: { x: 0, y: 8, z: 0 } }
        };
    }

    /**
     * Use an ability (double jump, dash, ground pound, wall jump)
     * @param {string} abilityId - Ability identifier
     * @param {number} dirX - Direction X
     * @param {number} dirY - Direction Y
     * @returns {boolean} - True if ability was used
     */
    useAbility(abilityId, dirX, dirY) {
        const game = this._game;
        if (!game || !game.player) return false;
        if (!this.isAbilityReady(abilityId)) return false;

        const config = this._abilityConfigs[abilityId];
        if (!config) return false;

        const player = game.player;
        const stamina = player._stamina ?? player.stamina ?? 100;
        if (stamina < config.staminaCost) return false;

        let used = false;

        switch (abilityId) {
            case 'double_jump': {
                if (this._doubleJumpUsed) return false;
                const jumpVelocity = player.jumpVelocity ?? 8;
                if (player.setVelocity) {
                    player.setVelocity(player.velocity?.x ?? 0, jumpVelocity, player.velocity?.z ?? 0);
                } else if (player.velocity) {
                    player.velocity.y = jumpVelocity;
                }
                this._doubleJumpUsed = true;
                used = true;
                break;
            }
            case 'dash': {
                if (this._dashUsed) return false;
                const dir = new THREE.Vector3(dirX ?? 0, 0, dirY ?? 0);
                if (dir.lengthSq() === 0) {
                    const forward = new THREE.Vector3(0, 0, -1);
                    forward.applyQuaternion(player.root?.quaternion ?? player.quaternion ?? new THREE.Quaternion());
                    dir.copy(forward);
                }
                dir.normalize().multiplyScalar(config.distance);
                this._dashTarget = { x: (player.position?.x ?? 0) + dir.x, y: player.position?.y ?? 0, z: (player.position?.z ?? 0) + dir.z };
                this._dashStartTime = performance.now();
                this._dashDuration = config.duration;
                this._dashUsed = true;
                if (player.startDash) player.startDash(this._dashTarget, config.duration);
                used = true;
                break;
            }
            case 'ground_pound': {
                if (this._groundPoundUsed) return false;
                if (player.setVelocity) {
                    player.setVelocity(player.velocity?.x ?? 0, -20, player.velocity?.z ?? 0);
                } else if (player.velocity) {
                    player.velocity.y = -20;
                }
                this._groundPoundActive = true;
                this._groundPoundUsed = true;
                if (player.startGroundPound) player.startGroundPound();
                used = true;
                break;
            }
            case 'wall_jump': {
                const wallNormal = player._wallNormal ?? player.wallNormal ?? null;
                if (!wallNormal) return false;
                const boostX = -wallNormal.x * config.boost.y * 0.5;
                const boostZ = -wallNormal.z * config.boost.y * 0.5;
                if (player.setVelocity) {
                    player.setVelocity(boostX, config.boost.y, boostZ);
                } else if (player.velocity) {
                    player.velocity.x = boostX;
                    player.velocity.y = config.boost.y;
                    player.velocity.z = boostZ;
                }
                used = true;
                break;
            }
        }

        if (used) {
            this._abilityCooldowns.set(abilityId, config.cooldown);
            if (player._stamina !== undefined) {
                player._stamina = Math.max(0, stamina - config.staminaCost);
            }
            if (abilityId === 'double_jump') this._doubleJumpUsed = true;
            if (abilityId === 'dash') this._dashUsed = true;
            if (abilityId === 'ground_pound') this._groundPoundUsed = true;
        }

        return used;
    }

    /**
     * Check if ability is ready (off cooldown, has stamina, not already used)
     * @param {string} abilityId - Ability identifier
     * @returns {boolean}
     */
    isAbilityReady(abilityId) {
        const cd = this._abilityCooldowns.get(abilityId);
        if (cd && cd > 0) return false;
        const config = this._abilityConfigs[abilityId];
        if (!config) return false;
        const game = this._game;
        const stamina = game?.player?._stamina ?? game?.player?.stamina ?? 100;
        if (stamina < config.staminaCost) return false;
        if (abilityId === 'double_jump' && this._doubleJumpUsed) return false;
        if (abilityId === 'dash' && this._dashUsed) return false;
        if (abilityId === 'ground_pound' && this._groundPoundUsed) return false;
        return true;
    }

    /**
     * Get cooldown fraction (0 = ready, 1 = just used)
     * @param {string} abilityId - Ability identifier
     * @returns {number}
     */
    getCooldownFraction(abilityId) {
        const cd = this._abilityCooldowns.get(abilityId);
        const config = this._abilityConfigs[abilityId];
        if (!cd || !config || config.cooldown <= 0) return 0;
        return Math.min(cd / config.cooldown, 1);
    }

    /**
     * Reset per-life abilities (double jump, dash, ground pound) on landing/respawn
     */
    resetPerLifeAbilities() {
        this._doubleJumpUsed = false;
        this._dashUsed = false;
        this._groundPoundUsed = false;
        this._groundPoundActive = false;
        this._dashUsed = false;
    }

    /**
     * Tick cooldowns — called each frame
     * @param {number} dt
     */
    tickAbilities(dt) {
        for (const [id, remaining] of this._abilityCooldowns) {
            const next = remaining - dt;
            if (next <= 0) this._abilityCooldowns.delete(id);
            else this._abilityCooldowns.set(id, next);
        }

        // Dash interpolation
        if (this._dashTarget && this._dashDuration > 0) {
            const elapsed = (performance.now() - this._dashStartTime) / 1000;
            if (elapsed >= this._dashDuration) {
                const game = this._game;
                if (game?.player?.setPosition) {
                    game.player.setPosition(this._dashTarget.x, this._dashTarget.y, this._dashTarget.z);
                }
                this._dashTarget = null;
                this._dashDuration = 0;
            }
        }
    }
}
