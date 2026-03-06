/**
 * topdown3d_terrain_tools.js
 * Phase 22 — Terrain Painting Tools (Voxel + Low-poly)
 *
 * Requires: topdown3d_editor.js to be loaded first (exposes window.__topdown3dEditor)
 *
 * Provides:
 *  - VoxelTerrainPainter  : block-place/erase with 11 block types, InstancedMesh per type
 *  - LowPolyPainter       : per-face vertex color painting on terrain PlaneGeometry
 *  - TerrainToolsPlugin   : binds both painters to the editor, manages 256-color palette,
 *                           handles terrain mode toggle, history (50 ops), panel UI wiring
 */

(function () {
    'use strict';

    // ── 1. Block type definitions ─────────────────────────────────────────────
    const BLOCK_TYPES = [
        { id: 'grass',   label: 'GRASS',  color: '#4caf50' },
        { id: 'dirt',    label: 'DIRT',   color: '#795548' },
        { id: 'stone',   label: 'STONE',  color: '#78909c' },
        { id: 'sand',    label: 'SAND',   color: '#fdd835' },
        { id: 'wood',    label: 'WOOD',   color: '#a1887f' },
        { id: 'water',   label: 'WATER',  color: '#1565c0' },
        { id: 'lava',    label: 'LAVA',   color: '#f4511e' },
        { id: 'snow',    label: 'SNOW',   color: '#e0e0e0' },
        { id: 'ice',     label: 'ICE',    color: '#80deea' },
        { id: 'glass',   label: 'GLASS',  color: '#b2ebf2' },
        { id: 'planks',  label: 'PLANK',  color: '#d4a574' },
    ];

    // Index map: id → index
    const BLOCK_IDX = {};
    BLOCK_TYPES.forEach((b, i) => { BLOCK_IDX[b.id] = i; });

    // ── 2. Default 256-color palette (MagicaVoxel-inspired, 16×16) ───────────
    function buildDefaultPalette() {
        const colors = [];

        // Row 0: Grayscale (16 steps)
        for (let i = 0; i < 16; i++) {
            const v = Math.round(i * 17);
            colors.push(`#${v.toString(16).padStart(2,'0').repeat(3)}`);
        }

        // Rows 1–14: Hue × lightness grid
        // 14 rows × 16 hue segments
        const lightSteps = [
            [90, 80], [90, 60], [80, 40], [70, 30],   // rows 1-4: desaturated→saturated bright
            [100,75], [100,55], [90, 45], [80, 35],    // rows 5-8: vivid
            [60, 65], [60, 50], [50, 40], [40, 30],    // rows 9-12: muted/deep
            [95, 85], [75, 25],                         // rows 13-14: pastels + darks
        ];
        for (const [s, l] of lightSteps) {
            for (let h = 0; h < 16; h++) {
                const hue = Math.round(h * (360 / 16));
                colors.push(hslToHex(hue, s, l));
            }
        }

        // Row 15: Earth tones (browns, tans, mossgreens, navy, maroon, etc.)
        const earths = [
            '#3e2723','#4e342e','#5d4037','#6d4c41',
            '#795548','#8d6e63','#a1887f','#bcaaa4',
            '#1b5e20','#2e7d32','#388e3c','#558b2f',
            '#0d47a1','#1565c0','#b71c1c','#c62828',
        ];
        colors.push(...earths);

        return colors; // exactly 256
    }

    function hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const k = (n + h / 30) % 12;
            const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
            return Math.round(255 * c).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }

    const DEFAULT_256_PALETTE = buildDefaultPalette();

    // ── 3. VoxelTerrainPainter ────────────────────────────────────────────────
    class VoxelTerrainPainter {
        /**
         * @param {THREE} THREE
         * @param {THREE.Scene} scene
         */
        constructor(THREE, scene) {
            this._THREE  = THREE;
            this._scene  = scene;
            // sparse voxel store: key="${x},${y},${z}" → blockTypeId
            this._voxels = new Map();
            // InstancedMesh per block type (max 4096 instances each)
            this._MAX_INSTANCES = 4096;
            this._meshes  = new Map(); // blockTypeId → InstancedMesh
            this._counts  = new Map(); // blockTypeId → currentCount
            this._dirty   = new Set(); // which types need rebuild
            this._group   = new THREE.Group();
            this._group.name = 'voxel_terrain';
            scene.add(this._group);

            this._blockGeo = new THREE.BoxGeometry(1, 1, 1);
            this._buildAllMeshes();
        }

        _buildAllMeshes() {
            for (const bt of BLOCK_TYPES) {
                const mat = new this._THREE.MeshPhongMaterial({
                    color: new this._THREE.Color(bt.color),
                    flatShading: true,
                    shininess: 0,
                });
                const im = new this._THREE.InstancedMesh(this._blockGeo, mat, this._MAX_INSTANCES);
                im.count = 0;
                im.name  = `voxel_${bt.id}`;
                im.userData.blockType = bt.id;
                this._group.add(im);
                this._meshes.set(bt.id, im);
                this._counts.set(bt.id, 0);
            }
        }

        /** Return voxel grid key */
        _key(x, y, z) { return `${x},${y},${z}`; }

        /**
         * Place one or more blocks in a stamp pattern.
         * @param {number} wx world X center
         * @param {number} wz world Z center
         * @param {string} blockTypeId
         * @param {number} stampSize 1|3|5
         * @param {number} layers number of Y layers (1+)
         * @param {number} yBase  base Y coordinate
         * @returns {Array} array of placed {x,y,z,type} for undo
         */
        placeStamp(wx, wz, blockTypeId, stampSize, layers, yBase) {
            const placed = [];
            const half = Math.floor(stampSize / 2);
            const bx = Math.round(wx);
            const bz = Math.round(wz);
            for (let dx = -half; dx <= half; dx++) {
                for (let dz = -half; dz <= half; dz++) {
                    for (let dy = 0; dy < layers; dy++) {
                        const x = bx + dx, y = yBase + dy, z = bz + dz;
                        const k = this._key(x, y, z);
                        const prev = this._voxels.get(k) ?? null;
                        if (prev !== blockTypeId) {
                            if (prev) { this._removeFromMesh(prev, x, y, z); }
                            this._voxels.set(k, blockTypeId);
                            this._addToMesh(blockTypeId, x, y, z);
                            placed.push({ x, y, z, prev, next: blockTypeId });
                        }
                    }
                }
            }
            return placed;
        }

        /**
         * Erase blocks in a stamp pattern.
         * @returns {Array} array of erased {x,y,z,prev}
         */
        eraseStamp(wx, wz, stampSize, layers, yBase) {
            const erased = [];
            const half   = Math.floor(stampSize / 2);
            const bx = Math.round(wx), bz = Math.round(wz);
            for (let dx = -half; dx <= half; dx++) {
                for (let dz = -half; dz <= half; dz++) {
                    for (let dy = 0; dy < layers; dy++) {
                        const x = bx + dx, y = yBase + dy, z = bz + dz;
                        const k = this._key(x, y, z);
                        const prev = this._voxels.get(k);
                        if (prev) {
                            this._removeFromMesh(prev, x, y, z);
                            this._voxels.delete(k);
                            erased.push({ x, y, z, prev });
                        }
                    }
                }
            }
            return erased;
        }

        _addToMesh(blockTypeId, x, y, z) {
            const im = this._meshes.get(blockTypeId);
            if (!im) return;
            const idx = im.count;
            if (idx >= this._MAX_INSTANCES) return; // at capacity
            const mat4 = new this._THREE.Matrix4();
            mat4.setPosition(x + 0.5, y + 0.5, z + 0.5);
            im.setMatrixAt(idx, mat4);
            im.count++;
            im.instanceMatrix.needsUpdate = true;
        }

        _removeFromMesh(blockTypeId, x, y, z) {
            // Rebuild this mesh from scratch (simple, correct for edit-time volumes)
            this._rebuildMesh(blockTypeId);
        }

        _rebuildMesh(blockTypeId) {
            const im = this._meshes.get(blockTypeId);
            if (!im) return;
            let idx = 0;
            const mat4 = new this._THREE.Matrix4();
            for (const [key, typeId] of this._voxels) {
                if (typeId !== blockTypeId) continue;
                const [x, y, z] = key.split(',').map(Number);
                mat4.setPosition(x + 0.5, y + 0.5, z + 0.5);
                im.setMatrixAt(idx++, mat4);
            }
            im.count = idx;
            im.instanceMatrix.needsUpdate = true;
        }

        /** Apply a batch of undo/redo changes */
        applyDiff(diffs) {
            const needRebuild = new Set();
            for (const d of diffs) {
                const k = this._key(d.x, d.y, d.z);
                if (d.next === null) {
                    this._voxels.delete(k);
                } else {
                    this._voxels.set(k, d.next);
                }
                if (d.prev) needRebuild.add(d.prev);
                if (d.next) needRebuild.add(d.next);
            }
            for (const bt of needRebuild) this._rebuildMesh(bt);
        }

        /** Change color of a block type at runtime */
        setBlockColor(blockTypeId, hexColor) {
            const im = this._meshes.get(blockTypeId);
            if (im) im.material.color.set(hexColor);
        }

        serialize() {
            const blocks = [];
            for (const [key, typeId] of this._voxels) {
                const [x, y, z] = key.split(',').map(Number);
                blocks.push([x, y, z, typeId]);
            }
            return { type: 'voxel', blocks };
        }

        deserialize(data) {
            this._voxels.clear();
            for (const bt of BLOCK_TYPES) this._rebuildMesh(bt.id);
            if (!data?.blocks) return;
            for (const [x, y, z, typeId] of data.blocks) {
                this._voxels.set(this._key(x, y, z), typeId);
            }
            for (const bt of BLOCK_TYPES) this._rebuildMesh(bt.id);
        }

        dispose() {
            this._blockGeo.dispose();
            for (const im of this._meshes.values()) im.material.dispose();
            this._scene.remove(this._group);
        }
    }

    // ── 4. LowPolyPainter ────────────────────────────────────────────────────
    class LowPolyPainter {
        /**
         * @param {THREE} THREE
         * @param {THREE.Raycaster} raycaster
         */
        constructor(THREE, raycaster) {
            this._THREE    = THREE;
            this._raycaster = raycaster;
            this._faceColors = null; // Float32Array of per-vertex r,g,b
        }

        /** Called when terrain mesh is rebuilt — must re-attach color attribute */
        attachTerrain(terrainMesh) {
            if (!terrainMesh) return;
            const geo = terrainMesh.geometry;
            const vCount = geo.attributes.position.count;
            if (!this._faceColors || this._faceColors.length !== vCount * 3) {
                this._faceColors = new Float32Array(vCount * 3).fill(1);
            }
            if (!geo.attributes.color) {
                geo.setAttribute('color',
                    new this._THREE.BufferAttribute(this._faceColors.slice(), 3));
                terrainMesh.material.vertexColors = true;
                terrainMesh.material.needsUpdate = true;
            } else {
                // Restore saved faceColors into existing attribute
                geo.attributes.color.array.set(this._faceColors);
                geo.attributes.color.needsUpdate = true;
            }
            this._terrainMesh = terrainMesh;
        }

        /**
         * Paint all faces within `radius` cells of the picked face.
         * @param {THREE.Intersection} hit raycast hit
         * @param {string} hexColor
         * @param {number} radius  face-count radius (1 = single face)
         * @returns {Array} [{faceIdx, prevR, prevG, prevB, r, g, b}]
         */
        paintAt(hit, hexColor, radius) {
            if (!this._terrainMesh) return [];
            const geo  = this._terrainMesh.geometry;
            const col  = geo.attributes.color;
            const c    = new this._THREE.Color(hexColor);
            const changes = [];

            // Determine face index of hit
            const hitFace = hit.face;
            if (!hitFace) return [];

            // For non-indexed geometry, faceIndex * 3 = first vertex
            // For indexed: need to work with index buffer
            const index = geo.index;
            const pos   = geo.attributes.position;

            // Collect all candidate face centers, find those within radius
            const hitCenter = new this._THREE.Vector3()
                .add(pos.getX ? new this._THREE.Vector3() : new this._THREE.Vector3());

            // Get hit face center
            const hfCenter = new this._THREE.Vector3();
            if (index) {
                const a = index.getX(hitFace.a);
                const b = index.getX(hitFace.b ?? hitFace.a + 1);
                const c2 = index.getX(hitFace.c ?? hitFace.a + 2);
                hfCenter.set(
                    (pos.getX(a) + pos.getX(b) + pos.getX(c2)) / 3,
                    (pos.getY(a) + pos.getY(b) + pos.getY(c2)) / 3,
                    (pos.getZ(a) + pos.getZ(b) + pos.getZ(c2)) / 3
                );
            } else {
                const a = hitFace.a, b = hitFace.b, cv = hitFace.c;
                hfCenter.set(
                    (pos.getX(a) + pos.getX(b) + pos.getX(cv)) / 3,
                    (pos.getY(a) + pos.getY(b) + pos.getY(cv)) / 3,
                    (pos.getZ(a) + pos.getZ(b) + pos.getZ(cv)) / 3
                );
            }

            const faceCount = index
                ? Math.floor(index.count / 3)
                : Math.floor(pos.count / 3);
            const radiusSq = radius * radius;

            for (let fi = 0; fi < faceCount; fi++) {
                let ia, ib, ic;
                if (index) {
                    ia = index.getX(fi * 3);
                    ib = index.getX(fi * 3 + 1);
                    ic = index.getX(fi * 3 + 2);
                } else {
                    ia = fi * 3; ib = fi * 3 + 1; ic = fi * 3 + 2;
                }
                const fc = new this._THREE.Vector3(
                    (pos.getX(ia) + pos.getX(ib) + pos.getX(ic)) / 3,
                    (pos.getY(ia) + pos.getY(ib) + pos.getY(ic)) / 3,
                    (pos.getZ(ia) + pos.getZ(ib) + pos.getZ(ic)) / 3
                );
                const dx = fc.x - hfCenter.x, dz = fc.z - hfCenter.z;
                if (dx*dx + dz*dz > radiusSq) continue;

                // Record old + set new colors for all 3 vertices
                for (const vi of [ia, ib, ic]) {
                    changes.push({
                        vi,
                        prevR: col.getX(vi), prevG: col.getY(vi), prevB: col.getZ(vi),
                        r: c.r, g: c.g, b: c.b,
                    });
                    col.setXYZ(vi, c.r, c.g, c.b);
                }
            }
            col.needsUpdate = true;
            this._faceColors = col.array.slice();
            return changes;
        }

        /** Apply an undo/redo vertex-color diff */
        applyColorDiff(changes) {
            if (!this._terrainMesh) return;
            const col = this._terrainMesh.geometry.attributes.color;
            if (!col) return;
            for (const ch of changes) {
                col.setXYZ(ch.vi, ch.r, ch.g, ch.b);
            }
            col.needsUpdate = true;
            this._faceColors = col.array.slice();
        }

        /** Revert vertex-color diff (swap prev ↔ next) */
        revertColorDiff(changes) {
            if (!this._terrainMesh) return;
            const col = this._terrainMesh.geometry.attributes.color;
            if (!col) return;
            for (const ch of changes) {
                col.setXYZ(ch.vi, ch.prevR, ch.prevG, ch.prevB);
            }
            col.needsUpdate = true;
            this._faceColors = col.array.slice();
        }

        serialize() {
            if (!this._faceColors) return { type: 'lowpoly', faceColors: [] };
            return {
                type: 'lowpoly',
                faceColors: Array.from(this._faceColors).map(v => Math.round(v * 255)),
            };
        }

        deserialize(data) {
            if (!data?.faceColors?.length) return;
            this._faceColors = new Float32Array(data.faceColors.map(v => v / 255));
            if (this._terrainMesh) {
                const col = this._terrainMesh.geometry.attributes.color;
                if (col) {
                    col.array.set(this._faceColors);
                    col.needsUpdate = true;
                }
            }
        }
    }

    // ── 5. TerrainToolsPlugin ─────────────────────────────────────────────────
    class TerrainToolsPlugin {
        constructor(editor) {
            this._ed      = editor;
            this._THREE   = editor.THREE;
            this._state   = editor.state;
            this._scene   = editor.scene;

            this.terrainMode  = 'voxel';    // 'voxel' | 'lowpoly'
            this.activeBlock  = 'grass';    // current block type for voxel
            this.stampSize    = 1;          // 1|3|5
            this.lpRadius     = 1;          // low-poly paint radius
            this.palette256   = [...DEFAULT_256_PALETTE];
            this.activePalIdx = 0;          // selected index in 256 palette

            // History
            this._history     = [];         // ops: { type, ... }
            this._histIdx     = -1;
            this._MAX_HIST    = 50;

            // Painters
            this.voxel  = new VoxelTerrainPainter(this._THREE, this._scene);
            this.lp     = new LowPolyPainter(this._THREE, null);

            // Raycaster for low-poly face picking
            this._raycaster = new this._THREE.Raycaster();
            this._mouse     = new this._THREE.Vector2();

            this._buildUI();
            this._bindKeys();
        }

        // ── 5a. UI wiring ────────────────────────────────────────────────────
        _buildUI() {
            // Terrain mode toggle
            document.querySelectorAll('[data-tmode]').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('[data-tmode]').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.terrainMode = btn.dataset.tmode;
                    document.getElementById('voxel-section').style.display =
                        this.terrainMode === 'voxel' ? '' : 'none';
                    document.getElementById('lowpoly-section').style.display =
                        this.terrainMode === 'lowpoly' ? '' : 'none';
                    if (this.terrainMode === 'lowpoly') {
                        this.lp.attachTerrain(this._ed.getTerrainMesh());
                    }
                });
            });

            // Block type grid
            this._buildBlockGrid();

            // Stamp size buttons
            document.querySelectorAll('[data-stamp]').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('[data-stamp]').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.stampSize = parseInt(btn.dataset.stamp, 10);
                });
            });

            // Low-poly radius slider
            const lpSlider = document.getElementById('lp-radius');
            if (lpSlider) {
                lpSlider.addEventListener('input', e => {
                    this.lpRadius = parseInt(e.target.value, 10);
                    document.getElementById('lp-radius-val').textContent = this.lpRadius;
                });
            }

            // 256-color palette grid
            this._build256Grid();

            // Palette color picker
            document.getElementById('pal-color-picker')?.addEventListener('input', e => {
                this.palette256[this.activePalIdx] = e.target.value;
                this._refresh256Cell(this.activePalIdx);
                this._updateActiveSwatch();
            });
            document.getElementById('pal-set-btn')?.addEventListener('click', () => {
                const c = document.getElementById('pal-color-picker').value;
                this.palette256[this.activePalIdx] = c;
                this._refresh256Cell(this.activePalIdx);
                this._updateActiveSwatch();
            });

            // Save/load palette buttons
            document.getElementById('pal-save-btn')?.addEventListener('click', () => this._savePalette());
            document.getElementById('pal-load-btn')?.addEventListener('click', () => this._loadPalette());
        }

        _buildBlockGrid() {
            const grid = document.getElementById('block-type-grid');
            if (!grid) return;
            grid.innerHTML = '';
            for (const bt of BLOCK_TYPES) {
                const div = document.createElement('div');
                div.className = 'block-type-cell' + (bt.id === this.activeBlock ? ' active' : '');
                div.dataset.blockType = bt.id;
                div.innerHTML = `<span class="block-dot" style="background:${bt.color}"></span>${bt.label}`;
                div.title = bt.id;
                div.addEventListener('click', () => {
                    document.querySelectorAll('[data-block-type]').forEach(c => c.classList.remove('active'));
                    div.classList.add('active');
                    this.activeBlock = bt.id;
                });
                grid.appendChild(div);
            }
        }

        _build256Grid() {
            const grid = document.getElementById('pal256-grid');
            if (!grid) return;
            grid.innerHTML = '';
            this.palette256.forEach((color, idx) => {
                const cell = document.createElement('div');
                cell.className = 'pal256-cell' + (idx === this.activePalIdx ? ' active' : '');
                cell.style.background = color;
                cell.dataset.palIdx = idx;
                cell.title = color;
                cell.addEventListener('click', () => {
                    this.activePalIdx = idx;
                    document.querySelectorAll('.pal256-cell').forEach(c => c.classList.remove('active'));
                    cell.classList.add('active');
                    this._updateActiveSwatch();
                });
                grid.appendChild(cell);
            });
        }

        _refresh256Cell(idx) {
            const cell = document.querySelector(`.pal256-cell[data-pal-idx="${idx}"]`);
            if (cell) cell.style.background = this.palette256[idx];
        }

        _updateActiveSwatch() {
            const color = this.palette256[this.activePalIdx];
            const swatch = document.getElementById('pal-active-swatch');
            if (swatch) swatch.style.background = color;
            const picker = document.getElementById('pal-color-picker');
            if (picker) picker.value = color;
        }

        // ── 5b. Palette save/load ────────────────────────────────────────────
        async _savePalette() {
            const { projectName, setStatus } = this._ed;
            const pn = this._state.projectName;
            if (!pn) { this._ed.setStatus('No project — cannot save palette.'); return; }
            try {
                const res = await fetch('/api/project-file', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        project: pn,
                        path:    'data/terrain.pal.json',
                        content: JSON.stringify({ colors: this.palette256 }, null, 2),
                    }),
                });
                this._ed.setStatus(res.ok ? 'Palette saved to data/terrain.pal.json' : 'Palette save failed: ' + res.status, !res.ok);
            } catch (e) {
                this._ed.setStatus('Palette save error: ' + e.message, true);
            }
        }

        async _loadPalette() {
            const pn = this._state.projectName;
            if (!pn) { this._ed.setStatus('No project — cannot load palette.'); return; }
            try {
                const res = await fetch(`/projects/${encodeURIComponent(pn)}/data/terrain.pal.json`);
                if (!res.ok) throw new Error(res.status);
                const data = await res.json();
                if (Array.isArray(data.colors) && data.colors.length >= 16) {
                    this.palette256 = data.colors.slice(0, 256);
                    while (this.palette256.length < 256) this.palette256.push('#000000');
                    this._build256Grid();
                    this._updateActiveSwatch();
                    this._ed.setStatus('Palette loaded.');
                }
            } catch (e) {
                this._ed.setStatus('Palette load error: ' + e.message, true);
            }
        }

        // ── 5c. Mouse event handlers (called by editor) ──────────────────────
        /** Called by editor on mousemove when tool=paint|height */
        onMouseMove(event, worldPos) {
            // Update cursor scale to match stamp size
            const s = this.stampSize;
            if (this._ed.cursorMesh) {
                this._ed.cursorMesh.scale.set(s, 1, s);
            }
        }

        /** Called by editor on mouseup when tool=paint|height */
        onCanvasClick(event, worldPos, tool) {
            if (this.terrainMode === 'voxel') {
                this._handleVoxelClick(event, worldPos, tool);
            } else {
                this._handleLowPolyClick(event, tool);
            }
        }

        _handleVoxelClick(event, worldPos, tool) {
            const layers = parseInt(document.getElementById('voxel-layers')?.value ?? '1', 10);
            const yBase  = parseInt(document.getElementById('voxel-ybase')?.value  ?? '0', 10);
            const isErase = tool === 'height' && event.altKey;  // Alt+click to erase in paint mode
            const isRightErase = event.button === 2;

            if (isErase || isRightErase) {
                const erased = this.voxel.eraseStamp(worldPos.x, worldPos.z, this.stampSize, layers, yBase);
                if (erased.length) {
                    this._push({ type: 'VOXEL_ERASE', erased });
                    this._ed.markDirty();
                    this._syncLevelVoxels();
                }
            } else {
                const placed = this.voxel.placeStamp(
                    worldPos.x, worldPos.z, this.activeBlock, this.stampSize, layers, yBase
                );
                if (placed.length) {
                    this._push({ type: 'VOXEL_PLACE', placed });
                    this._ed.markDirty();
                    this._syncLevelVoxels();
                }
            }
        }

        _handleLowPolyClick(event, tool) {
            const tm = this._ed.getTerrainMesh();
            if (!tm) return;
            this.lp.attachTerrain(tm);

            // Perform raycast against terrain mesh
            const canvas = document.getElementById('three-canvas');
            const rect   = canvas.getBoundingClientRect();
            this._mouse.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
            this._mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
            this._raycaster.setFromCamera(this._mouse, this._ed.camera);
            const hits = this._raycaster.intersectObject(tm, false);
            if (!hits.length) return;

            const color = this.palette256[this.activePalIdx] ?? '#4db6ac';
            const changes = this.lp.paintAt(hits[0], color, this.lpRadius);
            if (changes.length) {
                this._push({ type: 'LOWPOLY_PAINT', changes });
                this._ed.markDirty();
                this._syncLevelLowpoly();
            }
        }

        // ── 5d. Undo/redo (50-op max) ────────────────────────────────────────
        _push(op) {
            // Truncate future if we branched
            if (this._histIdx < this._history.length - 1) {
                this._history.splice(this._histIdx + 1);
            }
            this._history.push(op);
            if (this._history.length > this._MAX_HIST) this._history.shift();
            else this._histIdx++;
        }

        undoTerrain() {
            if (this._histIdx < 0) return false;
            const op = this._history[this._histIdx--];
            if (op.type === 'VOXEL_PLACE') {
                // Revert: for each placed block restore prev (or remove)
                const revDiffs = op.placed.map(d => ({
                    x: d.x, y: d.y, z: d.z, next: d.prev,
                }));
                this.voxel.applyDiff(revDiffs);
                this._syncLevelVoxels();
            } else if (op.type === 'VOXEL_ERASE') {
                // Restore erased blocks
                const revDiffs = op.erased.map(d => ({
                    x: d.x, y: d.y, z: d.z, next: d.prev,
                }));
                this.voxel.applyDiff(revDiffs);
                this._syncLevelVoxels();
            } else if (op.type === 'LOWPOLY_PAINT') {
                this.lp.revertColorDiff(op.changes);
                this._syncLevelLowpoly();
            }
            this._ed.markDirty();
            return true;
        }

        redoTerrain() {
            if (this._histIdx >= this._history.length - 1) return false;
            const op = this._history[++this._histIdx];
            if (op.type === 'VOXEL_PLACE') {
                const fwDiffs = op.placed.map(d => ({
                    x: d.x, y: d.y, z: d.z, next: d.next,
                }));
                this.voxel.applyDiff(fwDiffs);
                this._syncLevelVoxels();
            } else if (op.type === 'VOXEL_ERASE') {
                const fwDiffs = op.erased.map(d => ({
                    x: d.x, y: d.y, z: d.z, next: null,
                }));
                this.voxel.applyDiff(fwDiffs);
                this._syncLevelVoxels();
            } else if (op.type === 'LOWPOLY_PAINT') {
                this.lp.applyColorDiff(op.changes);
                this._syncLevelLowpoly();
            }
            this._ed.markDirty();
            return true;
        }

        // ── 5e. Level sync ───────────────────────────────────────────────────
        _syncLevelVoxels() {
            this._ed.state.level.terrain = {
                ...this._ed.state.level.terrain,
                ...this.voxel.serialize(),
            };
        }

        _syncLevelLowpoly() {
            this._ed.state.level.terrain = {
                ...this._ed.state.level.terrain,
                ...this.lp.serialize(),
            };
        }

        // ── 5f. Keyboard shortcuts ───────────────────────────────────────────
        _bindKeys() {
            document.addEventListener('keydown', e => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
                if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                    if (this._histIdx >= 0) {
                        e.stopImmediatePropagation();
                        e.preventDefault();
                        this.undoTerrain();
                        this._ed.setStatus('Terrain undo');
                    }
                }
                if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                    if (this._histIdx < this._history.length - 1) {
                        e.stopImmediatePropagation();
                        e.preventDefault();
                        this.redoTerrain();
                        this._ed.setStatus('Terrain redo');
                    }
                }
                // Block type hotkeys 1-9,0
                if (!e.ctrlKey && !e.metaKey && e.key >= '1' && e.key <= '9') {
                    const idx = parseInt(e.key, 10) - 1;
                    if (idx < BLOCK_TYPES.length) {
                        this.activeBlock = BLOCK_TYPES[idx].id;
                        document.querySelectorAll('[data-block-type]').forEach(c => {
                            c.classList.toggle('active', c.dataset.blockType === this.activeBlock);
                        });
                    }
                }
                if (!e.ctrlKey && !e.metaKey && e.key === '0') {
                    const idx = 9;
                    if (idx < BLOCK_TYPES.length) {
                        this.activeBlock = BLOCK_TYPES[idx].id;
                        document.querySelectorAll('[data-block-type]').forEach(c => {
                            c.classList.toggle('active', c.dataset.blockType === this.activeBlock);
                        });
                    }
                }
            }, { capture: true });
        }

        // ── 5g. Deserialize terrain from loaded level ────────────────────────
        loadTerrainData(terrainData) {
            if (!terrainData) return;
            if (terrainData.type === 'voxel') {
                this.voxel.deserialize(terrainData);
            } else if (terrainData.type === 'lowpoly') {
                this.lp.attachTerrain(this._ed.getTerrainMesh());
                this.lp.deserialize(terrainData);
            }
        }

        dispose() {
            this.voxel.dispose();
        }
    }

    // ── 6. Auto-install ───────────────────────────────────────────────────────
    function install() {
        const ed = window.__topdown3dEditor;
        if (!ed || !ed.THREE) {
            // Editor IIFE hasn't finished yet — retry
            setTimeout(install, 100);
            return;
        }

        const plugin = new TerrainToolsPlugin(ed);
        window.__topdown3dTerrainTools = plugin;

        // Patch editor's applyLevelJSON to also hydrate terrain tools
        const origApply = ed.applyLevelJSON;
        ed.applyLevelJSON = function (json) {
            origApply(json);
            if (json.terrain) plugin.loadTerrainData(json.terrain);
        };

        // Expose for debugging
        window.__topdown3dTerrainTools = plugin;
        window.__blockTypes = BLOCK_TYPES;
        window.__defaultPalette256 = DEFAULT_256_PALETTE;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(install, 200));
    } else {
        setTimeout(install, 200);
    }

})();
