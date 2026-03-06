/**
 * platformer3d_editor.js — Phase 52
 * Platformer 3D Map Editor — scaffold + 3D viewport with orbit camera, snap grid,
 * object placement, hierarchy panel, and property inspector.
 *
 * Architecture:
 *   - State: `_state` object holds objects[], entities[], scene settings
 *   - 3D Viewport: THREE.js perspective view; orbit (RMB drag), pan (MMB), zoom (wheel)
 *   - Snap grid: configurable 0.5 / 1 / 2 / 4 m; drawn as GridHelper
 *   - Hierarchy panel: live scene tree, click-to-select, visibility toggle
 *   - Properties panel: dynamic fields per selected object type
 *   - Undo/redo: snapshot diff command stack (max 50 entries)
 *   - Persistence: /api/levels3d/:project/:levelId  (GET / POST)
 *
 * Phase 52: scaffold + viewport + grid + hierarchy + properties.
 * Phase 53: BlockTools.js — full platform/block placement logic.
 * Phase 54: PathEditor3D.js — moving platform spline paths.
 * Phase 55: HazardEditor.js — hazard/trigger zone placement.
 * Phase 56: Export/Import MapExporter.
 */

'use strict';

const Pf3dEditor = (() => {

    // ── State ────────────────────────────────────────────────────────────────
    let _state = {
        levelId:   'level01',
        levelName: 'New Level',
        project:   '',
        snapSize:  1,
        showGrid:  true,
        wireframe: false,

        // Scene settings
        skyTop:    87,
        skyBottom: 23,
        ambient:   0.5,
        sunIntensity: 1.0,
        sunPos:    { x: 50, y: 80, z: 40 },
        fog:       { near: 30, far: 120 },
        deathY:    -20,

        // Level content
        objects:  [],    // { id, type, subtype, pos:{x,y,z}, rot:{x,y,z}, scale:{x,y,z}, colorIdx, props:{} }
        entities: [],    // { id, type, pos:{x,y,z}, props:{} }

        dirty: false,
    };

    // ── Tool / selection state ────────────────────────────────────────────────
    let _activeTool    = 'select';
    let _activeBlockType = 'box';
    let _activePlatType  = 'flat';
    let _activeEntity    = 'player-spawn';
    let _blockDim        = { w: 2, h: 1, d: 2 };
    let _blockColorIdx   = 12;

    let _selectedId    = null;   // id of selected object or entity
    let _selectedGroup = null;   // 'object' | 'entity' | null

    // ── Undo/redo ────────────────────────────────────────────────────────────
    const MAX_UNDO = 50;
    let _undoStack = [];
    let _redoStack = [];

    // ── THREE.js viewport globals ────────────────────────────────────────────
    let _renderer, _scene, _camera, _raycaster3, _gridHelper;
    let _rafId = null;

    // Orbit camera control state
    let _orbitCenter  = { x: 0, y: 0, z: 0 };
    let _orbitDist    = 30;
    let _orbitTheta   = Math.PI / 4;   // horizontal angle (rad)
    let _orbitPhi     = Math.PI / 3;   // vertical angle (rad)
    const ORB_MIN_PHI = 0.05;
    const ORB_MAX_PHI = Math.PI * 0.48;
    const ORB_MIN_DIST = 2;
    const ORB_MAX_DIST = 200;

    // Mouse drag state
    let _drag = { active: false, button: -1, startX: 0, startY: 0, curX: 0, curY: 0 };

    // Ghost cursor for placement
    let _ghostMesh = null;
    let _placementPlane = null; // THREE.Plane (y=0) for place-mode raycasts

    // Map of objectId → THREE.Mesh for selection/manipulation
    const _meshMap = new Map();

    // Palette stub (256 distinct low-poly colors)
    const PALETTE = _buildDefaultPalette();

    // ─────────────────────────────────────────────────────────────────────────
    // INIT
    // ─────────────────────────────────────────────────────────────────────────

    function init() {
        _initThree();
        _initEvents();
        _rebuildHierarchy();
        _updateStatusBar();
        _setStatus('Ready');

        // Try to load project from URL params (e.g. ?project=Foo&level=level01)
        const params = new URLSearchParams(window.location.search);
        const proj   = params.get('project');
        const lvl    = params.get('level');
        if (proj && lvl) {
            _state.project  = proj;
            _state.levelId  = lvl;
            loadLevel(null, proj, lvl);
        } else {
            _generateFloor();   // default floor plane for empty scene
            _rebuildScene3D();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // THREE.JS SETUP
    // ─────────────────────────────────────────────────────────────────────────

    function _initThree() {
        const canvas = document.getElementById('viewport-canvas');
        const wrap   = document.getElementById('viewport-wrap');

        _renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
        _renderer.shadowMap.enabled   = true;
        _renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
        _renderer.setPixelRatio(window.devicePixelRatio);
        _resizeRenderer();

        _scene = new THREE.Scene();
        _scene.background = new THREE.Color(0x0a1410);
        _scene.fog = new THREE.Fog(0x0a1410, _state.fog.near, _state.fog.far);

        // Camera
        _camera = new THREE.PerspectiveCamera(55, wrap.clientWidth / wrap.clientHeight, 0.1, 500);
        _updateOrbitCamera();

        // Lights
        const ambLight = new THREE.AmbientLight(0xffffff, _state.ambient);
        ambLight.name  = '__ambient';
        _scene.add(ambLight);

        const sun = new THREE.DirectionalLight(0xffffff, _state.sunIntensity);
        sun.name = '__sun';
        sun.position.set(_state.sunPos.x, _state.sunPos.y, _state.sunPos.z);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far  = 300;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -60;
        sun.shadow.camera.right = sun.shadow.camera.top   = 60;
        _scene.add(sun);

        // Grid
        _gridHelper = new THREE.GridHelper(100, 100, 0x1a2e20, 0x0d1a12);
        _gridHelper.visible = _state.showGrid;
        _scene.add(_gridHelper);

        // Placement plane (invisible, y=0)
        _placementPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        _raycaster3 = new THREE.Raycaster();

        // Ghost mesh (placement preview)
        _ghostMesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshPhongMaterial({ color: 0x27ae60, transparent: true, opacity: 0.55, flatShading: true })
        );
        _ghostMesh.visible = false;
        _scene.add(_ghostMesh);

        _startRenderLoop();

        // Wire BlockTools (Phase 53) after THREE scene is ready
        if (typeof BlockTools !== 'undefined') {
            BlockTools.init(_scene, _camera, PALETTE);
        }
        // Wire PathEditor3D (Phase 54)
        if (typeof PathEditor3D !== 'undefined') {
            PathEditor3D.init(_scene, _camera, _raycaster3, _state, _meshMap, _genId.bind(null, 'path'));
        }
        // Wire HazardEditor (Phase 55)
        if (typeof HazardEditor !== 'undefined') {
            HazardEditor.init(_scene, _camera, _raycaster3, _state, _meshMap, _genId.bind(null, 'haz'));
        }
    }

    function _resizeRenderer() {
        const wrap = document.getElementById('viewport-wrap');
        if (!wrap || !_renderer) return;
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        _renderer.setSize(w, h);
        if (_camera) _camera.aspect = w / h;
        if (_camera) _camera.updateProjectionMatrix();
    }

    function _startRenderLoop() {
        if (_rafId) return;
        let _lastTime = performance.now();
        const tick = () => {
            _rafId = requestAnimationFrame(tick);
            const now = performance.now();
            const dt  = Math.min((now - _lastTime) / 1000, 0.1);
            _lastTime = now;
            if (typeof PathEditor3D !== 'undefined') PathEditor3D.update(dt);
            if (typeof HazardEditor !== 'undefined') HazardEditor.update(dt);
            _renderer.render(_scene, _camera);
        };
        tick();
    }

    function _updateOrbitCamera() {
        const sinPhi = Math.sin(_orbitPhi);
        const cosPhi = Math.cos(_orbitPhi);
        _camera.position.set(
            _orbitCenter.x + _orbitDist * sinPhi * Math.sin(_orbitTheta),
            _orbitCenter.y + _orbitDist * cosPhi,
            _orbitCenter.z + _orbitDist * sinPhi * Math.cos(_orbitTheta)
        );
        _camera.lookAt(_orbitCenter.x, _orbitCenter.y, _orbitCenter.z);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EVENT HANDLING
    // ─────────────────────────────────────────────────────────────────────────

    function _initEvents() {
        const canvas = document.getElementById('viewport-canvas');
        const wrap   = document.getElementById('viewport-wrap');

        canvas.addEventListener('contextmenu', e => e.preventDefault());
        canvas.addEventListener('mousedown',   _onMouseDown);
        canvas.addEventListener('mousemove',   _onMouseMove);
        canvas.addEventListener('mouseup',     _onMouseUp);
        canvas.addEventListener('wheel',       _onWheel, { passive: false });

        window.addEventListener('resize',  () => { _resizeRenderer(); });
        window.addEventListener('keydown', _onKeyDown);
    }

    let _gizmoAxisDragging = null;  // active gizmo axis during drag

    function _onMouseDown(e) {
        e.preventDefault();
        _drag = { active: true, button: e.button, startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY };

        // Check gizmo hit on LMB for move/rotate/scale tools
        if (e.button === 0 && ['move','rotate','scale'].includes(_activeTool) && typeof BlockTools !== 'undefined') {
            const canvas = document.getElementById('viewport-canvas');
            const rect   = canvas.getBoundingClientRect();
            const nx     = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
            const ny     = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
            _raycaster3.setFromCamera({ x: nx, y: ny }, _camera);
            const hit = BlockTools.hitGizmo(_raycaster3);
            if (hit) { _gizmoAxisDragging = hit.axis; }
        }
    }

    function _onMouseMove(e) {
        const canvas = document.getElementById('viewport-canvas');
        const rect   = canvas.getBoundingClientRect();
        const nx     = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        const ny     = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

        // Update world cursor coords display
        _raycaster3.setFromCamera({ x: nx, y: ny }, _camera);
        const hit = new THREE.Vector3();
        _raycaster3.ray.intersectPlane(_placementPlane, hit);
        if (hit) {
            const snap = _state.snapSize;
            const sx = snap > 0 ? Math.round(hit.x / snap) * snap : hit.x;
            const sz = snap > 0 ? Math.round(hit.z / snap) * snap : hit.z;
            document.getElementById('tool-coords').textContent =
                `X: ${sx.toFixed(1)}  Y: ${hit.y.toFixed(1)}  Z: ${sz.toFixed(1)}`;

            // Update ghost mesh
            if (_activeTool === 'place' && _ghostMesh) {
                _ghostMesh.visible = true;
                _ghostMesh.position.set(sx, _blockDim.h / 2, sz);
                _ghostMesh.scale.set(_blockDim.w, _blockDim.h, _blockDim.d);
            } else if (_ghostMesh) {
                _ghostMesh.visible = false;
            }
            // PathEditor3D ghost waypoint
            if (typeof PathEditor3D !== 'undefined') PathEditor3D.handleMouseMove(nx, ny);
        }

        if (!_drag.active) return;
        const dx = e.clientX - _drag.curX;
        const dy = e.clientY - _drag.curY;
        _drag.curX = e.clientX;
        _drag.curY = e.clientY;

        if (_drag.button === 2) {
            // RMB → orbit
            _orbitTheta -= dx * 0.007;
            _orbitPhi    = Math.max(ORB_MIN_PHI, Math.min(ORB_MAX_PHI, _orbitPhi + dy * 0.007));
            _updateOrbitCamera();
        } else if (_drag.button === 1) {
            // MMB → pan
            const right   = new THREE.Vector3();
            const up      = new THREE.Vector3(0, 1, 0);
            right.crossVectors(_camera.getWorldDirection(new THREE.Vector3()), up).normalize();
            const panSpeed = _orbitDist * 0.0012;
            _orbitCenter.x -= right.x * dx * panSpeed;
            _orbitCenter.z -= right.z * dx * panSpeed;
            _orbitCenter.y += dy * panSpeed;
            _updateOrbitCamera();
        } else if (_drag.button === 0 && _gizmoAxisDragging && _selectedId && typeof BlockTools !== 'undefined') {
            // Gizmo drag → transform selected object
            const screenDelta = (_gizmoAxisDragging === 'y') ? -dy : dx;
            BlockTools.applyGizmoDrag(_selectedId, _gizmoAxisDragging, screenDelta / 200, _activeTool, _state, _meshMap);
            _markDirty();
        } else if (_drag.button === 0 && _activeTool === 'place') {
            // LMB drag with place tool → stamp blocks
            if (hit) _placeSingleBlock(hit);
        } else if (_drag.button === 0 && _activeTool === 'select' && typeof BlockTools !== 'undefined') {
            // Box select drag
            if (!BlockTools.isBoxSelecting() && (Math.abs(e.clientX - _drag.startX) + Math.abs(e.clientY - _drag.startY)) > 6) {
                BlockTools.startBoxSelect(e.clientX - document.getElementById('viewport-canvas').getBoundingClientRect().left,
                                          e.clientY - document.getElementById('viewport-canvas').getBoundingClientRect().top);
            }
            if (BlockTools.isBoxSelecting()) {
                BlockTools.updateBoxSelect(e.clientX - document.getElementById('viewport-canvas').getBoundingClientRect().left,
                                           e.clientY - document.getElementById('viewport-canvas').getBoundingClientRect().top);
            }
        }
    }

    function _onMouseUp(e) {
        if (!_drag.active) { _drag.active = false; return; }
        const moved = Math.abs(e.clientX - _drag.startX) + Math.abs(e.clientY - _drag.startY);

        // End gizmo drag
        if (_gizmoAxisDragging) { _gizmoAxisDragging = null; _drag.active = false; return; }

        // End box select
        if (typeof BlockTools !== 'undefined' && BlockTools.isBoxSelecting()) {
            const canvas = document.getElementById('viewport-canvas');
            const rect   = canvas.getBoundingClientRect();
            const nx0 = ((_drag.startX - rect.left) / rect.width)  * 2 - 1;
            const ny0 = -((_drag.startY - rect.top)  / rect.height) * 2 + 1;
            const nx1 = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
            const ny1 = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
            BlockTools.boxSelectObjects(nx0, ny0, nx1, ny1, _state, _meshMap, _camera);
            BlockTools.endBoxSelect();
            _drag.active = false;
            _rebuildHierarchy();
            return;
        }

        _drag.active = false;
        if (e.button !== 0 || moved > 4) return;  // ignore RMB/MMB and drags

        const canvas = document.getElementById('viewport-canvas');
        const rect   = canvas.getBoundingClientRect();
        const nx     = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        const ny     = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
        _raycaster3.setFromCamera({ x: nx, y: ny }, _camera);

        if (_activeTool === 'select') {
            // Shift-click → multi-select
            if (e.shiftKey && typeof BlockTools !== 'undefined') {
                _doMultiSelectClick(nx, ny);
            } else {
                _doSelectClick(nx, ny);
            }
        } else if (_activeTool === 'move' || _activeTool === 'rotate' || _activeTool === 'scale') {
            _doSelectClick(nx, ny);  // select first, then gizmo shows on next mousedown
        } else if (_activeTool === 'place') {
            const hit = new THREE.Vector3();
            _raycaster3.ray.intersectPlane(_placementPlane, hit);
            if (hit) _placeSingleBlock(hit);
        } else if (_activeTool === 'entity') {
            const hit = new THREE.Vector3();
            _raycaster3.ray.intersectPlane(_placementPlane, hit);
            if (hit) _placeEntity(hit);
        } else if (_activeTool === 'paint') {
            _doPaintClick(nx, ny);
        } else if (_activeTool === 'path') {
            // Waypoint placement for PathEditor3D
            if (typeof PathEditor3D !== 'undefined') {
                PathEditor3D.handleClick(nx, ny, e.shiftKey);
            }
        }
    }

    function _onWheel(e) {
        e.preventDefault();
        _orbitDist = Math.max(ORB_MIN_DIST, Math.min(ORB_MAX_DIST, _orbitDist + e.deltaY * 0.05));
        _updateOrbitCamera();
    }

    function _onKeyDown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'z': case 'Z': undo(); break;
                case 'y': case 'Y': redo(); break;
                case 's': case 'S': e.preventDefault(); saveLevel(); break;
                case 'n': case 'N': e.preventDefault(); newLevel(); break;
                case 'o': case 'O': e.preventDefault(); openLevel(); break;
                case 'c': case 'C': copySelection(); break;
                case 'v': case 'V': pasteSelection(); break;
                case 'a': case 'A': e.preventDefault(); selectAll(); break;
                case 'e': case 'E': e.preventDefault(); exportLevel(); break;
            }
            return;
        }
        switch (e.key) {
            case 's': case 'S': setTool('select'); break;
            case 'p': case 'P': setTool('place');  break;
            case 'g': case 'G': _activeTool === 'move' ? setTool('select') : setTool('move'); break;
            case 'r': case 'R': setTool('rotate'); break;
            case 'e': case 'E': setTool('scale');  break;
            case 'n': case 'N': setTool('entity'); break;
            case 'c': case 'C': setTool('paint');  break;
            case 'f': case 'F': frameSelected();   break;
            case 'w': case 'W': toggleWireframe(); break;
            case 'Delete': case 'Backspace': deleteSelection(); break;
            case 'Escape': deselectAll(); break;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TOOLS — PUBLIC API
    // ─────────────────────────────────────────────────────────────────────────

    function setTool(tool) {
        _activeTool = tool;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('tool-' + tool);
        if (btn) btn.classList.add('active');
        document.getElementById('active-tool-label').textContent = tool.toUpperCase();
        if (_ghostMesh) _ghostMesh.visible = (tool === 'place');
        // Hide gizmo when switching away from transform tools
        if (!['move','rotate','scale'].includes(tool) && typeof BlockTools !== 'undefined') {
            BlockTools.hideGizmo();
        }
    }

    function setSnap(val) {
        _state.snapSize = parseFloat(val) || 0;
        const label = val === '0' ? 'OFF' : val + ' m';
        document.getElementById('snap-grid-label').textContent = 'SNAP: ' + label;
        _gridHelper.visible = _state.showGrid && _state.snapSize > 0;
    }

    function showTab(name) {
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
        document.querySelectorAll('.panel-body').forEach(b => b.classList.toggle('active', b.id === 'tab-' + name));
    }

    function selectBlockType(type) {
        _activeBlockType = type;
        document.querySelectorAll('.platform-item').forEach(el => el.classList.toggle('active', el.dataset.ptype === type));
        _rebuildGhostGeometry();
    }

    function selectPlatType(type) {
        _activePlatType = type;
        document.querySelectorAll('[data-plat]').forEach(el => el.classList.toggle('active', el.dataset.plat === type));
    }

    function selectEntity(type) {
        _activeEntity = type;
        document.querySelectorAll('[data-entity]').forEach(el => el.classList.toggle('active', el.dataset.entity === type));
    }

    function setBlockDim(axis, val) {
        _blockDim[axis] = val;
        _rebuildGhostGeometry();
    }

    function setBlockColorIdx(idx) {
        _blockColorIdx = Math.max(0, Math.min(255, idx));
        const hex = '#' + PALETTE[_blockColorIdx].toString(16).padStart(6, '0');
        document.getElementById('color-swatch-preview').style.background = hex;
        if (_ghostMesh) _ghostMesh.material.color.setHex(PALETTE[_blockColorIdx]);
    }

    function _rebuildGhostGeometry() {
        if (!_ghostMesh) return;
        _ghostMesh.geometry.dispose();
        let geo;
        switch (_activeBlockType) {
            case 'cylinder': geo = new THREE.CylinderGeometry(_blockDim.w / 2, _blockDim.w / 2, _blockDim.h, 8); break;
            default:         geo = new THREE.BoxGeometry(_blockDim.w, _blockDim.h, _blockDim.d); break;
        }
        _ghostMesh.geometry = geo;
        _ghostMesh.material.color.setHex(PALETTE[_blockColorIdx]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PLACE OBJECT
    // ─────────────────────────────────────────────────────────────────────────

    function _placeSingleBlock(worldHit) {
        _pushUndo();
        // Delegate to BlockTools for geometry/physics/stacking
        if (typeof BlockTools !== 'undefined') {
            const record = BlockTools.placeBlock(
                worldHit,
                _state,
                { blockType: _activeBlockType, platType: _activePlatType, blockDim: _blockDim, colorIdx: _blockColorIdx, snapSize: _state.snapSize },
                _meshMap,
                _genId
            );
            _state.dirty = true;
            _markDirty();
            _rebuildHierarchy();
            _updateStatusBar();
            return record;
        }

        // Fallback: scaffold placement
        const snap = _state.snapSize;
        const sx   = snap > 0 ? Math.round(worldHit.x / snap) * snap : worldHit.x;
        const sz   = snap > 0 ? Math.round(worldHit.z / snap) * snap : worldHit.z;
        const sy   = _blockDim.h / 2;
        const id   = _genId('obj');
        _state.objects.push({
            id, type: 'platform', subtype: _activePlatType,
            blockType: _activeBlockType,
            pos:   { x: sx, y: sy, z: sz },
            rot:   { x: 0,  y: 0,  z: 0  },
            scale: { x: _blockDim.w, y: _blockDim.h, z: _blockDim.d },
            colorIdx: _blockColorIdx,
            props: { platType: _activePlatType },
        });
        _state.dirty = true;
        _markDirty();
        _addObjectMesh(_state.objects[_state.objects.length - 1]);
        _rebuildHierarchy();
        _updateStatusBar();
    }

    function _placeEntity(worldHit) {
        const snap = _state.snapSize;
        const sx   = snap > 0 ? Math.round(worldHit.x / snap) * snap : worldHit.x;
        const sz   = snap > 0 ? Math.round(worldHit.z / snap) * snap : worldHit.z;

        _pushUndo();
        const id = _genId('ent');
        const en = { id, type: _activeEntity, pos: { x: sx, y: 0, z: sz }, props: {} };
        _state.entities.push(en);
        _state.dirty = true;
        _markDirty();
        _addEntityMesh(en);
        _rebuildHierarchy();
        _updateStatusBar();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SELECT / PAINT
    // ─────────────────────────────────────────────────────────────────────────

    function _doSelectClick(nx, ny) {
        _raycaster3.setFromCamera({ x: nx, y: ny }, _camera);
        const clickable = [];
        _meshMap.forEach((mesh) => clickable.push(mesh));
        const hits = _raycaster3.intersectObjects(clickable, true);
        if (hits.length === 0) { deselectAll(); return; }

        // Walk up to find a mesh with userData.id
        let hit = hits[0].object;
        while (hit && !hit.userData.id) hit = hit.parent;
        if (!hit || !hit.userData.id) { deselectAll(); return; }

        const id    = hit.userData.id;
        const group = hit.userData.group;
        _selectById(id, group);
    }

    function _doMultiSelectClick(nx, ny) {
        _raycaster3.setFromCamera({ x: nx, y: ny }, _camera);
        const clickable = [];
        _meshMap.forEach(mesh => clickable.push(mesh));
        const hits = _raycaster3.intersectObjects(clickable, true);
        if (!hits.length) return;
        let hit = hits[0].object;
        while (hit && !hit.userData.id) hit = hit.parent;
        if (!hit || !hit.userData.id) return;
        if (typeof BlockTools !== 'undefined') {
            BlockTools.toggleMultiSelect(hit.userData.id, _meshMap);
        }
        document.querySelectorAll('.hier-item').forEach(el => {
            if (el.dataset.id === hit.userData.id) el.classList.toggle('selected');
        });
    }

    function _doPaintClick(nx, ny) {
        _raycaster3.setFromCamera({ x: nx, y: ny }, _camera);
        const meshes = [];
        _meshMap.forEach(m => meshes.push(m));
        const hits = _raycaster3.intersectObjects(meshes, true);
        if (!hits.length) return;
        let hit = hits[0].object;
        while (hit && !hit.userData.id) hit = hit.parent;
        if (!hit) return;
        const obj = _state.objects.find(o => o.id === hit.userData.id);
        if (!obj) return;
        _pushUndo();
        obj.colorIdx = _blockColorIdx;
        const mesh = _meshMap.get(obj.id);
        if (mesh) mesh.material.color.setHex(PALETTE[_blockColorIdx]);
        _markDirty();
    }

    function _selectById(id, group) {
        _selectedId    = id;
        _selectedGroup = group;

        // Visual selection highlight
        _meshMap.forEach((mesh, mId) => {
            if (mesh.material) {
                mesh.material.emissive?.setHex(mId === id ? 0x1a4a28 : 0x000000);
            }
        });

        _showProperties(id, group);
        // Highlight in hierarchy
        document.querySelectorAll('.hier-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.id === id);
        });

        // Show gizmo for object types when move/rotate/scale tool active
        if (group === 'object' && ['move','rotate','scale'].includes(_activeTool) && typeof BlockTools !== 'undefined') {
            const obj = _state.objects.find(o => o.id === id);
            if (obj) BlockTools.showGizmo(obj.pos, _activeTool);
        }
    }

    function deselectAll() {
        _selectedId    = null;
        _selectedGroup = null;
        _meshMap.forEach(mesh => mesh.material?.emissive?.setHex(0x000000));
        document.querySelectorAll('.hier-item').forEach(el => el.classList.remove('selected'));
        document.getElementById('props-body').innerHTML = '<div id="props-empty">No object selected</div>';
        if (typeof BlockTools !== 'undefined') { BlockTools.hideGizmo(); BlockTools.clearMultiSelection(); }
    }

    function selectAll() {
        if (!_state.objects.length) return;
        _state.objects.forEach(o => {
            if (typeof BlockTools !== 'undefined') BlockTools.addToSelection(o.id);
            const mesh = _meshMap.get(o.id);
            if (mesh?.material?.emissive) mesh.material.emissive.setHex(0x1a4a28);
        });
        _rebuildHierarchy();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROPERTIES PANEL
    // ─────────────────────────────────────────────────────────────────────────

    function _showProperties(id, group) {
        const propsBody = document.getElementById('props-body');
        const obj = group === 'object' ? _state.objects.find(o => o.id === id)
                                       : _state.entities.find(e => e.id === id);
        if (!obj) { propsBody.innerHTML = '<div id="props-empty">No object selected</div>'; return; }

        const pos = obj.pos   || { x: 0, y: 0, z: 0 };
        const rot = obj.rot   || { x: 0, y: 0, z: 0 };
        const scl = obj.scale || { x: 1, y: 1, z: 1 };

        propsBody.innerHTML = `
            <div class="prop-row"><label>ID</label><input type="text" value="${id}" readonly style="color:#556"></div>
            <div class="prop-row"><label>Type</label><input type="text" value="${obj.type || obj.subtype || ''}" readonly style="color:#aaa"></div>

            <div class="section-header" style="margin-top:8px">Position</div>
            <div class="prop-row-inline">
                <div class="prop-row"><label>X</label><input type="number" step="0.5" value="${pos.x.toFixed(2)}" onchange="Pf3dEditor.setPropPos('${id}','${group}','x',+this.value)"></div>
                <div class="prop-row"><label>Y</label><input type="number" step="0.5" value="${pos.y.toFixed(2)}" onchange="Pf3dEditor.setPropPos('${id}','${group}','y',+this.value)"></div>
                <div class="prop-row"><label>Z</label><input type="number" step="0.5" value="${pos.z.toFixed(2)}" onchange="Pf3dEditor.setPropPos('${id}','${group}','z',+this.value)"></div>
            </div>

            ${group === 'object' ? `
            <div class="section-header" style="margin-top:8px">Scale</div>
            <div class="prop-row-inline">
                <div class="prop-row"><label>W</label><input type="number" step="0.5" min="0.1" value="${scl.x.toFixed(2)}" onchange="Pf3dEditor.setPropScale('${id}','x',+this.value)"></div>
                <div class="prop-row"><label>H</label><input type="number" step="0.25" min="0.1" value="${scl.y.toFixed(2)}" onchange="Pf3dEditor.setPropScale('${id}','y',+this.value)"></div>
                <div class="prop-row"><label>D</label><input type="number" step="0.5" min="0.1" value="${scl.z.toFixed(2)}" onchange="Pf3dEditor.setPropScale('${id}','z',+this.value)"></div>
            </div>
            <div class="section-header" style="margin-top:8px">Rotation (deg)</div>
            <div class="prop-row-inline">
                <div class="prop-row"><label>X</label><input type="number" step="5" value="${(rot.x * 180 / Math.PI).toFixed(1)}" onchange="Pf3dEditor.setPropRot('${id}','x',+this.value)"></div>
                <div class="prop-row"><label>Y</label><input type="number" step="5" value="${(rot.y * 180 / Math.PI).toFixed(1)}" onchange="Pf3dEditor.setPropRot('${id}','y',+this.value)"></div>
                <div class="prop-row"><label>Z</label><input type="number" step="5" value="${(rot.z * 180 / Math.PI).toFixed(1)}" onchange="Pf3dEditor.setPropRot('${id}','z',+this.value)"></div>
            </div>
            <div class="section-header" style="margin-top:8px">Appearance</div>
            <div class="prop-row"><label>Color Idx</label>
                <input type="number" min="0" max="255" step="1" value="${obj.colorIdx ?? 12}"
                    onchange="Pf3dEditor.setPropColor('${id}',+this.value)">
            </div>
            ` : `
            <div class="section-header" style="margin-top:8px">Entity Props</div>
            `}

            <div style="margin-top:12px;display:flex;gap:6px;">
                <button class="btn btn-danger" style="flex:1" onclick="Pf3dEditor.deleteById('${id}','${group}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        `;
    }

    // Property mutators (called from inline HTML)
    function setPropPos(id, group, axis, val) {
        const list = group === 'object' ? _state.objects : _state.entities;
        const obj  = list.find(o => o.id === id);
        if (!obj) return;
        _pushUndo();
        obj.pos[axis] = val;
        const mesh = _meshMap.get(id);
        if (mesh) mesh.position[axis] = val;
        _markDirty();
    }

    function setPropScale(id, axis, val) {
        const obj = _state.objects.find(o => o.id === id);
        if (!obj) return;
        _pushUndo();
        obj.scale[axis] = val;
        const mesh = _meshMap.get(id);
        if (mesh) mesh.scale[axis] = val;
        _markDirty();
    }

    function setPropRot(id, axis, deg) {
        const obj = _state.objects.find(o => o.id === id);
        if (!obj) return;
        _pushUndo();
        obj.rot[axis] = deg * Math.PI / 180;
        const mesh = _meshMap.get(id);
        if (mesh) mesh.rotation[axis] = obj.rot[axis];
        _markDirty();
    }

    function setPropColor(id, idx) {
        const obj = _state.objects.find(o => o.id === id);
        if (!obj) return;
        _pushUndo();
        obj.colorIdx = Math.max(0, Math.min(255, idx));
        const mesh = _meshMap.get(id);
        if (mesh && mesh.material) mesh.material.color.setHex(PALETTE[obj.colorIdx]);
        _markDirty();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENE MESH MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────

    function _addObjectMesh(obj) {
        let geo, mat;
        if (typeof BlockTools !== 'undefined') {
            geo = BlockTools.buildGeometry(obj.blockType || 'box', obj.scale.x || 2, obj.scale.y || 1, obj.scale.z || 2);
            mat = BlockTools.buildMaterial(obj.colorIdx ?? 12, _state.wireframe);
        } else {
            const color = PALETTE[obj.colorIdx ?? 12];
            switch (obj.blockType || 'box') {
                case 'cylinder': geo = new THREE.CylinderGeometry((obj.scale.x || 2) / 2, (obj.scale.x || 2) / 2, obj.scale.y || 1, 8); break;
                default:         geo = new THREE.BoxGeometry(obj.scale.x || 2, obj.scale.y || 1, obj.scale.z || 2); break;
            }
            mat = new THREE.MeshPhongMaterial({ color, flatShading: true });
        }
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(obj.pos.x, obj.pos.y, obj.pos.z);
        if (obj.rot) mesh.rotation.set(obj.rot.x, obj.rot.y, obj.rot.z);
        mesh.castShadow    = true;
        mesh.receiveShadow = true;
        mesh.userData.id    = obj.id;
        mesh.userData.group = 'object';
        _scene.add(mesh);
        _meshMap.set(obj.id, mesh);
    }

    function _addEntityMesh(en) {
        const color = _entityColor(en.type);
        const geo   = _entityGeo(en.type);
        const mat   = new THREE.MeshPhongMaterial({ color, flatShading: true });
        const mesh  = new THREE.Mesh(geo, mat);
        mesh.position.set(en.pos.x, en.pos.y + 0.5, en.pos.z);
        mesh.userData.id    = en.id;
        mesh.userData.group = 'entity';
        _scene.add(mesh);
        _meshMap.set(en.id, mesh);
    }

    function _entityColor(type) {
        const map = {
            'player-spawn': 0x27ae60, 'checkpoint': 0x2ecc71, 'level-exit': 0xf1c40f,
            'walker': 0xe74c3c, 'flyer': 0x9b59b6, 'shooter': 0xe67e22, 'boss': 0xc0392b,
            'coin': 0xf1c40f, 'star': 0xf1c40f, 'gem': 0x8e44ad, 'powerup': 0xe74c3c,
            'void-plane': 0x2c3e50, 'lava-hazard': 0xe74c3c,
            'spike': 0xe67e22, 'fire-jet': 0xe67e22, 'crusher': 0x7f8c8d, 'laser': 0xe74c3c,
            'trigger-zone': 0x3498db, 'water-volume': 0x2980b9,
        };
        return map[type] || 0x888888;
    }

    function _entityGeo(type) {
        if (['coin','star','gem','powerup'].includes(type)) return new THREE.OctahedronGeometry(0.4, 0);
        if (['walker','flyer','shooter','boss'].includes(type)) return new THREE.BoxGeometry(0.8, 1.2, 0.8);
        if (type === 'player-spawn') return new THREE.ConeGeometry(0.4, 1.2, 6);
        if (type === 'checkpoint')   return new THREE.CylinderGeometry(0.1, 0.1, 2.0, 6);
        if (type === 'level-exit')   return new THREE.TorusGeometry(0.8, 0.12, 8, 16);
        if (type === 'trigger-zone' || type === 'water-volume')
            return new THREE.BoxGeometry(4, 2, 4);
        return new THREE.BoxGeometry(0.6, 0.6, 0.6);
    }

    function _removeObjectMesh(id) {
        const mesh = _meshMap.get(id);
        if (mesh) { _scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); _meshMap.delete(id); }
    }

    function _rebuildScene3D() {
        // Clear existing scene objects (keep lights and grid)
        _meshMap.forEach((mesh, id) => { _scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); });
        _meshMap.clear();
        _state.objects.forEach(_addObjectMesh);
        _state.entities.forEach(_addEntityMesh);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HIERARCHY PANEL
    // ─────────────────────────────────────────────────────────────────────────

    function _rebuildHierarchy() {
        const list = document.getElementById('hierarchy-list');
        if (!list) return;
        let html = '';

        if (_state.entities.length > 0) {
            html += `<div class="hier-item" style="color:var(--accent);font-size:0.7rem;pointer-events:none;padding:4px 10px;background:#060e08">▸ ENTITIES (${_state.entities.length})</div>`;
            for (const en of _state.entities) {
                const sel = en.id === _selectedId ? ' selected' : '';
                html += `<div class="hier-item${sel}" data-id="${en.id}" onclick="Pf3dEditor._selectById('${en.id}','entity')">
                    <span style="font-size:.75rem;width:14px;text-align:center;color:${_entityColorHex(en.type)}">●</span>
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${en.type}</span>
                    <span class="hier-type">ENT</span>
                    <button class="hier-vis" onclick="event.stopPropagation();Pf3dEditor._toggleVisibility('${en.id}')" title="Toggle visibility"><i class="fas fa-eye"></i></button>
                </div>`;
            }
        }

        if (_state.objects.length > 0) {
            html += `<div class="hier-item" style="color:var(--accent);font-size:0.7rem;pointer-events:none;padding:4px 10px;background:#060e08">▸ OBJECTS (${_state.objects.length})</div>`;
            for (const obj of _state.objects) {
                const sel = obj.id === _selectedId ? ' selected' : '';
                html += `<div class="hier-item${sel}" data-id="${obj.id}" onclick="Pf3dEditor._selectById('${obj.id}','object')">
                    <span style="font-size:.75rem;width:14px;text-align:center;color:#${PALETTE[obj.colorIdx ?? 12].toString(16).padStart(6,'0')}">■</span>
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${obj.subtype || obj.type}</span>
                    <span class="hier-type">OBJ</span>
                    <button class="hier-vis" onclick="event.stopPropagation();Pf3dEditor._toggleVisibility('${obj.id}')" title="Toggle visibility"><i class="fas fa-eye"></i></button>
                </div>`;
            }
        }

        if (!html) html = `<div style="color:#445;font-size:.8rem;text-align:center;padding:20px 10px">Scene is empty</div>`;
        list.innerHTML = html;
    }

    function _entityColorHex(type) {
        return '#' + _entityColor(type).toString(16).padStart(6, '0');
    }

    function collapseHierarchy() { /* stub — all sections visible */ }

    function _toggleVisibility(id) {
        const mesh = _meshMap.get(id);
        if (mesh) mesh.visible = !mesh.visible;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EDIT OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────

    function deleteSelection() {
        if (!_selectedId) return;
        deleteById(_selectedId, _selectedGroup);
    }

    function deleteById(id, group) {
        _pushUndo();
        if (group === 'object') {
            _state.objects = _state.objects.filter(o => o.id !== id);
        } else {
            _state.entities = _state.entities.filter(e => e.id !== id);
        }
        _removeObjectMesh(id);
        if (_selectedId === id) deselectAll();
        _rebuildHierarchy();
        _updateStatusBar();
        _markDirty();
    }

    let _clipboard = null;

    function copySelection() {
        if (!_selectedId) return;
        const obj = _state.objects.find(o => o.id === _selectedId) || _state.entities.find(e => e.id === _selectedId);
        if (obj) _clipboard = { ...JSON.parse(JSON.stringify(obj)), group: _selectedGroup };
    }

    function pasteSelection() {
        if (!_clipboard) return;
        _pushUndo();
        const copy = JSON.parse(JSON.stringify(_clipboard));
        copy.id = _genId(copy.group === 'object' ? 'obj' : 'ent');
        copy.pos.x += 2;  // offset to avoid overlap
        if (copy.group === 'object') {
            _state.objects.push(copy);
            _addObjectMesh(copy);
        } else {
            _state.entities.push(copy);
            _addEntityMesh(copy);
        }
        _rebuildHierarchy();
        _updateStatusBar();
        _markDirty();
        _selectById(copy.id, copy.group);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VIEW CONTROLS
    // ─────────────────────────────────────────────────────────────────────────

    function toggleGrid() {
        _state.showGrid = !_state.showGrid;
        _gridHelper.visible = _state.showGrid;
    }

    function toggleWireframe() {
        _state.wireframe = !_state.wireframe;
        document.getElementById('btn-wireframe').classList.toggle('active', _state.wireframe);
        _meshMap.forEach(mesh => { if (mesh.material) mesh.material.wireframe = _state.wireframe; });
    }

    function toggleShadows() {
        _renderer.shadowMap.enabled = !_renderer.shadowMap.enabled;
    }

    function resetCamera() {
        _orbitCenter = { x: 0, y: 0, z: 0 };
        _orbitDist   = 30;
        _orbitTheta  = Math.PI / 4;
        _orbitPhi    = Math.PI / 3;
        _updateOrbitCamera();
    }

    function frameSelected() {
        if (!_selectedId) { resetCamera(); return; }
        const mesh = _meshMap.get(_selectedId);
        if (!mesh) return;
        const p = mesh.position;
        _orbitCenter = { x: p.x, y: p.y, z: p.z };
        _orbitDist   = 10;
        _updateOrbitCamera();
    }
    // Alias for toolbar onclick
    function framSelected() { frameSelected(); }

    // ─────────────────────────────────────────────────────────────────────────
    // VISUAL / SCENE SETTINGS
    // ─────────────────────────────────────────────────────────────────────────

    function setSkyTop(idx)     { _state.skyTop = idx; }
    function setSkyBottom(idx)  { _state.skyBottom = idx; }

    function setAmbient(v) {
        _state.ambient = v;
        const light = _scene.getObjectByName('__ambient');
        if (light) light.intensity = v;
    }

    function setSunIntensity(v) {
        _state.sunIntensity = v;
        const light = _scene.getObjectByName('__sun');
        if (light) light.intensity = v;
    }

    function setSunPos(axis, v) {
        _state.sunPos[axis] = v;
        const light = _scene.getObjectByName('__sun');
        if (light) light.position[axis] = v;
    }

    function setFog(key, v) {
        _state.fog[key] = v;
        if (_scene.fog) _scene.fog[key] = v;
    }

    function setDeathY(v) { _state.deathY = v; }

    // ─────────────────────────────────────────────────────────────────────────
    // LEVEL GENERATION
    // ─────────────────────────────────────────────────────────────────────────

    function _generateFloor() {
        const id = _genId('obj');
        _state.objects.push({
            id, type: 'platform', subtype: 'flat', blockType: 'box',
            pos:   { x: 0, y: -0.5, z: 0 },
            rot:   { x: 0, y: 0, z: 0 },
            scale: { x: 20, y: 1, z: 20 },
            colorIdx: 12,
            props: { platType: 'flat' },
        });
    }

    function generateFloor() {
        _pushUndo();
        const existing = _state.objects.find(o => o.subtype === 'flat' && o.scale.x >= 20);
        if (!existing) _generateFloor();
        _rebuildScene3D();
        _rebuildHierarchy();
        _updateStatusBar();
        _markDirty();
    }

    function clearLevel() { openModal('clear'); }
    function confirmClear() {
        _pushUndo();
        _state.objects  = [];
        _state.entities = [];
        if (typeof PathEditor3D !== 'undefined') PathEditor3D.destroy();
        if (typeof PathEditor3D !== 'undefined') PathEditor3D.init(_scene, _camera, _raycaster3, _state, _meshMap, _genId.bind(null, 'path'));
        if (typeof HazardEditor !== 'undefined') HazardEditor.destroy();
        if (typeof HazardEditor !== 'undefined') HazardEditor.init(_scene, _camera, _raycaster3, _state, _meshMap, _genId.bind(null, 'haz'));
        _rebuildScene3D();
        _rebuildHierarchy();
        _updateStatusBar();
        deselectAll();
        _markDirty();
        closeModal('clear');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UNDO / REDO
    // ─────────────────────────────────────────────────────────────────────────

    function _pushUndo() {
        const snapshot = JSON.stringify({ objects: _state.objects, entities: _state.entities });
        _undoStack.push(snapshot);
        if (_undoStack.length > MAX_UNDO) _undoStack.shift();
        _redoStack = [];
    }

    function undo() {
        if (!_undoStack.length) return;
        const cur  = JSON.stringify({ objects: _state.objects, entities: _state.entities });
        _redoStack.push(cur);
        const snap = JSON.parse(_undoStack.pop());
        _state.objects  = snap.objects;
        _state.entities = snap.entities;
        deselectAll();
        _rebuildScene3D();
        _rebuildHierarchy();
        _updateStatusBar();
        _markDirty();
        _setStatus('Undo');
    }

    function redo() {
        if (!_redoStack.length) return;
        const cur  = JSON.stringify({ objects: _state.objects, entities: _state.entities });
        _undoStack.push(cur);
        const snap = JSON.parse(_redoStack.pop());
        _state.objects  = snap.objects;
        _state.entities = snap.entities;
        deselectAll();
        _rebuildScene3D();
        _rebuildHierarchy();
        _updateStatusBar();
        _markDirty();
        _setStatus('Redo');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SAVE / LOAD / EXPORT / IMPORT
    // ─────────────────────────────────────────────────────────────────────────

    function newLevel() {
        if (_state.dirty && !confirm('Discard unsaved changes?')) return;
        _state.objects  = [];
        _state.entities = [];
        _state.levelId  = 'level01';
        _state.levelName = 'New Level';
        _undoStack = []; _redoStack = [];
        _generateFloor();
        _rebuildScene3D();
        _rebuildHierarchy();
        _updateStatusBar();
        deselectAll();
        _clearDirty();
        _setStatus('New level created');
    }

    function openLevel() { openModal('open'); }

    async function confirmOpen() {
        const proj  = document.getElementById('open-proj').value.trim();
        const lvlId = document.getElementById('open-level').value.trim();
        if (!proj || !lvlId) return;
        closeModal('open');
        await loadLevel(null, proj, lvlId);
    }

    async function loadLevel(ignored, project, levelId) {
        try {
            _setStatus('Loading…');
            const res = await fetch(`/api/levels3d/${encodeURIComponent(project)}/${encodeURIComponent(levelId)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            _loadMapData(data, project, levelId);
            _setStatus(`Loaded: ${levelId}`);
        } catch (err) {
            _setStatus(`Load failed: ${err.message}`);
        }
    }

    function _loadMapData(data, project, levelId) {
        _state.project   = project  || _state.project;
        _state.levelId   = levelId  || data.id  || _state.levelId;
        _state.levelName = data.name || _state.levelName;
        _state.objects   = (data.platforms || []).map(p => ({
            id: p.id || _genId('obj'),
            type: 'platform', subtype: p.type || 'flat',
            blockType: p.blockType || 'box',
            pos:   { x: p.x || 0, y: (p.y || 0) + (p.h || 1) / 2, z: p.z || 0 },
            rot:   p.rot   || { x: 0, y: 0, z: 0 },
            scale: { x: p.w || 2, y: p.h || 1, z: p.d || 2 },
            colorIdx: p.colorIdx ?? 12,
            props: { platType: p.type || 'flat', friction: p.friction, restitution: p.restitution, damage: p.damage, tag: p.tag },
        }));
        _state.entities = (data.entities || []).map(e => ({
            id:   e.id   || _genId('ent'),
            type: e.type,
            pos:  { x: e.x || 0, y: e.y || 0, z: e.z || 0 },
            props: e,
        }));
        if (data.playerSpawn) {
            const sp = data.playerSpawn;
            if (!_state.entities.find(e => e.type === 'player-spawn')) {
                _state.entities.push({ id: _genId('ent'), type: 'player-spawn', pos: { x: sp.x || 0, y: sp.y || 0, z: sp.z || 0 }, props: {} });
            }
        }
        if (data.levelExit) {
            const ex = data.levelExit;
            _state.entities.push({ id: _genId('ent'), type: 'level-exit', pos: { x: ex.x || 0, y: ex.y || 0, z: ex.z || 0 }, props: {} });
        }
        if (data.sky)     { _state.skyTop = data.sky.topColor ?? 87; _state.skyBottom = data.sky.bottomColor ?? 23; }
        if (data.deathY !== undefined) _state.deathY = data.deathY;
        if (data.fog)     { _state.fog.near = data.fog.near ?? 40; _state.fog.far = data.fog.far ?? 120; }
        if (data.ambientLight?.intensity !== undefined) _state.ambient = data.ambientLight.intensity;
        if (data.lights?.length > 0) {
            const sun = data.lights.find(l => l.type === 'directional');
            if (sun) {
                _state.sunIntensity = sun.intensity ?? 1;
                if (sun.position) _state.sunPos = { ...sun.position };
            }
        }

        // Restore PathEditor3D paths (Phase 54)
        if (typeof PathEditor3D !== 'undefined') {
            PathEditor3D.destroy();
            PathEditor3D.init(_scene, _camera, _raycaster3, _state, _meshMap, _genId.bind(null, 'path'));
            if (Array.isArray(data.paths) && data.paths.length) {
                PathEditor3D.loadPaths(data.paths);
            }
        }

        // Restore HazardEditor data (Phase 55)
        if (typeof HazardEditor !== 'undefined') {
            HazardEditor.destroy();
            HazardEditor.init(_scene, _camera, _raycaster3, _state, _meshMap, _genId.bind(null, 'haz'));
            HazardEditor.loadHazards(data);
        }

        _undoStack = []; _redoStack = [];
        _rebuildScene3D();
        _rebuildHierarchy();
        _updateStatusBar();
        deselectAll();
        _clearDirty();
        document.getElementById('project-label').textContent = (_state.project || 'NO PROJECT').toUpperCase();
    }

    async function saveLevel() {
        if (!_state.project) { openModal('level-settings'); return; }
        const payload = _buildLevelPayload();
        try {
            _setStatus('Saving…');
            const res = await fetch(`/api/levels3d/${encodeURIComponent(_state.project)}/${encodeURIComponent(_state.levelId)}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            _clearDirty();
            _setStatus('Saved ✓');
        } catch (err) {
            _setStatus(`Save failed: ${err.message}`);
        }
    }

    function saveLevelAs() { openModal('level-settings'); }

    function exportLevel() {
        const payload = _buildLevelPayload();
        const json    = JSON.stringify(payload, null, 2);
        const blob    = new Blob([json], { type: 'application/json' });
        const url     = URL.createObjectURL(blob);
        const a       = document.createElement('a');
        a.href     = url;
        a.download = `${_state.levelId}.pf3d.json`;
        a.click();
        URL.revokeObjectURL(url);
        _setStatus('Exported');
    }

    function importLevel() {
        const inp = document.createElement('input');
        inp.type   = 'file';
        inp.accept = '.json,.pf3d.json';
        inp.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                _loadMapData(data, _state.project, data.id || file.name.replace(/\..*$/, ''));
                _setStatus('Imported: ' + file.name);
            } catch (err) {
                _setStatus('Import error: ' + err.message);
            }
        };
        inp.click();
    }

    function _buildLevelPayload() {
        // Collect path data from PathEditor3D
        const paths = (typeof PathEditor3D !== 'undefined') ? PathEditor3D.getPathsForLevel() : [];

        // Collect hazard/collectible/checkpoint/trigger data from HazardEditor
        const hazards      = (typeof HazardEditor !== 'undefined') ? HazardEditor.getHazardsForLevel()      : [];
        const triggers     = (typeof HazardEditor !== 'undefined') ? HazardEditor.getTriggersForLevel()     : [];
        const collectibles = (typeof HazardEditor !== 'undefined') ? HazardEditor.getCollectiblesForLevel() : [];
        // Merge checkpoints: HazardEditor has placed flags; _state.entities has 'checkpoint' entries from legacy load
        const hazEdCheckpoints = (typeof HazardEditor !== 'undefined') ? HazardEditor.getCheckpointsForLevel() : [];
        const stateCheckpoints = _state.entities.filter(e => e.type === 'checkpoint').map(e => ({
            id: e.id, pos: { x: e.pos.x, y: e.pos.y, z: e.pos.z }, yaw: e.props?.yaw || 0,
        }));
        const checkpoints = [...hazEdCheckpoints, ...stateCheckpoints];

        return {
            version:    '2.0',
            id:         _state.levelId,
            name:       _state.levelName,
            engineType: 'platformer-3d',
            sky:        { topColor: _state.skyTop, bottomColor: _state.skyBottom },
            ambientLight: { color: 0xffffff, intensity: _state.ambient },
            lights:     [{ type: 'directional', color: 0xffffff, intensity: _state.sunIntensity,
                           position: { ..._state.sunPos }, castShadow: true }],
            fog:        { near: _state.fog.near, far: _state.fog.far },
            deathY:     _state.deathY,
            playerSpawn: (() => { const e = _state.entities.find(e => e.type === 'player-spawn'); return e ? e.pos : { x: 0, y: 2, z: 0 }; })(),
            levelExit:   (() => { const e = _state.entities.find(e => e.type === 'level-exit');  return e ? e.pos : null; })(),
            platforms:   _state.objects.map(o => ({
                id: o.id, type: o.subtype, blockType: o.blockType || 'box',
                x: o.pos.x, y: o.pos.y - (o.scale.y || 1) / 2,
                w: o.scale.x, h: o.scale.y, d: o.scale.z,
                colorIdx: o.colorIdx,
                rot: o.rot,
                ...(o.props || {}),
            })),
            paths,
            hazards,
            triggers,
            collectibles,
            checkpoints,
            entities: _state.entities
                .filter(e => !['player-spawn', 'checkpoint', 'level-exit'].includes(e.type))
                .map(e => ({ id: e.id, type: e.type, x: e.pos.x, y: e.pos.y, z: e.pos.z, ...e.props })),
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LEVEL SETTINGS MODAL
    // ─────────────────────────────────────────────────────────────────────────

    function showLevelSettings() { openModal('level-settings'); }

    function applyLevelSettings() {
        _state.levelId   = document.getElementById('lvl-id').value.trim()   || _state.levelId;
        _state.levelName = document.getElementById('lvl-name').value.trim() || _state.levelName;
        _state.project   = document.getElementById('lvl-proj').value.trim() || _state.project;
        document.getElementById('project-label').textContent = (_state.project || 'NO PROJECT').toUpperCase();
        closeModal('level-settings');
        _setStatus(`Level settings updated: ${_state.levelId}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST PLAY
    // ─────────────────────────────────────────────────────────────────────────

    function testPlay() {
        const overlay = document.getElementById('test-overlay');
        const iframe  = document.getElementById('test-iframe');
        const payload = _buildLevelPayload();
        const key     = 'temp_playtest_platformer3d';
        localStorage.setItem(key, JSON.stringify({ project: _state.project, level: payload }));
        iframe.src   = `engines/platformer-3d/index.html?testPlay=1`;
        overlay.classList.add('active');
    }

    function stopTest() {
        const overlay = document.getElementById('test-overlay');
        const iframe  = document.getElementById('test-iframe');
        overlay.classList.remove('active');
        iframe.src = 'about:blank';
        localStorage.removeItem('temp_playtest_platformer3d');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODAL HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    function openModal(name) {
        const el = document.getElementById('modal-' + name);
        if (el) el.classList.add('active');
    }

    function closeModal(name) {
        const el = document.getElementById('modal-' + name);
        if (el) el.classList.remove('active');
    }

    function setSkybox()        { openModal('level-settings'); }
    function showMusicPicker()  { _setStatus('Music picker — Phase 55+'); }

    // ─────────────────────────────────────────────────────────────────────────
    // STATUS / DIRTY
    // ─────────────────────────────────────────────────────────────────────────

    function _setStatus(msg) {
        const el = document.getElementById('status-msg');
        if (el) el.textContent = msg;
    }

    function _updateStatusBar() {
        const ob = document.getElementById('status-objects');
        const en = document.getElementById('status-entities');
        if (ob) ob.textContent = _state.objects.length;
        if (en) en.textContent = _state.entities.length;
    }

    function _markDirty() {
        _state.dirty = true;
        document.getElementById('unsaved-dot').style.display = 'block';
    }

    function _clearDirty() {
        _state.dirty = false;
        document.getElementById('unsaved-dot').style.display = 'none';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UTILITIES
    // ─────────────────────────────────────────────────────────────────────────

    let _idCounter = 0;
    function _genId(prefix) {
        return `${prefix}_${Date.now()}_${_idCounter++}`;
    }

    function _buildDefaultPalette() {
        // 256 flat-shaded low-poly colors (same index space as PaletteManager defaults)
        const cols = [
            0x2c1810, 0x4a2820, 0x6b3a28, 0x8b4513, 0xa0522d, 0xcd853f, 0xdaa520, 0xb8860b,
            0x444444, 0x666666, 0x888888, 0xaaaaaa, 0x27ae60, 0x2ecc71, 0x1abc9c, 0x16a085,
            0x2980b9, 0x3498db, 0x8e44ad, 0x9b59b6, 0xc0392b, 0xe74c3c, 0xe67e22, 0xf39c12,
            0xf1c40f, 0xffeaa7, 0xdfe6e9, 0xb2bec3, 0x636e72, 0x2d3436, 0x0a0a0a, 0xffffff,
        ];
        // Pad to 256
        while (cols.length < 256) cols.push(0x888888);
        return cols;
    }

    // Mirror & prefab bridge functions
    function mirrorX() {
        if (typeof BlockTools === 'undefined') return;
        const ids = BlockTools.getMultiSelected();
        if (!ids.length && _selectedId) ids.push(_selectedId);
        if (!ids.length) return;
        const pivot = { x: 0, y: 0, z: 0 };
        const newObjs = BlockTools.mirrorSelection('x', pivot, ids, _state, _meshMap, _genId.bind(null, 'obj'));
        if (newObjs) { newObjs.forEach(o => _addObjectMesh(o)); _rebuildHierarchy(); _markDirty(); }
    }
    function mirrorZ() {
        if (typeof BlockTools === 'undefined') return;
        const ids = BlockTools.getMultiSelected();
        if (!ids.length && _selectedId) ids.push(_selectedId);
        if (!ids.length) return;
        const pivot = { x: 0, y: 0, z: 0 };
        const newObjs = BlockTools.mirrorSelection('z', pivot, ids, _state, _meshMap, _genId.bind(null, 'obj'));
        if (newObjs) { newObjs.forEach(o => _addObjectMesh(o)); _rebuildHierarchy(); _markDirty(); }
    }
    function saveSelectionAsPrefab() {
        if (typeof BlockTools === 'undefined') return;
        const name = prompt('Prefab name:');
        if (!name) return;
        const ids = BlockTools.getMultiSelected();
        if (!ids.length && _selectedId) ids.push(_selectedId);
        if (!ids.length) { alert('No objects selected.'); return; }
        BlockTools.savePrefab(name, ids, _state);
    }
    function refreshPrefabList() {
        if (typeof BlockTools !== 'undefined') BlockTools._populatePrefabList();
    }
    function stampPrefabAtOrigin(name) {
        if (typeof BlockTools === 'undefined') return;
        _pushUndo();
        const newObjs = BlockTools.stampPrefab(name, { x: 0, y: 0, z: 0 }, _state, _meshMap, _genId.bind(null, 'obj'));
        if (newObjs) { newObjs.forEach(o => _addObjectMesh(o)); _rebuildHierarchy(); _markDirty(); }
    }

    // ── Path Editor (Phase 54) ────────────────────────────────────────────────
    let _pathPreviewing = false;

    function pathStartSelected() {
        if (!_selectedId || typeof PathEditor3D === 'undefined') return;
        setTool('path');
        PathEditor3D.startPath(_selectedId);
        _pathStatusMsg('Placing waypoints. Click = add, Shift+Click = remove last. Click "Done" when finished.');
    }
    function pathFinalize() {
        if (typeof PathEditor3D !== 'undefined') PathEditor3D.finalizePath();
        setTool('select');
        _pathStatusMsg('Path finalised.');
    }
    function pathCancel() {
        if (typeof PathEditor3D !== 'undefined') PathEditor3D.cancelPath();
        setTool('select');
        _pathStatusMsg('Path editing cancelled.');
    }
    function setPathMotionType(type) {
        if (!_selectedId || typeof PathEditor3D === 'undefined') return;
        document.querySelectorAll('.entity-item[data-motion]').forEach(el =>
            el.classList.toggle('active', el.dataset.motion === type));
        PathEditor3D.setMotionType(_selectedId, type, _readPathConfig(type));
        _pathStatusMsg('Motion type: ' + type);
    }
    function pathApplyConfig() {
        if (!_selectedId || typeof PathEditor3D === 'undefined') return;
        const typeEl = document.querySelector('.entity-item[data-motion].active');
        const type   = typeEl ? typeEl.dataset.motion : 'spline';
        PathEditor3D.setMotionType(_selectedId, type, _readPathConfig(type));
        PathEditor3D.setLoopMode(_selectedId, document.getElementById('path-loop').value);
        _pathStatusMsg('Config applied.');
    }
    function _readPathConfig(type) {
        if (type === 'spline')   return { speed: parseFloat(document.getElementById('path-speed').value) || 3 };
        if (type === 'pendulum') return {
            arcAngle: parseFloat(document.getElementById('path-arc').value)        || 60,
            radius:   parseFloat(document.getElementById('path-radius').value)     || 4,
            speed:    parseFloat(document.getElementById('path-pend-speed').value) || 1,
        };
        if (type === 'rotate')   return {
            axis: document.getElementById('path-rot-axis').value || 'y',
            rpm:  parseFloat(document.getElementById('path-rpm').value) || 1,
        };
        if (type === 'elevator') return { speed: parseFloat(document.getElementById('path-speed').value) || 3, stops: [] };
        return {};
    }
    function pathPreviewToggle() {
        if (typeof PathEditor3D === 'undefined') return;
        _pathPreviewing = !_pathPreviewing;
        const btn = document.getElementById('path-preview-btn');
        if (_pathPreviewing) {
            PathEditor3D.previewStart();
            if (btn) btn.textContent = '⏹ Stop';
        } else {
            PathEditor3D.previewStop();
            if (btn) btn.textContent = '▶ Preview';
        }
    }
    function pathRemoveSelected() {
        if (!_selectedId || typeof PathEditor3D === 'undefined') return;
        PathEditor3D.removePath(_selectedId);
        _pathStatusMsg('Path removed.');
    }
    function _pathStatusMsg(msg) {
        const el = document.getElementById('path-status');
        if (el) el.textContent = msg;
    }

    // ── Hazard / Collectible / Checkpoint API (Phase 55) ──────────────────────
    let _activeHazardType     = 'spike';
    let _activeCollectibleType = 'coin';

    function selectHazardType(type) {
        _activeHazardType = type;
        document.querySelectorAll('.entity-item[data-haz]').forEach(el =>
            el.classList.toggle('active', el.dataset.haz === type));
    }

    function selectCollectibleType(type) {
        _activeCollectibleType = type;
        document.querySelectorAll('.entity-item[data-col]').forEach(el =>
            el.classList.toggle('active', el.dataset.col === type));
    }

    function _readHazardConfig() {
        return {
            period:    parseFloat(document.getElementById('haz-period')?.value) || 2,
            offset:    parseFloat(document.getElementById('haz-offset')?.value) || 0,
            dutyCycle: parseFloat(document.getElementById('haz-duty')?.value)   || 0.5,
        };
    }

    function hazardPlace() {
        if (typeof HazardEditor === 'undefined') return;
        _pushUndo();
        const pos = { x: 0, y: 0.5, z: 0 };
        HazardEditor.placeHazard(pos, _activeHazardType, _readHazardConfig());
        _setStatus('Placed hazard: ' + _activeHazardType);
    }

    function hazardApplyTiming() {
        if (!_selectedId || typeof HazardEditor === 'undefined') return;
        const cfg = _readHazardConfig();
        HazardEditor.setHazardTiming(_selectedId, cfg.period, cfg.offset, cfg.dutyCycle);
        _setStatus('Timing applied.');
    }

    function triggerPlace() {
        if (typeof HazardEditor === 'undefined') return;
        _pushUndo();
        const pos  = { x: 0, y: 1, z: 0 };
        const size = {
            w: parseFloat(document.getElementById('trg-w')?.value) || 2,
            h: parseFloat(document.getElementById('trg-h')?.value) || 2,
            d: parseFloat(document.getElementById('trg-d')?.value) || 2,
        };
        const event = document.getElementById('trg-event')?.value || 'spawn-enemy';
        HazardEditor.placeTrigger(pos, size, event);
        _setStatus('Placed trigger: ' + event);
    }

    function collectiblePlace() {
        if (typeof HazardEditor === 'undefined') return;
        _pushUndo();
        const pos     = { x: 0, y: 0, z: 0 };
        const pattern = document.getElementById('col-pattern')?.value || 'single';
        const count   = parseInt(document.getElementById('col-count')?.value) || 8;
        const radius  = parseFloat(document.getElementById('col-radius')?.value) || 3;
        HazardEditor.placePattern(pos, pattern, _activeCollectibleType, { count, radius });
        _setStatus(`Placed ${pattern} pattern (${_activeCollectibleType})`);
    }

    function checkpointPlace() {
        if (typeof HazardEditor === 'undefined') return;
        _pushUndo();
        const pos = { x: 0, y: 0, z: 0 };
        const yaw = (parseFloat(document.getElementById('chk-yaw')?.value) || 0) * Math.PI / 180;
        HazardEditor.placeCheckpoint(pos, yaw);
        _setStatus('Placed checkpoint.');
    }

    // Run on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 0);
    }

    return {
        // Tools
        setTool, setSnap, showTab,
        selectBlockType, selectPlatType, selectEntity,
        setBlockDim, setBlockColorIdx,
        // Edit
        undo, redo, deleteSelection, deleteById,
        copySelection, pasteSelection, selectAll, deselectAll,
        // Mirror & prefab
        mirrorX, mirrorZ, saveSelectionAsPrefab, refreshPrefabList, stampPrefabAtOrigin,
        // View
        toggleGrid, toggleWireframe, toggleShadows,
        resetCamera, frameSelected, framSelected,
        // Visual settings
        setSkyTop, setSkyBottom, setAmbient, setSunIntensity, setSunPos, setFog, setDeathY,
        // Level
        newLevel, openLevel, confirmOpen, loadLevel,
        saveLevel, saveLevelAs, exportLevel, importLevel,
        generateFloor, clearLevel, confirmClear,
        showLevelSettings, applyLevelSettings, setSkybox, showMusicPicker,
        // Test
        testPlay, stopTest,
        // Modals
        openModal, closeModal,
        // Properties (called from inline HTML)
        setPropPos, setPropScale, setPropRot, setPropColor,
        // Hierarchy (called from inline HTML)
        _selectById, _toggleVisibility, collapseHierarchy,
        // Path Editor (Phase 54)
        pathStartSelected, pathFinalize, pathCancel,
        setPathMotionType, pathApplyConfig, pathPreviewToggle, pathRemoveSelected,
        // Hazard / Collectible / Checkpoint (Phase 55)
        selectHazardType, selectCollectibleType,
        hazardPlace, hazardApplyTiming, triggerPlace, collectiblePlace, checkpointPlace,
    };
})();
