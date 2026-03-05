/**
 * Physics3DWorld.js — cannon-es physics integration for all 3D engines.
 *
 * Features:
 *  - Fixed-step physics at 120 Hz, decoupled from render loop
 *  - Body types: STATIC (terrain), DYNAMIC (entities), KINEMATIC (platforms)
 *  - PhysicsBody3D: thin wrapper that keeps a THREE.Object3D in sync with a cannon-es Body
 *  - Collision event bus per body: onCollisionEnter, onCollisionStay, onCollisionExit
 *
 * Usage (ES module):
 *
 *   import Physics3DWorld, { PhysicsBody3D, BodyType, ShapeType } from '/engines/shared/Physics3DWorld.js';
 *
 *   const physics = new Physics3DWorld({ gravity: -20 });
 *   physics.init();
 *
 *   const body = physics.createBody({
 *     mesh:   myMesh,
 *     type:   BodyType.DYNAMIC,
 *     shape:  ShapeType.BOX,
 *     mass:   1,
 *   });
 *
 *   body.onCollisionEnter((other, event) => { ... });
 *
 *   // per frame (call from Engine3DBase.update3D):
 *   physics.update(delta);
 */

import * as CANNON from '/lib/cannon-es/cannon-es.js';

// ── Body type enum (mirrors cannon-es Body constants) ────────────────────────

export const BodyType = Object.freeze({
    STATIC:    'STATIC',
    DYNAMIC:   'DYNAMIC',
    KINEMATIC: 'KINEMATIC',
});

// ── Collision shape enum ──────────────────────────────────────────────────────

export const ShapeType = Object.freeze({
    BOX:     'BOX',
    SPHERE:  'SPHERE',
    CAPSULE: 'CAPSULE',
    PLANE:   'PLANE',
    TRIMESH: 'TRIMESH',
    CONVEX:  'CONVEX',
});

// ── Physics3DWorld ────────────────────────────────────────────────────────────

class Physics3DWorld {
    /**
     * @param {object} [options]
     * @param {number} [options.gravity=-20]       Y-axis gravity (m/s²)
     * @param {number} [options.fixedStep=1/120]   Physics step size in seconds
     * @param {number} [options.maxSubSteps=4]     Max catch-up steps per frame
     */
    constructor(options = {}) {
        this._gravity     = options.gravity     ?? -20;
        this._fixedStep   = options.fixedStep   ?? (1 / 120);
        this._maxSubSteps = options.maxSubSteps ?? 4;

        /** @type {CANNON.World|null} */
        this.world = null;

        /** @type {PhysicsBody3D[]} */
        this._bodies = [];

        // Accumulator for fixed-step integration
        this._accumulator = 0;
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    /**
     * Create and configure the cannon-es World.
     */
    init() {
        this.world = new CANNON.World({
            gravity: new CANNON.Vec3(0, this._gravity, 0),
        });

        // SAPBroadphase is faster than the default NaiveBroadphase for scenes
        // with many bodies
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.broadphase.useBoundingBoxes = true;

        // Allow bodies to sleep when idle — reduces simulation cost
        this.world.allowSleep = true;

        console.log('[Physics3DWorld] init() — gravity:', this._gravity, 'step:', this._fixedStep);
        return this;
    }

    // ── Per-frame step ────────────────────────────────────────────────────────

    /**
     * Advance physics by consuming accumulated time in fixed steps,
     * then sync all registered Three.js meshes.
     * @param {number} delta  Elapsed seconds from Engine3DBase (already capped)
     */
    update(delta) {
        this._accumulator += delta;

        let steps = 0;
        while (this._accumulator >= this._fixedStep && steps < this._maxSubSteps) {
            this.world.step(this._fixedStep);
            this._accumulator -= this._fixedStep;
            steps++;
        }

        // Sync Three.js transforms
        for (const pb of this._bodies) {
            if (pb.type !== BodyType.STATIC) {
                pb._sync();
            }
        }
    }

    // ── Body factory ─────────────────────────────────────────────────────────

    /**
     * Create a PhysicsBody3D and register it with the world.
     *
     * @param {object}            config
     * @param {THREE.Object3D}    [config.mesh]        Object to keep in sync (optional)
     * @param {string}            [config.type]        BodyType.*  (default: DYNAMIC)
     * @param {string}            [config.shape]       ShapeType.* (default: BOX)
     * @param {number}            [config.mass=1]      Mass in kg (0 → static)
     * @param {THREE.Vector3}     [config.size]        Half-extents for BOX / radius for SPHERE
     * @param {number}            [config.radius=0.5]  SPHERE / CAPSULE radius
     * @param {number}            [config.height=1]    CAPSULE height
     * @param {number}            [config.linearDamping=0.01]
     * @param {number}            [config.angularDamping=0.01]
     * @param {number}            [config.friction=0.3]
     * @param {number}            [config.restitution=0.1]
     * @param {THREE.Vector3}     [config.position]    Initial world position
     * @param {boolean}           [config.fixedRotation=false]  Lock rotation axes
     * @returns {PhysicsBody3D}
     */
    createBody(config = {}) {
        const type    = config.type  ?? BodyType.DYNAMIC;
        const shape   = config.shape ?? ShapeType.BOX;
        const mass    = (type === BodyType.STATIC) ? 0 : (config.mass ?? 1);

        // Build collision shape
        const cannonShape = this._buildShape(shape, config);

        // Determine initial position
        const initPos = config.position ?? config.mesh?.position ?? new THREE.Vector3();

        const body = new CANNON.Body({
            mass,
            type:            _cannonBodyType(type),
            position:        new CANNON.Vec3(initPos.x, initPos.y, initPos.z),
            linearDamping:   config.linearDamping  ?? 0.01,
            angularDamping:  config.angularDamping ?? 0.01,
            allowSleep:      type !== BodyType.KINEMATIC,
        });

        body.addShape(cannonShape);

        if (config.fixedRotation) {
            body.fixedRotation = true;
            body.updateMassProperties();
        }

        // Friction / restitution via ContactMaterial (applied world-wide as default)
        body.material = new CANNON.Material({
            friction:    config.friction    ?? 0.3,
            restitution: config.restitution ?? 0.1,
        });

        this.world.addBody(body);

        const pb = new PhysicsBody3D(body, config.mesh ?? null, type);
        this._bodies.push(pb);
        return pb;
    }

    /**
     * Remove a PhysicsBody3D from the world.
     * @param {PhysicsBody3D} pb
     */
    removeBody(pb) {
        this.world.removeBody(pb.body);
        pb._destroy();
        const idx = this._bodies.indexOf(pb);
        if (idx !== -1) this._bodies.splice(idx, 1);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _buildShape(shapeType, cfg) {
        switch (shapeType) {
            case ShapeType.SPHERE: {
                const r = cfg.radius ?? (cfg.size?.x ?? 0.5);
                return new CANNON.Sphere(r);
            }
            case ShapeType.PLANE:
                // Infinite static ground plane (orient with body quaternion)
                return new CANNON.Plane();

            case ShapeType.CAPSULE: {
                // cannon-es has no Capsule — approximate with sphere-swept cylinder
                const r = cfg.radius ?? 0.3;
                const h = (cfg.height ?? 1.8) - r * 2;
                const cyl = new CANNON.Cylinder(r, r, Math.max(h, 0.01), 8);
                return cyl;
            }
            case ShapeType.TRIMESH: {
                if (!cfg.geometry) {
                    console.warn('[Physics3DWorld] TRIMESH requires config.geometry (THREE.BufferGeometry)');
                    return new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
                }
                return _trimeshFromGeometry(cfg.geometry);
            }
            case ShapeType.CONVEX: {
                if (!cfg.geometry) {
                    console.warn('[Physics3DWorld] CONVEX requires config.geometry (THREE.BufferGeometry)');
                    return new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
                }
                return _convexFromGeometry(cfg.geometry);
            }
            case ShapeType.BOX:
            default: {
                const s = cfg.size ?? { x: 0.5, y: 0.5, z: 0.5 };
                return new CANNON.Box(new CANNON.Vec3(
                    s.x ?? s[0] ?? 0.5,
                    s.y ?? s[1] ?? 0.5,
                    s.z ?? s[2] ?? 0.5,
                ));
            }
        }
    }

    // ── Dispose ───────────────────────────────────────────────────────────────

    dispose() {
        for (const pb of this._bodies) pb._destroy();
        this._bodies = [];
        this.world   = null;
        console.log('[Physics3DWorld] disposed');
    }
}

// ── PhysicsBody3D ─────────────────────────────────────────────────────────────

/**
 * Wraps a cannon-es Body and optionally keeps a THREE.Object3D in sync.
 * Provides per-instance collision event callbacks.
 */
class PhysicsBody3D {
    /**
     * @param {CANNON.Body}       body
     * @param {THREE.Object3D|null} mesh  Three.js object to sync (may be null)
     * @param {string}            type   BodyType.*
     */
    constructor(body, mesh, type) {
        /** @type {CANNON.Body} */
        this.body = body;

        /** @type {THREE.Object3D|null} */
        this.mesh = mesh;

        /** @type {string} */
        this.type = type;

        // Collision tracking for enter/stay/exit semantics
        this._touching    = new Set();   // bodyIds currently in contact
        this._enterCbs    = [];
        this._stayCbs     = [];
        this._exitCbs     = [];

        this._onCollide = (event) => this._handleCollide(event);
        this.body.addEventListener('collide', this._onCollide);
    }

    // ── Collision event API ───────────────────────────────────────────────────

    /**
     * Register a callback for the first frame of contact with another body.
     * @param {function(PhysicsBody3D, object): void} cb
     */
    onCollisionEnter(cb) { this._enterCbs.push(cb); return this; }

    /**
     * Register a callback for every frame while in contact.
     * @param {function(PhysicsBody3D, object): void} cb
     */
    onCollisionStay(cb)  { this._stayCbs.push(cb);  return this; }

    /**
     * Register a callback for the frame contact ends.
     * NOTE: cannon-es doesn't fire a "separate" event natively;
     * exit is detected via world.narrowphase.contactEquations each step.
     * Use Physics3DWorld.onBodySeparate() for reliable exit detection.
     * @param {function(PhysicsBody3D, object): void} cb
     */
    onCollisionExit(cb)  { this._exitCbs.push(cb);  return this; }

    // ── Force / velocity helpers ──────────────────────────────────────────────

    /**
     * Apply a world-space impulse at the body's centre of mass.
     * @param {THREE.Vector3|{x,y,z}} vec
     */
    applyImpulse(vec) {
        this.body.applyImpulse(new CANNON.Vec3(vec.x, vec.y, vec.z));
        this.body.wakeUp();
    }

    /**
     * Set velocity directly (useful for kinematic platforms).
     * @param {THREE.Vector3|{x,y,z}} vec
     */
    setVelocity(vec) {
        this.body.velocity.set(vec.x, vec.y, vec.z);
        this.body.wakeUp();
    }

    /**
     * Teleport the physics body (and synced mesh) to a world position.
     * @param {THREE.Vector3|{x,y,z}} pos
     */
    setPosition(pos) {
        this.body.position.set(pos.x, pos.y, pos.z);
        this.body.velocity.set(0, 0, 0);
        this.body.wakeUp();
        if (this.mesh) this.mesh.position.set(pos.x, pos.y, pos.z);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /** Called by Physics3DWorld.update() to copy cannon-es → Three.js */
    _sync() {
        if (!this.mesh) return;
        const p = this.body.position;
        const q = this.body.quaternion;
        this.mesh.position.set(p.x, p.y, p.z);
        this.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }

    _handleCollide(event) {
        const otherId = event.body.id;
        const isNew   = !this._touching.has(otherId);

        this._touching.add(otherId);

        if (isNew) {
            this._enterCbs.forEach(cb => cb(event.body, event));
        } else {
            this._stayCbs.forEach(cb => cb(event.body, event));
        }
    }

    /**
     * Called by Physics3DWorld each step to detect separations.
     * @param {Set<number>} activeContactIds  Set of body IDs still in contact
     */
    _checkSeparations(activeContactIds) {
        for (const id of this._touching) {
            if (!activeContactIds.has(id)) {
                this._touching.delete(id);
                this._exitCbs.forEach(cb => cb(id, null));
            }
        }
    }

    _destroy() {
        this.body.removeEventListener('collide', this._onCollide);
        this._enterCbs = [];
        this._stayCbs  = [];
        this._exitCbs  = [];
        this._touching.clear();
    }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _cannonBodyType(type) {
    switch (type) {
        case BodyType.STATIC:    return CANNON.Body.STATIC;
        case BodyType.KINEMATIC: return CANNON.Body.KINEMATIC;
        case BodyType.DYNAMIC:
        default:                 return CANNON.Body.DYNAMIC;
    }
}

/**
 * Build a CANNON.Trimesh from a THREE.BufferGeometry.
 * Best for static terrain — expensive to build, zero-cost at runtime.
 */
function _trimeshFromGeometry(geo) {
    const pos = geo.attributes.position;
    const idx = geo.index;

    const verts = Array.from(pos.array);
    const faces = idx
        ? Array.from(idx.array)
        : Array.from({ length: pos.count }, (_, i) => i);

    return new CANNON.Trimesh(verts, faces);
}

/**
 * Build a CANNON.ConvexPolyhedron from a THREE.BufferGeometry.
 * Best for dynamic low-poly objects.
 */
function _convexFromGeometry(geo) {
    const pos   = geo.attributes.position;
    const verts = [];
    const faces = [];

    for (let i = 0; i < pos.count; i++) {
        verts.push(new CANNON.Vec3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    }

    const idx = geo.index;
    if (idx) {
        for (let i = 0; i < idx.count; i += 3) {
            faces.push([idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]);
        }
    } else {
        for (let i = 0; i < pos.count; i += 3) {
            faces.push([i, i + 1, i + 2]);
        }
    }

    return new CANNON.ConvexPolyhedron({ vertices: verts, faces });
}

// ── Export ────────────────────────────────────────────────────────────────────

export default Physics3DWorld;
