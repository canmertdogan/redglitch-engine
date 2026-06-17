/**
 * PlatformerPhysics3D.js — Phase 44
 *
 * Platformer-specific physics layer wrapping Physics3DWorld (cannon-es).
 *
 * Responsibilities:
 *   - Variable gravity: normal, low-gravity zones, zero-gravity zones
 *   - Jump physics: variable height based on hold duration (input-buffered)
 *     Short tap = small hop; hold = full jump arc
 *   - Coyote time: 8-frame grace window after walking off a ledge
 *   - Jump buffering: 10-frame pre-landing queue — jump registered before
 *     touching ground still fires on landing
 *   - Terminal velocity cap
 *   - Bounce pads: registered trigger volumes; apply upward impulse force
 *   - Water volumes: buoyancy + reduced gravity + capped swim speed
 *
 * Design:
 *   The caller (CharacterController3D) owns the cannon-es DYNAMIC body.
 *   PlatformerPhysics3D acts as a modifier layer:
 *     - Reads body.velocity.y and the grounded flag from CharacterController3D
 *     - Overrides or accumulates Y velocity each fixed step
 *     - Applies gravity multiplier based on current zone
 *   Direct cannon-es physics are used for world contacts.
 *
 * Usage:
 *   const phys = new PlatformerPhysics3D(physics3DWorld, opts);
 *   phys.setBody(cannonBody);           // tie to character physics body
 *   phys.setGrounded(true|false);       // CharacterController3D updates this
 *   phys.pressJump();                   // call when jump button DOWN
 *   phys.releaseJump();                 // call when jump button UP
 *   phys.fixedUpdate(dt);              // call from engine _fixedUpdate
 *   phys.resetVelocity();              // called on respawn
 *
 *   phys.registerBouncePad(id, aabb, strength)
 *   phys.registerWaterVolume(id, aabb)
 *   phys.unregisterVolume(id)
 */

import * as CANNON from '/lib/cannon-es/cannon-es.module.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default gravity (m/s²). Negative = downward. */
const GRAVITY_NORMAL    = -20;
/** Gravity in low-gravity zones (e.g. space, trampoline ceilings). */
const GRAVITY_LOW       = -5;
/** Maximum downward velocity (terminal velocity, m/s — negative). */
const TERMINAL_VEL      = -30;

/** Base jump impulse velocity (m/s upward) on button press. */
const JUMP_VEL_MIN      = 5;
/** Additional velocity gained by holding jump up to JUMP_HOLD_MAX_SEC. */
const JUMP_VEL_BONUS    = 4;
/** Max duration the jump button can be held to boost (seconds). */
const JUMP_HOLD_MAX_SEC = 0.18;

/** Frames of coyote time after leaving a ledge. @60fps = 8 frames */
const COYOTE_FRAMES     = 8;
/** Frames of jump buffering before landing. @60fps = 10 frames */
const JUMP_BUFFER_FRAMES = 10;

/** Double-jump count (0 = only ground jump, 1 = one extra air jump, etc.). */
const AIR_JUMPS_DEFAULT = 1;

/** Gravity scale applied while falling (makes jump arc feel snappier). */
const FALL_GRAVITY_SCALE = 1.6;

/** Buoyancy force per unit depth in water (replaces gravity with upward lerp). */
const BUOYANCY_GRAVITY  = -3;
/** Max swim speed cap (m/s). */
const SWIM_SPEED_MAX    = 4;

// ── Volume AABB helper ────────────────────────────────────────────────────────

function aabbContains(aabb, pos) {
    return pos.x >= aabb.minX && pos.x <= aabb.maxX
        && pos.y >= aabb.minY && pos.y <= aabb.maxY
        && pos.z >= aabb.minZ && pos.z <= aabb.maxZ;
}

// ── PlatformerPhysics3D ───────────────────────────────────────────────────────

export default class PlatformerPhysics3D {

    /**
     * @param {import('../shared/Physics3DWorld.js').default} physics3DWorld
     * @param {object} [opts]
     * @param {number}  [opts.gravity=GRAVITY_NORMAL]     Base gravity (m/s²)
     * @param {number}  [opts.airJumps=AIR_JUMPS_DEFAULT] Extra air jumps allowed
     * @param {number}  [opts.jumpVelMin=JUMP_VEL_MIN]    Minimum jump velocity
     * @param {number}  [opts.jumpVelBonus=JUMP_VEL_BONUS] Max bonus from hold
     * @param {number}  [opts.terminalVel=TERMINAL_VEL]   Terminal velocity cap
     */
    constructor(physics3DWorld, opts = {}) {
        this._world        = physics3DWorld;
        this._body         = null;     // CANNON.Body set by setBody()

        // Config
        this._baseGravity  = opts.gravity      ?? GRAVITY_NORMAL;
        this._maxAirJumps  = opts.airJumps     ?? AIR_JUMPS_DEFAULT;
        this._jumpVelMin   = opts.jumpVelMin   ?? JUMP_VEL_MIN;
        this._jumpVelBonus = opts.jumpVelBonus ?? JUMP_VEL_BONUS;
        this._terminalVel  = opts.terminalVel  ?? TERMINAL_VEL;

        // Runtime state
        this._gravityScale  = 1;        // multiplied per-step (low-grav zones)
        this._isGrounded    = false;
        this._wasGrounded   = false;

        // Coyote & buffer
        this._coyoteFrames  = 0;        // count down after leaving ground
        this._jumpBufferFrames = 0;     // count down from button press

        // Air jumps
        this._airJumpsLeft  = 0;

        // Jump hold tracking
        this._jumpHeld      = false;
        this._jumpHoldTimer = 0;
        this._jumpActive    = false;    // mid-jump (holding is still applying force)

        // Pending jump request (fired on ground or coyote or buffer)
        this._jumpRequested = false;

        // Volume registries { id → { type, aabb, strength? } }
        this._volumes       = new Map();

        // Current zone overrides (updated per-step based on body position)
        this._inWater       = false;
        this._inLowGrav     = false;
        this._onBouncePad   = false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Configuration
    // ─────────────────────────────────────────────────────────────────────────

    setBody(body) {
        this._body = body;
    }

    setGrounded(grounded) {
        this._wasGrounded = this._isGrounded;
        this._isGrounded  = grounded;

        if (grounded && !this._wasGrounded) {
            // Just landed
            this._airJumpsLeft = this._maxAirJumps;
            // Fire buffered jump
            if (this._jumpBufferFrames > 0) {
                this._executeJump();
            }
        }
        if (!grounded && this._wasGrounded) {
            // Just walked off ledge — start coyote timer
            this._coyoteFrames = COYOTE_FRAMES;
            this._airJumpsLeft = this._maxAirJumps;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Jump control (called by CharacterController3D on input events)
    // ─────────────────────────────────────────────────────────────────────────

    pressJump() {
        this._jumpRequested = true;
        this._jumpHeld      = true;
        this._jumpHoldTimer = 0;

        const canJumpGround  = this._isGrounded;
        const canJumpCoyote  = !this._isGrounded && this._coyoteFrames > 0;
        const canJumpAir     = !this._isGrounded && this._airJumpsLeft > 0;

        if (canJumpGround || canJumpCoyote) {
            this._executeJump();
            if (canJumpCoyote) this._coyoteFrames = 0;  // consume coyote window
        } else if (canJumpAir) {
            this._executeAirJump();
        } else {
            // Buffer the request — fire when we land
            this._jumpBufferFrames = JUMP_BUFFER_FRAMES;
        }
    }

    releaseJump() {
        this._jumpHeld  = false;
        this._jumpActive = false;  // stop variable-height hold boost
    }

    _executeJump() {
        if (!this._body) return;
        this._body.velocity.y = this._jumpVelMin;
        this._jumpActive      = true;
        this._jumpHoldTimer   = 0;
        this._jumpBufferFrames= 0;
        this._jumpRequested   = false;
    }

    _executeAirJump() {
        if (!this._body) return;
        this._airJumpsLeft--;
        this._body.velocity.y = this._jumpVelMin + this._jumpVelBonus * 0.5;  // slightly lower
        this._jumpActive      = true;
        this._jumpHoldTimer   = 0;
        this._jumpRequested   = false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Volume registry
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param {string} id      Unique volume ID
     * @param {{minX,maxX,minY,maxY,minZ,maxZ}} aabb  World-space AABB
     * @param {number} strength  Upward velocity on contact (e.g. 18 for a bounce pad)
     */
    registerBouncePad(id, aabb, strength = 18) {
        this._volumes.set(id, { type: 'bounce', aabb, strength });
    }

    /**
     * @param {string} id
     * @param {{minX,maxX,minY,maxY,minZ,maxZ}} aabb  World-space AABB
     */
    registerWaterVolume(id, aabb) {
        this._volumes.set(id, { type: 'water', aabb });
    }

    /** Register a low-gravity zone. */
    registerLowGravZone(id, aabb) {
        this._volumes.set(id, { type: 'lowgrav', aabb });
    }

    unregisterVolume(id) {
        this._volumes.delete(id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fixed update — called every physics tick from engine._fixedUpdate()
    // ─────────────────────────────────────────────────────────────────────────

    fixedUpdate(dt) {
        if (!this._body) return;

        const pos = this._body.position;

        // ── Zone detection ──────────────────────────────────────────────────
        this._inWater    = false;
        this._inLowGrav  = false;
        this._onBouncePad= false;

        for (const vol of this._volumes.values()) {
            if (!aabbContains(vol.aabb, pos)) continue;
            if (vol.type === 'water')   this._inWater    = true;
            if (vol.type === 'lowgrav') this._inLowGrav  = true;
            if (vol.type === 'bounce' && this._isGrounded && !this._wasGrounded) {
                // Bounce pad: fire upward when landing inside AABB
                this._body.velocity.y = vol.strength;
                this._onBouncePad     = true;
            }
        }

        // ── Gravity override ────────────────────────────────────────────────
        let gravity = this._baseGravity;

        if (this._inLowGrav)  gravity = GRAVITY_LOW;
        if (this._inWater)    gravity = BUOYANCY_GRAVITY;

        // Fall gravity scale (faster fall for snappy arcs) — only when going down
        // and not in special zones
        const falling = this._body.velocity.y < 0;
        if (falling && !this._inWater && !this._inLowGrav) {
            gravity *= FALL_GRAVITY_SCALE;
        }

        // ── Jump hold boost ──────────────────────────────────────────────────
        if (this._jumpActive && this._jumpHeld) {
            this._jumpHoldTimer += dt;
            if (this._jumpHoldTimer < JUMP_HOLD_MAX_SEC) {
                // Continuously add upward velocity while held (tapers off)
                const fraction = this._jumpHoldTimer / JUMP_HOLD_MAX_SEC;
                const boost    = this._jumpVelBonus * (1 - fraction) * (dt / JUMP_HOLD_MAX_SEC);
                this._body.velocity.y += boost;
            } else {
                this._jumpActive = false;
            }
        }

        // ── Apply gravity ───────────────────────────────────────────────────
        if (!this._isGrounded || this._body.velocity.y > 0) {
            this._body.velocity.y += gravity * dt;
        }

        // ── Terminal velocity ───────────────────────────────────────────────
        if (this._body.velocity.y < this._terminalVel) {
            this._body.velocity.y = this._terminalVel;
        }

        // ── Water swim speed cap ────────────────────────────────────────────
        if (this._inWater) {
            const vy = this._body.velocity.y;
            if (Math.abs(vy) > SWIM_SPEED_MAX) {
                this._body.velocity.y = Math.sign(vy) * SWIM_SPEED_MAX;
            }
        }

        // ── Coyote & buffer countdowns ───────────────────────────────────────
        if (this._coyoteFrames > 0)     this._coyoteFrames--;
        if (this._jumpBufferFrames > 0) this._jumpBufferFrames--;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Respawn
    // ─────────────────────────────────────────────────────────────────────────

    resetVelocity() {
        if (!this._body) return;
        this._body.velocity.set(0, 0, 0);
        this._body.angularVelocity.set(0, 0, 0);
        this._jumpActive       = false;
        this._jumpHeld         = false;
        this._jumpHoldTimer    = 0;
        this._coyoteFrames     = 0;
        this._jumpBufferFrames = 0;
        this._airJumpsLeft     = this._maxAirJumps;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Accessors
    // ─────────────────────────────────────────────────────────────────────────

    get inWater()      { return this._inWater;   }
    get inLowGrav()    { return this._inLowGrav; }
    get airJumpsLeft() { return this._airJumpsLeft; }
    get canCoyote()    { return this._coyoteFrames > 0; }

    // ─────────────────────────────────────────────────────────────────────────
    // Destroy
    // ─────────────────────────────────────────────────────────────────────────

    destroy() {
        this._body    = null;
        this._world   = null;
        this._volumes.clear();
    }
}
