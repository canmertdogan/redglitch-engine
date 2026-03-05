/**
 * WeaponSystem.js — Phase 30
 *
 * First-person weapon system for the fps-3d engine.
 *
 * Features:
 *   - Viewmodel: GLTF weapon mesh parented to camera with bob sway
 *   - Weapon states: IDLE | AIM | FIRE | RELOAD | MELEE
 *   - Hitscan: center-screen raycast via Raycast3D for instant weapons
 *   - Projectile: pooled projectile objects for rockets/grenades
 *   - Recoil curves: scripted 2D per-weapon recoil patterns (applied to FPSCamera)
 *   - Ammo system: current/reserve tracking; pickup items replenish
 *   - Weapon sway: inertia-based pitch/yaw lag behind camera movement
 *
 * Weapon definitions (passed at runtime via defineWeapon / loadWeaponDefs):
 *   {
 *     id:         'pistol',
 *     name:       'PISTOL',
 *     modelUrl:   '/projects/Demo/data/weapons/pistol.glb',  // optional
 *     type:       'hitscan' | 'projectile',
 *     damage:     25,
 *     fireRate:   8,          // rounds per second
 *     reloadTime: 1.5,        // seconds
 *     magSize:    12,
 *     reserveMax: 60,
 *     spread:     0.01,       // base cone half-angle (radians)
 *     spreadAim:  0.002,      // spread while aiming
 *     recoilCurve:[ [0,0], [0.04,0.01], [0.03,−0.005], ... ],  // dx,dy per shot
 *     meleeDamage:10,
 *     meleeRange: 1.5,
 *     meleeTime:  0.4,
 *     projectile: {           // only for type:'projectile'
 *       speed:    28,
 *       gravity:  9.82,
 *       radius:   0.18,
 *       splashRadius: 3.5,
 *       splashDamage: 80,
 *     },
 *     sounds: {
 *       fire:   'wpn_pistol_fire',
 *       dryFire:'wpn_dry_click',
 *       reload: 'wpn_pistol_reload',
 *       melee:  'wpn_melee_swing',
 *       pickup: 'wpn_pickup',
 *     },
 *   }
 *
 * Visual style: weapon models must be low-poly GLTF with flat palette colors.
 * No PBR, no normal maps. Viewmodel FOV = 55° (different from world camera).
 */

import * as THREE from '../../lib/three/three.module.js';
import { LayerMask } from '../shared/Raycast3D.js';

// ── Weapon state enum ─────────────────────────────────────────────────────────

export const WeaponState = Object.freeze({
    IDLE:   'IDLE',
    AIM:    'AIM',
    FIRE:   'FIRE',
    RELOAD: 'RELOAD',
    MELEE:  'MELEE',
});

// ── Constants ─────────────────────────────────────────────────────────────────

/** Viewmodel local position when idle (metres, camera-local). */
const VM_POS_IDLE   = new THREE.Vector3(0.18, -0.22, -0.35);
/** Viewmodel position when aiming (centred). */
const VM_POS_AIM    = new THREE.Vector3(0, -0.12, -0.28);
/** Sway max displacement (metres). */
const VM_SWAY_MAX   = 0.025;
/** Sway inertia (lower = more lag). */
const VM_SWAY_LERP  = 6;
/** Viewmodel FOV — shallower than world to look larger & avoid clipping. */
const VM_FOV        = 55;

/** Hitscan max range (metres). */
const HITSCAN_RANGE = 200;

/** Projectile pool size. */
const PROJ_POOL_SIZE = 16;

/** Pickup radius (metres) — player auto-collects ammo within this distance. */
const PICKUP_RADIUS = 1.4;

// ── Built-in weapon definitions (fallback if no project defs loaded) ──────────

const DEFAULT_WEAPON_DEFS = {
    pistol: {
        id: 'pistol', name: 'PISTOL',
        type: 'hitscan', damage: 25,
        fireRate: 8, reloadTime: 1.5, magSize: 12, reserveMax: 60,
        spread: 0.012, spreadAim: 0.003,
        recoilCurve: [[0.03, 0.008], [0.025, -0.004], [0.03, 0.006]],
        meleeDamage: 10, meleeRange: 1.5, meleeTime: 0.4,
        sounds: { fire: 'wpn_pistol_fire', dryFire: 'wpn_dry_click', reload: 'wpn_pistol_reload', melee: 'wpn_melee_swing', pickup: 'wpn_pickup' },
    },
    rifle: {
        id: 'rifle', name: 'RIFLE',
        type: 'hitscan', damage: 35,
        fireRate: 10, reloadTime: 2.2, magSize: 30, reserveMax: 120,
        spread: 0.008, spreadAim: 0.001,
        recoilCurve: [[0.025, 0.005], [0.02, -0.003], [0.022, 0.004], [0.018, -0.002]],
        meleeDamage: 15, meleeRange: 1.2, meleeTime: 0.5,
        sounds: { fire: 'wpn_rifle_fire', dryFire: 'wpn_dry_click', reload: 'wpn_rifle_reload', melee: 'wpn_melee_swing', pickup: 'wpn_pickup' },
    },
    rocketlauncher: {
        id: 'rocketlauncher', name: 'ROCKET LAUNCHER',
        type: 'projectile', damage: 0,
        fireRate: 1, reloadTime: 2.5, magSize: 1, reserveMax: 10,
        spread: 0, spreadAim: 0,
        recoilCurve: [[0.08, 0.02]],
        meleeDamage: 20, meleeRange: 1.0, meleeTime: 0.6,
        projectile: { speed: 28, gravity: 0, radius: 0.18, splashRadius: 3.5, splashDamage: 80 },
        sounds: { fire: 'wpn_rocket_fire', dryFire: 'wpn_dry_click', reload: 'wpn_rocket_reload', melee: 'wpn_melee_swing', pickup: 'wpn_pickup' },
    },
};

// ── WeaponSystem ──────────────────────────────────────────────────────────────

export default class WeaponSystem {

    /**
     * @param {object} systems
     * @param {THREE.Scene}                                   systems.scene
     * @param {THREE.PerspectiveCamera}                       systems.camera      World camera
     * @param {import('../shared/Raycast3D.js').default}      systems.raycast
     * @param {import('./FPSCamera.js').default}              systems.fpsCamera
     * @param {import('./FPSController.js').default}          systems.fpsController
     * @param {import('../shared/AssetLoader3D.js').default}  systems.assets
     * @param {import('../shared/AudioSpatial3D.js').default} [systems.audio]
     * @param {object} [opts]
     * @param {boolean} [opts.autoPickup=true]  Auto-collect ammo pickups in range
     */
    constructor({ scene, camera, raycast, fpsCamera, fpsController, assets, audio = null }, opts = {}) {
        this._scene          = scene;
        this._camera         = camera;
        this._raycast        = raycast;
        this._fpsCamera      = fpsCamera;
        this._fpsController  = fpsController;
        this._assets         = assets;
        this._audio          = audio;

        this._autoPickup     = opts.autoPickup ?? true;

        // ── Weapon registry ────────────────────────────────────────────────
        /** @type {Map<string, object>}  id → weapon def */
        this._defs           = new Map(Object.entries(DEFAULT_WEAPON_DEFS));

        // ── Active weapon ──────────────────────────────────────────────────
        /** @type {object|null}  current weapon def */
        this._current        = null;
        /** Ammo: current magazine + reserve per weapon id */
        this._ammo           = new Map();   // id → { mag: number, reserve: number }

        // ── State machine ──────────────────────────────────────────────────
        this.state           = WeaponState.IDLE;
        this._stateTimer     = 0;   // time remaining in timed state (FIRE/RELOAD/MELEE)
        this._fireCooldown   = 0;   // seconds until next shot allowed
        this._recoilIndex    = 0;   // current index in recoilCurve array
        this._recoilReset    = 0;   // timer — resets recoil index when not firing

        // ── Viewmodel ──────────────────────────────────────────────────────
        /** @type {THREE.Object3D|null}  GLTF root parented to camera */
        this._viewmodel      = null;
        /** @type {THREE.PerspectiveCamera|null}  Separate viewmodel camera */
        this._vmCamera       = null;
        this._vmScene        = null;   // secondary scene for viewmodel render pass

        // Viewmodel position target (idle vs aim)
        this._vmPosTarget    = VM_POS_IDLE.clone();
        this._vmPosCurrent   = VM_POS_IDLE.clone();

        // Sway: track last camera yaw/pitch deltas for inertia
        this._swayOffsetX    = 0;
        this._swayOffsetY    = 0;
        this._lastCamYaw     = 0;
        this._lastCamPitch   = 0;

        // ── Projectile pool ────────────────────────────────────────────────
        /** @type {Array<ProjectileState>} */
        this._projectiles    = [];

        // ── Pickups tracked in scene ───────────────────────────────────────
        /** @type {Array<{ mesh: THREE.Mesh, weaponId: string, amount: number }>} */
        this._pickups        = [];

        // ── Event callbacks ────────────────────────────────────────────────
        /** Called with (weaponId, damage, hitInfo) on hitscan hit. */
        this.onHit           = null;
        /** Called with (weaponId, projectile) when a projectile explodes. */
        this.onExplosion     = null;
        /** Called with (weaponId, ammoState) when ammo changes. */
        this.onAmmoChanged   = null;
        /** Called with (weaponId, def) when a weapon is equipped. */
        this.onEquip         = null;
    }

    // ── Weapon registry ───────────────────────────────────────────────────────

    /**
     * Define (or override) a weapon.
     * @param {object} def  Weapon definition object (see file header).
     */
    defineWeapon(def) {
        this._defs.set(def.id, def);
        if (!this._ammo.has(def.id)) {
            this._ammo.set(def.id, { mag: def.magSize, reserve: def.reserveMax });
        }
    }

    /**
     * Load weapon definitions from a JSON URL.
     * @param {string} url  e.g. '/projects/MyGame/data/weapons.json'
     */
    async loadWeaponDefs(url) {
        try {
            const res  = await fetch(url);
            const defs = await res.json();
            for (const def of (Array.isArray(defs) ? defs : Object.values(defs))) {
                this.defineWeapon(def);
            }
            console.log(`[WeaponSystem] loaded ${this._defs.size} weapon defs from ${url}`);
        } catch (err) {
            console.warn('[WeaponSystem] loadWeaponDefs failed:', err.message);
        }
    }

    // ── Equip / switch ────────────────────────────────────────────────────────

    /**
     * Equip a weapon by id.
     * Loads GLTF viewmodel if modelUrl is provided.
     * @param {string} weaponId
     */
    async equip(weaponId) {
        const def = this._defs.get(weaponId);
        if (!def) { console.warn(`[WeaponSystem] equip: unknown weapon "${weaponId}"`); return; }

        // Ensure ammo entry exists
        if (!this._ammo.has(weaponId)) {
            this._ammo.set(weaponId, { mag: def.magSize, reserve: def.reserveMax });
        }

        this._current       = def;
        this.state          = WeaponState.IDLE;
        this._stateTimer    = 0;
        this._fireCooldown  = 0;
        this._recoilIndex   = 0;

        // Swap viewmodel
        await this._loadViewmodel(def);

        // Notify ammo
        this._emitAmmoChanged();
        if (this.onEquip) this.onEquip(weaponId, def);
        console.log(`[WeaponSystem] equipped: ${def.name}`);
    }

    /**
     * Returns current spread as 0..1 for HUD crosshair expansion.
     * Based on recoil index relative to curve length.
     */
    getSpreadNormalized() {
        if (!this._current) return 0;
        const curve = this._current.recoilCurve ?? [[0, 0]];
        return Math.min(1, this._recoilIndex / Math.max(1, curve.length));
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    /**
     * update(dt) — drive state machine, sway, projectiles, pickups.
     * Called from FPSGame._update() after physics step.
     * @param {number} dt
     */
    update(dt) {
        this._fireCooldown  = Math.max(0, this._fireCooldown - dt);
        this._recoilReset   = Math.max(0, this._recoilReset  - dt);

        if (this._recoilReset <= 0) this._recoilIndex = 0;

        // Timed state countdown
        if (this.state === WeaponState.RELOAD || this.state === WeaponState.MELEE) {
            this._stateTimer -= dt;
            if (this._stateTimer <= 0) {
                if (this.state === WeaponState.RELOAD) this._finishReload();
                this.state = WeaponState.IDLE;
            }
        }

        // Read input
        if (this._current) this._processInput(dt);

        // Viewmodel sway
        this._updateViewmodelSway(dt);

        // Projectile simulation
        this._updateProjectiles(dt);

        // Pickup proximity (auto-collect)
        if (this._autoPickup) this._checkPickups();
    }

    // ── Input processing ──────────────────────────────────────────────────────

    _processInput(dt) {
        const input = this._fpsController?._input;
        if (!input) return;

        const isAiming   = input.isAction('aim')   || input.isAction('zoom');
        const isFiring   = input.isAction('fire')  || input.isAction('attack');
        const isReloading= input.isAction('reload');
        const isMelee    = input.isAction('melee');

        // Determine idle vs aim position target
        this._vmPosTarget.copy(isAiming ? VM_POS_AIM : VM_POS_IDLE);

        // State guards
        if (this.state === WeaponState.RELOAD || this.state === WeaponState.MELEE) return;

        if (isMelee && this.state !== WeaponState.MELEE) {
            this._startMelee(); return;
        }
        if (isReloading && this.state !== WeaponState.RELOAD) {
            this._startReload(); return;
        }
        if (isFiring) {
            this._tryFire(isAiming);
        } else {
            // No longer firing — transition back to IDLE/AIM
            if (this.state === WeaponState.FIRE) this.state = WeaponState.IDLE;
        }

        this.state = isAiming && this.state === WeaponState.IDLE
            ? WeaponState.AIM
            : this.state === WeaponState.AIM && !isAiming
            ? WeaponState.IDLE
            : this.state;
    }

    // ── Fire ─────────────────────────────────────────────────────────────────

    _tryFire(isAiming) {
        if (this._fireCooldown > 0) return;
        const def  = this._current;
        const ammo = this._ammo.get(def.id);

        if (ammo.mag <= 0) {
            // Dry fire
            this._playSound(def.sounds?.dryFire);
            this._fireCooldown = 0.15;
            return;
        }

        this.state         = WeaponState.FIRE;
        this._fireCooldown = 1 / def.fireRate;
        ammo.mag           = Math.max(0, ammo.mag - 1);

        // Spread cone
        const spread = isAiming ? (def.spreadAim ?? 0) : (def.spread ?? 0.01);
        const dir    = this._getFireDirection(spread);

        if (def.type === 'projectile') {
            this._spawnProjectile(def, dir);
        } else {
            this._doHitscan(def, dir);
        }

        // Recoil
        this._applyRecoil(def);

        // Sound
        this._playSound(def.sounds?.fire);

        // Auto-reload when empty
        if (ammo.mag === 0 && ammo.reserve > 0) {
            this._startReload();
        }

        this._emitAmmoChanged();
    }

    /**
     * Compute fire direction with spread cone applied.
     * @param {number} spread  Half-angle in radians.
     * @returns {THREE.Vector3}
     */
    _getFireDirection(spread) {
        const dir = new THREE.Vector3();
        this._camera.getWorldDirection(dir);

        if (spread > 0) {
            // Random point in unit disk scaled by spread
            const angle  = Math.random() * Math.PI * 2;
            const radius = Math.random() * spread;
            const right  = new THREE.Vector3();
            const up     = new THREE.Vector3();
            right.crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
            up.crossVectors(right, dir).normalize();
            dir.addScaledVector(right, Math.cos(angle) * radius);
            dir.addScaledVector(up,    Math.sin(angle) * radius);
            dir.normalize();
        }
        return dir;
    }

    // ── Hitscan ───────────────────────────────────────────────────────────────

    _doHitscan(def, dir) {
        const origin = new THREE.Vector3();
        this._camera.getWorldPosition(origin);

        const hit = this._raycast?.raycastWorld(origin, dir, {
            maxDist:   HITSCAN_RANGE,
            layerMask: LayerMask.TERRAIN | LayerMask.ENTITY | LayerMask.PROP,
        });

        if (!hit) return;

        // Impact VFX placeholder (Phase 18 VFXSystem can extend this)
        this._spawnImpactDecal(hit.point, hit.face?.normal ?? new THREE.Vector3(0, 1, 0));

        // Notify game logic
        this.onHit?.(def.id, def.damage, {
            point:    hit.point,
            normal:   hit.face?.normal,
            object:   hit.object,
            distance: hit.distance,
        });
    }

    // ── Projectile ────────────────────────────────────────────────────────────

    _spawnProjectile(def, dir) {
        const origin = new THREE.Vector3();
        this._camera.getWorldPosition(origin);

        const pDef  = def.projectile ?? { speed: 20, gravity: 9.82, radius: 0.15, splashRadius: 3, splashDamage: 60 };

        // Reuse from pool if available
        let proj = this._projectiles.find(p => !p.active);
        if (!proj) {
            if (this._projectiles.length >= PROJ_POOL_SIZE) {
                console.warn('[WeaponSystem] projectile pool exhausted');
                return;
            }
            proj = new ProjectileState(this._scene);
            this._projectiles.push(proj);
        }

        proj.spawn(origin, dir, pDef, def.id);
    }

    _updateProjectiles(dt) {
        for (const proj of this._projectiles) {
            if (!proj.active) continue;
            proj.update(dt);

            // Raycast ahead by velocity magnitude this frame to detect collision
            if (!this._raycast) continue;
            const vel   = proj.velocity;
            const speed = vel.length();
            if (speed < 0.001) continue;

            const hit = this._raycast.raycastWorld(proj.position, vel.clone().normalize(), {
                maxDist:   speed * dt + proj.radius * 2,
                layerMask: LayerMask.TERRAIN | LayerMask.ENTITY | LayerMask.PROP,
            });

            if (hit) {
                this._explodeProjectile(proj, hit.point, hit.face?.normal);
            }
        }
    }

    _explodeProjectile(proj, point, normal) {
        const def    = this._current;
        const pDef   = def?.projectile ?? {};
        const splash = pDef.splashRadius ?? 3;
        const dmg    = pDef.splashDamage ?? 60;

        proj.deactivate();

        // Notify game logic
        this.onExplosion?.(proj.weaponId, {
            point,
            normal,
            splashRadius: splash,
            splashDamage: dmg,
        });

        this._spawnImpactDecal(point, normal ?? new THREE.Vector3(0, 1, 0));
    }

    // ── Reload ────────────────────────────────────────────────────────────────

    _startReload() {
        const def  = this._current;
        if (!def) return;
        const ammo = this._ammo.get(def.id);
        if (ammo.reserve <= 0 || ammo.mag === def.magSize) return;

        this.state       = WeaponState.RELOAD;
        this._stateTimer = def.reloadTime ?? 1.5;
        this._playSound(def.sounds?.reload);
    }

    _finishReload() {
        const def  = this._current;
        if (!def) return;
        const ammo = this._ammo.get(def.id);

        const needed  = def.magSize - ammo.mag;
        const taken   = Math.min(needed, ammo.reserve);
        ammo.mag     += taken;
        ammo.reserve -= taken;

        this._emitAmmoChanged();
        console.log(`[WeaponSystem] reloaded: ${ammo.mag}/${ammo.reserve}`);
    }

    // ── Melee ─────────────────────────────────────────────────────────────────

    _startMelee() {
        const def = this._current;
        if (!def) return;

        this.state       = WeaponState.MELEE;
        this._stateTimer = def.meleeTime ?? 0.4;
        this._playSound(def.sounds?.melee);

        // Hitscan in melee range
        const origin = new THREE.Vector3();
        this._camera.getWorldPosition(origin);
        const dir = new THREE.Vector3();
        this._camera.getWorldDirection(dir);

        const hit = this._raycast?.raycastWorld(origin, dir, {
            maxDist:   def.meleeRange ?? 1.5,
            layerMask: LayerMask.ENTITY | LayerMask.PROP,
        });

        if (hit) {
            this.onHit?.(def.id, def.meleeDamage ?? 10, {
                melee: true, point: hit.point, object: hit.object,
            });
        }
    }

    // ── Recoil ────────────────────────────────────────────────────────────────

    /**
     * Apply one entry from the weapon's recoilCurve to FPSCamera.
     * Advances _recoilIndex each shot; wraps at end of curve.
     * @param {object} def
     */
    _applyRecoil(def) {
        const curve = def.recoilCurve;
        if (!curve?.length || !this._fpsCamera) return;

        const idx   = this._recoilIndex % curve.length;
        const [pitchKick, yawKick] = curve[idx];

        // Vertical kick → FPSCamera.fireRecoil (upward pitch impulse)
        if (pitchKick) this._fpsCamera.fireRecoil(Math.abs(pitchKick));

        // Horizontal drift → add directly to camera yaw
        if (yawKick) this._fpsCamera._yaw += yawKick;

        this._recoilIndex++;
        this._recoilReset = 0.4;   // reset recoil pattern after 400ms without firing
    }

    // ── Viewmodel ─────────────────────────────────────────────────────────────

    async _loadViewmodel(def) {
        // Remove previous viewmodel
        if (this._viewmodel) {
            this._camera.remove(this._viewmodel);
            this._viewmodel = null;
        }

        // Build a placeholder cube if no model URL (low-poly dev stub)
        if (!def.modelUrl || !this._assets) {
            const geo  = new THREE.BoxGeometry(0.06, 0.06, 0.24);
            const mat  = new THREE.MeshLambertMaterial({ color: 0x888899 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.name  = `vm_${def.id}`;
            this._viewmodel = mesh;
        } else {
            try {
                const { scene: root } = await this._assets.loadGLTF(def.modelUrl, {
                    flatShading: true, remapPalette: true,
                });
                root.name       = `vm_${def.id}`;
                this._viewmodel = root;
            } catch (err) {
                console.warn(`[WeaponSystem] viewmodel load failed for "${def.id}":`, err.message);
                // Fallback stub
                const geo  = new THREE.BoxGeometry(0.06, 0.06, 0.24);
                const mat  = new THREE.MeshLambertMaterial({ color: 0x888899 });
                this._viewmodel = new THREE.Mesh(geo, mat);
                this._viewmodel.name = `vm_${def.id}_stub`;
            }
        }

        // Parent to camera — viewmodel lives in camera-local space
        this._viewmodel.position.copy(VM_POS_IDLE);
        // Prevent viewmodel from casting shadows into the world
        this._viewmodel.traverse(c => {
            if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; }
        });
        this._camera.add(this._viewmodel);
        this._vmPosCurrent.copy(VM_POS_IDLE);
        this._vmPosTarget.copy(VM_POS_IDLE);
    }

    // ── Weapon sway ───────────────────────────────────────────────────────────

    _updateViewmodelSway(dt) {
        if (!this._viewmodel || !this._fpsCamera) return;

        // Delta yaw/pitch this frame → sway inertia
        const yaw   = this._fpsCamera._yaw   ?? 0;
        const pitch = this._fpsCamera._pitch ?? 0;
        const dYaw   = yaw   - this._lastCamYaw;
        const dPitch = pitch - this._lastCamPitch;
        this._lastCamYaw   = yaw;
        this._lastCamPitch = pitch;

        // Inertia: sway lags behind camera movement
        this._swayOffsetX = THREE.MathUtils.lerp(
            this._swayOffsetX,
            THREE.MathUtils.clamp(-dYaw   * 0.8, -VM_SWAY_MAX, VM_SWAY_MAX),
            Math.min(1, dt * VM_SWAY_LERP),
        );
        this._swayOffsetY = THREE.MathUtils.lerp(
            this._swayOffsetY,
            THREE.MathUtils.clamp(-dPitch * 0.8, -VM_SWAY_MAX, VM_SWAY_MAX),
            Math.min(1, dt * VM_SWAY_LERP),
        );

        // Smooth position toward target (idle / aim)
        this._vmPosCurrent.lerp(this._vmPosTarget, Math.min(1, dt * 10));

        // Apply sway on top of position
        this._viewmodel.position.set(
            this._vmPosCurrent.x + this._swayOffsetX,
            this._vmPosCurrent.y + this._swayOffsetY,
            this._vmPosCurrent.z,
        );
    }

    // ── Ammo pickups ──────────────────────────────────────────────────────────

    /**
     * Register an ammo/weapon pickup in the scene.
     * @param {THREE.Mesh} mesh       Pickup visual
     * @param {string}     weaponId   Which weapon's ammo
     * @param {number}     amount     Magazine(s) to add
     */
    addPickup(mesh, weaponId, amount) {
        this._pickups.push({ mesh, weaponId, amount });
        this._scene.add(mesh);
    }

    /** Replenish ammo for a weapon directly (called by pickup / level events). */
    addAmmo(weaponId, amount) {
        const def  = this._defs.get(weaponId);
        if (!def) return;
        if (!this._ammo.has(weaponId)) {
            this._ammo.set(weaponId, { mag: 0, reserve: 0 });
        }
        const ammo  = this._ammo.get(weaponId);
        ammo.reserve = Math.min(ammo.reserve + amount, def.reserveMax);
        this._emitAmmoChanged();
        console.log(`[WeaponSystem] ammo added: ${weaponId} +${amount} → ${ammo.reserve}`);
    }

    _checkPickups() {
        const ctrl = this._fpsController;
        if (!ctrl) return;
        const pos  = ctrl.getPosition();
        const pt   = new THREE.Vector3(pos.x, pos.y, pos.z);

        for (let i = this._pickups.length - 1; i >= 0; i--) {
            const pk = this._pickups[i];
            if (!pk.mesh) continue;
            if (pt.distanceTo(pk.mesh.position) <= PICKUP_RADIUS) {
                this.addAmmo(pk.weaponId, pk.amount);
                this._playSound('wpn_pickup');
                this._scene.remove(pk.mesh);
                this._pickups.splice(i, 1);
            }
        }
    }

    // ── Impact decal (stub — VFXSystem extends in Phase 18) ──────────────────

    _spawnImpactDecal(point, normal) {
        // Tiny flat quad facing normal direction — low-poly impact mark
        const geo  = new THREE.PlaneGeometry(0.15, 0.15);
        const mat  = new THREE.MeshBasicMaterial({
            color: 0x111111, transparent: true, opacity: 0.6,
            depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
        });
        const decal = new THREE.Mesh(geo, mat);
        decal.position.copy(point).addScaledVector(normal, 0.002);
        decal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
        decal.name = '_impact_decal';
        this._scene.add(decal);

        // Auto-remove after 8 seconds to avoid scene clutter
        setTimeout(() => { this._scene.remove(decal); mat.dispose(); geo.dispose(); }, 8000);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _playSound(name) {
        if (!name || !this._audio) return;
        const emitter = this._audio.createEmitter(null, {
            soundName: name, volume: 0.8,
        });
        emitter?.play(name);
    }

    _emitAmmoChanged() {
        if (!this._current) return;
        const ammo = this._ammo.get(this._current.id);
        this.onAmmoChanged?.(this._current.id, { ...ammo });
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    /** @returns {{ mag:number, reserve:number }|null} */
    get currentAmmo() {
        return this._current ? (this._ammo.get(this._current.id) ?? null) : null;
    }

    /** @returns {string|null} Current weapon id */
    get currentWeaponId() {
        return this._current?.id ?? null;
    }

    // ── Serialization ─────────────────────────────────────────────────────────

    serialize() {
        const ammoMap = {};
        for (const [id, a] of this._ammo) ammoMap[id] = { ...a };
        return { weaponId: this._current?.id ?? null, ammo: ammoMap };
    }

    deserialize(data) {
        if (!data) return;
        if (data.ammo) {
            for (const [id, a] of Object.entries(data.ammo)) {
                this._ammo.set(id, { ...a });
            }
        }
        if (data.weaponId) this.equip(data.weaponId);
    }

    dispose() {
        if (this._viewmodel) this._camera.remove(this._viewmodel);
        for (const proj of this._projectiles) proj.deactivate();
        for (const pk of this._pickups) this._scene.remove(pk.mesh);
        this._projectiles = [];
        this._pickups     = [];
        this._viewmodel   = null;
        console.log('[WeaponSystem] disposed');
    }
}

// ── ProjectileState ───────────────────────────────────────────────────────────

class ProjectileState {
    constructor(scene) {
        this._scene   = scene;
        this.active   = false;
        this.weaponId = '';
        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.radius   = 0.15;
        this._gravity = 0;

        // Visual: small low-poly icosahedron
        const geo  = new THREE.IcosahedronGeometry(0.12, 0);
        const mat  = new THREE.MeshLambertMaterial({ color: 0xff6600 });
        this._mesh = new THREE.Mesh(geo, mat);
        this._mesh.visible = false;
        this._mesh.name    = '_projectile';
        scene.add(this._mesh);
    }

    spawn(origin, dir, pDef, weaponId) {
        this.active   = true;
        this.weaponId = weaponId;
        this.radius   = pDef.radius ?? 0.15;
        this._gravity = pDef.gravity ?? 0;
        this.position.copy(origin);
        this.velocity.copy(dir).multiplyScalar(pDef.speed ?? 20);
        this._mesh.position.copy(origin);
        this._mesh.visible = true;
    }

    update(dt) {
        if (!this.active) return;
        // Gravity
        this.velocity.y -= this._gravity * dt;
        this.position.addScaledVector(this.velocity, dt);
        this._mesh.position.copy(this.position);
    }

    deactivate() {
        this.active        = false;
        this._mesh.visible = false;
    }
}
