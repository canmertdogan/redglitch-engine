/**
 * FPS3DStrategy.js — Phase 26 (extended Phase 35)
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
 *   screenToMap(x, y)      → world hit point of player forward-looking ray (Phase 35)
 */

import * as THREE from '/lib/three/three.module.js';

export default class FPS3DStrategy {
    /** @param {FPSGame} game — live FPSGame instance */
    constructor(game) {
        this._game = game;
        this._rayDir = new THREE.Vector3();
        this._rayOrig = new THREE.Vector3();
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
            flags:          game._flags ?? {},
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
        if (state.flags    !== undefined) game._flags  = { ...game._flags, ...state.flags };
    }

    // ── FPS-specific helpers ──────────────────────────────────────────────────

    /** @returns {{ x:number, y:number, z:number }} */
    getPlayerPosition() {
        const game = this._game;
        // Prefer physics controller position (accurate ground pos) over camera
        const body = game?.fpsController?._body;
        if (body) return { x: body.position.x, y: body.position.y, z: body.position.z };
        const pos = game?.fpsCamera?.getPosition?.();
        return pos ?? { x: 0, y: 0, z: 0 };
    }

    /** Override player spawn (e.g. checkpoint restore). */
    setSpawnPoint(pos) {
        const game = this._game;
        game.fpsCamera?.setPosition?.(pos.x, pos.y, pos.z);
        // Also teleport physics body to keep controller in sync
        const body = game?.fpsController?._body;
        if (body) body.position.set(pos.x, pos.y, pos.z);
    }

    /**
     * screenToMap — always returns the world-space hit point of a ray cast
     * from the camera centre (i.e. the crosshair) forward into the scene.
     * In FPS mode the screen coordinates are ignored; the ray always originates
     * from the player camera along its forward direction.
     *
     * @param {number} _x  — screen X (ignored for FPS; kept for interface compat)
     * @param {number} _y  — screen Y (ignored for FPS; kept for interface compat)
     * @returns {{ x:number, y:number, z:number }|null}
     */
    screenToMap(_x, _y) {
        const game = this._game;
        if (!game) return null;

        const cam = game.renderer3d?.camera;
        if (!cam) return null;

        cam.getWorldPosition(this._rayOrig);
        cam.getWorldDirection(this._rayDir);

        const hit = game.raycast?.raycastWorld(this._rayOrig, this._rayDir, {
            maxDist:   200,
            layerMask: 0b1111,   // all layers
        });

        if (hit?.point) return { x: hit.point.x, y: hit.point.y, z: hit.point.z };

        // No hit — return a point 100m forward
        const far = this._rayOrig.clone().addScaledVector(this._rayDir, 100);
        return { x: far.x, y: far.y, z: far.z };
    }

    /** Toggle a door / trigger volume identified by string id. */
    triggerDoor(id) {
        const game = this._game;
        const obj  = game?.scene?.getObjectByName(id);
        if (!obj) { console.warn(`[FPS3DStrategy] triggerDoor: "${id}" not found`); return; }
        obj.userData.open = !obj.userData.open;
        console.log(`[FPS3DStrategy] triggerDoor "${id}" → ${obj.userData.open ? 'open' : 'closed'}`);
    }

    // ── Campaign ability interface ────────────────────────────────────────────

    constructor(game) {
        this._game = game;
        this._rayDir = new THREE.Vector3();
        this._rayOrig = new THREE.Vector3();
        this._abilityCooldowns = new Map(); // abilityId -> time remaining (seconds)
        this._abilityConfigs = {
            grenade: {
                cooldown: 8,
                ammoType: 'grenade',
                action: 'projectile',
                projectileDef: { speed: 18, gravity: 9.82, radius: 0.2, splashRadius: 5, splashDamage: 80 }
            },
            flashbang: {
                cooldown: 15,
                ammoType: 'flashbang',
                action: 'projectile',
                projectileDef: { speed: 20, gravity: 4, radius: 0.15, splashRadius: 12, splashDamage: 0, blindDuration: 3 }
            },
            smoke: {
                cooldown: 12,
                ammoType: 'smoke',
                action: 'projectile',
                projectileDef: { speed: 16, gravity: 3, radius: 0.18, splashRadius: 8, splashDamage: 0, smokeDuration: 8 }
            },
            melee: {
                cooldown: 0.6,
                ammoType: null,
                action: 'melee',
                range: 1.8,
                damage: 15
            }
        };
        this._abilityAmmo = new Map(); // abilityId -> count
    }

    /**
     * Use an ability (grenade, flashbang, smoke, melee, etc.)
     * @param {string} abilityId - Ability identifier
     * @param {number} dirX - Direction X (unused in FPS, uses camera direction)
     * @param {number} dirY - Direction Y (unused in FPS, uses camera direction)
     * @returns {boolean} - True if ability was used
     */
    useAbility(abilityId, dirX, dirY) {
        const game = this._game;
        if (!game || !game.weaponSystem) return false;
        if (!this.isAbilityReady(abilityId)) return false;

        const config = this._abilityConfigs[abilityId];
        if (!config) return false;

        const ammo = this._abilityAmmo.get(abilityId);
        if (config.ammoType && (ammo === undefined || ammo <= 0)) return false;

        const cam = game.renderer3d?.camera;
        if (!cam) return false;

        cam.getWorldPosition(this._rayOrig);
        cam.getWorldDirection(this._rayDir);

        switch (config.action) {
            case 'projectile': {
                const origin = this._rayOrig.clone().addScaledVector(this._rayDir, 0.5);
                const wpnSys = game.weaponSystem;
                if (wpnSys.spawnProjectile) {
                    wpnSys.spawnProjectile({
                        origin,
                        direction: this._rayDir.clone(),
                        speed: config.projectileDef.speed,
                        gravity: config.projectileDef.gravity,
                        radius: config.projectileDef.radius,
                        splashRadius: config.projectileDef.splashRadius,
                        splashDamage: config.projectileDef.splashDamage,
                        owner: 'player',
                        onHit: (hit) => {
                            if (config.projectileDef.smokeDuration) {
                                this._spawnSmokeCloud(hit.point, config.projectileDef.smokeDuration);
                            }
                            if (config.projectileDef.blindDuration) {
                                this._applyBlindEffect(hit, config.projectileDef.blindDuration);
                            }
                        }
                    });
                }
                break;
            }
            case 'melee': {
                const hit = game.raycast?.raycastWorld(this._rayOrig, this._rayDir, {
                    maxDist: config.range,
                    layerMask: 0b1110
                });
                if (hit?.object) {
                    const target = hit.object.userData?.entity || hit.object.parent?.userData?.entity;
                    if (target?.takeDamage) {
                        target.takeDamage(config.damage, { source: 'player', type: 'melee', hitPoint: hit.point });
                    }
                    game.weaponSystem.playMeleeEffect?.(hit.point);
                }
                break;
            }
        }

        this._abilityCooldowns.set(abilityId, config.cooldown);
        if (config.ammoType) {
            this._abilityAmmo.set(abilityId, ammo - 1);
        }
        return true;
    }

    /**
     * Check if ability is ready (off cooldown and has ammo)
     * @param {string} abilityId - Ability identifier
     * @returns {boolean}
     */
    isAbilityReady(abilityId) {
        const cd = this._abilityCooldowns.get(abilityId);
        if (cd && cd > 0) return false;
        const config = this._abilityConfigs[abilityId];
        if (!config) return false;
        if (config.ammoType) {
            const ammo = this._abilityAmmo.get(abilityId);
            if (ammo === undefined || ammo <= 0) return false;
        }
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
     * Grant ability ammo (e.g. on pickup)
     * @param {string} abilityId
     * @param {number} amount
     */
    addAbilityAmmo(abilityId, amount) {
        const current = this._abilityAmmo.get(abilityId) ?? 0;
        this._abilityAmmo.set(abilityId, current + amount);
    }

    /**
     * Tick cooldowns — called each frame by the game loop
     * @param {number} dt — delta time in seconds
     */
    tickAbilities(dt) {
        for (const [id, remaining] of this._abilityCooldowns) {
            const next = remaining - dt;
            if (next <= 0) {
                this._abilityCooldowns.delete(id);
            } else {
                this._abilityCooldowns.set(id, next);
            }
        }
    }

    _spawnSmokeCloud(point, duration) {
        const game = this._game;
        if (!game.vfx) return;
        game.vfx.addWorldEffect?.('smoke_cloud', { position: point, duration });
    }

    _applyBlindEffect(hit, duration) {
        const game = this._game;
        if (!game.fpsCamera) return;
        game.fpsCamera.applyScreenEffect?.('blind', { duration });
    }
}
