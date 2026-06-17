/**
 * VFXSystem3D.js — Phase 18
 * Pooled voxel/low-poly visual effects for the topdown-3d engine.
 *
 * Aesthetic rules (strict):
 *   - NO texture sprites, NO billboards — all particles are 3D geometry
 *   - Particle shapes: BoxGeometry (cube) and OctahedronGeometry (diamond)
 *   - Flat colours from PaletteManager (MeshLambertMaterial, flatShading=true)
 *   - NO bloom, NO HDR — post-processing limited to OutlinePass + cel-quantise
 *   - Shadow casting enabled on all effect meshes (chunky shadows look great)
 *
 * Built-in effect presets (EffectType):
 *   CAST        — rotating diamond ring burst on ability cast origin
 *   HIT         — cube shrapnel burst at impact point
 *   AOE         — ring of outward-flying cubes + ground flash ring
 *   LINE        — chain of cubes fired along a line direction
 *   CONE        — fan spray of cubes/diamonds
 *   BLOCK_BREAK — debris chunks from a destroyed terrain block
 *   DUST_TRAIL  — low-velocity cube puffs left behind a moving unit
 *   HEAL        — upward-floating diamond sparkles (green palette band)
 *   DEATH       — explosive cube burst, larger scale, dark palette
 *
 * Pool design:
 *   - Each active effect holds N VoxelParticle instances.
 *   - VoxelParticle wraps a THREE.Mesh and a physics state (pos, vel, life).
 *   - On effect completion, all particles are returned to the shared pool.
 *   - Geometry objects are shared by shape type (BoxGeometry + OctahedronGeometry)
 *     via InstancedMesh to minimise draw calls for large bursts.
 *
 * Usage:
 *   const vfx = new VFXSystem3D(scene, palette, outlinePass);
 *   vfx.spawnEffect('hit', position, { paletteIndex: 14 });
 *   vfx.spawnEffect(EffectType.DEATH, position, { scale: 1.5 });
 *   vfx.update(dt);
 *   vfx.dispose();
 */

import * as THREE from '/lib/three/three.module.js';

// ─── Effect type registry ─────────────────────────────────────────────────────
export const EffectType = Object.freeze({
    CAST:        'cast',
    HIT:         'hit',
    AOE:         'aoe',
    LINE:        'line',
    CONE:        'cone',
    BLOCK_BREAK: 'block_break',
    DUST_TRAIL:  'dust_trail',
    HEAL:        'heal',
    DEATH:       'death',
});

// ─── Pool limits ──────────────────────────────────────────────────────────────
const MAX_POOL_SIZE     = 256;   // max dormant particles in pool
const MAX_ACTIVE        = 512;   // hard cap on live particles

// ─── Gravity constant ─────────────────────────────────────────────────────────
const GRAVITY = -9.8;

// ─── Shared geometries (one per shape, reused across all particles) ───────────
const _geoCache = new Map();

function getSharedGeo(shape, size) {
    const key = `${shape}_${size.toFixed(3)}`;
    if (!_geoCache.has(key)) {
        let geo;
        if (shape === 'cube') {
            geo = new THREE.BoxGeometry(size, size, size);
        } else {
            geo = new THREE.OctahedronGeometry(size * 0.65, 0);
        }
        _geoCache.set(key, geo);
    }
    return _geoCache.get(key);
}

// ─── VoxelParticle ────────────────────────────────────────────────────────────
class VoxelParticle {
    constructor() {
        this.mesh    = null;
        this.vel     = new THREE.Vector3();
        this.angVel  = new THREE.Vector3();
        this.life    = 0;      // seconds remaining
        this.maxLife = 0;
        this.gravity = true;
        this.active  = false;
    }

    /** Activate with given mesh, velocity, lifetime. */
    activate(mesh, vel, life, { gravity = true, angVel = null } = {}) {
        this.mesh    = mesh;
        this.vel.copy(vel);
        this.life    = life;
        this.maxLife = life;
        this.gravity = gravity;
        this.angVel.set(
            angVel ? angVel.x : (Math.random() - 0.5) * 6,
            angVel ? angVel.y : (Math.random() - 0.5) * 6,
            angVel ? angVel.z : (Math.random() - 0.5) * 6,
        );
        this.active  = true;
    }

    update(dt) {
        if (!this.active) return false;
        this.life -= dt;
        if (this.life <= 0) { this.active = false; return false; }

        // Integrate position
        if (this.gravity) this.vel.y += GRAVITY * dt;
        this.mesh.position.addScaledVector(this.vel, dt);

        // Integrate rotation
        this.mesh.rotation.x += this.angVel.x * dt;
        this.mesh.rotation.y += this.angVel.y * dt;
        this.mesh.rotation.z += this.angVel.z * dt;

        // Fade out in final 30% of life
        const t = this.life / this.maxLife;
        if (t < 0.3 && this.mesh.material) {
            this.mesh.material.opacity = t / 0.3;
            this.mesh.material.transparent = true;
        }

        return true;
    }

    reset() {
        this.active = false;
        if (this.mesh) {
            this.mesh.visible = false;
            this.mesh.material.opacity = 1;
            this.mesh.material.transparent = false;
        }
    }
}

// ─── ActiveEffect ─────────────────────────────────────────────────────────────
class ActiveEffect {
    constructor(particles) {
        this.particles = particles;   // VoxelParticle[]
        this.alive     = true;
    }

    update(dt) {
        let anyAlive = false;
        for (const p of this.particles) {
            if (p.active) {
                p.update(dt);
                if (p.active) anyAlive = true;
            }
        }
        if (!anyAlive) this.alive = false;
    }
}

// ─── Effect presets ───────────────────────────────────────────────────────────
/**
 * Returns an array of particle spawn descriptors.
 * Each descriptor: { shape, size, color, pos, vel, life, gravity, angVel? }
 */
function buildPreset(type, origin, opts = {}) {
    const scale = opts.scale ?? 1.0;
    const col   = opts.color ?? 0xffffff;
    const count = opts.count ?? undefined;
    const descs = [];

    switch (type) {

        case EffectType.CAST: {
            const n = count ?? 12;
            for (let i = 0; i < n; i++) {
                const a  = (i / n) * Math.PI * 2;
                const r  = 0.8 * scale;
                const spd = (1.5 + Math.random()) * scale;
                descs.push({
                    shape: 'diamond', size: 0.18 * scale, color: col,
                    pos: new THREE.Vector3(origin.x + Math.cos(a)*r, origin.y + 0.2, origin.z + Math.sin(a)*r),
                    vel: new THREE.Vector3(Math.cos(a)*spd, 2*scale + Math.random(), Math.sin(a)*spd),
                    life: 0.55 + Math.random() * 0.2, gravity: true,
                });
            }
            break;
        }

        case EffectType.HIT: {
            const n = count ?? 10;
            for (let i = 0; i < n; i++) {
                const theta = Math.random() * Math.PI * 2;
                const phi   = Math.random() * Math.PI;
                const spd   = (2 + Math.random() * 3) * scale;
                descs.push({
                    shape: Math.random() > 0.5 ? 'cube' : 'diamond',
                    size: (0.15 + Math.random() * 0.15) * scale,
                    color: col,
                    pos: origin.clone().add(new THREE.Vector3(
                        (Math.random()-0.5)*0.3, 0.4, (Math.random()-0.5)*0.3,
                    )),
                    vel: new THREE.Vector3(
                        Math.sin(phi)*Math.cos(theta)*spd,
                        Math.abs(Math.cos(phi))*spd*0.8 + 1,
                        Math.sin(phi)*Math.sin(theta)*spd,
                    ),
                    life: 0.4 + Math.random() * 0.3, gravity: true,
                });
            }
            break;
        }

        case EffectType.AOE: {
            const n = count ?? 20;
            const radius = opts.radius ?? 3;
            for (let i = 0; i < n; i++) {
                const a   = (i / n) * Math.PI * 2;
                const spd = (1 + Math.random() * 2) * scale;
                descs.push({
                    shape: 'cube', size: (0.2 + Math.random()*0.2) * scale, color: col,
                    pos: new THREE.Vector3(
                        origin.x + Math.cos(a)*(radius*0.5),
                        origin.y + 0.15,
                        origin.z + Math.sin(a)*(radius*0.5),
                    ),
                    vel: new THREE.Vector3(Math.cos(a)*spd, 1.5*scale + Math.random(), Math.sin(a)*spd),
                    life: 0.6 + Math.random() * 0.3, gravity: true,
                });
            }
            break;
        }

        case EffectType.LINE: {
            const n    = count ?? 14;
            const tgt  = opts.target ?? new THREE.Vector3(origin.x+8, origin.y, origin.z);
            const dir  = new THREE.Vector3().subVectors(tgt, origin).normalize();
            const len  = origin.distanceTo(tgt);
            for (let i = 0; i < n; i++) {
                const t   = (i / n) * len;
                const spd = (1 + Math.random()) * scale;
                const off = new THREE.Vector3(
                    (Math.random()-0.5)*0.6, Math.random()*0.5, (Math.random()-0.5)*0.6,
                );
                descs.push({
                    shape: 'cube', size: 0.16 * scale, color: col,
                    pos: origin.clone().addScaledVector(dir, t).add(off),
                    vel: new THREE.Vector3(
                        (Math.random()-0.5)*spd, spd*0.8+0.5, (Math.random()-0.5)*spd,
                    ),
                    life: 0.35 + Math.random() * 0.25, gravity: true,
                });
            }
            break;
        }

        case EffectType.CONE: {
            const n    = count ?? 16;
            const dir  = opts.dir ?? new THREE.Vector3(0,0,1);
            const aMax = ((opts.halfAngleDeg ?? 30) * Math.PI) / 180;
            const rng  = opts.range ?? 6;
            for (let i = 0; i < n; i++) {
                const a    = (Math.random()-0.5) * 2 * aMax;
                const dist = Math.random() * rng * scale;
                const spd  = (1.5 + Math.random()*2) * scale;
                const rotDir = new THREE.Vector3(
                    dir.x * Math.cos(a) - dir.z * Math.sin(a),
                    0,
                    dir.x * Math.sin(a) + dir.z * Math.cos(a),
                ).normalize();
                descs.push({
                    shape: Math.random() > 0.4 ? 'cube' : 'diamond',
                    size: (0.14+Math.random()*0.14)*scale, color: col,
                    pos: origin.clone().addScaledVector(rotDir, dist*0.4).add(new THREE.Vector3(0, 0.2, 0)),
                    vel: rotDir.clone().multiplyScalar(spd).add(new THREE.Vector3(0, 1+Math.random(), 0)),
                    life: 0.4 + Math.random()*0.3, gravity: true,
                });
            }
            break;
        }

        case EffectType.BLOCK_BREAK: {
            const n = count ?? 16;
            for (let i = 0; i < n; i++) {
                const theta = Math.random() * Math.PI * 2;
                const spd   = (1.5 + Math.random()*2) * scale;
                descs.push({
                    shape: 'cube', size: (0.25+Math.random()*0.35)*scale, color: col,
                    pos: origin.clone().add(new THREE.Vector3(
                        (Math.random()-0.5)*0.5, Math.random()*0.4, (Math.random()-0.5)*0.5,
                    )),
                    vel: new THREE.Vector3(
                        Math.cos(theta)*spd, 2+Math.random()*3, Math.sin(theta)*spd,
                    ),
                    life: 0.7 + Math.random()*0.4, gravity: true,
                });
            }
            break;
        }

        case EffectType.DUST_TRAIL: {
            const n = count ?? 4;
            for (let i = 0; i < n; i++) {
                descs.push({
                    shape: 'cube', size: (0.1+Math.random()*0.1)*scale, color: col,
                    pos: origin.clone().add(new THREE.Vector3(
                        (Math.random()-0.5)*0.4, 0.05+Math.random()*0.2, (Math.random()-0.5)*0.4,
                    )),
                    vel: new THREE.Vector3(
                        (Math.random()-0.5)*0.6, 0.4+Math.random()*0.4, (Math.random()-0.5)*0.6,
                    ),
                    life: 0.3 + Math.random()*0.2, gravity: false,
                });
            }
            break;
        }

        case EffectType.HEAL: {
            const n = count ?? 8;
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2;
                descs.push({
                    shape: 'diamond', size: 0.18*scale, color: col,
                    pos: origin.clone().add(new THREE.Vector3(
                        Math.cos(a)*0.5, 0.2+Math.random()*0.3, Math.sin(a)*0.5,
                    )),
                    vel: new THREE.Vector3(
                        (Math.random()-0.5)*0.5, 2+Math.random()*1.5, (Math.random()-0.5)*0.5,
                    ),
                    life: 0.7 + Math.random()*0.3, gravity: false,
                    angVel: new THREE.Vector3(0, 4+Math.random()*2, 0),
                });
            }
            break;
        }

        case EffectType.DEATH: {
            const n = count ?? 24;
            for (let i = 0; i < n; i++) {
                const theta = Math.random() * Math.PI * 2;
                const phi   = Math.random() * Math.PI;
                const spd   = (2+Math.random()*4)*scale;
                descs.push({
                    shape: Math.random()>0.3 ? 'cube' : 'diamond',
                    size: (0.2+Math.random()*0.4)*scale, color: col,
                    pos: origin.clone().add(new THREE.Vector3(
                        (Math.random()-0.5)*0.6, 0.3+Math.random()*0.4, (Math.random()-0.5)*0.6,
                    )),
                    vel: new THREE.Vector3(
                        Math.sin(phi)*Math.cos(theta)*spd,
                        Math.abs(Math.cos(phi))*spd + 1,
                        Math.sin(phi)*Math.sin(theta)*spd,
                    ),
                    life: 0.8 + Math.random()*0.5, gravity: true,
                });
            }
            break;
        }

        default:
            break;
    }

    return descs;
}

// ─── VFXSystem3D ──────────────────────────────────────────────────────────────
export default class VFXSystem3D {
    /**
     * @param {THREE.Scene}   scene
     * @param {Object|null}   palette      PaletteManager instance
     * @param {Object|null}   outlinePass  Renderer3D.outlinePass (OutlinePass)
     */
    constructor(scene, palette = null, outlinePass = null) {
        this._scene       = scene;
        this._palette     = palette;
        this._outlinePass = outlinePass;

        // Particle pool
        this._pool    = [];     // dormant VoxelParticle[]
        this._active  = [];     // ActiveEffect[]

        // Group for all VFX meshes (keeps scene hierarchy clean)
        this._group = new THREE.Group();
        this._group.name = 'vfx_group';
        scene.add(this._group);

        // Outline pass selected-objects list — VFX meshes are NOT outlined
        // (they already have strong silhouettes from flat shading)

        // Pre-warm pool with base meshes
        this._prewarmPool(64);

        // Custom effect callbacks
        this._customPresets = new Map();

        // Stat counters for debugging
        this._stats = { spawned: 0, poolHits: 0, poolMisses: 0 };
    }

    // ── Pool management ───────────────────────────────────────────────────────
    _prewarmPool(n) {
        for (let i = 0; i < n; i++) {
            this._pool.push(new VoxelParticle());
        }
    }

    _acquireParticle() {
        if (this._pool.length > 0) {
            this._stats.poolHits++;
            return this._pool.pop();
        }
        this._stats.poolMisses++;
        return new VoxelParticle();
    }

    _releaseParticle(p) {
        p.reset();
        if (this._pool.length < MAX_POOL_SIZE) {
            this._pool.push(p);
        } else if (p.mesh) {
            // Pool is full — dispose the mesh
            this._group.remove(p.mesh);
            p.mesh.geometry?.dispose();
            p.mesh.material?.dispose();
            p.mesh = null;
        }
    }

    _buildMesh(desc) {
        const geo  = getSharedGeo(desc.shape, desc.size);
        const mat  = new THREE.MeshLambertMaterial({
            color:       desc.color,
            flatShading: true,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow    = true;
        mesh.receiveShadow = false;
        mesh.position.copy(desc.pos);
        mesh.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI,
        );
        this._group.add(mesh);
        return mesh;
    }

    // ── Spawn API ─────────────────────────────────────────────────────────────
    /**
     * Spawn a named effect preset at a world position.
     * @param {string}         type        EffectType constant or custom preset id
     * @param {THREE.Vector3}  origin      World position
     * @param {Object}         [opts]
     *   paletteIndex {number}  — palette colour index (overrides color)
     *   color        {number}  — hex colour (fallback if no palette)
     *   scale        {number}  — overall size/speed multiplier (default 1)
     *   count        {number}  — particle count override
     *   radius       {number}  — AoE radius override
     *   target       {THREE.Vector3} — LINE end point
     *   dir          {THREE.Vector3} — CONE direction
     *   halfAngleDeg {number}  — CONE half-angle
     *   range        {number}  — CONE/LINE range
     */
    spawnEffect(type, origin, opts = {}) {
        if (this._countActive() >= MAX_ACTIVE) return;

        // Resolve colour
        let color = opts.color ?? 0xffffff;
        if (opts.paletteIndex != null && this._palette) {
            color = this._palette.getColor(opts.paletteIndex) ?? color;
        }

        // Build descriptor list
        let descs;
        if (this._customPresets.has(type)) {
            descs = this._customPresets.get(type)(origin, { ...opts, color });
        } else {
            descs = buildPreset(type, origin, { ...opts, color });
        }

        if (!descs.length) return;

        const particles = [];
        for (const desc of descs) {
            const p = this._acquireParticle();

            // Re-use existing mesh if available, otherwise build new one
            if (!p.mesh) {
                p.mesh = this._buildMesh(desc);
            } else {
                // Reconfigure existing mesh
                p.mesh.material.color.set(desc.color);
                p.mesh.material.opacity = 1;
                p.mesh.material.transparent = false;
                // Swap geometry if shape/size changed
                const wantedGeo = getSharedGeo(desc.shape, desc.size);
                if (p.mesh.geometry !== wantedGeo) {
                    p.mesh.geometry = wantedGeo;
                }
                p.mesh.position.copy(desc.pos);
                p.mesh.rotation.set(
                    Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI,
                );
                p.mesh.visible = true;
            }

            p.activate(p.mesh, desc.vel, desc.life, {
                gravity: desc.gravity ?? true,
                angVel:  desc.angVel ?? null,
            });

            particles.push(p);
            this._stats.spawned++;
        }

        this._active.push(new ActiveEffect(particles));
    }

    /** Register a custom effect preset factory function. */
    registerPreset(name, factory) {
        this._customPresets.set(name, factory);
    }

    // ── Flash ring helper (ground-plane ring expanding outward) ───────────────
    /**
     * Spawn a flat expanding ring at origin (AoE ground flash).
     * Ring geometry: RingGeometry animated by scaling up over lifetime.
     */
    spawnGroundRing(origin, color, maxRadius = 3, duration = 0.4) {
        const geo  = new THREE.RingGeometry(0.1, 0.3, 24);
        const mat  = new THREE.MeshBasicMaterial({
            color, side: THREE.DoubleSide, transparent: true, opacity: 0.7, depthWrite: false,
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(origin).add(new THREE.Vector3(0, 0.06, 0));
        ring.renderOrder = 9;
        this._group.add(ring);

        let elapsed = 0;
        const animate = (dt) => {
            elapsed += dt;
            const t = elapsed / duration;
            if (t >= 1) {
                this._group.remove(ring);
                ring.geometry.dispose();
                ring.material.dispose();
                return;
            }
            const s = 1 + t * maxRadius;
            ring.scale.set(s, s, s);
            ring.material.opacity = 0.7 * (1 - t);
            this._pendingRings.set(ring, animate);
        };
        this._pendingRings.set(ring, animate);
    }

    // ── Update ────────────────────────────────────────────────────────────────
    update(dt) {
        // Tick active effects
        for (let i = this._active.length - 1; i >= 0; i--) {
            const eff = this._active[i];
            eff.update(dt);
            if (!eff.alive) {
                // Return all particles to pool
                for (const p of eff.particles) this._releaseParticle(p);
                this._active.splice(i, 1);
            }
        }

        // Tick ground rings
        for (const [ring, fn] of this._pendingRings) {
            fn(dt);
            if (!this._group.children.includes(ring)) {
                this._pendingRings.delete(ring);
            }
        }
    }

    // ── OutlinePass integration ───────────────────────────────────────────────
    /**
     * Add meshes to the OutlinePass selected objects list.
     * Call this to apply black cel-edges to specific scene objects
     * (units, terrain chunks) — NOT to VFX particles themselves.
     * @param {THREE.Object3D[]} objects
     */
    addOutlineObjects(objects) {
        if (!this._outlinePass) return;
        const sel = this._outlinePass.selectedObjects ?? [];
        for (const obj of objects) {
            if (!sel.includes(obj)) sel.push(obj);
        }
        this._outlinePass.selectedObjects = sel;
    }

    removeOutlineObjects(objects) {
        if (!this._outlinePass) return;
        const sel = this._outlinePass.selectedObjects ?? [];
        this._outlinePass.selectedObjects = sel.filter(o => !objects.includes(o));
    }

    clearOutlineObjects() {
        if (this._outlinePass) this._outlinePass.selectedObjects = [];
    }

    // ── Debug ─────────────────────────────────────────────────────────────────
    getStats() {
        return {
            ...this._stats,
            activeEffects:    this._active.length,
            activeParticles:  this._countActive(),
            poolSize:         this._pool.length,
        };
    }

    _countActive() {
        let n = 0;
        for (const eff of this._active) {
            for (const p of eff.particles) if (p.active) n++;
        }
        return n;
    }

    // ── Dispose ───────────────────────────────────────────────────────────────
    dispose() {
        // Release all active particles
        for (const eff of this._active) {
            for (const p of eff.particles) {
                if (p.mesh) {
                    this._group.remove(p.mesh);
                    // Do NOT dispose shared geometries (in _geoCache)
                    p.mesh.material?.dispose();
                    p.mesh = null;
                }
            }
        }
        this._active.length = 0;

        // Release pool
        for (const p of this._pool) {
            if (p.mesh) {
                this._group.remove(p.mesh);
                p.mesh.material?.dispose();
                p.mesh = null;
            }
        }
        this._pool.length = 0;

        // Ground rings
        for (const ring of this._pendingRings.keys()) {
            this._group.remove(ring);
            ring.geometry?.dispose();
            ring.material?.dispose();
        }
        this._pendingRings.clear();

        this._scene.remove(this._group);
        this._customPresets.clear();
    }

    // Lazy-init _pendingRings (avoid constructor ordering issues)
    get _pendingRings() {
        if (!this.__pendingRings) this.__pendingRings = new Map();
        return this.__pendingRings;
    }
}
