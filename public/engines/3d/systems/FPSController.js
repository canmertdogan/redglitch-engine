/**
 * FPSController.js — Phase 28
 *
 * Kinematic character controller for the fps-3d engine.
 *
 * Architecture:
 *   - cannon-es DYNAMIC sphere body (radius = 0.4 m) with fixedRotation=true
 *     acts as the physics capsule stand-in (full capsule shape approximated
 *     by two sphere offsets, but cannon-es has no native capsule so one sphere
 *     with careful step-up handling is used here; Phase 29 adds trimesh world)
 *   - Each frame: read Input3D axes → build wish-velocity → blend with current
 *     velocity (air-control factor applied when airborne) → set on cannon body
 *   - Y-velocity managed separately: gravity accumulation, jump impulse,
 *     bunny-hop window, ground detection via downward raycast
 *   - After physics step: read body position → write to fpsCamera pivot
 *
 * Movement states:
 *   STANDING  – normal speed, full ground control
 *   CROUCHING – half height, reduced speed, toggle on Ctrl
 *   SPRINTING – Shift held while moving forward (camera FOV kick notified)
 *   AIRBORNE  – after leaving ground (reduced air-control factor)
 *
 * Bunny hop:
 *   If Space is pressed within BHOP_WINDOW seconds of landing, the horizontal
 *   momentum is preserved (only vertical velocity is reset to jump impulse).
 *   Configurable: options.bunnyHop = true to enable.
 *
 * Footstep audio:
 *   Plays a footstep sound every FOOTSTEP_INTERVAL metres walked.
 *   Material tag is read from the ground body's userData.surface
 *   ('concrete' | 'grass' | 'metal' | 'wood') — defaults to 'concrete'.
 *   Sounds are played via AudioSpatial3D if provided.
 */

import * as THREE  from '/lib/three/three.module.js';
import * as CANNON from '/lib/cannon-es/cannon-es.module.js';
import Physics3DWorld, { PhysicsBody3D, BodyType, ShapeType } from '/engines/shared/Physics3DWorld.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Player capsule radius (metres). */
const CAPSULE_RADIUS   = 0.4;
/** Eye height above body origin when standing. */
const EYE_HEIGHT_STAND = 1.7;
/** Eye height while crouching. */
const EYE_HEIGHT_CROUCH = 1.0;
/** Eye height transition speed (m/s). */
const EYE_LERP         = 12;

/** Horizontal move speeds (m/s). */
const SPEED_WALK       = 5.5;
const SPEED_SPRINT     = 9.0;
const SPEED_CROUCH     = 2.8;
const SPEED_AIR        = SPEED_WALK;  // max air speed
const SPEED_SWIM       = 3.2;

/** Air-control factor (0 = no control, 1 = full ground control). */
const AIR_CONTROL      = 0.18;

/** Ground-friction deceleration factor per second (exponential damping). */
const GROUND_FRICTION  = 18;
/** Air drag (much lower — preserves momentum). */
const AIR_FRICTION     = 1.5;
const WATER_FRICTION   = 7;

/** Jump impulse vertical velocity (m/s). */
const JUMP_VELOCITY    = 6.0;

/** Bunny-hop window: max seconds after landing to preserve momentum. */
const BHOP_WINDOW      = 0.15;

/** Ground-detection ray length below sphere bottom.
 *  Must reach far enough for slope-stick detection (see SLOPE_STICK_DIST). */
const GROUND_RAY_LEN     = CAPSULE_RADIUS + 2.5;

/** Max gap (m) between sphere bottom and surface for landing detection
 *  when the player was airborne last frame (jumping / falling). */
const GROUND_TOLERANCE   = 0.25;

/** Max gap (m) between sphere bottom and surface while already grounded.
 *  Wider than GROUND_TOLERANCE so the player stays attached to terrain
 *  on steep slopes instead of popping airborne for 1-2 frames each step. */
const SLOPE_STICK_DIST   = 1.8;

/** Footstep interval in metres. */
const FOOTSTEP_INTERVAL = 2.2;

// ── Collision filter groups (must match TerrainSystem3D) ──────────────────────
/** Player body collision group. */
const COL_GROUP_PLAYER  = 2;
/** Terrain body collision group (set on terrain bodies in TerrainSystem3D). */
const COL_GROUP_TERRAIN = 4;
/** Player collision mask: everything EXCEPT terrain trimesh bodies.
 *  Ground detection on terrain uses the physics raycast (which ignores filters)
 *  so the player still lands/walks on terrain — only the contact *solver* is
 *  excluded, preventing the Sphere-vs-Trimesh edge-seam jitter that causes
 *  the character to hop every frame. */
const COL_MASK_PLAYER   = 0xFFFF & ~COL_GROUP_TERRAIN;

/**
 * Footstep sound names per surface.
 * AudioSpatial3D.playEffect(name, position) will be called.
 */
const FOOTSTEP_SOUNDS = {
    concrete: 'step_concrete',
    grass:    'step_grass',
    metal:    'step_metal',
    wood:     'step_wood',
};

// ── Movement state enum ───────────────────────────────────────────────────────

export const MoveState = Object.freeze({
    STANDING:  'STANDING',
    CROUCHING: 'CROUCHING',
    SPRINTING: 'SPRINTING',
    AIRBORNE:  'AIRBORNE',
    SWIMMING:  'SWIMMING',
});

// ── FPSController ─────────────────────────────────────────────────────────────

export default class FPSController {

    /**
     * @param {object}           systems
     * @param {Physics3DWorld}   systems.physics       Physics world
     * @param {import('./FPSCamera.js').default} systems.fpsCamera  FPS camera
     * @param {import('../shared/Input3D.js').default}   systems.input     Input handler
     * @param {import('../shared/AudioSpatial3D.js').default} [systems.audio] Spatial audio
     * @param {object}           [opts]
     * @param {boolean}          [opts.bunnyHop=false]   Enable bunny-hop momentum
     * @param {boolean}          [opts.proneEnabled=false] Enable prone stance
     * @param {number}           [opts.walkSpeed]
     * @param {number}           [opts.sprintSpeed]
     * @param {number}           [opts.crouchSpeed]
     */
    constructor({ physics, fpsCamera, input, audio = null }, opts = {}) {
        /** @type {Physics3DWorld} */
        this._physics    = physics;
        /** @type {import('./FPSCamera.js').default} */
        this._fpsCamera  = fpsCamera;
        /** @type {import('../shared/Input3D.js').default} */
        this._input      = input;
        /** @type {import('../shared/AudioSpatial3D.js').default|null} */
        this._audio      = audio;

        // ── Configuration ─────────────────────────────────────────────────
        this._bunnyHop      = opts.bunnyHop     ?? false;
        this._proneEnabled  = opts.proneEnabled ?? false;
        this._speedWalk     = opts.walkSpeed    ?? SPEED_WALK;
        this._speedSprint   = opts.sprintSpeed  ?? SPEED_SPRINT;
        this._speedCrouch   = opts.crouchSpeed  ?? SPEED_CROUCH;

        // ── Physics body ──────────────────────────────────────────────────
        /** @type {PhysicsBody3D|null} */
        this._body          = null;

        // ── State ─────────────────────────────────────────────────────────
        /** @type {string} MoveState.* */
        this.moveState      = MoveState.STANDING;
        this._isGrounded    = false;
        this._wasGrounded   = false;
        this._groundSurface = 'concrete';   // surface tag from ground body
        this._groundY       = 0;
        this._waterInfo     = null;

        // Current eye height (smoothly interpolated)
        this._eyeHeightCurrent = EYE_HEIGHT_STAND;
        this._eyeHeightTarget  = EYE_HEIGHT_STAND;

        // Velocity managed in this controller (Y separate for gravity)
        this._velX = 0;
        this._velZ = 0;
        this._velY = 0;

        // ── Jump / bhop state ─────────────────────────────────────────────
        this._jumpPressedLastFrame = false;
        this._landedAt             = -999;   // timestamp of last landing (seconds)
        this._bhopBuffered         = false;  // jump pressed while airborne
        this._jumpGraceTimer       = 0;      // seconds remaining to ignore ground (avoids jump cancellation)

        // ── Footstep tracking ─────────────────────────────────────────────
        this._footstepAccum = 0;   // metres walked since last step sound
        this._lastStepPos   = new THREE.Vector3();

        // ── Spawn position ────────────────────────────────────────────────
        this._spawnPos = new THREE.Vector3(0, EYE_HEIGHT_STAND, 0);

        // Optional terrain-specific grounding hook. Generated terrain uses a
        // dense Trimesh collider, whose ray hits can jitter on triangle seams.
        this._terrainGroundProvider = null;
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    /**
     * Create the physics body and set initial position.
     * Call once after Physics3DWorld.init() (inside FPSGame.init or onLevelLoaded).
     * @param {{ x:number, y:number, z:number }} [spawnPos]
     */
    async init(spawnPos = { x: 0, y: 0, z: 0 }) {
        this._spawnPos.set(spawnPos.x, spawnPos.y, spawnPos.z);

        // Remove old body if it exists
        if (this._body) {
            this._physics.removeBody(this._body);
        }

        // Create a dynamic sphere body (fixedRotation prevents tipping)
        // position.y is now feet-level + radius
        const bodyY = spawnPos.y + CAPSULE_RADIUS;
        this._body = this._physics.createBody({
            type:           BodyType.DYNAMIC,
            shape:          ShapeType.SPHERE,
            radius:         CAPSULE_RADIUS,
            mass:           80,
            position:       new THREE.Vector3(spawnPos.x, bodyY, spawnPos.z),
            fixedRotation:  true,
            linearDamping:  0.08,
            angularDamping: 1,
            restitution:    0,
        });

        // Tag body for raycaster layer detection
        this._body.body.userData = { type: 'player' };

        // Collision filter: exclude terrain trimesh bodies from contact solving.
        // This prevents the cannon-es Sphere-vs-Trimesh edge-seam jitter that
        // causes the character to micro-bounce on terrain every frame.
        // Ground detection still works because _checkGrounded() uses
        // world.raycastClosest(), which defaults to mask=-1 (hits everything).
        this._body.body.collisionFilterGroup = COL_GROUP_PLAYER;
        this._body.body.collisionFilterMask  = COL_MASK_PLAYER;

        // Sync eye position to spawn (feet + eyeHeight)
        this._eyeHeightCurrent = EYE_HEIGHT_STAND;
        this._eyeHeightTarget  = EYE_HEIGHT_STAND;
        this._lastStepPos.copy(this._spawnPos);

        console.log('[FPSController] init() — spawn (feet):', spawnPos, 'body center Y:', bodyY);

    }

    /** Move player to a position (e.g. checkpoint / load). Y = feet position. */
    setPosition(x, y, z) {
        if (!this._body) return;
        const bodyY = y + CAPSULE_RADIUS;
        this._body.setPosition(new THREE.Vector3(x, bodyY, z));
        this._velX = 0; this._velY = 0; this._velZ = 0;
        this._lastStepPos.set(x, y, z);
    }

    setTerrainGroundProvider(provider) {
        this._terrainGroundProvider = typeof provider === 'function' ? provider : null;
    }

    /** @returns {{ x:number, y:number, z:number }} Current eye-level world position. */
    getPosition() {
        if (!this._body) return { x: 0, y: 0, z: 0 };
        const p = this._body.body.position;
        return { x: p.x, y: p.y + this._eyeHeightCurrent - CAPSULE_RADIUS, z: p.z };
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    /**
     * update(dt) — read input, update movement, sync camera pivot.
     * Called from FPSGame._update() BEFORE the physics step.
     * @param {number} dt  Delta time in seconds.
     */
    update(dt) {
        if (!this._body || !this._input) return;

        // ── Decrement jump grace timer ─────────────────────────────────────
        if (this._jumpGraceTimer > 0) {
            this._jumpGraceTimer = Math.max(0, this._jumpGraceTimer - dt);
        }

        const input = this._input;

        // ── Ground detection ───────────────────────────────────────────────
        this._wasGrounded  = this._isGrounded;
        this._isGrounded   = this._checkGrounded();

        const justLanded   = !this._wasGrounded && this._isGrounded;

        if (justLanded) {
            this._landedAt = this._getGameTime();
            this._snapBodyToGround();
            // Bhop: if jump was buffered while airborne, jump immediately on land
            if (this._bunnyHop && this._bhopBuffered) {
                this._doJump(/*preserveMomentum=*/ true);
                this._bhopBuffered = false;
            }
        }

        // ── Movement state ─────────────────────────────────────────────────
        const isCrouching = input.isAction('crouch');
        const isSprinting = input.isAction('sprint') && !isCrouching;
        const jumpPressed  = input.isAction('jump');
        const jumpJustPressed = jumpPressed && !this._jumpPressedLastFrame;
        this._jumpPressedLastFrame = jumpPressed;

        // Update move state enum
        const inWater = !!this._waterInfo?.inWater;

        if (inWater) {
            this.moveState = MoveState.SWIMMING;
        } else if (!this._isGrounded) {
            this.moveState = MoveState.AIRBORNE;
        } else if (isCrouching) {
            this.moveState = MoveState.CROUCHING;
        } else if (isSprinting) {
            this.moveState = MoveState.SPRINTING;
        } else {
            this.moveState = MoveState.STANDING;
        }

        // ── Eye height ─────────────────────────────────────────────────────
        this._eyeHeightTarget  = isCrouching ? EYE_HEIGHT_CROUCH : EYE_HEIGHT_STAND;
        this._eyeHeightCurrent = THREE.MathUtils.lerp(
            this._eyeHeightCurrent,
            this._eyeHeightTarget,
            Math.min(1, dt * EYE_LERP),
        );

        // ── Movement axes → wish velocity ──────────────────────────────────
        const axis   = input.getAxis();          // { x, y } normalised
        const yaw    = this._fpsCamera?.getYaw() ?? 0;

        const sinYaw = Math.sin(yaw);
        const cosYaw = Math.cos(yaw);

        // Wish direction in world XZ (forward = -Z in Three.js convention)
        // Standard 2D rotation for Three.js XZ plane (where +Z is "down" on screen)
        const wishX  = axis.x * cosYaw + axis.y * sinYaw;
        const wishZ  = -axis.x * sinYaw + axis.y * cosYaw;

        const speed  = inWater ? SPEED_SWIM
                     : isCrouching ? this._speedCrouch
                     : isSprinting ? this._speedSprint
                     : this._speedWalk;

        const wishLen = Math.sqrt(wishX * wishX + wishZ * wishZ);
        const normX   = wishLen > 0 ? (wishX / wishLen) * speed : 0;
        const normZ   = wishLen > 0 ? (wishZ / wishLen) * speed : 0;

        // ── Horizontal velocity blending ───────────────────────────────────
        if (inWater) {
            const swimFactor = Math.min(1, dt * WATER_FRICTION);
            this._velX = THREE.MathUtils.lerp(this._velX, normX, swimFactor);
            this._velZ = THREE.MathUtils.lerp(this._velZ, normZ, swimFactor);
        } else if (this._isGrounded) {
            // Ground: direct control + friction deceleration
            const friction = Math.min(1, dt * GROUND_FRICTION);
            this._velX = THREE.MathUtils.lerp(this._velX, normX, friction);
            this._velZ = THREE.MathUtils.lerp(this._velZ, normZ, friction);
        } else {
            // Air: partial control (air-strafe)
            const airFactor = Math.min(1, dt * GROUND_FRICTION * AIR_CONTROL);
            this._velX = THREE.MathUtils.lerp(this._velX, normX, airFactor);
            this._velZ = THREE.MathUtils.lerp(this._velZ, normZ, airFactor);

            // Air drag (keeps things slightly controllable without being floaty)
            const drag = Math.min(1, dt * AIR_FRICTION);
            this._velX *= (1 - drag * 0.1);
            this._velZ *= (1 - drag * 0.1);
        }

        // ── Vertical velocity ──────────────────────────────────────────────
        if (inWater) {
            const bodyY = this._body.body.position.y;
            const surfaceBodyY = (this._waterInfo.waterY ?? bodyY) - 1.08;
            const floorBodyY = Number.isFinite(this._waterInfo.floorY)
                ? this._waterInfo.floorY + CAPSULE_RADIUS + 0.02
                : -Infinity;
            const floorGuard = Number.isFinite(this._waterInfo.depth) && this._waterInfo.depth < 0.6
                ? floorBodyY
                : -Infinity;
            const targetY = Math.max(surfaceBodyY, floorGuard);
            const rise = jumpPressed ? 2.4 : 0;
            const dive = isCrouching ? -1.8 : 0;
            const buoyancy = THREE.MathUtils.clamp((targetY - bodyY) * 4.2, -1.8, 2.8);
            this._velY = THREE.MathUtils.clamp(buoyancy + rise + dive, -2.2, 3.0);
            this._bhopBuffered = false;
        } else if (this._isGrounded) {
            this._velY = 0;

            if (jumpJustPressed) {
                const bhopWindow = this._bunnyHop
                    && (this._getGameTime() - this._landedAt) < BHOP_WINDOW;
                this._doJump(/*preserveMomentum=*/ bhopWindow);
            } else {
                this._snapBodyToGround();
            }
        } else {
            this._velY = this._body.body.velocity.y;

            // Buffer bhop: if jump pressed while airborne, fire on landing
            if (this._bunnyHop && jumpJustPressed) {
                this._bhopBuffered = true;
            }
        }

        // Disable gravity when grounded (physics step ran before this update,
        // so prevent the solver from pushing the sphere into a micro-bounce
        // next frame). Restore gravity immediately when airborne.
        this._body.body.gravityScale = (this._isGrounded || inWater) ? 0 : 1;

        // ── Apply velocity to cannon body ──────────────────────────────────
        this._body.setVelocity({ x: this._velX, y: this._velY, z: this._velZ });

        // ── Camera FPS state notifications ────────────────────────────────
        const isMoving = wishLen > 0.01;
        this._fpsCamera?.setWalking(!inWater && this._isGrounded && isMoving, Math.sqrt(this._velX ** 2 + this._velZ ** 2));
        this._fpsCamera?.setSprinting(!inWater && this._isGrounded && isSprinting && isMoving);

        // ── Footstep audio ─────────────────────────────────────────────────
        if (!inWater && this._isGrounded && isMoving) {
            this._updateFootsteps(dt);
        }

        // ── Sync camera pivot ──────────────────────────────────────────────
        const pos = this._body.body.position;
        this._fpsCamera?.setPosition(
            pos.x,
            pos.y + this._eyeHeightCurrent - CAPSULE_RADIUS,
            pos.z,
        );
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Apply jump velocity impulse.
     * @param {boolean} preserveMomentum  When true (bunny hop), only Y is reset.
     */
    _doJump(preserveMomentum = false) {
        this._velY = JUMP_VELOCITY;
        this._body.setVelocity({ x: this._velX, y: this._velY, z: this._velZ });
        this._isGrounded    = false;
        this._bhopBuffered  = false;
        this._jumpGraceTimer = 0.08;
    }

    /**
     * Ground detection: cast a ray downward from body centre.
     * Returns true only if the hit surface is within GROUND_TOLERANCE of the
     * sphere bottom. This prevents the controller from thinking it's grounded
     * when the body is actually hovering above the surface.
     *
     * Uses cannon-es World.raycastClosest for efficiency.
     * @returns {boolean}
     */
    _checkGrounded() {
        if (!this._body || !this._physics?.world) return false;

        // Grace period after jump: pretend we're airborne so the
        // tolerance doesn't cancel the jump immediately.
        if (this._jumpGraceTimer > 0) return false;

        const pos   = this._body.body.position;
        const sphereBottom = pos.y - CAPSULE_RADIUS;
        this._waterInfo = null;

        const terrainGround = this._terrainGroundProvider?.(pos.x, pos.z);
        if (terrainGround?.water?.inWater) {
            this._waterInfo = terrainGround.water;
            this._groundSurface = 'water';
            this._groundY = Number.isFinite(terrainGround.water.floorY) ? terrainGround.water.floorY : this._groundY;
            return false;
        }
        if (terrainGround && Number.isFinite(terrainGround.y)) {
            this._groundSurface = terrainGround.surface ?? 'grass';
            this._groundY = terrainGround.y;

            const distToGround = sphereBottom - terrainGround.y;
            const tolerance = this._wasGrounded
                ? SLOPE_STICK_DIST
                : GROUND_TOLERANCE;

            return distToGround <= tolerance;
        }

        // Start ray at sphere-bottom so it doesn't hit the player body itself.
        const originY = pos.y - CAPSULE_RADIUS;
        const fromV = new CANNON.Vec3(pos.x, originY, pos.z);
        const toV   = new CANNON.Vec3(pos.x, originY - GROUND_RAY_LEN, pos.z);

        const result = new CANNON.RaycastResult();
        const hit = this._physics.world.raycastClosest(
            fromV, toV,
            { skipBackfaces: false },
            result,
        );

        if (hit && result.body && result.body !== this._body.body) {
            const hitY = Number.isFinite(result.hitPointWorld?.y)
                ? result.hitPointWorld.y
                : pos.y - CAPSULE_RADIUS;
            const distToGround = sphereBottom - hitY;

            // Surface material tag from userData (set by WorldGeometry)
            this._groundSurface = result.body.userData?.surface ?? 'concrete';
            this._groundY = hitY;

            // Slope-stick: when the player was grounded last frame and didn't
            // just jump, accept a wider tolerance so walking down-hill doesn't
            // pop the player airborne for 1-2 frames (which causes the visible
            // hop/bounce cycle on terrain). Standard landing from airborne
            // still uses the tight GROUND_TOLERANCE.
            const tolerance = this._wasGrounded
                ? SLOPE_STICK_DIST
                : GROUND_TOLERANCE;

            return distToGround <= tolerance;
        }
        return false;
    }

    _snapBodyToGround() {
        if (!this._body || !Number.isFinite(this._groundY)) return;
        const body = this._body.body;
        const targetY = this._groundY + CAPSULE_RADIUS;
        body.position.y = targetY;
        body.velocity.y = 0;
        body.force.y = 0;
    }

    /** Accumulate walked distance and fire footstep sounds. */
    _updateFootsteps(dt) {
        if (!this._audio) return;

        const pos   = this._body.body.position;
        const dx    = pos.x - this._lastStepPos.x;
        const dz    = pos.z - this._lastStepPos.z;
        const distXZ = Math.sqrt(dx * dx + dz * dz);

        this._footstepAccum += distXZ;
        this._lastStepPos.set(pos.x, pos.y, pos.z);

        if (this._footstepAccum >= FOOTSTEP_INTERVAL) {
            this._footstepAccum -= FOOTSTEP_INTERVAL;
            const soundName = FOOTSTEP_SOUNDS[this._groundSurface] ?? FOOTSTEP_SOUNDS.concrete;
            this._audio.playEffect?.(soundName, { x: pos.x, y: pos.y, z: pos.z });
        }
    }

    /**
     * Returns current game time in seconds (used for bhop window comparison).
     * Reads from FPSGame via closure if available, falls back to performance.now().
     */
    _getGameTime() {
        // FPSGame sets this via `controller._gameTimeRef` in init
        return this._gameTimeRef?.() ?? performance.now() / 1000;
    }

    // ── Serialization ─────────────────────────────────────────────────────────

    /** @returns {{ pos:{x,y,z}, vel:{x,y,z}, moveState:string }} */
    serialize() {
        const p = this._body?.body.position ?? { x: 0, y: 0, z: 0 };
        return {
            pos:       { x: p.x, y: p.y, z: p.z },
            vel:       { x: this._velX, y: this._velY, z: this._velZ },
            moveState: this.moveState,
        };
    }

    /** @param {{ pos:{x,y,z} }} data */
    deserialize(data) {
        if (!data?.pos) return;
        this.setPosition(data.pos.x, data.pos.y, data.pos.z);
        if (data.vel) {
            this._velX = data.vel.x;
            this._velY = data.vel.y;
            this._velZ = data.vel.z;
        }
    }

    dispose() {
        if (this._body) {
            this._physics?.removeBody(this._body);
            this._body = null;
        }
        console.log('[FPSController] disposed');
    }
}
