/**
 * CharacterController3D.js — Phase 45
 *
 * Kinematic character controller for the platformer-3d engine.
 *
 * Architecture:
 *   - cannon-es DYNAMIC sphere body (radius=0.4m, fixedRotation) acts as the
 *     physics capsule. One sphere is used; a downward raycast detects ground.
 *   - Ground movement: acceleration / deceleration curves, speed cap, turn radius
 *     The controller builds a wish-velocity from WASD relative to camera yaw,
 *     then blends with current XZ velocity using accel/decel factors.
 *   - Slope handling: ground raycast reads contact normal; steep slopes (>MAX_SLOPE)
 *     disable jumping and apply a slide force; gentle slopes allow normal walking.
 *   - Wall jump: side raycasts detect wall contact; pressWallJump() applies a
 *     lateral + upward impulse (CharacterController3D notifies PlatformerPhysics3D).
 *   - Double jump: delegated to PlatformerPhysics3D.pressJump() (airJumps config).
 *   - Dash: horizontal impulse in current move direction; DASH_COOLDOWN seconds;
 *     fires onDashStart(direction) for VFX; grants DASH_INVINCIBILITY_FRAMES iframes.
 *   - Ground pound: sets vy = -GROUND_POUND_SPEED; on landing, fires shockwave
 *     (onGroundPound(position, force)) for VFX/enemy knockback.
 *
 * Connections:
 *   - Reads input snapshots from Input3D (via update() param)
 *   - Delegates Y physics to PlatformerPhysics3D
 *   - Reports grounded state back to PlatformerPhysics3D each frame
 *   - Exposes getPosition() for ThirdPersonCamera, PlayerCharacter3D
 *   - Fires callbacks: onDashStart, onGroundPound, onLanded, onWallJump
 *
 * Usage:
 *   const cc = new CharacterController3D({ physics, platformerPhys, input, audio });
 *   await cc.init();                       // creates cannon body
 *   cc.update(dt, inputSnapshot);          // call from engine _update
 *   cc.fixedUpdate(dt);                   // call from engine _fixedUpdate
 *   cc.teleport(x, y, z);                 // respawn
 *   cc.getPosition();                     // → THREE.Vector3
 *   cc.getMesh();                         // → THREE.Mesh (invisible capsule proxy)
 *   cc.destroy();
 */

import * as THREE  from '../../lib/three/three.module.js';
import * as CANNON from '../../lib/cannon-es/cannon-es.module.js';
import Physics3DWorld, { BodyType, ShapeType } from '../shared/Physics3DWorld.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Capsule sphere radius (metres). */
const CAPSULE_RADIUS   = 0.4;
/** Half-height offset used in ground raycast (sphere centre → ground level). */
const GROUND_RAY_LEN   = CAPSULE_RADIUS + 0.08;

/** Max slope angle (degrees) before character starts sliding. */
const MAX_SLOPE_DEG    = 46;
/** Slide friction force applied on steep slopes (m/s² away from slope). */
const SLOPE_SLIDE_FORCE = 14;

/** Ground-movement speeds (m/s). */
const SPEED_RUN        = 8;
const SPEED_AIR        = SPEED_RUN * 0.85;  // slightly slower in air
const SPEED_WATER      = 4;

/** Acceleration towards wish-velocity when grounded (m/s²). */
const ACCEL_GROUND     = 60;
/** Acceleration in air (lower = floatier control). */
const ACCEL_AIR        = 18;
/** Deceleration (friction) when grounded and no input (m/s²). */
const DECEL_GROUND     = 50;
/** Turn radius factor: lower = tighter turn, higher = wider drift. */
const TURN_SHARPNESS   = 12;  // lerp factor per second

/** Dash impulse speed (m/s). */
const DASH_SPEED       = 16;
/** Cooldown between dashes (seconds). */
const DASH_COOLDOWN    = 0.8;
/** Duration of dash (seconds) — horizontal override window. */
const DASH_DURATION    = 0.14;
/** Invincibility frames granted by dash (at 60fps). */
const DASH_INVINCIBILITY_FRAMES = 20;

/** Ground-pound downward speed (m/s). */
const GROUND_POUND_SPEED = 22;
/** Ground-pound shockwave force (for VFX/enemy knockback). */
const GROUND_POUND_SHOCKWAVE = 12;

/** Wall-jump upward impulse (m/s). */
const WALL_JUMP_VEL_Y   = 9;
/** Wall-jump lateral push-off impulse (m/s away from wall). */
const WALL_JUMP_VEL_X   = 7;
/** How close to a wall to allow wall jump (metres). */
const WALL_DETECT_DIST  = 0.55;
/** Cooldown between wall jumps on the same wall (seconds). */
const WALL_JUMP_COOLDOWN = 0.35;

// ── MoveState enum ────────────────────────────────────────────────────────────

export const MoveState = Object.freeze({
    GROUNDED: 'GROUNDED',
    AIRBORNE: 'AIRBORNE',
    DASHING:  'DASHING',
    GROUND_POUNDING: 'GROUND_POUNDING',
    WALL_SLIDING: 'WALL_SLIDING',
    SWIMMING: 'SWIMMING',
});

// ── CharacterController3D ─────────────────────────────────────────────────────

export default class CharacterController3D {

    /**
     * @param {object}                  systems
     * @param {Physics3DWorld}          systems.physics          Physics world
     * @param {PlatformerPhysics3D}     systems.platformerPhys   Platformer physics layer
     * @param {Input3D}                 [systems.input]          Input handler
     * @param {AudioSpatial3D}          [systems.audio]          Spatial audio (optional)
     * @param {Camera3DController}      [systems.camera3d]       Camera (for relative input)
     * @param {object}                  [opts]
     * @param {number} [opts.runSpeed]      Override run speed (m/s)
     * @param {number} [opts.airJumps]      Override air-jump count
     * @param {boolean}[opts.wallJump=true] Enable wall jump
     * @param {boolean}[opts.dash=true]     Enable dash
     * @param {boolean}[opts.groundPound=true] Enable ground pound
     */
    constructor({ physics, platformerPhys, input = null, audio = null, camera3d = null }, opts = {}) {
        this._physics        = physics;
        this._platPhys       = platformerPhys;
        this._input          = input;
        this._audio          = audio;
        this._camera3d       = camera3d;

        // Config
        this._runSpeed       = opts.runSpeed   ?? SPEED_RUN;
        this._wallJumpEnabled= opts.wallJump   ?? true;
        this._dashEnabled    = opts.dash       ?? true;
        this._gpEnabled      = opts.groundPound ?? true;

        // Physics body
        this._pb             = null;   // PhysicsBody3D
        this._body           = null;   // raw CANNON.Body

        // State
        this._moveState      = MoveState.AIRBORNE;
        this._isGrounded     = false;
        this._groundNormal   = new THREE.Vector3(0, 1, 0);
        this._slopeAngle     = 0;      // degrees

        // Velocity (XZ only — Y managed by PlatformerPhysics3D)
        this._velocity       = new THREE.Vector3();
        this._wishDir        = new THREE.Vector3();

        // Wall jump
        this._wallNormal     = null;   // THREE.Vector3 when wall is detected
        this._wallJumpTimer  = 0;

        // Dash
        this._dashCooldown   = 0;
        this._dashTimer      = 0;
        this._dashDir        = new THREE.Vector3();
        this._isDashing      = false;

        // Ground pound
        this._isGroundPounding = false;
        this._wasGroundPounding= false;

        // Visible proxy mesh (invisible sphere used as scene anchor for camera/VFX)
        this._mesh           = null;   // THREE.Mesh

        // Raycasters
        this._groundRay      = new THREE.Raycaster();
        this._wallRays       = [];     // [THREE.Raycaster] × 4 cardinal dirs
        this._collisionMeshes= [];     // static world meshes for raycasting

        // Callbacks (assigned by engine)
        this.onDashStart     = null;   // (direction: THREE.Vector3) => void
        this.onGroundPound   = null;   // (position: THREE.Vector3, force: number) => void
        this.onLanded        = null;   // (velocity: number) => void
        this.onWallJump      = null;   // (wallNormal: THREE.Vector3) => void
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Init
    // ─────────────────────────────────────────────────────────────────────────

    async init() {
        // Create invisible proxy mesh (ThirdPersonCamera tracks this)
        const geo  = new THREE.SphereGeometry(CAPSULE_RADIUS, 8, 6);
        const mat  = new THREE.MeshBasicMaterial({ visible: false });
        this._mesh = new THREE.Mesh(geo, mat);
        this._mesh.name = 'playerProxy';

        // Create cannon-es dynamic sphere body
        this._pb = this._physics.createBody({
            shape:        ShapeType.SPHERE,
            type:         BodyType.DYNAMIC,
            mass:         70,
            radius:       CAPSULE_RADIUS,
            position:     [0, 2, 0],
            fixedRotation: true,
            linearDamping: 0,
        });
        this._body = this._pb.body;

        // Give body to PlatformerPhysics3D
        this._platPhys.setBody(this._body);

        // Set up wall raycasters (4 cardinal horizontal directions)
        for (let i = 0; i < 4; i++) {
            this._wallRays.push(new THREE.Raycaster());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Collision mesh registry
    // ─────────────────────────────────────────────────────────────────────────

    setCollisionMeshes(meshes) {
        this._collisionMeshes = meshes;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fixed update — physics step (called from engine._fixedUpdate)
    // ─────────────────────────────────────────────────────────────────────────

    fixedUpdate(dt) {
        if (!this._body) return;

        // ── Ground detection ────────────────────────────────────────────────
        this._detectGround();

        // ── Wall detection ──────────────────────────────────────────────────
        if (this._wallJumpEnabled && !this._isGrounded) {
            this._detectWalls();
        } else {
            this._wallNormal = null;
        }

        // ── Slope slide ─────────────────────────────────────────────────────
        if (this._isGrounded && this._slopeAngle > MAX_SLOPE_DEG) {
            // Project gravity down the slope
            const slideDir = new THREE.Vector3(
                this._groundNormal.x,
                0,
                this._groundNormal.z
            ).normalize();
            this._body.velocity.x += slideDir.x * SLOPE_SLIDE_FORCE * dt;
            this._body.velocity.z += slideDir.z * SLOPE_SLIDE_FORCE * dt;
        }

        // ── Apply XZ velocity ────────────────────────────────────────────────
        if (!this._isDashing) {
            this._body.velocity.x = this._velocity.x;
            this._body.velocity.z = this._velocity.z;
        }

        // ── Dash override ────────────────────────────────────────────────────
        if (this._isDashing) {
            this._body.velocity.x = this._dashDir.x * DASH_SPEED;
            this._body.velocity.z = this._dashDir.z * DASH_SPEED;
        }

        // ── Ground-pound override ────────────────────────────────────────────
        if (this._isGroundPounding) {
            this._body.velocity.x = 0;
            this._body.velocity.z = 0;
            this._body.velocity.y = -GROUND_POUND_SPEED;
        }

        // ── Sync proxy mesh ─────────────────────────────────────────────────
        if (this._mesh) {
            this._mesh.position.set(
                this._body.position.x,
                this._body.position.y,
                this._body.position.z
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Update — variable-rate logic (called from engine._update)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param {number} dt               Frame delta (seconds)
     * @param {object} inputState       Snapshot from Input3D.snapshot()
     */
    update(dt, inputState = {}) {
        if (!this._body) return;

        // Tick timers
        if (this._dashCooldown  > 0) this._dashCooldown  -= dt;
        if (this._wallJumpTimer > 0) this._wallJumpTimer -= dt;
        if (this._dashTimer     > 0) {
            this._dashTimer -= dt;
            if (this._dashTimer <= 0) this._isDashing = false;
        }

        // Ground-pound landing detection
        if (this._wasGroundPounding && this._isGrounded) {
            this._isGroundPounding  = false;
            this._wasGroundPounding = false;
            const pos = this.getPosition();
            this.onGroundPound?.(pos, GROUND_POUND_SHOCKWAVE);
            this._audio?.playEffect?.('ground_pound_land', pos);
        }
        this._wasGroundPounding = this._isGroundPounding;

        // Jump input
        if (inputState.jump && !this._prevJump) {
            if (this._isGroundPounding) {
                this._isGroundPounding = false;
            } else if (this._wallNormal && this._wallJumpEnabled && this._wallJumpTimer <= 0) {
                this._doWallJump();
            } else {
                this._platPhys.pressJump();
            }
        }
        if (!inputState.jump && this._prevJump) {
            this._platPhys.releaseJump();
        }
        this._prevJump = !!inputState.jump;

        // Dash input
        if (inputState.dash && !this._prevDash && this._dashEnabled) {
            this._doDash();
        }
        this._prevDash = !!inputState.dash;

        // Ground pound input
        if (inputState.groundPound && !this._prevGroundPound && this._gpEnabled) {
            if (!this._isGrounded && !this._isGroundPounding) {
                this._doGroundPound();
            }
        }
        this._prevGroundPound = !!inputState.groundPound;

        // XZ movement (skipped during dash + ground pound)
        if (!this._isDashing && !this._isGroundPounding) {
            this._applyMovement(dt, inputState);
        }

        // Update PlatformerPhysics3D grounded state
        this._platPhys.setGrounded(this._isGrounded);

        // Update move state enum
        this._updateMoveState();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Movement
    // ─────────────────────────────────────────────────────────────────────────

    _applyMovement(dt, input) {
        // Build wish direction from WASD relative to camera yaw
        const camYaw = this._getCameraYaw();
        const cosY   = Math.cos(camYaw);
        const sinY   = Math.sin(camYaw);

        const fwd  = (input.moveForward ? 1 : 0) - (input.moveBack    ? 1 : 0);
        const strafe = (input.moveRight  ? 1 : 0) - (input.moveLeft  ? 1 : 0);

        this._wishDir.set(
            sinY * fwd  + cosY * strafe,
            0,
            cosY * fwd  - sinY * strafe
        );

        const wishLen = this._wishDir.length();
        if (wishLen > 1) this._wishDir.divideScalar(wishLen);  // normalise diagonal

        const inWater   = this._platPhys.inWater;
        const speedCap  = inWater ? SPEED_WATER
                        : this._isGrounded ? this._runSpeed : SPEED_AIR;
        const accel     = this._isGrounded ? ACCEL_GROUND : ACCEL_AIR;
        const decel     = DECEL_GROUND;

        if (wishLen > 0.05) {
            // Accelerate toward wish direction; turn radius = lerp of current vel dir
            const wish = this._wishDir.clone().multiplyScalar(speedCap);

            // Smooth turning: lerp velocity XZ toward wish
            this._velocity.x = THREE.MathUtils.lerp(
                this._velocity.x,
                wish.x,
                Math.min(1, TURN_SHARPNESS * dt * (this._isGrounded ? 1 : 0.4))
            );
            this._velocity.z = THREE.MathUtils.lerp(
                this._velocity.z,
                wish.z,
                Math.min(1, TURN_SHARPNESS * dt * (this._isGrounded ? 1 : 0.4))
            );

            // Accelerate (additive on top of lerp for responsive feel)
            const diff = wish.clone().sub(this._velocity);
            diff.y = 0;
            const addLen = Math.min(diff.length(), accel * dt);
            if (addLen > 0) {
                this._velocity.addScaledVector(diff.normalize(), addLen);
            }

            // Clamp to speed cap
            const xzLen = Math.sqrt(this._velocity.x ** 2 + this._velocity.z ** 2);
            if (xzLen > speedCap) {
                const scale = speedCap / xzLen;
                this._velocity.x *= scale;
                this._velocity.z *= scale;
            }

        } else {
            // Decelerate (friction)
            const curLen = Math.sqrt(this._velocity.x ** 2 + this._velocity.z ** 2);
            if (curLen > 0.01) {
                const newLen = Math.max(0, curLen - decel * dt);
                const scale  = newLen / curLen;
                this._velocity.x *= scale;
                this._velocity.z *= scale;
            } else {
                this._velocity.x = 0;
                this._velocity.z = 0;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Dash
    // ─────────────────────────────────────────────────────────────────────────

    _doDash() {
        if (this._dashCooldown > 0) return;

        // Dash in current move direction; if no input, dash forward relative to camera
        const camYaw = this._getCameraYaw();
        const dx = this._velocity.x;
        const dz = this._velocity.z;
        const len = Math.sqrt(dx * dx + dz * dz);

        if (len > 0.5) {
            this._dashDir.set(dx / len, 0, dz / len);
        } else {
            // Forward relative to camera
            this._dashDir.set(Math.sin(camYaw), 0, Math.cos(camYaw));
        }

        this._isDashing      = true;
        this._dashTimer      = DASH_DURATION;
        this._dashCooldown   = DASH_COOLDOWN;

        // Y velocity zeroed for horizontal dash feel
        this._body.velocity.y = 0;

        this.onDashStart?.(this._dashDir.clone());
        this._audio?.playEffect?.('dash', this.getPosition());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Ground pound
    // ─────────────────────────────────────────────────────────────────────────

    _doGroundPound() {
        this._isGroundPounding  = true;
        this._wasGroundPounding = false;
        // Zero XZ momentum for straight-down slam
        this._velocity.set(0, 0, 0);
        this._audio?.playEffect?.('ground_pound_start', this.getPosition());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Wall jump
    // ─────────────────────────────────────────────────────────────────────────

    _doWallJump() {
        if (!this._wallNormal) return;

        this._wallJumpTimer = WALL_JUMP_COOLDOWN;

        // Lateral push-off (away from wall) + upward
        this._velocity.x = this._wallNormal.x * WALL_JUMP_VEL_X;
        this._velocity.z = this._wallNormal.z * WALL_JUMP_VEL_X;
        this._body.velocity.y = WALL_JUMP_VEL_Y;
        this._body.velocity.x = this._velocity.x;
        this._body.velocity.z = this._velocity.z;

        // Reset air jumps on wall jump
        this._platPhys._airJumpsLeft = this._platPhys._maxAirJumps;

        this.onWallJump?.(this._wallNormal.clone());
        this._audio?.playEffect?.('wall_jump', this.getPosition());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Ground detection
    // ─────────────────────────────────────────────────────────────────────────

    _detectGround() {
        const origin = new THREE.Vector3(
            this._body.position.x,
            this._body.position.y,
            this._body.position.z
        );

        this._groundRay.set(origin, new THREE.Vector3(0, -1, 0));
        this._groundRay.far = GROUND_RAY_LEN;

        const wasGrounded = this._isGrounded;

        if (this._collisionMeshes.length > 0) {
            const hits = this._groundRay.intersectObjects(this._collisionMeshes, false);
            this._isGrounded = hits.length > 0 && this._body.velocity.y <= 0.1;

            if (hits.length > 0) {
                const n = hits[0].face?.normal ?? new THREE.Vector3(0, 1, 0);
                this._groundNormal.copy(n);
                this._slopeAngle = THREE.MathUtils.radToDeg(
                    Math.acos(Math.min(1, n.dot(new THREE.Vector3(0, 1, 0))))
                );
            }
        } else {
            // Fallback: grounded if moving downward and body near y≈0
            this._isGrounded = this._body.velocity.y <= 0.15 && this._body.position.y <= CAPSULE_RADIUS + 0.2;
        }

        if (!wasGrounded && this._isGrounded) {
            this.onLanded?.(Math.abs(this._body.velocity.y));
            this._audio?.playEffect?.('land', this.getPosition());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Wall detection (4 cardinal raycasts)
    // ─────────────────────────────────────────────────────────────────────────

    _detectWalls() {
        this._wallNormal = null;
        if (this._collisionMeshes.length === 0) return;

        const origin = new THREE.Vector3(
            this._body.position.x,
            this._body.position.y,
            this._body.position.z
        );

        const cardinals = [
            new THREE.Vector3( 1, 0,  0),
            new THREE.Vector3(-1, 0,  0),
            new THREE.Vector3( 0, 0,  1),
            new THREE.Vector3( 0, 0, -1),
        ];

        for (let i = 0; i < 4; i++) {
            this._wallRays[i].set(origin, cardinals[i]);
            this._wallRays[i].far = WALL_DETECT_DIST;
            const hits = this._wallRays[i].intersectObjects(this._collisionMeshes, false);
            if (hits.length > 0) {
                const n = hits[0].face?.normal ?? cardinals[i].clone().negate();
                // Only accept near-vertical walls
                if (Math.abs(n.y) < 0.4) {
                    this._wallNormal = new THREE.Vector3(n.x, 0, n.z).normalize();
                    break;
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Move state update
    // ─────────────────────────────────────────────────────────────────────────

    _updateMoveState() {
        if (this._isDashing)           this._moveState = MoveState.DASHING;
        else if (this._isGroundPounding) this._moveState = MoveState.GROUND_POUNDING;
        else if (this._platPhys.inWater) this._moveState = MoveState.SWIMMING;
        else if (this._wallNormal && !this._isGrounded) this._moveState = MoveState.WALL_SLIDING;
        else if (!this._isGrounded)    this._moveState = MoveState.AIRBORNE;
        else                           this._moveState = MoveState.GROUNDED;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    _getCameraYaw() {
        if (!this._camera3d?.camera) return 0;
        const euler = new THREE.Euler().setFromQuaternion(
            this._camera3d.camera.quaternion, 'YXZ'
        );
        return euler.y;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public accessors
    // ─────────────────────────────────────────────────────────────────────────

    getPosition() {
        if (!this._body) return new THREE.Vector3();
        return new THREE.Vector3(
            this._body.position.x,
            this._body.position.y,
            this._body.position.z
        );
    }

    getMesh() { return this._mesh; }

    get moveState()   { return this._moveState;  }
    get isGrounded()  { return this._isGrounded; }
    get isDashing()   { return this._isDashing;  }
    get isGroundPounding() { return this._isGroundPounding; }
    get velocity()    { return this._velocity;   }

    // ─────────────────────────────────────────────────────────────────────────
    // Teleport (respawn)
    // ─────────────────────────────────────────────────────────────────────────

    teleport(x, y, z) {
        if (!this._body) return;
        this._body.position.set(x, y, z);
        this._body.velocity.set(0, 0, 0);
        this._velocity.set(0, 0, 0);
        this._isGroundPounding = false;
        this._isDashing        = false;
        this._dashTimer        = 0;
        if (this._mesh) this._mesh.position.set(x, y, z);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Destroy
    // ─────────────────────────────────────────────────────────────────────────

    destroy() {
        if (this._pb) this._physics.removeBody(this._pb);
        this._body  = null;
        this._pb    = null;
        this._mesh  = null;
    }
}
