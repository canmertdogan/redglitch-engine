/**
 * BrushTools.js — Phase 37
 * Voxel grid brush operations + greedy meshing for the FPS Map Editor.
 *
 * Exposed as a plain IIFE global (window.BrushTools) so fps_editor.js
 * can call it without ES-module imports.
 *
 * Public API:
 *   Brush ops (all return a change-set array for undo/redo):
 *     pencil(grid, gx,gy,gz, type, color)
 *     erase(grid, gx,gy,gz)
 *     rectStamp(grid, gx0,gz0, gx1,gz1, gy, type, color)
 *     rectErase(grid, gx0,gz0, gx1,gz1, gy)
 *     floodFill(grid, gx,gy,gz, type, color)   — BFS, same Y layer
 *     paintBlock(grid, gx,gy,gz, color)
 *
 *   Undo helpers:
 *     applyChanges(grid, changes)     — replay (redo)
 *     revertChanges(grid, changes)    — undo
 *
 *   Mesh builders:
 *     buildGreedyMesh(grid, cellSize) → groups { [colorHex]: {positions,normals,indices} }
 *     buildThreeGeometries(groups, THREE) → THREE.Mesh[]
 *     exportGreedyMesh(grid, cellSize) → plain-JS array (for Phase 41 GLTF export)
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
    function pencil(grid, gx, gy, gz, type, color) {
        const key = _k(gx, gy, gz);
        const old = grid[key] ? { ...grid[key] } : null;
        grid[key] = { type, color };
        return [{ key, old, next: { type, color } }];
    }

    /** Erase a single block. Returns change record (empty if cell was already empty). */
    function erase(grid, gx, gy, gz) {
        const key = _k(gx, gy, gz);
        if (!grid[key]) return [];
        const old = { ...grid[key] };
        delete grid[key];
        return [{ key, old, next: null }];
    }

    /** Stamp all cells in an axis-aligned XZ rectangle on the given Y level. */
    function rectStamp(grid, gx0, gz0, gx1, gz1, gy, type, color) {
        const changes = [];
        const x0 = Math.min(gx0, gx1), x1 = Math.max(gx0, gx1);
        const z0 = Math.min(gz0, gz1), z1 = Math.max(gz0, gz1);
        for (let x = x0; x <= x1; x++) {
            for (let z = z0; z <= z1; z++) {
                const key = _k(x, gy, z);
                const old = grid[key] ? { ...grid[key] } : null;
                grid[key] = { type, color };
                changes.push({ key, old, next: { type, color } });
            }
        }
        return changes;
    }

    /** Erase all cells in an axis-aligned XZ rectangle on the given Y level. */
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

    /**
     * BFS flood-fill on a single Y layer.
     * Replaces all connected cells with the same (type, color) as the target.
     * Passing type=null and color=null erases all connected filled cells.
     */
    function floodFill(grid, gx, gy, gz, type, color) {
        const startKey = _k(gx, gy, gz);
        const target   = grid[startKey] || null;
        const tType    = target ? target.type  : null;
        const tColor   = target ? target.color : null;

        // Nothing to do if already the desired state
        if (tType === type && tColor === color) return [];

        const changes = [];
        const visited = new Set();
        const queue   = [[gx, gz]];
        visited.add(`${gx},${gz}`);

        const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

        while (queue.length && changes.length < MAX_FILL) {
            const [cx, cz] = queue.shift();
            const key  = _k(cx, gy, cz);
            const c    = grid[key] || null;
            const ct   = c ? c.type  : null;
            const cc   = c ? c.color : null;

            // Only expand cells that match the original target type+color
            if (ct !== tType || cc !== tColor) continue;

            const old = c ? { ...c } : null;
            if (type === null) {
                delete grid[key];
            } else {
                grid[key] = { type, color };
            }
            changes.push({ key, old, next: type !== null ? { type, color } : null });

            for (const [dx, dz] of DIRS) {
                const nk = `${cx + dx},${cz + dz}`;
                if (!visited.has(nk)) { visited.add(nk); queue.push([cx + dx, cz + dz]); }
            }
        }

        return changes;
    }

    /** Change only the color of an existing block. Returns change record. */
    function paintBlock(grid, gx, gy, gz, color) {
        const key = _k(gx, gy, gz);
        if (!grid[key]) return [];
        const old = { ...grid[key] };
        grid[key] = { ...grid[key], color };
        return [{ key, old, next: { ...grid[key] } }];
    }

    // ── undo helpers ─────────────────────────────────────────────────────────

    /** Replay a change-set (redo). */
    function applyChanges(grid, changes) {
        for (const c of changes) {
            if (c.next === null) delete grid[c.key];
            else grid[c.key] = { ...c.next };
        }
    }

    /** Revert a change-set (undo). */
    function revertChanges(grid, changes) {
        for (const c of changes) {
            if (c.old === null) delete grid[c.key];
            else grid[c.key] = { ...c.old };
        }
    }

    // ── greedy meshing ────────────────────────────────────────────────────────
    //
    // Standard greedy meshing algorithm:
    //   For each of the 6 face directions, sweep slices along the normal axis.
    //   Within each slice build a 2-D mask of visible faces grouped by (type+color).
    //   Greedily merge rectangles in the mask, then emit one quad per merged rect.
    //
    // Only generates faces where the adjacent voxel is absent (hidden-face removal).
    // Merges only faces with identical (type, color) — one draw group per color.
    //
    // Returns: { [colorHex]: { positions:number[], normals:number[], indices:number[] } }

    function buildGreedyMesh(grid, cellSize) {
        if (!grid || Object.keys(grid).length === 0) return {};
        const b = _bounds(grid);
        if (!isFinite(b.x0)) return {};

        const cs = cellSize || 1;
        const groups = {};

        function grp(color) {
            if (!groups[color]) groups[color] = { positions: [], normals: [], indices: [] };
            return groups[color];
        }

        function emitQuad(color, nx, ny, nz, v0, v1, v2, v3) {
            const g  = grp(color);
            const bi = g.positions.length / 3;
            for (const v of [v0, v1, v2, v3]) {
                g.positions.push(v[0] * cs, v[1] * cs, v[2] * cs);
                g.normals.push(nx, ny, nz);
            }
            g.indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
        }

        // Helper: greedy-merge a 2-D mask
        // mask[bi * cSz + ci] = { type, color } | null
        // Returns array of merged rects { bi, ci, bh, cw, type, color }
        function greedySlice(mask, bSz, cSz) {
            const merged = new Uint8Array(bSz * cSz);
            const rects  = [];
            for (let bi = 0; bi < bSz; bi++) {
                for (let ci = 0; ci < cSz; ci++) {
                    const mi = bi * cSz + ci;
                    if (!mask[mi] || merged[mi]) continue;
                    const { type, color } = mask[mi];

                    // expand c
                    let cw = 1;
                    while (ci + cw < cSz) {
                        const ni = bi * cSz + (ci + cw);
                        if (!mask[ni] || merged[ni] || mask[ni].type !== type || mask[ni].color !== color) break;
                        cw++;
                    }
                    // expand b
                    let bh = 1;
                    outer: while (bi + bh < bSz) {
                        for (let dc = 0; dc < cw; dc++) {
                            const ni = (bi + bh) * cSz + (ci + dc);
                            if (!mask[ni] || merged[ni] || mask[ni].type !== type || mask[ni].color !== color) break outer;
                        }
                        bh++;
                    }
                    // mark
                    for (let db = 0; db < bh; db++)
                        for (let dc = 0; dc < cw; dc++)
                            merged[(bi + db) * cSz + (ci + dc)] = 1;

                    rects.push({ bi, ci, bh, cw, type, color });
                }
            }
            return rects;
        }

        // ── +X faces (normal 1,0,0) ──────────────────────────────────────
        for (let x = b.x0; x <= b.x1; x++) {
            const bSz = b.y1 - b.y0 + 1, cSz = b.z1 - b.z0 + 1;
            const mask = new Array(bSz * cSz).fill(null);
            for (let y = b.y0; y <= b.y1; y++)
                for (let z = b.z0; z <= b.z1; z++)
                    if (_has(grid, x, y, z) && !_has(grid, x + 1, y, z))
                        mask[(y - b.y0) * cSz + (z - b.z0)] = _cell(grid, x, y, z);

            for (const { bi, ci, bh, cw, color } of greedySlice(mask, bSz, cSz)) {
                const wy = b.y0 + bi, wz = b.z0 + ci;
                // CCW from +X
                emitQuad(color, 1, 0, 0,
                    [x + 1, wy,      wz     ],
                    [x + 1, wy + bh, wz     ],
                    [x + 1, wy + bh, wz + cw],
                    [x + 1, wy,      wz + cw]);
            }
        }

        // ── -X faces (normal -1,0,0) ─────────────────────────────────────
        for (let x = b.x0; x <= b.x1; x++) {
            const bSz = b.y1 - b.y0 + 1, cSz = b.z1 - b.z0 + 1;
            const mask = new Array(bSz * cSz).fill(null);
            for (let y = b.y0; y <= b.y1; y++)
                for (let z = b.z0; z <= b.z1; z++)
                    if (_has(grid, x, y, z) && !_has(grid, x - 1, y, z))
                        mask[(y - b.y0) * cSz + (z - b.z0)] = _cell(grid, x, y, z);

            for (const { bi, ci, bh, cw, color } of greedySlice(mask, bSz, cSz)) {
                const wy = b.y0 + bi, wz = b.z0 + ci;
                // CCW from -X
                emitQuad(color, -1, 0, 0,
                    [x, wy,      wz + cw],
                    [x, wy + bh, wz + cw],
                    [x, wy + bh, wz     ],
                    [x, wy,      wz     ]);
            }
        }

        // ── +Y faces (normal 0,1,0) ──────────────────────────────────────
        for (let y = b.y0; y <= b.y1; y++) {
            const bSz = b.x1 - b.x0 + 1, cSz = b.z1 - b.z0 + 1;
            const mask = new Array(bSz * cSz).fill(null);
            for (let x = b.x0; x <= b.x1; x++)
                for (let z = b.z0; z <= b.z1; z++)
                    if (_has(grid, x, y, z) && !_has(grid, x, y + 1, z))
                        mask[(x - b.x0) * cSz + (z - b.z0)] = _cell(grid, x, y, z);

            for (const { bi, ci, bh, cw, color } of greedySlice(mask, bSz, cSz)) {
                const wx = b.x0 + bi, wz = b.z0 + ci;
                // CCW from +Y
                emitQuad(color, 0, 1, 0,
                    [wx,      y + 1, wz     ],
                    [wx,      y + 1, wz + cw],
                    [wx + bh, y + 1, wz + cw],
                    [wx + bh, y + 1, wz     ]);
            }
        }

        // ── -Y faces (normal 0,-1,0) ─────────────────────────────────────
        for (let y = b.y0; y <= b.y1; y++) {
            const bSz = b.x1 - b.x0 + 1, cSz = b.z1 - b.z0 + 1;
            const mask = new Array(bSz * cSz).fill(null);
            for (let x = b.x0; x <= b.x1; x++)
                for (let z = b.z0; z <= b.z1; z++)
                    if (_has(grid, x, y, z) && !_has(grid, x, y - 1, z))
                        mask[(x - b.x0) * cSz + (z - b.z0)] = _cell(grid, x, y, z);

            for (const { bi, ci, bh, cw, color } of greedySlice(mask, bSz, cSz)) {
                const wx = b.x0 + bi, wz = b.z0 + ci;
                // CCW from -Y
                emitQuad(color, 0, -1, 0,
                    [wx + bh, y, wz     ],
                    [wx + bh, y, wz + cw],
                    [wx,      y, wz + cw],
                    [wx,      y, wz     ]);
            }
        }

        // ── +Z faces (normal 0,0,1) ──────────────────────────────────────
        for (let z = b.z0; z <= b.z1; z++) {
            const bSz = b.x1 - b.x0 + 1, cSz = b.y1 - b.y0 + 1;
            const mask = new Array(bSz * cSz).fill(null);
            for (let x = b.x0; x <= b.x1; x++)
                for (let y = b.y0; y <= b.y1; y++)
                    if (_has(grid, x, y, z) && !_has(grid, x, y, z + 1))
                        mask[(x - b.x0) * cSz + (y - b.y0)] = _cell(grid, x, y, z);

            for (const { bi, ci, bh, cw, color } of greedySlice(mask, bSz, cSz)) {
                const wx = b.x0 + bi, wy = b.y0 + ci;
                // CCW from +Z
                emitQuad(color, 0, 0, 1,
                    [wx + bh, wy,      z + 1],
                    [wx + bh, wy + cw, z + 1],
                    [wx,      wy + cw, z + 1],
                    [wx,      wy,      z + 1]);
            }
        }

        // ── -Z faces (normal 0,0,-1) ─────────────────────────────────────
        for (let z = b.z0; z <= b.z1; z++) {
            const bSz = b.x1 - b.x0 + 1, cSz = b.y1 - b.y0 + 1;
            const mask = new Array(bSz * cSz).fill(null);
            for (let x = b.x0; x <= b.x1; x++)
                for (let y = b.y0; y <= b.y1; y++)
                    if (_has(grid, x, y, z) && !_has(grid, x, y, z - 1))
                        mask[(x - b.x0) * cSz + (y - b.y0)] = _cell(grid, x, y, z);

            for (const { bi, ci, bh, cw, color } of greedySlice(mask, bSz, cSz)) {
                const wx = b.x0 + bi, wy = b.y0 + ci;
                // CCW from -Z
                emitQuad(color, 0, 0, -1,
                    [wx,      wy,      z],
                    [wx,      wy + cw, z],
                    [wx + bh, wy + cw, z],
                    [wx + bh, wy,      z]);
            }
        }

        return groups;
    }

    /**
     * Convert greedy-mesh groups into THREE.Mesh objects for live 3D preview.
     * @param {Object} groups — result of buildGreedyMesh()
     * @param {typeof THREE} THREEref — THREE global
     * @returns {THREE.Mesh[]}
     */
    function buildThreeGeometries(groups, THREEref) {
        const meshes = [];
        for (const [colorHex, data] of Object.entries(groups)) {
            if (!data.positions.length) continue;
            const geo = new THREEref.BufferGeometry();
            geo.setAttribute('position', new THREEref.BufferAttribute(new Float32Array(data.positions), 3));
            geo.setAttribute('normal',   new THREEref.BufferAttribute(new Float32Array(data.normals),   3));
            geo.setIndex(data.indices);
            const mat  = new THREEref.MeshLambertMaterial({ color: colorHex, side: THREEref.FrontSide });
            const mesh = new THREEref.Mesh(geo, mat);
            mesh.castShadow    = true;
            mesh.receiveShadow = true;
            meshes.push(mesh);
        }
        return meshes;
    }

    /**
     * Export greedy mesh as plain JS data suitable for GLTF serialization (Phase 41).
     * @returns {{ color:string, positions:number[], normals:number[], indices:number[] }[]}
     */
    function exportGreedyMesh(grid, cellSize) {
        const groups = buildGreedyMesh(grid, cellSize);
        return Object.entries(groups).map(([color, data]) => ({
            color,
            positions: [...data.positions],
            normals:   [...data.normals],
            indices:   [...data.indices],
        }));
    }

    // ── public API ────────────────────────────────────────────────────────────
    return {
        // brush ops
        pencil, erase, rectStamp, rectErase, floodFill, paintBlock,
        // undo helpers
        applyChanges, revertChanges,
        // mesh
        buildGreedyMesh, buildThreeGeometries, exportGreedyMesh,
    };

})();

if (typeof window !== 'undefined') window.BrushTools = BrushTools;
