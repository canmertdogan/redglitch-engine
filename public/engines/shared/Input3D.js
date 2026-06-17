/**
 * Input3D.js — Unified 3D input handler for all 3D engines.
 *
 * Features:
 *  - Configurable action mapping (key→action JSON, hot-swappable per project)
 *  - Keyboard: full key-state tracking via Set
 *  - Mouse: delta accumulation (smooth look), Pointer Lock API wrapper
 *  - Gamepad API: analog sticks + buttons (polling each frame)
 *  - Touch: virtual analog stick + action buttons (mirrors existing InputHandler pattern)
 *  - 3D-specific default actions: moveForward/Back/Left/Right, jump, crouch, sprint,
 *    interact, fire, aimZoom, lookX/Y axes
 *
 * Usage (ES module):
 *
 *   import Input3D, { DEFAULT_ACTION_MAP } from '/engines/shared/Input3D.js';
 *
 *   const input = new Input3D(canvasEl);
 *   input.loadActionMap(myProjectActionMap);   // optional override
 *
 *   // per frame (before game logic):
 *   input.update();
 *
 *   if (input.isAction('jump'))      { ... }
 *   const move = input.getAxis();    // { x, y } normalised movement
 *   const look = input.getLookAxis();// { x, y } raw mouse/stick delta
 *
 *   // cleanup:
 *   input.dispose();
 */

// ── Default action map ────────────────────────────────────────────────────────

/**
 * Default key→action bindings.
 * Each action maps to an array of KeyboardEvent.code strings OR special tokens:
 *   'Mouse0'  = primary mouse button
 *   'Mouse1'  = secondary mouse button
 *   'Mouse2'  = middle mouse button
 *   'GP_A'    = gamepad button 0 (A / Cross)
 *   'GP_B'    = gamepad button 1 (B / Circle)
 *   'GP_X'    = gamepad button 2 (X / Square)
 *   'GP_Y'    = gamepad button 3 (Y / Triangle)
 *   'GP_LB'   = gamepad button 4 (left bumper)
 *   'GP_RB'   = gamepad button 5 (right bumper)
 *   'GP_LT'   = gamepad button 6 (left trigger, analog)
 *   'GP_RT'   = gamepad button 7 (right trigger, analog)
 *   'GP_START'= gamepad button 9
 */
export const DEFAULT_ACTION_MAP = {
    moveForward:  ['KeyW', 'ArrowUp'],
    moveBackward: ['KeyS', 'ArrowDown'],
    moveLeft:     ['KeyA', 'ArrowLeft'],
    moveRight:    ['KeyD', 'ArrowRight'],
    jump:         ['Space', 'GP_A'],
    crouch:       ['ControlLeft', 'ControlRight', 'KeyC', 'GP_B'],
    sprint:       ['ShiftLeft',   'ShiftRight',   'GP_LB'],
    interact:     ['KeyE', 'GP_X'],
    fire:         ['Mouse0', 'GP_RT'],
    attack:       ['Mouse0', 'GP_RT'],
    aimZoom:      ['Mouse1', 'GP_LT'],
    aim:          ['Mouse1', 'GP_LT'],
    zoom:         ['Mouse1', 'GP_LT'],
    pause:        ['Escape', 'GP_START'],
    inventory:    ['KeyI', 'Tab'],
};

// Gamepad analog stick indices (standard mapping)
const GP_AXIS = {
    MOVE_X:  0,  // left stick horizontal
    MOVE_Y:  1,  // left stick vertical
    LOOK_X:  2,  // right stick horizontal
    LOOK_Y:  3,  // right stick vertical
};

const GP_BUTTON = {
    A: 0, B: 1, X: 2, Y: 3,
    LB: 4, RB: 5, LT: 6, RT: 7,
    SELECT: 8, START: 9,
};

const DEAD_ZONE   = 0.12;  // ignore analog inputs below this magnitude
const LOOK_SCALE  = 6.0;   // gamepad right-stick look sensitivity multiplier

// ── Input3D ───────────────────────────────────────────────────────────────────

class Input3D {
    /**
     * @param {HTMLElement}  domElement  Canvas/container for pointer lock & touch
     * @param {object}       [options]
     * @param {boolean}      [options.enableTouch=true]
     * @param {boolean}      [options.enableGamepad=true]
     */
    constructor(domElement, options = {}) {
        this.domElement = domElement;

        this._enableTouch   = options.enableTouch   !== false;
        this._enableGamepad = options.enableGamepad !== false;

        // ── Action map ────────────────────────────────────────────────────────
        /** @type {Record<string, string[]>}  action → bound codes */
        this._actionMap = { ...DEFAULT_ACTION_MAP };

        // ── Keyboard state ────────────────────────────────────────────────────
        /** Currently held keyboard codes */
        this._keys = new Set();

        // ── Mouse state ───────────────────────────────────────────────────────
        this._mouseButtons   = new Set();  // 0=left,1=right,2=middle
        this._mouseDeltaX    = 0;
        this._mouseDeltaY    = 0;
        this._mouseScrollY   = 0;
        this._pointerLocked  = false;

        // ── Gamepad state (polled each frame) ─────────────────────────────────
        this._gamepadAxes    = [0, 0, 0, 0];
        this._gamepadButtons = new Set();

        // ── Touch / virtual joystick ──────────────────────────────────────────
        this._touch = {
            joystick: { x: 0, y: 0, active: false },
            look:     { x: 0, y: 0, active: false },
            actions:  new Set(),   // active touch-button action names
        };
        this._touchLookId  = null;  // touch identifier for right-side look swipe
        this._touchMoveId  = null;  // touch identifier for joystick finger

        // ── Frame-consumed look delta ─────────────────────────────────────────
        /** Accumulated this frame; consumed by getLookAxis() */
        this._lookDeltaX = 0;
        this._lookDeltaY = 0;

        // ── Mobile detection (mirrors existing InputHandler) ──────────────────
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
            .test(navigator.userAgent) ||
            (navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform));

        // ── Bound handlers (for removal) ──────────────────────────────────────
        this._onKeyDown     = this._handleKeyDown.bind(this);
        this._onKeyUp       = this._handleKeyUp.bind(this);
        this._onMouseMove   = this._handleMouseMove.bind(this);
        this._onMouseDown   = this._handleMouseDown.bind(this);
        this._onMouseUp     = this._handleMouseUp.bind(this);
        this._onWheel       = this._handleWheel.bind(this);
        this._onLockChange  = this._handleLockChange.bind(this);
        this._onContextMenu = (e) => e.preventDefault();
        this._listenersAttached = false;
        this._touchAttached = false;

        this.attach();
    }

    // ── Action map API ────────────────────────────────────────────────────────

    /**
     * Replace (or merge) the action map.
     * @param {object}  map         action → code[] object
     * @param {boolean} [merge=true] true=merge with defaults, false=replace entirely
     */
    async loadActionMap(map, merge = true) {
        if (typeof map === 'string') {
            return this.loadActionMapFromURL(map);
        }

        this._actionMap = merge ? { ...DEFAULT_ACTION_MAP, ...map } : { ...map };
        console.log('[Input3D] action map loaded:', Object.keys(this._actionMap).length, 'actions');
        return this._actionMap;
    }

    /**
     * Fetch and apply an action map JSON from a URL.
     * @param {string} url
     */
    async loadActionMapFromURL(url) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return this.loadActionMap(await res.json());
        } catch (err) {
            console.warn('[Input3D] failed to load action map:', err.message);
        }
    }

    // ── Legacy lifecycle compatibility (older 3D engines call init/attach/detach) ─

    async init() {
        this.attach();
        return this;
    }

    attach() {
        if (!this._listenersAttached) {
            this._attachListeners();
            this._listenersAttached = true;
        }
        if (this._enableTouch && this.isMobile && !this._touchAttached) {
            this._attachTouchListeners();
            this._touchAttached = true;
        }
    }

    detach() {
        if (!this._listenersAttached) return;
        this._detachListeners();
        this._listenersAttached = false;
    }

    // ── Per-frame update (call before game logic) ─────────────────────────────

    /**
     * Poll gamepad and accumulate look deltas.
     * Must be called once per frame.
     */
    update() {
        if (this._enableGamepad) this._pollGamepad();
        // Look deltas are consumed by getLookAxis() — no extra work needed
    }

    // ── Query API ─────────────────────────────────────────────────────────────

    /** Is the named action currently active (key held, button held, or touch active)? */
    isAction(action) {
        return this.isActionHeld(action);
    }

    /** Alias for isAction to match some engine patterns */
    isActionHeld(action) {
        const codes = this._actionMap[action];
        if (!codes) return false;

        for (const code of codes) {
            if (code.startsWith('Mouse')) {
                const btn = parseInt(code[5]);
                if (this._mouseButtons.has(btn)) return true;
            } else if (code.startsWith('GP_')) {
                if (this._gamepadButtons.has(code)) return true;
            } else {
                if (this._keys.has(code)) return true;
            }
        }

        // Touch action buttons
        if (this._touch.actions.has(action)) return true;

        return false;
    }

    /** Is a raw keyboard code currently held? */
    isKeyHeld(code) {
        return this._keys.has(code);
    }

    /** WASD / left-stick normalised movement axis. */
    getAxis() {
        // Gamepad left stick takes priority if active
        const gx = this._dead(this._gamepadAxes[GP_AXIS.MOVE_X]);
        const gy = this._dead(this._gamepadAxes[GP_AXIS.MOVE_Y]);
        if (Math.abs(gx) > 0 || Math.abs(gy) > 0) return { x: gx, y: gy };

        // Touch joystick
        if (this._touch.joystick.active) {
            return { x: this._touch.joystick.x, y: this._touch.joystick.y };
        }

        // Keyboard
        let x = 0, y = 0;
        if (this.isAction('moveLeft'))     x -= 1;
        if (this.isAction('moveRight'))    x += 1;
        if (this.isAction('moveForward'))  y -= 1;
        if (this.isAction('moveBackward')) y += 1;
        return { x, y };
    }

    /**
     * Mouse / right-stick look delta consumed this frame.
     * Returns accumulated delta since last call then resets to zero.
     * @returns {{ x: number, y: number }}
     */
    getLookAxis() {
        // Gamepad right stick
        const rx = this._dead(this._gamepadAxes[GP_AXIS.LOOK_X]) * LOOK_SCALE;
        const ry = this._dead(this._gamepadAxes[GP_AXIS.LOOK_Y]) * LOOK_SCALE;

        // Touch look swipe
        const tx = this._touch.look.x;
        const ty = this._touch.look.y;

        const x = this._lookDeltaX + rx + tx;
        const y = this._lookDeltaY + ry + ty;

        // Consume
        this._lookDeltaX = 0;
        this._lookDeltaY = 0;
        this._touch.look.x = 0;
        this._touch.look.y = 0;

        return { x, y };
    }

    /**
     * Scroll wheel delta (positive = scroll down).
     * Consumed on read.
     * @returns {number}
     */
    getScrollDelta() {
        const v = this._mouseScrollY;
        this._mouseScrollY = 0;
        return v;
    }

    /** Is the pointer currently locked to this element? */
    get pointerLocked() { return this._pointerLocked; }

    // ── Pointer Lock ──────────────────────────────────────────────────────────

    requestPointerLock() {
        this.domElement.requestPointerLock?.()?.catch?.(() => {});
    }

    releasePointerLock() {
        if (this._pointerLocked) document.exitPointerLock?.();
    }

    // ── Virtual joystick (mobile) ─────────────────────────────────────────────

    /**
     * Attach an on-screen joystick zone element for move input.
     * Mirrors the existing InputHandler virtual-joystick pattern.
     * @param {HTMLElement} zoneEl    Touch-sensitive zone
     * @param {HTMLElement} stickEl   Visual knob (optional)
     * @param {number}      [radius=40]
     */
    attachMoveJoystick(zoneEl, stickEl, radius = 40) {
        const update = (touch) => {
            const rect = zoneEl.getBoundingClientRect();
            const cx = rect.left + rect.width  / 2;
            const cy = rect.top  + rect.height / 2;
            let dx = touch.clientX - cx;
            let dy = touch.clientY - cy;
            const dist = Math.hypot(dx, dy);
            if (dist > radius) { const r = radius / dist; dx *= r; dy *= r; }
            this._touch.joystick.x = dx / radius;
            this._touch.joystick.y = dy / radius;
            this._touch.joystick.active = true;
            if (stickEl) stickEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        };
        const reset = () => {
            this._touch.joystick = { x: 0, y: 0, active: false };
            if (stickEl) { stickEl.style.transition = 'transform 0.1s'; stickEl.style.transform = 'translate(-50%,-50%)'; setTimeout(() => { stickEl.style.transition = 'none'; }, 110); }
        };
        zoneEl.addEventListener('touchstart',  e => { e.preventDefault(); this._touchMoveId = e.changedTouches[0].identifier; update(e.changedTouches[0]); }, { passive: false });
        zoneEl.addEventListener('touchmove',   e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === this._touchMoveId) update(t); }, { passive: false });
        zoneEl.addEventListener('touchend',    e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === this._touchMoveId) { reset(); this._touchMoveId = null; } }, { passive: false });
        zoneEl.addEventListener('touchcancel', e => { reset(); this._touchMoveId = null; }, { passive: false });
    }

    /**
     * Attach a right-side swipe zone for look input (third-person / FPS).
     * @param {HTMLElement} zoneEl
     * @param {number}      [sensitivity=0.3]
     */
    attachLookZone(zoneEl, sensitivity = 0.3) {
        let lastX = 0, lastY = 0;
        zoneEl.addEventListener('touchstart',  e => { e.preventDefault(); const t = e.changedTouches[0]; this._touchLookId = t.identifier; lastX = t.clientX; lastY = t.clientY; this._touch.look.active = true; }, { passive: false });
        zoneEl.addEventListener('touchmove',   e => {
            e.preventDefault();
            for (const t of e.changedTouches) {
                if (t.identifier !== this._touchLookId) continue;
                this._touch.look.x += (t.clientX - lastX) * sensitivity;
                this._touch.look.y += (t.clientY - lastY) * sensitivity;
                lastX = t.clientX; lastY = t.clientY;
            }
        }, { passive: false });
        zoneEl.addEventListener('touchend',    e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === this._touchLookId) { this._touchLookId = null; this._touch.look.active = false; } }, { passive: false });
        zoneEl.addEventListener('touchcancel', e => { this._touchLookId = null; this._touch.look.active = false; }, { passive: false });
    }

    /**
     * Bind a touch button element to a named action.
     * @param {HTMLElement} el
     * @param {string}      action  e.g. 'jump'
     */
    attachTouchButton(el, action) {
        el.addEventListener('touchstart',  e => { e.preventDefault(); this._touch.actions.add(action);    el.classList.add('active');    }, { passive: false });
        el.addEventListener('touchend',    e => { e.preventDefault(); this._touch.actions.delete(action); el.classList.remove('active'); }, { passive: false });
        el.addEventListener('touchcancel', e => { this._touch.actions.delete(action); el.classList.remove('active'); }, { passive: false });
    }

    // ── Dispose ───────────────────────────────────────────────────────────────

    dispose() {
        this.detach();
        if (this._pointerLocked) document.exitPointerLock?.();
        this._keys.clear();
        this._mouseButtons.clear();
        this._gamepadButtons.clear();
        this._touch.actions.clear();
    }

    // ── Private: keyboard ─────────────────────────────────────────────────────

    _handleKeyDown(e) {
        this._keys.add(e.code);
        // Prevent default for game keys to avoid page scroll / browser shortcuts
        if (_PREVENT_DEFAULT_CODES.has(e.code)) e.preventDefault();
    }

    _handleKeyUp(e) {
        this._keys.delete(e.code);
    }

    // ── Private: mouse ────────────────────────────────────────────────────────

    _handleMouseMove(e) {
        this._lookDeltaX += e.movementX;
        this._lookDeltaY += e.movementY;
    }

    _handleMouseDown(e) {
        this._mouseButtons.add(e.button);
    }

    _handleMouseUp(e) {
        this._mouseButtons.delete(e.button);
    }

    _handleWheel(e) {
        this._mouseScrollY += e.deltaY;
    }

    _handleLockChange() {
        this._pointerLocked = document.pointerLockElement === this.domElement;
        if (!this._pointerLocked) {
            // Clear look delta on unlock to avoid a lurching frame
            this._lookDeltaX = 0;
            this._lookDeltaY = 0;
        }
    }

    // ── Private: gamepad ──────────────────────────────────────────────────────

    _pollGamepad() {
        const pads = navigator.getGamepads?.();
        if (!pads) return;

        for (const pad of pads) {
            if (!pad || !pad.connected) continue;

            // Axes
            for (let i = 0; i < 4; i++) {
                this._gamepadAxes[i] = pad.axes[i] ?? 0;
            }

            // Buttons → named tokens
            this._gamepadButtons.clear();
            const btnMap = ['GP_A','GP_B','GP_X','GP_Y','GP_LB','GP_RB','GP_LT','GP_RT','GP_SELECT','GP_START'];
            for (let i = 0; i < btnMap.length; i++) {
                if (pad.buttons[i]?.pressed) this._gamepadButtons.add(btnMap[i]);
            }

            break; // Use first connected gamepad only
        }
    }

    // ── Private: touch defaults ───────────────────────────────────────────────

    _attachTouchListeners() {
        // Auto-bind any touch buttons/zones already in DOM using data attributes:
        //   data-3d-action="jump"   → attachTouchButton
        //   data-3d-move-zone       → attachMoveJoystick
        //   data-3d-look-zone       → attachLookZone
        document.querySelectorAll('[data-3d-action]').forEach(el => {
            this.attachTouchButton(el, el.dataset['3dAction'] || el.dataset.action3d);
        });
        const moveZone = document.querySelector('[data-3d-move-zone]');
        if (moveZone) {
            const stick = document.querySelector('[data-3d-move-stick]');
            this.attachMoveJoystick(moveZone, stick);
        }
        const lookZone = document.querySelector('[data-3d-look-zone]');
        if (lookZone) this.attachLookZone(lookZone);
    }

    // ── Private: listener management ─────────────────────────────────────────

    _attachListeners() {
        window.addEventListener('keydown',           this._onKeyDown);
        window.addEventListener('keyup',             this._onKeyUp);
        document.addEventListener('mousemove',       this._onMouseMove);
        document.addEventListener('mousedown',       this._onMouseDown);
        document.addEventListener('mouseup',         this._onMouseUp);
        document.addEventListener('pointerlockchange', this._onLockChange);
        this.domElement.addEventListener('wheel',    this._onWheel, { passive: true });
        this.domElement.addEventListener('contextmenu', this._onContextMenu);
    }

    _detachListeners() {
        window.removeEventListener('keydown',        this._onKeyDown);
        window.removeEventListener('keyup',          this._onKeyUp);
        document.removeEventListener('mousemove',    this._onMouseMove);
        document.removeEventListener('mousedown',    this._onMouseDown);
        document.removeEventListener('mouseup',      this._onMouseUp);
        document.removeEventListener('pointerlockchange', this._onLockChange);
        this.domElement.removeEventListener('wheel', this._onWheel);
        this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    }

    // ── Private: helpers ──────────────────────────────────────────────────────

    _dead(v) { return Math.abs(v) > DEAD_ZONE ? v : 0; }
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Key codes whose default browser behaviour should be suppressed in-game */
const _PREVENT_DEFAULT_CODES = new Set([
    'Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
    'Tab','ControlLeft','ControlRight',
]);

// ── Export ────────────────────────────────────────────────────────────────────

export default Input3D;
