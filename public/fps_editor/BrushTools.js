/**
 * BrushTools.js — Phase 37 (Extended Phase 63)
 * Voxel grid brush operations + greedy meshing for the FPS Map Editor.
 */

/* global window */
const BrushTools = (() => {
    'use strict';

    const MAX_FILL = 10_000;

    // ── key helpers ──────────────────────────────────────────────────────────
    const _k   = (x, y, z) => `${x},${y},${z}`;
    const _has  = (grid, x, y, z) => !!grid[_k(x, y, z)];
    const _cell = (grid, x, y, z) => grid[_k(x, y, z)];

    function _bounds(grid) {
        let x0 = Infinity, x1 = -Infinity;
        let y0 = Infinity, y1 = -Infinity;
        let z0 = Infinity, z1 = -Infinity;
        for (const key in grid) {
            const [x, y, z] = key.split(',').map(Number);
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
            if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
        return { x0, x1, y0, y1, z0, z1 };
    }

    // ── brush operations ─────────────────────────────────────────────────────

    /** Place a single block. Returns change record for undo. */
    function pencil(grid, gx, gy, gz, type, color, textureId = null) {
        const key = _k(gx, gy, gz);
        const old = grid[key] ? { ...grid[key] } : null;
        const next = { type, color, textureId };
        grid[key] = next;
        return [{ key, old, next }];
    }

    /** Erase a single block. */
    function erase(grid, gx, gy, gz) {
        const key = _k(gx, gy, gz);
        if (!grid[key]) return [];
        const old = { ...grid[key] };
        delete grid[key];
        return [{ key, old, next: null }];
    }

    /** Stamp all cells in an axis-aligned XZ rectangle on the given Y level. */
    function rectStamp(grid, gx0, gz0, gx1, gz1, gy, type, color, textureId = null) {
        const changes = [];
        const x0 = Math.min(gx0, gx1), x1 = Math.max(gx0, gx1);
        const z0 = Math.min(gz0, gz1), z1 = Math.max(gz0, gz1);
        for (let x = x0; x <= x1; x++) {
            for (let z = z0; z <= z1; z++) {
                const key = _k(x, gy, z);
                const old = grid[key] ? { ...grid[key] } : null;
                const next = { type, color, textureId };
                grid[key] = next;
                changes.push({ key, old, next });
            }
        }
        return changes;
    }

    /** Erase all cells in an axis-aligned XZ rectangle. */
    function rectErase(grid, gx0, gz0, gx1, gz1, gy) {
        const changes = [];
        const x0 = Math.min(gx0, gx1), x1 = Math.max(gx0, gx1);
        const z0 = Math.min(gz0, gz1), z1 = Math.max(gz0, gz1);
        for (let x = x0; x <= x1; x++) {
            for (let z = z0; z <= z1; z++) {
                const key = _k(x, gy, z);
                if (grid[key]) {
                    changes.push({ key, old: { ...grid[key] }, next: null });
                    delete grid[key];
                }
            }
        }
        return changes;
    }

    function floodFill(grid, gx, gy, gz, type, color, textureId = null) {
        const startKey = _k(gx, gy, gz);
        const target   = grid[startKey] || null;
        const tType    = target ? target.type  : null;
        const tColor   = target ? target.color : null;
        const tTex     = target ? target.textureId : null;

        if (tType === type && tColor === color && tTex === textureId) return [];

        const changes = [];
        const visited = new Set();
        const queue   = [[gx, gz]];
        visited.add(`${gx},${gz}`);
        const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

        while (queue.length && changes.length < MAX_FILL) {
            const [cx, cz] = queue.shift();
            const key  = _k(cx, gy, cz);
            const c    = grid[key] || null;
            if (!c && type === null) continue;
            if (c && (c.type !== tType || c.color !== tColor || c.textureId !== tTex)) continue;

            const old = c ? { ...c } : null;
            const next = type === null ? null : { type, color, textureId };
            if (next === null) delete grid[key]; else grid[key] = next;
            changes.push({ key, old, next });

            for (const [dx, dz] of DIRS) {
                const nk = `${cx + dx},${cz + dz}`;
                if (!visited.has(nk)) { visited.add(nk); queue.push([cx + dx, cz + dz]); }
            }
        }
        return changes;
    }

    function paintBlock(grid, gx, gy, gz, color, textureId = undefined) {
        const key = _k(gx, gy, gz);
        if (!grid[key]) return [];
        const old = { ...grid[key] };
        if (color !== undefined) grid[key].color = color;
        if (textureId !== undefined) grid[key].textureId = textureId;
        return [{ key, old, next: { ...grid[key] } }];
    }

    function applyChanges(grid, changes) {
        for (const c of changes) {
            if (c.next === null) delete grid[c.key];
            else grid[c.key] = { ...c.next };
        }
    }

    function revertChanges(grid, changes) {
        for (const c of changes) {
            if (c.old === null) delete grid[c.key];
            else grid[c.key] = { ...c.old };
        }
    }

    // ── greedy meshing (standardhidden-face removal) ─────────────────────────
    
    function buildGreedyMesh(grid, cellSize) {
        if (!grid || Object.keys(grid).length === 0) return {};
        const b = _bounds(grid);
        if (!isFinite(b.x0)) return {};

        const cs = cellSize || 1;
        const groups = {}; // Keyed by "color|texture"

        function grp(color, textureId) {
            const gkey = `${color}|${textureId || ''}`;
            if (!groups[gkey]) groups[gkey] = { color, textureId, positions: [], normals: [], indices: [], uvs: [] };
            return groups[gkey];
        }

        function emitQuad(cell, nx, ny, nz, v0, v1, v2, v3) {
            const g  = grp(cell.color || '#888888', cell.textureId);
            const bi = g.positions.length / 3;
            for (const v of [v0, v1, v2, v3]) {
                g.positions.push(v[0] * cs, v[1] * cs, v[2] * cs);
                g.normals.push(nx, ny, nz);
            }
            // Basic face UVs (0..1) for atlas remapping later
            g.uvs.push(0,1, 1,1, 1,0, 0,0);
            g.indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
        }

        function greedySlice(mask, bSz, cSz) {
            const merged = new Uint8Array(bSz * cSz);
            const rects  = [];
            for (let bi = 0; bi < bSz; bi++) {
                for (let ci = 0; ci < cSz; ci++) {
                    const mi = bi * cSz + ci;
                    if (!mask[mi] || merged[mi]) continue;
                    const cell = mask[mi];

                    let cw = 1;
                    while (ci + cw < cSz) {
                        const next = mask[bi * cSz + (ci + cw)];
                        if (!next || merged[bi * cSz + (ci + cw)] || 
                            next.color !== cell.color || next.textureId !== cell.textureId) break;
                        cw++;
                    }
                    let bh = 1;
                    outer: while (bi + bh < bSz) {
                        for (let dc = 0; dc < cw; dc++) {
                            const next = mask[(bi + bh) * cSz + (ci + dc)];
                            if (!next || merged[(bi + bh) * cSz + (ci + dc)] || 
                                next.color !== cell.color || next.textureId !== cell.textureId) break outer;
                        }
                        bh++;
                    }
                    for (let db = 0; db < bh; db++)
                        for (let dc = 0; dc < cw; dc++)
                            merged[(bi + db) * cSz + (ci + dc)] = 1;

                    rects.push({ bi, ci, bh, cw, cell });
                }
            }
            return rects;
        }

        // SWEEP AXES (simplified for brevity, identical logic to original but using cell comparison)
        const AXES = [
            { d:0, b:1, c:2, n:[1,0,0],  inv:false }, // +X
            { d:0, b:1, c:2, n:[-1,0,0], inv:true  }, // -X
            { d:1, b:0, c:2, n:[0,1,0],  inv:false }, // +Y
            { d:1, b:0, c:2, n:[0,-1,0], inv:true  }, // -Y
            { d:2, b:0, c:1, n:[0,0,1],  inv:false }, // +Z
            { d:2, b:0, c:1, n:[0,0,-1], inv:true  }  // -Z
        ];

        for (const axis of AXES) {
            const { d, b, c, n, inv } = axis;
            const dimD = [b.x0, b.x1, b.y0, b.y1, b.z0, b.z1];
            const startD = dimD[d*2], endD = dimD[d*2+1];
            const startB = dimD[b*2], endB = dimD[b*2+1];
            const startC = dimD[c*2], endC = dimD[c*2+1];

            for (let i = startD; i <= endD; i++) {
                const bSz = endB - startB + 1, cSz = endC - startC + 1;
                const mask = new Array(bSz * cSz).fill(null);
                for (let j = startB; j <= endB; j++) {
                    for (let k = startC; k <= endC; k++) {
                        const coords = [0,0,0]; coords[d]=i; coords[b]=j; coords[c]=k;
                        const nextC  = [...coords]; nextC[d] += (inv ? -1 : 1);
                        if (_has(grid, ...coords) && !_has(grid, ...nextC)) {
                            mask[(j-startB)*cSz + (k-startC)] = _cell(grid, ...coords);
                        }
                    }
                }
                for (const rect of greedySlice(mask, bSz, cSz)) {
                    const { bi, ci, bh, cw, cell } = rect;
                    const wb = startB + bi, wc = startC + ci;
                    // Generic quad emitter logic based on axis
                    const v0=[0,0,0], v1=[0,0,0], v2=[0,0,0], v3=[0,0,0];
                    v0[d]=i+(inv?0:1); v0[b]=wb;    v0[c]=wc;
                    v1[d]=i+(inv?0:1); v1[b]=wb+bh; v1[c]=wc;
                    v2[d]=i+(inv?0:1); v2[b]=wb+bh; v2[c]=wc+cw;
                    v3[d]=i+(inv?0:1); v3[b]=wb;    v3[c]=wc+cw;
                    if (inv) emitQuad(cell, n[0], n[1], n[2], v3, v2, v1, v0);
                    else     emitQuad(cell, n[0], n[1], n[2], v0, v1, v2, v3);
                }
            }
        }
        return groups;
    }

    function exportGreedyMesh(grid, cellSize) {
        const groups = buildGreedyMesh(grid, cellSize);
        return Object.values(groups);
    }

    async function buildThreeGeometries(groups, THREEref, atlas = null) {
        const meshes = [];
        const { hexMaterial } = await import('/engines/shared/Renderer3D.js');

        for (const [gkey, data] of Object.entries(groups)) {
            if (!data.positions.length) continue;
            const geo = new THREEref.BufferGeometry();
            geo.setAttribute('position', new THREEref.BufferAttribute(new Float32Array(data.positions), 3));
            geo.setAttribute('normal',   new THREEref.BufferAttribute(new Float32Array(data.normals),   3));
            geo.setAttribute('uv',       new THREEref.BufferAttribute(new Float32Array(data.uvs),       2));
            geo.setIndex(data.indices);

            let mat;
            if (data.textureId && atlas) {
                atlas.applyBlockUVs(geo, data.textureId);
                mat = atlas.getMaterial(THREEref);
            } else {
                mat = hexMaterial(data.color);
            }

            const mesh = new THREEref.Mesh(geo, mat);
            mesh.castShadow    = true;
            mesh.receiveShadow = true;
            meshes.push(mesh);
        }
        return meshes;
    }

    return {
        pencil, erase, rectStamp, rectErase, floodFill, paintBlock,
        applyChanges, revertChanges,
        buildGreedyMesh, buildThreeGeometries
    };
})();

if (typeof window !== 'undefined') window.BrushTools = BrushTools;
