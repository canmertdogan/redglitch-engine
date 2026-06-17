/**
 * ThirdPersonCamera.js — Phase 43
 *
 * Third-person orbit camera for the platformer-3d engine.
 * Wraps Camera3DController (shared/Camera3DController.js) and adds:
 *
 *   - Orbit camera: follows player with configurable distance + height offset
 *   - Mouse/stick look: yaw (horizontal) + pitch (vertical, clamped)
 *   - Auto-rotate: smoothly swings behind player after a configurable idle time
 *   - Camera collision: sphere-casts toward player; pushes camera in front of
 *     occluding geometry (no clipping through walls)
 *   - Lock-on mode: focus on a target enemy; soft orbit on player-target axis
 *   - Cutscene mode: follow a CatmullRom spline path at configurable speed
 *   - Shoulder swap: toggle left/right offset (Q key default)
 *
 * Visual style: no motion blur, no depth-of-field — pure gameplay-responsive.
 *
 * Usage:
 *   const cam = new ThirdPersonCamera(cam3dController, scene, domElement, opts);
 *   cam.setTarget(playerMesh);          // assign player mesh to follow
 *   cam.update(dt, playerPosition);     // call every frame
 *   cam.swapShoulder();                 // toggle left/right offset
 *   cam.lockOn(enemyMesh);              // enter lock-on mode
 *   cam.clearLockOn();                  // return to free orbit
 *   cam.playCutscene(waypoints, speed); // enter cinematic mode
 */

import * as THREE from '/lib/three/three.module.js';
import Camera3DController, { CameraMode } from '/engines/shared/Camera3DController.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEG2RAD = Math.PI / 180;

/** Default orbit distance from player pivot. */
const DIST_DEFAULT     = 6;
/** Minimum zoom distance. */
const DIST_MIN         = 2;
/** Maximum zoom distance. */
const DIST_MAX         = 14;
/** Height above player origin to aim at. */
const PIVOT_HEIGHT     = 1.2;
/** Shoulder offset (world units, left/right). */
const SHOULDER_OFFSET  = 0.6;

/** Pitch (vertical) limits in degrees. */
const PITCH_MIN_DEG    = -20;
const PITCH_MAX_DEG    =  60;

/** FOV for normal play. */
const FOV_NORMAL       = 60;
/** FOV for lock-on (slightly narrowed). */
const FOV_LOCKON       = 52;
/** FOV lerp speed. */
const FOV_LERP         = 6;

/** Mouse sensitivity (radians/pixel). */
const MOUSE_SENS       = 0.0018;

/** Orbit lerp speed (position smoothing). */
const ORBIT_LERP       = 10;

/** Auto-rotate idle time before camera swings behind player (seconds). */
const AUTO_ROT_IDLE    = 2.5;
/** Auto-rotate speed (radians/second). */
const AUTO_ROT_SPEED   = 1.2;

/** Lock-on orbit radius around player-target midpoint (world units). */
const LOCKON_ORBIT_DIST = 5;
/** Lock-on blend speed (per-second exponential). */
const LOCKON_LERP       = 6;

/** Collision sphere radius for wall avoidance. */
const COLLISION_RADIUS  = 0.25;

// ── ThirdPersonCamera ─────────────────────────────────────────────────────────

export default class ThirdPersonCamera {

    /**
     * @param {Camera3DController} cam3d    Shared camera controller
     * @param {THREE.Scene}        scene    Scene used for collision raycasting
     * @param {HTMLElement}        domEl    Canvas / container for mouse events
     * @param {object}             [opts]
     * @param {number}  [opts.distance=6]        Initial orbit distance
     * @param {number}  [opts.pivotHeight=1.2]   Pivot height above player origin
     * @param {number}  [opts.sensitivity=0.0018] Mouse sensitivity
     * @param {boolean} [opts.invertY=false]      Invert vertical look
     * @param {boolean} [opts.autoRotate=true]    Auto-swing behind player
     */
    constructor(cam3d, scene, domEl, opts = {}) {
        /** @type {Camera3DController} */
        this._cam3d     = cam3d;
        /** @type {THREE.Camera} */
        this._camera    = cam3d.camera;
        /** @type {THREE.Scene} */
        this._scene     = scene;
        /** @type {HTMLElement} */
        this._domEl     = domEl;

        // Config
        this._distance      = opts.distance      ?? DIST_DEFAULT;
        this._pivotHeight   = opts.pivotHeight   ?? PIVOT_HEIGHT;
        this._sensitivity   = opts.sensitivity   ?? MOUSE_SENS;
        this._invertY       = opts.invertY       ?? false;
        this._autoRotate    = opts.autoRotate     ?? true;

        // Orbit angles (radians)
        this._yaw           = 0;
        this._pitch         = 20 * DEG2RAD;   // start slightly above
        this._targetYaw     = 0;
        this._targetPitch   = 20 * DEG2RAD;

        // Shoulder offset (+1 = right, -1 = left)
        this._shoulderSide  = 1;

        // Current orbit position (smoothed)
        this._currentPos    = new THREE.Vector3();
        this._pivotPos      = new THREE.Vector3();

        // Auto-rotate state
        this._idleTimer     = 0;
        this._lastInputTime = 0;

        // Lock-on state
        this._lockOnTarget  = null;     // THREE.Object3D | null
        this._lockOnBlend   = 0;        // 0 = free, 1 = full lock-on

        // Cutscene state
        this._cutscene      = null;     // { curve: CatmullRomCurve3, t: 0, speed, onComplete }

        // Raycaster for collision
        this._raycaster     = new THREE.Raycaster();
        this._collisionMask = [];       // array of THREE.Mesh to test against

        // Target mesh to follow
        this._target        = null;     // THREE.Object3D

        // FOV tracking
        this._currentFov    = FOV_NORMAL;

        // Mouse delta accumulated between update() calls
        this._mouseDx       = 0;
        this._mouseDy       = 0;

        this._onMouseMove   = this._handleMouseMove.bind(this);
        this._onMouseDown   = this._handleMouseDown.bind(this);

        this._attached      = false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    /** Assign the player object to follow. */
    setTarget(mesh) {
        this._target = mesh;
        if (mesh) {
            this._currentPos.copy(mesh.position);
        }
    }

    /** Replace the collision mesh list (static world geometry). */
    setCollisionMeshes(meshes) {
        this._collisionMask = meshes;
    }

    /** Toggle left/right shoulder offset. */
    swapShoulder() {
        this._shoulderSide *= -1;
    }

    /** Enter lock-on mode: orbit softly with target enemy in view. */
    lockOn(target) {
        this._lockOnTarget = target;
    }

    /** Return to free orbit. */
    clearLockOn() {
        this._lockOnTarget = null;
    }

    /**
     * Begin cinematic spline path.
     * @param {Array<{position:THREE.Vector3Like, lookAt:THREE.Vector3Like}>} waypoints
     * @param {number}   speed      0-1 t-units per second along the curve
     * @param {Function} onComplete Callback when path finishes
     */
    playCutscene(waypoints, speed = 0.15, onComplete = null) {
        const positions = waypoints.map(wp =>
            new THREE.Vector3(wp.position.x, wp.position.y, wp.position.z));
        const lookAts = waypoints.map(wp =>
            new THREE.Vector3(wp.lookAt.x, wp.lookAt.y, wp.lookAt.z));

        const curve = new THREE.CatmullRomCurve3(positions, false, 'catmullrom', 0.5);

        this._cutscene = {
            curve,
            lookAts,
            t:          0,
            speed,
            onComplete,
        };
    }

    stopCutscene() {
        this._cutscene = null;
    }

    get isInCutscene() { return this._cutscene !== null; }
    get isLockedOn()   { return this._lockOnTarget !== null; }

    // ─────────────────────────────────────────────────────────────────────────
    // Input
    // ─────────────────────────────────────────────────────────────────────────

    attach() {
        if (this._attached) return;
        this._domEl.addEventListener('mousemove',  this._onMouseMove, { passive: true });
        this._domEl.addEventListener('mousedown',  this._onMouseDown, { passive: true });
        this._attached = true;
    }

    detach() {
        this._domEl.removeEventListener('mousemove',  this._onMouseMove);
        this._domEl.removeEventListener('mousedown',  this._onMouseDown);
        this._attached = false;
    }

    /** Called by Input3D or mouse handler to supply look deltas (radians). */
    addLookDelta(dx, dy) {
        this._mouseDx += dx;
        this._mouseDy += dy;
    }

    _handleMouseMove(e) {
        const dx = e.movementX ?? 0;
        const dy = e.movementY ?? 0;
        if (dx === 0 && dy === 0) return;
        this._mouseDx  += dx * this._sensitivity;
        this._mouseDy  += dy * this._sensitivity * (this._invertY ? -1 : 1);
        this._lastInputTime = performance.now();
    }

    _handleMouseDown(e) {
        // Right-click: zoom in
        if (e.button === 2) {
            this._distance = Math.max(DIST_MIN, this._distance - 2);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Update
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Call once per frame from the engine's _update().
     * @param {number}              dt              Frame delta (seconds)
     * @param {THREE.Vector3Like}   [playerPos]     Latest player position override
     */
    update(dt, playerPos = null) {
        if (this._target && playerPos) {
            this._target.position.set(playerPos.x, playerPos.y, playerPos.z);
        }

        if (this._cutscene) {
            this._updateCutscene(dt);
            return;
        }

        if (this._lockOnTarget) {
            this._updateLockOn(dt);
        } else {
            this._updateOrbit(dt);
        }

        // Apply smoothed FOV
        this._applyFov(dt);
    }

    // ── Orbit (free camera) ───────────────────────────────────────────────────

    _updateOrbit(dt) {
        // Consume accumulated mouse input
        const dYaw   = this._mouseDx;
        const dPitch = this._mouseDy;
        this._mouseDx = 0;
        this._mouseDy = 0;

        const hasInput = Math.abs(dYaw) > 0.001 || Math.abs(dPitch) > 0.001;
        if (hasInput) {
            this._idleTimer     = 0;
            this._lastInputTime = performance.now();
        }

        this._targetYaw   -= dYaw;
        this._targetPitch -= dPitch;
        this._targetPitch  = THREE.MathUtils.clamp(
            this._targetPitch,
            PITCH_MIN_DEG * DEG2RAD,
            PITCH_MAX_DEG * DEG2RAD
        );

        // Auto-rotate: swing behind player when idle
        if (this._autoRotate && !hasInput) {
            this._idleTimer += dt;
            if (this._idleTimer > AUTO_ROT_IDLE) {
                const playerFwd  = this._getPlayerForward();
                const targetYaw  = Math.atan2(playerFwd.x, playerFwd.z) + Math.PI;
                let   diff       = targetYaw - this._targetYaw;
                // Normalise diff to [-π, π]
                while (diff >  Math.PI) diff -= 2 * Math.PI;
                while (diff < -Math.PI) diff += 2 * Math.PI;
                this._targetYaw += diff * Math.min(1, AUTO_ROT_SPEED * dt);
            }
        }

        // Smooth angles
        const lerpT = Math.min(1, ORBIT_LERP * dt);
        this._yaw   = THREE.MathUtils.lerp(this._yaw,   this._targetYaw,   lerpT);
        this._pitch = THREE.MathUtils.lerp(this._pitch, this._targetPitch,  lerpT);

        // Compute desired camera position
        const pivot = this._getPivotPos();
        const shoulderOffset = this._shoulderSide * SHOULDER_OFFSET;

        const offset = new THREE.Vector3(
            shoulderOffset + Math.sin(this._yaw) * this._distance * Math.cos(this._pitch),
            Math.sin(this._pitch) * this._distance,
            Math.cos(this._yaw)   * this._distance * Math.cos(this._pitch)
        );

        let desired = pivot.clone().add(offset);

        // Collision avoidance: push camera in if blocked
        desired = this._avoidCollision(pivot, desired);

        // Smooth position
        this._currentPos.lerp(desired, lerpT);
        this._camera.position.copy(this._currentPos);
        this._camera.lookAt(pivot);
    }

    // ── Lock-on ───────────────────────────────────────────────────────────────

    _updateLockOn(dt) {
        if (!this._target || !this._lockOnTarget) return;

        // Blend toward lock-on amount
        this._lockOnBlend = Math.min(1, this._lockOnBlend + LOCKON_LERP * dt);

        const playerPos = this._getPivotPos();
        const targetPos = this._lockOnTarget.position.clone().add(new THREE.Vector3(0, 1, 0));

        // Mid-point between player and target
        const mid = playerPos.clone().lerp(targetPos, 0.3);

        // Direction from target to player, pull back by orbit dist
        const toPlayer = playerPos.clone().sub(targetPos).normalize();
        const camPos   = mid.clone().add(toPlayer.multiplyScalar(LOCKON_ORBIT_DIST)).add(new THREE.Vector3(0, 2, 0));

        this._currentPos.lerp(camPos, Math.min(1, LOCKON_LERP * dt));
        this._camera.position.copy(this._currentPos);

        // Look at midpoint of player-target pair
        this._camera.lookAt(mid);

        // Update FOV target
        this._currentFov = THREE.MathUtils.lerp(this._currentFov, FOV_LOCKON, FOV_LERP * dt);
    }

    // ── Cutscene ──────────────────────────────────────────────────────────────

    _updateCutscene(dt) {
        const cs = this._cutscene;
        cs.t = Math.min(1, cs.t + cs.speed * dt);

        const pos = cs.curve.getPoint(cs.t);
        this._camera.position.copy(pos);

        // Interpolate lookAt between nearest waypoints
        const numWaypoints = cs.lookAts.length;
        const lookIdx = Math.floor(cs.t * (numWaypoints - 1));
        const lookNext= Math.min(lookIdx + 1, numWaypoints - 1);
        const lookFrac= (cs.t * (numWaypoints - 1)) - lookIdx;
        const lookAt  = cs.lookAts[lookIdx].clone().lerp(cs.lookAts[lookNext], lookFrac);
        this._camera.lookAt(lookAt);

        if (cs.t >= 1) {
            const cb = cs.onComplete;
            this._cutscene = null;
            cb?.();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Collision avoidance
    // ─────────────────────────────────────────────────────────────────────────

    _avoidCollision(from, to) {
        if (this._collisionMask.length === 0) return to;

        const dir  = to.clone().sub(from);
        const dist = dir.length();
        if (dist < 0.001) return to;
        dir.normalize();

        this._raycaster.set(from, dir);
        this._raycaster.far = dist + COLLISION_RADIUS;
        const hits = this._raycaster.intersectObjects(this._collisionMask, false);

        if (hits.length > 0) {
            const hitDist = hits[0].distance - COLLISION_RADIUS;
            if (hitDist < dist) {
                return from.clone().add(dir.multiplyScalar(Math.max(DIST_MIN * 0.5, hitDist)));
            }
        }
        return to;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    _getPivotPos() {
        if (!this._target) return new THREE.Vector3();
        return new THREE.Vector3(
            this._target.position.x,
            this._target.position.y + this._pivotHeight,
            this._target.position.z
        );
    }

    _getPlayerForward() {
        if (!this._target) return new THREE.Vector3(0, 0, -1);
        const fwd = new THREE.Vector3();
        this._target.getWorldDirection(fwd);
        return fwd;
    }

    _applyFov(dt) {
        const targetFov = this._lockOnTarget ? FOV_LOCKON : FOV_NORMAL;
        this._currentFov = THREE.MathUtils.lerp(this._currentFov, targetFov, FOV_LERP * dt);
        if (this._camera.isPerspectiveCamera) {
            this._camera.fov = this._currentFov;
            this._camera.updateProjectionMatrix();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Destroy
    // ─────────────────────────────────────────────────────────────────────────

    destroy() {
        this.detach();
        this._target      = null;
        this._lockOnTarget= null;
        this._cutscene    = null;
    }
}
