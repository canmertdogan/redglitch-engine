/**
 * DecalSystem.js — Phase 33
 * Bullet hole decals, blood splatter, impact particles, and penetration
 * raycast for the FPS-3D engine.
 *
 * Decal approach: flat quad (PlaneGeometry) oriented to the hit surface
 * normal with a tiny normal-offset to prevent z-fighting.
 * No DecalGeometry addon required — correct for low-poly / voxel style.
 *
 * Features:
 *   - Bullet hole decals: palette-colored flat quad, normal-aligned
 *   - Pool: DECAL_POOL_MAX (200) total; oldest evicted first
 *   - Blood splatter variant: larger, dark-red, random splat rotation
 *   - Impact particles: small box debris + sparks with gravity + drag
 *   - Penetration system: thin-surface pass-through (per material type)
 *
 * Material thickness table (penetration):
 *   wood:     0.15m   can penetrate
 *   glass:    0.05m   always penetrates
 *   metal:    0.30m   penetrates if weapon has high penetration value
 *   concrete: 0.80m   rarely penetrated
 *   flesh:    0.25m   penetrates for full damage chain
 *
 * Usage:
 *   const ds = new DecalSystem({ scene, raycast, palette });
 *   ds.spawnBulletHole(point, normal, surface);
 *   ds.spawnBloodSplatter(point, normal);
 *   ds.spawnImpactParticles(point, normal, surface);
 *   const hits = ds.penetrationRaycast(origin, dir, opts);
 *   ds.update(dt);
 *   ds.clear();
 *   ds.dispose();
 */

import * as THREE from '/lib/three/three.module.js';
import { LayerMask } from '/engines/shared/Raycast3D.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DECAL_POOL_MAX    = 200;
const DECAL_NORMAL_BIAS = 0.012;   // metres offset along normal (z-fighting prevention)
const DECAL_LIFETIME    = 60;      // seconds before decal auto-fades
const DECAL_FADE_START  = 50;      // seconds before fade begins

const PARTICLE_GRAVITY  = -9.8;    // m/s²
const PARTICLE_DRAG     = 2.8;     // linear drag coefficient
const SPARK_COUNT       = 6;
const DEBRIS_COUNT      = 4;

// Palette-style colors for decals/particles (flat, no PBR)
const COLOR = Object.freeze({
    BULLET_HOLE:    0x1a1a1a,
    BULLET_RING:    0x3a2a1a,
    BLOOD:          0x550000,
    BLOOD_DARK:     0x2a0000,
    SPARK:          0xffcc44,
    DEBRIS_STONE:   0x888880,
    DEBRIS_WOOD:    0x886644,
    DEBRIS_METAL:   0x778899,
    DEBRIS_FLESH:   0x993322,
    DEBRIS_DEFAULT: 0x888888,
});

// Material thickness for penetration (metres)
const MAT_THICKNESS = Object.freeze({
    glass:    0.05,
    wood:     0.15,
    flesh:    0.25,
    metal:    0.30,
    concrete: 0.80,
    stone:    0.70,
    default:  0.40,
});

// ── DecalSystem ───────────────────────────────────────────────────────────────

export default class DecalSystem {

    /**
     * @param {object} opts
     * @param {THREE.Scene}   opts.scene
     * @param {Raycast3D}     opts.raycast
     * @param {PaletteManager}[opts.palette]
     */
    constructor(opts = {}) {
        this._scene   = opts.scene;
        this._raycast = opts.raycast ?? null;
        this._palette = opts.palette ?? null;

        /** @type {Array<DecalEntry>} FIFO pool */
        this._decals  = [];

        /** @type {Array<Particle>} active particles */
        this._particles = [];

        // Shared geometries (re-used across decals for memory efficiency)
        this._geoCache = new Map();  // 'bullet_sm' | 'bullet_lg' | 'blood' → THREE.PlaneGeometry

        // Scratch
        this._quat    = new THREE.Quaternion();
        this._up      = new THREE.Vector3(0, 1, 0);
        this._euler   = new THREE.Euler();
        this._mat4    = new THREE.Matrix4();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Spawn a bullet hole decal at a terrain/prop hit.
     * @param {THREE.Vector3} point   — world hit position
     * @param {THREE.Vector3} normal  — surface normal at hit
     * @param {string}        [surface] — material type (wood/metal/concrete/…)
     */
    spawnBulletHole(point, normal, surface = 'default') {
        const size = this._bulletHoleSize(surface);
        const mesh = this._buildDecalQuad(size, COLOR.BULLET_HOLE, COLOR.BULLET_RING, point, normal);
        this._addDecal(mesh, 'bullet');
    }

    /**
     * Spawn a blood splatter decal on an entity hit.
     * @param {THREE.Vector3} point
     * @param {THREE.Vector3} normal
     */
    spawnBloodSplatter(point, normal) {
        const size = 0.25 + Math.random() * 0.25;
        // Random rotation around normal axis
        const roll = Math.random() * Math.PI * 2;
        const mesh = this._buildDecalQuad(size, COLOR.BLOOD, COLOR.BLOOD_DARK, point, normal, roll);
        // Add 2–3 smaller satellite splats
        const count = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
            const offset = point.clone().add(
                new THREE.Vector3(
                    (Math.random() - 0.5) * 0.35,
                    (Math.random() - 0.5) * 0.35,
                    (Math.random() - 0.5) * 0.35,
                ),
            );
            const s2 = 0.06 + Math.random() * 0.1;
            const m2 = this._buildDecalQuad(s2, COLOR.BLOOD_DARK, COLOR.BLOOD, offset, normal, Math.random() * Math.PI * 2);
            this._addDecal(m2, 'blood');
        }
        this._addDecal(mesh, 'blood');
    }

    /**
     * Spawn impact spark + debris particles.
     * @param {THREE.Vector3} point
     * @param {THREE.Vector3} normal
     * @param {string}        [surface]
     */
    spawnImpactParticles(point, normal, surface = 'default') {
        this._spawnSparks(point, normal, SPARK_COUNT);
        this._spawnDebris(point, normal, DEBRIS_COUNT, surface);
    }

    /**
     * Penetrating raycast: fire a ray and collect all hits in order,
     * stopping when accumulated thickness exceeds weapon penetration depth.
     *
     * @param {THREE.Vector3} origin
     * @param {THREE.Vector3} direction (normalised)
     * @param {object}        opts
     * @param {number}        [opts.maxDist=80]         — max ray distance
     * @param {number}        [opts.penetration=0]      — weapon penetration depth (metres)
     * @param {number}        [opts.layerMask]          — Raycast3D layer mask
     * @param {number}        [opts.damage]             — base damage (reduced per surface)
     * @returns {PenetrationHit[]}  ordered array of hit records
     */
    penetrationRaycast(origin, direction, opts = {}) {
        const {
            maxDist    = 80,
            penetration = 0,
            layerMask  = LayerMask.TERRAIN | LayerMask.ENTITY | LayerMask.PROP,
            damage     = 0,
        } = opts;

        if (!this._raycast) return [];

        const allHits = this._raycast.raycastWorldAll(origin, direction, { maxDist, layerMask });
        if (!allHits || allHits.length === 0) return [];

        const results = [];
        let remainingPen = penetration;
        let remainingDmg = damage;

        for (const hit of allHits) {
            const surface = this._surfaceFromObject(hit.object);
            const thick   = MAT_THICKNESS[surface] ?? MAT_THICKNESS.default;

            const dmgMult  = this._dmgMultiplier(surface, thick, remainingPen);
            const actualDmg = remainingDmg * dmgMult;

            results.push({
                point:    hit.point.clone(),
                normal:   hit.face?.normal.clone() ?? new THREE.Vector3(0, 1, 0),
                object:   hit.object,
                distance: hit.distance,
                surface,
                damage:   actualDmg,
                penLeft:  remainingPen,
            });

            remainingPen -= thick;
            remainingDmg *= (1 - Math.min(1, thick / (penetration + 0.001)));

            if (remainingPen < 0) break;  // stopped by this surface
        }

        return results;
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    /** @param {number} dt */
    update(dt) {
        this._updateParticles(dt);
        this._updateDecalLifetime(dt);
    }

    // ── Pool management ───────────────────────────────────────────────────────

    _addDecal(mesh, type) {
        // Evict oldest when pool full
        if (this._decals.length >= DECAL_POOL_MAX) {
            const oldest = this._decals.shift();
            this._scene.remove(oldest.mesh);
            oldest.mesh.geometry.dispose();
            oldest.mesh.material.dispose();
        }
        this._scene.add(mesh);
        this._decals.push({ mesh, type, age: 0 });
    }

    _updateDecalLifetime(dt) {
        for (const d of this._decals) {
            d.age += dt;
            if (d.age >= DECAL_FADE_START) {
                const t = (d.age - DECAL_FADE_START) / (DECAL_LIFETIME - DECAL_FADE_START);
                d.mesh.material.opacity = Math.max(0, 1 - t);
            }
        }
        // Remove fully faded decals
        const before = this._decals.length;
        this._decals = this._decals.filter(d => {
            if (d.age >= DECAL_LIFETIME) {
                this._scene.remove(d.mesh);
                d.mesh.geometry.dispose();
                d.mesh.material.dispose();
                return false;
            }
            return true;
        });
    }

    // ── Decal quad builder ────────────────────────────────────────────────────

    /**
     * Build a flat quad mesh aligned to a surface normal.
     * @param {number}        size    — world-unit diameter
     * @param {number}        color   — hex fill color
     * @param {number}        rim     — hex rim/edge color (unused in flat-shading; for future)
     * @param {THREE.Vector3} point
     * @param {THREE.Vector3} normal
     * @param {number}        [roll=0] — rotation around normal (radians)
     * @returns {THREE.Mesh}
     */
    _buildDecalQuad(size, color, rim, point, normal, roll = 0) {
        // Cache geometry by rounded size key
        const sKey = size.toFixed(2);
        if (!this._geoCache.has(sKey)) {
            const geo = new THREE.PlaneGeometry(size, size, 1, 1);
            this._geoCache.set(sKey, geo);
        }
        // Each decal gets its own material (needs per-decal opacity)
        const mat = new THREE.MeshLambertMaterial({
            color,
            transparent: true,
            opacity:     1.0,
            depthWrite:  false,       // don't write depth — prevents z-fighting
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits:  -1,
        });

        // Build a fresh geometry (clone so size-cached geo is not mutated by matrix)
        const geo = new THREE.PlaneGeometry(size, size, 1, 1);

        const mesh = new THREE.Mesh(geo, mat);

        // Orient plane so its +Z faces along the surface normal
        const n = normal.clone().normalize();
        this._quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        if (roll !== 0) {
            const rollQ = new THREE.Quaternion().setFromAxisAngle(n, roll);
            this._quat.premultiply(rollQ);
        }
        mesh.quaternion.copy(this._quat);

        // Position: offset slightly along normal to prevent z-fighting
        mesh.position.copy(point).addScaledVector(n, DECAL_NORMAL_BIAS);

        mesh.renderOrder = 1;
        return mesh;
    }

    _bulletHoleSize(surface) {
        // Larger holes in soft materials
        switch (surface) {
            case 'wood':     return 0.06 + Math.random() * 0.03;
            case 'flesh':    return 0.08 + Math.random() * 0.04;
            case 'glass':    return 0.10 + Math.random() * 0.05;
            case 'metal':    return 0.045 + Math.random() * 0.02;
            default:         return 0.055 + Math.random() * 0.025;
        }
    }

    // ── Particle system ───────────────────────────────────────────────────────

    _spawnSparks(origin, normal, count) {
        for (let i = 0; i < count; i++) {
            const dir = this._randomHemisphereDir(normal, 0.9);
            const speed = 3.5 + Math.random() * 5;
            this._spawnParticle({
                origin,
                vel:      dir.multiplyScalar(speed),
                size:     0.02 + Math.random() * 0.02,
                color:    COLOR.SPARK,
                lifetime: 0.25 + Math.random() * 0.3,
                isSpark:  true,
                drag:     4.0,
            });
        }
    }

    _spawnDebris(origin, normal, count, surface) {
        const debrisColor = {
            stone:   COLOR.DEBRIS_STONE,
            wood:    COLOR.DEBRIS_WOOD,
            metal:   COLOR.DEBRIS_METAL,
            flesh:   COLOR.DEBRIS_FLESH,
        }[surface] ?? COLOR.DEBRIS_DEFAULT;

        for (let i = 0; i < count; i++) {
            const dir   = this._randomHemisphereDir(normal, 0.75);
            const speed = 2.5 + Math.random() * 3.5;
            this._spawnParticle({
                origin,
                vel:      dir.multiplyScalar(speed),
                size:     0.04 + Math.random() * 0.05,
                color:    debrisColor,
                lifetime: 0.5 + Math.random() * 0.6,
                isSpark:  false,
                drag:     PARTICLE_DRAG,
            });
        }
    }

    _spawnParticle({ origin, vel, size, color, lifetime, isSpark, drag }) {
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshLambertMaterial({ color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(origin);
        this._scene.add(mesh);

        this._particles.push({
            mesh,
            vel:      vel.clone(),
            lifetime,
            maxLife:  lifetime,
            isSpark,
            drag,
        });
    }

    _updateParticles(dt) {
        this._particles = this._particles.filter(p => {
            p.lifetime -= dt;

            if (p.lifetime <= 0) {
                this._scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                return false;
            }

            // Physics: gravity + drag
            p.vel.y += PARTICLE_GRAVITY * dt;
            p.vel.x -= p.vel.x * p.drag * dt;
            p.vel.z -= p.vel.z * p.drag * dt;

            p.mesh.position.addScaledVector(p.vel, dt);

            // Tumble rotation for debris
            if (!p.isSpark) {
                p.mesh.rotation.x += p.vel.length() * dt * 3;
                p.mesh.rotation.z += p.vel.length() * dt * 2;
            }

            // Fade out as lifetime expires
            const alpha = p.lifetime / p.maxLife;
            p.mesh.material.transparent = true;
            p.mesh.material.opacity = Math.max(0, alpha);

            return true;
        });
    }

    // ── Penetration helpers ───────────────────────────────────────────────────

    _dmgMultiplier(surface, thickness, penetration) {
        // Full damage if weapon penetrates cleanly; reduced if barely making it
        if (penetration >= thickness) return 1.0;
        if (penetration <= 0)         return 1.0;    // direct hit (no penetration needed)
        return penetration / thickness;
    }

    _surfaceFromObject(obj) {
        if (!obj) return 'default';
        const name = (obj.name ?? '').toLowerCase();
        if (name.includes('glass'))    return 'glass';
        if (name.includes('wood'))     return 'wood';
        if (name.includes('metal'))    return 'metal';
        if (name.includes('stone'))    return 'stone';
        if (name.includes('concrete')) return 'concrete';
        if (name.includes('flesh') || name.includes('enemy')) return 'flesh';
        // userData override
        const ud = obj.userData?.surface;
        if (ud) return ud;
        return 'default';
    }

    // ── Math helpers ──────────────────────────────────────────────────────────

    /**
     * Random direction in a hemisphere oriented around normal,
     * biased toward the normal by bias factor (0=full sphere, 1=pure normal).
     */
    _randomHemisphereDir(normal, bias = 0.5) {
        const rand = new THREE.Vector3(
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
        ).normalize();
        // Reflect toward normal hemisphere
        if (rand.dot(normal) < 0) rand.negate();
        // Lerp toward normal by bias
        return rand.lerp(normal.clone(), bias * Math.random()).normalize();
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    /** Remove all decals from the scene. */
    clear() {
        for (const d of this._decals) {
            this._scene.remove(d.mesh);
            d.mesh.geometry.dispose();
            d.mesh.material.dispose();
        }
        this._decals = [];
    }

    /** Remove all active particles. */
    clearParticles() {
        for (const p of this._particles) {
            this._scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        }
        this._particles = [];
    }

    /** Returns number of active decals. */
    get decalCount() { return this._decals.length; }

    /** Returns number of active particles. */
    get particleCount() { return this._particles.length; }

    dispose() {
        this.clear();
        this.clearParticles();
        for (const geo of this._geoCache.values()) geo.dispose();
        this._geoCache.clear();
    }
}
