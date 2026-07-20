/**
 * Camera3DController.js — Unified camera system for all 3D engines.
 *
 * Modes  : TOPDOWN | FPS | THIRD_PERSON | ORBIT | CINEMATIC
 * Features: lerp/slerp transitions, trauma-based shake, collision avoidance,
 *           Pointer Lock mouse look, zoom, gamepad/joystick support.
 *
 * Usage (ES module):
 *
 *   import Camera3DController, { CameraMode } from '/engines/shared/Camera3DController.js';
 *
 *   const cam = new Camera3DController(scene, renderer.domElement);
 *   cam.setMode(CameraMode.THIRD_PERSON, { target: playerMesh });
 *   cam.update(delta);  // call every frame
 */

import * as THREE from '/lib/three/three.module.js';

// ── Camera mode enum ──────────────────────────────────────────────────────────

export const CameraMode = Object.freeze({
    TOPDOWN:      'TOPDOWN',
    FPS:          'FPS',
    THIRD_PERSON: 'THIRD_PERSON',
    ORBIT:        'ORBIT',
    CINEMATIC:    'CINEMATIC',
});

// ── Constants ─────────────────────────────────────────────────────────────────

const DEG2RAD = Math.PI / 180;

// Lerp smoothing factors (per-second exponential decay)
const LERP_POSITION = 12;   // higher = snappier
const LERP_ROTATION = 14;

const SHAKE_DECAY   = 2.5;  // trauma decay per second
const SHAKE_MAX_POS = 0.15; // metres
const SHAKE_MAX_ROT = 2.5;  // degrees

// ── Camera3DController ────────────────────────────────────────────────────────

class Camera3DController {
    /**
     * @param {THREE.Scene|THREE.Camera} scene_or_camera - Scene for raycasting OR existing camera (legacy)
     * @param {HTMLElement}      domElement - Renderer canvas (for pointer lock & wheel) OR container
     * @param {object}           [options]
     * @param {number}           [options.fov=60]      Vertical FOV in degrees
     * @param {number}           [options.near=0.1]
     * @param {number}           [options.far=1000]
     */
    constructor(scene_or_camera, domElement, options = {}) {
        // Support two signatures for backward compatibility:
        // 1. new Camera3DController(scene, domElement, options) - creates camera
        // 2. new Camera3DController(camera, container, options) - uses existing camera (LEGACY)
        
        let camera = null;
        let scene = null;
        
        if (scene_or_camera && scene_or_camera.isCamera) {
            // Legacy signature: passed a camera, use it
            camera = scene_or_camera;
            scene = null; // Will be set later if needed
        } else if (scene_or_camera && scene_or_camera.isScene) {
            // New signature: passed a scene, create camera
            scene = scene_or_camera;
        }
        
        this.scene = scene;
        this.domElement = domElement;

        const w = (domElement?.clientWidth) || window.innerWidth;
        const h = (domElement?.clientHeight) || window.innerHeight;

        /** @type {THREE.PerspectiveCamera} */
        if (camera) {
            // Use existing camera (legacy mode)
            this.camera = camera;
            // Update aspect ratio if needed
            if (this.camera.aspect !== w / h) {
                this.camera.aspect = w / h;
                this.camera.updateProjectionMatrix();
            }
        } else {
            // Create new camera
            this.camera = new THREE.PerspectiveCamera(
                options.fov  ?? 60,
                w / h,
                options.near ?? 0.1,
                options.far  ?? 1000,
            );
        }

        // ── Mode ──────────────────────────────────────────────────────────────
        this._mode       = CameraMode.TOPDOWN;
        this._modeConfig = {};

        // ── Transition targets ────────────────────────────────────────────────
        this._targetPos = new THREE.Vector3();
        this._targetQuat = new THREE.Quaternion();

        // Working quaternion helper
        this._quatHelper = new THREE.Quaternion();
        this._euler      = new THREE.Euler(0, 0, 0, 'YXZ');

        // ── Mouse look (FPS / third-person) ───────────────────────────────────
        this._yaw   = 0;  // radians, horizontal
        this._pitch = 0;  // radians, vertical

        this._mouseSensitivity = 0.0015;
        this._pitchMin = -80 * DEG2RAD;
        this._pitchMax =  80 * DEG2RAD;

        // ── Zoom / orbit distance ─────────────────────────────────────────────
        this._orbitDistance   = options.orbitDistance ?? 8;
        this._orbitDistMin    = 2;
        this._orbitDistMax    = 40;
        this._orbitPhi        = 45 * DEG2RAD;  // vertical angle
        this._orbitTheta      = 0;             // horizontal angle

        // ── Trauma-based shake ────────────────────────────────────────────────
        this._trauma = 0;  // 0–1
        this._shakeOffset   = new THREE.Vector3();
        this._shakeRotation = new THREE.Euler();
        this._noiseSeed     = Math.random() * 1000;

        // ── Collision avoidance ───────────────────────────────────────────────
        this._raycaster      = new THREE.Raycaster();
        this._collisionLayers = [];  // meshes to test against

        // ── Cinematic path ────────────────────────────────────────────────────
        this._cinematicPath   = null;   // THREE.CatmullRomCurve3 | null
        this._cinematicT      = 0;
        this._cinematicSpeed  = 0.1;

        // ── Input state (managed internally + InputHandler bridge) ─────────────
        this._inputHandler  = null;
        this._mouseDeltaX   = 0;
        this._mouseDeltaY   = 0;
        this._pointerLocked = false;
        this._zoomDelta     = 0;

        this._boundOnMouseMove  = this._onMouseMove.bind(this);
        this._boundOnWheel      = this._onWheel.bind(this);
        this._boundOnLockChange = this._onLockChange.bind(this);

        this._attachListeners();
    }

    // ── Mode API ──────────────────────────────────────────────────────────────

    /**
     * Switch camera mode.
     * @param {string} mode   One of CameraMode values
     * @param {object} config Mode-specific settings (see below per mode)
     *
     * Config per mode:
     *   TOPDOWN:      { target: Object3D, height:20, angle:55 }
     *   FPS:          { target: Object3D, eyeOffset: Vector3 }
     *   THIRD_PERSON: { target: Object3D, offset: Vector3, distance:6 }
     *   ORBIT:        { target: Vector3|Object3D, distance:8 }
     *   CINEMATIC:    { path: CatmullRomCurve3, speed:0.1, lookAt: Vector3|null }
     */
    setMode(mode, config = {}) {
        this._mode       = mode;
        this._modeConfig = config;

        if (mode === CameraMode.FPS) {
            // FPSCamera handles pointer lock via its own attach()/click handler.
            // Do NOT request pointer lock here — during onInit() it fires before
            // FPSCamera's pointerlockchange listener is registered, which can lose
            // the lock-state transition and prevent mouse look.
        } else if (this._pointerLocked) {
            document.exitPointerLock();
        }

        if (mode === CameraMode.CINEMATIC && config.path) {
            this._cinematicPath  = config.path;
            this._cinematicT     = 0;
            this._cinematicSpeed = config.speed ?? 0.05;
        }

        console.log(`[Camera3DController] mode → ${mode}`);
    }

    get mode() { return this._mode; }

    // ── InputHandler bridge ───────────────────────────────────────────────────

    /**
     * Optionally link the existing 2D InputHandler so camera reacts to
     * joystick/keyboard for orbit/third-person zoom.
     * @param {object} inputHandler  Instance with getAxis() and mouse properties
     */
    setInputHandler(inputHandler) {
        this._inputHandler = inputHandler;
    }

    // ── Pointer Lock ──────────────────────────────────────────────────────────

    requestPointerLock() {
        if (this.domElement.requestPointerLock) {
            this.domElement.requestPointerLock()?.catch?.(() => {});
        }
    }

    // ── Shake API ─────────────────────────────────────────────────────────────

    /**
     * Add camera trauma (impulse).  Traumas accumulate via max(), not add().
     * @param {number} amount  0–1  (0.3=light, 0.6=medium, 1.0=max)
     */
    addTrauma(amount) {
        this._trauma = Math.min(1, this._trauma + amount);
    }

    // ── Collision avoidance setup ─────────────────────────────────────────────

    /**
     * Set which meshes the camera should avoid clipping through.
     * @param {THREE.Mesh[]} meshes
     */
    setCollisionLayers(meshes) {
        this._collisionLayers = meshes;
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    /**
     * Update camera position/rotation for this frame.
     * @param {number} delta  Elapsed seconds (already capped by Engine3DBase)
     */
    update(delta) {
        this._applyMouseLook(delta);
        this._updateMode(delta);
        this._applyShake(delta);
        this._consumeMouseDelta();
    }

    // ── Resize ────────────────────────────────────────────────────────────────

    resize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    // Backward-compatible alias used by older engine integrations.
    onResize(width, height) {
        this.resize(width, height);
    }

    // ── Dispose ───────────────────────────────────────────────────────────────

    dispose() {
        this._detachListeners();
        if (this._pointerLocked) document.exitPointerLock();
    }

    // ── Private: mode updates ─────────────────────────────────────────────────

    _updateMode(delta) {
        const cfg = this._modeConfig;

        switch (this._mode) {
            case CameraMode.TOPDOWN:      this._updateTopdown(delta, cfg);     break;
            case CameraMode.FPS:          this._updateFPS(delta, cfg);         break;
            case CameraMode.THIRD_PERSON: this._updateThirdPerson(delta, cfg); break;
            case CameraMode.ORBIT:        this._updateOrbit(delta, cfg);       break;
            case CameraMode.CINEMATIC:    this._updateCinematic(delta, cfg);   break;
        }
    }

    // ── TOPDOWN ───────────────────────────────────────────────────────────────

    _updateTopdown(delta, cfg) {
        const target = cfg.target;
        if (!target) return;

        const pos    = target.position ?? target;
        const height = cfg.height ?? 20;
        const angle  = (cfg.angle  ?? 55) * DEG2RAD;

        // Fixed isometric offset
        const dist = height / Math.tan(angle);
        this._targetPos.set(
            pos.x,
            pos.y + height,
            pos.z + dist,
        );

        this._lerpTo(delta);
        this.camera.lookAt(pos.x, pos.y, pos.z);
    }

    // ── FPS ───────────────────────────────────────────────────────────────────

    _updateFPS(delta, cfg) {
        const target = cfg.target;
        if (!target) return;

        const eyeOffset = cfg.eyeOffset ?? new THREE.Vector3(0, 1.7, 0);
        this._targetPos.copy(target.position).add(eyeOffset);

        // Snap position (no lerp in FPS — feels laggy)
        this.camera.position.copy(this._targetPos);

        // Apply yaw/pitch directly
        this._euler.set(this._pitch, this._yaw, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(this._euler);
    }

    // ── THIRD_PERSON ─────────────────────────────────────────────────────────

    _updateThirdPerson(delta, cfg) {
        const target = cfg.target;
        if (!target) return;

        const distance = cfg.distance ?? this._orbitDistance;
        const offset   = cfg.offset   ?? new THREE.Vector3(0, 1.5, 0);

        // Camera orbits around target with yaw/pitch
        const sinYaw   = Math.sin(this._yaw);
        const cosYaw   = Math.cos(this._yaw);
        const sinPitch = Math.sin(this._pitch);
        const cosPitch = Math.cos(this._pitch);

        const pivot = _vec3().copy(target.position).add(offset);

        this._targetPos.set(
            pivot.x + distance * cosPitch * sinYaw,
            pivot.y + distance * sinPitch,
            pivot.z + distance * cosPitch * cosYaw,
        );

        // Collision avoidance: pull camera closer if geometry blocks LOS
        this._targetPos.copy(
            this._avoidCollision(pivot, this._targetPos)
        );

        this._lerpTo(delta);
        this.camera.lookAt(pivot);
    }

    // ── ORBIT ─────────────────────────────────────────────────────────────────

    _updateOrbit(delta, cfg) {
        const center = cfg.target
            ? (cfg.target.position ?? cfg.target)
            : new THREE.Vector3();

        // Zoom via scroll wheel
        this._orbitDistance = THREE.MathUtils.clamp(
            this._orbitDistance - this._zoomDelta * 0.5,
            this._orbitDistMin,
            this._orbitDistMax,
        );
        this._zoomDelta = 0;

        // Orbit angles (theta=horizontal, phi=vertical)
        const sinPhi = Math.sin(this._orbitPhi);
        const cosPhi = Math.cos(this._orbitPhi);
        const r      = this._orbitDistance;

        this._targetPos.set(
            center.x + r * sinPhi * Math.sin(this._orbitTheta),
            center.y + r * cosPhi,
            center.z + r * sinPhi * Math.cos(this._orbitTheta),
        );

        this._lerpTo(delta);
        this.camera.lookAt(center.x, center.y, center.z);
    }

    // ── CINEMATIC ─────────────────────────────────────────────────────────────

    _updateCinematic(delta, cfg) {
        if (!this._cinematicPath) return;

        this._cinematicT = Math.min(1, this._cinematicT + delta * this._cinematicSpeed);
        const pt = this._cinematicPath.getPoint(this._cinematicT);
        this._targetPos.copy(pt);
        this._lerpTo(delta);

        if (cfg.lookAt) {
            const look = cfg.lookAt.isVector3 ? cfg.lookAt : cfg.lookAt.position;
            this.camera.lookAt(look);
        } else {
            // Look along path tangent
            const tangent = this._cinematicPath.getTangent(this._cinematicT);
            _tmpVec3.copy(pt).add(tangent);
            this.camera.lookAt(_tmpVec3);
        }
    }

    // ── Mouse look ────────────────────────────────────────────────────────────

    _applyMouseLook(delta) {
        if (this._mode === CameraMode.FPS || this._mode === CameraMode.THIRD_PERSON) {
            this._yaw   -= this._mouseDeltaX * this._mouseSensitivity;
            this._pitch -= this._mouseDeltaY * this._mouseSensitivity;
            this._pitch  = THREE.MathUtils.clamp(this._pitch, this._pitchMin, this._pitchMax);
        } else if (this._mode === CameraMode.ORBIT) {
            this._orbitTheta -= this._mouseDeltaX * this._mouseSensitivity;
            this._orbitPhi    = THREE.MathUtils.clamp(
                this._orbitPhi - this._mouseDeltaY * this._mouseSensitivity,
                5 * DEG2RAD, 85 * DEG2RAD,
            );
        }

        // Bridge: also apply zoom from 2D InputHandler joystick vertical (optional)
        if (this._inputHandler) {
            const axis = this._inputHandler.getAxis?.();
            if (axis && this._mode === CameraMode.ORBIT) {
                this._orbitDistance = THREE.MathUtils.clamp(
                    this._orbitDistance - axis.y * delta * 6,
                    this._orbitDistMin,
                    this._orbitDistMax,
                );
            }
        }
    }

    _consumeMouseDelta() {
        this._mouseDeltaX = 0;
        this._mouseDeltaY = 0;
    }

    // ── Trauma shake ─────────────────────────────────────────────────────────

    _applyShake(delta) {
        this._trauma = Math.max(0, this._trauma - SHAKE_DECAY * delta);
        if (this._trauma <= 0) return;

        const shake = this._trauma * this._trauma;  // square for more natural feel
        const t     = performance.now() * 0.001 + this._noiseSeed;

        // Pseudo-noise via sinusoidal with incommensurate frequencies
        this._shakeOffset.set(
            _noise(t * 37.1)  * shake * SHAKE_MAX_POS,
            _noise(t * 53.7)  * shake * SHAKE_MAX_POS,
            _noise(t * 71.3)  * shake * SHAKE_MAX_POS,
        );
        this._shakeRotation.set(
            _noise(t * 43.9)  * shake * SHAKE_MAX_ROT * DEG2RAD,
            _noise(t * 67.3)  * shake * SHAKE_MAX_ROT * DEG2RAD,
            _noise(t * 89.1)  * shake * SHAKE_MAX_ROT * DEG2RAD,
        );

        this.camera.position.add(this._shakeOffset);
        this.camera.rotation.x += this._shakeRotation.x;
        this.camera.rotation.y += this._shakeRotation.y;
        this.camera.rotation.z += this._shakeRotation.z;
    }

    // ── Collision avoidance ───────────────────────────────────────────────────

    /**
     * Sphere-cast from pivot toward desired camera position.
     * Returns a position that won't clip through registered collision geometry.
     * @param {THREE.Vector3} pivot    Origin (e.g. player head)
     * @param {THREE.Vector3} desired  Unconstrained camera world position
     * @returns {THREE.Vector3}
     */
    _avoidCollision(pivot, desired) {
        if (this._collisionLayers.length === 0) return desired;

        const dir = _vec3().subVectors(desired, pivot);
        const dist = dir.length();
        if (dist < 0.001) return desired;

        this._raycaster.set(pivot, dir.normalize());
        this._raycaster.far = dist;

        const hits = this._raycaster.intersectObjects(this._collisionLayers, true);
        if (hits.length === 0) return desired;

        // Pull camera to just in front of the hit surface
        const safe = hits[0].distance - 0.2;
        return _vec3().copy(pivot).addScaledVector(dir, Math.max(0, safe));
    }

    // ── Lerp helpers ─────────────────────────────────────────────────────────

    /** Exponential lerp camera position toward _targetPos */
    _lerpTo(delta) {
        const t = 1 - Math.exp(-LERP_POSITION * delta);
        this.camera.position.lerp(this._targetPos, t);
    }

    /** Exponential slerp camera quaternion toward _targetQuat (used by cinematic) */
    _slerpTo(delta) {
        const t = 1 - Math.exp(-LERP_ROTATION * delta);
        this.camera.quaternion.slerp(this._targetQuat, t);
    }

    // ── Listeners ────────────────────────────────────────────────────────────

    _attachListeners() {
        document.addEventListener('mousemove',        this._boundOnMouseMove);
        document.addEventListener('pointerlockchange', this._boundOnLockChange);
        this.domElement.addEventListener('wheel',     this._boundOnWheel, { passive: true });
    }

    _detachListeners() {
        document.removeEventListener('mousemove',        this._boundOnMouseMove);
        document.removeEventListener('pointerlockchange', this._boundOnLockChange);
        this.domElement.removeEventListener('wheel',     this._boundOnWheel);
    }

    _onMouseMove(e) {
        if (this._mode === CameraMode.FPS && this._pointerLocked) {
            this._mouseDeltaX += e.movementX;
            this._mouseDeltaY += e.movementY;
        } else if (
            this._mode === CameraMode.THIRD_PERSON ||
            this._mode === CameraMode.ORBIT
        ) {
            // Allow drag without pointer lock for orbit/third-person
            if (e.buttons & 1) {
                this._mouseDeltaX += e.movementX;
                this._mouseDeltaY += e.movementY;
            }
        }
    }

    _onWheel(e) {
        this._zoomDelta += e.deltaY * 0.01;
    }

    _onLockChange() {
        this._pointerLocked = document.pointerLockElement === this.domElement;
    }
}

// ── Private helpers ───────────────────────────────────────────────────────────

// Reusable Vector3 to avoid GC pressure in hot paths
const _reusable = new THREE.Vector3();
const _tmpVec3  = new THREE.Vector3();
function _vec3() { return _reusable.set(0, 0, 0); }

/**
 * Fast pseudo-noise via sin (deterministic, cheap, good enough for shake).
 * Returns value in [-1, 1].
 */
function _noise(t) {
    return Math.sin(t * 127.1) * 43758.5453 % 1 * 2 - 1;
}

// ── Export ────────────────────────────────────────────────────────────────────

export default Camera3DController;
