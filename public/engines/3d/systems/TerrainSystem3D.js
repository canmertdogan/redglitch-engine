/**
 * TerrainSystem3D.js — Voxel + low-poly terrain for the Topdown-3D engine.
 *
 * Two render modes (set via levelData.terrain.mode):
 *
 *  "voxel"    — Chunk-based world (16×16×16 blocks/chunk).
 *               Greedy meshing merges co-planar same-colour faces into quads
 *               for low draw-call count.  Per-block colour from PaletteManager.
 *               Block types: GRASS DIRT STONE SAND WOOD WATER LAVA SNOW (+ AIR).
 *               Destructible flag per block.
 *
 *  "lowpoly"  — Flat-triangle mesh from an elevation grid (Float32Array).
 *               Per-face solid palette colours, no UV mapping.
 *               Water: animated flat plane (sine-wave vertex offset).
 *               Foliage: InstancedMesh trees/rocks/bushes (≤50 tris, up to 10k).
 *
 * Usage:
 *   const terrain = new TerrainSystem3D(scene, palette, physics);
 *   terrain.onLevelLoaded(levelData);   // reads levelData.terrain
 *   terrain.update(dt, gameTime);       // water animation
 *   terrain.dispose();
 *
 * Destructible API (voxel mode):
 *   terrain.getBlock(wx, wy, wz)          → block type index (0=AIR)
 *   terrain.setBlock(wx, wy, wz, type)    → modify + rebuild chunk mesh
 *   terrain.isDestructible(wx, wy, wz)    → boolean
 */

import * as THREE from '/lib/three/three.module.js';
import { BodyType, ShapeType } from '/engines/shared/Physics3DWorld.js';

// ── Block types ───────────────────────────────────────────────────────────────

export const BlockType = Object.freeze({
    AIR:   0,
    GRASS: 1,
    DIRT:  2,
    STONE: 3,
    SAND:  4,
    WOOD:  5,
    WATER: 6,
    LAVA:  7,
    SNOW:  8,
});

// Default palette indices for each block type
const BLOCK_PALETTE = {
    [BlockType.GRASS]: 2,
    [BlockType.DIRT]:  3,
    [BlockType.STONE]: 5,
    [BlockType.SAND]:  4,
    [BlockType.WOOD]:  6,
    [BlockType.WATER]: 9,
    [BlockType.LAVA]:  7,
    [BlockType.SNOW]:  1,
};

// Destructible flags
const BLOCK_DESTRUCTIBLE = {
    [BlockType.GRASS]: true,
    [BlockType.DIRT]:  true,
    [BlockType.STONE]: false,
    [BlockType.SAND]:  true,
    [BlockType.WOOD]:  true,
    [BlockType.WATER]: false,
    [BlockType.LAVA]:  false,
    [BlockType.SNOW]:  true,
};

// ── Chunk constants ───────────────────────────────────────────────────────────

const CHUNK_SIZE  = 16;   // blocks per axis
const CHUNK_SIZE2 = CHUNK_SIZE * CHUNK_SIZE;
const CHUNK_SIZE3 = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

// ── Foliage templates (low-poly, ≤50 triangles) ───────────────────────────────

const FOLIAGE_TYPES = ['tree', 'rock', 'bush'];

// ── TerrainSystem3D ───────────────────────────────────────────────────────────

export default class TerrainSystem3D {

    /**
     * @param {THREE.Scene}    scene
     * @param {PaletteManager} palette
     * @param {Physics3DWorld} [physics]  Pass to auto-add terrain collision bodies
     */
    constructor(scene, palette, physics = null) {
        this.scene   = scene;
        this.palette = palette;
        this.physics = physics;

        // ── Mode ──────────────────────────────────────────────────────────
        this._mode = 'voxel';  // 'voxel' | 'lowpoly' | 'trimesh'

        // ── TextureAtlas3D (optional) ──────────────────────────────────────
        this._atlas          = null;
        this._tilesetEnabled = false;

        // ── Voxel state ───────────────────────────────────────────────────
        /** @type {Map<string, Uint8Array>} chunkKey → block data */
        this._chunks      = new Map();
        /** @type {Map<string, THREE.Mesh>} chunkKey → mesh */
        this._chunkMeshes = new Map();
        /** @type {Map<string, Uint8Array>} chunkKey → destructible flags */
        this._chunkDestruct = new Map();

        // ── Low-poly state ────────────────────────────────────────────────
        this._terrainMesh  = null;   // flat-triangle terrain mesh
        this._waterMesh    = null;   // animated water plane
        this._waterGeo     = null;   // BufferGeometry for water verts
        this._waterBaseY   = 0;      // base water level
        this._elevGrid     = null;   // Float32Array elevation data
        this._gridW        = 0;
        this._gridD        = 0;
        this._cellSize     = 1;

        // ── Foliage ───────────────────────────────────────────────────────
        /** @type {Map<string, THREE.InstancedMesh>} type → instanced mesh */
        this._foliageMeshes = new Map();

        // ── Level data ────────────────────────────────────────────────────
        this._levelData = null;

        // ── Working matrix ─────────────────────────────────────────────────
        this._mtx = new THREE.Matrix4();
        this._scaleVec = new THREE.Vector3();
        this._col = new THREE.Color();
        this._ray = new THREE.Raycaster();

        // Terrain collision body (static)
        this._terrainBody = null;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * onLevelLoaded(levelData) — build terrain from level definition.
     * levelData.terrain shape:
     * {
     *   mode: 'voxel' | 'lowpoly',
     *
     *   // voxel mode:
     *   chunks: [{ cx, cy, cz, blocks: number[] }],  // blocks = CHUNK_SIZE³ Uint8
     *
     *   // lowpoly mode:
     *   gridW: number, gridD: number, cellSize: number,
     *   elevation: number[],        // gridW×gridD floats
     *   faceColors: number[],       // (gridW-1)×(gridD-1)×2 palette indices
     *   waterLevel: number,
     *   foliage: [{ type, x, y, z, scale, paletteIndex }]
     * }
     */
    onLevelLoaded(levelData) {
        this.dispose();

        const td = levelData?.terrain;
        if (!td) {
            console.warn('[TerrainSystem3D] No terrain in level data — building default flat');
            this._buildDefaultFlat();
            return;
        }

        this._mode      = td.mode || 'voxel';
        this._levelData = td;

        if (this._mode === 'voxel') {
            this._buildVoxelWorld(td);
        } else if (this._mode === 'trimesh') {
            this._buildTrimeshWorld(levelData?.trimesh, td);
        } else {
            this._buildLowPolyWorld(td);
        }

        console.log(`[TerrainSystem3D] Built ${this._mode} terrain`);
    }

    /**
     * update(dt, gameTime) — animate water, update any per-frame terrain effects.
     */
    update(dt, gameTime) {
        if (this._waterGeo) {
            this._animateWater(gameTime);
        }
    }

    // ── TextureAtlas3D ────────────────────────────────────────────────────────

    // Map BlockType integer → atlas block type name string
    static get ATLAS_BLOCK_NAMES() {
        return { 1:'GRASS', 2:'DIRT', 3:'STONE', 4:'SAND', 5:'WOOD', 6:'WATER', 7:'LAVA', 8:'SNOW' };
    }

    /**
     * Load TextureAtlas3D and switch all voxel chunks to per-face atlas rendering.
     * @param {object} THREE_in  THREE module reference
     */
    async enableTileset(THREE_in) {
        const T = THREE_in || THREE;
        const { default: TextureAtlas3D } = await import('/engines/shared/TextureAtlas3D.js');
        this._atlas = new TextureAtlas3D();
        await this._atlas.loadAsync(T);
        this._tilesetEnabled = true;
        // Rebuild all existing chunks with atlas face geometry
        for (const [key, data] of this._chunks) {
            const [cx, cy, cz] = key.split(',').map(Number);
            this._buildChunkMesh(cx, cy, cz, key, data);
        }
    }

    /** Restore solid-color vertex-colored greedy mesh. */
    disableTileset() {
        this._tilesetEnabled = false;
        this._atlas          = null;
        for (const [key, data] of this._chunks) {
            const [cx, cy, cz] = key.split(',').map(Number);
            this._buildChunkMesh(cx, cy, cz, key, data);
        }
    }

    /** @returns {boolean} */
    isTilesetEnabled() { return this._tilesetEnabled; }

    /**
     * Build a per-face quad mesh for a chunk using the atlas texture.
     * Unlike greedy meshing, each 1×1 face gets its own UVs from the atlas.
     * All faces in the chunk are merged into a single BufferGeometry.
     * @private
     */
    _buildAtlasFaceMesh(cx, cy, cz, key, data) {
        const oldMesh = this._chunkMeshes.get(key);
        if (oldMesh) {
            this.scene.remove(oldMesh);
            oldMesh.geometry.dispose();
        }

        const NAMES = TerrainSystem3D.ATLAS_BLOCK_NAMES;
        const FACES = [
            { dir: [1,0,0],  uDir: [0,0,1],  vDir: [0,1,0], face: 'side'   },  // +X
            { dir: [-1,0,0], uDir: [0,0,-1], vDir: [0,1,0], face: 'side'   },  // -X
            { dir: [0,1,0],  uDir: [1,0,0],  vDir: [0,0,1], face: 'top'    },  // +Y
            { dir: [0,-1,0], uDir: [1,0,0],  vDir: [0,0,-1],face: 'bottom' },  // -Y
            { dir: [0,0,1],  uDir: [-1,0,0], vDir: [0,1,0], face: 'side'   },  // +Z
            { dir: [0,0,-1], uDir: [1,0,0],  vDir: [0,1,0], face: 'side'   },  // -Z
        ];

        const positions = [];
        const normals   = [];
        const uvs       = [];
        const indices   = [];
        let vi = 0;

        for (let bx = 0; bx < CHUNK_SIZE; bx++) {
            for (let by = 0; by < CHUNK_SIZE; by++) {
                for (let bz = 0; bz < CHUNK_SIZE; bz++) {
                    const type = data[_chunkIdx(bx, by, bz)];
                    if (type === BlockType.AIR) continue;
                    const atlasName = NAMES[type] || 'STONE';

                    const wx = cx * CHUNK_SIZE + bx;
                    const wy = cy * CHUNK_SIZE + by;
                    const wz = cz * CHUNK_SIZE + bz;

                    for (const { dir, uDir, vDir, face } of FACES) {
                        const [nx, ny, nz] = dir;
                        const nbx = bx + nx, nby = by + ny, nbz = bz + nz;
                        let neighbourAir = true;
                        if (nbx >= 0 && nbx < CHUNK_SIZE &&
                            nby >= 0 && nby < CHUNK_SIZE &&
                            nbz >= 0 && nbz < CHUNK_SIZE) {
                            neighbourAir = data[_chunkIdx(nbx, nby, nbz)] === BlockType.AIR;
                        }
                        if (!neighbourAir) continue;

                        const cfg  = this._atlas._config?.blocks?.[atlasName];
                        const tile = face === 'top' ? cfg?.top : face === 'bottom' ? cfg?.bottom : cfg?.side;
                        const rect = this._atlas.getUVRect(tile || null);

                        const [ux, uy, uz] = uDir;
                        const [vx, vy, vz] = vDir;
                        const bpx = wx + (nx > 0 ? 1 : 0);
                        const bpy = wy + (ny > 0 ? 1 : 0);
                        const bpz = wz + (nz > 0 ? 1 : 0);

                        const corners = [
                            [bpx,          bpy,          bpz          ],
                            [bpx + ux,     bpy + uy,     bpz + uz     ],
                            [bpx + ux + vx,bpy + uy + vy,bpz + uz + vz],
                            [bpx + vx,     bpy + vy,     bpz + vz     ],
                        ];
                        const uvCorners = [
                            [rect.u0, rect.v0],
                            [rect.u1, rect.v0],
                            [rect.u1, rect.v1],
                            [rect.u0, rect.v1],
                        ];

                        for (let i = 0; i < 4; i++) {
                            positions.push(...corners[i]);
                            normals.push(nx, ny, nz);
                            uvs.push(...uvCorners[i]);
                        }
                        indices.push(vi, vi+1, vi+2, vi, vi+2, vi+3);
                        vi += 4;
                    }
                }
            }
        }

        if (positions.length === 0) return;

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3));
        geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs,       2));
        geo.setIndex(indices);

        const mat  = this._atlas.getMaterial(THREE);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow    = true;
        mesh.receiveShadow = true;
        mesh.name          = `chunk_atlas_${key}`;

        const hybrid = this.scene.userData.hybridScene;
        if (hybrid) {
            hybrid.addVoxelChunk(`atlas_${key}`, mesh);
        } else {
            this.scene.add(mesh);
        }
        this._chunkMeshes.set(key, mesh);
    }

    /**
     * dispose() — remove all terrain meshes and free GPU memory.
     */
    dispose() {
        // Voxel chunks
        for (const mesh of this._chunkMeshes.values()) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
        }
        this._chunks.clear();
        this._chunkMeshes.clear();
        this._chunkDestruct.clear();

        // Low-poly terrain
        if (this._terrainMesh) {
            this.scene.remove(this._terrainMesh);
            this._terrainMesh.geometry.dispose();
            this._terrainMesh = null;
        }
        if (this._waterMesh) {
            this.scene.remove(this._waterMesh);
            this._waterMesh.geometry.dispose();
            this._waterMesh = null;
        }
        this._waterGeo = null;

        // Foliage
        for (const im of this._foliageMeshes.values()) {
            this.scene.remove(im);
            im.geometry.dispose();
        }
        this._foliageMeshes.clear();

        if (this._terrainBody && this.physics?.world && this.physics?.removeBody) {
            this.physics.removeBody(this._terrainBody);
        }
        this._terrainBody = null;
    }

    // ── Voxel public API ──────────────────────────────────────────────────────

    /**
     * getBlock(wx, wy, wz) — return block type at world integer coordinates.
     * @returns {number} BlockType (0 = AIR if out of bounds)
     */
    getBlock(wx, wy, wz) {
        const { key, lx, ly, lz } = this._worldToChunk(wx, wy, wz);
        const data = this._chunks.get(key);
        if (!data) return BlockType.AIR;
        return data[_chunkIdx(lx, ly, lz)];
    }

    /**
     * setBlock(wx, wy, wz, type) — place/remove a block and rebuild the chunk mesh.
     * @param {number} type BlockType constant (0 = AIR to remove)
     */
    setBlock(wx, wy, wz, type) {
        const { cx, cy, cz, key, lx, ly, lz } = this._worldToChunk(wx, wy, wz);
        let data = this._chunks.get(key);
        if (!data) {
            data = new Uint8Array(CHUNK_SIZE3);
            this._chunks.set(key, data);
        }
        data[_chunkIdx(lx, ly, lz)] = type;
        this._buildChunkMesh(cx, cy, cz, key, data);
    }

    /**
     * isDestructible(wx, wy, wz) — can this block be destroyed by abilities?
     */
    isDestructible(wx, wy, wz) {
        const type = this.getBlock(wx, wy, wz);
        return BLOCK_DESTRUCTIBLE[type] ?? false;
    }

    /**
     * sampleHeight(wx, wz) — world Y at ground level at (wx, wz).
     * Voxel mode: top solid block. Low-poly mode: interpolated elevation.
     * @returns {number}
     */
    sampleHeight(wx, wz) {
        if (this._mode === 'voxel') {
            return this._voxelSampleHeight(wx, wz);
        }
        if (this._mode === 'trimesh') {
            return this._trimeshSampleHeight(wx, wz);
        }
        return this._lowpolySampleHeight(wx, wz);
    }

    sampleWater(wx, wz) {
        const td = this._levelData;
        if (!td || this._mode !== 'lowpoly' || !Array.isArray(td.waterMask)) {
            return { inWater: false, waterY: null, depth: 0 };
        }

        const gridW = this._gridW || td.gridW || 0;
        const gridD = this._gridD || td.gridD || 0;
        const cellSize = this._cellSize || td.cellSize || 1;
        const waterY = Number(td.waterLevel);
        if (gridW < 2 || gridD < 2 || !Number.isFinite(waterY)) {
            return { inWater: false, waterY: null, depth: 0 };
        }

        const gx = wx / cellSize;
        const gz = wz / cellSize;
        if (gx < 0 || gz < 0 || gx > gridW - 1 || gz > gridD - 1) {
            return { inWater: false, waterY, depth: 0 };
        }

        const ix = Math.max(0, Math.min(gridW - 2, Math.floor(gx)));
        const iz = Math.max(0, Math.min(gridD - 2, Math.floor(gz)));
        const fx = gx - ix;
        const fz = gz - iz;
        const mask = td.waterMask;
        const m00 = Number(mask[iz * gridW + ix] ?? 0) || 0;
        const m10 = Number(mask[iz * gridW + ix + 1] ?? 0) || 0;
        const m01 = Number(mask[(iz + 1) * gridW + ix] ?? 0) || 0;
        const m11 = Number(mask[(iz + 1) * gridW + ix + 1] ?? 0) || 0;
        const mx0 = THREE.MathUtils.lerp(m00, m10, fx);
        const mx1 = THREE.MathUtils.lerp(m01, m11, fx);
        const wetness = THREE.MathUtils.lerp(mx0, mx1, fz);
        const floorY = this.sampleHeight(wx, wz);
        const depth = Math.max(0, waterY - floorY);
        return {
            inWater: wetness > 0.04 && depth > 0.04,
            waterY,
            floorY,
            depth,
            wetness,
        };
    }

    // ── Voxel build ───────────────────────────────────────────────────────────

    _buildVoxelWorld(td) {
        const chunks = td.chunks || [];

        if (chunks.length === 0) {
            // Generate a default flat world (1 chunk of grass)
            this._generateDefaultVoxelChunk(0, 0, 0);
        } else {
            for (const cd of chunks) {
                const key  = _chunkKey(cd.cx, cd.cy, cd.cz);
                const data = new Uint8Array(cd.blocks || CHUNK_SIZE3);
                this._chunks.set(key, data);
                this._buildChunkMesh(cd.cx, cd.cy, cd.cz, key, data);
            }
        }

        // Build a physics collider from merged chunk geometry
        this._rebuildVoxelCollider();
    }

    _rebuildVoxelCollider() {
        if (!this.physics?.createBody || !this.physics?.world) return;

        // Remove old voxel collider
        if (this._terrainBody && this.physics?.removeBody) {
            this.physics.removeBody(this._terrainBody);
            this._terrainBody = null;
        }

        // For voxel terrain, find surface bounds from chunk data and create
        // a flat, thin static BOX collider whose top face is at surfaceY.
        let minX = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxZ = -Infinity;
        let surfaceY = -Infinity;

        for (const [key, data] of this._chunks) {
            const [cx, cy, cz] = key.split(',').map(Number);
            const baseX = cx * CHUNK_SIZE;
            const baseY = cy * CHUNK_SIZE;
            const baseZ = cz * CHUNK_SIZE;
            for (let bx = 0; bx < CHUNK_SIZE; bx++) {
                for (let by = 0; by < CHUNK_SIZE; by++) {
                    for (let bz = 0; bz < CHUNK_SIZE; bz++) {
                        if (data[_chunkIdx(bx, by, bz)] === BlockType.AIR) continue;
                        const wy = baseY + by;
                        if (wy + 1 > surfaceY) surfaceY = wy + 1;
                        const wx = baseX + bx;
                        const wz = baseZ + bz;
                        if (wx < minX) minX = wx;
                        if (wz < minZ) minZ = wz;
                        if (wx + 1 > maxX) maxX = wx + 1;
                        if (wz + 1 > maxZ) maxZ = wz + 1;
                    }
                }
            }
        }

        if (!Number.isFinite(surfaceY)) return;

        const halfW = (maxX - minX) / 2;
        const halfD = (maxZ - minZ) / 2;
        const halfH = 0.25;
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        const cy = surfaceY - halfH;  // top face at surfaceY

        this._terrainBody = this.physics.createBody({
            type: BodyType.STATIC,
            shape: ShapeType.BOX,
            halfExtents: { x: halfW, y: halfH, z: halfD },
            position: new THREE.Vector3(cx, cy, cz),
            mass: 0,
            restitution: 0,
        });
        if (this._terrainBody?.body) {
            this._terrainBody.body.userData = { surface: 'concrete' };
            // Collision filter group: terrain = 4.  Player sphere excludes
            // this group from its mask to prevent Sphere-vs-Trimesh jitter.
            this._terrainBody.body.collisionFilterGroup = 4;
        }
    }

    _generateDefaultVoxelChunk(cx, cy, cz) {
        const key  = _chunkKey(cx, cy, cz);
        const data = new Uint8Array(CHUNK_SIZE3);

        // Fill bottom 2 layers: dirt, top layer: grass
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                data[_chunkIdx(x, 0, z)] = BlockType.STONE;
                data[_chunkIdx(x, 1, z)] = BlockType.DIRT;
                data[_chunkIdx(x, 2, z)] = BlockType.GRASS;
            }
        }
        this._chunks.set(key, data);
        this._buildChunkMesh(cx, cy, cz, key, data);
    }

    /**
     * _buildChunkMesh — greedy meshing: merge co-planar same-colour faces into quads.
     * Produces one merged BufferGeometry per chunk (one draw call per chunk).
     */
    _buildChunkMesh(cx, cy, cz, key, data) {
        // If atlas mode is active, delegate to per-face atlas renderer
        if (this._tilesetEnabled && this._atlas) {
            this._buildAtlasFaceMesh(cx, cy, cz, key, data);
            return;
        }

        // Remove old mesh
        const oldMesh = this._chunkMeshes.get(key);
        if (oldMesh) {
            this.scene.remove(oldMesh);
            oldMesh.geometry.dispose();
        }

        const positions = [];
        const normals   = [];
        const colors    = [];
        const indices   = [];
        let   vi        = 0;  // vertex index counter

        // 6 face directions: +X -X +Y -Y +Z -Z
        const FACES = [
            { dir: [1,0,0],  u: [0,0,1], v: [0,1,0] },  // +X
            { dir: [-1,0,0], u: [0,0,-1],v: [0,1,0] },  // -X
            { dir: [0,1,0],  u: [1,0,0], v: [0,0,1] },  // +Y (top)
            { dir: [0,-1,0], u: [1,0,0], v: [0,0,-1] }, // -Y (bottom)
            { dir: [0,0,1],  u: [-1,0,0],v: [0,1,0] },  // +Z
            { dir: [0,0,-1], u: [1,0,0], v: [0,1,0] },  // -Z
        ];

        for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
            const { dir, u: uDir, v: vDir } = FACES[faceIdx];
            const [nx, ny, nz] = dir;

            // Iterate over all blocks; add a face quad if the block is solid
            // and the neighbour in dir is AIR (face culling)
            for (let bx = 0; bx < CHUNK_SIZE; bx++) {
                for (let by = 0; by < CHUNK_SIZE; by++) {
                    for (let bz = 0; bz < CHUNK_SIZE; bz++) {
                        const type = data[_chunkIdx(bx, by, bz)];
                        if (type === BlockType.AIR) continue;

                        const nbx = bx + nx, nby = by + ny, nbz = bz + nz;

                        // Neighbour: check bounds then AIR check
                        let neighbourAir = true;
                        if (nbx >= 0 && nbx < CHUNK_SIZE &&
                            nby >= 0 && nby < CHUNK_SIZE &&
                            nbz >= 0 && nbz < CHUNK_SIZE) {
                            neighbourAir = data[_chunkIdx(nbx, nby, nbz)] === BlockType.AIR;
                        }
                        if (!neighbourAir) continue;

                        // World-space block origin
                        const wx = cx * CHUNK_SIZE + bx;
                        const wy = cy * CHUNK_SIZE + by;
                        const wz = cz * CHUNK_SIZE + bz;

                        // Palette colour for this block type
                        const palIdx = BLOCK_PALETTE[type] ?? 0;
                        const col    = this.palette.getColor(palIdx);

                        // Quad vertices (4 corners)
                        // corner = blockOrigin + offset based on face + uDir + vDir
                        const [ux, uy, uz] = uDir;
                        const [vx, vy, vz] = vDir;

                        // Base corner: block position, pushed by face direction
                        const bpx = wx + (nx > 0 ? 1 : 0);
                        const bpy = wy + (ny > 0 ? 1 : 0);
                        const bpz = wz + (nz > 0 ? 1 : 0);

                        // 4 corners of the 1×1 quad face
                        const corners = [
                            [bpx,          bpy,          bpz          ],
                            [bpx + ux,     bpy + uy,     bpz + uz     ],
                            [bpx + ux + vx,bpy + uy + vy,bpz + uz + vz],
                            [bpx + vx,     bpy + vy,     bpz + vz     ],
                        ];

                        for (const [cx_, cy_, cz_] of corners) {
                            positions.push(cx_, cy_, cz_);
                            normals.push(nx, ny, nz);
                            colors.push(col.r, col.g, col.b);
                        }

                        // Two triangles (CCW winding)
                        indices.push(vi, vi+1, vi+2, vi, vi+2, vi+3);
                        vi += 4;
                    }
                }
            }
        }

        if (positions.length === 0) return; // empty chunk

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3));
        geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors,    3));
        geo.setIndex(indices);

        const mat  = new THREE.MeshLambertMaterial({
            vertexColors: true,
            flatShading:  true,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow    = true;
        mesh.receiveShadow = true;
        mesh.name          = `chunk_${key}`;

        const hybrid = this.scene.userData.hybridScene;
        if (hybrid) {
            hybrid.addVoxelChunk(key, mesh);
        } else {
            this.scene.add(mesh);
        }
        this._chunkMeshes.set(key, mesh);
    }

    _voxelSampleHeight(wx, wz) {
        // Scan top-down to find highest solid block
        const bx = Math.floor(wx);
        const bz = Math.floor(wz);
        const cx = Math.floor(bx / CHUNK_SIZE);
        const cz = Math.floor(bz / CHUNK_SIZE);

        for (let by = CHUNK_SIZE - 1; by >= 0; by--) {
            const cy = 0;
            if (this.getBlock(bx, by, bz) !== BlockType.AIR) {
                return by + 1; // top of block
            }
        }
        return 0;
    }

    // ── Low-poly build ────────────────────────────────────────────────────────

    _buildLowPolyWorld(td) {
        this._gridW    = td.gridW    || 32;
        this._gridD    = td.gridD    || 32;
        this._cellSize = td.cellSize || 1;

        const W = this._gridW;
        const D = this._gridD;
        const C = this._cellSize;

        // Build elevation array
        let elev = td.elevation;
        if (!elev || elev.length < W * D) {
            console.warn('[TerrainSystem3D] _buildLowPolyWorld — bad elevation, using flat. elev:', typeof elev, 'length:', elev?.length, 'expected:', W * D);
            elev = new Array(W * D).fill(0);
        }
        this._elevGrid = new Float32Array(elev);

        // ── Build terrain mesh ─────────────────────────────────────────────
        const faceColors   = td.faceColors || [];
        const biomePalette = td.biomePalette || null;
        const _c           = this._col;          // reusable THREE.Color
        const positions    = [];
        const normals      = [];
        const colors       = [];
        const idxArr       = [];
        let vi = 0;

        // Pre-compute max elevation for biome-palette colour mapping
        let _biomeMax = 0;
        if (biomePalette) {
            for (let i = 0; i < elev.length; i++) { const v = elev[i]; if (v > _biomeMax) _biomeMax = v; }
            if (_biomeMax <= 0) _biomeMax = 1;
        }

        // Each cell → 2 triangles (split along diagonal)
        for (let iz = 0; iz < D - 1; iz++) {
            for (let ix = 0; ix < W - 1; ix++) {
                const h00 = elev[iz * W + ix];
                const h10 = elev[iz * W + (ix + 1)];
                const h01 = elev[(iz + 1) * W + ix];
                const h11 = elev[(iz + 1) * W + (ix + 1)];

                const x0 = ix * C,       z0 = iz * C;
                const x1 = (ix + 1) * C, z1 = (iz + 1) * C;

                // Resolve colour for triangle A (00→10→11) and B (00→11→01)
                let colA, colB;
                if (biomePalette) {
                    const avgA = (h00 + h10 + h11) / 3;
                    const avgB = (h00 + h11 + h01) / 3;
                    colA = _elevationToBiomeColor(avgA, _biomeMax, _c, biomePalette);
                    colB = _elevationToBiomeColor(avgB, _biomeMax, _c, biomePalette);
                } else {
                    const cellIdx = iz * (W - 1) + ix;
                    const palA    = faceColors[cellIdx * 2]     ?? 2;
                    const palB    = faceColors[cellIdx * 2 + 1] ?? 2;
                    colA = this.palette.getColor(palA);
                    colB = this.palette.getColor(palB);
                }

                // Upward winding for Three.js/Cannon. The previous order made
                // terrain visible from below and culled from above.
                const vA = [[x0,h00,z0],[x1,h11,z1],[x1,h10,z0]];
                const nA = _triNormal(...vA);
                for (const [px,py,pz] of vA) {
                    positions.push(px, py, pz);
                    normals.push(...nA);
                    colors.push(colA.r, colA.g, colA.b);
                }
                idxArr.push(vi, vi+1, vi+2); vi += 3;

                const vB = [[x0,h00,z0],[x0,h01,z1],[x1,h11,z1]];
                const nB = _triNormal(...vB);
                for (const [px,py,pz] of vB) {
                    positions.push(px, py, pz);
                    normals.push(...nB);
                    colors.push(colB.r, colB.g, colB.b);
                }
                idxArr.push(vi, vi+1, vi+2); vi += 3;
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
        geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
        geo.setIndex(idxArr);

        const mat = new THREE.MeshLambertMaterial({
            vertexColors: true,
            flatShading: true,
            side: THREE.DoubleSide,
            emissive: 0x263026,
            emissiveIntensity: 0.08,
        });
        this._terrainMesh = new THREE.Mesh(geo, mat);
        this._terrainMesh.receiveShadow = true;
        this._terrainMesh.castShadow    = false;
        this._terrainMesh.name          = 'lowpoly_terrain';
        this.scene.add(this._terrainMesh);
        this._rebuildTerrainCollider(this._terrainMesh);

        // ── Water plane ────────────────────────────────────────────────────
        if (Number.isFinite(td.waterLevel)) {
            const waterLevel = td.waterLevel;
            this._waterBaseY = waterLevel;
            if (Array.isArray(td.waterMask)) {
                this._buildWaterPlaneFromMask(td.waterMask, W, D, C, waterLevel, td.waterPaletteIndex ?? 9, td);
            } else {
                this._buildWaterPlane((W - 1) * C, (D - 1) * C, waterLevel, td.waterPaletteIndex ?? 9, td);
            }
        }

        // ── Foliage ────────────────────────────────────────────────────────
        if (Array.isArray(td.foliage) && td.foliage.length > 0) {
            this._buildFoliage(td.foliage);
        }
    }

    _buildTrimeshWorld(trimesh, td = {}) {
        const pos = Array.isArray(trimesh?.positions) ? trimesh.positions : [];
        if (pos.length < 9) {
            console.warn('[TerrainSystem3D] Invalid trimesh terrain — falling back to flat');
            this._buildDefaultFlat();
            return;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));

        const col = Array.isArray(trimesh?.colors) ? trimesh.colors : [];
        if (col.length === pos.length) {
            geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        }

        if (Array.isArray(trimesh?.indices) && trimesh.indices.length >= 3) {
            geo.setIndex(trimesh.indices);
        }

        geo.computeVertexNormals();
        const mat = new THREE.MeshLambertMaterial({
            vertexColors: !!geo.getAttribute('color'),
            flatShading: true,
            color: geo.getAttribute('color') ? 0xffffff : this.palette.getColor(2),
            side: THREE.DoubleSide,
            emissive: 0x263026,
            emissiveIntensity: 0.08,
        });
        this._terrainMesh = new THREE.Mesh(geo, mat);
        this._terrainMesh.receiveShadow = true;
        this._terrainMesh.castShadow    = false;
        this._terrainMesh.name          = 'trimesh_terrain';
        this.scene.add(this._terrainMesh);
        this._rebuildTerrainCollider(this._terrainMesh);

        const box = new THREE.Box3().setFromObject(this._terrainMesh);
        const w = Math.max(1, box.max.x - box.min.x);
        const d = Math.max(1, box.max.z - box.min.z);
        if (Number.isFinite(td.waterLevel)) {
            const waterLevel = td.waterLevel;
            this._waterBaseY = waterLevel;
            this._buildWaterPlane(w, d, waterLevel, td.waterPaletteIndex ?? 9, td);
            if (this._waterMesh) {
                this._waterMesh.position.x = box.min.x + w * 0.5;
                this._waterMesh.position.z = box.min.z + d * 0.5;
            }
        }
    }

    _buildWaterPlane(w, d, y, palIdx, td = {}) {
        // Subdivided plane for sine-wave animation (16×16 segments)
        const segs = 16;
        const geo  = new THREE.PlaneGeometry(w, d, segs, segs);
        geo.rotateX(-Math.PI / 2);
        geo.setAttribute('waterEdge', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count), 1));

        // Store water geometry for animation
        this._waterGeo = geo;

        const col = _resolveTerrainColor(td.waterColorHex, this.palette, palIdx);
        const mat = _makeWaterMaterial(col, td.waterOpacity);

        this._waterMesh = new THREE.Mesh(geo, mat);
        this._waterMesh.position.set(w / 2, y, d / 2);
        this._waterMesh.receiveShadow = false;
        this._waterMesh.name          = 'water_plane';
        this.scene.add(this._waterMesh);
    }

    _buildWaterPlaneFromMask(mask, gridW, gridD, cellSize, y, palIdx, td = {}) {
        const elevation = td.elevation;
        const filledMask = _fillWaterMask(mask, elevation, gridW, gridD, y);
        const waterY = y + 0.025;
        const positions = [];
        const edges = [];
        const addTri = (ax, az, bx, bz, cx, cz) => {
            positions.push(ax, waterY, az, bx, waterY, bz, cx, waterY, cz);
        };
        const addEdgeTri = (edge) => {
            edges.push(edge, edge, edge);
        };
        for (let iz = 0; iz < gridD - 1; iz++) {
            for (let ix = 0; ix < gridW - 1; ix++) {
                const m = Math.max(
                    filledMask[iz * gridW + ix] || 0,
                    filledMask[iz * gridW + (ix + 1)] || 0,
                    filledMask[(iz + 1) * gridW + ix] || 0,
                    filledMask[(iz + 1) * gridW + (ix + 1)] || 0,
                );
                const i00 = iz * gridW + ix;
                const i10 = iz * gridW + (ix + 1);
                const i01 = (iz + 1) * gridW + ix;
                const i11 = (iz + 1) * gridW + (ix + 1);
                const avgHeight = ((elevation?.[i00] || 0) + (elevation?.[i10] || 0) + (elevation?.[i01] || 0) + (elevation?.[i11] || 0)) / 4;
                const submerged = avgHeight <= y + 0.08;
                if (m <= 0.02 && !submerged) continue;
                const edge = _waterCellEdgeFactor(filledMask, gridW, gridD, ix, iz);
                const x0 = ix * cellSize, z0 = iz * cellSize;
                const x1 = (ix + 1) * cellSize, z1 = (iz + 1) * cellSize;
                addTri(x0, z0, x0, z1, x1, z1);
                addEdgeTri(edge);
                addTri(x0, z0, x1, z1, x1, z0);
                addEdgeTri(edge);
            }
        }
        if (positions.length === 0) {
            this._waterMesh = null;
            this._waterGeo = null;
            return;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('waterEdge', new THREE.Float32BufferAttribute(edges, 1));
        geo.computeVertexNormals();
        this._waterGeo = geo;

        const col = _resolveTerrainColor(td.waterColorHex, this.palette, palIdx);
        const mat = _makeWaterMaterial(col, td.waterOpacity);
        this._waterMesh = new THREE.Mesh(geo, mat);
        this._waterMesh.receiveShadow = false;
        this._waterMesh.name = 'water_plane';
        this.scene.add(this._waterMesh);
    }

    _animateWater(gameTime) {
        const pos = this._waterGeo.attributes.position;
        const count = pos.count;
        const baseY = this._waterBaseY;

        for (let i = 0; i < count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            const y = baseY
                + Math.sin(x * 0.5 + gameTime * 1.2) * 0.06
                + Math.sin(z * 0.4 + gameTime * 0.9) * 0.04;
            pos.setY(i, y);
        }
        pos.needsUpdate = true;
        this._waterGeo.computeVertexNormals();
        if (this._waterMesh?.material?.uniforms?.uTime) {
            this._waterMesh.material.uniforms.uTime.value = Number(gameTime) || 0;
        }
    }

    _buildFoliage(foliageDefs) {
        // Group instances by render key so editor-authored kinds survive into runtime.
        const groups = {};
        for (const f of foliageDefs) {
            const key = _foliageRenderKey(f);
            if (!groups[key]) groups[key] = [];
            groups[key].push(f);
        }

        for (const [renderKey, instances] of Object.entries(groups)) {
            if (instances.length === 0) continue;
            const baseType = _foliageBaseType(renderKey);
            const geo = _foliageGeometry(renderKey);
            const hasVertexColors = !!geo.getAttribute('color');
            const palIdx = instances[0].paletteIndex ?? _foliageDefaultPalette(baseType);
            const col    = _resolveTerrainColor(instances[0].colorHex, this.palette, palIdx);
            const mat    = new THREE.MeshLambertMaterial({
                color: hasVertexColors ? 0xffffff : col,
                vertexColors: hasVertexColors,
                flatShading: true,
                side: THREE.DoubleSide,
                emissive: hasVertexColors ? 0x1f2a20 : col,
                emissiveIntensity: 0.16,
            });

            const count = Math.min(instances.length, 10000);
            const im    = new THREE.InstancedMesh(geo, mat, count);
            im.castShadow    = true;
            im.receiveShadow = false;
            im.name          = `foliage_${renderKey}`;

            for (let i = 0; i < count; i++) {
                const f = instances[i];
                const rawScale = Number(f.scale ?? 1);
                const baseScale = Number.isFinite(rawScale) ? Math.max(0.25, Math.min(rawScale, 1.35)) : 1;
                const s = baseScale * _foliageScaleMultiplier(renderKey);
                const rotY = Number(f.rotationY ?? 0) || 0;
                this._mtx.makeRotationY(rotY);
                this._scaleVec.set(s, s, s);
                this._mtx.scale(this._scaleVec);
                this._mtx.setPosition(f.x ?? 0, f.y ?? 0, f.z ?? 0);
                im.setMatrixAt(i, this._mtx);

                // Per-instance colour variation (±1 palette index)
                if (!hasVertexColors && (f.colorHex || f.paletteIndex != null)) {
                    const c = _resolveTerrainColor(f.colorHex, this.palette, f.paletteIndex ?? palIdx);
                    im.setColorAt(i, c);
                }
            }
            im.instanceMatrix.needsUpdate = true;
            if (im.instanceColor) im.instanceColor.needsUpdate = true;

            this.scene.add(im);
            this._foliageMeshes.set(renderKey, im);
        }
    }

    _lowpolySampleHeight(wx, wz) {
        if (!this._elevGrid) return 0;
        const W = this._gridW;
        const C = this._cellSize;

        const gx = wx / C;
        const gz = wz / C;
        const ix = Math.floor(gx);
        const iz = Math.floor(gz);

        if (ix < 0 || ix >= W - 1 || iz < 0 || iz >= this._gridD - 1) return 0;

        const fx = gx - ix;
        const fz = gz - iz;

        const h00 = this._elevGrid[iz * W + ix];
        const h10 = this._elevGrid[iz * W + (ix + 1)];
        const h01 = this._elevGrid[(iz + 1) * W + ix];
        const h11 = this._elevGrid[(iz + 1) * W + (ix + 1)];

        // Bilinear interpolation
        return h00 * (1 - fx) * (1 - fz)
             + h10 * fx       * (1 - fz)
             + h01 * (1 - fx) * fz
             + h11 * fx       * fz;
    }

    _trimeshSampleHeight(wx, wz) {
        if (!this._terrainMesh) return 0;
        // Add a tiny, non-zero offset to avoid shooting directly down the shared edges/vertices of the triangles
        const rx = wx + 0.007;
        const rz = wz + 0.007;
        this._ray.set(new THREE.Vector3(rx, 4096, rz), new THREE.Vector3(0, -1, 0));
        const hits = this._ray.intersectObject(this._terrainMesh, false);
        return hits[0]?.point?.y ?? 0;
    }

    _rebuildTerrainCollider(mesh) {
        if (!this.physics?.createBody || !this.physics?.world || !mesh?.geometry) {
            console.warn('[TerrainSystem3D] _rebuildTerrainCollider skipped — physics:', !!this.physics, 'createBody:', !!this.physics?.createBody, 'world:', !!this.physics?.world, 'geometry:', !!mesh?.geometry);
            return;
        }

        if (this._terrainBody && this.physics?.world && this.physics?.removeBody) {
            this.physics.removeBody(this._terrainBody);
            this._terrainBody = null;
        }

        mesh.updateMatrixWorld(true);
        const worldGeo = mesh.geometry.clone();
        worldGeo.applyMatrix4(mesh.matrixWorld);
        this._terrainBody = this.physics.createBody({
            type: BodyType.STATIC,
            shape: ShapeType.TRIMESH,
            geometry: worldGeo,
            friction: 0.9,
            restitution: 0.0,
        });
        worldGeo.dispose();
        // Collision filter group: terrain = 4.  Player sphere excludes
        // this group from its mask to prevent Sphere-vs-Trimesh edge-seam
        // jitter (character hopping on terrain every frame).
        if (this._terrainBody?.body) {
            this._terrainBody.body.collisionFilterGroup = 4;
        }
        console.log('[TerrainSystem3D] _rebuildTerrainCollider — body created:', !!this._terrainBody);
    }

    // ── Default flat world ────────────────────────────────────────────────────

    _buildDefaultFlat() {
        // Single grass chunk at origin
        this._mode = 'voxel';
        this._generateDefaultVoxelChunk(0, 0, 0);
        this._rebuildVoxelCollider();
    }

    // ── Coordinate helpers ────────────────────────────────────────────────────

    _worldToChunk(wx, wy, wz) {
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cy = Math.floor(wy / CHUNK_SIZE);
        const cz = Math.floor(wz / CHUNK_SIZE);
        const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const ly = ((wy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        return { cx, cy, cz, key: _chunkKey(cx, cy, cz), lx, ly, lz };
    }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

function _chunkKey(cx, cy, cz) { return `${cx},${cy},${cz}`; }

function _chunkIdx(lx, ly, lz) {
    return lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE2;
}

/** Compute flat normal for a triangle (a, b, c each [x,y,z]) */
function _triNormal(a, b, c) {
    const ax = b[0]-a[0], ay = b[1]-a[1], az = b[2]-a[2];
    const bx = c[0]-a[0], by = c[1]-a[1], bz = c[2]-a[2];
    const nx = ay*bz - az*by;
    const ny = az*bx - ax*bz;
    const nz = ax*by - ay*bx;
    const len = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1;
    return [nx/len, ny/len, nz/len];
}

/**
 * Map an elevation value to a THREE.Color via a biome palette (threshold + hex array).
 * @param {number} elev     elevation value (world unit)
 * @param {number} maxElev  pre-computed max elevation for normalisation
 * @param {THREE.Color} out reusable color target
 * @param {Array<{threshold:number,color:string}>} palette  biome palette bands
 * @returns {THREE.Color}
 */
function _elevationToBiomeColor(elev, maxElev, out, palette) {
    const norm = maxElev > 0 ? elev / maxElev : 0;
    let hex = '#888888';
    for (const band of palette) {
        if (norm <= band.threshold) { hex = band.color; break; }
    }
    return out.set(hex);
}

function _resolveTerrainColor(colorHex, palette, paletteIndex) {
    if (typeof colorHex === 'string' && colorHex.trim()) {
        return new THREE.Color(colorHex);
    }
    return palette.getColor(paletteIndex);
}

function _makeWaterMaterial(color, opacity) {
    const base = color instanceof THREE.Color ? color : new THREE.Color(color || 0x3f8fa8);
    const deep = base.clone().multiplyScalar(0.48);
    deep.b += 0.08;
    const shallow = base.clone().lerp(new THREE.Color(0x8ed0c8), 0.34);

    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uWaterColor: { value: shallow },
            uDeepColor: { value: deep },
            uFoamColor: { value: new THREE.Color(0xd7f3ea) },
            uOpacity: { value: _clampWaterOpacity(opacity) },
        },
        vertexShader: `
            attribute float waterEdge;
            varying vec3 vWorldPos;
            varying vec3 vNormalView;
            varying vec3 vViewDir;
            varying float vWaterEdge;

            void main() {
                vec4 world = modelMatrix * vec4(position, 1.0);
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vWorldPos = world.xyz;
                vNormalView = normalize(normalMatrix * normal);
                vViewDir = normalize(-mvPosition.xyz);
                vWaterEdge = waterEdge;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uWaterColor;
            uniform vec3 uDeepColor;
            uniform vec3 uFoamColor;
            uniform float uOpacity;
            varying vec3 vWorldPos;
            varying vec3 vNormalView;
            varying vec3 vViewDir;
            varying float vWaterEdge;

            float waveLine(vec2 p, float speed, float scale) {
                float a = sin((p.x + p.y * 0.42) * scale + uTime * speed);
                float b = sin((p.y - p.x * 0.28) * (scale * 0.73) - uTime * (speed * 0.82));
                return smoothstep(0.72, 1.0, a * 0.55 + b * 0.45);
            }

            void main() {
                vec2 p = vWorldPos.xz;
                float broad = waveLine(p, 0.92, 0.105);
                float fine = waveLine(p + vec2(7.0, -3.0), 1.75, 0.42);
                float ripple = broad * 0.18 + fine * 0.12;
                float fresnel = pow(1.0 - clamp(abs(dot(normalize(vNormalView), normalize(vViewDir))), 0.0, 1.0), 2.2);
                float edgeFoam = vWaterEdge * (0.45 + fine * 0.55);
                vec3 color = mix(uDeepColor, uWaterColor, 0.58 + ripple);
                color += vec3(0.10, 0.17, 0.18) * fresnel;
                color = mix(color, uFoamColor, clamp(edgeFoam * 0.48, 0.0, 0.65));
                float alpha = clamp(uOpacity + fresnel * 0.18 + edgeFoam * 0.22, 0.22, 0.78);
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
}

function _clampWaterOpacity(value) {
    const opacity = Number.isFinite(value) ? value : 0.62;
    return Math.max(0.12, Math.min(0.82, opacity));
}

function _waterCellEdgeFactor(mask, gridW, gridD, ix, iz) {
    let dry = 0;
    let wet = 0;
    for (let dz = -1; dz <= 2; dz++) {
        for (let dx = -1; dx <= 2; dx++) {
            const x = ix + dx;
            const z = iz + dz;
            if (x < 0 || z < 0 || x >= gridW || z >= gridD) continue;
            if ((mask[z * gridW + x] || 0) > 0.02) wet++;
            else dry++;
        }
    }
    if (wet === 0 || dry === 0) return 0;
    return Math.min(1, dry / 8);
}

function _fillWaterMask(mask, elevation, gridW, gridD, waterLevel) {
    const total = gridW * gridD;
    const filled = new Float32Array(total);
    for (let i = 0; i < total; i++) {
        filled[i] = Number(mask?.[i] ?? 0) || 0;
        if (Array.isArray(elevation) || ArrayBuffer.isView(elevation)) {
            const y = Number(elevation[i]);
            if (Number.isFinite(y) && y <= waterLevel + 0.08) {
                filled[i] = Math.max(filled[i], 0.55);
            }
        }
    }

    for (let pass = 0; pass < 2; pass++) {
        const next = new Float32Array(filled);
        for (let z = 1; z < gridD - 1; z++) {
            for (let x = 1; x < gridW - 1; x++) {
                const idx = z * gridW + x;
                if (filled[idx] > 0.02) continue;
                let wet = 0;
                for (let dz = -1; dz <= 1; dz++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dz === 0) continue;
                        if (filled[(z + dz) * gridW + (x + dx)] > 0.02) wet++;
                    }
                }
                if (wet >= 5) next[idx] = 0.45;
            }
        }
        filled.set(next);
    }

    return filled;
}

function _foliageRenderKey(f) {
    const kind = String(f?.kind || f?.type || 'tree').toLowerCase();
    if (kind === 'pine' || kind === 'oak' || kind === 'palm') return kind;
    if (kind === 'grass') return 'grass';
    if (kind === 'bush') return 'bush';
    if (kind === 'reed') return 'reed';
    if (kind === 'lily') return 'lily';
    return kind;
}

function _foliageBaseType(renderKey) {
    if (renderKey === 'pine' || renderKey === 'oak' || renderKey === 'palm') return 'tree';
    if (renderKey === 'grass') return 'grass';
    if (renderKey === 'reed') return 'reed';
    if (renderKey === 'lily') return 'lily';
    return renderKey;
}

function _foliageScaleMultiplier(renderKey) {
    if (renderKey === 'pine' || renderKey === 'oak') return 1.65;
    if (renderKey === 'palm') return 1.85;
    if (renderKey === 'grass') return 1.15;
    if (renderKey === 'reed') return 1.2;
    if (renderKey === 'lily') return 1;
    if (renderKey === 'bush') return 1.25;
    return 1;
}

/** Low-poly foliage geometry (≤50 triangles each) */
function _foliageGeometry(renderKey) {
    switch (renderKey) {
        case 'pine': {
            const trunk = new THREE.CylinderGeometry(0.1, 0.14, 1.55, 5);
            trunk.translate(0, 0.775, 0);

            const crown = new THREE.SphereGeometry(0.78, 7, 5);
            crown.scale(0.92, 1.75, 0.92);
            crown.translate(0, 1.95, 0);

            return _mergeColoredGeos([
                { geo: trunk, color: '#6B4226' },
                { geo: crown, color: '#1a5a2f' },
            ]);
        }
        case 'oak': {
            const trunk = new THREE.CylinderGeometry(0.13, 0.18, 1.45, 6);
            trunk.translate(0, 0.725, 0);

            const crownA = new THREE.SphereGeometry(0.78, 7, 5);
            crownA.scale(1.08, 0.78, 1);
            crownA.translate(-0.1, 1.75, 0);
            const crownB = new THREE.SphereGeometry(0.58, 6, 4);
            crownB.scale(1, 0.8, 1);
            crownB.translate(0.55, 1.82, 0.18);

            return _mergeColoredGeos([
                { geo: trunk, color: '#6B4226' },
                { geo: crownA, color: '#3a8a3f' },
                { geo: crownB, color: '#347d39' },
            ]);
        }
        case 'palm': {
            const trunk = new THREE.CylinderGeometry(0.08, 0.17, 2.25, 6);
            trunk.translate(0, 1.125, 0);
            const fronds = [];
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const frond = new THREE.PlaneGeometry(1.2, 0.34);
                frond.rotateX(Math.PI * 0.35);
                frond.rotateY(angle);
                frond.translate(Math.cos(angle) * 0.42, 2.15, Math.sin(angle) * 0.42);
                fronds.push({ geo: frond, color: '#2d8a3f' });
            }

            return _mergeColoredGeos([
                { geo: trunk, color: '#8B5A2B' },
                ...fronds,
            ]);
        }
        case 'tree': {
            const trunk   = new THREE.CylinderGeometry(0.1, 0.14, 1.4, 5);
            trunk.translate(0, 0.7, 0);
            const canopy  = new THREE.SphereGeometry(0.72, 6, 4);
            canopy.scale(1, 0.9, 1);
            canopy.translate(0, 1.75, 0);
            return _mergeColoredGeos([
                { geo: trunk, color: '#6B4226' },
                { geo: canopy, color: '#2f7d3c' },
            ]);
        }
        case 'rock': {
            // Dodecahedron for chunky rock look
            const geo = new THREE.DodecahedronGeometry(0.5, 0);
            geo.scale(1, 0.6, 1);
            return geo;
        }
        case 'grass': {
            const blades = [];
            for (let i = 0; i < 4; i++) {
                const blade = new THREE.PlaneGeometry(0.22, 0.78);
                const angle = (i / 4) * Math.PI;
                blade.rotateY(angle);
                blade.rotateX(0.18);
                blade.translate(0, 0.39, 0);
                blades.push({ geo: blade, color: i % 2 === 0 ? '#4f9a3a' : '#6fb34a' });
            }
            return _mergeColoredGeos(blades);
        }
        case 'reed': {
            const stems = [];
            for (let i = 0; i < 4; i++) {
                const angle = (i / 4) * Math.PI * 2;
                const stem = new THREE.CylinderGeometry(0.018, 0.024, 1.15 + (i % 2) * 0.25, 4);
                stem.translate(Math.cos(angle) * 0.09, 0.58, Math.sin(angle) * 0.09);
                const tip = new THREE.CylinderGeometry(0.035, 0.025, 0.22, 5);
                tip.translate(Math.cos(angle) * 0.09, 1.23 + (i % 2) * 0.25, Math.sin(angle) * 0.09);
                stems.push({ geo: stem, color: '#6f8f3a' }, { geo: tip, color: '#8a5d2c' });
            }
            return _mergeColoredGeos(stems);
        }
        case 'lily': {
            const pad = new THREE.CircleGeometry(0.42, 7, 0.18, Math.PI * 1.72);
            pad.rotateX(-Math.PI / 2);
            pad.translate(0, 0.035, 0);
            const flower = new THREE.ConeGeometry(0.07, 0.08, 5);
            flower.translate(0.08, 0.095, 0.02);
            return _mergeColoredGeos([
                { geo: pad, color: '#4f8f3a' },
                { geo: flower, color: '#d9b6d8' },
            ]);
        }
        case 'bush':
        default: {
            const core = new THREE.SphereGeometry(0.42, 6, 4);
            core.scale(1.25, 0.58, 1);
            core.translate(0, 0.32, 0);
            const side = new THREE.SphereGeometry(0.28, 5, 3);
            side.scale(1, 0.55, 1);
            side.translate(0.34, 0.28, 0.16);
            return _mergeColoredGeos([
                { geo: core, color: '#2d8a3f' },
                { geo: side, color: '#3f9950' },
            ]);
        }
    }
}

function _mergeColoredGeos(items) {
    const geos = [];
    for (const item of items) {
        const geo = item.geo.toNonIndexed ? item.geo.toNonIndexed() : item.geo;
        const pos = geo.attributes.position;
        const color = new THREE.Color(item.color || '#ffffff');
        const colors = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geos.push(geo);
    }
    return _mergeGeos(geos);
}

function _foliageDefaultPalette(type) {
    return { tree: 2, rock: 5, bush: 2, grass: 2, reed: 2, lily: 2 }[type] ?? 2;
}

/** Merge multiple BufferGeometries into one (position + normal only) */
function _mergeGeos(geos) {
    const posArr = [], nrmArr = [], colArr = [], idxArr = [];
    let hasColors = false;
    let base = 0;
    for (const g of geos) {
        const pos = g.attributes.position;
        const nrm = g.attributes.normal;
        const col = g.attributes.color;
        const idx = g.index;
        if (col) hasColors = true;
        for (let i = 0; i < pos.count; i++) {
            posArr.push(pos.getX(i), pos.getY(i), pos.getZ(i));
            if (nrm) nrmArr.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
            else nrmArr.push(0, 1, 0);
            if (col) colArr.push(col.getX(i), col.getY(i), col.getZ(i));
            else colArr.push(1, 1, 1);
        }
        if (idx) {
            for (let i = 0; i < idx.count; i++) idxArr.push(idx.getX(i) + base);
        } else {
            for (let i = 0; i < pos.count; i++) idxArr.push(i + base);
        }
        base += pos.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    out.setAttribute('normal',   new THREE.Float32BufferAttribute(nrmArr, 3));
    if (hasColors) out.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    out.setIndex(idxArr);
    return out;
}
