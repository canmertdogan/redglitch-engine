/**
 * WorldGeometry.js — Phase 29
 *
 * Static world geometry loader and collision manager for the fps-3d engine.
 *
 * Responsibilities:
 *   1. GLTF level load — load mesh from server via AssetLoader3D
 *   2. Trimesh collider — extract all static meshes → cannon-es Trimesh bodies
 *   3. Stair climbing  — secondary low ray cast forward detects step-height;
 *                        injects upward velocity into FPSController
 *   4. Ceiling detection — short upward ray; zeroes Y velocity if blocked
 *   5. Trigger volumes — AABB-based zones with onEnter / onExit callbacks
 *   6. Portal system   — paired named zones that teleport player instantly
 *
 * GLTF naming conventions (set in your modelling tool / editor):
 *   Mesh name starts with "col_"   → static collision-only (not rendered)
 *   Mesh name starts with "vis_"   → visual-only (no collision)
 *   Mesh name starts with "trig_"  → trigger volume (AABB extracted, no render)
 *   Mesh name starts with "portal_A_" / "portal_B_" → portal pair (prefix match)
 *   UserData surface = "concrete" | "grass" | "metal" | "wood"
 *
 * Usage (inside FPSGame.onLevelLoaded):
 *   this.worldGeometry = new WorldGeometry({ scene, physics, assets, fpsController });
 *   await this.worldGeometry.loadFromLevel(levelData);
 */

import * as THREE from '/lib/three/three.module.js';
import { BodyType, ShapeType } from '../shared/Physics3DWorld.js';
import VoxelMeshGen from '../shared/VoxelMeshGen.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Margin above ground needed to climb a stair step (metres). */
const STEP_MAX_HEIGHT  = 0.42;
/** How far forward the step-detection ray probes. */
const STEP_PROBE_DIST  = 0.55;
/** Upward velocity injected when a climbable step is detected (m/s). */
const STEP_CLIMB_VEL   = 4.5;

/** Upward ray length for ceiling detection. */
const CEILING_RAY_LEN  = 1.1;

/** How frequently trigger volumes are polled (seconds). */
const TRIGGER_POLL_HZ  = 1 / 20;   // 20 Hz

/** Portal teleport cooldown (seconds) — prevents loop-teleporting. */
const PORTAL_COOLDOWN  = 0.8;

// ── WorldGeometry ─────────────────────────────────────────────────────────────

export default class WorldGeometry {

    /**
     * @param {object} systems
     * @param {THREE.Scene}                                  systems.scene
     * @param {import('../shared/Physics3DWorld.js').default} systems.physics
     * @param {import('../shared/AssetLoader3D.js').default}  systems.assets
     * @param {import('./FPSController.js').default}          systems.fpsController
     * @param {object} [opts]
     * @param {number} [opts.stepMaxHeight]   Max stair step height (default 0.42 m)
     * @param {boolean}[opts.portalsEnabled]  Enable portal teleportation (default true)
     */
    constructor({ scene, physics, assets, fpsController }, opts = {}) {
        /** @type {THREE.Scene} */
        this._scene          = scene;
        this._physics        = physics;
        this._assets         = assets;
        this._fpsController  = fpsController;

        // Config
        this._stepMaxHeight  = opts.stepMaxHeight  ?? STEP_MAX_HEIGHT;
        this._portalsEnabled = opts.portalsEnabled ?? true;

        // ── Static geometry bodies ─────────────────────────────────────────
        /** @type {import('../shared/Physics3DWorld.js').PhysicsBody3D[]} */
        this._staticBodies   = [];

        /** @type {THREE.Object3D|null} */
        this._levelRoot      = null;

        // ── Trigger volumes ────────────────────────────────────────────────
        /**
         * @type {Array<{
         *   id:      string,
         *   aabb:    THREE.Box3,
         *   onEnter: function|null,
         *   onExit:  function|null,
         *   active:  boolean,
         * }>}
         */
        this._triggers       = [];
        this._triggerTimer   = 0;

        // ── Portal system ──────────────────────────────────────────────────
        /**
         * @type {Array<{
         *   idA: string, posA: THREE.Vector3, normalA: THREE.Vector3,
         *   idB: string, posB: THREE.Vector3, normalB: THREE.Vector3,
         * }>}
         */
        this._portals        = [];
        this._lastPortalTime = -999;

        // Reusable raycaster (one instance avoids per-frame allocation)
        this._raycaster      = new THREE.Raycaster();
        this._rayOrigin      = new THREE.Vector3();
        this._rayDir         = new THREE.Vector3();

        // Collision objects list for raycasting (rebuilt after load)
        this._colMeshes      = [];

        // ── TextureAtlas3D (optional) ──────────────────────────────────────
        this._atlas          = null;
        this._tilesetEnabled = false;
    }

    // ── Loading ───────────────────────────────────────────────────────────────

    /**
     * loadFromLevel(levelData) — primary entry point.
     * Called by FPSGame.onLevelLoaded() after level JSON is received.
     *
     * Expects levelData to contain:
     *   levelData.gltfUrl  — path to the .glb file (relative to /projects/<proj>/)
     *   levelData.geometry — optional inline static geometry spec (Phase-29+ editor)
     *
     * Falls back to a procedural box room when no GLTF is provided (dev mode).
     *
     * @param {object} levelData
     * @param {string} projectName
     */
    async loadFromLevel(levelData, projectName = '') {
        this.dispose();   // clear any previous level

        const gltfUrl = levelData?.gltfUrl
            ? `/projects/${projectName}/${levelData.gltfUrl}`
            : null;

        if (Array.isArray(levelData.geometry) && levelData.geometry.length > 0) {
            // New Editor-built geometry (Phase 64)
            await this._loadEditorGeometry(levelData.geometry);
        } else if (levelData.voxelGrid && Object.keys(levelData.voxelGrid).length > 0) {
            // Voxel Editor data (Phase 41)
            await this._loadVoxelGrid(levelData.voxelGrid, levelData.cellSize || 1.0);
        } else if (gltfUrl) {
            await this._loadGLTF(gltfUrl, levelData);
        } else {
            // Dev fallback: procedural box room
            this._buildProceduralRoom(levelData);
        }

        this._buildTriggers(levelData?.triggers ?? []);
        this._buildPortals(levelData?.portals   ?? []);

        console.log(
            `[WorldGeometry] loaded — ${this._staticBodies.length} collision bodies,`,
            `${this._triggers.length} triggers, ${this._portals.length} portal pairs`,
        );
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    /**
     * update(dt, gameTime) — stair/ceiling detection + trigger polling.
     * Called from FPSGame._update() after physics step.
     * @param {number} dt
     * @param {number} gameTime
     */
    update(dt, gameTime) {
        if (!this._fpsController) return;

        const playerPos = this._fpsController.getPosition();

        this._checkStairClimb(playerPos);
        this._checkCeiling(playerPos);

        // Trigger polling at reduced frequency
        this._triggerTimer += dt;
        if (this._triggerTimer >= TRIGGER_POLL_HZ) {
            this._triggerTimer = 0;
            this._pollTriggers(playerPos);
        }

        // Portal check (every frame — needs to be tight to avoid tunnelling)
        if (this._portalsEnabled) {
            this._checkPortals(playerPos, gameTime);
        }
    }

    // ── GLTF loading ──────────────────────────────────────────────────────────

    async _loadVoxelGrid(voxelGrid, cellSize) {
        console.log(`[WorldGeometry] building voxel mesh (size=${cellSize})...`);
        const gen = new VoxelMeshGen(voxelGrid, cellSize);
        const meshes = await gen.buildMeshes(this._atlas);

        for (const mesh of meshes) {
            mesh.name = 'voxel_mesh';
            this._scene.add(mesh);
            this._colMeshes.push(mesh);
        }

        // Voxel collision: standard approach is to create a collider per block,
        // or a compound body. For simplicity and performance, we'll use a
        // simplified box collider for every voxel.
        this._addVoxelColliders(voxelGrid, cellSize);
    }

    _addVoxelColliders(voxelGrid, cellSize) {
        const keys = Object.keys(voxelGrid);
        console.log(`[WorldGeometry] adding ${keys.length} voxel colliders...`);
        
        for (const key of keys) {
            const [gx, gy, gz] = key.split(',').map(Number);
            const cx = (gx + 0.5) * cellSize;
            const cy = (gy + 0.5) * cellSize;
            const cz = (gz + 0.5) * cellSize;

            this._addBoxCollider(cx, cy, cz, cellSize, cellSize, cellSize, 'concrete');
        }
    }

    async _loadEditorGeometry(geometryData) {
        console.log(`[WorldGeometry] loading ${geometryData.length} editor shapes`);
        const { hexMaterial, PrimitiveFactory } = await import('../shared/Renderer3D.js');

        // Load atlas if any shape needs it
        if (geometryData.some(d => d.textureId)) {
            const { default: TextureAtlas3D } = await import('../shared/TextureAtlas3D.js');
            this._atlas = new TextureAtlas3D();
            await this._atlas.loadAsync(THREE);
            this._tilesetEnabled = true;
        }

        for (const def of geometryData) {
            // ── Geometry Factory (Phase 64/65) ──────────────────────────────
            const type = (def.blockType || def.type || 'box').toLowerCase();
            const w = def.width  || def.w || 1;
            const h = def.height || def.h || 1;
            const d = def.depth  || def.d || 1;
            
            const geo = PrimitiveFactory.create(type, w, h, d);

            let mat;

            if (def.textureId && this._atlas) {
                this._atlas.applyBlockUVs(geo, def.textureId);
                mat = this._atlas.getMaterial(THREE);
            } else {
                mat = hexMaterial(def.colorHex || def.color || '#888888');
            }

            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(def.position[0], def.position[1], def.position[2]);
            if (def.rotation) mesh.quaternion.set(...def.rotation);
            if (def.scale)    mesh.scale.set(...def.scale);

            mesh.castShadow    = true;
            mesh.receiveShadow = true;
            mesh.name          = def.id || 'editor_shape';

            this._scene.add(mesh);
            this._colMeshes.push(mesh);

            // Add static collision body
            this._addBoxCollider(
                mesh.position.x, mesh.position.y, mesh.position.z,
                (def.width || 1) * mesh.scale.x, (def.height || 1) * mesh.scale.y, (def.depth || 1) * mesh.scale.z
            );
        }
    }

    async _loadGLTF(url, levelData) {
        console.log(`[WorldGeometry] loading GLTF: ${url}`);
        const { scene: root } = await this._assets.loadGLTF(url, {
            flatShading: true,
            remapPalette: true,
        });

        this._levelRoot = root;
        this._scene.add(root);

        // Walk children and classify by naming convention
        root.traverse(obj => {
            if (!obj.isMesh) return;

            const name  = obj.name ?? '';
            const lower = name.toLowerCase();

            if (lower.startsWith('trig_')) {
                // Trigger volume — extract AABB, hide mesh
                obj.visible = false;
                this._triggerMeshes = this._triggerMeshes || [];
                this._triggerMeshes.push(obj);
                return;
            }

            if (lower.startsWith('portal_')) {
                // Portal marker — extract position + world normal
                obj.visible = false;
                this._portalMeshes = this._portalMeshes || [];
                this._portalMeshes.push(obj);
                return;
            }

            const isColOnly = lower.startsWith('col_');
            const isVisOnly = lower.startsWith('vis_');

            if (isColOnly) obj.visible = false;

            if (!isVisOnly) {
                // Build trimesh collider from this mesh
                this._addTrimeshBody(obj, levelData);
            }
        });

        // Rebuild col-mesh list for raycasting
        this._colMeshes = [];
        root.traverse(obj => {
            if (obj.isMesh && !obj.name?.toLowerCase().startsWith('vis_')) {
                this._colMeshes.push(obj);
            }
        });
    }

    /**
     * Add a static cannon-es trimesh body for one THREE.Mesh.
     * @param {THREE.Mesh} mesh
     * @param {object}     levelData
     */
    _addTrimeshBody(mesh, levelData) {
        // Ensure geometry is in world space (apply all ancestor transforms)
        const worldGeo = mesh.geometry.clone();
        worldGeo.applyMatrix4(mesh.matrixWorld);

        // Extract surface material tag from mesh userData or material name
        const surface = mesh.userData?.surface
            ?? _surfaceFromName(mesh.name)
            ?? 'concrete';

        try {
            const body = this._physics.createBody({
                type:     BodyType.STATIC,
                shape:    ShapeType.TRIMESH,
                geometry: worldGeo,
                mass:     0,
            });
            body.body.userData = { surface, meshName: mesh.name };
            this._staticBodies.push(body);
        } catch (err) {
            console.warn(`[WorldGeometry] trimesh failed for "${mesh.name}":`, err.message);
        }
    }

    // ── Procedural fallback room ──────────────────────────────────────────────

    /**
     * Build a simple box room when no GLTF is available.
     * Useful for dev/test without a full level asset.
     */
    _buildProceduralRoom(levelData) {
        const size = levelData?.roomSize ?? 20;
        const h    = levelData?.roomHeight ?? 5;

        const THREE_mod = THREE;

        // Floor
        this._addBoxCollider(0, -0.1, 0, size, 0.2, size, 'concrete');
        // Ceiling
        this._addBoxCollider(0, h + 0.1, 0, size, 0.2, size, 'concrete');
        // Walls
        this._addBoxCollider(0, h / 2,  size / 2, size, h, 0.2, 'concrete');
        this._addBoxCollider(0, h / 2, -size / 2, size, h, 0.2, 'concrete');
        this._addBoxCollider( size / 2, h / 2, 0, 0.2, h, size, 'concrete');
        this._addBoxCollider(-size / 2, h / 2, 0, 0.2, h, size, 'concrete');

        // Visual floor plane
        if (this._tilesetEnabled && this._atlas) {
            const mesh = this._buildAtlasBlockMesh('floor', 0, -0.1, 0, size, 0.2, size, THREE_mod);
            mesh.name = 'proc_block_floor';
            this._scene.add(mesh);
            this._colMeshes.push(mesh);
        } else {
            const floorGeo  = new THREE_mod.PlaneGeometry(size, size);
            const floorMat  = new THREE_mod.MeshLambertMaterial({ color: 0x555566 });
            const floorMesh = new THREE_mod.Mesh(floorGeo, floorMat);
            floorMesh.rotation.x = -Math.PI / 2;
            floorMesh.name = 'proc_floor';
            this._scene.add(floorMesh);
            this._colMeshes.push(floorMesh);
        }

        // Ambient light if nothing in scene
        const hasLight = this._scene.children.some(c => c.isLight);
        if (!hasLight) {
            this._scene.add(new THREE_mod.AmbientLight(0x404040, 0.8));
            const dir = new THREE_mod.DirectionalLight(0xffffff, 1.0);
            dir.position.set(5, 10, 5);
            this._scene.add(dir);
        }

        console.log('[WorldGeometry] procedural room built');
    }

    _addBoxCollider(cx, cy, cz, sx, sy, sz, surface = 'concrete') {
        const body = this._physics.createBody({
            type:     BodyType.STATIC,
            shape:    ShapeType.BOX,
            halfExtents: { x: sx / 2, y: sy / 2, z: sz / 2 },
            position: new THREE.Vector3(cx, cy, cz),
            mass:     0,
        });
        body.body.userData = { surface };
        this._staticBodies.push(body);
    }

    // ── Stair climbing ────────────────────────────────────────────────────────

    /**
     * Cast a low forward ray; if it hits geometry within step height,
     * inject upward velocity so the player steps up smoothly.
     * @param {{ x:number, y:number, z:number }} playerPos  Eye position
     */
    _checkStairClimb(playerPos) {
        const ctrl = this._fpsController;
        if (!ctrl || ctrl.moveState === 'AIRBORNE') return;

        // Only probe when player is actually moving horizontally
        const vx = ctrl._velX ?? 0;
        const vz = ctrl._velZ ?? 0;
        const horizSpeed = Math.sqrt(vx * vx + vz * vz);
        if (horizSpeed < 0.5) return;

        // Forward direction in XZ
        const nx = vx / horizSpeed;
        const nz = vz / horizSpeed;

        // Ray origin: at foot level (eye - eyeHeight + small lift)
        const footY = playerPos.y - (ctrl._eyeHeightCurrent ?? 1.7) + 0.05;

        this._rayOrigin.set(playerPos.x, footY, playerPos.z);
        this._rayDir.set(nx, 0, nz).normalize();

        this._raycaster.set(this._rayOrigin, this._rayDir);
        this._raycaster.far = STEP_PROBE_DIST;

        const hits = this._raycaster.intersectObjects(this._colMeshes, false);
        if (!hits.length) return;

        const hit    = hits[0];
        const stepH  = hit.point.y - footY;

        // Only climb if the step is between 0.01 m and STEP_MAX_HEIGHT
        if (stepH > 0.01 && stepH <= this._stepMaxHeight) {
            // Inject upward velocity proportional to step height
            if (ctrl._body) {
                const curVelY = ctrl._body.body.velocity.y;
                if (curVelY <= 0) {
                    ctrl._velY = STEP_CLIMB_VEL * (stepH / this._stepMaxHeight);
                    ctrl._body.setVelocity({
                        x: ctrl._velX,
                        y: ctrl._velY,
                        z: ctrl._velZ,
                    });
                }
            }
        }
    }

    // ── Ceiling detection ─────────────────────────────────────────────────────

    /**
     * Cast a short ray upward; if geometry is too close, zero the Y velocity
     * to prevent tunnelling through ceilings on jump.
     * @param {{ x:number, y:number, z:number }} playerPos
     */
    _checkCeiling(playerPos) {
        const ctrl = this._fpsController;
        if (!ctrl) return;
        if ((ctrl._velY ?? 0) <= 0) return;  // only needed when moving upward

        this._rayOrigin.set(playerPos.x, playerPos.y, playerPos.z);
        this._rayDir.set(0, 1, 0);
        this._raycaster.set(this._rayOrigin, this._rayDir);
        this._raycaster.far = CEILING_RAY_LEN;

        const hits = this._raycaster.intersectObjects(this._colMeshes, false);
        if (hits.length > 0) {
            // Hit ceiling — kill upward velocity
            ctrl._velY = 0;
            ctrl._body?.setVelocity({
                x: ctrl._velX ?? 0,
                y: 0,
                z: ctrl._velZ ?? 0,
            });
        }
    }

    // ── Trigger volumes ───────────────────────────────────────────────────────

    /**
     * Register trigger volumes from level data.
     * @param {Array<{ id, min:{x,y,z}, max:{x,y,z}, onEnter?, onExit? }>} specs
     */
    _buildTriggers(specs) {
        // From level JSON definitions
        for (const spec of specs) {
            this._triggers.push({
                id:      spec.id,
                aabb:    new THREE.Box3(
                    new THREE.Vector3(spec.min.x, spec.min.y, spec.min.z),
                    new THREE.Vector3(spec.max.x, spec.max.y, spec.max.z),
                ),
                onEnter: spec.onEnter ?? null,
                onExit:  spec.onExit  ?? null,
                active:  false,
            });
        }

        // From GLTF trig_ meshes
        for (const mesh of (this._triggerMeshes ?? [])) {
            const box = new THREE.Box3().setFromObject(mesh);
            const id  = mesh.name.replace(/^trig_/i, '');
            this._triggers.push({ id, aabb: box, onEnter: null, onExit: null, active: false });
        }
    }

    /**
     * Register a named trigger callback at runtime (called by game logic).
     * @param {string}        id
     * @param {'enter'|'exit'} event
     * @param {function}      cb
     */
    onTrigger(id, event, cb) {
        const trig = this._triggers.find(t => t.id === id);
        if (!trig) {
            console.warn(`[WorldGeometry] onTrigger: unknown trigger "${id}"`);
            return;
        }
        if (event === 'enter') trig.onEnter = cb;
        else                   trig.onExit  = cb;
    }

    /**
     * Poll all trigger volumes against player position.
     * Fires onEnter / onExit when crossing boundary.
     * @param {{ x:number, y:number, z:number }} pos
     */
    _pollTriggers(pos) {
        const pt = new THREE.Vector3(pos.x, pos.y, pos.z);
        for (const trig of this._triggers) {
            const inside = trig.aabb.containsPoint(pt);
            if (inside && !trig.active) {
                trig.active = true;
                try { trig.onEnter?.(trig.id, pos); } catch (e) { console.warn(e); }
            } else if (!inside && trig.active) {
                trig.active = false;
                try { trig.onExit?.(trig.id, pos); } catch (e) { console.warn(e); }
            }
        }
    }

    // ── Portal system ─────────────────────────────────────────────────────────

    /**
     * Build portal pairs from level data.
     * @param {Array<{ idA:string, posA:{x,y,z}, normalA:{x,y,z},
     *                 idB:string, posB:{x,y,z}, normalB:{x,y,z} }>} specs
     */
    _buildPortals(specs) {
        for (const spec of specs) {
            this._portals.push({
                idA:     spec.idA,
                posA:    new THREE.Vector3(spec.posA.x, spec.posA.y, spec.posA.z),
                normalA: new THREE.Vector3(spec.normalA?.x ?? 0, spec.normalA?.y ?? 0, spec.normalA?.z ?? 1).normalize(),
                idB:     spec.idB,
                posB:    new THREE.Vector3(spec.posB.x, spec.posB.y, spec.posB.z),
                normalB: new THREE.Vector3(spec.normalB?.x ?? 0, spec.normalB?.y ?? 0, spec.normalB?.z ?? -1).normalize(),
                radius:  spec.radius ?? 1.2,
            });
        }

        // From GLTF portal_ meshes: pair portal_A_<name> with portal_B_<name>
        const portalMeshMap = new Map();
        for (const mesh of (this._portalMeshes ?? [])) {
            // Expect names like "portal_A_cave" and "portal_B_cave"
            const m = mesh.name.match(/^portal_(A|B)_(.+)$/i);
            if (!m) continue;
            const [, side, id] = m;
            if (!portalMeshMap.has(id)) portalMeshMap.set(id, {});
            const entry = portalMeshMap.get(id);
            entry[side.toUpperCase()] = mesh;
        }

        for (const [id, pair] of portalMeshMap) {
            if (!pair.A || !pair.B) continue;
            const posA = new THREE.Vector3();
            const posB = new THREE.Vector3();
            pair.A.getWorldPosition(posA);
            pair.B.getWorldPosition(posB);

            // Use mesh's local +Z as the portal normal
            const normalA = new THREE.Vector3(0, 0, 1).applyQuaternion(
                new THREE.Quaternion().setFromRotationMatrix(pair.A.matrixWorld)
            ).normalize();
            const normalB = new THREE.Vector3(0, 0, 1).applyQuaternion(
                new THREE.Quaternion().setFromRotationMatrix(pair.B.matrixWorld)
            ).normalize();

            this._portals.push({ idA: id + '_A', posA, normalA, idB: id + '_B', posB, normalB, radius: 1.2 });
            console.log(`[WorldGeometry] portal pair "${id}" registered`);
        }
    }

    /**
     * Check if player is inside any portal radius; teleport if so.
     * @param {{ x:number, y:number, z:number }} pos
     * @param {number} gameTime
     */
    _checkPortals(pos, gameTime) {
        if (gameTime - this._lastPortalTime < PORTAL_COOLDOWN) return;

        const pt = new THREE.Vector3(pos.x, pos.y, pos.z);

        for (const portal of this._portals) {
            // Check A → B
            if (pt.distanceTo(portal.posA) < portal.radius) {
                this._teleportThrough(portal.posA, portal.normalA, portal.posB, portal.normalB);
                this._lastPortalTime = gameTime;
                console.log(`[WorldGeometry] portal travel: ${portal.idA} → ${portal.idB}`);
                return;
            }
            // Check B → A
            if (pt.distanceTo(portal.posB) < portal.radius) {
                this._teleportThrough(portal.posB, portal.normalB, portal.posA, portal.normalA);
                this._lastPortalTime = gameTime;
                console.log(`[WorldGeometry] portal travel: ${portal.idB} → ${portal.idA}`);
                return;
            }
        }
    }

    /**
     * Teleport player from one portal face to another, preserving relative velocity.
     * Rotates velocity vector to match exit portal orientation.
     */
    _teleportThrough(fromPos, fromNormal, toPos, toNormal) {
        const ctrl = this._fpsController;
        if (!ctrl) return;

        // Offset exit position slightly along the exit normal to avoid re-triggering
        const exitPos = toPos.clone().addScaledVector(toNormal, 1.2);
        ctrl.setPosition(exitPos.x, exitPos.y + (ctrl._eyeHeightCurrent ?? 1.7), exitPos.z);

        // Rotate horizontal velocity from entry → exit orientation
        const entryAngle = Math.atan2(fromNormal.x, fromNormal.z);
        const exitAngle  = Math.atan2(toNormal.x,   toNormal.z);
        const deltaAngle = exitAngle - entryAngle;

        const sinD = Math.sin(deltaAngle);
        const cosD = Math.cos(deltaAngle);
        const vx   = ctrl._velX ?? 0;
        const vz   = ctrl._velZ ?? 0;
        ctrl._velX = vx * cosD - vz * sinD;
        ctrl._velZ = vx * sinD + vz * cosD;

        // Rotate camera yaw to face exit direction
        if (ctrl._fpsCamera) {
            ctrl._fpsCamera._yaw += deltaAngle;
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────

    // ── TextureAtlas3D ────────────────────────────────────────────────────────

    /**
     * Load TextureAtlas3D and switch all block visuals to atlas mode.
     * @param {object} THREE_in  THREE module reference (falls back to imported THREE)
     */
    async enableTileset(THREE_in) {
        const T = THREE_in || THREE;
        const { default: TextureAtlas3D } = await import('/engines/shared/TextureAtlas3D.js');
        this._atlas = new TextureAtlas3D();
        await this._atlas.loadAsync(T);
        this._tilesetEnabled = true;
        this._rebuildAtlasVisuals(T);
    }

    /** Restore solid-color mode. */
    disableTileset() {
        this._tilesetEnabled = false;
        this._atlas          = null;
        this._rebuildAtlasVisuals(THREE);
    }

    /** @returns {boolean} */
    isTilesetEnabled() { return this._tilesetEnabled; }

    /**
     * Remove any proc_ atlas meshes and rebuild with current tileset state.
     * @private
     */
    _rebuildAtlasVisuals(T = THREE) {
        // Remove previously added atlas/proc block meshes
        const toRemove = this._scene.children.filter(
            c => c.name?.startsWith('proc_block_')
        );
        for (const obj of toRemove) {
            this._scene.remove(obj);
            obj.geometry?.dispose();
        }
        if (this._tilesetEnabled && this._atlas) {
            this._addAtlasFloorMesh(T);
        }
    }

    /**
     * Build a box mesh for a named FPS block type using atlas UVs or solid color.
     * @param {string} type  'floor'|'wall'|'ceiling'|'crate'|'door'|'window'
     * @param {number} cx,cy,cz  center position
     * @param {number} w,h,d     dimensions
     * @param {object} T         THREE module
     * @returns {THREE.Mesh}
     */
    _buildAtlasBlockMesh(type, cx, cy, cz, w, h, d, T = THREE) {
        const geo = new T.BoxGeometry(w, h, d);
        this._atlas.applyBlockUVs(geo, type);
        const mat  = this._atlas.getMaterial(T);
        const mesh = new T.Mesh(geo, mat);
        mesh.position.set(cx, cy, cz);
        mesh.castShadow    = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    /** Add an atlas floor mesh for the procedural room. @private */
    _addAtlasFloorMesh(T = THREE) {
        const size = 20;  // matches default roomSize
        const mesh = this._buildAtlasBlockMesh('floor', 0, -0.1, 0, size, 0.2, size, T);
        mesh.name = 'proc_block_floor';
        this._scene.add(mesh);
        this._colMeshes.push(mesh);
    }

    /**
     * Get the AABB of the loaded level geometry.
     * Useful for minimap bounds, fog-of-war grid sizing, etc.
     * @returns {THREE.Box3}
     */
    getBounds() {
        const box = new THREE.Box3();
        if (this._levelRoot) {
            box.setFromObject(this._levelRoot);
        } else {
            box.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 5, 10));
        }
        return box;
    }

    /**
     * Get all trigger IDs currently active (player inside).
     * @returns {string[]}
     */
    getActiveTriggers() {
        return this._triggers.filter(t => t.active).map(t => t.id);
    }

    /**
     * Dynamically register a trigger volume at runtime.
     * @param {string}          id
     * @param {THREE.Box3}      aabb
     * @param {function|null}   onEnter
     * @param {function|null}   onExit
     */
    addTrigger(id, aabb, onEnter = null, onExit = null) {
        // Remove existing trigger with same id first
        this._triggers = this._triggers.filter(t => t.id !== id);
        this._triggers.push({ id, aabb, onEnter, onExit, active: false });
    }

    /**
     * Remove a trigger by id.
     * @param {string} id
     */
    removeTrigger(id) {
        this._triggers = this._triggers.filter(t => t.id !== id);
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    dispose() {
        // Remove all static bodies from the physics world
        for (const body of this._staticBodies) {
            this._physics?.removeBody(body);
        }
        this._staticBodies = [];

        // Remove level root from scene
        if (this._levelRoot) {
            this._scene.remove(this._levelRoot);
            this._levelRoot = null;
        }

        // Remove procedural meshes
        const toRemove = this._scene.children.filter(c => c.name?.startsWith('proc_'));
        for (const obj of toRemove) this._scene.remove(obj);

        this._triggers      = [];
        this._portals       = [];
        this._colMeshes     = [];
        this._triggerMeshes = [];
        this._portalMeshes  = [];

        console.log('[WorldGeometry] disposed');
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Infer surface material from mesh name fragments.
 * e.g. "floor_metal_01" → "metal"
 */
function _surfaceFromName(name = '') {
    const n = name.toLowerCase();
    if (n.includes('grass') || n.includes('dirt') || n.includes('soil'))  return 'grass';
    if (n.includes('metal') || n.includes('steel') || n.includes('iron')) return 'metal';
    if (n.includes('wood')  || n.includes('plank') || n.includes('crate')) return 'wood';
    return 'concrete';
}
