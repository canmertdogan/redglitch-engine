/**
 * Raycast3D.js — Raycasting, overlap queries, LayerMask, and collision shape helpers.
 *
 * Features:
 *  - raycastScreen(): NDC mouse → world ray against scene objects
 *  - raycastWorld(): arbitrary origin+direction ray
 *  - OverlapSphere / OverlapBox: AoE proximity queries
 *  - LayerMask: bitmask-based selective collision filtering
 *  - CollisionShape helpers: Box, Sphere, Capsule, ConvexHull, Trimesh Three.js helpers
 *  - Physics3DWorld bridge: register physics body meshes as collision geometry
 *
 * Usage (ES module):
 *
 *   import Raycast3D, { LayerMask, CollisionShape } from '/engines/shared/Raycast3D.js';
 *
 *   const ray = new Raycast3D(camera, scene);
 *
 *   // Screen-space pick (e.g. editor click)
 *   const hit = ray.raycastScreen(mouseX, mouseY, canvas.width, canvas.height);
 *   if (hit) console.log(hit.object.name, hit.point, hit.distance);
 *
 *   // World ray
 *   const hits = ray.raycastWorld(origin, direction, { maxDist: 50, layerMask: LayerMask.TERRAIN });
 *
 *   // AoE overlap
 *   const nearby = ray.overlapSphere(center, 5, { layerMask: LayerMask.ENEMY });
 *
 *   // Layer registration
 *   ray.addToLayer(mesh, LayerMask.ENEMY);
 *
 *   // Physics bridge
 *   ray.syncFromPhysicsWorld(physics3DWorld);
 */

import * as THREE from '/lib/three/three.module.js';

// ── LayerMask ────────────────────────────────────────────────────────────────

/**
 * Bitmask constants for collision layer filtering.
 * Each value is a power-of-two bit.  Combine with | to create multi-layer masks.
 *
 *   LayerMask.TERRAIN | LayerMask.PROP  → hits terrain and props only
 */
export const LayerMask = Object.freeze({
    NONE:        0,
    DEFAULT:     1 << 0,   // 1
    TERRAIN:     1 << 1,   // 2
    ENTITY:      1 << 2,   // 4
    ENEMY:       1 << 3,   // 8
    PLAYER:      1 << 4,   // 16
    PROP:        1 << 5,   // 32
    TRIGGER:     1 << 6,   // 64
    PROJECTILE:  1 << 7,   // 128
    UI:          1 << 8,   // 256
    ALL:         0xFFFFFF, // all layers
});

// ── CollisionShape helpers ────────────────────────────────────────────────────

/**
 * Factory helpers that create Three.js Mesh visualisers for collision shapes.
 * These are wire-frame debug meshes — NOT physics bodies (use Physics3DWorld for that).
 */
export const CollisionShape = {

    /**
     * Axis-aligned box.
     * @param {THREE.Vector3} halfExtents
     * @returns {THREE.Mesh}
     */
    box(halfExtents) {
        const geo = new THREE.BoxGeometry(
            halfExtents.x * 2,
            halfExtents.y * 2,
            halfExtents.z * 2,
        );
        return _wireMesh(geo);
    },

    /**
     * Sphere.
     * @param {number} radius
     * @returns {THREE.Mesh}
     */
    sphere(radius) {
        const geo = new THREE.SphereGeometry(radius, 12, 8);
        return _wireMesh(geo);
    },

    /**
     * Capsule (cylinder + hemisphere end-caps).
     * @param {number} radius
     * @param {number} height  Total height including hemispheres
     * @returns {THREE.Group}
     */
    capsule(radius, height) {
        const body = new THREE.CylinderGeometry(radius, radius, Math.max(0, height - radius * 2), 12);
        const capT = new THREE.SphereGeometry(radius, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        const capB = new THREE.SphereGeometry(radius, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);

        const group = new THREE.Group();
        group.add(_wireMesh(body));

        const top = _wireMesh(capT);
        top.position.y = (height / 2) - radius;
        group.add(top);

        const bot = _wireMesh(capB);
        bot.position.y = -(height / 2) + radius;
        group.add(bot);

        return group;
    },

    /**
     * Convex hull from an array of Vector3 points.
     * @param {THREE.Vector3[]} points
     * @returns {THREE.Mesh}
     */
    convexHull(points) {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(points.length * 3);
        points.forEach((p, i) => { pos[i*3]=p.x; pos[i*3+1]=p.y; pos[i*3+2]=p.z; });
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.computeBoundingBox();
        return _wireMesh(geo);
    },

    /**
     * Trimesh from an existing BufferGeometry (static terrain).
     * @param {THREE.BufferGeometry} geometry
     * @returns {THREE.Mesh}
     */
    trimesh(geometry) {
        return _wireMesh(geometry.clone());
    },
};

// ── Raycast3D ─────────────────────────────────────────────────────────────────

class Raycast3D {
    /**
     * @param {THREE.Camera}  camera   Active scene camera
     * @param {THREE.Scene}   scene    Scene to cast against by default
     */
    constructor(camera, scene) {
        this.camera = camera;
        this.scene  = scene;

        this._raycaster = new THREE.Raycaster();

        /**
         * Layer registry: Map<layerBit, THREE.Object3D[]>
         * Objects can belong to multiple layers.
         */
        this._layers = new Map();

        /** Quick reverse lookup: Object3D → combined bitmask */
        this._objectMask = new Map();
    }

    // ── Layer registration ────────────────────────────────────────────────────

    /**
     * Register an object on one or more layers.
     * @param {THREE.Object3D} obj
     * @param {number}         mask  LayerMask bitmask (can combine bits)
     */
    addToLayer(obj, mask) {
        const prev = this._objectMask.get(obj) ?? 0;
        this._objectMask.set(obj, prev | mask);

        for (let bit = 1; bit <= LayerMask.ALL; bit <<= 1) {
            if (!(mask & bit)) continue;
            if (!this._layers.has(bit)) this._layers.set(bit, []);
            const arr = this._layers.get(bit);
            if (!arr.includes(obj)) arr.push(obj);
        }
    }

    /**
     * Remove an object from all layers.
     * @param {THREE.Object3D} obj
     */
    removeFromLayers(obj) {
        this._objectMask.delete(obj);
        for (const arr of this._layers.values()) {
            const idx = arr.indexOf(obj);
            if (idx !== -1) arr.splice(idx, 1);
        }
    }

    /**
     * Get all objects belonging to a layer mask.
     * @param {number} mask
     * @returns {THREE.Object3D[]}
     */
    getLayerObjects(mask) {
        if (mask === LayerMask.ALL) {
            return [...this._objectMask.keys()];
        }
        const result = new Set();
        for (let bit = 1; bit <= LayerMask.ALL; bit <<= 1) {
            if (!(mask & bit)) continue;
            const arr = this._layers.get(bit);
            if (arr) arr.forEach(o => result.add(o));
        }
        return [...result];
    }

    // ── Screen-space raycast ──────────────────────────────────────────────────

    /**
     * Cast a ray from camera through a screen pixel.
     * Returns the closest hit or null.
     *
     * @param {number}  screenX     Pixel X (client coords or canvas-relative)
     * @param {number}  screenY     Pixel Y
     * @param {number}  canvasW     Canvas width in pixels
     * @param {number}  canvasH     Canvas height in pixels
     * @param {object}  [opts]
     * @param {number}  [opts.layerMask=LayerMask.ALL]
     * @param {boolean} [opts.recursive=true]
     * @param {number}  [opts.maxDist=Infinity]
     * @returns {THREE.Intersection|null}
     */
    raycastScreen(screenX, screenY, canvasW, canvasH, opts = {}) {
        const ndc = new THREE.Vector2(
            (screenX / canvasW)  * 2 - 1,
            -(screenY / canvasH) * 2 + 1,
        );
        this._raycaster.setFromCamera(ndc, this.camera);
        if (opts.maxDist !== undefined) this._raycaster.far = opts.maxDist;

        const targets = this._resolveTargets(opts.layerMask ?? LayerMask.ALL);
        const hits    = this._raycaster.intersectObjects(targets, opts.recursive !== false);

        this._raycaster.far = Infinity; // reset
        return hits.length > 0 ? hits[0] : null;
    }

    /**
     * Cast a ray from camera through a screen pixel, returning all hits.
     * @param {number} screenX
     * @param {number} screenY
     * @param {number} canvasW
     * @param {number} canvasH
     * @param {object} [opts]
     * @returns {THREE.Intersection[]}
     */
    raycastScreenAll(screenX, screenY, canvasW, canvasH, opts = {}) {
        const ndc = new THREE.Vector2(
            (screenX / canvasW)  * 2 - 1,
            -(screenY / canvasH) * 2 + 1,
        );
        this._raycaster.setFromCamera(ndc, this.camera);
        if (opts.maxDist !== undefined) this._raycaster.far = opts.maxDist;
        const targets = this._resolveTargets(opts.layerMask ?? LayerMask.ALL);
        const hits    = this._raycaster.intersectObjects(targets, opts.recursive !== false);
        this._raycaster.far = Infinity;
        return hits;
    }

    // ── World-space raycast ───────────────────────────────────────────────────

    /**
     * Cast a ray from an arbitrary world origin in a given direction.
     * Returns the closest hit or null.
     *
     * @param {THREE.Vector3} origin
     * @param {THREE.Vector3} direction  (need not be normalised)
     * @param {object}        [opts]
     * @param {number}        [opts.layerMask=LayerMask.ALL]
     * @param {number}        [opts.maxDist=Infinity]
     * @param {boolean}       [opts.recursive=true]
     * @returns {THREE.Intersection|null}
     */
    raycastWorld(origin, direction, opts = {}) {
        _normDir.copy(direction).normalize();
        this._raycaster.set(origin, _normDir);
        if (opts.maxDist !== undefined) this._raycaster.far = opts.maxDist;

        const targets = this._resolveTargets(opts.layerMask ?? LayerMask.ALL);
        const hits    = this._raycaster.intersectObjects(targets, opts.recursive !== false);

        this._raycaster.far = Infinity;
        return hits.length > 0 ? hits[0] : null;
    }

    /**
     * Cast a world ray and return all hits sorted by distance.
     * @param {THREE.Vector3} origin
     * @param {THREE.Vector3} direction
     * @param {object}        [opts]
     * @returns {THREE.Intersection[]}
     */
    raycastWorldAll(origin, direction, opts = {}) {
        _normDir.copy(direction).normalize();
        this._raycaster.set(origin, _normDir);
        if (opts.maxDist !== undefined) this._raycaster.far = opts.maxDist;
        const targets = this._resolveTargets(opts.layerMask ?? LayerMask.ALL);
        const hits    = this._raycaster.intersectObjects(targets, opts.recursive !== false);
        this._raycaster.far = Infinity;
        return hits;
    }

    // ── Overlap queries (AoE) ─────────────────────────────────────────────────

    /**
     * Find all registered objects whose bounding sphere overlaps a world sphere.
     * Useful for AoE damage, proximity triggers, enemy awareness.
     *
     * @param {THREE.Vector3} center
     * @param {number}        radius
     * @param {object}        [opts]
     * @param {number}        [opts.layerMask=LayerMask.ALL]
     * @param {boolean}       [opts.precise=false]  true = use bounding box for finer test
     * @returns {THREE.Object3D[]}
     */
    overlapSphere(center, radius, opts = {}) {
        const candidates = this._resolveTargets(opts.layerMask ?? LayerMask.ALL);
        const r2 = radius * radius;
        const results = [];

        for (const obj of candidates) {
            if (!obj.isMesh) continue;

            if (opts.precise) {
                // Bounding box overlap: build box and check distance to center
                _box.setFromObject(obj);
                if (_box.distanceToPoint(center) <= radius) results.push(obj);
            } else {
                // Bounding sphere (fast)
                if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
                const bs = obj.geometry.boundingSphere;
                _tmp.copy(bs.center).applyMatrix4(obj.matrixWorld);
                const worldR = bs.radius * _maxScale(obj.matrixWorld);
                const dist2  = _tmp.distanceToSquared(center);
                if (dist2 <= (radius + worldR) ** 2) results.push(obj);
            }
        }

        return results;
    }

    /**
     * Find all registered objects whose bounding sphere overlaps an axis-aligned box.
     * Useful for room/zone trigger detection.
     *
     * @param {THREE.Vector3} min  Box minimum corner
     * @param {THREE.Vector3} max  Box maximum corner
     * @param {object}        [opts]
     * @param {number}        [opts.layerMask=LayerMask.ALL]
     * @returns {THREE.Object3D[]}
     */
    overlapBox(min, max, opts = {}) {
        _queryBox.min.copy(min);
        _queryBox.max.copy(max);

        const candidates = this._resolveTargets(opts.layerMask ?? LayerMask.ALL);
        const results = [];

        for (const obj of candidates) {
            if (!obj.isMesh) continue;
            _box.setFromObject(obj);
            if (_queryBox.intersectsBox(_box)) results.push(obj);
        }

        return results;
    }

    // ── Physics3DWorld bridge ─────────────────────────────────────────────────

    /**
     * Sync registered collision objects from a Physics3DWorld instance.
     * Adds all dynamic/static body meshes to their appropriate layers.
     * Call after bodies are created, or whenever the physics world changes.
     *
     * @param {import('./Physics3DWorld.js').default} physicsWorld
     * @param {object} [layerMap]  { bodyType: layerMask }  e.g. { STATIC: LayerMask.TERRAIN }
     */
    syncFromPhysicsWorld(physicsWorld, layerMap = {}) {
        const defaults = {
            STATIC:    LayerMask.TERRAIN,
            DYNAMIC:   LayerMask.ENTITY,
            KINEMATIC: LayerMask.PROP,
            ...layerMap,
        };

        for (const pb of physicsWorld._bodies) {
            if (!pb.mesh) continue;
            const mask = defaults[pb.type] ?? LayerMask.DEFAULT;
            // Only add if not already registered
            if (!this._objectMask.has(pb.mesh)) {
                this.addToLayer(pb.mesh, mask);
            }
        }

        console.log(`[Raycast3D] synced ${physicsWorld._bodies.length} physics bodies`);
    }

    // ── Update ────────────────────────────────────────────────────────────────

    /**
     * Update the camera reference (call if camera changes at runtime).
     * @param {THREE.Camera} camera
     */
    setCamera(camera) { this.camera = camera; }

    // ── Dispose ───────────────────────────────────────────────────────────────

    dispose() {
        this._layers.clear();
        this._objectMask.clear();
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /**
     * Resolve cast targets: if layerMask is ALL and no layers registered,
     * fall back to the whole scene for convenience.
     */
    _resolveTargets(mask) {
        if (mask === LayerMask.ALL && this._objectMask.size === 0) {
            return this.scene ? [this.scene] : [];
        }
        if (mask === LayerMask.ALL) {
            return [...this._objectMask.keys()];
        }
        return this.getLayerObjects(mask);
    }
}

// ── Private helpers ───────────────────────────────────────────────────────────

const _normDir   = new THREE.Vector3();
const _tmp       = new THREE.Vector3();
const _box       = new THREE.Box3();
const _queryBox  = new THREE.Box3();

const _mat3 = new THREE.Matrix3();

/** Get the maximum world scale from a matrixWorld (for bounding sphere scaling). */
function _maxScale(matrixWorld) {
    _mat3.setFromMatrix4(matrixWorld);
    // Approximate: max column length
    const e = _mat3.elements;
    const sx = Math.hypot(e[0], e[1], e[2]);
    const sy = Math.hypot(e[3], e[4], e[5]);
    const sz = Math.hypot(e[6], e[7], e[8]);
    return Math.max(sx, sy, sz);
}

/** Build a wireframe debug mesh from a geometry. */
function _wireMesh(geo) {
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0x00ff88,
        wireframe: true,
        transparent: true,
        opacity: 0.4,
    }));
}

// ── Export ────────────────────────────────────────────────────────────────────

export { LayerMask, CollisionShape };
export default Raycast3D;
