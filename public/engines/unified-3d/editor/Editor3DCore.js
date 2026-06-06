/**
 * Editor3DCore.js — Shared 3D level editor core for the Unified3D engine.
 *
 * Provides:
 *   • 3D viewport with orbit camera, grid, and transform gizmos
 *   • Scene tree panel (hierarchical object list)
 *   • Selection system (click / box-select)
 *   • Undo / redo stack
 *   • Copy / paste / duplicate
 *   • Level save / load via /api/levels3d
 *   • Playtest launch (opens unified-3d/index.html)
 *
 * Mode-specific tool panels are loaded dynamically via setModePanel().
 */

'use strict';

export default class Editor3DCore {

    constructor(container3d, options = {}) {
        /** @type {HTMLElement} */
        this.container = typeof container3d === 'string'
            ? document.querySelector(container3d) : container3d;

        /** @type {string} Current editing mode */
        this._mode = options.mode || 'fps-3d';

        /** @type {string} Active project name */
        this._project = options.project || '';

        /** @type {string} Active level ID */
        this._levelId = options.levelId || '';

        // ── THREE.js state ────────────────────────────────────────────────
        this.THREE      = null;
        this.scene      = null;
        this.camera     = null;
        this.renderer   = null;
        this.renderer3d = null;  // Renderer3D from shared/
        this.skybox     = null;

        // ── Editor objects ────────────────────────────────────────────────
        this.gridHelper     = null;
        this.transformCtrl  = null;
        this.meshGroup      = null;
        this.lightGroup     = null;
        this.entityGroup    = null;

        // ── Editor state ──────────────────────────────────────────────────
        this._levelData     = null;
        this._selected      = [];     // Array of THREE.Object3D
        this._clipboard     = null;   // Serialised objects for paste
        this._dirty         = false;

        // ── Orbit camera state ────────────────────────────────────────────
        this._orbit = {
            theta:  0.6,
            phi:    1.1,
            radius: 25,
            target: { x: 0, y: 0, z: 0 },
        };
        this._drag = null;
        this._keysDown = new Set();

        // ── Undo / redo ───────────────────────────────────────────────────
        this._undoStack = [];
        this._redoStack = [];
        this._UNDO_LIMIT = 60;

        // ── Mode panel ────────────────────────────────────────────────────
        this._modePanel = null;

        // ── RAF ───────────────────────────────────────────────────────────
        this._rafId = null;

        // ── Deferred modules ──────────────────────────────────────────────
        this._Renderer3D   = null;
        this._SkyboxSystem = null;
        this._PaletteManager = null;
    }

    // ── Initialisation ────────────────────────────────────────────────────────

    async init() {
        // Dynamic imports for shared systems
        const [
            { default: THREE_MODULE },
            { default: Renderer3D },
            { default: SkyboxSystem },
        ] = await Promise.all([
            import('/lib/three/three.module.js'),
            import('/engines/shared/Renderer3D.js'),
            import('/engines/shared/SkyboxSystem.js'),
        ]);

        this.THREE         = THREE_MODULE;
        this._Renderer3D   = Renderer3D;
        this._SkyboxSystem = SkyboxSystem;

        const THREE = this.THREE;

        // ── Renderer ──────────────────────────────────────────────────────
        this.renderer3d = new Renderer3D(this.container, {
            outline:   true,
            cel:       true,
            tones:     3,
            outlinePx: 1.5,
        });
        await this.renderer3d.init();
        this.scene    = this.renderer3d.scene;
        this.camera   = this.renderer3d.camera;
        this.renderer = this.renderer3d.webgl;

        this._updateOrbitCamera();

        // ── Skybox ────────────────────────────────────────────────────────
        this.skybox = new SkyboxSystem(this.scene);
        this.skybox.setGradient('#1a2a3a', '#87ceeb');

        // ── Lighting ──────────────────────────────────────────────────────
        const amb = new THREE.AmbientLight(0xffffff, 1.2);
        this.scene.add(amb);
        const sun = new THREE.DirectionalLight(0xfffbe0, 1.8);
        sun.position.set(30, 60, 30);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        this.scene.add(sun);

        // ── Grid ──────────────────────────────────────────────────────────
        this.gridHelper = new THREE.GridHelper(100, 100, 0xcccccc, 0x444444);
        this.gridHelper.material.transparent = true;
        this.gridHelper.material.opacity = 0.5;
        this.gridHelper.material.depthWrite = false;
        this.scene.add(this.gridHelper);

        // ── Groups ────────────────────────────────────────────────────────
        this.meshGroup   = new THREE.Group(); this.meshGroup.name = 'meshGroup';
        this.lightGroup  = new THREE.Group(); this.lightGroup.name = 'lightGroup';
        this.entityGroup = new THREE.Group(); this.entityGroup.name = 'entityGroup';
        this.scene.add(this.meshGroup);
        this.scene.add(this.lightGroup);
        this.scene.add(this.entityGroup);

        // ── Input ─────────────────────────────────────────────────────────
        this._attachInputListeners();

        // ── Start render loop ─────────────────────────────────────────────
        this._loop();

        console.log('[Editor3DCore] init() complete');
    }

    // ── Mode management ──────────────────────────────────────────────────────

    get mode() { return this._mode; }

    async setMode(modeId) {
        this._mode = modeId;
        console.log(`[Editor3DCore] mode → ${modeId}`);
        // Notify panel
        if (this._modePanel && typeof this._modePanel.onModeChanged === 'function') {
            this._modePanel.onModeChanged(modeId);
        }
    }

    setModePanel(panel) {
        if (this._modePanel && typeof this._modePanel.dispose === 'function') {
            this._modePanel.dispose();
        }
        this._modePanel = panel;
        if (panel && typeof panel.onAttach === 'function') {
            panel.onAttach(this);
        }
    }

    // ── Level operations ──────────────────────────────────────────────────────

    async loadLevel(project, levelId) {
        this._project = project;
        this._levelId = levelId;
        try {
            const res = await fetch(`/api/levels3d/${encodeURIComponent(project)}/${encodeURIComponent(levelId)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            this._levelData = data;
            this._rebuildScene(data);
            this._dirty = false;
            console.log(`[Editor3DCore] Level loaded: ${project}/${levelId}`);
        } catch (e) {
            console.error('[Editor3DCore] loadLevel failed:', e);
        }
    }

    async saveLevel() {
        if (!this._project || !this._levelId) {
            console.warn('[Editor3DCore] No project/level set');
            return;
        }
        const payload = this._serializeLevelData();
        try {
            const res = await fetch(
                `/api/levels3d/${encodeURIComponent(this._project)}/${encodeURIComponent(this._levelId)}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this._dirty = false;
            console.log(`[Editor3DCore] Level saved: ${this._project}/${this._levelId}`);
            
            // Notify Hub
            if (window.RedGlitchEventBus) {
                window.RedGlitchEventBus.emit('EDITOR_ASSET_SAVED', {
                    project: this._project,
                    type: 'level3d',
                    name: this._levelId
                });
            }
        } catch (e) {
            console.error('[Editor3DCore] saveLevel failed:', e);
        }
    }

    async newLevel(name = 'New Level') {
        const { default: Engine3DAdapter } = await import('/engines/shared/Engine3DAdapter.js');
        const data = Engine3DAdapter.createEmptyLevel(this._mode, name);
        this._levelData = data;
        this._rebuildScene(data);
        this._dirty = true;
    }

    async importGLTF() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.gltf,.glb';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const buffer = await file.arrayBuffer();
            
            // Dynamic import GLTFLoader and FacetTool
            const [{ GLTFLoader }, { default: FacetTool }] = await Promise.all([
                import('https://unpkg.com/three@0.128.0/examples/jsm/loaders/GLTFLoader.js'),
                import('/engines/shared/editor/FacetTool.js')
            ]);
            
            const palette = this.renderer3d?.paletteManager?.palette || [0x555555, 0x888888, 0xcccccc];
            
            try {
                const meshes = await FacetTool.importAndFacet(buffer, this.THREE, GLTFLoader, palette);
                for (const mesh of meshes) {
                    mesh.name = `imported_${Date.now()}_${Math.floor(Math.random()*1000)}`;
                    mesh.userData = { type: 'trimesh', imported: true };
                    this.meshGroup.add(mesh);
                }
                this._updateSceneTree();
                this._markDirty();
                console.log(`[Editor3DCore] Imported ${meshes.length} faceted meshes from ${file.name}`);
            } catch (err) {
                console.error('[Editor3DCore] GLTF import failed:', err);
                alert('Failed to import GLTF: ' + err.message);
            }
        };
        input.click();
    }

    // ── Selection ─────────────────────────────────────────────────────────────

    select(obj) {
        this._selected = obj ? [obj] : [];
        this._highlightSelection();
        this._updatePropertiesPanel();
    }

    selectMultiple(objs) {
        this._selected = [...objs];
        this._highlightSelection();
        this._updatePropertiesPanel();
    }

    deselectAll() {
        this._selected = [];
        this._highlightSelection();
        this._updatePropertiesPanel();
    }

    _highlightSelection() {
        // Use outline pass to highlight selected objects
        if (this.renderer3d?.outlinePass) {
            this.renderer3d.outlinePass.selectedObjects = this._selected;
        }
    }

    _updatePropertiesPanel() {
        const panel = document.getElementById('properties-panel');
        if (!panel) return;

        if (this._selected.length === 0) {
            panel.innerHTML = '<div class="panel-empty">No selection</div>';
            return;
        }

        const obj = this._selected[0];
        const p = obj.position;
        const r = obj.rotation;
        const s = obj.scale;

        panel.innerHTML = `
            <div class="prop-group">
                <div class="prop-label">Name</div>
                <input type="text" class="prop-input" value="${obj.name || ''}" data-field="name">
            </div>
            <div class="prop-group">
                <div class="prop-label">Position</div>
                <div class="prop-vec3">
                    <input type="number" step="0.1" value="${p.x.toFixed(2)}" data-field="px">
                    <input type="number" step="0.1" value="${p.y.toFixed(2)}" data-field="py">
                    <input type="number" step="0.1" value="${p.z.toFixed(2)}" data-field="pz">
                </div>
            </div>
            <div class="prop-group">
                <div class="prop-label">Rotation (°)</div>
                <div class="prop-vec3">
                    <input type="number" step="1" value="${(r.x * 180/Math.PI).toFixed(1)}" data-field="rx">
                    <input type="number" step="1" value="${(r.y * 180/Math.PI).toFixed(1)}" data-field="ry">
                    <input type="number" step="1" value="${(r.z * 180/Math.PI).toFixed(1)}" data-field="rz">
                </div>
            </div>
            <div class="prop-group">
                <div class="prop-label">Scale</div>
                <div class="prop-vec3">
                    <input type="number" step="0.1" value="${s.x.toFixed(2)}" data-field="sx">
                    <input type="number" step="0.1" value="${s.y.toFixed(2)}" data-field="sy">
                    <input type="number" step="0.1" value="${s.z.toFixed(2)}" data-field="sz">
                </div>
            </div>
        `;

        // Wire input changes
        panel.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', () => {
                const field = input.dataset.field;
                const val = field === 'name' ? input.value : parseFloat(input.value);
                this._applyPropertyChange(obj, field, val);
            });
        });
    }

    _applyPropertyChange(obj, field, value) {
        this._pushUndo();
        const DEG = Math.PI / 180;
        switch (field) {
            case 'name': obj.name = value; break;
            case 'px': obj.position.x = value; break;
            case 'py': obj.position.y = value; break;
            case 'pz': obj.position.z = value; break;
            case 'rx': obj.rotation.x = value * DEG; break;
            case 'ry': obj.rotation.y = value * DEG; break;
            case 'rz': obj.rotation.z = value * DEG; break;
            case 'sx': obj.scale.x = value; break;
            case 'sy': obj.scale.y = value; break;
            case 'sz': obj.scale.z = value; break;
        }
        this._markDirty();
    }

    // ── Undo / Redo ───────────────────────────────────────────────────────────

    _pushUndo() {
        const snap = this._serializeLevelData();
        this._undoStack.push(JSON.stringify(snap));
        if (this._undoStack.length > this._UNDO_LIMIT) this._undoStack.shift();
        this._redoStack.length = 0;
    }

    undo() {
        if (this._undoStack.length === 0) return;
        const current = JSON.stringify(this._serializeLevelData());
        this._redoStack.push(current);
        const prev = JSON.parse(this._undoStack.pop());
        this._levelData = prev;
        this._rebuildScene(prev);
    }

    redo() {
        if (this._redoStack.length === 0) return;
        const current = JSON.stringify(this._serializeLevelData());
        this._undoStack.push(current);
        const next = JSON.parse(this._redoStack.pop());
        this._levelData = next;
        this._rebuildScene(next);
    }

    // ── Scene rebuild ─────────────────────────────────────────────────────────

    _rebuildScene(levelData) {
        const THREE = this.THREE;
        if (!THREE || !this.scene) return;

        // Clear groups
        this._clearGroup(this.meshGroup);
        this._clearGroup(this.lightGroup);
        this._clearGroup(this.entityGroup);

        if (!levelData) return;

        // Build geometry
        if (Array.isArray(levelData.geometry)) {
            for (const def of levelData.geometry) {
                const w = def.width  || def.w || 1;
                const h = def.height || def.h || 1;
                const d = def.depth  || def.d || 1;
                const geo = new THREE.BoxGeometry(w, h, d);
                const color = def.colorHex || '#888888';
                const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
                const mesh = new THREE.Mesh(geo, mat);
                if (def.position) mesh.position.set(...def.position);
                if (def.rotation && def.rotation.length === 4) {
                    mesh.quaternion.set(def.rotation[0], def.rotation[1], def.rotation[2], def.rotation[3]);
                }
                mesh.name = def.id || `geo_${this.meshGroup.children.length}`;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.userData = { ...def };
                this.meshGroup.add(mesh);
            }
        }

        // Build entities as markers
        if (Array.isArray(levelData.entities)) {
            for (const ent of levelData.entities) {
                const geo = new THREE.SphereGeometry(0.3, 8, 6);
                const mat = new THREE.MeshLambertMaterial({ color: this._entityColor(ent.type) });
                const mesh = new THREE.Mesh(geo, mat);
                if (ent.position) mesh.position.set(...ent.position);
                mesh.name = ent.id || `ent_${this.entityGroup.children.length}`;
                mesh.userData = { ...ent, _isEntity: true };
                this.entityGroup.add(mesh);
            }
        }

        // Build lights as gizmos
        if (Array.isArray(levelData.lights)) {
            for (const lt of levelData.lights) {
                const color = lt.colorHex || '#ffffff';
                const geo = new THREE.SphereGeometry(0.15, 6, 4);
                const mat = new THREE.MeshBasicMaterial({ color });
                const mesh = new THREE.Mesh(geo, mat);
                if (lt.position) mesh.position.set(...lt.position);
                mesh.name = lt.id || `light_${this.lightGroup.children.length}`;
                mesh.userData = { ...lt, _isLight: true };
                this.lightGroup.add(mesh);
            }
        }

        // Notify mode panel
        if (this._modePanel && typeof this._modePanel.onSceneRebuilt === 'function') {
            this._modePanel.onSceneRebuilt(levelData);
        }

        this._updateSceneTree();
    }

    _clearGroup(group) {
        if (!group) return;
        while (group.children.length) {
            const child = group.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
            group.remove(child);
        }
    }

    // ── Scene tree ────────────────────────────────────────────────────────────

    _updateSceneTree() {
        const tree = document.getElementById('scene-tree');
        if (!tree) return;

        let html = '';
        const addGroup = (group, label) => {
            if (!group || group.children.length === 0) return;
            html += `<div class="tree-group"><div class="tree-group-label">${label} (${group.children.length})</div>`;
            for (const child of group.children) {
                const selected = this._selected.includes(child) ? 'selected' : '';
                html += `<div class="tree-item ${selected}" data-name="${child.name}">${child.name || '(unnamed)'}</div>`;
            }
            html += '</div>';
        };
        addGroup(this.meshGroup,   '📦 Geometry');
        addGroup(this.entityGroup, '👤 Entities');
        addGroup(this.lightGroup,  '💡 Lights');

        tree.innerHTML = html || '<div class="panel-empty">Empty scene</div>';

        // Wire clicks
        tree.querySelectorAll('.tree-item').forEach(item => {
            item.addEventListener('click', () => {
                const name = item.dataset.name;
                const obj = this.scene.getObjectByName(name);
                if (obj) this.select(obj);
            });
        });
    }

    // ── Serialisation ─────────────────────────────────────────────────────────

    _serializeLevelData() {
        const data = { ...(this._levelData || {}) };
        data.engineType = this._mode;
        data.geometry = [];
        data.entities = [];
        data.lights   = [];

        if (this.meshGroup) {
            for (const mesh of this.meshGroup.children) {
                const ud = mesh.userData || {};
                const geoData = {
                    id:            mesh.name,
                    type:          ud.type || 'mesh',
                    width:         ud.width  || 1,
                    height:        ud.height || 1,
                    depth:         ud.depth  || 1,
                    position:      [mesh.position.x, mesh.position.y, mesh.position.z],
                    rotation:      [mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w],
                    scale:         [mesh.scale.x, mesh.scale.y, mesh.scale.z],
                    colorHex:      ud.colorHex || null,
                    palette_index: ud.palette_index ?? null,
                    castShadow:    true,
                    receiveShadow: true,
                    imported:      ud.imported || false
                };
                
                if (ud.type === 'trimesh' && mesh.geometry) {
                    const pos = mesh.geometry.getAttribute('position');
                    if (pos) geoData.positions = Array.from(pos.array);
                    const nrm = mesh.geometry.getAttribute('normal');
                    if (nrm) geoData.normals = Array.from(nrm.array);
                    const col = mesh.geometry.getAttribute('color');
                    if (col) geoData.colors = Array.from(col.array);
                }
                
                data.geometry.push(geoData);
            }
        }

        if (this.entityGroup) {
            for (const mesh of this.entityGroup.children) {
                const ud = mesh.userData || {};
                data.entities.push({
                    id:       mesh.name,
                    type:     ud.type || 'unknown',
                    position: [mesh.position.x, mesh.position.y, mesh.position.z],
                    properties: ud.properties || {},
                });
            }
        }

        if (this.lightGroup) {
            for (const mesh of this.lightGroup.children) {
                const ud = mesh.userData || {};
                data.lights.push({
                    id:        mesh.name,
                    type:      ud.type || 'point',
                    position:  [mesh.position.x, mesh.position.y, mesh.position.z],
                    colorHex:  ud.colorHex || '#ffffff',
                    intensity: ud.intensity ?? 1.0,
                    distance:  ud.distance ?? 20,
                    castShadow: ud.castShadow ?? false,
                });
            }
        }

        // Let mode panel inject mode-specific data
        if (this._modePanel && typeof this._modePanel.onSerialize === 'function') {
            this._modePanel.onSerialize(data);
        }

        return data;
    }

    // ── Playtest ──────────────────────────────────────────────────────────────

    playtest() {
        const data = this._serializeLevelData();
        sessionStorage.setItem('redglitch_playtest_data', JSON.stringify(data));
        const url = `/engines/unified-3d/index.html?engine=${encodeURIComponent(this._mode)}&playtest=true`;
        window.open(url, '_blank');
    }

    // ── Input ─────────────────────────────────────────────────────────────────

    _attachInputListeners() {
        const canvas = this.renderer?.domElement;
        if (!canvas) return;

        canvas.addEventListener('pointerdown',  e => this._onPointerDown(e));
        canvas.addEventListener('pointermove',  e => this._onPointerMove(e));
        canvas.addEventListener('pointerup',    e => this._onPointerUp(e));
        canvas.addEventListener('wheel',        e => this._onWheel(e), { passive: false });
        canvas.addEventListener('contextmenu',  e => e.preventDefault());

        document.addEventListener('keydown', e => this._onKeyDown(e));
        document.addEventListener('keyup',   e => this._onKeyUp(e));
    }

    _onPointerDown(e) {
        e.preventDefault();
        this._drag = {
            button: e.button,
            cx: e.clientX, cy: e.clientY,
            theta: this._orbit.theta,
            phi: this._orbit.phi,
            tx: this._orbit.target.x,
            tz: this._orbit.target.z,
            moved: 0,
        };

        // Left click + no drag → selection raycast
        if (e.button === 0) {
            this._drag._selectPending = true;
        }
    }

    _onPointerMove(e) {
        if (!this._drag) return;
        const dx = e.clientX - this._drag.cx;
        const dy = e.clientY - this._drag.cy;
        this._drag.moved += Math.abs(dx) + Math.abs(dy);

        if (this._drag.moved > 3) {
            this._drag._selectPending = false;
        }

        if (this._drag.button === 2 || (this._drag.button === 0 && e.altKey)) {
            // Orbit rotate
            this._orbit.theta = this._drag.theta - dx * 0.005;
            this._orbit.phi   = Math.max(0.1, Math.min(Math.PI - 0.1, this._drag.phi - dy * 0.005));
            this._updateOrbitCamera();
        } else if (this._drag.button === 1) {
            // Pan
            const speed = this._orbit.radius * 0.003;
            const fwdX  = Math.sin(this._orbit.theta);
            const fwdZ  = Math.cos(this._orbit.theta);
            this._orbit.target.x = this._drag.tx + (-fwdZ * dx + fwdX * dy) * speed;
            this._orbit.target.z = this._drag.tz + (fwdX * dx + fwdZ * dy) * speed;
            this._updateOrbitCamera();
        }
    }

    _onPointerUp(e) {
        if (this._drag?._selectPending && this._drag.moved < 4) {
            this._pickObject(e);
        }
        this._drag = null;
    }

    _onWheel(e) {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.1 : 0.9;
        this._orbit.radius = Math.max(2, Math.min(200, this._orbit.radius * factor));
        this._updateOrbitCamera();
    }

    _onKeyDown(e) {
        this._keysDown.add(e.key.toLowerCase());

        // Ctrl+Z: undo
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this.undo(); }
        // Ctrl+Y: redo
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); this.redo(); }
        // Ctrl+S: save
        if (e.ctrlKey && e.key === 's') { e.preventDefault(); this.saveLevel(); }
        // Delete: remove selected
        if (e.key === 'Delete') { this._deleteSelected(); }
        // F5: playtest
        if (e.key === 'F5') { e.preventDefault(); this.playtest(); }
    }

    _onKeyUp(e) {
        this._keysDown.delete(e.key.toLowerCase());
    }

    _pickObject(e) {
        const THREE = this.THREE;
        if (!THREE) return;
        const canvas = this.renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);

        const all = [
            ...(this.meshGroup?.children ?? []),
            ...(this.entityGroup?.children ?? []),
            ...(this.lightGroup?.children ?? []),
        ];
        const hits = raycaster.intersectObjects(all, false);
        if (hits.length > 0) {
            this.select(hits[0].object);
        } else {
            this.deselectAll();
        }
    }

    _deleteSelected() {
        if (this._selected.length === 0) return;
        this._pushUndo();
        for (const obj of this._selected) {
            obj.parent?.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        }
        this._selected = [];
        this._highlightSelection();
        this._updateSceneTree();
        this._updatePropertiesPanel();
        this._markDirty();
    }

    // ── Camera ────────────────────────────────────────────────────────────────

    _updateOrbitCamera() {
        if (!this.camera) return;
        const o = this._orbit;
        const x = o.target.x + o.radius * Math.sin(o.phi) * Math.sin(o.theta);
        const y = o.target.y + o.radius * Math.cos(o.phi);
        const z = o.target.z + o.radius * Math.sin(o.phi) * Math.cos(o.theta);
        this.camera.position.set(x, y, z);
        this.camera.lookAt(o.target.x, o.target.y, o.target.z);
    }

    // ── Render loop ───────────────────────────────────────────────────────────

    _loop() {
        this._rafId = requestAnimationFrame(() => this._loop());

        // WASD camera movement
        if (this._keysDown.size > 0) {
            const speed = this._orbit.radius * 0.015;
            const fwdX = Math.sin(this._orbit.theta);
            const fwdZ = Math.cos(this._orbit.theta);
            if (this._keysDown.has('w')) { this._orbit.target.x -= fwdX * speed; this._orbit.target.z -= fwdZ * speed; }
            if (this._keysDown.has('s')) { this._orbit.target.x += fwdX * speed; this._orbit.target.z += fwdZ * speed; }
            if (this._keysDown.has('a')) { this._orbit.target.x -= fwdZ * speed; this._orbit.target.z += fwdX * speed; }
            if (this._keysDown.has('d')) { this._orbit.target.x += fwdZ * speed; this._orbit.target.z -= fwdX * speed; }
            if (this._keysDown.has('q')) this._orbit.target.y += speed;
            if (this._keysDown.has('e')) this._orbit.target.y -= speed;
            this._updateOrbitCamera();
        }

        // Skybox follows camera
        if (this.skybox) this.skybox.update(this.camera);

        // Render
        if (this.renderer3d) {
            this.renderer3d.render();
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    _entityColor(type) {
        const map = {
            'player-spawn': '#27ae60', 'player_spawn': '#27ae60',
            'enemy-grunt': '#e74c3c',  'enemy': '#e74c3c',
            'pickup-health': '#2ecc71', 'pickup': '#3498db',
            'door': '#e67e22', 'trigger': '#f39c12',
            'level-exit': '#ff6b35', 'checkpoint': '#9b59b6',
            'npc': '#1abc9c', 'collectible': '#f1c40f',
        };
        return map[type] || '#aaaaaa';
    }

    _markDirty() {
        this._dirty = true;
    }

    get isDirty() { return this._dirty; }

    dispose() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
        if (this._modePanel?.dispose) this._modePanel.dispose();
        this.renderer3d?.dispose();
    }
}
