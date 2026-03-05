/**
 * fps_editor.js — Phase 36
 * FPS Map Editor — scaffold logic.
 *
 * Architecture:
 *   - State: `_state` object holds voxel grid, entities, triggers, palette, settings
 *   - 2D view: Canvas-based floor plan with pan/zoom; draws grid and blocks
 *   - 3D view: THREE.js perspective preview; live-rebuilt from voxel grid
 *   - Undo/redo: command stack (snapshot-diff of state)
 *   - Persistence: save/load via /api/levels3d/:project/:level endpoint
 *
 * Phase 36 delivers: scaffold + dual viewport render loop + all tool stubs.
 * Phase 37 delivers: BrushTools.js (full voxel grid draw / fill / rect-stamp).
 * Phase 38 delivers: ColorPalette.js (full 256-color palette painter).
 */

'use strict';

const FPSEditor = (() => {
    // ── constants ────────────────────────────────────────────────────────────
    const DEFAULT_PALETTE = [
        '#2c1810','#4a2820','#6b3a28','#8b4513',
        '#a0522d','#cd853f','#daa520','#b8860b',
        '#444444','#666666','#888888','#aaaaaa',
        '#1a2a3a','#2a4a6a','#3a6a8a','#ccddee',
    ];

    const BLOCK_COLORS = {
        'floor':       '#555555',
        'wall':        '#888888',
        'ceiling':     '#444444',
        'slope-n':     '#7a6a4a',
        'slope-s':     '#7a6a4a',
        'pillar':      '#666666',
        'door-frame':  '#8b4513',
        'window-open': '#1a2a3a',
        'arch':        '#6a5a4a',
    };

    // ── state ────────────────────────────────────────────────────────────────
    let _state = {
        mapName:     'untitled_map',
        author:      '',
        project:     '',
        cellSize:    1,
        ceilingH:    3,
        floorY:      0,
        snapSize:    1,
        // voxelGrid: { "x,y,z": { type, colorIdx } }
        voxelGrid:   {},
        entities:    [],   // { id, type, x, y, z, props }
        triggers:    [],   // { id, event, x, y, z, w, h, d, action }
        palette:     [...DEFAULT_PALETTE],
        fog:         { color: '#1a1208', near: 8, far: 30 },
        ambient:     '#1a1208',
        sun:         '#ffcc88',
        dirty:       false,
    };

    let _activeTool  = 'draw-room';
    let _activeBlock = 'floor';
    let _drawMode    = 'pencil';
    let _activeColor = '#888888';
    let _activePalIdx = 0;
    let _activeEntity = 'player-spawn';
    let _shading     = 'shaded';
    let _showGrid    = true;
    let _selection   = null;   // selected entity/trigger id

    // ── undo stack ───────────────────────────────────────────────────────────
    const _undoStack = [];
    const _redoStack = [];
    const UNDO_LIMIT = 50;

    function _snapshot() {
        return JSON.stringify({ voxelGrid: _state.voxelGrid, entities: _state.entities, triggers: _state.triggers });
    }

    function _pushUndo(prev) {
        _undoStack.push(prev);
        if (_undoStack.length > UNDO_LIMIT) _undoStack.shift();
        _redoStack.length = 0;
    }

    // ── 2D canvas ────────────────────────────────────────────────────────────
    let _c2d, _ctx2d;
    let _pan2d     = { x: 0, y: 0 };
    let _zoom2d    = 32;   // pixels per meter
    let _drag2d    = null;
    let _painting2d = false;
    let _paintPrev  = null;

    function _init2d() {
        _c2d  = document.getElementById('canvas-2d');
        _ctx2d = _c2d.getContext('2d');
        _resize2d();

        // pointer events
        _c2d.addEventListener('pointerdown', _on2dDown);
        _c2d.addEventListener('pointermove', _on2dMove);
        _c2d.addEventListener('pointerup',   _on2dUp);
        _c2d.addEventListener('pointerleave',_on2dUp);
        _c2d.addEventListener('wheel',       _on2dWheel, { passive: false });
        _c2d.addEventListener('contextmenu', e => e.preventDefault());

        // centre the grid
        _pan2d.x = _c2d.width  / 2;
        _pan2d.y = _c2d.height / 2;
    }

    function _resize2d() {
        const vp = document.getElementById('viewport-2d');
        _c2d.width  = vp.clientWidth;
        _c2d.height = vp.clientHeight - 24;   // minus viewport-label
    }

    function _draw2d() {
        if (!_ctx2d) return;
        const ctx = _ctx2d;
        const W = _c2d.width, H = _c2d.height;
        const cs = _state.cellSize * _zoom2d;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#090806';
        ctx.fillRect(0, 0, W, H);

        // grid
        if (_showGrid) {
            ctx.strokeStyle = '#1e1810';
            ctx.lineWidth = 0.5;
            const ox = ((_pan2d.x % cs) + cs) % cs;
            const oy = ((_pan2d.y % cs) + cs) % cs;
            for (let x = ox; x < W; x += cs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
            for (let y = oy; y < H; y += cs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        }

        // origin cross
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(_pan2d.x, 0); ctx.lineTo(_pan2d.x, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, _pan2d.y); ctx.lineTo(W, _pan2d.y); ctx.stroke();

        // blocks
        for (const key in _state.voxelGrid) {
            const [gx, gy, gz] = key.split(',').map(Number);
            if (gy !== 0) continue;   // only show ground-level in floor plan
            const cell = _state.voxelGrid[key];
            const px = _pan2d.x + gx * cs;
            const py = _pan2d.y + gz * cs;   // z is depth in 2D view
            ctx.fillStyle = cell.color || BLOCK_COLORS[cell.type] || '#666';
            ctx.fillRect(px, py, cs - 0.5, cs - 0.5);
            if (_showGrid) {
                ctx.strokeStyle = 'rgba(0,0,0,.3)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(px, py, cs - 0.5, cs - 0.5);
            }
        }

        // entities
        for (const ent of _state.entities) {
            const ex = _pan2d.x + ent.x * _zoom2d;
            const ey = _pan2d.y + ent.z * _zoom2d;
            const r = Math.max(4, cs * 0.3);
            ctx.beginPath();
            ctx.arc(ex, ey, r, 0, Math.PI * 2);
            ctx.fillStyle = _entityColor(ent.type);
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // triggers
        ctx.strokeStyle = 'rgba(243,156,18,.6)';
        ctx.fillStyle   = 'rgba(243,156,18,.08)';
        ctx.lineWidth   = 1;
        for (const trg of _state.triggers) {
            const tx = _pan2d.x + trg.x * _zoom2d;
            const ty = _pan2d.y + trg.z * _zoom2d;
            const tw = trg.w * _zoom2d;
            const th = trg.d * _zoom2d;
            ctx.fillRect(tx, ty, tw, th);
            ctx.strokeRect(tx, ty, tw, th);
        }
    }

    function _entityColor(type) {
        const map = {
            'player-spawn': '#27ae60',
            'enemy-grunt': '#e74c3c', 'enemy-shooter': '#c0392b', 'enemy-patrol': '#922b21',
            'pickup-health': '#2ecc71', 'pickup-ammo': '#f1c40f', 'pickup-armor': '#3498db', 'pickup-weapon': '#9b59b6',
            'door': '#e67e22', 'switch': '#f39c12', 'level-exit': '#ff6b35',
        };
        return map[type] || '#aaa';
    }

    // 2D pointer handlers
    function _on2dDown(e) {
        e.preventDefault();
        const rect  = _c2d.getBoundingClientRect();
        const cx    = e.clientX - rect.left;
        const cy    = e.clientY - rect.top;

        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            // pan
            _drag2d = { cx, cy, px: _pan2d.x, py: _pan2d.y };
            return;
        }

        if (e.button === 0) {
            _painting2d = true;
            _applyTool2d(cx, cy, false);
        } else if (e.button === 2) {
            _painting2d = true;
            _applyTool2d(cx, cy, true);   // erase
        }
    }

    function _on2dMove(e) {
        const rect = _c2d.getBoundingClientRect();
        const cx   = e.clientX - rect.left;
        const cy   = e.clientY - rect.top;

        // update coords display
        const wx = (cx - _pan2d.x) / _zoom2d;
        const wz = (cy - _pan2d.y) / _zoom2d;
        document.getElementById('tool-coords').textContent =
            `X: ${wx.toFixed(2)}   Y: ${_state.floorY.toFixed(2)}   Z: ${wz.toFixed(2)}`;

        if (_drag2d) {
            _pan2d.x = _drag2d.px + (cx - _drag2d.cx);
            _pan2d.y = _drag2d.py + (cy - _drag2d.cy);
            return;
        }
        if (_painting2d) _applyTool2d(cx, cy, e.buttons === 2);
    }

    function _on2dUp() {
        _drag2d     = null;
        _painting2d = false;
        _paintPrev  = null;
        if (_state.dirty) _rebuild3d();
    }

    function _on2dWheel(e) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        const rect  = _c2d.getBoundingClientRect();
        const cx    = e.clientX - rect.left;
        const cy    = e.clientY - rect.top;
        _pan2d.x = cx + (_pan2d.x - cx) * factor;
        _pan2d.y = cy + (_pan2d.y - cy) * factor;
        _zoom2d *= factor;
        _zoom2d  = Math.max(4, Math.min(200, _zoom2d));
    }

    function _applyTool2d(cx, cy, erase) {
        const cs  = _state.cellSize;
        const snap = _state.snapSize;
        const rawX = (cx - _pan2d.x) / _zoom2d;
        const rawZ = (cy - _pan2d.y) / _zoom2d;
        const gx   = Math.floor(rawX / snap) * snap / cs | 0;
        const gz   = Math.floor(rawZ / snap) * snap / cs | 0;
        const gy   = 0;   // floor-level
        const key  = `${gx},${gy},${gz}`;

        if (_activeTool === 'draw-room' || _activeTool === 'corridor') {
            const prev = _snapshot();
            if (erase) {
                if (_state.voxelGrid[key]) { delete _state.voxelGrid[key]; _pushUndo(prev); markDirty(); }
            } else {
                if (!_state.voxelGrid[key] || _state.voxelGrid[key].type !== _activeBlock) {
                    _pushUndo(prev);
                    _state.voxelGrid[key] = { type: _activeBlock, color: _activeColor };
                    markDirty();
                }
            }
            _updateBlockCount();
        } else if (_activeTool === 'paint' && !erase && _state.voxelGrid[key]) {
            const prev = _snapshot();
            _pushUndo(prev);
            _state.voxelGrid[key].color = _activeColor;
            markDirty();
        } else if (_activeTool === 'entity' && !erase) {
            const prev = _snapshot();
            _pushUndo(prev);
            const wx = rawX, wz = rawZ;
            _state.entities.push({ id: `ent_${Date.now()}`, type: _activeEntity, x: wx, y: _state.floorY, z: wz, props: {} });
            _pushUndo(prev);
            markDirty();
            _updateEntityCount();
        }
    }

    // ── 3D THREE.js preview ──────────────────────────────────────────────────
    let _three  = null;   // { scene, camera, renderer, orbitCtrl, meshGroup, dirLight, fog }
    let _raf3d  = null;
    let _drag3d = null;
    let _orbitState = { theta: 0.6, phi: 1.1, radius: 20, target: { x: 0, y: 0, z: 0 } };

    function _init3d() {
        const canvas = document.getElementById('canvas-3d');

        // Three.js is loaded as a global from lib/ only when available; 
        // fall back to a placeholder canvas renderer if not available.
        if (typeof THREE === 'undefined') {
            _renderFallback3d(canvas);
            return;
        }

        const w = canvas.parentElement.clientWidth;
        const h = canvas.parentElement.clientHeight - 24;

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
        renderer.setSize(w, h);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

        const scene  = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0806);
        scene.fog = new THREE.Fog(0x1a1208, 8, 30);

        const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 500);
        _setCam3dFromOrbit(camera);

        // Lighting
        const ambient = new THREE.AmbientLight(0x1a1208, 1.2);
        scene.add(ambient);
        const dirLight = new THREE.DirectionalLight(0xffcc88, 1.5);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        scene.add(dirLight);

        // Grid helper
        const gridHelper = new THREE.GridHelper(40, 40, 0x2a2018, 0x1a1208);
        scene.add(gridHelper);

        const meshGroup = new THREE.Group();
        scene.add(meshGroup);

        _three = { scene, camera, renderer, meshGroup, dirLight, gridHelper };

        // Orbit controls via pointer events
        canvas.addEventListener('pointerdown', _on3dDown);
        canvas.addEventListener('pointermove', _on3dMove);
        canvas.addEventListener('pointerup',   _on3dUp);
        canvas.addEventListener('wheel',       _on3dWheel, { passive: false });
        canvas.addEventListener('contextmenu', e => e.preventDefault());

        _rebuild3d();
        _loop3d();
    }

    function _renderFallback3d(canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.parentElement.clientWidth;
        const h = canvas.parentElement.clientHeight - 24;
        canvas.width  = w;
        canvas.height = h;
        ctx.fillStyle = '#0a0806';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#444';
        ctx.font = '18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('THREE.js not loaded — 3D preview unavailable', w/2, h/2 - 10);
        ctx.fillStyle = '#333';
        ctx.fillText('Block placement works in the 2D floor plan view', w/2, h/2 + 14);
    }

    function _loop3d() {
        _raf3d = requestAnimationFrame(_loop3d);
        if (!_three) return;
        _three.renderer.render(_three.scene, _three.camera);
        _updateCamInfo();
    }

    function _rebuild3d() {
        if (!_three) return;
        const group = _three.meshGroup;
        // clear old meshes
        while (group.children.length) {
            const m = group.children[0];
            m.geometry?.dispose();
            m.material?.dispose();
            group.remove(m);
        }

        const cs = _state.cellSize;
        for (const key in _state.voxelGrid) {
            const [gx, gy, gz] = key.split(',').map(Number);
            const cell = _state.voxelGrid[key];
            const color = cell.color || BLOCK_COLORS[cell.type] || '#666';

            let geo, h = cs;
            if (cell.type === 'floor')   { geo = new THREE.BoxGeometry(cs, 0.1, cs); }
            else if (cell.type === 'ceiling') { geo = new THREE.BoxGeometry(cs, 0.1, cs); }
            else if (cell.type === 'wall')    { geo = new THREE.BoxGeometry(cs, _state.ceilingH, cs); }
            else if (cell.type === 'pillar')  { geo = new THREE.BoxGeometry(cs * 0.4, _state.ceilingH, cs * 0.4); }
            else { geo = new THREE.BoxGeometry(cs, cs, cs); }

            const mat  = new THREE.MeshLambertMaterial({ color });
            const mesh = new THREE.Mesh(geo, mat);
            const wy = cell.type === 'ceiling'
                ? _state.floorY + _state.ceilingH
                : _state.floorY + (cell.type === 'wall' ? _state.ceilingH / 2 : 0);
            mesh.position.set(gx * cs + cs/2, wy, gz * cs + cs/2);
            mesh.castShadow    = true;
            mesh.receiveShadow = true;
            group.add(mesh);
        }

        // entity markers
        for (const ent of _state.entities) {
            const geo  = new THREE.SphereGeometry(0.25, 6, 4);
            const mat  = new THREE.MeshLambertMaterial({ color: _entityColor(ent.type) });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(ent.x, ent.y + 0.5, ent.z);
            group.add(mesh);
        }

        // trigger volumes
        for (const trg of _state.triggers) {
            const geo = new THREE.BoxGeometry(trg.w, trg.h || 2, trg.d);
            const mat = new THREE.MeshBasicMaterial({ color: 0xf39c12, wireframe: true, opacity: 0.5, transparent: true });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(trg.x + trg.w/2, _state.floorY + (trg.h||2)/2, trg.z + trg.d/2);
            group.add(mesh);
        }

        if (_shading === 'wireframe') {
            group.traverse(m => { if (m.isMesh && !m.material.wireframe) m.material.wireframe = true; });
        }
    }

    function _setCam3dFromOrbit(cam) {
        const o = _orbitState;
        const x = o.target.x + o.radius * Math.sin(o.phi) * Math.sin(o.theta);
        const y = o.target.y + o.radius * Math.cos(o.phi);
        const z = o.target.z + o.radius * Math.sin(o.phi) * Math.cos(o.theta);
        cam = cam || _three.camera;
        cam.position.set(x, y, z);
        cam.lookAt(o.target.x, o.target.y, o.target.z);
    }

    function _on3dDown(e) {
        e.preventDefault();
        _drag3d = { button: e.button, cx: e.clientX, cy: e.clientY, theta: _orbitState.theta, phi: _orbitState.phi, tx: _orbitState.target.x, tz: _orbitState.target.z };
    }

    function _on3dMove(e) {
        if (!_drag3d) return;
        const dx = e.clientX - _drag3d.cx;
        const dy = e.clientY - _drag3d.cy;
        if (_drag3d.button === 2) {
            // orbit
            _orbitState.theta = _drag3d.theta - dx * 0.006;
            _orbitState.phi   = Math.max(0.08, Math.min(Math.PI - 0.08, _drag3d.phi - dy * 0.006));
        } else if (_drag3d.button === 1) {
            // pan
            const panSpeed = _orbitState.radius * 0.002;
            _orbitState.target.x = _drag3d.tx - dx * panSpeed;
            _orbitState.target.z = _drag3d.tz + dy * panSpeed;
        }
        _setCam3dFromOrbit();
    }

    function _on3dUp() { _drag3d = null; }

    function _on3dWheel(e) {
        e.preventDefault();
        _orbitState.radius *= e.deltaY < 0 ? 0.88 : 1.14;
        _orbitState.radius  = Math.max(0.5, Math.min(200, _orbitState.radius));
        _setCam3dFromOrbit();
    }

    function _updateCamInfo() {
        const el = document.getElementById('cam-info');
        if (!el || !_three) return;
        const c = _three.camera.position;
        el.textContent = `Cam  X:${c.x.toFixed(1)}  Y:${c.y.toFixed(1)}  Z:${c.z.toFixed(1)}\nBlocks: ${Object.keys(_state.voxelGrid).length}`;
    }

    // ── render loop (2D + 3D together) ───────────────────────────────────────
    function _animate() {
        requestAnimationFrame(_animate);
        _draw2d();
    }

    // ── palette UI ───────────────────────────────────────────────────────────
    function _buildPaletteUI() {
        const grid = document.getElementById('palette-grid');
        if (!grid) return;
        grid.innerHTML = '';
        _state.palette.forEach((col, i) => {
            const cell = document.createElement('div');
            cell.className  = 'pal-swatch' + (i === _activePalIdx ? ' active' : '');
            cell.title      = col;
            cell.innerHTML  = `<div class="swatch-inner" style="background:${col}"></div>`;
            cell.onclick    = () => _pickPalette(i);
            grid.appendChild(cell);
        });
    }

    function _pickPalette(idx) {
        _activePalIdx = idx;
        _activeColor  = _state.palette[idx];
        document.getElementById('color-picker').value = _activeColor;
        document.getElementById('color-hex').textContent = _activeColor;
        _buildPaletteUI();
    }

    // ── public API ───────────────────────────────────────────────────────────

    function switchTab(tab) {
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        document.querySelectorAll('.panel-body').forEach(b => b.classList.toggle('active', b.id === `tab-${tab}`));
    }

    function setTool(tool) {
        _activeTool = tool;
        document.querySelectorAll('.tool-btn[id^=tool-]').forEach(b => {
            b.classList.toggle('active', b.id === `tool-${tool}`);
        });
        document.getElementById('status-tool').textContent = `Tool: ${tool.toUpperCase()}`;
    }

    function setSnap(val) {
        _state.snapSize = parseFloat(val);
    }

    function selectBlock(type) {
        _activeBlock = type;
        document.querySelectorAll('.block-cell').forEach(c => c.classList.toggle('active', c.dataset.block === type));
    }

    function setDrawMode(mode) {
        _drawMode = mode;
        ['pencil','rect','fill'].forEach(m => {
            const el = document.getElementById(`draw-${m}`);
            if (el) el.classList.toggle('active', m === mode);
        });
    }

    function setCellSize(v) { _state.cellSize = parseFloat(v); markDirty(); }
    function setCeilingHeight(v) { _state.ceilingH = v; markDirty(); _rebuild3d(); }
    function setFloorY(v) { _state.floorY  = v; markDirty(); _rebuild3d(); }

    function setActiveColor(hex) {
        _activeColor = hex;
        _state.palette[_activePalIdx] = hex;
        document.getElementById('color-hex').textContent = hex;
        _buildPaletteUI();
    }

    function selectEntity(type) {
        _activeEntity = type;
        document.querySelectorAll('.entity-item').forEach(e => e.classList.toggle('active', e.dataset.entity === type));
        setTool('entity');
    }

    function addTrigger(event) {
        const prev = _snapshot();
        _pushUndo(prev);
        _state.triggers.push({
            id: `trg_${Date.now()}`,
            event,
            x: 0, y: _state.floorY,
            z: 0, w: 2, h: 2.5, d: 2,
            action: '',
        });
        markDirty();
        _updateTriggerList();
        _rebuild3d();
    }

    function setShading(mode) {
        _shading = mode;
        ['shaded','wireframe','solid'].forEach(m => {
            const el = document.getElementById(`btn-${m}`);
            if (el) el.classList.toggle('active', m === mode);
        });
        _rebuild3d();
    }

    function toggleGrid() {
        _showGrid = !_showGrid;
        if (_three?.gridHelper) _three.gridHelper.visible = _showGrid;
    }

    function toggleWireframe() {
        setShading(_shading === 'wireframe' ? 'shaded' : 'wireframe');
    }

    function resetCam() {
        _orbitState = { theta: 0.6, phi: 1.1, radius: 20, target: { x: 0, y: 0, z: 0 } };
        _setCam3dFromOrbit();
    }

    function setView(v) {
        if      (v === 'top')   { _orbitState.phi = 0.1;  _orbitState.theta = 0; }
        else if (v === 'front') { _orbitState.phi = Math.PI / 2; _orbitState.theta = 0; }
        else                    { _orbitState.phi = 1.1;  _orbitState.theta = 0.6; }
        _setCam3dFromOrbit();
    }

    function zoom2d(factor) {
        _zoom2d *= factor;
        _zoom2d  = Math.max(4, Math.min(200, _zoom2d));
    }

    function fitView2d() {
        const keys = Object.keys(_state.voxelGrid);
        if (!keys.length) { _pan2d.x = _c2d.width/2; _pan2d.y = _c2d.height/2; _zoom2d = 32; return; }
        let minX=Infinity, maxX=-Infinity, minZ=Infinity, maxZ=-Infinity;
        keys.forEach(k => { const [x,,z] = k.split(',').map(Number); minX=Math.min(minX,x); maxX=Math.max(maxX,x+1); minZ=Math.min(minZ,z); maxZ=Math.max(maxZ,z+1); });
        const rangeX = (maxX - minX) * _state.cellSize;
        const rangeZ = (maxZ - minZ) * _state.cellSize;
        const padded = Math.max(rangeX, rangeZ) * 1.2 || 10;
        _zoom2d  = Math.min(_c2d.width, _c2d.height) / padded;
        _pan2d.x = _c2d.width/2  - (minX + (maxX-minX)/2) * _state.cellSize * _zoom2d;
        _pan2d.y = _c2d.height/2 - (minZ + (maxZ-minZ)/2) * _state.cellSize * _zoom2d;
    }

    function markDirty() {
        _state.dirty = true;
        document.getElementById('unsaved-dot').style.display = 'block';
    }

    function _clearDirty() {
        _state.dirty = false;
        document.getElementById('unsaved-dot').style.display = 'none';
    }

    function _updateBlockCount()  { document.getElementById('status-blocks').textContent   = `Blocks: ${Object.keys(_state.voxelGrid).length}`; }
    function _updateEntityCount() { document.getElementById('status-entities').textContent = `Entities: ${_state.entities.length}`; }
    function _updateTriggerList() {
        const el = document.getElementById('trigger-map-list');
        if (!_state.triggers.length) { el.textContent = 'No triggers placed.'; return; }
        el.innerHTML = _state.triggers.map(t =>
            `<div class="trigger-item" style="margin-bottom:3px">
                <span class="trigger-icon"><i class="fas fa-bolt"></i></span>
                <span style="flex:1;font-size:.85rem">${t.event}</span>
                <span style="font-size:.7rem;color:#555">${t.id.slice(-5)}</span>
            </div>`
        ).join('');
    }

    // ── undo / redo ─────────────────────────────────────────────────────────
    function undo() {
        if (!_undoStack.length) return;
        _redoStack.push(_snapshot());
        const prev = JSON.parse(_undoStack.pop());
        _state.voxelGrid = prev.voxelGrid;
        _state.entities  = prev.entities;
        _state.triggers  = prev.triggers;
        markDirty();
        _rebuild3d();
        _updateBlockCount();
        _updateEntityCount();
        _updateTriggerList();
    }

    function redo() {
        if (!_redoStack.length) return;
        _undoStack.push(_snapshot());
        const next = JSON.parse(_redoStack.pop());
        _state.voxelGrid = next.voxelGrid;
        _state.entities  = next.entities;
        _state.triggers  = next.triggers;
        markDirty();
        _rebuild3d();
        _updateBlockCount();
        _updateEntityCount();
        _updateTriggerList();
    }

    function selectAll()     { console.log('[FPSEditor] selectAll — Phase 37'); }
    function deleteSelected(){ if (_selection) { /* Phase 37 */ } }

    // ── fog / lighting settings ──────────────────────────────────────────────
    function updateFog() {
        _state.fog.color = document.getElementById('fog-color').value;
        _state.fog.near  = +document.getElementById('fog-near').value;
        _state.fog.far   = +document.getElementById('fog-far').value;
        if (_three?.scene?.fog) {
            _three.scene.fog.color.set(_state.fog.color);
            _three.scene.fog.near = _state.fog.near;
            _three.scene.fog.far  = _state.fog.far;
        }
        markDirty();
    }

    function updateLighting() {
        _state.ambient = document.getElementById('ambient-color').value;
        _state.sun     = document.getElementById('sun-color').value;
        if (_three?.scene) {
            _three.scene.traverse(o => {
                if (o.isAmbientLight) o.color.set(_state.ambient);
                if (o.isDirectionalLight) o.color.set(_state.sun);
            });
        }
        markDirty();
    }

    // ── palette actions ──────────────────────────────────────────────────────
    function randomizePalette() {
        _state.palette = Array.from({ length: 16 }, () =>
            `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6,'0')}`
        );
        _activeColor  = _state.palette[_activePalIdx];
        _buildPaletteUI();
        markDirty();
    }

    function loadPalette() { console.log('[FPSEditor] loadPalette — Phase 38'); }
    function savePalette() { console.log('[FPSEditor] savePalette — Phase 38'); }

    // ── map I/O ──────────────────────────────────────────────────────────────
    function newMap() {
        if (_state.dirty && !confirm('Discard unsaved changes?')) return;
        _state.voxelGrid = {};
        _state.entities  = [];
        _state.triggers  = [];
        _clearDirty();
        _undoStack.length = 0;
        _redoStack.length = 0;
        _rebuild3d();
        _updateBlockCount();
        _updateEntityCount();
        _updateTriggerList();
    }

    function saveMap() {
        const mapData = _buildMapData();
        const project = _state.project || 'FPS3D Demo';
        const mapName = _state.mapName || 'untitled_map';

        fetch(`/api/levels3d/${encodeURIComponent(project)}/${encodeURIComponent(mapName)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mapData),
        })
        .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
        .then(() => { _clearDirty(); console.log('[FPSEditor] Map saved'); })
        .catch(err => {
            // No server endpoint yet (Phase 41) — download as fallback
            console.warn('[FPSEditor] Server save failed, downloading:', err);
            _downloadJSON(mapData, `${mapName}.fpsmap.json`);
            _clearDirty();
        });
    }

    function saveMapAs() {
        const name = prompt('Save map as:', _state.mapName);
        if (!name) return;
        _state.mapName = name;
        document.getElementById('map-name').value = name;
        saveMap();
    }

    function openMap() {
        const input = document.createElement('input');
        input.type   = 'file';
        input.accept = '.json,.fpsmap.json';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    _loadMapData(JSON.parse(ev.target.result));
                } catch (err) {
                    alert('Failed to parse map file: ' + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    function exportMap() {
        const mapData = _buildMapData();
        _downloadJSON(mapData, `${_state.mapName}.fpsmap.json`);
    }

    function importMap() { openMap(); }

    function _buildMapData() {
        return {
            version:   2,
            mapName:   _state.mapName,
            author:    _state.author,
            project:   _state.project,
            cellSize:  _state.cellSize,
            ceilingH:  _state.ceilingH,
            floorY:    _state.floorY,
            palette:   _state.palette,
            fog:       _state.fog,
            ambient:   _state.ambient,
            sun:       _state.sun,
            voxelGrid: _state.voxelGrid,
            entities:  _state.entities,
            triggers:  _state.triggers,
        };
    }

    function _loadMapData(data) {
        _state.mapName   = data.mapName   || 'untitled_map';
        _state.author    = data.author    || '';
        _state.project   = data.project   || '';
        _state.cellSize  = data.cellSize  || 1;
        _state.ceilingH  = data.ceilingH  || 3;
        _state.floorY    = data.floorY    ?? 0;
        _state.palette   = data.palette   || [...DEFAULT_PALETTE];
        _state.fog       = data.fog       || _state.fog;
        _state.ambient   = data.ambient   || '#1a1208';
        _state.sun       = data.sun       || '#ffcc88';
        _state.voxelGrid = data.voxelGrid || {};
        _state.entities  = data.entities  || [];
        _state.triggers  = data.triggers  || [];

        // update UI fields
        document.getElementById('map-name').value    = _state.mapName;
        document.getElementById('map-author').value  = _state.author;
        document.getElementById('map-project').value = _state.project;
        document.getElementById('ceiling-height').value = _state.ceilingH;
        document.getElementById('floor-y').value     = _state.floorY;
        document.getElementById('fog-color').value   = _state.fog.color;
        document.getElementById('fog-near').value    = _state.fog.near;
        document.getElementById('fog-far').value     = _state.fog.far;
        document.getElementById('ambient-color').value = _state.ambient;
        document.getElementById('sun-color').value     = _state.sun;
        document.getElementById('project-label').textContent = _state.project || '— no project —';

        _buildPaletteUI();
        _undoStack.length = 0;
        _redoStack.length = 0;
        _clearDirty();
        _rebuild3d();
        _updateBlockCount();
        _updateEntityCount();
        _updateTriggerList();
        fitView2d();
    }

    function _downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── build / validate ─────────────────────────────────────────────────────
    function testPlay() {
        const mapData = _buildMapData();
        // Phase 41 will implement a proper preview launch via FPS engine
        // For now store in sessionStorage and notify parent
        try {
            sessionStorage.setItem('fps_preview_map', JSON.stringify(mapData));
        } catch(e) { /* ignore quota */ }
        if (window.opener?.FPSEditor_onTestPlay) {
            window.opener.FPSEditor_onTestPlay(mapData);
        } else {
            alert('Test Play: map data saved to sessionStorage.\nLaunch the FPS engine from the launcher to preview.');
        }
    }

    function buildNavmesh() {
        // Phase 41 auto-generates navmesh from walkable floor geometry
        console.log('[FPSEditor] buildNavmesh — Phase 41');
        alert('Navmesh generation will be implemented in Phase 41 (FPS Map Export/Import).');
    }

    function validateMap() {
        const issues = [];
        const hasPlayerSpawn = _state.entities.some(e => e.type === 'player-spawn');
        if (!hasPlayerSpawn) issues.push('⚠ No player spawn point placed');
        if (Object.keys(_state.voxelGrid).length === 0) issues.push('⚠ Map is empty — no blocks placed');
        const hasLevelExit = _state.entities.some(e => e.type === 'level-exit') ||
                             _state.triggers.some(t => t.event === 'levelComplete');
        if (!hasLevelExit) issues.push('ℹ No level exit defined');
        if (issues.length === 0) {
            alert('✓ Map validation passed!');
        } else {
            alert('Map validation issues:\n\n' + issues.join('\n'));
        }
    }

    function clearMap() {
        if (!confirm('Clear all blocks, entities, and triggers?')) return;
        newMap();
    }

    // ── keyboard shortcuts ───────────────────────────────────────────────────
    function _initKeyboard() {
        document.addEventListener('keydown', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z') { e.preventDefault(); undo(); }
                if (e.key === 'y') { e.preventDefault(); redo(); }
                if (e.key === 's') { e.preventDefault(); saveMap(); }
                if (e.key === 'n') { e.preventDefault(); newMap(); }
                if (e.key === 'o') { e.preventDefault(); openMap(); }
                if (e.key === 'a') { e.preventDefault(); selectAll(); }
            } else {
                if (e.key === 'r') setTool('draw-room');
                if (e.key === 'c') setTool('corridor');
                if (e.key === 'e') setTool('entity');
                if (e.key === 'p') setTool('paint');
                if (e.key === 'l') setTool('light');
                if (e.key === 't') setTool('trigger');
                if (e.key === 's') setTool('select');
                if (e.key === 'g') toggleGrid();
                if (e.key === 'w') toggleWireframe();
                if (e.key === 'F5') { e.preventDefault(); testPlay(); }
                if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
            }
        });
    }

    // ── resize handler ───────────────────────────────────────────────────────
    function _initResize() {
        const ro = new ResizeObserver(() => {
            _resize2d();
            if (_three) {
                const vp = document.getElementById('viewport-3d');
                const w  = vp.clientWidth;
                const h  = vp.clientHeight - 24;
                _three.renderer.setSize(w, h);
                _three.camera.aspect = w / h;
                _three.camera.updateProjectionMatrix();
            }
        });
        ro.observe(document.getElementById('layout'));
    }

    // ── init ─────────────────────────────────────────────────────────────────
    function _init() {
        _buildPaletteUI();
        _init2d();
        _init3d();
        _initKeyboard();
        _initResize();
        _animate();

        // read project from URL param ?project=NAME
        const params  = new URLSearchParams(window.location.search);
        const project = params.get('project') || '';
        if (project) {
            _state.project = project;
            document.getElementById('project-label').textContent = project;
            document.getElementById('map-project').value = project;
        }

        console.log('[FPSEditor] Phase 36 scaffold ready');
    }

    window.addEventListener('DOMContentLoaded', _init);

    // public exports
    return {
        switchTab, setTool, setSnap,
        selectBlock, setDrawMode, setCellSize, setCeilingHeight, setFloorY,
        setActiveColor, setActiveColor, setShading, toggleGrid, toggleWireframe, resetCam, setView,
        zoom2d, fitView2d,
        selectEntity, addTrigger,
        updateFog, updateLighting,
        randomizePalette, loadPalette, savePalette,
        newMap, openMap, saveMap, saveMapAs, exportMap, importMap,
        undo, redo, selectAll, deleteSelected,
        testPlay, buildNavmesh, validateMap, clearMap,
        markDirty,
    };

})();
