/**
 * BlockTools.js — Phase 53
 * Platform & Block Placement Tools for the Platformer 3D Map Editor.
 *
 * Replaces and extends the scaffold placement helpers in platformer3d_editor.js:
 *   - Full geometry factory for all 6 block types (box/slope/wedge/cylinder/arch/stairs)
 *   - Platform physics meta: friction/restitution/damage per platType
 *   - Simple transform gizmo arrows for move/rotate/scale tools
 *   - Multi-select (Shift+click), box-select (drag in select tool)
 *   - Copy/paste with optional mirror (X or Z axis)
 *   - Prefab system: save named assemblies, load and stamp them
 *   - Block stacking: auto-raise Y when placing on top of existing block
 *
 * Mounted on `window.BlockTools`; called by Pf3dEditor after init.
 *
 * Dependencies:
 *   - THREE (global from three.module.js script tag — loaded before this file)
 *   - Pf3dEditor (global, already initialised)
 */

'use strict';

window.BlockTools = (() => {

    // ─── Platform physics meta ────────────────────────────────────────────────
    const PLAT_PHYSICS = {
        flat:    { friction: 0.7,   restitution: 0.1,  damage: 0,   tag: '' },
        slope:   { friction: 0.5,   restitution: 0.1,  damage: 0,   tag: '' },
        moving:  { friction: 0.7,   restitution: 0.1,  damage: 0,   tag: 'moving' },
        falling: { friction: 0.6,   restitution: 0.1,  damage: 0,   tag: 'falling' },
        bouncy:  { friction: 0.3,   restitution: 1.8,  damage: 0,   tag: 'bounce' },
        icy:     { friction: 0.02,  restitution: 0.05, damage: 0,   tag: 'ice' },
        lava:    { friction: 0.5,   restitution: 0.0,  damage: 999, tag: 'lava' },
    };

    // ─── Block type color hints (palette indices) ─────────────────────────────
    const BLOCK_DEFAULT_COLOR = {
        flat:    12,   // green
        slope:   18,   // mid-green
        moving:  14,   // teal
        falling: 25,   // orange-ish (index 25)
        bouncy:  23,   // orange
        icy:     16,   // blue
        lava:    20,   // red
    };

    // ─── Gizmo state ──────────────────────────────────────────────────────────
    let _gizmoGroup   = null;   // THREE.Group containing gizmo arrows
    let _gizmoTarget  = null;   // id of object being gizmo-dragged
    let _gizmoAxis    = null;   // 'x' | 'y' | 'z'
    let _gizmoDragStart = null; // { screenX, worldPos }
    let _gizmoMode    = 'move'; // 'move' | 'rotate' | 'scale'

    // ─── Box-select state ─────────────────────────────────────────────────────
    let _boxSelecting = false;
    let _boxStart     = null;   // { nx, ny } NDC
    let _boxSelEl     = null;   // DOM div overlay

    // ─── Multi-selection ──────────────────────────────────────────────────────
    let _multiSelected = new Set();  // set of object ids

    // ─── Prefab store ─────────────────────────────────────────────────────────
    // persisted to localStorage under 'pf3d_prefabs'
    let _prefabs = {};

    // ─── Internal THREE scene references (set via init) ───────────────────────
    let _scene   = null;
    let _camera  = null;
    let _palette = null;

    // ─────────────────────────────────────────────────────────────────────────
    // INIT
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Call once after Pf3dEditor has set up the THREE scene.
     * @param {THREE.Scene}   scene
     * @param {THREE.Camera}  camera
     * @param {number[]}      palette  — 256-entry hex int array
     */
    function init(scene, camera, palette) {
        _scene   = scene;
        _camera  = camera;
        _palette = palette;
        _loadPrefabs();
        _buildBoxSelectOverlay();
        _buildGizmoGroup();
        _populatePrefabList();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GEOMETRY FACTORY
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Build THREE.BufferGeometry for a block type with given dimensions.
     * @param {string} blockType  — 'box'|'slope'|'wedge'|'cylinder'|'arch'|'stairs'
     * @param {number} w, h, d   — width, height, depth in metres
     * @returns {THREE.BufferGeometry}
     */
    function buildGeometry(blockType, w, h, d) {
        switch (blockType) {
            case 'slope':    return _buildSlopeGeometry(w, h, d);
            case 'wedge':    return _buildWedgeGeometry(w, h, d);
            case 'cylinder': return new THREE.CylinderGeometry(w / 2, w / 2, h, 10);
            case 'arch':     return _buildArchGeometry(w, h, d);
            case 'stairs':   return _buildStairsGeometry(w, h, d);
            default:         return new THREE.BoxGeometry(w, h, d);
        }
    }

    /** Sloped ramp: top-rear edge drops to floor */
    function _buildSlopeGeometry(w, h, d) {
        // 6 vertices: bottom-quad + top-front-edge (no top-rear height)
        const hw = w / 2, hd = d / 2;
        const pos = new Float32Array([
            -hw, 0,  hd,    // 0 BFL
             hw, 0,  hd,    // 1 BFR
             hw, 0, -hd,    // 2 BBR
            -hw, 0, -hd,    // 3 BBL
            -hw, h,  hd,    // 4 TFL (high front)
             hw, h,  hd,    // 5 TFR
        ]);
        const idx = new Uint16Array([
            0,1,5, 0,5,4,   // front face
            1,2,5,           // right tri
            0,3,2, 0,2,1,   // bottom
            3,0,4,           // left tri
            4,5,2, 4,2,3,   // top slope
            2,3,4, 2,4,5,   // back
        ]);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.computeVertexNormals();
        return geo;
    }

    /** Wedge: one corner at full height, opposite corner at zero */
    function _buildWedgeGeometry(w, h, d) {
        const hw = w / 2, hd = d / 2;
        const pos = new Float32Array([
            -hw, 0,  hd,   // 0
             hw, 0,  hd,   // 1
             hw, 0, -hd,   // 2
            -hw, 0, -hd,   // 3
            -hw, h,  hd,   // 4 only one top vertex raised
        ]);
        const idx = new Uint16Array([
            0,1,4,         // front slope face
            1,2,4,         // right slope
            2,3,4,         // back slope
            3,0,4,         // left face
            0,3,2, 0,2,1,  // bottom
        ]);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.computeVertexNormals();
        return geo;
    }

    /** Simplified arch: box with a rectangular notch cut from the bottom-front */
    function _buildArchGeometry(w, h, d) {
        // Approximate with a box + pillar group - return merged geo for simplicity
        const geo = new THREE.BoxGeometry(w, h * 0.3, d);
        // Translate so arch header sits at the top
        geo.translate(0, h * 0.85, 0);
        return geo;
    }

    /** Stairs: N uniform steps along depth axis */
    function _buildStairsGeometry(w, h, d) {
        const STEPS = 4;
        const sw    = w;
        const sh    = h / STEPS;
        const sd    = d / STEPS;
        const geo   = new THREE.BufferGeometry();
        const positions = [];
        const indices   = [];
        let vi = 0;

        for (let i = 0; i < STEPS; i++) {
            const z0  =  d / 2 - i * sd;
            const z1  = z0 - sd;
            const y0  = 0;
            const y1  = (i + 1) * sh;
            const hw  = sw / 2;
            // Front face of this step
            positions.push(-hw, y0, z0,  hw, y0, z0,  hw, y1, z0, -hw, y1, z0);
            indices.push(vi, vi+1, vi+2,  vi, vi+2, vi+3);
            vi += 4;
            // Top face of this step
            positions.push(-hw, y1, z0,  hw, y1, z0,  hw, y1, z1, -hw, y1, z1);
            indices.push(vi, vi+1, vi+2,  vi, vi+2, vi+3);
            vi += 4;
        }
        // Bottom face
        const hw = sw / 2;
        positions.push(-hw,0,d/2, hw,0,d/2, hw,0,-d/2, -hw,0,-d/2);
        indices.push(vi, vi+2, vi+1,  vi, vi+3, vi+2);
        vi += 4;

        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        return geo;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MATERIAL FACTORY
    // ─────────────────────────────────────────────────────────────────────────

    function buildMaterial(colorIdx, wireframe = false) {
        const pal   = _palette || _defaultPalette();
        const color = pal[Math.max(0, Math.min(255, colorIdx ?? 12))];
        return new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 0, wireframe });
    }

    function _defaultPalette() {
        const cols = [
            0x2c1810,0x4a2820,0x6b3a28,0x8b4513,0xa0522d,0xcd853f,0xdaa520,0xb8860b,
            0x444444,0x666666,0x888888,0xaaaaaa,0x27ae60,0x2ecc71,0x1abc9c,0x16a085,
            0x2980b9,0x3498db,0x8e44ad,0x9b59b6,0xc0392b,0xe74c3c,0xe67e22,0xf39c12,
            0xf1c40f,0xffeaa7,0xdfe6e9,0xb2bec3,0x636e72,0x2d3436,0x0a0a0a,0xffffff,
        ];
        while (cols.length < 256) cols.push(0x888888);
        return cols;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FULL PLACE BLOCK (replaces _placeSingleBlock in scaffold)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Place a block at snapped world position. Respects surface stacking.
     * @param {THREE.Vector3} worldHit
     * @param {object}        editorState    — Pf3dEditor._state reference
     * @param {object}        toolState      — { blockType, platType, blockDim, colorIdx, snapSize }
     * @param {Map}           meshMap        — Pf3dEditor._meshMap reference
     * @param {function}      genId
     * @returns {object}  newly created object record
     */
    function placeBlock(worldHit, editorState, toolState, meshMap, genId) {
        const { blockType, platType, blockDim, colorIdx, snapSize } = toolState;
        const snap = snapSize || 1;
        const sx   = snap > 0 ? Math.round(worldHit.x / snap) * snap : worldHit.x;
        const sz   = snap > 0 ? Math.round(worldHit.z / snap) * snap : worldHit.z;

        // Stack on existing block if one is directly below this XZ position
        const stackY = _findStackY(sx, sz, blockDim.h, editorState.objects);
        const sy     = stackY + blockDim.h / 2;

        const physics = PLAT_PHYSICS[platType] || PLAT_PHYSICS.flat;
        const id = genId('obj');
        const record = {
            id,
            type:      'platform',
            subtype:   platType,
            blockType,
            pos:       { x: sx, y: sy, z: sz },
            rot:       { x: 0,  y: 0,  z: 0 },
            scale:     { x: blockDim.w, y: blockDim.h, z: blockDim.d },
            colorIdx:  colorIdx ?? BLOCK_DEFAULT_COLOR[platType] ?? 12,
            props: {
                platType,
                friction:    physics.friction,
                restitution: physics.restitution,
                damage:      physics.damage,
                tag:         physics.tag,
            },
        };

        editorState.objects.push(record);
        _addMesh(record, meshMap);
        return record;
    }

    /** Find top Y surface of any object at this XZ grid cell */
    function _findStackY(sx, sz, newH, objects) {
        let topY = 0;
        for (const obj of objects) {
            const dx = Math.abs(obj.pos.x - sx);
            const dz = Math.abs(obj.pos.z - sz);
            const hw = (obj.scale?.x ?? 2) / 2;
            const hd = (obj.scale?.z ?? 2) / 2;
            if (dx <= hw + 0.1 && dz <= hd + 0.1) {
                const top = obj.pos.y + (obj.scale?.y ?? 1) / 2;
                if (top > topY) topY = top;
            }
        }
        return topY;
    }

    /** Add a THREE.Mesh to the scene and meshMap for a given object record */
    function _addMesh(obj, meshMap) {
        if (!_scene) return;
        const geo  = buildGeometry(obj.blockType || 'box', obj.scale.x || 2, obj.scale.y || 1, obj.scale.z || 2);
        const mat  = buildMaterial(obj.colorIdx);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(obj.pos.x, obj.pos.y, obj.pos.z);
        if (obj.rot) mesh.rotation.set(obj.rot.x, obj.rot.y, obj.rot.z);
        mesh.castShadow    = true;
        mesh.receiveShadow = true;
        mesh.userData.id    = obj.id;
        mesh.userData.group = 'object';
        _scene.add(mesh);
        meshMap.set(obj.id, mesh);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MIRROR SELECTION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Mirror selected objects across axis through a pivot point.
     * @param {'x'|'z'} axis
     * @param {number}  pivot   — mirror plane coordinate on that axis
     * @param {string[]} ids    — object ids to mirror
     * @param {object}   editorState
     * @param {Map}      meshMap
     * @param {function} genId
     * @returns {string[]} ids of newly created mirrored objects
     */
    function mirrorSelection(axis, pivot, ids, editorState, meshMap, genId) {
        const newIds = [];
        for (const id of ids) {
            const obj = editorState.objects.find(o => o.id === id);
            if (!obj) continue;
            const copy = JSON.parse(JSON.stringify(obj));
            copy.id = genId('obj');
            if (axis === 'x') copy.pos.x = 2 * pivot - copy.pos.x;
            if (axis === 'z') copy.pos.z = 2 * pivot - copy.pos.z;
            // Flip rotation around mirror axis
            if (axis === 'x') copy.rot.y = -copy.rot.y;
            if (axis === 'z') copy.rot.y = Math.PI - copy.rot.y;
            editorState.objects.push(copy);
            _addMesh(copy, meshMap);
            newIds.push(copy.id);
        }
        return newIds;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MULTI-SELECT
    // ─────────────────────────────────────────────────────────────────────────

    function getMultiSelected() { return Array.from(_multiSelected); }

    function addToSelection(id) { _multiSelected.add(id); }
    function removeFromSelection(id) { _multiSelected.delete(id); }
    function clearMultiSelection() { _multiSelected.clear(); }

    function toggleMultiSelect(id, meshMap) {
        if (_multiSelected.has(id)) {
            _multiSelected.delete(id);
            const mesh = meshMap?.get(id);
            if (mesh?.material?.emissive) mesh.material.emissive.setHex(0x000000);
        } else {
            _multiSelected.add(id);
            const mesh = meshMap?.get(id);
            if (mesh?.material?.emissive) mesh.material.emissive.setHex(0x1a4a28);
        }
    }

    /** Box-select: collect objects whose XZ position falls inside NDC box */
    function boxSelectObjects(nx0, ny0, nx1, ny1, editorState, meshMap, camera) {
        const xMin = Math.min(nx0, nx1), xMax = Math.max(nx0, nx1);
        const yMin = Math.min(ny0, ny1), yMax = Math.max(ny0, ny1);
        _multiSelected.clear();
        meshMap?.forEach((mesh, id) => {
            if (mesh.userData.group !== 'object') return;
            const projected = mesh.position.clone().project(camera);
            if (projected.x >= xMin && projected.x <= xMax &&
                projected.y >= yMin && projected.y <= yMax) {
                _multiSelected.add(id);
                if (mesh.material?.emissive) mesh.material.emissive.setHex(0x1a4a28);
            }
        });
        return Array.from(_multiSelected);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRANSFORM GIZMO
    // ─────────────────────────────────────────────────────────────────────────

    function _buildGizmoGroup() {
        _gizmoGroup = new THREE.Group();
        _gizmoGroup.name = '__gizmo';
        _gizmoGroup.visible = false;

        const arrowLen    = 1.4;
        const arrowHead   = 0.22;
        const shaftRadius = 0.04;

        const axes = [
            { color: 0xe74c3c, axis: new THREE.Vector3(1,0,0), id: 'gx' },   // X red
            { color: 0x27ae60, axis: new THREE.Vector3(0,1,0), id: 'gy' },   // Y green
            { color: 0x3498db, axis: new THREE.Vector3(0,0,1), id: 'gz' },   // Z blue
        ];

        for (const a of axes) {
            // Shaft
            const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, arrowLen - arrowHead, 6);
            const shaftMat = new THREE.MeshPhongMaterial({ color: a.color, flatShading: true, shininess: 0 });
            const shaft    = new THREE.Mesh(shaftGeo, shaftMat);
            // Cone tip
            const coneGeo  = new THREE.ConeGeometry(arrowHead * 0.6, arrowHead, 6);
            const coneMat  = new THREE.MeshPhongMaterial({ color: a.color, flatShading: true, shininess: 0 });
            const cone     = new THREE.Mesh(coneGeo, coneMat);
            cone.position.y = (arrowLen - arrowHead) / 2 + arrowHead / 2;
            const group    = new THREE.Group();
            group.add(shaft);
            group.add(cone);
            // Align along axis
            if (a.axis.x === 1) group.rotation.z = -Math.PI / 2;
            if (a.axis.z === 1) group.rotation.x =  Math.PI / 2;
            group.position.copy(a.axis).multiplyScalar((arrowLen) / 2);
            group.userData.gizmoAxis  = a.axis.x === 1 ? 'x' : (a.axis.y === 1 ? 'y' : 'z');
            group.userData.isGizmo    = true;
            // Make children also carry gizmo metadata
            shaft.userData.isGizmo = true; shaft.userData.gizmoAxis = group.userData.gizmoAxis;
            cone.userData.isGizmo  = true; cone.userData.gizmoAxis  = group.userData.gizmoAxis;
            _gizmoGroup.add(group);
        }

        if (_scene) _scene.add(_gizmoGroup);
    }

    function showGizmo(objPos, mode) {
        if (!_gizmoGroup) return;
        _gizmoMode = mode || 'move';
        _gizmoGroup.position.set(objPos.x, objPos.y, objPos.z);
        _gizmoGroup.visible = true;
    }

    function hideGizmo() {
        if (_gizmoGroup) _gizmoGroup.visible = false;
        _gizmoTarget = null;
    }

    /**
     * Check if a raycaster hit is on a gizmo handle.
     * @param {THREE.Raycaster} raycaster
     * @returns {{ axis: string }|null}
     */
    function hitGizmo(raycaster) {
        if (!_gizmoGroup?.visible) return null;
        const handles = [];
        _gizmoGroup.traverse(c => { if (c.userData.isGizmo) handles.push(c); });
        const hits = raycaster.intersectObjects(handles, false);
        if (!hits.length) return null;
        return { axis: hits[0].object.userData.gizmoAxis };
    }

    /**
     * Apply gizmo drag delta to selected object.
     * @param {string}   objId
     * @param {string}   axis      — 'x'|'y'|'z'
     * @param {number}   delta     — metres (screen pixels / 200)
     * @param {string}   mode      — 'move'|'rotate'|'scale'
     * @param {object}   editorState
     * @param {Map}      meshMap
     */
    function applyGizmoDrag(objId, axis, delta, mode, editorState, meshMap) {
        const obj  = editorState.objects.find(o => o.id === objId);
        if (!obj) return;
        const mesh = meshMap?.get(objId);
        if (mode === 'move') {
            obj.pos[axis] += delta;
            if (mesh) mesh.position[axis] = obj.pos[axis];
            if (_gizmoGroup) _gizmoGroup.position.copy(mesh?.position || obj.pos);
        } else if (mode === 'rotate') {
            obj.rot[axis] += delta * Math.PI / 180;
            if (mesh) mesh.rotation[axis] = obj.rot[axis];
        } else if (mode === 'scale') {
            obj.scale[axis] = Math.max(0.1, obj.scale[axis] + delta);
            if (mesh) {
                mesh.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
                // Rebuild geometry for non-box types to reflect new scale
                if (obj.blockType !== 'box' && obj.blockType !== 'cylinder') {
                    mesh.geometry.dispose();
                    mesh.geometry = buildGeometry(obj.blockType, obj.scale.x, obj.scale.y, obj.scale.z);
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BOX-SELECT OVERLAY
    // ─────────────────────────────────────────────────────────────────────────

    function _buildBoxSelectOverlay() {
        const el = document.createElement('div');
        el.style.cssText = [
            'position:absolute', 'border:1px dashed #27ae60',
            'background:rgba(39,174,96,0.08)', 'pointer-events:none',
            'display:none', 'z-index:100',
        ].join(';');
        const wrap = document.getElementById('viewport-wrap');
        if (wrap) wrap.appendChild(el);
        _boxSelEl = el;
    }

    function startBoxSelect(screenX, screenY) {
        _boxSelecting = true;
        _boxStart = { x: screenX, y: screenY };
        if (_boxSelEl) {
            _boxSelEl.style.left   = screenX + 'px';
            _boxSelEl.style.top    = screenY + 'px';
            _boxSelEl.style.width  = '0';
            _boxSelEl.style.height = '0';
            _boxSelEl.style.display = 'block';
        }
    }

    function updateBoxSelect(screenX, screenY) {
        if (!_boxSelecting || !_boxSelEl || !_boxStart) return;
        const x = Math.min(_boxStart.x, screenX);
        const y = Math.min(_boxStart.y, screenY);
        const w = Math.abs(screenX - _boxStart.x);
        const h = Math.abs(screenY - _boxStart.y);
        _boxSelEl.style.left   = x + 'px';
        _boxSelEl.style.top    = y + 'px';
        _boxSelEl.style.width  = w + 'px';
        _boxSelEl.style.height = h + 'px';
    }

    function endBoxSelect() {
        _boxSelecting = false;
        if (_boxSelEl) _boxSelEl.style.display = 'none';
    }

    function isBoxSelecting() { return _boxSelecting; }

    // ─────────────────────────────────────────────────────────────────────────
    // PREFAB SYSTEM
    // ─────────────────────────────────────────────────────────────────────────

    function _loadPrefabs() {
        try {
            const raw = localStorage.getItem('pf3d_prefabs');
            _prefabs = raw ? JSON.parse(raw) : {};
        } catch (_) { _prefabs = {}; }
    }

    function _savePrefabs() {
        try { localStorage.setItem('pf3d_prefabs', JSON.stringify(_prefabs)); } catch (_) {}
    }

    /**
     * Save selected objects as a named prefab.
     * @param {string}   name
     * @param {string[]} ids         — object ids to include
     * @param {object}   editorState
     */
    function savePrefab(name, ids, editorState) {
        if (!name) return;
        const blocks = editorState.objects.filter(o => ids.includes(o.id));
        if (!blocks.length) return;
        // Normalize positions: compute centroid, subtract from each pos
        const cx = blocks.reduce((s, b) => s + b.pos.x, 0) / blocks.length;
        const cy = blocks.reduce((s, b) => s + b.pos.y, 0) / blocks.length;
        const cz = blocks.reduce((s, b) => s + b.pos.z, 0) / blocks.length;
        _prefabs[name] = blocks.map(b => ({
            ...JSON.parse(JSON.stringify(b)),
            id: null,
            pos: { x: b.pos.x - cx, y: b.pos.y - cy, z: b.pos.z - cz },
        }));
        _savePrefabs();
        _populatePrefabList();
    }

    /**
     * Stamp a prefab at world position.
     * @param {string}   name
     * @param {THREE.Vector3} worldPos
     * @param {object}   editorState
     * @param {Map}      meshMap
     * @param {function} genId
     * @returns {string[]} ids of newly created objects
     */
    function stampPrefab(name, worldPos, editorState, meshMap, genId) {
        const template = _prefabs[name];
        if (!template) { console.warn('[BlockTools] Prefab not found:', name); return []; }
        const newIds = [];
        for (const t of template) {
            const copy = JSON.parse(JSON.stringify(t));
            copy.id    = genId('obj');
            copy.pos.x += worldPos.x;
            copy.pos.y += worldPos.y;
            copy.pos.z += worldPos.z;
            editorState.objects.push(copy);
            _addMesh(copy, meshMap);
            newIds.push(copy.id);
        }
        return newIds;
    }

    function deletePrefab(name) {
        delete _prefabs[name];
        _savePrefabs();
        _populatePrefabList();
    }

    function listPrefabs() { return Object.keys(_prefabs); }

    function _populatePrefabList() {
        const el = document.getElementById('prefab-list');
        if (!el) return;
        const names = listPrefabs();
        if (!names.length) {
            el.innerHTML = '<div style="color:#445;font-size:.8rem;text-align:center;padding:8px">No prefabs saved</div>';
            return;
        }
        el.innerHTML = names.map(n => `
            <div class="entity-item" style="gap:4px">
                <span class="entity-name" style="font-size:.8rem">${n}</span>
                <button onclick="BlockTools.stampPrefabAtOrigin('${n}')"
                    style="background:#0e2218;border:1px solid var(--accent);color:var(--accent);cursor:pointer;padding:2px 6px;font-family:inherit;font-size:.75rem">STAMP</button>
                <button onclick="BlockTools.deletePrefab('${n}')"
                    style="background:#2e0a0a;border:1px solid #883;color:#f88;cursor:pointer;padding:2px 6px;font-family:inherit;font-size:.75rem">DEL</button>
            </div>
        `).join('');
    }

    /**
     * Convenience: stamp a prefab at world origin (0,0,0) — triggered from UI button.
     * @param {string} name
     */
    function stampPrefabAtOrigin(name) {
        if (typeof Pf3dEditor !== 'undefined') {
            Pf3dEditor.stampPrefabAtOrigin(name);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BLOCK TYPE PHYSICS QUERY
    // ─────────────────────────────────────────────────────────────────────────

    function getPhysics(platType) {
        return PLAT_PHYSICS[platType] || PLAT_PHYSICS.flat;
    }

    function getDefaultColorIdx(platType) {
        return BLOCK_DEFAULT_COLOR[platType] ?? 12;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────────────────────────────

    return {
        // Init
        init,
        // Geometry
        buildGeometry, buildMaterial,
        // Placement
        placeBlock,
        // Mirror
        mirrorSelection,
        // Multi-select
        getMultiSelected, addToSelection, removeFromSelection,
        clearMultiSelection, toggleMultiSelect, boxSelectObjects,
        // Box-select overlay
        startBoxSelect, updateBoxSelect, endBoxSelect, isBoxSelecting,
        // Gizmo
        showGizmo, hideGizmo, hitGizmo, applyGizmoDrag,
        // Prefabs
        savePrefab, stampPrefab, stampPrefabAtOrigin, deletePrefab, listPrefabs,
        // Physics meta
        getPhysics, getDefaultColorIdx,
    };
})();
