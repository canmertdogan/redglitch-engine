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
    // DEFAULT_PALETTE kept for backward compat (used in _loadMapData fallback)
    const DEFAULT_PALETTE = [
        '#2c1810','#4a2820','#6b3a28','#8b4513',
        '#a0522d','#cd853f','#daa520','#b8860b',
        '#444444','#666666','#888888','#aaaaaa',
        '#1a2a3a','#2a4a6a','#3a6a8a','#ccddee',
    ];

    // ── state ────────────────────────────────────────────────────────────────
    let _state = {
        mapName:     'untitled_map',
        author:      '',
        project:     '',
        cellSize:    1,
        ceilingH:    3,
        floorY:      0,
        snapSize:    1,
        voxelGrid:   {},
        entities:    [],
        triggers:    [],
        lights:      [],          // managed by LightEditor
        emissiveBlocks: {},       // { "x,y,z": true }
        fog:         { color: '#1a1208', near: 8, far: 30 },
        ambient:     '#1a1208',
        sun:         '#ffcc88',
        dirty:       false,
    };

    let _trimeshMode  = 'voxel';
    let _lowPolyFloor = null;
    let LowPolyTerrainGen = null;
    import('/engines/shared/LowPolyTerrainGen.js').then(m => { LowPolyTerrainGen = m.default; }).catch(() => {});
    let _tilesetEnabled = false;
    let _atlas          = null;
    let _activeBlock  = 'floor';
    let _activeTool   = 'draw-room';
    let _drawMode     = 'pencil';
    let _activeColor  = '#888888';  // kept in sync with ColorPalette.getActive()
    let _activeEntity = 'player-spawn';
    let _shading      = 'shaded';
    let _showGrid     = true;
    let _selection    = null;
    let _activeY      = 0;          // current edit layer (Y axis)

    // ── rect-stamp drag state ────────────────────────────────────────────────
    // Set on mousedown when drawMode === 'rect'; cleared on mouseup.
    let _rectDrag = null;  // { gx0, gz0, gx1, gz1, erase: bool }

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

        // blocks — show active layer at full opacity, other Y layers as ghost
        for (const key in _state.voxelGrid) {
            const [gx, gy, gz] = key.split(',').map(Number);
            const cell = _state.voxelGrid[key];
            const px = _pan2d.x + gx * cs;
            const py = _pan2d.y + gz * cs;
            if (gy === _activeY) {
                ctx.fillStyle = cell.color || BLOCK_COLORS[cell.type] || '#666';
                ctx.fillRect(px, py, cs - 0.5, cs - 0.5);
                if (_showGrid) {
                    ctx.strokeStyle = 'rgba(0,0,0,.3)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(px, py, cs - 0.5, cs - 0.5);
                }
            } else {
                // ghost: dim the block to indicate another Y layer
                ctx.fillStyle = (cell.color || '#666') + '30';
                ctx.fillRect(px, py, cs - 0.5, cs - 0.5);
                ctx.strokeStyle = 'rgba(255,255,255,.08)';
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

        // point-light gizmos (Phase 39)
        for (const lt of _state.lights) {
            const lx = _pan2d.x + lt.x * _zoom2d;
            const lz = _pan2d.y + lt.z * _zoom2d;
            const lr = Math.max(4, lt.radius * _zoom2d);
            // radius circle (faint)
            ctx.beginPath();
            ctx.arc(lx, lz, lr, 0, Math.PI * 2);
            ctx.strokeStyle = lt.color + '55';
            ctx.lineWidth   = 1;
            ctx.stroke();
            // centre dot
            ctx.beginPath();
            ctx.arc(lx, lz, Math.max(4, cs * 0.35), 0, Math.PI * 2);
            ctx.fillStyle   = lt.color;
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth   = 1;
            ctx.stroke();
        }

        // rect-stamp live preview
        if (_rectDrag && (_activeTool === 'draw-room' || _activeTool === 'corridor')) {
            const cs   = _state.cellSize * _zoom2d;
            const snap = _state.snapSize;
            const px0  = _pan2d.x + Math.min(_rectDrag.gx0, _rectDrag.gx1) * cs / _state.cellSize;
            const pz0  = _pan2d.y + Math.min(_rectDrag.gz0, _rectDrag.gz1) * cs / _state.cellSize;
            const pw   = (Math.abs(_rectDrag.gx1 - _rectDrag.gx0) + 1) * cs / _state.cellSize;
            const ph   = (Math.abs(_rectDrag.gz1 - _rectDrag.gz0) + 1) * cs / _state.cellSize;
            ctx.strokeStyle = _rectDrag.erase ? 'rgba(231,76,60,.9)' : 'rgba(255,107,53,.9)';
            ctx.fillStyle   = _rectDrag.erase ? 'rgba(231,76,60,.12)' : 'rgba(255,107,53,.12)';
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.fillRect(px0, pz0, pw, ph);
            ctx.strokeRect(px0, pz0, pw, ph);
            ctx.setLineDash([]);
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

        const { gx, gz } = _screenToGrid(cx, cy);

        if (_drawMode === 'rect' && (_activeTool === 'draw-room' || _activeTool === 'corridor')) {
            // begin rect drag — no painting until mouseup
            _rectDrag = { gx0: gx, gz0: gz, gx1: gx, gz1: gz, erase: e.button === 2 };
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
            `X: ${wx.toFixed(2)}   Y: ${_activeY}   Z: ${wz.toFixed(2)}`;

        // track hovered voxel key for LightEditor emissive tool (Phase 39)
        if (typeof LightEditor !== 'undefined') {
            const { gx, gz } = _screenToGrid(cx, cy);
            const key = `${gx},0,${gz}`;
            LightEditor._hoveredKey = (_state.voxelGrid[key]) ? key : null;
        }

        if (_drag2d) {
            _pan2d.x = _drag2d.px + (cx - _drag2d.cx);
            _pan2d.y = _drag2d.py + (cy - _drag2d.cy);
            return;
        }
        // update rect preview end corner
        if (_rectDrag) {
            const { gx, gz } = _screenToGrid(cx, cy);
            _rectDrag.gx1 = gx;
            _rectDrag.gz1 = gz;
            return;
        }
        if (_painting2d) _applyTool2d(cx, cy, e.buttons === 2);
    }

    function _on2dUp() {
        _drag2d = null;
        // commit rect stamp
        if (_rectDrag) {
            const { gx0, gz0, gx1, gz1, erase: er } = _rectDrag;
            const prev = _snapshot();
            let changes;
            if (er) {
                changes = BrushTools.rectErase(_state.voxelGrid, gx0, gz0, gx1, gz1, _activeY);
            } else {
                changes = BrushTools.rectStamp(_state.voxelGrid, gx0, gz0, gx1, gz1, _activeY, _activeBlock, _activeColor);
            }
            if (changes.length) { _pushUndo(prev); markDirty(); _updateBlockCount(); _rebuild3d(); }
            _rectDrag = null;
            return;
        }
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

    /** Convert screen pixel → snapped grid coords { gx, gz }. */
    function _screenToGrid(cx, cy) {
        const snap = _state.snapSize;
        const cs   = _state.cellSize;
        const rawX = (cx - _pan2d.x) / _zoom2d;
        const rawZ = (cy - _pan2d.y) / _zoom2d;
        return {
            gx:   Math.floor(rawX / snap) * (snap / cs) | 0,
            gz:   Math.floor(rawZ / snap) * (snap / cs) | 0,
            rawX, rawZ,
        };
    }

    function _applyTool2d(cx, cy, isErase) {
        const { gx, gz, rawX, rawZ } = _screenToGrid(cx, cy);
        const gy  = _activeY;
        const grid = _state.voxelGrid;

        if (_activeTool === 'draw-room' || _activeTool === 'corridor') {
            if (_drawMode === 'pencil') {
                const prev = _snapshot();
                const changes = isErase
                    ? BrushTools.erase(grid, gx, gy, gz)
                    : BrushTools.pencil(grid, gx, gy, gz, _activeBlock, _activeColor);
                if (changes.length) { _pushUndo(prev); markDirty(); }

            } else if (_drawMode === 'fill') {
                const prev = _snapshot();
                const changes = isErase
                    ? BrushTools.floodFill(grid, gx, gy, gz, null, null)
                    : BrushTools.floodFill(grid, gx, gy, gz, _activeBlock, _activeColor);
                if (changes.length) { _pushUndo(prev); markDirty(); }
                // fill rebuilds immediately
                if (changes.length) { _rebuild3d(); }
            }
            // rect mode is handled via _rectDrag (mousedown/mouseup)
            _updateBlockCount();

        } else if (_activeTool === 'paint' && !isErase) {
            const prev = _snapshot();
            const changes = BrushTools.paintBlock(grid, gx, gy, gz, _activeColor);
            if (changes.length) { _pushUndo(prev); markDirty(); }

        } else if (_activeTool === 'entity' && !isErase) {
            const prev = _snapshot();
            _pushUndo(prev);
            _state.entities.push({ id: `ent_${Date.now()}`, type: _activeEntity, x: rawX, y: _state.floorY, z: rawZ, props: {} });
            markDirty();
            _updateEntityCount();
            _painting2d = false;  // single-click only for entities

        } else if (_activeTool === 'light' && !isErase) {
            // Phase 39: place a point light at clicked world position
            if (typeof LightEditor !== 'undefined') {
                const worldY = _state.floorY + _state.ceilingH * 0.5;
                const activeHex = (typeof ColorPalette !== 'undefined')
                    ? ColorPalette.getActive().hex
                    : _activeColor;
                LightEditor.addLight(rawX, worldY, rawZ, activeHex, 1.0, 8, 'Light');
                // _state.lights updated via onChanged callback
            }
            _painting2d = false;
        }
    }

    // ── 3D THREE.js preview ──────────────────────────────────────────────────
    let _three  = null;   // { scene, camera, renderer, orbitCtrl, meshGroup, dirLight, fog }
    let _raf3d  = null;
    let _drag3d = null;
    let _orbitState = { theta: 0.6, phi: 1.1, radius: 20, target: { x: 0, y: 0, z: 0 } };
    let _canvas3dHovered = false;   // true while pointer is over the 3D viewport
    const _keysDown = new Set();    // tracks WASD/QE while canvas hovered

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

        const meshGroup  = new THREE.Group();
        scene.add(meshGroup);
        const lightGroup = new THREE.Group();
        scene.add(lightGroup);

        _three = { scene, camera, renderer, meshGroup, lightGroup, dirLight, gridHelper };

        // Orbit controls via pointer events
        canvas.addEventListener('pointerdown', _on3dDown);
        canvas.addEventListener('pointermove', _on3dMove);
        canvas.addEventListener('pointerup',   _on3dUp);
        canvas.addEventListener('wheel',       _on3dWheel, { passive: false });
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        canvas.addEventListener('pointerenter', () => { _canvas3dHovered = true; });
        canvas.addEventListener('pointerleave', () => { _canvas3dHovered = false; _keysDown.clear(); });

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

        // WASD fly-cam: move orbit target in XZ based on camera facing direction
        if (_canvas3dHovered && _keysDown.size) {
            const speed = _orbitState.radius * 0.025;
            const fwdX  =  Math.sin(_orbitState.theta);
            const fwdZ  =  Math.cos(_orbitState.theta);
            if (_keysDown.has('w')) { _orbitState.target.x -= fwdX * speed; _orbitState.target.z -= fwdZ * speed; }
            if (_keysDown.has('s')) { _orbitState.target.x += fwdX * speed; _orbitState.target.z += fwdZ * speed; }
            if (_keysDown.has('a')) { _orbitState.target.x -= fwdZ * speed; _orbitState.target.z += fwdX * speed; }
            if (_keysDown.has('d')) { _orbitState.target.x += fwdZ * speed; _orbitState.target.z -= fwdX * speed; }
            if (_keysDown.has('q') || _keysDown.has(' '))  _orbitState.target.y += speed;
            if (_keysDown.has('e') || _keysDown.has('Control')) _orbitState.target.y -= speed;
            _setCam3dFromOrbit();
        }

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

        if (_tilesetEnabled && _atlas) {
            // ── Atlas tileset path: per-block BoxGeometry with atlas UVs ─────────
            for (const key in _state.voxelGrid) {
                const [gx, gy, gz] = key.split(',').map(Number);
                const cell      = _state.voxelGrid[key];
                const blockType = cell.type || _activeBlock || 'floor';
                const geo = new THREE.BoxGeometry(cs, cs, cs);
                _atlas.applyBlockUVs(geo, blockType);
                const mat  = _atlas.getMaterial(THREE);
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(gx * cs + cs / 2, gy * cs + cs / 2, gz * cs + cs / 2);
                mesh.userData.blockType = blockType;
                group.add(mesh);
            }
        } else if (typeof BrushTools !== 'undefined') {
            // ── Greedy mesh path (Phase 37) ───────────────────────────────────
            const groups = BrushTools.buildGreedyMesh(_state.voxelGrid, cs);
            const meshes = BrushTools.buildThreeGeometries(groups, THREE);
            for (const m of meshes) {
                // Phase 39: apply emissive to blocks whose keys are flagged
                // BrushTools groups by color so we do a per-vertex check on rebuild
                group.add(m);
            }
            // Apply emissive per-mesh based on emissiveBlocks set
            if (Object.keys(_state.emissiveBlocks).length) {
                group.traverse(m => {
                    if (!m.isMesh) return;
                    const hex = m.material.color?.getHexString?.();
                    if (!hex) return;
                    // Check if any emissive block shares this mesh's color
                    let glows = false;
                    for (const key of Object.keys(_state.emissiveBlocks)) {
                        const cell = _state.voxelGrid[key];
                        if (cell && (cell.color || '#888888') === `#${hex}`) { glows = true; break; }
                    }
                    if (glows) {
                        m.material = m.material.clone();
                        m.material.emissive = new THREE.Color(`#${hex}`);
                        m.material.emissiveIntensity = 0.6;
                    }
                });
            }
        } else {
            // ── Fallback: one box per block ───────────────────────────────────
            for (const key in _state.voxelGrid) {
                const [gx, gy, gz] = key.split(',').map(Number);
                const cell  = _state.voxelGrid[key];
                const color = cell.color || '#666';
                const geo   = new THREE.BoxGeometry(cs, cs, cs);
                const mat   = new THREE.MeshLambertMaterial({ color });
                const mesh  = new THREE.Mesh(geo, mat);
                mesh.position.set(gx * cs + cs / 2, gy * cs + cs / 2, gz * cs + cs / 2);
                group.add(mesh);
            }
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

        // ── Point lights (Phase 39) ───────────────────────────────────────────
        if (_three.lightGroup) {
            const lg = _three.lightGroup;
            while (lg.children.length) lg.remove(lg.children[0]);
            for (const lt of _state.lights) {
                const pl = new THREE.PointLight(lt.color, lt.intensity, lt.radius, 2);
                pl.position.set(lt.x, lt.y, lt.z);
                lg.add(pl);
                // small helper sphere so the light is visible in the viewport
                const sg = new THREE.SphereGeometry(0.12, 5, 4);
                const sm = new THREE.MeshBasicMaterial({ color: lt.color });
                const sh = new THREE.Mesh(sg, sm);
                sh.position.copy(pl.position);
                lg.add(sh);
            }
        }

        if (_shading === 'wireframe') {
            group.traverse(m => { if (m.isMesh && !m.material.wireframe) m.material.wireframe = true; });
        }
    }

    function _setCam3dFromOrbit(cam) {
        cam = cam || _three?.camera;
        if (!cam) return;
        const o = _orbitState;
        const x = o.target.x + o.radius * Math.sin(o.phi) * Math.sin(o.theta);
        const y = o.target.y + o.radius * Math.cos(o.phi);
        const z = o.target.z + o.radius * Math.sin(o.phi) * Math.cos(o.theta);
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

    // ── palette UI (managed by ColorPalette.js from Phase 38) ───────────────
    function _buildPaletteUI() {
        // No-op: ColorPalette manages its own rendering.
        // Kept so legacy call-sites don't throw.
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

    function setActiveY(v) {
        _activeY = Math.max(-20, Math.min(20, Math.round(v)));
        const el = document.getElementById('active-y-display');
        if (el) el.textContent = _activeY;
    }

    /** Called by ColorPalette.onColorSelected callback — keeps _activeColor in sync. */
    function setActiveColor(hex) {
        _activeColor = hex;
        // ColorPalette owns its own state; this just syncs the editor's active color.
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

    /**
     * Toggle atlas tileset mode for the 3D preview.
     * @param {boolean} val
     */
    async function setTilesetEnabled(val) {
        _tilesetEnabled = !!val;
        if (_tilesetEnabled && !_atlas && typeof THREE !== 'undefined') {
            try {
                const { default: TextureAtlas3D } = await import('/engines/shared/TextureAtlas3D.js');
                _atlas = new TextureAtlas3D();
                await _atlas.loadAsync(THREE);
            } catch (e) {
                console.warn('[FPSEditor] TextureAtlas3D load failed:', e);
                _tilesetEnabled = false;
            }
        }
        const btn = document.getElementById('btn-tileset');
        if (btn) btn.classList.toggle('active', _tilesetEnabled);
        _rebuild3d();
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
    function _updateEntityCount() {
        document.getElementById('status-entities').textContent = `Entities: ${_state.entities.length}`;
        if (typeof EntitySpawner !== 'undefined') EntitySpawner.syncEntities(_state.entities);
    }
    function _updateTriggerList() {
        if (typeof EntitySpawner !== 'undefined') {
            EntitySpawner.syncTriggers(_state.triggers);
            return;
        }
        // fallback (no EntitySpawner)
        const el = document.getElementById('trigger-map-list');
        if (!el) return;
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
        if (typeof ColorPalette !== 'undefined') { ColorPalette.randomize(); }
        markDirty();
    }

    function loadPalette() {
        if (typeof ColorPalette !== 'undefined') { ColorPalette.importPAL(); }
    }
    function savePalette() {
        if (typeof ColorPalette !== 'undefined') { ColorPalette.exportPAL(); }
    }

    // ── map I/O ──────────────────────────────────────────────────────────────
    function newMap() {
        if (_state.dirty && !confirm('Discard unsaved changes?')) return;
        _state.voxelGrid      = {};
        _state.entities       = [];
        _state.triggers       = [];
        _state.lights         = [];
        _state.emissiveBlocks = {};
        if (typeof LightEditor !== 'undefined') LightEditor.fromData({ lights: [], emissiveBlocks: {} });
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
        if (typeof MapExporter !== 'undefined') {
            MapExporter.exportToServer(mapData)
                .then(() => { _clearDirty(); console.log('[FPSEditor] Map saved to server'); })
                .catch(err => {
                    console.warn('[FPSEditor] Server save failed, downloading:', err);
                    MapExporter.exportToFile(mapData);
                    _clearDirty();
                });
        } else {
            _downloadJSON(mapData, `${_state.mapName || 'untitled_map'}.fpsmap.json`);
            _clearDirty();
        }
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
        if (typeof MapExporter !== 'undefined') {
            MapExporter.exportToFile(mapData);
        } else {
            _downloadJSON(mapData, `${_state.mapName}.fpsmap.json`);
        }
    }

    function importMap() { openMap(); }

    /** Export optimized greedy mesh data for GLTF generation. */
    function exportGreedyMeshData() {
        if (typeof BrushTools === 'undefined') return [];
        return BrushTools.exportGreedyMesh(_state.voxelGrid, _state.cellSize);
    }

    function setTerrainMode(mode) {
        _trimeshMode = mode;
        document.getElementById('fps-tmode-voxel')?.classList.toggle('active', mode === 'voxel');
        document.getElementById('fps-tmode-trimesh')?.classList.toggle('active', mode === 'trimesh');
        const sec = document.getElementById('fps-trimesh-section');
        if (sec) sec.style.display = mode === 'trimesh' ? '' : 'none';
        if (mode === 'trimesh' && !_lowPolyFloor) generateLowPolyFloor();
    }

    function setSculptTool(tool) { console.log('[FPSEditor] sculpt tool:', tool); }

    function setBrushRadius(r) {
        const span = document.getElementById('fps-brush-r-val');
        if (span) span.textContent = r;
    }

    function setBrushStrength(s) {
        const span = document.getElementById('fps-brush-s-val');
        if (span) span.textContent = s;
    }

    function generateLowPolyFloor() {
        if (!LowPolyTerrainGen) { console.warn('[FPSEditor] LowPolyTerrainGen not loaded'); return; }
        if (!_three?.scene) return;
        if (_lowPolyFloor) { _three.scene.remove(_lowPolyFloor); _lowPolyFloor.geometry?.dispose(); _lowPolyFloor.material?.dispose(); _lowPolyFloor = null; }
        const w = 20, h = 20;
        const elevGrid = new Float32Array(w * h);
        for (let i = 0; i < elevGrid.length; i++) elevGrid[i] = Math.random() * 0.05;
        const mesh = new LowPolyTerrainGen().generate(elevGrid, w, h, { tileSize: 1, maxHeight: 0.5 });
        if (!mesh) return;
        mesh.userData.isLowPolyFloor = true;
        _three.scene.add(mesh);
        _lowPolyFloor = mesh;
    }

    function _buildMapData() {
        const palette = (typeof ColorPalette !== 'undefined')
            ? ColorPalette.toArray()
            : DEFAULT_PALETTE;
        const lightsData = (typeof LightEditor !== 'undefined')
            ? LightEditor.toData()
            : { lights: _state.lights, emissiveBlocks: _state.emissiveBlocks };
        return {
            version:        2,
            mapName:        _state.mapName,
            author:         _state.author,
            project:        _state.project,
            cellSize:       _state.cellSize,
            ceilingH:       _state.ceilingH,
            floorY:         _state.floorY,
            palette,
            fog:            _state.fog,
            ambient:        _state.ambient,
            sun:            _state.sun,
            lights:         lightsData.lights,
            emissiveBlocks: lightsData.emissiveBlocks,
            voxelGrid:      _state.voxelGrid,
            entities:       _state.entities,
            triggers:       _state.triggers,
            trimesh:        _lowPolyFloor ? (() => { const pos = _lowPolyFloor.geometry?.attributes?.position; const col = _lowPolyFloor.geometry?.attributes?.color; return { positions: pos ? Array.from(pos.array) : [], colors: col ? Array.from(col.array) : [], width: 20, height: 20 }; })() : null,
        };
    }

    function _loadMapData(data) {
        _state.mapName   = data.mapName   || 'untitled_map';
        _state.author    = data.author    || '';
        _state.project   = data.project   || '';
        _state.cellSize  = data.cellSize  || 1;
        _state.ceilingH  = data.ceilingH  || 3;
        _state.floorY    = data.floorY    ?? 0;
        _state.fog       = data.fog       || _state.fog;
        _state.ambient   = data.ambient   || '#1a1208';
        _state.sun       = data.sun       || '#ffcc88';
        _state.voxelGrid = data.voxelGrid || {};
        _state.entities  = data.entities  || [];
        _state.triggers  = data.triggers  || [];

        // restore palette into ColorPalette if available
        if (typeof ColorPalette !== 'undefined' && Array.isArray(data.palette)) {
            ColorPalette.loadFromArray(data.palette);
        }
        // restore lights into LightEditor if available
        if (typeof LightEditor !== 'undefined') {
            LightEditor.fromData({
                lights:         data.lights         || [],
                emissiveBlocks: data.emissiveBlocks || {},
            });
        }
        _state.lights         = data.lights         || [];
        _state.emissiveBlocks = data.emissiveBlocks || {};

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
        if (typeof MapExporter === 'undefined') {
            alert('MapExporter not loaded.');
            return;
        }
        const mapData = _buildMapData();
        const result  = MapExporter.validate(mapData);
        if (!result.ok) {
            const msg = 'Cannot test play — map has errors:\n\n' +
                result.issues.map(i => '✖ ' + i).join('\n');
            alert(msg);
            return;
        }
        MapExporter.testPlay(mapData);
    }

    function buildNavmesh() {
        if (typeof MapExporter === 'undefined') {
            alert('MapExporter not loaded.');
            return;
        }
        const mapData = _buildMapData();
        const navmesh = MapExporter.buildNavmesh(mapData.voxelGrid, mapData.cellSize);
        const nodeCount = navmesh.nodes.length;
        const edgeCount = navmesh.edges.length;
        console.log('[FPSEditor] Navmesh built:', navmesh);
        // Store navmesh in state for export
        _state._navmesh = navmesh;
        const msg = nodeCount === 0
            ? 'No walkable floor cells found.\nPlace floor blocks with empty space above them.'
            : `✓ Navmesh built: ${nodeCount} nodes, ${edgeCount} edges.`;
        alert(msg);
    }

    function validateMap() {
        if (typeof MapExporter === 'undefined') {
            // Minimal built-in fallback
            const issues = [];
            if (!_state.entities.some(e => e.type === 'player-spawn'))
                issues.push('No player spawn placed');
            if (!Object.keys(_state.voxelGrid).length)
                issues.push('Map is empty');
            alert(issues.length ? 'Issues:\n' + issues.join('\n') : '✓ Map OK');
            return;
        }
        const mapData = _buildMapData();
        const result  = MapExporter.validate(mapData);
        const lines   = [];
        if (result.issues.length)   lines.push('ERRORS:', ...result.issues.map(i => '  ✖ ' + i));
        if (result.warnings.length) lines.push('WARNINGS:', ...result.warnings.map(w => '  ⚠ ' + w));
        if (!lines.length)          lines.push('✓ Map validation passed — no issues found.');
        alert(lines.join('\n'));
    }

    function clearMap() {
        if (!confirm('Clear all blocks, entities, and triggers?')) return;
        newMap();
    }

    // ── keyboard shortcuts ───────────────────────────────────────────────────
    function _initKeyboard() {
        const FLY_KEYS = new Set(['w','a','s','d','q','e',' ']);

        document.addEventListener('keydown', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

            // WASD/QE fly-cam — consume key if 3D viewport is hovered
            if (_canvas3dHovered && !e.ctrlKey && !e.metaKey && FLY_KEYS.has(e.key.toLowerCase())) {
                e.preventDefault();
                _keysDown.add(e.key.toLowerCase());
                return;
            }
            // PageUp/PageDown (or [ / ] ) change active Y layer from anywhere
            if (!e.ctrlKey && !e.metaKey) {
                if (e.key === 'PageUp'   || e.key === ']') { e.preventDefault(); setActiveY(_activeY + 1); return; }
                if (e.key === 'PageDown' || e.key === '[') { e.preventDefault(); setActiveY(_activeY - 1); return; }
            }

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

        document.addEventListener('keyup', e => {
            _keysDown.delete(e.key.toLowerCase());
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
        _init2d();
        _init3d();
        _initKeyboard();
        _initResize();
        _animate();

        // Init 256-color palette (Phase 38)
        if (typeof ColorPalette !== 'undefined') {
            const palMount = document.getElementById('tab-textures');
            ColorPalette.init(palMount);
            ColorPalette.onColorSelected((hex /*, idx*/) => {
                _activeColor = hex;
            });
            // seed active color from palette's default selection
            _activeColor = ColorPalette.getActive().hex;
        }

        // 3D face-paint click handler (Phase 38)
        const canvas3d = document.getElementById('canvas-3d');
        if (canvas3d) {
            canvas3d.addEventListener('click', e => {
                if (_activeTool !== 'paint') return;
                if (!_three || typeof THREE === 'undefined') return;
                const rect  = canvas3d.getBoundingClientRect();
                const mouse = new THREE.Vector2(
                    ((e.clientX - rect.left)  / rect.width)  * 2 - 1,
                    -((e.clientY - rect.top)  / rect.height) * 2 + 1
                );
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(mouse, _three.camera);
                const hits = raycaster.intersectObjects(_three.meshGroup.children, false);
                if (!hits.length) return;
                const hit  = hits[0];
                const cs   = _state.cellSize;
                // move point 1% inward along the face normal to land inside the voxel
                const inset = cs * 0.01;
                const px = hit.point.x - hit.face.normal.x * inset;
                const py = hit.point.y - hit.face.normal.y * inset;
                const pz = hit.point.z - hit.face.normal.z * inset;
                const gx = Math.floor(px / cs);
                const gy = Math.floor(py / cs);
                const gz = Math.floor(pz / cs);
                if (typeof BrushTools === 'undefined') return;
                const prev    = _snapshot();
                const changes = BrushTools.paintBlock(_state.voxelGrid, gx, gy, gz, _activeColor);
                if (changes.length) {
                    _pushUndo(prev);
                    markDirty();
                    _rebuild3d();
                    _updateBlockCount();
                }
            });
        }

        // read project from URL param ?project=NAME
        const params  = new URLSearchParams(window.location.search);
        const project = params.get('project') || '';
        if (project) {
            _state.project = project;
            document.getElementById('project-label').textContent = project;
            document.getElementById('map-project').value = project;
        }

        // Init light editor (Phase 39)
        if (typeof LightEditor !== 'undefined') {
            const litMount = document.getElementById('tab-lights');
            LightEditor.init(litMount);
            LightEditor.onChanged(() => {
                const data = LightEditor.toData();
                _state.lights         = data.lights;
                _state.emissiveBlocks = data.emissiveBlocks;
                markDirty();
                _rebuild3d();
            });
        }

        // Init entity & trigger spawner (Phase 40)
        if (typeof EntitySpawner !== 'undefined') {
            EntitySpawner.init(
                document.getElementById('entity-spawner-mount'),
                document.getElementById('trigger-spawner-mount')
            );
            EntitySpawner.onEntityChanged((type, id, data) => {
                if (type === 'remove') {
                    const prev = _snapshot();
                    _state.entities = _state.entities.filter(e => e.id !== id);
                    _pushUndo(prev);
                    markDirty();
                    _rebuild3d();
                    _updateEntityCount();
                } else if (type === 'update') {
                    const prev = _snapshot();
                    const idx = _state.entities.findIndex(e => e.id === id);
                    if (idx !== -1) Object.assign(_state.entities[idx], data);
                    _pushUndo(prev);
                    markDirty();
                    _rebuild3d();
                    _updateEntityCount();
                }
            });
            EntitySpawner.onTriggerChanged((type, id, data) => {
                if (type === 'remove') {
                    const prev = _snapshot();
                    _state.triggers = _state.triggers.filter(t => t.id !== id);
                    _pushUndo(prev);
                    markDirty();
                    _rebuild3d();
                    _updateTriggerList();
                } else if (type === 'update') {
                    const prev = _snapshot();
                    const idx = _state.triggers.findIndex(t => t.id === id);
                    if (idx !== -1) Object.assign(_state.triggers[idx], data);
                    _pushUndo(prev);
                    markDirty();
                    _rebuild3d();
                    _updateTriggerList();
                }
            });
        }

        console.log('[FPSEditor] Phase 40 EntitySpawner ready');
    }

    window.addEventListener('DOMContentLoaded', _init);

    // public exports
    return {
        switchTab, setTool, setSnap,
        selectBlock, setDrawMode, setCellSize, setCeilingHeight, setFloorY, setActiveY,
        setActiveColor, setShading, toggleGrid, toggleWireframe, resetCam, setView,
        zoom2d, fitView2d,
        selectEntity, addTrigger,
        updateFog, updateLighting,
        randomizePalette, loadPalette, savePalette,
        newMap, openMap, saveMap, saveMapAs, exportMap, importMap, exportGreedyMeshData,
        setTerrainMode, setSculptTool, setBrushRadius, setBrushStrength, generateLowPolyFloor,
        undo, redo, selectAll, deleteSelected,
        testPlay, buildNavmesh, validateMap, clearMap,
        markDirty,
        setTilesetEnabled,
        get _tilesetEnabled() { return _tilesetEnabled; },
    };

})();
