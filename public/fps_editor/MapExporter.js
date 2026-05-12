/**
 * MapExporter.js — Phase 41
 * FPS Map Export, Validation, Navmesh Generation, and Preview Launch.
 *
 * Features:
 *   - Full map payload assembly (voxels, palette, entities, lights, triggers)
 *   - Navmesh generation: BFS flood-fill across walkable floor cells →
 *     outputs { nodes:[{x,z,cx,cz}], edges:[[i,j]] } stored in the map file
 *   - Comprehensive validation: player spawn, level exit, empty map,
 *     disconnected rooms, unreachable areas
 *   - Save to server via POST /api/levels3d/:project/:level
 *   - Export .fpsmap.json download
 *   - Preview launch: write to localStorage + open FPS engine with ?playtest=1
 *
 * Public API:
 *   buildNavmesh(voxelGrid, cellSize)  → navmesh object (pure function)
 *   validate(mapData)                  → { ok, issues[], warnings[] }
 *   exportToFile(mapData)              → triggers browser download
 *   exportToServer(mapData)            → Promise<{ok, levelId, engineType}>
 *   testPlay(mapData)                  → launches FPS engine in preview mode
 *   buildPayload(state, navmesh)       → assembles fps-3d level object
 */

/* global window, document, localStorage */
const MapExporter = (() => {
    'use strict';

    // ── Navmesh generation ────────────────────────────────────────────────────

    /**
     * Generate a simple grid-based navigation mesh from walkable floor voxels.
     *
     * A cell is "walkable" when:
     *   1. It contains a block at ground level (gy === 0) that is a floor or
     *      any solid type (we allow all types as walkable ground).
     *   2. The cell directly above it (gy === 1) is empty (headroom check).
     *
     * Output format:
     *   {
     *     nodes: [{ id, gx, gz, x, z }],   // world-center positions
     *     edges: [[nodeIdA, nodeIdB], ...]  // 4-directional adjacency
     *   }
     *
     * @param {Object} voxelGrid  { "gx,gy,gz": { type, color } }
     * @param {number} cellSize   metres per cell
     * @returns {{ nodes: Array, edges: Array }}
     */
    function buildNavmesh(voxelGrid, cellSize) {
        const cs = cellSize || 1;

        // Collect walkable cells at ground level
        const walkable = new Set();
        for (const key of Object.keys(voxelGrid)) {
            const [gx, gy, gz] = key.split(',').map(Number);
            if (gy !== 0) continue;
            // headroom: if there is a block directly above, not walkable
            const aboveKey = `${gx},1,${gz}`;
            if (voxelGrid[aboveKey]) continue;
            walkable.add(`${gx},${gz}`);
        }

        if (!walkable.size) return { nodes: [], edges: [] };

        // Build node list
        const nodes = [];
        const keyToIdx = {};
        for (const k of walkable) {
            const [gx, gz] = k.split(',').map(Number);
            const idx = nodes.length;
            nodes.push({
                id: idx,
                gx,
                gz,
                x: gx * cs + cs * 0.5,
                z: gz * cs + cs * 0.5,
            });
            keyToIdx[k] = idx;
        }

        // 4-directional edges (no diagonals for strict DOOM-style corridors)
        const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
        const edges = [];
        for (const node of nodes) {
            for (const [dx, dz] of DIRS) {
                const nk = `${node.gx + dx},${node.gz + dz}`;
                if (keyToIdx[nk] !== undefined && keyToIdx[nk] > node.id) {
                    edges.push([node.id, keyToIdx[nk]]);
                }
            }
        }

        return { nodes, edges };
    }

    // ── Connectivity analysis (for disconnected-room detection) ───────────────

    /**
     * Returns an array of connected-component sets, each containing node ids.
     * Used to detect unreachable areas.
     */
    function _connectedComponents(nodes, edges) {
        const n = nodes.length;
        if (!n) return [];
        const adj = Array.from({ length: n }, () => []);
        for (const [a, b] of edges) {
            adj[a].push(b);
            adj[b].push(a);
        }
        const visited = new Uint8Array(n);
        const components = [];
        for (let start = 0; start < n; start++) {
            if (visited[start]) continue;
            const comp = [];
            const queue = [start];
            visited[start] = 1;
            while (queue.length) {
                const cur = queue.pop();
                comp.push(cur);
                for (const nb of adj[cur]) {
                    if (!visited[nb]) { visited[nb] = 1; queue.push(nb); }
                }
            }
            components.push(comp);
        }
        return components;
    }

    // ── Validation ────────────────────────────────────────────────────────────

    /**
     * Comprehensive map validation.
     * @param {Object} mapData  full map payload from _buildMapData()
     * @returns {{ ok: boolean, issues: string[], warnings: string[] }}
     */
    function validate(mapData) {
        const issues   = [];
        const warnings = [];

        const blockCount  = Object.keys(mapData.voxelGrid || {}).length;
        const entities    = mapData.entities    || [];
        const triggers    = mapData.triggers    || [];
        const lights      = mapData.lights      || [];

        // ── Hard errors ──────────────────────────────────────────────────────
        if (blockCount === 0) {
            issues.push('Map is empty — no blocks placed.');
        }
        if (!entities.some(e => e.type === 'player-spawn')) {
            issues.push('No player spawn point (player-spawn) placed.');
        }

        // ── Warnings ─────────────────────────────────────────────────────────
        if (!entities.some(e => e.type === 'level-exit') &&
            !triggers.some(t => t.event === 'levelComplete')) {
            warnings.push('No level exit or levelComplete trigger defined.');
        }

        if (blockCount > 0) {
            const navmesh  = buildNavmesh(mapData.voxelGrid, mapData.cellSize || 1);
            const comps    = _connectedComponents(navmesh.nodes, navmesh.edges);
            if (comps.length > 1) {
                const sizes = comps.map(c => c.length).sort((a,b) => b - a);
                warnings.push(
                    `${comps.length} disconnected room(s) detected ` +
                    `(sizes: ${sizes.join(', ')} cells). ` +
                    'Add corridors to connect all areas.'
                );
            }
            if (navmesh.nodes.length === 0 && blockCount > 0) {
                warnings.push('No walkable floor cells found — place floor blocks with headroom for player movement.');
            }

            // Unreachable spawn check
            if (navmesh.nodes.length > 0) {
                const spawn = entities.find(e => e.type === 'player-spawn');
                if (spawn) {
                    const cs = mapData.cellSize || 1;
                    const sgx = Math.floor(spawn.x / cs);
                    const sgz = Math.floor(spawn.z / cs);
                    const spawnKey = `${sgx},${sgz}`;
                    const spawnOnNav = navmesh.nodes.some(n => n.gx === sgx && n.gz === sgz);
                    if (!spawnOnNav) {
                        warnings.push('Player spawn is not on a walkable floor cell — ensure a floor block is at the spawn location.');
                    }
                }
            }
        }

        if (lights.length > 32) {
            warnings.push(`${lights.length} point lights placed — consider reducing to ≤32 for real-time performance.`);
        }
        if (blockCount > 50000) {
            warnings.push(`Large map: ${blockCount} blocks. Build time and performance may be affected.`);
        }

        return {
            ok:       issues.length === 0,
            issues,
            warnings,
        };
    }

    // ── Payload assembly ──────────────────────────────────────────────────────

    /**
     * Assemble the full fps-3d level payload for server/export.
     * Passes navmesh if provided, otherwise leaves it null (caller should
     * call buildNavmesh() first and pass the result).
     *
     * @param {Object} mapData  raw state from fps_editor _buildMapData()
     * @param {Object|null} navmesh
     * @returns {Object}
     */
    function buildPayload(mapData, navmesh) {
        const entities = mapData.entities || [];
        const spawn    = entities.find(e => e.type === 'player-spawn');
        const enemies  = entities.filter(e => e.type === 'enemy');

        return {
            // schema identifiers
            version:        mapData.version    || 2,
            engineType:     'fps-3d',
            schemaVersion:  '1.0',

            // map metadata
            name:           mapData.mapName    || 'untitled_map',
            mapName:        mapData.mapName    || 'untitled_map',
            author:         mapData.author     || '',
            project:        mapData.project    || '',

            // spawn point
            playerSpawn:    spawn ? { x: spawn.x, y: spawn.y, z: spawn.z } : { x: 0, y: 1.8, z: 0 },

            // geometry
            cellSize:       mapData.cellSize   || 1,
            ceilingH:       mapData.ceilingH   || 3,
            floorY:         mapData.floorY     ?? 0,
            voxelGrid:      mapData.voxelGrid  || {},
            palette:        mapData.palette    || [],

            // environment
            fog:            mapData.fog        || { color: '#1a1208', near: 8, far: 30 },
            ambient:        mapData.ambient    || '#1a1208',
            sun:            mapData.sun        || '#ffcc88',
            skybox:         mapData.skybox     || { mode: 'solid', colorHex: '#1a1208' },

            // lights & emissive
            lights:         mapData.lights         || [],
            emissiveBlocks: mapData.emissiveBlocks  || {},

            // entities & triggers
            entities:       entities,
            enemies:        enemies,
            triggers:       mapData.triggers   || [],

            // navmesh (generated at export time)
            navmesh:        navmesh            || null,

            // timestamps
            exportedAt:     new Date().toISOString(),
        };
    }

    // ── File download ─────────────────────────────────────────────────────────

    /** Download the full map payload as a .fpsmap.json file. */
    function exportToFile(mapData) {
        const navmesh = buildNavmesh(mapData.voxelGrid, mapData.cellSize);
        const payload = buildPayload(mapData, navmesh);
        const filename = `${(mapData.mapName || 'untitled_map').replace(/\s+/g, '_')}.fpsmap.json`;
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
        a.click();
        URL.revokeObjectURL(url);
        return payload;
    }

    // ── Server save ───────────────────────────────────────────────────────────

    /**
     * POST the map to /api/levels3d/:project/:level.
     * @param {Object} mapData  raw state from fps_editor _buildMapData()
     * @returns {Promise<{ok, levelId, engineType}>}
     */
    function exportToServer(mapData) {
        const navmesh  = buildNavmesh(mapData.voxelGrid, mapData.cellSize);
        const payload  = buildPayload(mapData, navmesh);
        const project  = encodeURIComponent(mapData.project  || 'FPS3D Demo');
        const levelId  = encodeURIComponent(
            (mapData.mapName || 'untitled_map').replace(/\s+/g, '_')
        );
        return fetch(`/api/levels3d/${project}/${levelId}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        })
        .then(r => r.ok ? r.json() : r.text().then(t => Promise.reject(t)));
    }

    // ── Test play ─────────────────────────────────────────────────────────────

    /**
     * Write the map to localStorage then open the FPS engine in playtest mode.
     * The engine reads `localStorage.getItem('temp_playtest_fps3d')` when
     * launched with ?playtest=1.
     *
     * @param {Object} mapData  raw state from fps_editor _buildMapData()
     */
    function testPlay(mapData) {
        const navmesh = buildNavmesh(mapData.voxelGrid, mapData.cellSize);
        const payload = buildPayload(mapData, navmesh);
        try {
            sessionStorage.setItem('ketebe_playtest_data', JSON.stringify(payload));
            localStorage.setItem('temp_playtest_fps3d', JSON.stringify(payload)); // Legacy fallback
        } catch (e) {
            alert('[MapExporter] localStorage quota exceeded — map too large for playtest.');
            return;
        }
        // Determine path to fps engine relative to editor location
        const base   = window.location.pathname.replace(/\/[^/]*$/, '/');
        const target = `${base}engines/fps-3d/index.html?playtest=1`;
        const win    = window.open(target, 'fps3d_preview');
        if (!win) {
            alert('Popup blocked. Allow popups for this page and try again, or navigate to:\n' + target);
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────
    return { buildNavmesh, validate, buildPayload, exportToFile, exportToServer, testPlay };

})();

if (typeof window !== 'undefined') window.MapExporter = MapExporter;
