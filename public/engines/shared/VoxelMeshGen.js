/**
 * VoxelMeshGen.js — Shared greedy meshing utility for voxel-based 3D engines.
 * 
 * Optimized to convert a voxel grid { "x,y,z": { type, color, textureId } | number }
 * into an efficient set of BufferGeometries with minimal face count.
 */

import * as THREE from '/lib/three/three.module.js';

export default class VoxelMeshGen {
    /**
     * @param {object} voxelGrid  { "gx,gy,gz": { type, color, textureId } | number }
     * @param {number} cellSize   World size per voxel unit
     * @param {string[]} [palette] Optional hex color array for numeric voxels
     */
    constructor(voxelGrid, cellSize = 1.0, palette = []) {
        this.grid    = voxelGrid || {};
        this.cs      = cellSize;
        this.palette = palette || [];
    }

    /**
     * buildGroups() — standard greedy meshing sweep.
     * Returns meshes grouped by "color|textureId" for draw-call batching.
     */
    buildGroups(atlas = null) {
        if (!this.grid || Object.keys(this.grid).length === 0) return {};
        
        const b = this._getBounds();
        if (!isFinite(b.x0)) return {};

        const groups = {}; // Keyed by "color|texture"

        const getGroup = (color, textureId) => {
            const key = `${color}|${textureId || ''}`;
            if (!groups[key]) {
                groups[key] = {
                    color,
                    textureId,
                    positions: [],
                    normals: [],
                    indices: [],
                    uvs: []
                };
            }
            return groups[key];
        };

        const emitQuad = (rect, nx, ny, nz, v0, v1, v2, v3) => {
            const { cell, bh, cw } = rect;
            let color = '#888888';
            let textureId = null;

            if (typeof cell === 'number') {
                color = this.palette[cell] || color;
            } else if (cell && typeof cell === 'object') {
                color = cell.color || color;
                textureId = cell.textureId || null;
            }

            const g  = getGroup(color, textureId);
            const bi = g.positions.length / 3;
            
            for (const v of [v0, v1, v2, v3]) {
                g.positions.push(v[0] * this.cs, v[1] * this.cs, v[2] * this.cs);
                g.normals.push(nx, ny, nz);
            }
            
            // Add UVs - support tiling for greedy rects
            if (textureId && atlas && atlas._config) {
                // Determine face type for UV lookup
                let faceType = 'side';
                if (ny > 0.5) faceType = 'top';
                else if (ny < -0.5) faceType = 'bottom';
                
                const blockCfg = atlas._config.blocks[textureId];
                const tileName = blockCfg ? blockCfg[faceType] : textureId;
                const rect = atlas._getUVRect(tileName);
                
                // For greedy quads, we tile the UVs by multiplying by width/height
                const u0 = rect.u0, v0 = rect.v0, u1 = rect.u1, v1 = rect.v1;
                const uw = (u1 - u0) * cw;
                const vh = (v1 - v0) * bh;
                
                g.uvs.push(u0, v0 + vh, u0 + uw, v0 + vh, u0 + uw, v0, u0, v0);
            } else {
                g.uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
            }

            g.indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
        };

        // Greedy sweep across 6 axes - normalized to cyclic order (X->Y, Y->Z, Z->X)
        // to ensure consistent face winding.
        const AXES = [
            { d:0, b:1, c:2, n:[1,0,0],  inv:false }, // +X
            { d:0, b:1, c:2, n:[-1,0,0], inv:true  }, // -X
            { d:1, b:2, c:0, n:[0,1,0],  inv:false }, // +Y
            { d:1, b:2, c:0, n:[0,-1,0], inv:true  }, // -Y
            { d:2, b:0, c:1, n:[0,0,1],  inv:false }, // +Z
            { d:2, b:0, c:1, n:[0,0,-1], inv:true  }  // -Z
        ];

        for (const axis of AXES) {
            const { d, b: bIdx, c: cIdx, n, inv } = axis;
            const startD = b[`${['x','y','z'][d]}0`], endD = b[`${['x','y','z'][d]}1`];
            const startB = b[`${['x','y','z'][bIdx]}0`], endB = b[`${['x','y','z'][bIdx]}1`];
            const startC = b[`${['x','y','z'][cIdx]}0`], endC = b[`${['x','y','z'][cIdx]}1`];

            for (let i = startD; i <= endD; i++) {
                const bSz = endB - startB + 1, cSz = endC - startC + 1;
                const mask = new Array(bSz * cSz).fill(null);
                
                for (let j = startB; j <= endB; j++) {
                    for (let k = startC; k <= endC; k++) {
                        const coords = [0,0,0]; coords[d]=i; coords[bIdx]=j; coords[cIdx]=k;
                        const nextC  = [...coords]; nextC[d] += (inv ? -1 : 1);
                        
                        if (this._hasVoxel(...coords) && !this._hasVoxel(...nextC)) {
                            mask[(j-startB)*cSz + (k-startC)] = this._getVoxel(...coords);
                        }
                    }
                }
                
                this._greedySlice(mask, bSz, cSz, (rect) => {
                    const { bi, ci, bh, cw, cell } = rect;
                    const wb = startB + bi, wc = startC + ci;
                    const v0=[0,0,0], v1=[0,0,0], v2=[0,0,0], v3=[0,0,0];
                    
                    v0[d]=i+(inv?0:1); v0[bIdx]=wb;    v0[cIdx]=wc;
                    v1[d]=i+(inv?0:1); v1[bIdx]=wb+bh; v1[cIdx]=wc;
                    v2[d]=i+(inv?0:1); v2[bIdx]=wb+bh; v2[cIdx]=wc+cw;
                    v3[d]=i+(inv?0:1); v3[bIdx]=wb;    v3[cIdx]=wc+cw;
                    
                    // Outward winding:
                    // inv=false (+axis): v0,v1,v2,v3 is CCW
                    // inv=true  (-axis): v3,v2,v1,v0 is CCW
                    if (inv) emitQuad(rect, n[0], n[1], n[2], v3, v2, v1, v0);
                    else     emitQuad(rect, n[0], n[1], n[2], v0, v1, v2, v3);
                });
            }
        }
        return groups;
    }

    /** Helper: convert groups to THREE.Mesh array */
    async buildMeshes(atlas = null) {
        const groups = this.buildGroups(atlas);
        const meshes = [];
        const matCache = {};

        for (const [key, data] of Object.entries(groups)) {
            if (!data.positions.length) continue;
            
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.positions), 3));
            geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(data.normals),   3));
            geo.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(data.uvs),       2));
            
            // Phase 18: Use appropriate typed array for indices based on vertex count
            const vertexCount = data.positions.length / 3;
            const IndexArray = vertexCount > 65535 ? Uint32Array : Uint16Array;
            geo.setIndex(new THREE.BufferAttribute(new IndexArray(data.indices), 1));
            
            geo.computeBoundingSphere();

            let mat;
            if (data.textureId && atlas) {
                mat = atlas.getMaterial(THREE);
            } else {
                const cacheKey = data.color || '#888888';
                if (!matCache[cacheKey]) {
                    matCache[cacheKey] = new THREE.MeshLambertMaterial({ 
                        color: new THREE.Color(cacheKey),
                        flatShading: true,
                        emissive: new THREE.Color(cacheKey),
                        emissiveIntensity: 0.05
                    });
                }
                mat = matCache[cacheKey];
            }

            const mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow    = true;
            mesh.receiveShadow = true;
            meshes.push(mesh);
        }
        return meshes;
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    _getVoxel(x, y, z) { return this.grid[`${x},${y},${z}`]; }
    _hasVoxel(x, y, z) { return this.grid[`${x},${y},${z}`] !== undefined; }

    _getBounds() {
        let x0 = Infinity, x1 = -Infinity;
        let y0 = Infinity, y1 = -Infinity;
        let z0 = Infinity, z1 = -Infinity;
        for (const key in this.grid) {
            const [x, y, z] = key.split(',').map(Number);
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
            if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
        return { x0, x1, y0, y1, z0, z1 };
    }

    _greedySlice(mask, bSz, cSz, onRect) {
        const merged = new Uint8Array(bSz * cSz);
        for (let bi = 0; bi < bSz; bi++) {
            for (let ci = 0; ci < cSz; ci++) {
                const mi = bi * cSz + ci;
                if (mask[mi] === null || merged[mi]) continue;
                const cell = mask[mi];

                let cw = 1;
                while (ci + cw < cSz) {
                    const next = mask[bi * cSz + (ci + cw)];
                    if (next === null || merged[bi * cSz + (ci + cw)] || 
                        !this._cellsMatch(next, cell)) break;
                    cw++;
                }
                let bh = 1;
                outer: while (bi + bh < bSz) {
                    for (let dc = 0; dc < cw; dc++) {
                        const next = mask[(bi + bh) * cSz + (ci + dc)];
                        if (next === null || merged[(bi + bh) * cSz + (ci + dc)] || 
                            !this._cellsMatch(next, cell)) break outer;
                    }
                    bh++;
                }
                for (let db = 0; db < bh; db++)
                    for (let dc = 0; dc < cw; dc++)
                        merged[(bi + db) * cSz + (ci + dc)] = 1;

                onRect({ bi, ci, bh, cw, cell });
            }
        }
    }

    _cellsMatch(a, b) {
        if (typeof a !== typeof b) return false;
        if (typeof a === 'object') {
            return a.color === b.color && a.textureId === b.textureId;
        }
        return a === b;
    }
}
