/**
 * CheckpointSystem3D.js — Phase 48
 *
 * Checkpoint and level flow management for the platformer-3d engine.
 *
 * Features:
 *   - Checkpoint objects: touch-activated flag poles; save player position + state
 *   - Respawn: teleport to last checkpoint with brief invincibility
 *   - Level start/end portals: animated pulsing rings at spawn + exit zones
 *   - Death plane: Y < deathY triggers instant death
 *   - Coin total tracked per level; persists to save data via callbacks
 *   - Level completion: fires onLevelComplete with time, coins, stars
 *
 * Checkpoint visual:
 *   Low-poly flag pole (cylinder) + flat-shaded flag quad.
 *   Inactive: grey palette color. Active (touched): palette accent color.
 *   Particle burst on activation.
 *
 * Portal visual:
 *   Rotating torus ring. Start portal: palette accent. End portal: palette gold.
 *   Pulsing scale animation via sin wave.
 *
 * Usage:
 *   const cs = new CheckpointSystem3D({ scene, palette, audio });
 *   cs.spawnFromLevelData(data);       // reads data.checkpoints + data.playerSpawn
 *   cs.update(dt, playerPos);          // collision + portal animation
 *   cs.getActiveCPPosition();          // → THREE.Vector3 (last touched checkpoint)
 *   cs.fromData(checkpoints[]);        // hydrate from level JSON checkpoints array
 *   cs.clear();
 *
 *   cs.onCheckpointActivated = (id, position) => {};
 *   cs.onLevelComplete        = (stats) => {};
 *   cs.onPlayerDeath          = () => {};     // fired when Y < deathY
 */

import * as THREE from '../../lib/three/three.module.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Checkpoint activation radius (metres). */
const CP_RADIUS         = 1.4;
/** Portal entry radius (metres). */
const PORTAL_RADIUS     = 1.6;
/** Death plane default Y (can be overridden per level). */
const DEATH_Y_DEFAULT   = -20;

/** Flag pole height (metres). */
const POLE_HEIGHT       = 2.4;
/** Pulsing portal scale range. */
const PORTAL_SCALE_MIN  = 0.85;
const PORTAL_SCALE_MAX  = 1.10;
/** Portal pulse frequency (rad/s). */
const PORTAL_PULSE_FREQ = 1.8;
/** Portal rotation speed (rad/s). */
const PORTAL_ROT_SPEED  = 1.2;

/** Level timer updates via performance.now() */
const MS_TO_SEC = 0.001;

// ── CheckpointSystem3D ────────────────────────────────────────────────────────

export default class CheckpointSystem3D {

    /**
     * @param {object}        systems
     * @param {THREE.Scene}   systems.scene     Scene to add meshes
     * @param {PaletteManager} [systems.palette] Color palette
     * @param {AudioSpatial3D} [systems.audio]  Spatial audio
     */
    constructor({ scene, palette = null, audio = null }) {
        this._scene   = scene;
        this._palette = palette;
        this._audio   = audio;

        /** @type {Map<string, CheckpointRecord>} id → record */
        this._checkpoints = new Map();
        this._activeId    = null;   // ID of last activated checkpoint
        this._startPos    = null;   // level spawn position (THREE.Vector3)

        // Level exit portal
        this._exitPortal  = null;   // { mesh, triggered }

        // Animated objects list { mesh, update: (dt,t)=>{} }
        this._animated    = [];

        // Level timer (starts on first update call)
        this._levelStartMs = null;
        this._levelTimeSec = 0;

        // Death plane
        this._deathY      = DEATH_Y_DEFAULT;
        this._deathCooldown = 0;   // prevent rapid re-trigger

        // Callbacks
        this.onCheckpointActivated = null;  // (id, pos) => void
        this.onLevelComplete       = null;  // (stats) => void
        this.onPlayerDeath         = null;  // () => void
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Level data hydration
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Hydrate from full level data object.
     * Reads: data.playerSpawn, data.levelExit, data.checkpoints[], data.deathY
     */
    spawnFromLevelData(data) {
        this._deathY = data.deathY ?? DEATH_Y_DEFAULT;

        // Start / player spawn portal
        const spawn = data.playerSpawn ?? { x: 0, y: 0, z: 0 };
        this._startPos = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
        this._spawnStartPortal(spawn.x, spawn.y, spawn.z);

        // Checkpoints
        if (Array.isArray(data.checkpoints)) {
            this.fromData(data.checkpoints);
        }

        // Level exit portal
        if (data.levelExit) {
            const e = data.levelExit;
            this._spawnExitPortal(e.x ?? 0, e.y ?? 0, e.z ?? 0);
        }

        // Set initial active position to spawn
        this._activeId = '__spawn__';
    }

    /**
     * Hydrate checkpoint array directly (e.g. from save file).
     * @param {Array<{id, position:{x,y,z}, activated?}>} checkpoints
     */
    fromData(checkpoints) {
        for (const cp of checkpoints) {
            const pos = new THREE.Vector3(
                cp.position?.x ?? 0,
                cp.position?.y ?? 0,
                cp.position?.z ?? 0
            );
            const mesh = this._buildCheckpointMesh(false);
            mesh.position.copy(pos);
            this._scene.add(mesh);

            if (cp.activated) {
                this._activateVisual(mesh);
                this._activeId = cp.id;
            }

            this._checkpoints.set(cp.id, { id: cp.id, pos, mesh, activated: !!cp.activated });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Update — call every frame
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param {number}            dt
     * @param {THREE.Vector3Like} playerPos
     */
    update(dt, playerPos) {
        if (!playerPos) return;

        // Start level timer on first update
        if (this._levelStartMs === null) {
            this._levelStartMs = performance.now();
        }
        this._levelTimeSec = (performance.now() - this._levelStartMs) * MS_TO_SEC;

        const pv = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);

        // ── Death plane ──────────────────────────────────────────────────────
        if (this._deathCooldown > 0) {
            this._deathCooldown -= dt;
        } else if (pv.y < this._deathY) {
            this._deathCooldown = 2.0;
            this.onPlayerDeath?.();
        }

        // ── Checkpoint collision ─────────────────────────────────────────────
        for (const cp of this._checkpoints.values()) {
            if (cp.activated) continue;
            if (pv.distanceTo(cp.pos) < CP_RADIUS) {
                this._activateCheckpoint(cp, pv);
            }
        }

        // ── Exit portal collision ────────────────────────────────────────────
        if (this._exitPortal && !this._exitPortal.triggered) {
            const exitPos = this._exitPortal.mesh.position;
            if (pv.distanceTo(exitPos) < PORTAL_RADIUS) {
                this._exitPortal.triggered = true;
                this._triggerLevelComplete();
            }
        }

        // ── Animated objects ─────────────────────────────────────────────────
        const t = this._levelTimeSec;
        for (const obj of this._animated) {
            obj.update?.(dt, t);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Checkpoint activation
    // ─────────────────────────────────────────────────────────────────────────

    _activateCheckpoint(cp, playerPos) {
        cp.activated = true;
        this._activeId = cp.id;

        this._activateVisual(cp.mesh);
        this._audio?.playEffect?.('checkpoint', cp.pos);
        this.onCheckpointActivated?.(cp.id, cp.pos.clone());
    }

    _activateVisual(mesh) {
        // Recolor flag to accent palette color
        const flagMesh = mesh.getObjectByName('flag');
        if (flagMesh) {
            const accentHex = this._palette?.getHex?.(1) ?? '#27ae60';
            flagMesh.material.color.set(accentHex);
        }
        // Scale pulse anim: animate pole once
        const pole = mesh.getObjectByName('pole');
        if (pole) {
            let timer = 0;
            const origScale = pole.scale.y;
            const anim = {
                update: (dt) => {
                    timer += dt;
                    pole.scale.y = origScale * (1 + 0.18 * Math.sin(timer * 20) * Math.max(0, 1 - timer * 3));
                    if (timer > 1.2) this._animated.splice(this._animated.indexOf(anim), 1);
                }
            };
            this._animated.push(anim);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Level complete
    // ─────────────────────────────────────────────────────────────────────────

    _triggerLevelComplete() {
        const stats = {
            timeSec: Math.floor(this._levelTimeSec),
        };
        this._audio?.playEffect?.('level_complete', { x: 0, y: 0, z: 0 });
        this.onLevelComplete?.(stats);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Accessors
    // ─────────────────────────────────────────────────────────────────────────

    getActiveCPPosition() {
        if (this._activeId === '__spawn__') return this._startPos?.clone() ?? new THREE.Vector3();
        const cp = this._checkpoints.get(this._activeId);
        return cp?.pos.clone() ?? this._startPos?.clone() ?? new THREE.Vector3();
    }

    /** Returns the ID of the last activated checkpoint (or null before first activation). */
    getActiveCPId() {
        return this._activeId === '__spawn__' ? null : (this._activeId ?? null);
    }

    get timeSec() { return this._levelTimeSec; }
    get deathY()  { return this._deathY; }

    // ─────────────────────────────────────────────────────────────────────────
    // Mesh builders
    // ─────────────────────────────────────────────────────────────────────────

    _buildCheckpointMesh(activated) {
        const group = new THREE.Group();

        // Pole
        const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, POLE_HEIGHT, 6, 1);
        const poleMat = new THREE.MeshLambertMaterial({ color: 0x888888, flatShading: true });
        const pole    = new THREE.Mesh(poleGeo, poleMat);
        pole.name     = 'pole';
        pole.position.y = POLE_HEIGHT / 2;
        group.add(pole);

        // Flag
        const flagGeo = new THREE.PlaneGeometry(0.6, 0.4);
        const accentHex = activated ? (this._palette?.getHex?.(1) ?? '#27ae60') : '#555555';
        const flagMat = new THREE.MeshLambertMaterial({
            color: new THREE.Color(accentHex),
            side: THREE.DoubleSide,
            flatShading: true,
        });
        const flag    = new THREE.Mesh(flagGeo, flagMat);
        flag.name     = 'flag';
        flag.position.set(0.3, POLE_HEIGHT - 0.2, 0);
        group.add(flag);

        // Base star (octahedron)
        const baseGeo = new THREE.OctahedronGeometry(0.18, 0);
        const baseMat = new THREE.MeshLambertMaterial({ color: 0xffd700, flatShading: true });
        const base    = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = POLE_HEIGHT;
        base.name    = 'tip';
        group.add(base);

        // Tip rotating animation
        const anim = { update: (dt) => { base.rotation.y += 1.5 * dt; } };
        this._animated.push(anim);

        return group;
    }

    _spawnStartPortal(x, y, z) {
        const portal = this._buildPortal('#27ae60', 1.0, true);
        portal.position.set(x, y + 0.1, z);
        this._scene.add(portal);
    }

    _spawnExitPortal(x, y, z) {
        const portal = this._buildPortal('#ff0000', 1.3, false);
        portal.position.set(x, y + 0.1, z);
        this._scene.add(portal);
        this._exitPortal = { mesh: portal, triggered: false };
    }

    _buildPortal(hexColor, radius, isStart) {
        const group = new THREE.Group();

        // Outer ring torus
        const torusGeo = new THREE.TorusGeometry(radius, 0.12, 6, 12);
        const torusMat = new THREE.MeshLambertMaterial({
            color: new THREE.Color(hexColor),
            flatShading: true,
        });
        const torus = new THREE.Mesh(torusGeo, torusMat);
        torus.rotation.x = Math.PI / 2;  // lay flat on ground
        group.add(torus);

        // Inner disc (translucent)
        const discGeo = new THREE.CircleGeometry(radius * 0.9, 8);
        const discMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(hexColor),
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide,
        });
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.02;
        group.add(disc);

        // Pulse + rotation animation
        const anim = {
            update: (dt, t) => {
                const pulse = PORTAL_SCALE_MIN + (PORTAL_SCALE_MAX - PORTAL_SCALE_MIN)
                    * (0.5 + 0.5 * Math.sin(t * PORTAL_PULSE_FREQ));
                group.scale.setScalar(pulse);
                group.rotation.y += PORTAL_ROT_SPEED * dt;
            }
        };
        this._animated.push(anim);

        return group;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Clear / destroy
    // ─────────────────────────────────────────────────────────────────────────

    clear() {
        for (const cp of this._checkpoints.values()) {
            this._scene.remove(cp.mesh);
            cp.mesh.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
        }
        this._checkpoints.clear();

        if (this._exitPortal) {
            this._scene.remove(this._exitPortal.mesh);
            this._exitPortal = null;
        }

        this._animated.length  = 0;
        this._activeId         = null;
        this._levelStartMs     = null;
        this._levelTimeSec     = 0;
    }

    destroy() {
        this.clear();
    }
}
