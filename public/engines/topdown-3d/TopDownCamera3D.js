/**
 * TopDownCamera3D.js — LoL-style fixed isometric camera for the Topdown-3D engine.
 *
 * Features:
 *  - Fixed 55° pitch (configurable), yaw rotates in 45° snaps (Q/E keys)
 *    with optional free-rotation mode (hold Alt + drag)
 *  - Smooth pan: camera tracks weighted centroid of selected units (lerp)
 *  - Edge-scroll: mouse within EDGE_PX pixels of viewport edge pans camera
 *  - Middle-mouse drag panning
 *  - Keyboard WASD / arrow key panning
 *  - Zoom: orthographic-style distance control with smooth lerp (scroll wheel)
 *  - Zoom bounds: [MIN_ZOOM … MAX_ZOOM] world units
 *  - Minimap click-to-pan: call panToWorld(x, z) externally
 *  - onResize(w, h): update aspect ratio
 *
 * This class wraps (and partially replaces) Camera3DController's TOPDOWN mode
 * for the topdown-3d engine. It directly manipulates a THREE.PerspectiveCamera.
 *
 * Usage:
 *   import TopDownCamera3D from './TopDownCamera3D.js';
 *   const cam = new TopDownCamera3D(threeCamera, container);
 *   cam.update(dt, selectionCentroid);   // call every frame
 *   cam.panToWorld(x, z);               // minimap click
 */

import * as THREE from '/lib/three/three.module.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEG2RAD    = Math.PI / 180;

// Pitch (vertical tilt) — 55° is classic LoL/Dota feel
const DEFAULT_PITCH = 55;         // degrees
const PITCH_MIN     = 20;
const PITCH_MAX     = 80;

// Yaw snapping
const YAW_SNAP_DEG  = 45;         // degrees per snap step
const YAW_SNAP_LERP = 10;         // snap lerp speed (per-second exponential)
const YAW_FREE_SENS = 0.005;      // radians per pixel in free-rotation mode

// Distance (zoom) — world units from focus point
const DEFAULT_ZOOM  = 24;
const MIN_ZOOM      = 6;
const MAX_ZOOM      = 80;
const ZOOM_SPEED    = 4;          // units per scroll notch
const ZOOM_LERP     = 8;          // zoom lerp speed

// Pan
const PAN_SPEED_KEY  = 18;        // world units/sec (keyboard)
const PAN_SPEED_EDGE = 14;        // world units/sec (edge-scroll)
const PAN_LERP       = 9;         // pan follow lerp speed
const EDGE_PX        = 24;        // pixels from edge that triggers edge-scroll
const DRAG_SENS      = 0.04;      // units per pixel (middle-mouse drag)

// Unit follow
const FOLLOW_WEIGHT  = 0.15;      // how strongly camera follows selection centroid (0=no follow, 1=snap)
const FOLLOW_LERP    = 5;         // lerp speed toward centroid

// ── TopDownCamera3D ───────────────────────────────────────────────────────────

export default class TopDownCamera3D {

    /**
     * @param {THREE.PerspectiveCamera} camera   The Three.js camera to control
     * @param {HTMLElement}             container Renderer DOM element (for mouse events)
     * @param {object}                  [opts]
     * @param {number}                  [opts.pitch=55]       Initial pitch in degrees
     * @param {number}                  [opts.yaw=0]          Initial yaw in degrees
     * @param {number}                  [opts.zoom=24]        Initial zoom (world units)
     * @param {boolean}                 [opts.edgeScroll=true]
     * @param {boolean}                 [opts.keyPan=true]
     * @param {boolean}                 [opts.freeRotation=false] Enable Alt+drag free yaw
     */
    constructor(camera, container, opts = {}) {
        /** @type {THREE.PerspectiveCamera} */
        this.camera    = camera;
        this.container = container;

        // ── Camera orientation (all in radians internally) ────────────────
        this._pitchDeg  = Math.max(PITCH_MIN, Math.min(PITCH_MAX, opts.pitch ?? DEFAULT_PITCH));
        this._yaw       = (opts.yaw ?? 0) * DEG2RAD;       // current yaw (lerped)
        this._yawTarget = this._yaw;                        // snapped yaw target

        // ── Zoom ──────────────────────────────────────────────────────────
        this._zoom       = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, opts.zoom ?? DEFAULT_ZOOM));
        this._zoomTarget = this._zoom;

        // ── Focus point (world XZ, Y=0 unless terrain sampled) ───────────
        this._focus       = new THREE.Vector3(0, 0, 0);   // current (lerped)
        this._focusTarget = new THREE.Vector3(0, 0, 0);   // desired

        // ── Viewport size ─────────────────────────────────────────────────
        this._vpW = container.clientWidth  || window.innerWidth;
        this._vpH = container.clientHeight || window.innerHeight;

        // ── Input state ───────────────────────────────────────────────────
        this._keys        = {};          // active key set
        this._mousePos    = { x: 0, y: 0 };
        this._midDragging = false;
        this._midDragStart= { x: 0, y: 0 };
        this._midDragFocus= new THREE.Vector3();
        this._freeRotating= false;       // Alt + left-drag
        this._freeRotStart= { x: 0 };

        // ── Config ────────────────────────────────────────────────────────
        this.edgeScroll   = opts.edgeScroll   !== false;
        this.keyPan       = opts.keyPan       !== false;
        this.freeRotation = opts.freeRotation ?? false;

        // ── Working vectors ───────────────────────────────────────────────
        this._panDir   = new THREE.Vector3();
        this._right    = new THREE.Vector3();
        this._forward  = new THREE.Vector3();   // camera's XZ-projected forward
        this._camPos   = new THREE.Vector3();

        this._attached = false;
        this._attach();

        // Place camera immediately (no lerp on first frame)
        this._applyCamera(true);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * update(dt, selectionCentroid) — call every frame.
     * @param {number}           dt  Delta time in seconds
     * @param {THREE.Vector3|null} selectionCentroid  Centroid of selected units
     */
    update(dt, selectionCentroid) {
        this._handleKeyPan(dt);
        this._handleEdgeScroll(dt);
        this._handleMidDragDelta();

        // Gently pull focus toward selection centroid
        if (selectionCentroid) {
            this._focusTarget.lerp(selectionCentroid, FOLLOW_WEIGHT);
        }

        // Lerp current focus toward target
        const focusAlpha = 1 - Math.exp(-FOLLOW_LERP * dt);
        this._focus.lerp(this._focusTarget, focusAlpha);

        // Lerp zoom
        const zoomAlpha = 1 - Math.exp(-ZOOM_LERP * dt);
        this._zoom += (this._zoomTarget - this._zoom) * zoomAlpha;

        // Lerp yaw (snap)
        const yawAlpha = 1 - Math.exp(-YAW_SNAP_LERP * dt);
        this._yaw += (_angleDiff(this._yawTarget, this._yaw)) * yawAlpha;

        this._applyCamera(false);
    }

    /**
     * panToWorld(x, z) — instantly move focus target (minimap click, etc.)
     */
    panToWorld(x, z) {
        this._focusTarget.set(x, this._focusTarget.y, z);
    }

    /**
     * snapYaw(steps) — rotate yaw by N × 45°. Positive = clockwise.
     * @param {number} steps Integer number of 45° steps
     */
    snapYaw(steps) {
        this._yawTarget += steps * YAW_SNAP_DEG * DEG2RAD;
    }

    /**
     * setYaw(degrees) — set absolute yaw (snapped to nearest 45° unless freeRotation).
     */
    setYaw(degrees) {
        if (this.freeRotation) {
            this._yawTarget = degrees * DEG2RAD;
        } else {
            const snapped = Math.round(degrees / YAW_SNAP_DEG) * YAW_SNAP_DEG;
            this._yawTarget = snapped * DEG2RAD;
        }
    }

    /**
     * setPitch(degrees) — set vertical tilt [PITCH_MIN … PITCH_MAX].
     */
    setPitch(degrees) {
        this._pitchDeg = Math.max(PITCH_MIN, Math.min(PITCH_MAX, degrees));
    }

    /**
     * setZoom(worldUnits) — set target zoom distance.
     */
    setZoom(worldUnits) {
        this._zoomTarget = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, worldUnits));
    }

    /**
     * zoomBy(delta) — relative zoom (+ve = zoom out, -ve = zoom in).
     */
    zoomBy(delta) {
        this.setZoom(this._zoomTarget + delta);
    }

    /**
     * onResize(w, h) — call when the viewport size changes.
     */
    onResize(w, h) {
        this._vpW = w;
        this._vpH = h;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    /**
     * dispose() — detach all event listeners.
     */
    dispose() {
        this._detach();
    }

    // ── Camera positioning ────────────────────────────────────────────────────

    _applyCamera(immediate) {
        const pitch  = this._pitchDeg * DEG2RAD;
        const yaw    = this._yaw;
        const dist   = this._zoom;

        // Compute camera offset from focus using pitch + yaw
        // Pitch = elevation angle from horizontal
        // In THREE.js: +Y is up, camera looks DOWN at -pitch from horizontal
        const cosP = Math.cos(pitch);
        const sinP = Math.sin(pitch);
        const cosY = Math.cos(yaw);
        const sinY = Math.sin(yaw);

        // Offset: camera is behind-and-above the focus point
        // "forward" in world space given yaw
        const offsetX = -sinY * cosP * dist;
        const offsetY =  sinP         * dist;
        const offsetZ =  cosY * cosP  * dist;

        const fx = this._focus.x;
        const fy = this._focus.y;
        const fz = this._focus.z;

        if (immediate) {
            this.camera.position.set(fx + offsetX, fy + offsetY, fz + offsetZ);
        } else {
            this._camPos.set(fx + offsetX, fy + offsetY, fz + offsetZ);
            this.camera.position.copy(this._camPos);
        }

        this.camera.lookAt(fx, fy, fz);
        this.camera.updateProjectionMatrix();
    }

    // ── Pan helpers ───────────────────────────────────────────────────────────

    /**
     * Compute camera-relative XZ pan axes from current yaw.
     */
    _computePanAxes() {
        const cosY = Math.cos(this._yaw);
        const sinY = Math.sin(this._yaw);
        // Forward = camera's XZ projection of look direction
        this._forward.set(-sinY, 0, cosY).normalize();
        // Right = perpendicular on XZ plane
        this._right.set(cosY, 0, sinY).normalize();
    }

    _pan(dx, dz) {
        this._focusTarget.x += dx;
        this._focusTarget.z += dz;
    }

    // ── Keyboard pan ─────────────────────────────────────────────────────────

    _handleKeyPan(dt) {
        if (!this.keyPan) return;
        const k   = this._keys;
        const spd = PAN_SPEED_KEY * dt;

        const fwd = (k['w'] || k['arrowup'])    ? 1 : (k['s'] || k['arrowdown'])  ? -1 : 0;
        const rgt = (k['d'] || k['arrowright'])  ? 1 : (k['a'] || k['arrowleft']) ? -1 : 0;
        const rotL = k['q'] ? -1 : 0;
        const rotR = k['e'] ?  1 : 0;

        if (fwd !== 0 || rgt !== 0) {
            this._computePanAxes();
            this._pan(
                (this._forward.x * fwd + this._right.x * rgt) * spd,
                (this._forward.z * fwd + this._right.z * rgt) * spd,
            );
        }

        // Q/E snap yaw (fire once per key press, tracked in _keySnapped)
        if ((rotL || rotR) && !this._rotKeyHeld) {
            this.snapYaw(rotL + rotR);
            this._rotKeyHeld = true;
        }
        if (!k['q'] && !k['e']) this._rotKeyHeld = false;
    }

    // ── Edge-scroll ───────────────────────────────────────────────────────────

    _handleEdgeScroll(dt) {
        if (!this.edgeScroll) return;
        const mx = this._mousePos.x;
        const my = this._mousePos.y;
        const w  = this._vpW;
        const h  = this._vpH;
        const spd= PAN_SPEED_EDGE * dt;

        let dx = 0, dz = 0;
        this._computePanAxes();

        if (mx <= EDGE_PX)    { dx -= this._right.x * spd;   dz -= this._right.z * spd;   }
        if (mx >= w - EDGE_PX){ dx += this._right.x * spd;   dz += this._right.z * spd;   }
        if (my <= EDGE_PX)    { dx += this._forward.x * spd; dz += this._forward.z * spd; }
        if (my >= h - EDGE_PX){ dx -= this._forward.x * spd; dz -= this._forward.z * spd; }

        if (dx !== 0 || dz !== 0) this._pan(dx, dz);
    }

    // ── Middle-mouse drag ─────────────────────────────────────────────────────

    _handleMidDragDelta() {
        if (!this._midDragging) return;
        // Delta applied in _onMouseMove to avoid double-counting
    }

    // ── Event attachment ──────────────────────────────────────────────────────

    _attach() {
        if (this._attached) return;
        this._attached = true;

        const el = this.container;

        this._onKeyDown   = e => { this._keys[e.key.toLowerCase()] = true; };
        this._onKeyUp     = e => { delete this._keys[e.key.toLowerCase()]; };
        this._onMouseMove = e => { this._handleMouseMove(e); };
        this._onMouseDown = e => { this._handleMouseDown(e); };
        this._onMouseUp   = e => { this._handleMouseUp(e);   };
        this._onWheel     = e => { this._handleWheel(e);     };
        this._onCtxMenu   = e => { e.preventDefault();       };

        window.addEventListener('keydown',  this._onKeyDown);
        window.addEventListener('keyup',    this._onKeyUp);
        el.addEventListener('mousemove',    this._onMouseMove);
        el.addEventListener('mousedown',    this._onMouseDown);
        window.addEventListener('mouseup',  this._onMouseUp);
        el.addEventListener('wheel',        this._onWheel,   { passive: true });
        el.addEventListener('contextmenu',  this._onCtxMenu);
    }

    _detach() {
        if (!this._attached) return;
        this._attached = false;
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup',   this._onKeyUp);
        this.container.removeEventListener('mousemove',   this._onMouseMove);
        this.container.removeEventListener('mousedown',   this._onMouseDown);
        window.removeEventListener('mouseup',  this._onMouseUp);
        this.container.removeEventListener('wheel',       this._onWheel);
        this.container.removeEventListener('contextmenu', this._onCtxMenu);
    }

    _handleMouseMove(e) {
        const rect = this.container.getBoundingClientRect();
        this._mousePos.x = e.clientX - rect.left;
        this._mousePos.y = e.clientY - rect.top;

        // Middle-mouse drag pan
        if (this._midDragging) {
            const dx = e.clientX - this._midDragStart.x;
            const dy = e.clientY - this._midDragStart.y;
            this._midDragStart.x = e.clientX;
            this._midDragStart.y = e.clientY;

            this._computePanAxes();
            // Horizontal pixel → pan along -right, vertical pixel → pan along forward
            this._pan(
                -this._right.x * dx * DRAG_SENS - this._forward.x * dy * DRAG_SENS,
                -this._right.z * dx * DRAG_SENS - this._forward.z * dy * DRAG_SENS,
            );
        }

        // Alt + left-drag free rotation
        if (this._freeRotating && this.freeRotation) {
            const dx = e.clientX - this._freeRotStart.x;
            this._freeRotStart.x = e.clientX;
            this._yawTarget += dx * YAW_FREE_SENS;
        }
    }

    _handleMouseDown(e) {
        if (e.button === 1) {  // middle
            e.preventDefault();
            this._midDragging  = true;
            this._midDragStart = { x: e.clientX, y: e.clientY };
            this._midDragFocus.copy(this._focus);
        }
        if (e.button === 0 && e.altKey && this.freeRotation) {
            this._freeRotating  = true;
            this._freeRotStart  = { x: e.clientX };
        }
    }

    _handleMouseUp(e) {
        if (e.button === 1) this._midDragging  = false;
        if (e.button === 0) this._freeRotating = false;
    }

    _handleWheel(e) {
        // deltaY > 0 = scroll down = zoom out (increase distance)
        const delta = e.deltaY * 0.01 * ZOOM_SPEED;
        this.setZoom(this._zoomTarget + delta);
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    /** Current focus point (world space) */
    get focusPoint()   { return this._focus.clone(); }

    /** Current zoom distance (world units) */
    get zoomDistance() { return this._zoom; }

    /** Current yaw in degrees */
    get yawDegrees()   { return this._yaw / DEG2RAD; }

    /** Current pitch in degrees */
    get pitchDegrees() { return this._pitchDeg; }

    /**
     * Serialise camera state for save/load.
     * @returns {{ focusX, focusZ, yaw, zoom, pitch }}
     */
    serialize() {
        return {
            focusX: this._focusTarget.x,
            focusZ: this._focusTarget.z,
            yaw:    this._yawTarget / DEG2RAD,
            zoom:   this._zoomTarget,
            pitch:  this._pitchDeg,
        };
    }

    /**
     * Restore camera state from save data.
     * @param {{ focusX, focusZ, yaw, zoom, pitch }} data
     */
    deserialize(data) {
        if (!data) return;
        if (data.focusX != null) this._focusTarget.x = data.focusX;
        if (data.focusZ != null) this._focusTarget.z = data.focusZ;
        if (data.yaw    != null) { this._yawTarget = data.yaw * DEG2RAD; this._yaw = this._yawTarget; }
        if (data.zoom   != null) { this._zoomTarget = data.zoom; this._zoom = data.zoom; }
        if (data.pitch  != null) this._pitchDeg = data.pitch;
        this._applyCamera(true);
    }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

/**
 * Shortest signed angular difference from `current` to `target` (radians).
 */
function _angleDiff(target, current) {
    let d = ((target - current) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    return d;
}
