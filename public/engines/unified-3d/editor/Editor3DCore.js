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

import { MaterialSystem } from '/engines/shared/MaterialSystem.js';
import { TextureComposer } from '/engines/shared/TextureComposer.js';
import { ShaderRegistry } from '/engines/shared/ShaderRegistry.js';
import { ShaderEditorUI } from './ShaderEditorUI.js';

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

        // ── Active Tool ───────────────────────────────────────────────────
        this._activeTool    = 'select'; // 'select' | 'move' | 'rotate' | 'scale' | 'draw'
        this._transformDrag = null;     // active drag state for transform tools
        this._onToolChanged = null;     // callback set by HTML to sync UI buttons

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
        this._lastFrameAt = 0;

        // ── Deferred modules ──────────────────────────────────────────────
        this._Renderer3D   = null;
        this._SkyboxSystem = null;
        this._createDefaultSkyboxConfig = null;
        this._normalizeSkyboxConfig = null;
        this._PaletteManager = null;
    }

    // ── Initialisation ────────────────────────────────────────────────────────

    async init() {
        // Dynamic imports for shared systems
        const [
            THREE_MODULE,
            { default: Renderer3D },
            {
                default: SkyboxSystem,
                createDefaultSkyboxConfig,
                normalizeSkyboxConfig,
            },
            { MaterialPreviewRenderer },
            { TransformControls }
        ] = await Promise.all([
            import('/lib/three/three.module.js'),
            import('/engines/shared/Renderer3D.js'),
            import('/engines/shared/SkyboxSystem.js'),
            import('/engines/shared/MaterialPreviewRenderer.js'),
            import('/lib/three/addons/controls/TransformControls.js?v=cachebust'),
        ]);

        this.THREE         = THREE_MODULE;
        this._Renderer3D   = Renderer3D;
        this._SkyboxSystem = SkyboxSystem;
        this._createDefaultSkyboxConfig = createDefaultSkyboxConfig;
        this._normalizeSkyboxConfig = normalizeSkyboxConfig;

        const THREE = this.THREE;

        this.materialPreviewRenderer = new MaterialPreviewRenderer(THREE);
        this.shaderEditorUI = new ShaderEditorUI(this);

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
        this.skybox = new SkyboxSystem(this.scene, { engineType: this._mode });
        this._applySkyboxToViewport({ skybox: this._getDefaultSkybox(this._mode) }, this._mode);

        // ── Lighting ──────────────────────────────────────────────────────
        this._ambLight = new THREE.AmbientLight(0xffffff, 1.2);
        this.scene.add(this._ambLight);
        this._sunLight = new THREE.DirectionalLight(0xfffbe0, 1.8);
        this._sunLight.position.set(30, 60, 30);
        this._sunLight.castShadow = true;
        this._sunLight.shadow.mapSize.set(2048, 2048);
        this.scene.add(this._sunLight);

        // ── Grid ──────────────────────────────────────────────────────────
        this.gridHelper = new THREE.GridHelper(50, 100, 0xcccccc, 0x444444);
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
        this._keysDown = new Set();
        this._drag = null;

        // ── Ghost Cursor ──────────────────────────────────────────────────
        const ghostGeo = new THREE.BoxGeometry(1.02, 1.02, 1.02);
        const ghostMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.3, depthWrite: false });
        this.ghostMesh = new THREE.Mesh(ghostGeo, ghostMat);
        this.ghostMesh.visible = false;
        this.scene.add(this.ghostMesh);

        // ── Transform Controls (Gizmos) ──────────────────────────────────
        this.transformCtrl = new TransformControls(this.camera, this.renderer.domElement);
        this.transformCtrl.size = 0.85;
        this.transformCtrl.getHelper().visible = false;
        this.transformCtrl.enabled = false;
        this.scene.add(this.transformCtrl.getHelper());

        this._gizmoDragging = false;
        this.transformCtrl.addEventListener('dragging-changed', (e) => {
            this._gizmoDragging = e.value;
            if (e.value) {
                this._pushUndo();
            } else {
                if (this.transformCtrl.object) {
                    this._commitTransformToLevelData(this.transformCtrl.object);
                    this._updatePropertiesPanel();
                    this._markDirty();
                }
            }
        });

        this.transformCtrl.addEventListener('change', () => {
            if (this.transformCtrl.object && this._gizmoDragging) {
                this._commitTransformToLevelData(this.transformCtrl.object);
                this._updatePropertiesPanel();
                this._markDirty();
            }
        });

        this._attachInputListeners();

        // ── Start render loop ─────────────────────────────────────────────
        this._loop();

        this.setActiveTool(this._activeTool);

        console.log('[Editor3DCore] init() complete');
    }

    // ── Mode management ──────────────────────────────────────────────────────

    get mode() { return this._mode; }

    async setMode(modeId) {
        this._mode = modeId;
        console.log(`[Editor3DCore] mode → ${modeId}`);
        if (!this._levelData) {
            this._applySkyboxToViewport({ skybox: this._getDefaultSkybox(modeId) }, modeId);
        }
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
            this._levelData = this._normalizeLevelData(data);
            if (this.renderer3d && this._levelData.postprocessing) {
                this.renderer3d.rebuildPostProcessing(this._levelData.postprocessing);
            }
            this._applySkyboxToViewport(this._levelData, this._mode);
            this._rebuildScene(this._levelData);
            this._syncEnvironmentPanel();
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
        this._levelData = this._normalizeLevelData(data);
        if (this.renderer3d && this._levelData.postprocessing) {
            this.renderer3d.rebuildPostProcessing(this._levelData.postprocessing);
        }
        this._applySkyboxToViewport(this._levelData, this._mode);
        this._rebuildScene(this._levelData);
        this._syncEnvironmentPanel();
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

    _getDefaultSkybox(modeId = this._mode) {
        if (typeof this._createDefaultSkyboxConfig === 'function') {
            return this._createDefaultSkyboxConfig(modeId);
        }
        return {
            type: 'gradient',
            mode: 'gradient',
            topColor: '#3a6a8a',
            bottomColor: '#ccddee',
            colorHex: '#ccddee',
            fogSync: true,
            fallbackMode: 'gradient',
            sun: { color: '#fffbe0', intensity: 1.2, azimuth: 45, elevation: 45 },
        };
    }

    _normalizeSkyboxData(skyboxData, fallbackFog = null, modeId = this._mode) {
        if (typeof this._normalizeSkyboxConfig === 'function') {
            return this._normalizeSkyboxConfig(
                skyboxData ?? this._getDefaultSkybox(modeId),
                {
                    engineType: modeId,
                    fallbackFog,
                },
            );
        }
        return this._getDefaultSkybox(modeId);
    }

    _normalizeLevelData(data, modeId = this._mode) {
        const level = data && typeof data === 'object' ? { ...data } : {};
        level.skybox = this._normalizeSkyboxData(
            level.skybox ?? level.sky ?? level.lighting ?? null,
            level.fog ?? null,
            modeId,
        );
        if (!level.postprocessing) {
            level.postprocessing = [
                { type: 'outline', edgeThickness: 1.5, edgeStrength: 3.0 },
                { type: 'cel', tones: 3.0, satBoost: 1.1 }
            ];
        }
        return level;
    }

    _applySkyboxToViewport(levelData = this._levelData, modeId = this._mode) {
        if (!this.skybox) return;
        const skybox = this._normalizeSkyboxData(
            levelData?.skybox ?? levelData?.sky ?? levelData?.lighting ?? null,
            levelData?.fog ?? null,
            modeId,
        );
        this.skybox.applyConfig(skybox, {
            engineType: modeId,
            fallbackFog: levelData?.fog ?? null,
        });
        this.skybox.update(this.camera);

        // Update Sun & Ambient
        if (this._sunLight && skybox.sun) {
            this._sunLight.color.set(skybox.sun.color || '#ffffff');
            this._sunLight.intensity = typeof skybox.sun.intensity === 'number' ? skybox.sun.intensity : 1.2;
            
            const az = (skybox.sun.azimuth ?? 45) * Math.PI / 180;
            const el = (skybox.sun.elevation ?? 45) * Math.PI / 180;
            const r = 100;
            this._sunLight.position.set(
                r * Math.cos(el) * Math.sin(az),
                r * Math.sin(el),
                r * Math.cos(el) * Math.cos(az)
            );
        }
        
        if (this._ambLight && skybox.ambientColor) {
            this._ambLight.color.set(skybox.ambientColor);
        }
        if (this._ambLight && typeof skybox.ambientIntensity === 'number') {
            this._ambLight.intensity = skybox.ambientIntensity;
        }

        // Apply Fog directly if fogSync is true
        if (skybox.fogSync) {
            const fogColor = skybox.fogColor || skybox.bottomColor || '#000000';
            const fogDensity = skybox.fogDensity ?? 0.02;
            if (this.scene) {
                this.scene.fog = new this.THREE.FogExp2(fogColor, fogDensity);
            }
        } else if (this.scene && !levelData?.fog) {
            this.scene.fog = null;
        }

        if (levelData && typeof levelData === 'object') {
            levelData.skybox = skybox;
        }
    }

    // ── Selection ─────────────────────────────────────────────────────────────

    select(obj) {
        this._selected = obj ? [obj] : [];
        this._highlightSelection();
        this._updatePropertiesPanel();
        this._updateTransformGizmo();
    }

    selectMultiple(objs) {
        this._selected = [...objs];
        this._highlightSelection();
        this._updatePropertiesPanel();
        this._updateTransformGizmo();
    }

    deselectAll() {
        this._selected = [];
        this._highlightSelection();
        this._updatePropertiesPanel();
        this._updateTransformGizmo();
    }

    // ── Active Tool ───────────────────────────────────────────────────────────

    setActiveTool(tool) {
        this._activeTool = tool;
        if (typeof this._onToolChanged === 'function') this._onToolChanged(tool);
        // Update cursor hint in status bar
        const hints = {
            select: 'Click to select | Drag to orbit',
            move:   'Drag selected object to move | Alt+Drag to orbit',
            rotate: 'Drag selected object to rotate Y | Alt+Drag to orbit',
            scale:  'Drag selected object to scale | Alt+Drag to orbit',
            draw:   'Left-Click to place blocks | Right-Click to erase blocks | Alt+Drag to orbit',
        };
        const info = document.getElementById('status-info');
        if (info) info.textContent = hints[tool] || '';
        this._updateTransformGizmo();
    }

    _updateTransformGizmo() {
        if (!this.transformCtrl) return;

        const tool = this._activeTool;
        const hasSelection = this._selected.length === 1 && !this._selected[0]._isEnvironment && !this._selected[0]._isMaterial;

        if (hasSelection && (tool === 'move' || tool === 'rotate' || tool === 'scale')) {
            const obj = this._selected[0];
            
            // Map tool to transform mode
            const modeMap = {
                move: 'translate',
                rotate: 'rotate',
                scale: 'scale'
            };
            
            this.transformCtrl.setMode(modeMap[tool]);
            
            if (this.transformCtrl.object !== obj) {
                this.transformCtrl.attach(obj);
            }
            this.transformCtrl.getHelper().visible = true;
            this.transformCtrl.enabled = true;
        } else {
            this.transformCtrl.detach();
            this.transformCtrl.getHelper().visible = false;
            this.transformCtrl.enabled = false;
        }
    }

    // ── Shape Spawning ────────────────────────────────────────────────────────

    spawnShape(shapeType = 'box') {
        if (!this._levelData) {
            this._levelData = { geometry: [], entities: [], lights: [], materials: [] };
        }
        if (!this._levelData.geometry) this._levelData.geometry = [];

        this._pushUndo();

        // Offset so successive spawns don't stack
        const offset = this._levelData.geometry.length * 0.1;
        const id = `geo_${Date.now().toString(36)}`;

        const def = {
            id,
            shape_type: shapeType,
            type: 'mesh',
            width:  shapeType === 'plane' ? 5 : 1,
            height: shapeType === 'plane' ? 0.01 : 1,
            depth:  shapeType === 'plane' ? 5 : 1,
            position: [offset, 0.5, offset],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
            colorHex: '#888888',
            material_id: null,
            castShadow: true,
            receiveShadow: true,
        };

        this._levelData.geometry.push(def);
        this._rebuildScene(this._levelData);
        this._markDirty();

        const mesh = this.scene.getObjectByName(id);
        if (mesh) this.select(mesh);
    }

    spawnLight() {
        if (!this._levelData) return;
        if (!this._levelData.lights) this._levelData.lights = [];

        this._pushUndo();
        const id = `light_${Date.now().toString(36)}`;
        this._levelData.lights.push({
            id, type: 'point',
            position: [0, 3, 0],
            colorHex: '#ffffff',
            intensity: 1.0,
            distance: 20,
            castShadow: false,
        });
        this._rebuildScene(this._levelData);
        this._markDirty();
        const mesh = this.scene.getObjectByName(id);
        if (mesh) this.select(mesh);
    }

    spawnEntity() {
        if (!this._levelData) return;
        if (!this._levelData.entities) this._levelData.entities = [];

        this._pushUndo();
        const id = `entity_${Date.now().toString(36)}`;
        this._levelData.entities.push({
            id, type: 'spawn',
            position: [0, 0, 0],
        });
        this._rebuildScene(this._levelData);
        this._markDirty();
        const mesh = this.scene.getObjectByName(id);
        if (mesh) this.select(mesh);
    }

    _highlightSelection() {
        // Use outline pass to highlight selected objects
        if (this.renderer3d?.outlinePass) {
            this.renderer3d.outlinePass.selectedObjects = this._selected.filter(o => !o._isEnvironment);
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

        if (obj._isEnvironment) {
            const sky = this._levelData.skybox || this._getDefaultSkybox(this._mode);
            panel.innerHTML = `
                <div class="prop-group">
                    <div class="prop-label">Mode</div>
                    <select class="prop-input" data-env-field="type">
                        <option value="solid" ${sky.type==='solid'?'selected':''}>Solid</option>
                        <option value="gradient" ${sky.type==='gradient'?'selected':''}>Gradient</option>
                        <option value="voxel" ${sky.type==='voxel'?'selected':''}>Voxel (Procedural)</option>
                    </select>
                </div>
                <div class="prop-group">
                    <div class="prop-label">Top Color</div>
                    <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${sky.topColor || '#000000'}" data-env-field="topColor">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Bottom Color</div>
                    <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${sky.bottomColor || '#000000'}" data-env-field="bottomColor">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Fog Sync</div>
                    <input type="checkbox" ${sky.fogSync ? 'checked' : ''} data-env-field="fogSync">
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group">
                    <div class="prop-label">Sun Color</div>
                    <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${sky.sun?.color || '#ffffff'}" data-env-field="sun.color">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Sun Intensity</div>
                    <input type="number" step="0.1" class="prop-input" value="${sky.sun?.intensity || 1.2}" data-env-field="sun.intensity">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Sun Azimuth</div>
                    <input type="number" step="1" class="prop-input" value="${sky.sun?.azimuth || 45}" data-env-field="sun.azimuth">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Sun Elevation</div>
                    <input type="number" step="1" class="prop-input" value="${sky.sun?.elevation || 45}" data-env-field="sun.elevation">
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group">
                    <div class="prop-label">Voxel Seed</div>
                    <input type="number" step="1" class="prop-input" value="${sky.seed || 1337}" data-env-field="seed">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Cloud Speed</div>
                    <input type="number" step="0.01" class="prop-input" value="${sky.cloudSpeed || 0.02}" data-env-field="cloudSpeed">
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Post-Processing Stack</div>
                ${this._renderPostProcessingStack()}
            `;

            panel.querySelectorAll('input, select').forEach(input => {
                if (input.classList.contains('pp-input')) return; // handled separately
                input.addEventListener('change', () => {
                    const field = input.dataset.envField;
                    if (!field) return;
                    let val = input.type === 'checkbox' ? input.checked : input.value;
                    if (input.type === 'number') val = parseFloat(val);
                    this._applyEnvironmentChange(field, val);
                });
            });

            this._bindPostProcessingEvents(panel);
            return;
        }

        if (obj._isMaterial) {
            const mat = this._levelData.materials.find(m => m.id === obj.id);
            if (!mat) return;

            panel.innerHTML = `
                <div class="prop-group">
                    <div class="prop-label">Material Name</div>
                    <input type="text" class="prop-input" value="${mat.name || ''}" data-mat-field="name">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Shader Type</div>
                    <select class="prop-input" data-mat-field="shader_id">
                        ${ShaderRegistry.getAvailableShaders().map(s => 
                            `<option value="${s.id}" ${(mat.shader_id || 'standard') === s.id ? 'selected' : ''}>${s.name}</option>`
                        ).join('')}
                    </select>
                </div>
                ${(mat.shader_id && mat.shader_id !== 'standard') ? `
                <div class="prop-group" style="padding:4px 12px;">
                    <button class="kas-btn" id="btn-edit-shader" style="width:100%; border-color:var(--text-accent); color:var(--text-accent);"><i class="fas fa-code"></i> EDIT SHADER SOURCE</button>
                </div>
                ` : ''}
                ${this._renderShaderUniformsUI(mat)}
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Color Channel</div>
                <div class="prop-group">
                    <div class="prop-label">Color</div>
                    <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${mat.channels?.color?.color || '#ffffff'}" data-mat-field="channels.color.color">
                </div>
                </div>
                ${this._renderLayersUI(mat)}
                <div class="prop-group">
                    <div class="prop-label">Tiling</div>
                    <div class="prop-vec3" style="grid-template-columns: 1fr 1fr;">
                        <input type="number" step="0.1" value="${mat.channels?.color?.tilingX ?? 1.0}" data-mat-field="channels.color.tilingX">
                        <input type="number" step="0.1" value="${mat.channels?.color?.tilingY ?? 1.0}" data-mat-field="channels.color.tilingY">
                    </div>
                </div>
                <div class="prop-group">
                    <div class="prop-label">Offset</div>
                    <div class="prop-vec3" style="grid-template-columns: 1fr 1fr;">
                        <input type="number" step="0.1" value="${mat.channels?.color?.offsetX ?? 0.0}" data-mat-field="channels.color.offsetX">
                        <input type="number" step="0.1" value="${mat.channels?.color?.offsetY ?? 0.0}" data-mat-field="channels.color.offsetY">
                    </div>
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Luminance Channel</div>
                <div class="prop-group">
                    <div class="prop-label">Emission</div>
                    <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${mat.channels?.luminance?.color || '#000000'}" data-mat-field="channels.luminance.color">
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Reflectance Channel</div>
                <div class="prop-group">
                    <div class="prop-label">Roughness</div>
                    <input type="number" step="0.05" min="0" max="1" class="prop-input" value="${mat.channels?.reflectance?.roughness ?? 0.8}" data-mat-field="channels.reflectance.roughness">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Metalness</div>
                    <input type="number" step="0.05" min="0" max="1" class="prop-input" value="${mat.channels?.reflectance?.metalness ?? 0.0}" data-mat-field="channels.reflectance.metalness">
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Normal Channel</div>
                <div class="prop-group">
                    <div class="prop-label">Normal Map</div>
                    <input type="text" class="prop-input" placeholder="/assets/textures/normal.png" value="${mat.channels?.normal?.map || ''}" data-mat-field="channels.normal.map">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Intensity</div>
                    <input type="number" step="0.1" class="prop-input" value="${mat.channels?.normal?.intensity ?? 1.0}" data-mat-field="channels.normal.intensity">
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Transparency Channel</div>
                <div class="prop-group">
                    <div class="prop-label">Opacity</div>
                    <input type="number" step="0.1" min="0" max="1" class="prop-input" value="${mat.channels?.transparency?.opacity ?? 1.0}" data-mat-field="channels.transparency.opacity">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Alpha Map</div>
                    <input type="text" class="prop-input" placeholder="/assets/textures/alpha.png" value="${mat.channels?.transparency?.alphaMap || ''}" data-mat-field="channels.transparency.alphaMap">
                </div>
                ${this._renderMaterialPropertiesUI(mat)}
                <div class="prop-group" style="padding:12px;">
                    <button class="kas-btn" id="btn-delete-mat" style="width:100%; border-color:var(--kas-red); color:var(--kas-red);"><i class="fas fa-trash"></i> DELETE MATERIAL</button>
                </div>
            `;

            panel.querySelectorAll('input, select').forEach(input => {
                // Skip if it's a custom property key/value or inline shader uniform, we handle them separately
                if (input.classList.contains('custom-prop-key') || input.classList.contains('custom-prop-val') || input.classList.contains('inline-shader-uniform')) return;
                
                input.addEventListener('change', () => {
                    const field = input.dataset.matField;
                    let val = input.value;
                    if (input.type === 'number') val = parseFloat(val);
                    this._applyMaterialChange(mat.id, field, val);
                });
            });

            panel.querySelectorAll('.inline-shader-uniform').forEach(input => {
                input.addEventListener('change', (e) => {
                    const key = e.target.dataset.key;
                    const matId = e.target.dataset.matId;
                    
                    const matDef = this._levelData.materials.find(m => m.id === matId);
                    if (!matDef) return;
                    if (!matDef.shader_uniforms) matDef.shader_uniforms = {};
                    
                    this._pushUndo();
                    
                    let parsed = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
                    
                    const applyToLiveMaterial = (baseKey, axis, rawVal) => {
                        if (this.scene) {
                            this.scene.traverse(child => {
                                if (child.isMesh && child.material && child.material.userData.materialId === matId) {
                                    const uniforms = child.material.userData.shader_uniforms;
                                    if (uniforms && uniforms[baseKey] && uniforms[baseKey].value) {
                                        if (axis) {
                                            uniforms[baseKey].value[axis] = rawVal;
                                        } else if (uniforms[baseKey].value.isColor) {
                                            uniforms[baseKey].value.set(rawVal);
                                        } else {
                                            uniforms[baseKey].value = rawVal;
                                        }
                                    }
                                }
                            });
                        }
                    };

                    if (key.endsWith('_x') || key.endsWith('_y')) {
                        const baseKey = key.slice(0, -2);
                        const axis = key.slice(-1);
                        if (!matDef.shader_uniforms[baseKey]) matDef.shader_uniforms[baseKey] = {};
                        matDef.shader_uniforms[baseKey][axis] = parsed;
                        applyToLiveMaterial(baseKey, axis, parsed);
                    } else {
                        matDef.shader_uniforms[key] = parsed;
                        applyToLiveMaterial(key, null, parsed);
                    }
                    
                    this._markDirty();
                });
            });

            panel.querySelectorAll('.custom-prop-key').forEach(input => {
                input.addEventListener('change', (e) => {
                    this._updateMaterialPropertyKey(mat.id, e.target.dataset.oldKey, e.target.value);
                });
            });

            panel.querySelectorAll('.custom-prop-val').forEach(input => {
                input.addEventListener('change', (e) => {
                    this._updateMaterialPropertyValue(mat.id, e.target.dataset.key, e.target.value);
                });
            });

            const btnAddProp = document.getElementById('btn-add-mat-prop');
            if (btnAddProp) {
                btnAddProp.addEventListener('click', () => {
                    this._addMaterialProperty(mat.id);
                });
            }

            panel.querySelectorAll('.btn-del-mat-prop').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this._removeMaterialProperty(mat.id, e.target.dataset.key);
                });
            });

            const btnDel = document.getElementById('btn-delete-mat');
            if (btnDel) {
                btnDel.addEventListener('click', () => {
                    if (confirm('Delete this material?')) {
                        this._deleteMaterial(mat.id);
                    }
                });
            }

            const btnEditShader = document.getElementById('btn-edit-shader');
            if (btnEditShader) {
                btnEditShader.addEventListener('click', () => {
                    if (this.shaderEditorUI) {
                        this.shaderEditorUI.open(mat.shader_id, mat.id);
                    }
                });
            }

            // Wire layer specific buttons
            panel.querySelectorAll('.btn-add-layer').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const channel = e.target.dataset.channel;
                    this._addMaterialLayer(mat.id, channel);
                });
            });
            panel.querySelectorAll('.btn-del-layer').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const channel = e.target.dataset.channel;
                    const index = parseInt(e.target.dataset.index, 10);
                    this._removeMaterialLayer(mat.id, channel, index);
                });
            });

            return;
        }

        const p = obj.position;
        const r = obj.rotation;
        const s = obj.scale;

        const shapeType = obj.userData?.shape_type || 'box';
        const shapeLabel = { box: '📦 Box', sphere: '🔵 Sphere', cylinder: '🏛 Cylinder', cone: '△ Cone', plane: '▭ Plane', capsule: '💊 Capsule' }[shapeType] || '📦 Mesh';

        panel.innerHTML = `
            <div style="padding:8px 12px 4px; display:flex; align-items:center; justify-content:space-between;">
                <span style="font-size:11px; font-weight:bold; color:var(--text-accent);">${shapeLabel}</span>
                <button class="kas-btn icon" id="btn-delete-selected" style="height:20px; width:20px; font-size:10px; border-color:var(--kas-red); color:var(--kas-red);" title="Delete Object (Del)"><i class="fas fa-trash"></i></button>
            </div>
            <div class="prop-group">
                <div class="prop-label">Name</div>
                <input type="text" class="prop-input" value="${obj.name || ''}" data-field="name">
            </div>
            ${this._renderMaterialAssignmentsUI(obj)}
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
            
            <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
            <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Instance Overrides</div>
            <div class="prop-group">
                <div class="prop-label">Color</div>
                <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${obj.userData.material_overrides?.colorHex || '#000000'}" data-override-field="colorHex">
            </div>
            <div class="prop-group">
                <div class="prop-label">Emission</div>
                <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${obj.userData.material_overrides?.emissive || '#000000'}" data-override-field="emissive">
            </div>
            <div class="prop-group">
                <div class="prop-label">Roughness</div>
                <input type="number" step="0.05" min="0" max="1" class="prop-input" value="${obj.userData.material_overrides?.roughness !== undefined ? obj.userData.material_overrides.roughness : ''}" data-override-field="roughness" placeholder="Inherit">
            </div>
            <div class="prop-group" style="padding:12px;">
                <button class="kas-btn" id="btn-clear-overrides" style="width:100%;"><i class="fas fa-undo"></i> CLEAR OVERRIDES</button>
            </div>
        `;

        // Wire input changes
        panel.querySelectorAll('input, select').forEach(input => {
            if (input.classList.contains('custom-mat-assignment')) {
                input.addEventListener('change', () => {
                    const groupIndex = parseInt(input.dataset.groupIndex, 10);
                    this._applySubMeshMaterialChange(obj, groupIndex, input.value);
                });
            } else if (input.dataset.overrideField) {
                input.addEventListener('change', () => {
                    const field = input.dataset.overrideField;
                    const val = input.type === 'number' ? parseFloat(input.value) : input.value;
                    this._applyInstanceOverride(obj, field, val);
                });
            } else {
                input.addEventListener('change', () => {
                    const field = input.dataset.field;
                    if (!field) return;
                    const val = (field === 'name' || field === 'material_id') ? input.value : parseFloat(input.value);
                    this._applyPropertyChange(obj, field, val);
                });
            }
        });

        const btnClearOverrides = document.getElementById('btn-clear-overrides');
        if (btnClearOverrides) {
            btnClearOverrides.addEventListener('click', () => {
                this._clearInstanceOverrides(obj);
            });
        }

        const btnDelete = document.getElementById('btn-delete-selected');
        if (btnDelete) {
            btnDelete.addEventListener('click', () => this._deleteSelected());
        }
    }

    _renderMaterialAssignmentsUI(obj) {
        let html = '';
        if (obj.geometry && obj.geometry.groups && obj.geometry.groups.length > 0) {
            html += `<div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Material Assignments</div>`;
            const assignments = obj.userData.material_assignments || {};
            
            obj.geometry.groups.forEach((group, index) => {
                const matId = assignments[index] || '';
                html += `
                    <div class="prop-group">
                        <div class="prop-label">Group ${index} [${group.start}-${group.start+group.count}]</div>
                        <select class="prop-input custom-mat-assignment" data-group-index="${index}">
                            <option value="">(None)</option>
                            ${(this._levelData.materials || []).map(m => `<option value="${m.id}" ${matId === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
                        </select>
                    </div>
                `;
            });
        } else {
            html += `
                <div class="prop-group">
                    <div class="prop-label">Material</div>
                    <select class="prop-input" data-field="material_id">
                        <option value="">(None)</option>
                        ${(this._levelData.materials || []).map(m => `<option value="${m.id}" ${obj.userData?.material_id === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
                    </select>
                </div>
            `;
        }
        return html;
    }

    _renderLayersUI(mat) {
        const layers = mat.channels?.color?.layers;
        if (!layers || layers.length === 0) {
            return `
                <div class="prop-group">
                    <div class="prop-label">Texture</div>
                    <input type="text" class="prop-input" placeholder="/assets/textures/..." value="${mat.channels?.color?.texture || ''}" data-mat-field="channels.color.texture">
                </div>
                <div class="prop-group">
                    <button class="kas-btn btn-add-layer" data-channel="color" style="width:100%; font-size:10px;"><i class="fas fa-layer-group"></i> ADD COMPOSITE LAYER</button>
                </div>
            `;
        }

        let html = `
            <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent); font-size:10px;">Compositing Stack</div>
        `;

        layers.forEach((layer, i) => {
            html += `
                <div style="background:var(--bg-card); padding:8px; margin:4px 12px; border-radius:4px; border:1px solid var(--border-subtle);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-size:10px; font-weight:bold;">Layer ${i}</span>
                        <button class="kas-btn btn-del-layer" data-channel="color" data-index="${i}" style="padding:2px 6px; font-size:10px; color:var(--kas-red);"><i class="fas fa-times" style="pointer-events:none;"></i></button>
                    </div>
                    
                    <div class="prop-group" style="margin-bottom:4px;">
                        <div class="prop-label" style="width:40px;">Type</div>
                        <select class="prop-input" data-mat-field="channels.color.layers.${i}.type">
                            <option value="color" ${layer.type === 'color' ? 'selected' : ''}>Solid Color</option>
                            <option value="image" ${layer.type === 'image' ? 'selected' : ''}>Image Map</option>
                        </select>
                    </div>

                    <div class="prop-group" style="margin-bottom:4px;">
                        <div class="prop-label" style="width:40px;">Value</div>
                        ${layer.type === 'color' ? 
                            `<input type="color" class="prop-input" style="padding:0; height:24px;" value="${layer.value || '#ffffff'}" data-mat-field="channels.color.layers.${i}.value">` : 
                            `<input type="text" class="prop-input" placeholder="/assets/textures/..." value="${layer.value || ''}" data-mat-field="channels.color.layers.${i}.value">`
                        }
                    </div>

                    <div class="prop-group" style="margin-bottom:4px;">
                        <div class="prop-label" style="width:40px;">Blend</div>
                        <select class="prop-input" data-mat-field="channels.color.layers.${i}.blendMode">
                            <option value="source-over" ${layer.blendMode === 'source-over' ? 'selected' : ''}>Normal</option>
                            <option value="multiply" ${layer.blendMode === 'multiply' ? 'selected' : ''}>Multiply</option>
                            <option value="screen" ${layer.blendMode === 'screen' ? 'selected' : ''}>Screen</option>
                            <option value="overlay" ${layer.blendMode === 'overlay' ? 'selected' : ''}>Overlay</option>
                        </select>
                    </div>

                    <div class="prop-group">
                        <div class="prop-label" style="width:40px;">Opacity</div>
                        <input type="number" step="0.1" min="0" max="1" class="prop-input" value="${layer.opacity !== undefined ? layer.opacity : 1.0}" data-mat-field="channels.color.layers.${i}.opacity">
                    </div>
                </div>
            `;
        });

        html += `
            <div class="prop-group">
                <button class="kas-btn btn-add-layer" data-channel="color" style="width:100%; font-size:10px;"><i class="fas fa-plus"></i> ADD LAYER</button>
            </div>
        `;

        return html;
    }

    _renderMaterialPropertiesUI(mat) {
        let html = `
            <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
            <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Gameplay Properties</div>
        `;

        if (mat.properties && Object.keys(mat.properties).length > 0) {
            for (const [key, value] of Object.entries(mat.properties)) {
                html += `
                    <div style="display:flex; gap:4px; margin:4px 12px; align-items:center;">
                        <input type="text" class="prop-input custom-prop-key" style="flex:1;" value="${key}" data-old-key="${key}">
                        <span style="color:var(--text-muted);">:</span>
                        <input type="text" class="prop-input custom-prop-val" style="flex:1;" value="${value}" data-key="${key}">
                        <button class="kas-btn btn-del-mat-prop" data-key="${key}" style="padding:2px 6px; font-size:10px; color:var(--kas-red);"><i class="fas fa-times" style="pointer-events:none;"></i></button>
                    </div>
                `;
            }
        } else {
            html += `
                <div class="prop-group" style="padding:4px 12px; color:var(--text-muted); font-size:10px; font-style:italic;">
                    No custom properties defined.
                </div>
            `;
        }

        html += `
            <div class="prop-group" style="padding:4px 12px;">
                <button class="kas-btn" id="btn-add-mat-prop" style="width:100%; font-size:10px;"><i class="fas fa-plus"></i> ADD PROPERTY</button>
            </div>
        `;
        return html;
    }

    _renderShaderUniformsUI(mat) {
        if (!mat.shader_id || mat.shader_id === 'standard') return '';
        const def = ShaderRegistry.shaders[mat.shader_id];
        if (!def || !def.uniforms) return '';

        let html = `
            <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
            <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Shader Parameters</div>
        `;

        let count = 0;
        for (const [key, uniform] of Object.entries(def.uniforms)) {
            if (key === 'time' || key === 'uTime') continue; // skip globals
            count++;

            let val = uniform.value;
            // Override with material-specific variant value if available
            if (mat.shader_uniforms && mat.shader_uniforms[key] !== undefined) {
                const ov = mat.shader_uniforms[key];
                if (val && val.isColor && typeof ov === 'string') {
                    val = new THREE.Color(ov);
                } else if (val && typeof val === 'object' && val.isVector2) {
                    val = { x: ov.x ?? val.x, y: ov.y ?? val.y };
                } else {
                    val = ov;
                }
            }

            let inputHtml = '';
            if (typeof val === 'number') {
                inputHtml = `<input type="number" step="0.1" class="prop-input inline-shader-uniform" data-mat-id="${mat.id}" data-key="${key}" value="${val}" style="width:60px;">`;
            } else if (val && val.isColor) {
                const hex = '#' + val.getHexString();
                inputHtml = `<input type="color" class="prop-input inline-shader-uniform" data-mat-id="${mat.id}" data-key="${key}" value="${hex}" style="width:24px; height:24px; padding:0;">`;
            } else if (val && (val.isVector2 || typeof val.x === 'number')) {
                inputHtml = `
                    <div style="display:flex; gap:4px;">
                        <input type="number" step="0.1" class="prop-input inline-shader-uniform" data-mat-id="${mat.id}" data-key="${key}_x" value="${val.x}" style="width:40px;">
                        <input type="number" step="0.1" class="prop-input inline-shader-uniform" data-mat-id="${mat.id}" data-key="${key}_y" value="${val.y}" style="width:40px;">
                    </div>
                `;
            } else {
                inputHtml = `<span style="color:var(--text-muted); font-size:10px;">[Object]</span>`;
            }

            html += `
                <div class="prop-group" style="display:flex; justify-content:space-between; align-items:center;">
                    <div class="prop-label" style="margin-bottom:0;">${key}</div>
                    ${inputHtml}
                </div>
            `;
        }

        if (count === 0) return '';
        return html;
    }

    _renderPostProcessingStack() {
        this._levelData.postprocessing = this._levelData.postprocessing || [];
        const stack = this._levelData.postprocessing;

        let html = '<div style="display:flex; flex-direction:column; gap:8px; padding:0 12px; margin-bottom:8px;">';

        if (stack.length === 0) {
            html += '<div style="color:var(--text-muted); font-size:10px; font-style:italic;">No active passes.</div>';
        } else {
            stack.forEach((pass, i) => {
                let controls = '';
                if (pass.type === 'outline') {
                    controls = `
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Thickness</span>
                            <input type="number" step="0.1" class="pp-input" data-index="${i}" data-key="edgeThickness" value="${pass.edgeThickness ?? 1.5}" style="width:40px;">
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Strength</span>
                            <input type="number" step="0.1" class="pp-input" data-index="${i}" data-key="edgeStrength" value="${pass.edgeStrength ?? 3.0}" style="width:40px;">
                        </div>
                    `;
                } else if (pass.type === 'glow') {
                    controls = `
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Intensity</span>
                            <input type="number" step="0.1" class="pp-input" data-index="${i}" data-key="intensity" value="${pass.intensity ?? 1.0}" style="width:40px;">
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Threshold</span>
                            <input type="number" step="0.1" class="pp-input" data-index="${i}" data-key="threshold" value="${pass.threshold ?? 0.8}" style="width:40px;">
                        </div>
                    `;
                } else if (pass.type === 'cel') {
                    controls = `
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Tones</span>
                            <input type="number" step="1" class="pp-input" data-index="${i}" data-key="tones" value="${pass.tones ?? 3.0}" style="width:40px;">
                        </div>
                    `;
                } else if (pass.type === 'color_grading') {
                    controls = `
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Brightness</span>
                            <input type="number" step="0.1" class="pp-input" data-index="${i}" data-key="brightness" value="${pass.brightness ?? 1.0}" style="width:40px;">
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Contrast</span>
                            <input type="number" step="0.1" class="pp-input" data-index="${i}" data-key="contrast" value="${pass.contrast ?? 1.0}" style="width:40px;">
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Saturation</span>
                            <input type="number" step="0.1" class="pp-input" data-index="${i}" data-key="saturation" value="${pass.saturation ?? 1.0}" style="width:40px;">
                        </div>
                    `;
                } else if (pass.type === 'fog') {
                    controls = `
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Color</span>
                            <input type="color" class="pp-input" data-index="${i}" data-key="color" value="${pass.color || '#000000'}">
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Density</span>
                            <input type="number" step="0.1" class="pp-input" data-index="${i}" data-key="density" value="${pass.density ?? 0.5}" style="width:40px;">
                        </div>
                    `;
                }

                html += `
                    <div style="background:var(--bg-card); padding:8px; border-radius:4px; border:1px solid var(--border-subtle);">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:bold; font-size:11px; text-transform:uppercase;">${pass.type}</span>
                            <div style="display:flex; gap:4px;">
                                <button class="kas-btn btn-pp-up" data-index="${i}" style="padding:2px 6px; font-size:10px;" ${i===0?'disabled':''}><i class="fas fa-chevron-up"></i></button>
                                <button class="kas-btn btn-pp-down" data-index="${i}" style="padding:2px 6px; font-size:10px;" ${i===stack.length-1?'disabled':''}><i class="fas fa-chevron-down"></i></button>
                                <button class="kas-btn btn-pp-del" data-index="${i}" style="padding:2px 6px; font-size:10px; color:var(--kas-red);"><i class="fas fa-times"></i></button>
                            </div>
                        </div>
                        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">
                            ${controls}
                        </div>
                    </div>
                `;
            });
        }

        html += `
            <div style="display:flex; gap:4px; margin-top:4px;">
                <select id="pp-new-type" class="prop-input" style="flex:1;">
                    <option value="glow">Glow (Bloom)</option>
                    <option value="outline">Outline</option>
                    <option value="cel">Toon/Cel</option>
                    <option value="color_grading">Color Grading</option>
                    <option value="fog">Screen Fog</option>
                </select>
                <button class="kas-btn" id="btn-add-pp" style="padding:4px 8px; font-size:10px;"><i class="fas fa-plus"></i> ADD</button>
            </div>
        </div>`;

        return html;
    }

    _bindPostProcessingEvents(panel) {
        panel.querySelectorAll('.pp-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index);
                const key = e.target.dataset.key;
                let val = e.target.value;
                if (e.target.type === 'number') val = parseFloat(val);
                this._levelData.postprocessing[idx][key] = val;
                this._pushUndo();
                if (this.renderer3d) this.renderer3d.rebuildPostProcessing(this._levelData.postprocessing);
                this._markDirty();
            });
        });

        panel.querySelectorAll('.btn-pp-up').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.index);
                if (idx > 0) {
                    this._pushUndo();
                    const stack = this._levelData.postprocessing;
                    const temp = stack[idx - 1];
                    stack[idx - 1] = stack[idx];
                    stack[idx] = temp;
                    if (this.renderer3d) this.renderer3d.rebuildPostProcessing(this._levelData.postprocessing);
                    this._markDirty();
                    this._updatePropertiesPanel();
                }
            });
        });

        panel.querySelectorAll('.btn-pp-down').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.index);
                const stack = this._levelData.postprocessing;
                if (idx < stack.length - 1) {
                    this._pushUndo();
                    const temp = stack[idx + 1];
                    stack[idx + 1] = stack[idx];
                    stack[idx] = temp;
                    if (this.renderer3d) this.renderer3d.rebuildPostProcessing(this._levelData.postprocessing);
                    this._markDirty();
                    this._updatePropertiesPanel();
                }
            });
        });

        panel.querySelectorAll('.btn-pp-del').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.index);
                this._pushUndo();
                this._levelData.postprocessing.splice(idx, 1);
                if (this.renderer3d) this.renderer3d.rebuildPostProcessing(this._levelData.postprocessing);
                this._markDirty();
                this._updatePropertiesPanel();
            });
        });

        const btnAdd = panel.querySelector('#btn-add-pp');
        if (btnAdd) {
            btnAdd.addEventListener('click', () => {
                const type = panel.querySelector('#pp-new-type').value;
                this._pushUndo();
                this._levelData.postprocessing.push({ type });
                if (this.renderer3d) this.renderer3d.rebuildPostProcessing(this._levelData.postprocessing);
                this._markDirty();
                this._updatePropertiesPanel();
            });
        }
    }

    _applyEnvironmentChanges(changes) {
        this._pushUndo();
        this._levelData.skybox = this._levelData.skybox || this._getDefaultSkybox(this._mode);
        for (const [field, value] of Object.entries(changes)) {
            if (field.startsWith('sun.')) {
                this._levelData.skybox.sun = this._levelData.skybox.sun || {};
                this._levelData.skybox.sun[field.split('.')[1]] = value;
            } else {
                this._levelData.skybox[field] = value;
            }
        }
        
        // Re-apply immediately
        this._applySkyboxToViewport(this._levelData, this._mode);
        // We also need to re-apply lighting logic (which might be in _rebuildScene or Engine3DAdapter)
        if (this._modePanel && typeof this._modePanel.onSceneRebuilt === 'function') {
             // this forces sun light updates
             this._rebuildScene(this._levelData);
        } else {
             // For simple fallback if no mode panel overrides it
             this._rebuildScene(this._levelData);
        }
        this._markDirty();
        this._markDirty();
        this._updatePropertiesPanel();
        this._syncEnvironmentPanel();
    }

    _applyEnvironmentChange(field, value) {
        this._applyEnvironmentChanges({ [field]: value });
    }

    _syncEnvironmentPanel() {
        const sky = this._levelData?.skybox || this._getDefaultSkybox(this._mode);
        
        const ambColorInput = document.getElementById('env-ambient-color');
        if (ambColorInput) {
            let col = sky.ambientColor || '#ffffff';
            if (typeof col === 'number') {
                col = '#' + col.toString(16).padStart(6, '0');
            } else if (typeof col === 'string') {
                if (col.startsWith('0x')) col = '#' + col.slice(2);
                if (!col.startsWith('#')) col = '#' + col;
            }
            ambColorInput.value = col;
        }
        
        const ambIntensityInput = document.getElementById('env-ambient-intensity');
        if (ambIntensityInput) {
            ambIntensityInput.value = sky.ambientIntensity !== undefined ? sky.ambientIntensity : 0.3;
        }
        
        const fogToggleInput = document.getElementById('env-fog-toggle');
        if (fogToggleInput) {
            fogToggleInput.checked = !!sky.fogSync;
        }
        
        const fogFarInput = document.getElementById('env-fog-far');
        if (fogFarInput) {
            // Map density to distance (far): far = 4.6 / density
            const density = sky.fogDensity ?? 0.02;
            const far = 4.6 / Math.max(0.0001, density);
            fogFarInput.value = Math.round(far);
        }
        
        const skySelect = document.getElementById('env-sky');
        if (skySelect) {
            if (sky.type === 'solid') {
                skySelect.value = 'solid';
            } else {
                if (sky.topColor === '#030310' && sky.bottomColor === '#0a0a28') {
                    skySelect.value = 'night';
                } else if (sky.topColor === '#1a2a3a' && sky.bottomColor === '#87ceeb') {
                    skySelect.value = 'day';
                } else {
                    skySelect.value = 'gradient';
                }
            }
        }
    }

    setAmbientIntensity(val) {
        this._applyEnvironmentChange('ambientIntensity', val);
    }

    setAmbientColor(hex) {
        this._applyEnvironmentChange('ambientColor', hex);
    }

    setFog(enabled) {
        this._applyEnvironmentChange('fogSync', enabled);
    }

    setFogDistance(far) {
        const density = 4.6 / Math.max(1, far);
        this._applyEnvironmentChange('fogDensity', density);
    }

    setSkybox(type) {
        if (type === 'solid') {
            this._applyEnvironmentChanges({
                type: 'solid',
                mode: 'solid'
            });
        } else if (type === 'gradient') {
            this._applyEnvironmentChanges({
                type: 'gradient',
                mode: 'gradient'
            });
        } else if (type === 'day') {
            this._applyEnvironmentChanges({
                type: 'gradient',
                mode: 'gradient',
                topColor: '#1a2a3a',
                bottomColor: '#87ceeb',
                ambientColor: '#ffffff',
                ambientIntensity: 0.8,
                'sun.color': '#fffbe0',
                'sun.intensity': 1.4,
                'sun.azimuth': 45,
                'sun.elevation': 45
            });
        } else if (type === 'night') {
            this._applyEnvironmentChanges({
                type: 'gradient',
                mode: 'gradient',
                topColor: '#030310',
                bottomColor: '#0a0a28',
                ambientColor: '#111122',
                ambientIntensity: 0.2,
                'sun.color': '#334466',
                'sun.intensity': 0.15,
                'sun.azimuth': 45,
                'sun.elevation': 45
            });
        }
    }

    _applyMaterialChange(matId, field, value) {
        this._pushUndo();
        const mat = this._levelData.materials.find(m => m.id === matId);
        if (!mat) return;

        if (field.startsWith('channels.')) {
            const parts = field.split('.');
            const channel = parts[1];
            const prop = parts[2];
            if (!mat.channels[channel]) mat.channels[channel] = {};

            if (parts.length > 3 && prop === 'layers') {
                const index = parseInt(parts[3], 10);
                const layerProp = parts[4];
                if (!mat.channels[channel].layers) mat.channels[channel].layers = [];
                if (!mat.channels[channel].layers[index]) mat.channels[channel].layers[index] = {};
                mat.channels[channel].layers[index][layerProp] = value;
            } else {
                mat.channels[channel][prop] = value;
            }
        } else {
            if (field === 'shader_id' && mat[field] !== value) {
                mat.shader_uniforms = {}; // Clear previous uniforms on swap
            }
            mat[field] = value;
        }

        this._markDirty();
        this._updateMaterialManager();
        this._rebuildScene(this._levelData); // Re-render to see live color change
        this._updatePropertiesPanel();
    }

    _addMaterialLayer(matId, channel) {
        this._pushUndo();
        const mat = this._levelData.materials.find(m => m.id === matId);
        if (!mat) return;
        if (!mat.channels[channel]) mat.channels[channel] = {};
        if (!mat.channels[channel].layers) mat.channels[channel].layers = [];
        
        // Add default solid white multiply layer
        mat.channels[channel].layers.push({
            type: 'color',
            value: '#ffffff',
            blendMode: 'multiply',
            opacity: 1.0
        });

        this._markDirty();
        this._updateMaterialManager();
        this._rebuildScene(this._levelData);
        this._updatePropertiesPanel();
    }

    _removeMaterialLayer(matId, channel, index) {
        this._pushUndo();
        const mat = this._levelData.materials.find(m => m.id === matId);
        if (!mat || !mat.channels[channel] || !mat.channels[channel].layers) return;
        
        mat.channels[channel].layers.splice(index, 1);
        if (mat.channels[channel].layers.length === 0) delete mat.channels[channel].layers;

        this._markDirty();
        this._updateMaterialManager();
        this._rebuildScene(this._levelData);
        this._updatePropertiesPanel();
    }

    _addMaterialProperty(matId) {
        this._pushUndo();
        const mat = this._levelData.materials.find(m => m.id === matId);
        if (!mat) return;
        if (!mat.properties) mat.properties = {};
        
        let counter = 1;
        let newKey = 'new_property';
        while (mat.properties.hasOwnProperty(newKey)) {
            newKey = `new_property_${counter++}`;
        }
        
        mat.properties[newKey] = '';

        this._markDirty();
        this._updatePropertiesPanel();
    }

    _removeMaterialProperty(matId, key) {
        this._pushUndo();
        const mat = this._levelData.materials.find(m => m.id === matId);
        if (!mat || !mat.properties) return;
        
        delete mat.properties[key];

        this._markDirty();
        this._updatePropertiesPanel();
    }

    _updateMaterialPropertyKey(matId, oldKey, newKey) {
        if (oldKey === newKey || !newKey.trim()) return;
        this._pushUndo();
        const mat = this._levelData.materials.find(m => m.id === matId);
        if (!mat || !mat.properties) return;
        
        if (mat.properties.hasOwnProperty(newKey)) {
            console.warn('Property key already exists:', newKey);
            return;
        }

        mat.properties[newKey] = mat.properties[oldKey];
        delete mat.properties[oldKey];

        this._markDirty();
        this._updatePropertiesPanel();
    }

    _updateMaterialPropertyValue(matId, key, value) {
        this._pushUndo();
        const mat = this._levelData.materials.find(m => m.id === matId);
        if (!mat || !mat.properties) return;
        
        mat.properties[key] = value;

        this._markDirty();
        this._updatePropertiesPanel();
    }

    _deleteMaterial(matId) {
        this._pushUndo();
        // Remove material
        this._levelData.materials = this._levelData.materials.filter(m => m.id !== matId);
        
        // Remove reference from geometry
        if (this._levelData.geometry) {
            for (const geo of this._levelData.geometry) {
                if (geo.material_id === matId) geo.material_id = null;
            }
        }
        
        this.deselectAll();
        this._markDirty();
        this._updateMaterialManager();
        this._rebuildScene(this._levelData);
    }

    _applyInstanceOverride(obj, field, value) {
        this._pushUndo();
        if (!obj.userData.material_overrides) {
            obj.userData.material_overrides = {};
        }
        
        if (value === '' || (typeof value === 'number' && isNaN(value))) {
            delete obj.userData.material_overrides[field];
        } else {
            obj.userData.material_overrides[field] = value;
        }

        this._rebuildObjectMaterial(obj);
        this._markDirty();
    }

    _clearInstanceOverrides(obj) {
        if (!obj.userData.material_overrides || Object.keys(obj.userData.material_overrides).length === 0) return;
        this._pushUndo();
        delete obj.userData.material_overrides;
        
        this._rebuildObjectMaterial(obj);
        this._markDirty();
        this._updatePropertiesPanel();
    }

    _rebuildObjectMaterial(obj) {
        if (Array.isArray(obj.material)) {
            const newMats = [];
            for (let i = 0; i < obj.geometry.groups.length; i++) {
                const matId = obj.userData.material_assignments?.[i] || obj.userData.material_id;
                newMats.push(this._buildMaterialFromId(matId, obj.userData.colorHex, obj.userData.material_overrides));
            }
            obj.material.forEach(m => m.dispose());
            obj.material = newMats;
        } else {
            const newMat = this._buildMaterialFromId(obj.userData.material_id, obj.userData.colorHex, obj.userData.material_overrides);
            if (obj.material) obj.material.dispose();
            obj.material = newMat;
        }
    }

    _applyPropertyChange(obj, field, value) {
        this._pushUndo();
        const DEG = Math.PI / 180;
        switch (field) {
            case 'name': obj.name = value; break;
            case 'material_id':
                obj.userData.material_id = value;
                this._rebuildObjectMaterial(obj);
                break;
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
        // Persist to levelData so changes survive save
        this._commitTransformToLevelData(obj);
        this._markDirty();
    }

    _applySubMeshMaterialChange(obj, groupIndex, materialId) {
        this._pushUndo();
        if (!obj.userData.material_assignments) {
            obj.userData.material_assignments = {};
        }
        if (materialId) {
            obj.userData.material_assignments[groupIndex] = materialId;
        } else {
            delete obj.userData.material_assignments[groupIndex];
        }
        
        // If no assignments left, remove the property
        if (Object.keys(obj.userData.material_assignments).length === 0) {
            delete obj.userData.material_assignments;
        }

        this._rebuildObjectMaterial(obj);
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

    _buildMaterialFromId(materialId, fallbackColorHex, overrides = {}) {
        const THREE = this.THREE;
        let color = fallbackColorHex || '#888888';
        let emissive = '#000000';
        let opacity = 1.0;
        let transparent = false;
        let roughness = 0.8;
        let metalness = 0.0;
        let mapPath = null;
        let alphaMapPath = null;
        let normalMapPath = null;
        let normalIntensity = 1.0;
        let tiling = { x: 1, y: 1 };
        let offset = { x: 0, y: 0 };
        let colorLayers = null;
        let matDef = null;

        if (materialId && this._levelData && this._levelData.materials) {
            matDef = this._levelData.materials.find(m => m.id === materialId);
            if (matDef && matDef.channels) {
                if (matDef.channels.color?.color) color = matDef.channels.color.color;
                if (matDef.channels.color?.layers && matDef.channels.color.layers.length > 0) {
                    colorLayers = matDef.channels.color.layers;
                    tiling.x = matDef.channels.color.tilingX ?? 1;
                    tiling.y = matDef.channels.color.tilingY ?? 1;
                    offset.x = matDef.channels.color.offsetX ?? 0;
                    offset.y = matDef.channels.color.offsetY ?? 0;
                } else if (matDef.channels.color?.texture) {
                    mapPath = matDef.channels.color.texture;
                    tiling.x = matDef.channels.color.tilingX ?? 1;
                    tiling.y = matDef.channels.color.tilingY ?? 1;
                    offset.x = matDef.channels.color.offsetX ?? 0;
                    offset.y = matDef.channels.color.offsetY ?? 0;
                }
                if (matDef.channels.luminance?.color) emissive = matDef.channels.luminance.color;
                if (matDef.channels.transparency?.opacity !== undefined) {
                    opacity = matDef.channels.transparency.opacity;
                    if (opacity < 1.0) transparent = true;
                }
                if (matDef.channels.transparency?.alphaMap) {
                    alphaMapPath = matDef.channels.transparency.alphaMap;
                    transparent = true;
                }
                if (matDef.channels.reflectance?.roughness !== undefined) roughness = matDef.channels.reflectance.roughness;
                if (matDef.channels.reflectance?.metalness !== undefined) metalness = matDef.channels.reflectance.metalness;
                
                if (matDef.channels.normal?.map) {
                    normalMapPath = matDef.channels.normal.map;
                    if (matDef.channels.normal?.intensity !== undefined) normalIntensity = matDef.channels.normal.intensity;
                }
            }
        }

        const mat = new THREE.MeshStandardMaterial({ 
            color: overrides.colorHex || color, 
            emissive: overrides.emissive || emissive, 
            roughness: overrides.roughness !== undefined ? overrides.roughness : roughness,
            metalness,
            opacity, 
            transparent
        });

        if (materialId) {
            mat.userData.materialId = materialId;
        }
        
        if (colorLayers) {
            if (!this._textureComposer) this._textureComposer = new TextureComposer();
            this._textureComposer.compose(colorLayers, 512, 512).then(dataUrl => {
                if (!dataUrl) return;
                this._loadTexture(dataUrl).then(tex => {
                    const t = tex.clone();
                    t.wrapS = THREE.RepeatWrapping;
                    t.wrapT = THREE.RepeatWrapping;
                    t.repeat.set(tiling.x, tiling.y);
                    t.offset.set(offset.x, offset.y);
                    t.magFilter = THREE.NearestFilter;
                    t.minFilter = THREE.NearestFilter;
                    mat.map = t;
                    mat.needsUpdate = true;
                });
            });
        } else if (mapPath) {
            this._loadTexture(mapPath).then(tex => {
                const t = tex.clone();
                t.wrapS = THREE.RepeatWrapping;
                t.wrapT = THREE.RepeatWrapping;
                t.repeat.set(tiling.x, tiling.y);
                t.offset.set(offset.x, offset.y);
                t.magFilter = THREE.NearestFilter;
                t.minFilter = THREE.NearestFilter;
                mat.map = t;
                mat.needsUpdate = true;
            }).catch(err => console.warn('Failed to load texture:', mapPath));
        }

        if (alphaMapPath) {
            this._loadTexture(alphaMapPath).then(tex => {
                const t = tex.clone();
                t.wrapS = THREE.RepeatWrapping;
                t.wrapT = THREE.RepeatWrapping;
                t.repeat.set(tiling.x, tiling.y);
                t.offset.set(offset.x, offset.y);
                t.magFilter = THREE.NearestFilter;
                t.minFilter = THREE.NearestFilter;
                mat.alphaMap = t;
                mat.needsUpdate = true;
            }).catch(err => console.warn('Failed to load alpha map:', alphaMapPath));
        }

        if (normalMapPath) {
            this._loadTexture(normalMapPath).then(tex => {
                const t = tex.clone();
                t.wrapS = THREE.RepeatWrapping;
                t.wrapT = THREE.RepeatWrapping;
                t.repeat.set(tiling.x, tiling.y);
                t.offset.set(offset.x, offset.y);
                t.magFilter = THREE.NearestFilter;
                t.minFilter = THREE.NearestFilter;
                mat.normalMap = t;
                mat.normalScale.set(normalIntensity, normalIntensity);
                mat.needsUpdate = true;
            }).catch(err => console.warn('Failed to load normal map:', normalMapPath));
        }

        if (matDef && matDef.shader_id) {
            ShaderRegistry.applyShader(mat, matDef.shader_id, matDef.shader_uniforms || {});
        }

        return mat;
    }

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

                // Choose geometry based on shape_type
                let geo;
                switch (def.shape_type) {
                    case 'sphere':
                        geo = new THREE.SphereGeometry(w / 2, 24, 16);
                        break;
                    case 'cylinder':
                        geo = new THREE.CylinderGeometry(w / 2, w / 2, h, 24);
                        break;
                    case 'cone':
                        geo = new THREE.ConeGeometry(w / 2, h, 24);
                        break;
                    case 'plane':
                        geo = new THREE.PlaneGeometry(w, d);
                        break;
                    case 'capsule':
                        geo = (typeof THREE.CapsuleGeometry !== 'undefined')
                            ? new THREE.CapsuleGeometry(w / 2, h, 8, 16)
                            : new THREE.CylinderGeometry(w / 2, w / 2, h, 16); // fallback
                        break;
                    case 'box':
                    default:
                        geo = new THREE.BoxGeometry(w, h, d);
                        break;
                }

                let meshMaterial;
                if (def.material_assignments && Object.keys(def.material_assignments).length > 0 && geo.groups && geo.groups.length > 0) {
                    meshMaterial = [];
                    for (let i = 0; i < geo.groups.length; i++) {
                        const matId = def.material_assignments[i] || def.material_id;
                        meshMaterial.push(this._buildMaterialFromId(matId, def.colorHex, def.material_overrides));
                    }
                } else {
                    meshMaterial = this._buildMaterialFromId(def.material_id, def.colorHex, def.material_overrides);
                }

                const mesh = new THREE.Mesh(geo, meshMaterial);
                if (def.position) mesh.position.set(...def.position);
                if (def.rotation && def.rotation.length === 4) {
                    mesh.quaternion.set(def.rotation[0], def.rotation[1], def.rotation[2], def.rotation[3]);
                }
                if (def.scale && def.scale.length === 3) {
                    mesh.scale.set(def.scale[0], def.scale[1], def.scale[2]);
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

        this._updateMaterialManager();
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
        
        // Always add Environment node at the top
        const envSelected = (this._selected.length === 1 && this._selected[0]._isEnvironment) ? 'selected' : '';
        html += `<div class="tree-group"><div class="tree-group-label" style="color:var(--text-accent);">🌍 Environment</div>`;
        html += `<div class="tree-item ${envSelected}" data-env="true" style="font-weight:bold;">Skybox & Lighting</div>`;
        html += `</div>`;

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

        tree.innerHTML = html;

        // Wire clicks
        tree.querySelectorAll('.tree-item').forEach(item => {
            item.addEventListener('click', () => {
                if (item.dataset.env) {
                    this.select({ _isEnvironment: true, name: 'Environment' });
                    // Force refresh of scene tree to show selection
                    this._updateSceneTree();
                    return;
                }
                const name = item.dataset.name;
                const obj = this.scene.getObjectByName(name);
                if (obj) {
                    this.select(obj);
                    this._updateSceneTree();
                }
            });
        });
    }

    // ── Material Manager ──────────────────────────────────────────────────────

    createNewMaterial() {
        if (!this._levelData) return;
        if (!this._levelData.materials) this._levelData.materials = [];
        
        const defaultMat = MaterialSystem.deserialize({}); // Get defaults
        defaultMat.id = 'mat_' + Math.random().toString(36).substr(2, 9);
        defaultMat.name = 'New Material ' + (this._levelData.materials.length + 1);
        
        this._levelData.materials.push(defaultMat);
        this._updateMaterialManager();
        this.select({ _isMaterial: true, id: defaultMat.id });
    }

    async _updateMaterialManager() {
        const list = document.getElementById('material-list');
        if (!list) return;

        if (!this._levelData || !this._levelData.materials || this._levelData.materials.length === 0) {
            list.innerHTML = `<div class="kas-empty-state" style="width: 100%; margin: 0; padding: 0;">
                <div class="kas-empty-title" style="font-size: 11px;">No materials</div>
            </div>`;
            return;
        }

        let html = '';
        for (const mat of this._levelData.materials) {
            const selected = (this._selected.length === 1 && this._selected[0]._isMaterial && this._selected[0].id === mat.id) ? 'selected' : '';
            
            let previewBg = '';
            if (this.materialPreviewRenderer) {
                const dataUrl = await this.materialPreviewRenderer.renderPreview(mat);
                previewBg = `background-image: url('${dataUrl}'); background-size: cover; background-position: center;`;
            } else {
                const colorHex = mat.channels?.color?.color || '#888888';
                previewBg = `background-color: ${colorHex};`;
            }

            html += `
                <div class="mat-card ${selected}" data-mat-id="${mat.id}">
                    <div class="mat-preview" style="${previewBg}"></div>
                    <div class="mat-label" title="${mat.name}">${mat.name}</div>
                </div>
            `;
        }
        list.innerHTML = html;

        list.querySelectorAll('.mat-card').forEach(card => {
            card.addEventListener('click', () => {
                this.select({ _isMaterial: true, id: card.dataset.matId });
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
        data.skybox   = this._normalizeSkyboxData(
            data.skybox ?? data.sky ?? data.lighting ?? null,
            data.fog ?? null,
            this._mode,
        );

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
                    material_id:   ud.material_id || null,
                    palette_index: ud.palette_index ?? null,
                    castShadow:    true,
                    receiveShadow: true,
                    imported:      ud.imported || false
                };
                if (ud.material_assignments) {
                    geoData.material_assignments = { ...ud.material_assignments };
                }
                if (ud.material_overrides) {
                    geoData.material_overrides = { ...ud.material_overrides };
                }
                
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

    _validateLevelForPlaytest() {
        const errors = [];
        
        // 1. Validate Materials -> Shaders
        if (this._levelData.materials) {
            this._levelData.materials.forEach(mat => {
                if (mat.shader_id && mat.shader_id !== 'standard') {
                    const def = ShaderRegistry.shaders[mat.shader_id];
                    if (!def) {
                        errors.push(`Material '${mat.name || mat.id}' uses missing shader: '${mat.shader_id}'`);
                    } else {
                        const shaderErrors = ShaderRegistry.validateShader(def, this.THREE);
                        if (shaderErrors.length > 0) {
                            errors.push(`Shader '${mat.shader_id}' errors:\n  - ` + shaderErrors.join('\n  - '));
                        }
                    }
                }
            });
        }

        // 2. Validate Post Processing Passes
        if (this._levelData.postprocessing) {
            const passTypes = this._levelData.postprocessing.map(p => p.type);
            // Simple rule: depthOfField usually needs depth buffer, but engine ensures it if requested.
            // Let's just do a basic sanity check: render pass must be first if it exists.
            if (passTypes.length > 0 && passTypes.includes('render') && passTypes[0] !== 'render') {
                errors.push(`Post-processing: 'render' pass must be the first pass in the stack.`);
            }
        }

        return errors;
    }

    playtest() {
        const validationErrors = this._validateLevelForPlaytest();
        if (validationErrors.length > 0) {
            alert("Pre-playtest Validation Failed. Please fix these errors:\n\n" + validationErrors.join('\n\n'));
            return;
        }

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

        const btnNewMat = document.getElementById('btn-new-material');
        if (btnNewMat) {
            btnNewMat.addEventListener('click', () => this.createNewMaterial());
        }
    }

    _getRaycaster(e) {
        const THREE = this.THREE;
        if (!THREE) return null;
        const canvas = this.renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        return raycaster;
    }

    _onPointerDown(e) {
        if (this._gizmoDragging) return;
        if (this.transformCtrl && this.transformCtrl.enabled && this.transformCtrl.axis !== null) {
            return;
        }
        e.preventDefault();

        // Left click in pencil mode
        if (e.button === 0 && this._activeTool === 'draw' && this._modePanel?.getDrawState) {
            const state = this._modePanel.getDrawState();
            if (state && state.mode === 'pencil') {
                if (this.ghostMesh && this.ghostMesh.visible) {
                    const tool = state.tool || 'block';
                    if (tool === 'entity' || tool === 'enemy' || tool === 'collectible' || tool === 'checkpoint' || tool === 'hazard' || tool === 'trigger' || tool === 'npc' || tool === 'building' || tool === 'resource') {
                        const entityType = state.entity || state.block || 'spawn';
                        const props = {};
                        if (state.team !== undefined) props.team = state.team;
                        this.placeEntityAt(this.ghostMesh.position, entityType, props);
                    } else if (tool === 'light') {
                        this.placeLightAt(this.ghostMesh.position, state.lightType || 'point');
                    } else {
                        // Place standard block
                        this._placeBlock(this.ghostMesh.position, state);
                    }
                    return;
                }
            }
        }

        // Left click with a transform tool active + object selected → begin transform drag
        if (e.button === 0 && !e.altKey && this._selected.length > 0 && this._selected[0].isMesh) {
            const tool = this._activeTool;
            if (tool === 'move' || tool === 'rotate' || tool === 'scale') {
                const obj = this._selected[0];
                this._pushUndo();
                this._transformDrag = {
                    tool,
                    obj,
                    cx: e.clientX, cy: e.clientY,
                    startPos: obj.position.clone(),
                    startRot: obj.rotation.clone(),
                    startScale: obj.scale.clone(),
                    // World-space XZ movement speed
                    worldSpeed: this._orbit.radius * 0.003,
                };
                return;
            }
        }

        this._drag = {
            button: e.button,
            cx: e.clientX, cy: e.clientY,
            theta: this._orbit.theta,
            phi: this._orbit.phi,
            tx: this._orbit.target.x,
            tz: this._orbit.target.z,
            moved: 0,
        };

        if (e.button === 0) this._drag._selectPending = true;
        if (e.button === 2) this._drag._erasePending = true;
    }

    _onPointerMove(e) {
        if (this._gizmoDragging) return;
        // ── Transform drag (move/rotate/scale) ───────────────────────────
        if (this._transformDrag) {
            const td = this._transformDrag;
            const dx = e.clientX - td.cx;
            const dy = e.clientY - td.cy;

            if (td.tool === 'move') {
                // Map screen delta to world XZ plane, respecting camera angle
                const speed = this._orbit.radius * 0.005;
                const sinTheta = Math.sin(this._orbit.theta);
                const cosTheta = Math.cos(this._orbit.theta);
                const worldDX = (-cosTheta * dx + sinTheta * dy) * speed;
                const worldDZ = ( sinTheta * dx + cosTheta * dy) * speed;
                td.obj.position.x = td.startPos.x + worldDX;
                td.obj.position.z = td.startPos.z + worldDZ;
            } else if (td.tool === 'rotate') {
                td.obj.rotation.y = td.startRot.y + dx * 0.01;
            } else if (td.tool === 'scale') {
                const factor = 1 + dx * 0.01;
                const s = Math.max(0.01, factor);
                td.obj.scale.set(
                    td.startScale.x * s,
                    td.startScale.y * s,
                    td.startScale.z * s
                );
            }

            // Live update status
            const p = td.obj.position;
            const info = document.getElementById('status-info');
            if (info) info.textContent = `${td.tool.toUpperCase()} | X:${p.x.toFixed(2)} Y:${p.y.toFixed(2)} Z:${p.z.toFixed(2)}`;
            return;
        }

        // Ghost cursor logic
        if (!this._drag && this._activeTool === 'draw' && this._modePanel?.getDrawState) {
            const state = this._modePanel.getDrawState();
            if (state && state.mode === 'pencil' && this.ghostMesh) {
                const w = typeof state.width === 'number' ? state.width : 1;
                const h = typeof state.height === 'number' ? state.height : 1;
                const d = typeof state.depth === 'number' ? state.depth : 1;
                
                // Only recreate geometry if size changed to avoid resource churn
                if (!this.ghostMesh.userData.size || 
                    this.ghostMesh.userData.size.w !== w || 
                    this.ghostMesh.userData.size.h !== h || 
                    this.ghostMesh.userData.size.d !== d) {
                    
                    this.ghostMesh.geometry.dispose();
                    this.ghostMesh.geometry = new this.THREE.BoxGeometry(w + 0.02, h + 0.02, d + 0.02);
                    this.ghostMesh.userData.size = { w, h, d };
                }
                
                // Color ghost mesh based on tool
                const tool = state.tool || 'block';
                if (tool === 'block' || tool === 'draw-room' || tool === 'terrain') {
                    this.ghostMesh.material.color.setHex(0x00ff00); // Green
                } else if (tool === 'hazard' || tool === 'enemy') {
                    this.ghostMesh.material.color.setHex(0xff0000); // Red
                } else {
                    this.ghostMesh.material.color.setHex(0xffff00); // Yellow
                }

                const raycaster = this._getRaycaster(e);
                if (raycaster) {
                    const hits = raycaster.intersectObjects(this.meshGroup?.children || [], false);
                    let hitPos = null;
                    let normal = new this.THREE.Vector3(0, 1, 0);
                    if (hits.length > 0) {
                        hitPos = hits[0].point.clone();
                        normal = hits[0].face.normal.clone();
                    } else {
                        const plane = new this.THREE.Plane(new this.THREE.Vector3(0, 1, 0), -(state.layerY || 0));
                        const target = new this.THREE.Vector3();
                        if (raycaster.ray.intersectPlane(plane, target)) hitPos = target;
                    }
                    if (hitPos) {
                        const p = hitPos.clone().add(normal.clone().multiplyScalar(0.01));
                        
                        // Check if grid snap is enabled
                        const snap = state.snap !== false;
                        if (snap) {
                            p.x = Math.round(p.x);
                            p.y = Math.max(0, Math.round(p.y));
                            p.z = Math.round(p.z);
                        }
                        
                        this.ghostMesh.position.copy(p);
                        this.ghostMesh.visible = true;
                    } else {
                        this.ghostMesh.visible = false;
                    }
                }
            } else if (this.ghostMesh) {
                this.ghostMesh.visible = false;
            }
        } else if (this.ghostMesh) {
            this.ghostMesh.visible = false;
        }

        if (!this._drag) return;
        const dx = e.clientX - this._drag.cx;
        const dy = e.clientY - this._drag.cy;
        this._drag.moved += Math.abs(dx) + Math.abs(dy);

        if (this._drag.moved > 3) {
            this._drag._selectPending = false;
            this._drag._erasePending = false;
        }

        if (this._drag.button === 2 || (this._drag.button === 0 && e.altKey)) {
            this._orbit.theta = this._drag.theta - dx * 0.005;
            this._orbit.phi   = Math.max(0.1, Math.min(Math.PI - 0.1, this._drag.phi - dy * 0.005));
            this._updateOrbitCamera();
        } else if (this._drag.button === 1) {
            const speed = this._orbit.radius * 0.003;
            const fwdX  = Math.sin(this._orbit.theta);
            const fwdZ  = Math.cos(this._orbit.theta);
            this._orbit.target.x = this._drag.tx + (-fwdZ * dx + fwdX * dy) * speed;
            this._orbit.target.z = this._drag.tz + (fwdX * dx + fwdZ * dy) * speed;
            this._updateOrbitCamera();
        }
    }

    _onPointerUp(e) {
        if (this._gizmoDragging) return;
        // Commit a completed transform drag back to levelData
        if (this._transformDrag) {
            const td = this._transformDrag;
            this._commitTransformToLevelData(td.obj);
            this._transformDrag = null;
            this._updatePropertiesPanel();
            this._markDirty();
            return;
        }

        if (!this._drag) return;
        if (this._drag._selectPending && this._drag.moved < 4) {
            this._pickObject(e);
        } else if (this._drag._erasePending && this._drag.moved < 4 && this._activeTool === 'draw') {
            const state = this._modePanel?.getDrawState?.();
            if (state && state.mode === 'pencil') {
                const raycaster = this._getRaycaster(e);
                if (raycaster) {
                    const hits = raycaster.intersectObjects(this.meshGroup?.children || [], false);
                    if (hits.length > 0) this._deleteBlock(hits[0].object);
                }
            }
        }
        this._drag = null;
    }

    _commitTransformToLevelData(mesh) {
        if (!mesh || !this._levelData) return;
        const name = mesh.name;
        
        // Geometry
        const geoDef = this._levelData.geometry?.find(g => g.id === name);
        if (geoDef) {
            geoDef.position = [mesh.position.x, mesh.position.y, mesh.position.z];
            geoDef.scale    = [mesh.scale.x, mesh.scale.y, mesh.scale.z];
            // Store rotation as quaternion for precision
            const q = mesh.quaternion;
            geoDef.rotation = [q.x, q.y, q.z, q.w];
            return;
        }

        // Lights
        const lightDef = this._levelData.lights?.find(l => l.id === name);
        if (lightDef) {
            lightDef.position = [mesh.position.x, mesh.position.y, mesh.position.z];
            return;
        }

        // Entities
        const entDef = this._levelData.entities?.find(e => e.id === name);
        if (entDef) {
            entDef.position = [mesh.position.x, mesh.position.y, mesh.position.z];
            return;
        }
    }

    _placeBlock(pos, stateOrBlock) {
        this._pushUndo();
        if (!this._levelData) {
            this._levelData = { geometry: [], entities: [], lights: [], materials: [] };
        }
        if (!this._levelData.geometry) this._levelData.geometry = [];
        
        let w = 1, h = 1, d = 1;
        let blockType = 'box';
        
        if (stateOrBlock && typeof stateOrBlock === 'object') {
            w = typeof stateOrBlock.width === 'number' ? stateOrBlock.width : 1;
            h = typeof stateOrBlock.height === 'number' ? stateOrBlock.height : 1;
            d = typeof stateOrBlock.depth === 'number' ? stateOrBlock.depth : 1;
            blockType = stateOrBlock.block || 'box';
        } else if (typeof stateOrBlock === 'string') {
            blockType = stateOrBlock;
        }

        let color = '#888888';
        if (blockType === 'floor') color = '#555555';
        else if (blockType === 'wall') color = '#7f8c8d';
        else if (blockType === 'ceiling') color = '#2c3e50';
        else if (blockType === 'pillar') color = '#d5dbdb';
        else if (blockType === 'stairs') color = '#a6acaf';
        else if (blockType === 'ramp') color = '#bdc3c7';
        else if (blockType === 'crate') color = '#d35400';
        else if (blockType === 'platform') color = '#34495e';
        else if (blockType === 'moving') color = '#f1c40f';
        else if (blockType === 'breakable') color = '#9b59b6';
        else if (blockType === 'bounce') color = '#2ecc71';
        else if (blockType === 'ice') color = '#aed6f1';
        else if (blockType === 'conveyor') color = '#3498db';
        
        const newBlock = {
            id: 'block_' + Math.random().toString(36).substr(2, 9),
            type: 'mesh',
            blockType: blockType,
            width: w, height: h, depth: d,
            position: [pos.x, pos.y, pos.z],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
            colorHex: color,
            material_id: null,
            castShadow: true,
            receiveShadow: true
        };
        
        // Inherit currently selected material if any
        if (this._selected.length === 1 && this._selected[0]._isMaterial) {
            newBlock.material_id = this._selected[0].id;
        }
        
        this._levelData.geometry.push(newBlock);
        this._rebuildScene(this._levelData);
        this._markDirty();
        
        // Auto-select the newly placed block
        const mesh = this.scene.getObjectByName(newBlock.id);
        if (mesh) this.select(mesh);
    }

    placeLightAt(pos, type = 'point') {
        if (!this._levelData) return;
        if (!this._levelData.lights) this._levelData.lights = [];

        this._pushUndo();
        const id = `light_${Date.now().toString(36)}`;
        this._levelData.lights.push({
            id,
            type: type || 'point',
            position: [pos.x, pos.y, pos.z],
            colorHex: '#ffffff',
            intensity: 1.0,
            distance: 20,
            castShadow: false,
        });
        this._rebuildScene(this._levelData);
        this._markDirty();
        const mesh = this.scene.getObjectByName(id);
        if (mesh) this.select(mesh);
    }

    placeEntityAt(pos, type = 'spawn', properties = {}) {
        if (!this._levelData) return;
        if (!this._levelData.entities) this._levelData.entities = [];

        this._pushUndo();
        const id = `entity_${Date.now().toString(36)}`;
        this._levelData.entities.push({
            id,
            type: type || 'spawn',
            position: [pos.x, pos.y, pos.z],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
            properties: properties || {}
        });
        this._rebuildScene(this._levelData);
        this._markDirty();
        const mesh = this.scene.getObjectByName(id);
        if (mesh) this.select(mesh);
    }
    
    _deleteBlock(meshObj) {
        if (!meshObj || !meshObj.userData) return;
        this._pushUndo();
        
        const index = this._levelData.geometry.findIndex(g => g.id === meshObj.name);
        if (index !== -1) {
            this._levelData.geometry.splice(index, 1);
            
            meshObj.parent?.remove(meshObj);
            if (meshObj.geometry) meshObj.geometry.dispose();
            if (meshObj.material) {
                if (Array.isArray(meshObj.material)) meshObj.material.forEach(m => m.dispose());
                else meshObj.material.dispose();
            }
            
            this.deselectAll();
            this._updateSceneTree();
            this._markDirty();
        }
    }

    _onWheel(e) {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.1 : 0.9;
        this._orbit.radius = Math.max(2, Math.min(200, this._orbit.radius * factor));
        this._updateOrbitCamera();
    }

    _onKeyDown(e) {
        this._keysDown.add(e.key.toLowerCase());

        // Skip shortcuts if focus is inside a text input
        if (document.activeElement?.matches('input, textarea, select')) return;

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

        // Tool shortcuts (only when no modifier held)
        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'q': this.setActiveTool('select'); break;
                case 'w': this.setActiveTool('move');   break;
                case 'e': this.setActiveTool('rotate'); break;
                case 'r': this.setActiveTool('scale');  break;
                case 'd': this.setActiveTool('draw');   break;
            }
        }

        // Escape: deselect all
        if (e.key === 'Escape') { this.deselectAll(); }
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
            const name = obj.name;

            // Remove from levelData so deletion persists on save
            if (this._levelData) {
                const gIdx = (this._levelData.geometry || []).findIndex(g => g.id === name);
                if (gIdx !== -1) this._levelData.geometry.splice(gIdx, 1);

                const lIdx = (this._levelData.lights || []).findIndex(l => l.id === name);
                if (lIdx !== -1) this._levelData.lights.splice(lIdx, 1);

                const eIdx = (this._levelData.entities || []).findIndex(e => e.id === name);
                if (eIdx !== -1) this._levelData.entities.splice(eIdx, 1);
            }

            // Remove from Three.js scene
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
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const dt = this._lastFrameAt > 0 ? Math.min(Math.max(0, (now - this._lastFrameAt) / 1000), 0.1) : 0;
        this._lastFrameAt = now;

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
        if (this.skybox) this.skybox.update(this.camera, dt);

        // Update shaders
        ShaderRegistry.update(now);

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

    _loadTexture(path) {
        if (!this._textureCache) this._textureCache = new Map();
        if (this._textureCache.has(path)) {
            return Promise.resolve(this._textureCache.get(path));
        }
        return new Promise((resolve, reject) => {
            if (!this._textureLoader) this._textureLoader = new this.THREE.TextureLoader();
            this._textureLoader.load(
                path,
                (tex) => {
                    this._textureCache.set(path, tex);
                    resolve(tex);
                },
                undefined,
                (err) => reject(err)
            );
        });
    }

    _markDirty() {
        this._dirty = true;
    }

    get isDirty() { return this._dirty; }

    dispose() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
        if (this._modePanel?.dispose) this._modePanel.dispose();
        this.renderer3d?.dispose();
        this.materialPreviewRenderer?.dispose();
    }
}
