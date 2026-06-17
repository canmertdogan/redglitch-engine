/**
 * FPSCamera.js — Phase 27
 *
 * First-person camera layer for the fps-3d engine.
 * Wraps Camera3DController (shared/Camera3DController.js) and adds:
 *
 *   - Pointer lock management with click-to-start callback
 *   - Mouse delta → yaw (Y-axis) + pitch (X-axis, clamped ±89°)
 *   - Camera bob: sine wave on Y + slight X sway when walking
 *   - FOV kick: smooth interpolation on sprint start / weapon fire
 *   - Weapon recoil: additive pitch impulse that springs back
 *   - Lean system: Q/E corner peeking (configurable, Z-roll + X-offset)
 *
 * Visual style constraint: no post-process motion blur, no depth-of-field.
 * Low-poly palette aesthetic — camera effects are gameplay-responsive, not cinematic.
 *
 * Usage:
 *   this.fpsCamera = new FPSCamera(camera3dController, domElement, options);
 *   this.fpsCamera.attach();            // registers pointer-lock listeners
 *   this.fpsCamera.update(dt);          // call every frame from _update()
 *   this.fpsCamera.setWalking(true);    // enable bob
 *   this.fpsCamera.setSprinting(true);  // trigger FOV kick
 *   this.fpsCamera.fireRecoil(0.04);   // add recoil pitch impulse (radians)
 *   this.fpsCamera.detach();            // remove listeners
 */

import * as THREE from '/lib/three/three.module.js';
import Camera3DController, { CameraMode } from '/engines/shared/Camera3DController.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEG2RAD = Math.PI / 180;

/** Base FOV when standing still. */
const FOV_BASE    = 75;
/** FOV added on top of base while sprinting. */
const FOV_SPRINT  = 10;
/** Rate at which FOV snaps to target (per-second exponential). */
const FOV_LERP    = 8;

/** Bob frequency (cycles per metre walked). */
const BOB_FREQ    = 1.8;
/** Bob vertical amplitude in world units. */
const BOB_AMP_Y   = 0.045;
/** Bob horizontal sway amplitude. */
const BOB_AMP_X   = 0.022;
/** Bob smoothing (lerp factor when stopping). */
const BOB_DAMP    = 10;

/** Recoil recovery speed (radians/second spring coefficient). */
const RECOIL_SPRING = 18;
/** Maximum accumulated recoil pitch (radians). */
const RECOIL_MAX    = 0.35;

/** Lean max roll (degrees). */
const LEAN_ROLL_MAX    = 8;
/** Lean max horizontal offset (world units). */
const LEAN_OFFSET_MAX  = 0.5;
/** Lean blend speed (per-second exponential). */
const LEAN_LERP        = 9;

// ── FPSCamera ─────────────────────────────────────────────────────────────────

export default class FPSCamera {

    /**
     * @param {Camera3DController} cam3d   Shared camera controller (already in FPS mode)
     * @param {HTMLElement}        domEl   Renderer canvas / game container
     * @param {object}             [opts]
     * @param {number}  [opts.sensitivity=0.0015]  Mouse sensitivity (radians/pixel)
     * @param {boolean} [opts.bobEnabled=true]      Enable camera bob
     * @param {boolean} [opts.leanEnabled=true]     Enable lean (Q/E)
     * @param {number}  [opts.fovBase=75]           Rest FOV in degrees
     * @param {number}  [opts.fovSprint=10]         Extra FOV while sprinting
     */
    constructor(cam3d, domEl, opts = {}) {
        /** @type {Camera3DController} */
        this._cam3d = cam3d;
        /** @type {HTMLElement} */
        this._domEl = domEl;

        // ── Configuration ─────────────────────────────────────────────────
        this._sensitivity = opts.sensitivity ?? 0.0015;
        this._bobEnabled  = opts.bobEnabled  ?? true;
        this._leanEnabled = opts.leanEnabled ?? true;
        this._fovBase     = opts.fovBase     ?? FOV_BASE;
        this._fovSprint   = opts.fovSprint   ?? FOV_SPRINT;

        // ── Yaw / pitch state ─────────────────────────────────────────────
        /** Horizontal rotation (radians, unbounded). */
        this._yaw   = 0;
        /** Vertical rotation (radians, clamped ±89°). */
        this._pitch = 0;

        const pitchLimit = 89 * DEG2RAD;
        this._pitchMin   = -pitchLimit;
        this._pitchMax   =  pitchLimit;

        // ── Bob state ─────────────────────────────────────────────────────
        /** Distance walked this session (used as bob phase input). */
        this._bobPhase   = 0;
        /** Smoothed bob Y offset applied to camera. */
        this._bobY       = 0;
        /** Smoothed bob X offset. */
        this._bobX       = 0;
        /** Whether the player is currently walking (set by FPSController). */
        this._isWalking  = false;
        /** Current horizontal speed (m/s, used to scale bob). */
        this._speed      = 0;

        // ── FOV kick ──────────────────────────────────────────────────────
        /** Current camera FOV (degrees, smoothly interpolated). */
        this._fovCurrent = this._fovBase;
        /** Target FOV (set by sprint/recoil state). */
        this._fovTarget  = this._fovBase;
        this._isSprinting = false;

        // ── Weapon recoil ─────────────────────────────────────────────────
        /** Additive pitch offset from recoil (springs back to zero). */
        this._recoilPitch = 0;

        // ── Lean state ────────────────────────────────────────────────────
        /**
         * Lean direction: -1 = left (Q), 0 = centre, +1 = right (E).
         * Exposed as float so partial-lean is possible via analogue input.
         */
        this._leanTarget  = 0;
        /** Smoothed lean amount (–1…+1). */
        this._leanCurrent = 0;

        // ── Pivot object — camera is offset relative to this ─────────────
        // The pivot stays at eye height; bob + lean offsets are applied to it.
        this._pivotPos = new THREE.Vector3();

        // Reusable THREE objects (avoid GC pressure in hot loop)
        this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this._quat  = new THREE.Quaternion();

        // ── Pointer lock ──────────────────────────────────────────────────
        this._isLocked  = false;
        this._mouseDX   = 0;
        this._mouseDY   = 0;

        // Bound handlers stored so they can be removed
        this._onMouseMove  = this._handleMouseMove.bind(this);
        this._onLockChange = this._handleLockChange.bind(this);
        this._onLockError  = this._handleLockError.bind(this);
        this._onClick      = this._handleClick.bind(this);

        /** Called when pointer lock is acquired. Optional. */
        this.onLocked   = null;
        /** Called when pointer lock is released. Optional. */
        this.onUnlocked = null;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /** Attach DOM listeners. Call once after engine init(). */
    attach() {
        document.addEventListener('mousemove',        this._onMouseMove,  false);
        document.addEventListener('pointerlockchange',this._onLockChange, false);
        document.addEventListener('pointerlockerror', this._onLockError,  false);
        this._domEl.addEventListener('click',         this._onClick,      false);
        console.log('[FPSCamera] attached');
    }

    /** Remove DOM listeners. Call on dispose(). */
    detach() {
        document.removeEventListener('mousemove',        this._onMouseMove,  false);
        document.removeEventListener('pointerlockchange',this._onLockChange, false);
        document.removeEventListener('pointerlockerror', this._onLockError,  false);
        this._domEl.removeEventListener('click',         this._onClick,      false);
        console.log('[FPSCamera] detached');
    }

    // ── Pointer lock ──────────────────────────────────────────────────────────

    requestPointerLock() {
        this._domEl.requestPointerLock?.()?.catch?.(() => {});
    }

    releasePointerLock() {
        if (this._isLocked) document.exitPointerLock?.();
    }

    get isLocked() { return this._isLocked; }

    // ── State setters (called by FPSController / WeaponSystem) ───────────────

    /**
     * Notify camera that the player is/isn't walking this frame.
     * @param {boolean} walking
     * @param {number}  [speed=0]  Horizontal speed in m/s (scales bob amplitude)
     */
    setWalking(walking, speed = 0) {
        this._isWalking = walking;
        this._speed     = speed;
    }

    /**
     * Notify camera that the player is/isn't sprinting.
     * Triggers FOV kick when transitioning from false → true.
     * @param {boolean} sprinting
     */
    setSprinting(sprinting) {
        if (this._isSprinting === sprinting) return;
        this._isSprinting = sprinting;
        this._fovTarget   = sprinting
            ? this._fovBase + this._fovSprint
            : this._fovBase;
    }

    /**
     * Add an instantaneous recoil impulse (upward pitch kick).
     * Springs back automatically each frame.
     * @param {number} amount  Pitch impulse in radians (positive = kick up)
     */
    fireRecoil(amount) {
        this._recoilPitch = Math.min(
            this._recoilPitch + amount,
            RECOIL_MAX,
        );
        // Tiny FOV squeeze on fire — classic "punch" feel
        this._fovTarget = Math.max(this._fovBase - 2, this._fovCurrent - 2);
    }

    /**
     * Set lean direction directly from input (−1 left / 0 centre / +1 right).
     * @param {number} dir  -1, 0, or +1
     */
    setLean(dir) {
        if (!this._leanEnabled) return;
        this._leanTarget = THREE.MathUtils.clamp(dir, -1, 1);
    }

    /**
     * Set the eye position (pivot) — called by FPSController after physics.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    setPosition(x, y, z) {
        this._pivotPos.set(x, y, z);
    }

    /**
     * Get current camera world position (pivot + bob offsets).
     * @returns {{ x:number, y:number, z:number }}
     */
    getPosition() {
        const cam = this._cam3d?.camera;
        if (!cam) return { x: this._pivotPos.x, y: this._pivotPos.y, z: this._pivotPos.z };
        return { x: cam.position.x, y: cam.position.y, z: cam.position.z };
    }

    /**
     * Get normalised forward direction the camera is looking.
     * @returns {THREE.Vector3}
     */
    getForward() {
        const cam = this._cam3d?.camera;
        if (!cam) return new THREE.Vector3(0, 0, -1);
        const dir = new THREE.Vector3();
        cam.getWorldDirection(dir);
        return dir;
    }

    /**
     * Get yaw angle (radians) — used by FPSController to orient movement.
     * @returns {number}
     */
    getYaw() { return this._yaw; }

    // ── Per-frame update ──────────────────────────────────────────────────────

    /**
     * update(dt) — apply mouse look, bob, FOV, recoil, lean to the camera.
     * Called from FPSGame._update() after FPSController.
     * @param {number} dt  Delta time in seconds.
     */
    update(dt) {
        this._applyMouseLook(dt);
        this._updateBob(dt);
        this._updateRecoil(dt);
        this._updateFOV(dt);
        this._updateLean(dt);
        this._applyToCamera();

        // Consume mouse delta
        this._mouseDX = 0;
        this._mouseDY = 0;
    }

    // ── Internal update stages ────────────────────────────────────────────────

    _applyMouseLook() {
        if (!this._isLocked) return;
        this._yaw   -= this._mouseDX * this._sensitivity;
        this._pitch -= this._mouseDY * this._sensitivity;
        this._pitch  = THREE.MathUtils.clamp(this._pitch, this._pitchMin, this._pitchMax);
    }

    _updateBob(dt) {
        if (!this._bobEnabled) {
            this._bobY = 0;
            this._bobX = 0;
            return;
        }

        if (this._isWalking && this._isLocked) {
            // Advance phase proportional to speed (feels consistent at all speeds)
            const speedScale = THREE.MathUtils.clamp(this._speed / 5, 0.3, 1.5);
            this._bobPhase  += dt * BOB_FREQ * speedScale * Math.PI * 2;

            const amp = BOB_AMP_Y * speedScale;
            const targetY = -Math.abs(Math.sin(this._bobPhase)) * amp;
            const targetX =  Math.sin(this._bobPhase * 0.5)    * BOB_AMP_X * speedScale;

            this._bobY = THREE.MathUtils.lerp(this._bobY, targetY, Math.min(1, dt * BOB_DAMP));
            this._bobX = THREE.MathUtils.lerp(this._bobX, targetX, Math.min(1, dt * BOB_DAMP));
        } else {
            // Smoothly damp bob back to zero when idle
            this._bobY = THREE.MathUtils.lerp(this._bobY, 0, Math.min(1, dt * BOB_DAMP));
            this._bobX = THREE.MathUtils.lerp(this._bobX, 0, Math.min(1, dt * BOB_DAMP));
        }
    }

    _updateRecoil(dt) {
        if (this._recoilPitch <= 0) return;
        // Pitch up instantly, spring back with coefficient
        this._pitch      -= this._recoilPitch * 0.5 * dt; // consume a fraction into actual pitch
        this._recoilPitch = Math.max(0, this._recoilPitch - RECOIL_SPRING * dt * this._recoilPitch);
        this._pitch       = THREE.MathUtils.clamp(this._pitch, this._pitchMin, this._pitchMax);

        // Recover FOV toward base after fire-crunch
        if (this._fovTarget < this._fovBase) {
            this._fovTarget = THREE.MathUtils.lerp(this._fovTarget, this._fovBase, Math.min(1, dt * 6));
        }
    }

    _updateFOV(dt) {
        if (Math.abs(this._fovCurrent - this._fovTarget) < 0.01) {
            this._fovCurrent = this._fovTarget;
            return;
        }
        this._fovCurrent = THREE.MathUtils.lerp(
            this._fovCurrent, this._fovTarget, Math.min(1, dt * FOV_LERP)
        );
        const cam = this._cam3d?.camera;
        if (cam) {
            cam.fov = this._fovCurrent;
            cam.updateProjectionMatrix();
        }
    }

    _updateLean(dt) {
        this._leanCurrent = THREE.MathUtils.lerp(
            this._leanCurrent, this._leanTarget, Math.min(1, dt * LEAN_LERP)
        );
    }

    /**
     * Write final position + orientation to the Three.js camera.
     * Bob and lean offsets are applied in camera-local space.
     */
    _applyToCamera() {
        const cam = this._cam3d?.camera;
        if (!cam) return;

        // ── Yaw + pitch → quaternion via YXZ Euler ────────────────────────
        this._euler.set(this._pitch, this._yaw, 0, 'YXZ');
        cam.quaternion.setFromEuler(this._euler);

        // ── Lean: roll + side offset ──────────────────────────────────────
        if (this._leanCurrent !== 0) {
            const rollRad = this._leanCurrent * LEAN_ROLL_MAX * DEG2RAD;
            const leanEuler = new THREE.Euler(0, 0, -rollRad, 'YXZ');
            const leanQuat  = new THREE.Quaternion().setFromEuler(leanEuler);
            cam.quaternion.multiply(leanQuat);
        }

        // ── Position: pivot + bob + lean side offset ──────────────────────
        const leanOffsetX = this._leanCurrent * LEAN_OFFSET_MAX;

        // Bob and lean offsets in world space (approximated — valid for FPS)
        const sinYaw = Math.sin(this._yaw);
        const cosYaw = Math.cos(this._yaw);

        // right vector (simplified, no pitch contribution needed for offset)
        const rightX = cosYaw;
        const rightZ = -sinYaw;

        cam.position.set(
            this._pivotPos.x + rightX * leanOffsetX + this._bobX * cosYaw,
            this._pivotPos.y + this._bobY,
            this._pivotPos.z + rightZ * leanOffsetX + this._bobX * sinYaw,
        );
    }

    // ── Serialization (for save/load) ─────────────────────────────────────────

    /** @returns {{ yaw:number, pitch:number, pos:{x,y,z} }} */
    serialize() {
        return {
            yaw:   this._yaw,
            pitch: this._pitch,
            pos:   { ...this._pivotPos },
        };
    }

    /** @param {{ yaw:number, pitch:number, pos:{x,y,z} }} data */
    deserialize(data) {
        if (!data) return;
        if (data.yaw   !== undefined) this._yaw   = data.yaw;
        if (data.pitch !== undefined) this._pitch = data.pitch;
        if (data.pos)                 this._pivotPos.set(data.pos.x, data.pos.y, data.pos.z);
    }

    /** Resize: update camera aspect ratio. */
    onResize(w, h) {
        const cam = this._cam3d?.camera;
        if (!cam) return;
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
    }

    // ── DOM event handlers ────────────────────────────────────────────────────

    _handleMouseMove(e) {
        if (!this._isLocked) return;
        this._mouseDX += e.movementX;
        this._mouseDY += e.movementY;
    }

    _handleLockChange() {
        const locked = document.pointerLockElement === this._domEl
                    || document.pointerLockElement === document.body;
        this._isLocked = locked;
        if (locked) {
            console.log('[FPSCamera] pointer locked');
            this.onLocked?.();
        } else {
            console.log('[FPSCamera] pointer unlocked');
            // Clear any residual mouse deltas so there's no jump on re-lock
            this._mouseDX = 0;
            this._mouseDY = 0;
            this.onUnlocked?.();
        }
    }

    _handleLockError() {
        console.warn('[FPSCamera] pointer lock error');
    }

    /** Auto-request pointer lock when user clicks the game canvas. */
    _handleClick() {
        if (!this._isLocked) {
            this.requestPointerLock();
        }
    }
}
