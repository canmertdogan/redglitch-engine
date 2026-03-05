/**
 * topdown3d_export_tools.js — Phase 25
 * Map Export / Import for the Topdown 3D Studio.
 * Self-installs as window.__topdown3dExportTools.
 *
 * Features:
 *   - Export to projects/{name}/dunyalar/{mapName}.3dmap.json
 *   - Schema: terrain heightmap (Float32 → base64), voxel blocks, props[],
 *     entities[], lights[], lighting{}, navmesh polygon soup, schema metadata
 *   - Import: load .3dmap.json, validate schema, apply to all tool plugins
 *   - Schema validation with error report in status bar
 *   - Wires File→Export 3D Map and File→Import 3D Map menu items
 *   - Also exposes exportMap() / importMap() on the editor global
 *
 * No external dependencies beyond THREE (already loaded by editor).
 */
(function () {
    'use strict';

    const SCHEMA_VERSION = '1.0';
    const VALID_ENGINE_TYPES = ['topdown-3d', 'fps-3d', 'platformer-3d'];

    /* ── Heightmap encode/decode ──────────────────────────────────────────── */
    /**
     * Encode a Float32Array as a base64 string.
     */
    function float32ToBase64(arr) {
        const buf  = new ArrayBuffer(arr.length * 4);
        const view = new Float32Array(buf);
        view.set(arr);
        let binary = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    /**
     * Decode a base64 string back to Float32Array.
     */
    function base64ToFloat32(b64) {
        const binary = atob(b64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Float32Array(bytes.buffer);
    }

    /* ── Schema validation ────────────────────────────────────────────────── */
    const ERRORS = [];

    function validateImport(raw) {
        ERRORS.length = 0;
        if (!raw || typeof raw !== 'object') {
            ERRORS.push('Root must be a JSON object'); return false;
        }
        if (raw.schemaVersion !== SCHEMA_VERSION) {
            ERRORS.push(`Unrecognised schemaVersion "${raw.schemaVersion}" (expected "${SCHEMA_VERSION}")`);
        }
        if (raw.engineType && !VALID_ENGINE_TYPES.includes(raw.engineType)) {
            ERRORS.push(`Unknown engineType "${raw.engineType}"`);
        }
        if (raw.terrain && typeof raw.terrain !== 'object') {
            ERRORS.push('terrain must be an object');
        }
        if (raw.terrain?.heightmapBase64 && typeof raw.terrain.heightmapBase64 !== 'string') {
            ERRORS.push('terrain.heightmapBase64 must be a string');
        }
        if (raw.voxels !== undefined && !Array.isArray(raw.voxels)) {
            ERRORS.push('voxels must be an array');
        }
        if (raw.props !== undefined && !Array.isArray(raw.props)) {
            ERRORS.push('props must be an array');
        }
        if (raw.entities !== undefined && !Array.isArray(raw.entities)) {
            ERRORS.push('entities must be an array');
        }
        if (raw.lights !== undefined && !Array.isArray(raw.lights)) {
            ERRORS.push('lights must be an array');
        }
        // Warn on unknown top-level keys
        const KNOWN = new Set(['schemaVersion','engineType','name','id','exportedAt',
            'terrain','voxels','props','entities','lights','navmesh','lighting']);
        for (const key of Object.keys(raw)) {
            if (!KNOWN.has(key)) ERRORS.push(`Unknown key "${key}" (will be ignored)`);
        }
        // Hard errors only: schemaVersion mismatch is a warning, not a fatal error
        return !ERRORS.some(e => !e.startsWith('Unknown key') && !e.startsWith('Unrecognised'));
    }

    /* ── ExportToolsPlugin ────────────────────────────────────────────────── */
    class ExportToolsPlugin {
        constructor(ed) {
            this._ed = ed;
        }

        /* ── Build export payload ─────────────────────────────────────────── */
        buildExportPayload() {
            const ed     = this._ed;
            const state  = ed.state;
            const THREE  = ed.THREE;

            // Base level JSON from editor (entities, lights, props from patch)
            const baseLevel = ed.buildLevelJSON ? ed.buildLevelJSON() : {};

            // Terrain heightmap
            const terrainData = this._serializeTerrain(THREE, ed);

            // Voxel data (from terrain tools plugin)
            const voxelData = this._serializeVoxels();

            // Props (from object tools plugin)
            const propsData = this._serializeProps();

            // NavMesh (from nav mesh state if baked)
            const navmeshData = state?.level?.navmesh ?? null;

            // Lighting (from lighting tools plugin)
            const lightingData = this._serializeLighting();

            return {
                schemaVersion: SCHEMA_VERSION,
                engineType:    baseLevel.engineType ?? 'topdown-3d',
                name:          baseLevel.name ?? state?.level?.name ?? 'Untitled',
                id:            baseLevel.id   ?? state?.level?.id   ?? 'level_01',
                exportedAt:    new Date().toISOString(),
                terrain:       terrainData,
                voxels:        voxelData,
                props:         propsData,
                entities:      baseLevel.entities ?? [],
                lights:        baseLevel.lights   ?? [],
                navmesh:       navmeshData,
                lighting:      lightingData,
            };
        }

        _serializeTerrain(THREE, ed) {
            const mesh = ed.getTerrainMesh ? ed.getTerrainMesh() : null;
            if (!mesh) return { width: 50, depth: 50, heightmapBase64: null, lowPolyColors: null };

            const geo  = mesh.geometry;
            const pos  = geo.attributes.position;
            const cols = geo.attributes.color ?? null;

            // Extract height values (Y coordinate per vertex)
            const heights = new Float32Array(pos.count);
            for (let i = 0; i < pos.count; i++) heights[i] = pos.getY(i);

            // Extract vertex colors if present
            let lowPolyColors = null;
            if (cols) {
                const cArr = new Float32Array(cols.count * 3);
                for (let i = 0; i < cols.count; i++) {
                    cArr[i * 3]     = cols.getX(i);
                    cArr[i * 3 + 1] = cols.getY(i);
                    cArr[i * 3 + 2] = cols.getZ(i);
                }
                lowPolyColors = float32ToBase64(cArr);
            }

            // Determine grid dimensions from geometry params (PlaneGeometry)
            const params = geo.parameters ?? {};
            const width  = params.width      ?? 50;
            const depth  = params.height     ?? 50;
            const widthSeg = params.widthSegments  ?? 50;
            const depthSeg = params.heightSegments ?? 50;

            return {
                width, depth, widthSegments: widthSeg, depthSegments: depthSeg,
                heightmapBase64: float32ToBase64(heights),
                lowPolyColors,
            };
        }

        _serializeVoxels() {
            const tt = window.__topdown3dTerrainTools;
            if (!tt?.voxelPainter) return [];
            // VoxelTerrainPainter stores voxels as Map of 'x,y,z' → { blockType }
            const vp  = tt.voxelPainter;
            const out = [];
            vp._voxels?.forEach((data, key) => {
                const [x, y, z] = key.split(',').map(Number);
                out.push({ x, y, z, type: data.blockType });
            });
            return out;
        }

        _serializeProps() {
            const ot = window.__topdown3dObjectTools;
            if (!ot?.placer) return [];
            return ot.placer.serialize ? ot.placer.serialize() : [];
        }

        _serializeLighting() {
            const lt = window.__topdown3dLightingTools;
            if (!lt) return null;
            return lt.serialize ? lt.serialize() : null;
        }

        /* ── Export ───────────────────────────────────────────────────────── */
        async exportMap(mapName) {
            const ed      = this._ed;
            const project = ed.state?.projectName;
            if (!project) { ed.setStatus('No project open — cannot export.', true); return false; }

            const name    = (mapName ?? ed.state?.level?.id ?? 'level_01')
                .replace(/[^a-zA-Z0-9_-]/g, '_');
            const payload = this.buildExportPayload();

            const content = JSON.stringify(payload, null, 2);
            const relPath = `dunyalar/${name}.3dmap.json`;

            try {
                const res = await fetch('/api/project-file', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ project, path: relPath, content }),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                ed.setStatus(`Exported: ${relPath}`);
                console.log(`[ExportTools] exported ${relPath} (${Math.round(content.length/1024)}KB)`);
                return true;
            } catch (err) {
                ed.setStatus(`Export failed: ${err.message}`, true);
                console.error('[ExportTools] export error:', err);
                return false;
            }
        }

        /* ── Import ───────────────────────────────────────────────────────── */
        async importMap(projectName, mapFile) {
            const ed = this._ed;
            const project = projectName ?? ed.state?.projectName;
            if (!project) { ed.setStatus('No project open — cannot import.', true); return false; }

            let raw;
            try {
                const res = await fetch(`/api/project-file?project=${encodeURIComponent(project)}&path=${encodeURIComponent(mapFile)}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                raw = JSON.parse(data.content);
            } catch (err) {
                ed.setStatus(`Import failed: ${err.message}`, true);
                return false;
            }

            // Validate
            const valid = validateImport(raw);
            if (!valid) {
                const msg = 'Schema errors: ' + ERRORS.filter(e => !e.startsWith('Unknown')).join('; ');
                ed.setStatus(msg, true);
                console.error('[ExportTools] import validation errors:', ERRORS);
                return false;
            }
            if (ERRORS.length) {
                console.warn('[ExportTools] import warnings:', ERRORS);
                ed.setStatus('Imported with warnings — check console for details.');
            }

            // Apply to editor
            this._applyImport(raw);
            return true;
        }

        _applyImport(raw) {
            const ed     = this._ed;
            const THREE  = ed.THREE;

            // Build a level-JSON-compatible object for the editor's applyLevelJSON
            const lvlJson = {
                schemaVersion: raw.schemaVersion,
                engineType:    raw.engineType,
                name:          raw.name,
                id:            raw.id,
                entities:      raw.entities  ?? [],
                lights:        raw.lights    ?? [],
                navmesh:       raw.navmesh   ?? null,
                lighting:      raw.lighting  ?? null,
                props:         raw.props     ?? [],
            };
            if (ed.applyLevelJSON) ed.applyLevelJSON(lvlJson);

            // Restore terrain heightmap
            if (raw.terrain?.heightmapBase64 && ed.getTerrainMesh) {
                const mesh = ed.getTerrainMesh();
                if (mesh) {
                    const heights = base64ToFloat32(raw.terrain.heightmapBase64);
                    const pos = mesh.geometry.attributes.position;
                    for (let i = 0; i < Math.min(heights.length, pos.count); i++) {
                        pos.setY(i, heights[i]);
                    }
                    pos.needsUpdate = true;
                    mesh.geometry.computeVertexNormals();
                }
            }

            // Restore vertex colors
            if (raw.terrain?.lowPolyColors && ed.getTerrainMesh) {
                const mesh = ed.getTerrainMesh();
                if (mesh) {
                    const cols = base64ToFloat32(raw.terrain.lowPolyColors);
                    const geo  = mesh.geometry;
                    const count = cols.length / 3;
                    if (!geo.attributes.color) {
                        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
                        mesh.material.vertexColors = true;
                        mesh.material.needsUpdate  = true;
                    }
                    const colorAttr = geo.attributes.color;
                    for (let i = 0; i < count; i++) {
                        colorAttr.setXYZ(i, cols[i*3], cols[i*3+1], cols[i*3+2]);
                    }
                    colorAttr.needsUpdate = true;
                }
            }

            // Restore voxels
            if (Array.isArray(raw.voxels) && raw.voxels.length > 0) {
                const tt = window.__topdown3dTerrainTools;
                if (tt?.voxelPainter) {
                    tt.voxelPainter._voxels = new Map();
                    for (const v of raw.voxels) {
                        tt.voxelPainter.placeStamp(
                            new THREE.Vector3(v.x, v.y, v.z),
                            v.type ?? 'GRASS', 1
                        );
                    }
                }
            }

            ed.setStatus(`Imported: ${raw.name ?? raw.id} (${ERRORS.length} warnings)`);
        }

        /* ── File picker helper (open file dialog via input[type=file]) ───── */
        openFilePicker() {
            return new Promise(resolve => {
                const inp = document.createElement('input');
                inp.type   = 'file';
                inp.accept = '.3dmap.json,application/json';
                inp.addEventListener('change', () => {
                    const file = inp.files?.[0];
                    if (!file) { resolve(null); return; }
                    const reader = new FileReader();
                    reader.onload = e => {
                        try { resolve(JSON.parse(e.target.result)); }
                        catch { resolve(null); }
                    };
                    reader.readAsText(file);
                }, { once: true });
                inp.click();
            });
        }

        /* ── Apply imported data from file picker ─────────────────────────── */
        async importFromPicker() {
            const ed = this._ed;
            const raw = await this.openFilePicker();
            if (!raw) { ed.setStatus('Import cancelled.'); return false; }

            const valid = validateImport(raw);
            if (!valid) {
                const msg = 'Schema errors: ' + ERRORS.filter(e => !e.startsWith('Unknown')).join('; ');
                ed.setStatus(msg, true);
                return false;
            }
            if (ERRORS.length) console.warn('[ExportTools] import warnings:', ERRORS);
            this._applyImport(raw);
            return true;
        }

        /* ── Wire menu items ──────────────────────────────────────────────── */
        _wireMenuItems() {
            const ed = this._ed;

            // "File > Export 3D Map" — look for existing menu item in menubar
            document.addEventListener('click', async e => {
                const item = e.target.closest('[data-action]');
                if (!item) return;
                const action = item.dataset.action;
                if (action === 'export-3dmap') {
                    await this.exportMap();
                } else if (action === 'import-3dmap') {
                    await this.importFromPicker();
                }
            });

            // Keyboard shortcut: Ctrl+Shift+E = export, Ctrl+Shift+I = import
            document.addEventListener('keydown', async e => {
                if (e.ctrlKey && e.shiftKey && e.key === 'E') {
                    e.preventDefault();
                    await this.exportMap();
                } else if (e.ctrlKey && e.shiftKey && e.key === 'I') {
                    e.preventDefault();
                    await this.importFromPicker();
                }
            });
        }
    }

    /* ── Auto-install ─────────────────────────────────────────────────────── */
    function install() {
        const ed = window.__topdown3dEditor;
        if (!ed || !ed.THREE) { setTimeout(install, 200); return; }
        if (window.__topdown3dExportTools) return;

        const plugin = new ExportToolsPlugin(ed);
        window.__topdown3dExportTools = plugin;
        ed._exportToolsPlugin  = plugin;

        // Expose top-level helpers
        ed.exportMap  = (mapName)             => plugin.exportMap(mapName);
        ed.importMap  = (project, mapFile)    => plugin.importMap(project, mapFile);
        ed.importFrom = ()                    => plugin.importFromPicker();

        plugin._wireMenuItems();
        console.log('[ExportTools] Phase 25 installed — Ctrl+Shift+E export, Ctrl+Shift+I import.');
    }

    install();
})();
