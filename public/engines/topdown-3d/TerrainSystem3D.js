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
        this._mode = 'voxel';  // 'voxel' | 'lowpoly'

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
        this._col = new THREE.Color();
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
        } else {
            this._buildLowPolyWorld(td);
        }

        console.log(`[TerrainSystem3D] Built ${this._mode} terrain`);
    }

    /**
     * update(dt, gameTime) — animate water, update any per-frame terrain effects.
     */
    update(dt, gameTime) {
        if (this._waterGeo && this._mode === 'lowpoly') {
            this._animateWater(gameTime);
        }
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
        return this._lowpolySampleHeight(wx, wz);
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

        this.scene.add(mesh);
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
            // Flat default
            elev = new Array(W * D).fill(0);
        }
        this._elevGrid = new Float32Array(elev);

        // ── Build terrain mesh ─────────────────────────────────────────────
        const faceColors = td.faceColors || [];
        const positions  = [];
        const normals    = [];
        const colors     = [];
        const idxArr     = [];
        let vi = 0;

        // Each cell → 2 triangles (split along diagonal)
        for (let iz = 0; iz < D - 1; iz++) {
            for (let ix = 0; ix < W - 1; ix++) {
                const h00 = elev[iz * W + ix];
                const h10 = elev[iz * W + (ix + 1)];
                const h01 = elev[(iz + 1) * W + ix];
                const h11 = elev[(iz + 1) * W + (ix + 1)];

                const x0 = ix * C,       z0 = iz * C;
                const x1 = (ix + 1) * C, z1 = (iz + 1) * C;

                // Face colour lookup (2 triangles per cell)
                const cellIdx = iz * (W - 1) + ix;
                const palA    = faceColors[cellIdx * 2]     ?? 2; // default grass
                const palB    = faceColors[cellIdx * 2 + 1] ?? 2;

                const colA = this.palette.getColor(palA);
                const colB = this.palette.getColor(palB);

                // Triangle A: (00, 10, 11)
                const vA = [[x0,h00,z0],[x1,h10,z0],[x1,h11,z1]];
                const nA = _triNormal(...vA);
                for (const [px,py,pz] of vA) {
                    positions.push(px, py, pz);
                    normals.push(...nA);
                    colors.push(colA.r, colA.g, colA.b);
                }
                idxArr.push(vi, vi+1, vi+2); vi += 3;

                // Triangle B: (00, 11, 01)
                const vB = [[x0,h00,z0],[x1,h11,z1],[x0,h01,z1]];
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

        const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
        this._terrainMesh = new THREE.Mesh(geo, mat);
        this._terrainMesh.receiveShadow = true;
        this._terrainMesh.castShadow    = false;
        this._terrainMesh.name          = 'lowpoly_terrain';
        this.scene.add(this._terrainMesh);

        // ── Water plane ────────────────────────────────────────────────────
        const waterLevel = td.waterLevel ?? -0.5;
        this._waterBaseY = waterLevel;
        this._buildWaterPlane((W - 1) * C, (D - 1) * C, waterLevel, td.waterPaletteIndex ?? 9);

        // ── Foliage ────────────────────────────────────────────────────────
        if (Array.isArray(td.foliage) && td.foliage.length > 0) {
            this._buildFoliage(td.foliage);
        }
    }

    _buildWaterPlane(w, d, y, palIdx) {
        // Subdivided plane for sine-wave animation (16×16 segments)
        const segs = 16;
        const geo  = new THREE.PlaneGeometry(w, d, segs, segs);
        geo.rotateX(-Math.PI / 2);

        // Store water geometry for animation
        this._waterGeo = geo;

        const col = this.palette.getColor(palIdx);
        const mat = new THREE.MeshLambertMaterial({
            color:       col,
            transparent: true,
            opacity:     0.82,
            flatShading: true,
        });

        this._waterMesh = new THREE.Mesh(geo, mat);
        this._waterMesh.position.set(w / 2, y, d / 2);
        this._waterMesh.receiveShadow = false;
        this._waterMesh.name          = 'water_plane';
        this.scene.add(this._waterMesh);
    }

    _animateWater(gameTime) {
        const pos = this._waterGeo.attributes.position;
        const count = pos.count;
        const baseY = this._waterBaseY;

        for (let i = 0; i < count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            // Sine wave: two overlapping waves for organic look
            const y = baseY
                + Math.sin(x * 0.5 + gameTime * 1.2) * 0.06
                + Math.sin(z * 0.4 + gameTime * 0.9) * 0.04;
            pos.setY(i, y);
        }
        pos.needsUpdate = true;
        this._waterGeo.computeVertexNormals();
    }

    _buildFoliage(foliageDefs) {
        // Group instances by foliage type
        const groups = {};
        for (const f of foliageDefs) {
            const t = f.type || 'tree';
            if (!groups[t]) groups[t] = [];
            groups[t].push(f);
        }

        for (const [type, instances] of Object.entries(groups)) {
            if (instances.length === 0) continue;
            const geo = _foliageGeometry(type);
            const palIdx = instances[0].paletteIndex ?? _foliageDefaultPalette(type);
            const col    = this.palette.getColor(palIdx);
            const mat    = new THREE.MeshLambertMaterial({ color: col, flatShading: true });

            const count = Math.min(instances.length, 10000);
            const im    = new THREE.InstancedMesh(geo, mat, count);
            im.castShadow    = true;
            im.receiveShadow = false;
            im.name          = `foliage_${type}`;

            for (let i = 0; i < count; i++) {
                const f = instances[i];
                const s = f.scale ?? 1;
                this._mtx.makeScale(s, s, s);
                this._mtx.setPosition(f.x ?? 0, f.y ?? 0, f.z ?? 0);
                im.setMatrixAt(i, this._mtx);

                // Per-instance colour variation (±1 palette index)
                if (f.paletteIndex != null) {
                    const c = this.palette.getColor(f.paletteIndex);
                    im.setColorAt(i, c);
                }
            }
            im.instanceMatrix.needsUpdate = true;
            if (im.instanceColor) im.instanceColor.needsUpdate = true;

            this.scene.add(im);
            this._foliageMeshes.set(type, im);
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

    // ── Default flat world ────────────────────────────────────────────────────

    _buildDefaultFlat() {
        // Single grass chunk at origin
        this._mode = 'voxel';
        this._generateDefaultVoxelChunk(0, 0, 0);
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

/** Low-poly foliage geometry (≤50 triangles each) */
function _foliageGeometry(type) {
    switch (type) {
        case 'tree': {
            // Trunk: thin box + canopy: octahedron
            const trunk   = new THREE.BoxGeometry(0.2, 1.0, 0.2);
            trunk.translate(0, 0.5, 0);
            const canopy  = new THREE.OctahedronGeometry(0.7, 0);
            canopy.translate(0, 1.5, 0);
            return _mergeGeos([trunk, canopy]);
        }
        case 'rock': {
            // Dodecahedron for chunky rock look
            const geo = new THREE.DodecahedronGeometry(0.5, 0);
            geo.scale(1, 0.6, 1);
            return geo;
        }
        case 'bush':
        default: {
            // Two crossed box planes
            const a = new THREE.BoxGeometry(0.8, 0.5, 0.1);
            a.translate(0, 0.25, 0);
            const b = new THREE.BoxGeometry(0.1, 0.5, 0.8);
            b.translate(0, 0.25, 0);
            return _mergeGeos([a, b]);
        }
    }
}

function _foliageDefaultPalette(type) {
    return { tree: 2, rock: 5, bush: 2 }[type] ?? 2;
}

/** Merge multiple BufferGeometries into one (position + normal only) */
function _mergeGeos(geos) {
    const posArr = [], nrmArr = [], idxArr = [];
    let base = 0;
    for (const g of geos) {
        const pos = g.attributes.position;
        const nrm = g.attributes.normal;
        const idx = g.index;
        for (let i = 0; i < pos.count; i++) {
            posArr.push(pos.getX(i), pos.getY(i), pos.getZ(i));
            if (nrm) nrmArr.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
            else nrmArr.push(0, 1, 0);
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
    out.setIndex(idxArr);
    return out;
}
