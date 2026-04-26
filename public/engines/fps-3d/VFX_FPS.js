/**
 * VFX_FPS.js — Phase 34
 * Visual effects layer for the FPS-3D engine.
 *
 * Visual style: LOW-POLY + VOXEL, flat palette colors.
 * No PBR, no particle textures — pure geometry + MeshLambertMaterial.
 *
 * Features:
 *   - Voxel destruction: remove block from voxel grid + spawn 4–8 tumbling
 *     mini-cube debris (reuses DecalSystem debris pattern but heavier)
 *   - Muzzle flash: flat diamond sprite + 2-frame point-light burst
 *   - Bullet tracer: single-frame LineSegments from muzzle to impact
 *   - Explosion: cube-burst particles + flat shockwave ring + point-light flash
 *   - Post-processing: registers all new geometry with Renderer3D.addOutlined()
 *     so the shared OutlinePass draws black edges on every VFX mesh
 *   - Shadow setup: configureDirectionalLight() — single sun with chunky
 *     low-poly shadow map; call once after scene is built
 *
 * Usage:
 *   const vfx = new VFX_FPS({ scene, renderer3d, palette });
 *   vfx.muzzleFlash(position, direction);
 *   vfx.bulletTracer(from, to);
 *   vfx.explosion(center, radius);
 *   vfx.destroyVoxel(voxelGrid, cellX, cellY, cellZ);
 *   vfx.configureDirectionalLight(opts);
 *   vfx.update(dt);
 *   vfx.dispose();
 */

import * as THREE from '../../lib/three/three.module.js';

// ── Constants ─────────────────────────────────────────────────────────────────

// Muzzle flash
const MF_DURATION    = 0.04;   // seconds (≈2-3 frames at 60fps)
const MF_LIGHT_RANGE = 4.0;    // metres
const MF_LIGHT_INT   = 2.5;
const MF_SIZE        = 0.18;   // diamond half-size in world units
const MF_COLOR       = 0xffcc44;

// Bullet tracer
const TRACER_DURATION = 0.035; // seconds — just over 2 frames
const TRACER_COLOR    = 0xffee88;

// Explosion
const EXP_DURATION     = 0.65;  // total effect seconds
const EXP_LIGHT_INT    = 6.0;
const EXP_LIGHT_RANGE  = 12.0;
const EXP_CUBE_COUNT   = 18;
const EXP_CUBE_SPEED   = 8.0;   // m/s outward
const EXP_RING_SEGS    = 8;     // segments on shockwave ring (octagon = low-poly)
const EXP_COLOR        = 0xff6622;
const EXP_RING_COLOR   = 0xff9944;

// Voxel destruction
const VOX_DEBRIS_COUNT  = 6;    // 4–8 tumbling mini-cubes
const VOX_DEBRIS_SPEED  = 4.5;
const VOX_GRAVITY       = -9.8;
const VOX_DRAG          = 2.5;
const VOX_DEBRIS_LIFE   = 0.9;  // seconds

// Shadow map defaults
const SHADOW_MAP_SIZE = 1024;
const SHADOW_CAM_SIZE = 40;     // world-units the shadow camera covers
const SHADOW_NEAR     = 0.5;
const SHADOW_FAR      = 120;

// ── VFX_FPS ───────────────────────────────────────────────────────────────────

export default class VFX_FPS {

    /**
     * @param {object}         opts
     * @param {THREE.Scene}    opts.scene
     * @param {Renderer3D}     opts.renderer3d    — for addOutlined()
     * @param {PaletteManager} [opts.palette]
     */
    constructor(opts = {}) {
        this._scene     = opts.scene;
        this._renderer  = opts.renderer3d ?? null;
        this._palette   = opts.palette    ?? null;

        /** @type {VFXEntry[]} live effect instances */
        this._effects   = [];

        /** @type {THREE.DirectionalLight|null} */
        this._sun       = null;

        // Shared muzzle-flash geometry (diamond = 4 triangles)
        this._mfGeo     = this._buildDiamondGeo(MF_SIZE);
        this._mfMat     = new THREE.MeshLambertMaterial({
            color: MF_COLOR,
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide,
            depthWrite: false,
        });

        // Tracer line material
        this._tracerMat = new THREE.LineBasicMaterial({
            color:       TRACER_COLOR,
            transparent: true,
            opacity:     1.0,
            depthWrite:  false,
            linewidth:   1,   // WebGL ignores >1 on most platforms; visual enough
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Fire a muzzle flash at the given world position, oriented along direction.
     * @param {THREE.Vector3} position   — muzzle world position
     * @param {THREE.Vector3} direction  — normalised forward direction
     */
    muzzleFlash(position, direction) {
        const mesh = new THREE.Mesh(this._mfGeo.clone(), this._mfMat.clone());
        mesh.position.copy(position);
        // Orient diamond to face along fire direction
        const q = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, 1), direction.clone().normalize(),
        );
        mesh.quaternion.copy(q);
        // Random spin around fire axis for variety
        const spin = new THREE.Quaternion().setFromAxisAngle(direction, Math.random() * Math.PI);
        mesh.quaternion.premultiply(spin);
        this._scene.add(mesh);

        // Point light burst
        const light = new THREE.PointLight(MF_COLOR, MF_LIGHT_INT, MF_LIGHT_RANGE);
        light.position.copy(position);
        this._scene.add(light);

        // Register with outline pass for crisp low-poly look
        this._addOutlined([mesh]);

        this._effects.push({
            type:     'muzzle',
            objects:  [mesh, light],
            timer:    MF_DURATION,
            maxTimer: MF_DURATION,
        });
    }

    /**
     * Draw a bullet tracer line from muzzle to impact point.
     * @param {THREE.Vector3} from  — muzzle position
     * @param {THREE.Vector3} to    — impact position
     */
    bulletTracer(from, to) {
        const geo = new THREE.BufferGeometry().setFromPoints([
            from.clone(), to.clone(),
        ]);
        const line = new THREE.Line(geo, this._tracerMat.clone());
        line.renderOrder = 2;
        this._scene.add(line);

        this._effects.push({
            type:     'tracer',
            objects:  [line],
            timer:    TRACER_DURATION,
            maxTimer: TRACER_DURATION,
        });
    }

    /**
     * Spawn an explosion at the given world centre.
     * @param {THREE.Vector3} center
     * @param {number}        [radius=1.5]  — blast visual radius
     */
    explosion(center, radius = 1.5) {
        const particles = [];

        // Cube-burst particles
        for (let i = 0; i < EXP_CUBE_COUNT; i++) {
            const size = 0.05 + Math.random() * 0.12;
            const geo  = new THREE.BoxGeometry(size, size, size);
            const mat  = new THREE.MeshLambertMaterial({
                color:       i % 3 === 0 ? 0xff2200 : i % 3 === 1 ? EXP_COLOR : 0xffcc44,
                transparent: true,
                opacity:     1.0,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(center);
            this._scene.add(mesh);

            // Random outward velocity
            const dir = new THREE.Vector3(
                Math.random() * 2 - 1,
                Math.random() * 1.5 + 0.2,
                Math.random() * 2 - 1,
            ).normalize().multiplyScalar(EXP_CUBE_SPEED * (0.6 + Math.random() * 0.8));

            particles.push({ mesh, vel: dir });
        }

        // Flat shockwave ring (octagon, expands outward)
        const ringGeo = new THREE.RingGeometry(0.01, radius * 0.2, EXP_RING_SEGS);
        ringGeo.rotateX(-Math.PI / 2); // lay flat on XZ
        const ringMat = new THREE.MeshLambertMaterial({
            color:       EXP_RING_COLOR,
            transparent: true,
            opacity:     0.85,
            side:        THREE.DoubleSide,
            depthWrite:  false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(center);
        this._scene.add(ring);
        this._addOutlined([ring]);

        // Point light flash
        const light = new THREE.PointLight(EXP_COLOR, EXP_LIGHT_INT, EXP_LIGHT_RANGE * radius);
        light.position.copy(center);
        this._scene.add(light);

        this._effects.push({
            type:      'explosion',
            objects:   [...particles.map(p => p.mesh), ring, light],
            particles,
            ring,
            ringTargetR: radius,
            light,
            center:    center.clone(),
            timer:     EXP_DURATION,
            maxTimer:  EXP_DURATION,
        });
    }

    /**
     * Destroy a voxel block: removes it from the voxel grid and spawns debris.
     * @param {object}        voxelGrid  — must expose removeBlock(x,y,z) + getBlockColor(x,y,z)
     * @param {number}        cx         — voxel cell X
     * @param {number}        cy         — voxel cell Y
     * @param {number}        cz         — voxel cell Z
     */
    destroyVoxel(voxelGrid, cx, cy, cz) {
        if (!voxelGrid) return;

        // Get block color before removal (for debris tinting)
        const blockColor = voxelGrid.getBlockColor?.(cx, cy, cz) ?? 0x888888;

        // Remove from voxel grid (triggers mesh rebuild in voxel engine)
        voxelGrid.removeBlock?.(cx, cy, cz);

        // World position of voxel centre
        const cellSize = voxelGrid.cellSize ?? 1.0;
        const wx = (cx + 0.5) * cellSize;
        const wy = (cy + 0.5) * cellSize;
        const wz = (cz + 0.5) * cellSize;
        const center = new THREE.Vector3(wx, wy, wz);

        // Spawn debris cubes
        const count   = VOX_DEBRIS_COUNT + Math.floor(Math.random() * 3); // 6–8
        const debris  = [];
        for (let i = 0; i < count; i++) {
            const s   = cellSize * (0.18 + Math.random() * 0.25);
            const geo = new THREE.BoxGeometry(s, s, s);
            const mat = new THREE.MeshLambertMaterial({ color: blockColor, transparent: true, opacity: 1.0 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(center).addScaledVector(
                new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5), cellSize * 0.4,
            );
            this._scene.add(mesh);

            const dir = new THREE.Vector3(
                Math.random() * 2 - 1,
                Math.random() * 1.2 + 0.4,
                Math.random() * 2 - 1,
            ).normalize().multiplyScalar(VOX_DEBRIS_SPEED * (0.5 + Math.random() * 0.8));

            debris.push({ mesh, vel: dir });
        }

        this._effects.push({
            type:     'voxel',
            objects:  debris.map(d => d.mesh),
            debris,
            timer:    VOX_DEBRIS_LIFE,
            maxTimer: VOX_DEBRIS_LIFE,
        });
    }

    /**
     * Setup (or replace) the directional sun light with shadow map.
     * Call once after scene is assembled.
     * @param {object} [opts]
     * @param {number} [opts.intensity=1.2]
     * @param {number} [opts.color=0xffeedd]
     * @param {number[]} [opts.position=[30,60,30]]
     * @param {boolean} [opts.castShadow=true]
     * @param {number}  [opts.mapSize=1024]
     */
    configureDirectionalLight(opts = {}) {
        if (this._sun) {
            this._scene.remove(this._sun);
            this._scene.remove(this._sun.target);
        }
        if (this._ambient) {
            this._scene.remove(this._ambient);
        }

        const intensity = opts.intensity ?? 1.2;
        const color     = opts.color     ?? 0xffeedd;
        const pos       = opts.position  ?? [30, 60, 30];
        const doShadow  = opts.castShadow !== false;
        const mapSize   = opts.mapSize   ?? SHADOW_MAP_SIZE;

        const sun = new THREE.DirectionalLight(color, intensity);
        sun.position.set(...pos);

        if (doShadow) {
            sun.castShadow             = true;
            sun.shadow.mapSize.width   = mapSize;
            sun.shadow.mapSize.height  = mapSize;
            sun.shadow.camera.near     = SHADOW_NEAR;
            sun.shadow.camera.far      = SHADOW_FAR;
            sun.shadow.camera.left     = -SHADOW_CAM_SIZE;
            sun.shadow.camera.right    =  SHADOW_CAM_SIZE;
            sun.shadow.camera.top      =  SHADOW_CAM_SIZE;
            sun.shadow.camera.bottom   = -SHADOW_CAM_SIZE;
            // Flat-shading bias: slight positive to reduce acne on low-poly surfaces
            sun.shadow.bias            = 0.001;
            sun.shadow.normalBias      = 0.04;
        }

        this._scene.add(sun);
        this._scene.add(sun.target);
        this._sun = sun;

        // Add matching ambient light for unlit areas
        const ambColor = opts.ambientColor ?? 0x1a1208;
        const ambInt   = opts.ambientIntensity ?? 0.8;
        this._ambient = new THREE.AmbientLight(ambColor, ambInt);
        this._scene.add(this._ambient);

        // Ensure renderer accepts shadows
        if (this._renderer?.webgl) {
            this._renderer.webgl.shadowMap.enabled = true;
            this._renderer.webgl.shadowMap.type    = THREE.PCFShadowMap;
        }

        console.log('[VFX_FPS] Lighting configured', { intensity, pos, doShadow, ambient: ambInt });
        return sun;
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    /** @param {number} dt */
    update(dt) {
        this._effects = this._effects.filter(fx => {
            fx.timer -= dt;
            const t    = fx.timer / fx.maxTimer;   // 1→0 as effect plays
            const alive = fx.timer > 0;

            switch (fx.type) {
                case 'muzzle':   this._updateMuzzle(fx, t, alive, dt);    break;
                case 'tracer':   this._updateTracer(fx, t, alive);        break;
                case 'explosion':this._updateExplosion(fx, t, alive, dt); break;
                case 'voxel':    this._updateVoxel(fx, t, alive, dt);     break;
            }

            if (!alive) this._destroyEffect(fx);
            return alive;
        });
    }

    // ── Per-effect updaters ───────────────────────────────────────────────────

    _updateMuzzle(fx, t, alive) {
        // Fade out: first frame bright, then die
        const [mesh, light] = fx.objects;
        if (mesh?.material) mesh.material.opacity  = t;
        if (light)          light.intensity = MF_LIGHT_INT * t;
    }

    _updateTracer(fx, t, alive) {
        const [line] = fx.objects;
        if (line?.material) line.material.opacity = t;
    }

    _updateExplosion(fx, t, alive, dt) {
        const progress = 1 - t;  // 0→1

        // Expand shockwave ring
        if (fx.ring && fx.ringTargetR) {
            const s = 1 + progress * 4;   // ring grows to 5× initial
            fx.ring.scale.set(s, s, s);
            fx.ring.material.opacity = t * 0.85;
        }

        // Fade + decay point light
        if (fx.light) {
            fx.light.intensity = EXP_LIGHT_INT * t * t;  // rapid decay
        }

        // Simulate cube particles
        for (const p of fx.particles ?? []) {
            p.vel.y += VOX_GRAVITY * dt;
            p.vel.x -= p.vel.x * VOX_DRAG * dt;
            p.vel.z -= p.vel.z * VOX_DRAG * dt;
            p.mesh.position.addScaledVector(p.vel, dt);
            p.mesh.rotation.x += p.vel.length() * dt * 2.5;
            p.mesh.rotation.z += p.vel.length() * dt * 1.8;
            if (p.mesh.material) p.mesh.material.opacity = t;
        }
    }

    _updateVoxel(fx, t, alive, dt) {
        for (const d of fx.debris ?? []) {
            d.vel.y += VOX_GRAVITY * dt;
            d.vel.x -= d.vel.x * VOX_DRAG * dt;
            d.vel.z -= d.vel.z * VOX_DRAG * dt;
            d.mesh.position.addScaledVector(d.vel, dt);
            d.mesh.rotation.x += d.vel.length() * dt * 3;
            d.mesh.rotation.y += d.vel.length() * dt * 2;
            if (d.mesh.material) d.mesh.material.opacity = t;
        }
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    _destroyEffect(fx) {
        for (const obj of fx.objects ?? []) {
            this._scene.remove(obj);
            if (obj.isLight) continue;
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material?.dispose();
        }
    }

    // ── Geometry builders ─────────────────────────────────────────────────────

    /**
     * Build a flat diamond (rhombus) geometry for muzzle flash.
     * 4 triangles: top/bottom/left/right from centre.
     * @param {number} half — half-size
     */
    _buildDiamondGeo(half) {
        const h = half;
        const hw = half * 0.55;
        const verts = new Float32Array([
            // top triangle
             0,  h, 0,   -hw, 0, 0,    hw, 0, 0,
            // bottom triangle
             0, -h, 0,    hw, 0, 0,   -hw, 0, 0,
            // left triangle (slightly smaller)
            -h*0.6, 0, 0,  0, hw*0.6, 0,  0,-hw*0.6,0,
            // right triangle
             h*0.6, 0, 0,  0,-hw*0.6, 0,  0, hw*0.6,0,
        ]);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        geo.computeVertexNormals();
        return geo;
    }

    // ── Outline integration ───────────────────────────────────────────────────

    _addOutlined(meshes) {
        if (this._renderer?.addOutlined) {
            this._renderer.addOutlined(meshes.filter(m => m?.isMesh));
        }
    }

    // ── Dispose ───────────────────────────────────────────────────────────────

    dispose() {
        // Kill all active effects
        for (const fx of this._effects) this._destroyEffect(fx);
        this._effects = [];

        // Shared geometry + materials
        this._mfGeo?.dispose();
        this._mfMat?.dispose();
        this._tracerMat?.dispose();

        // Sun light
        if (this._sun) {
            this._scene.remove(this._sun);
            this._scene.remove(this._sun.target);
            this._sun = null;
        }
    }
}
