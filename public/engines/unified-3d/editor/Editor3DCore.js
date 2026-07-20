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
import { MaterialPackManager } from '/engines/shared/MaterialPresets.js';
import { Evaluator, Brush, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import PropertiesPanel from './panels/PropertiesPanel.js?v=cachebust12';
import AssetLoader3D from '/engines/shared/AssetLoader3D.js';

export default class Editor3DCore {

    constructor(container3d, options = {}) {
        /** @type {HTMLElement} */
        this.container = typeof container3d === 'string'
            ? document.querySelector(container3d) : container3d;

        /** @type {string} Current editing mode */
        this._mode = options.mode || 'fps-3d';

        /** @type {Array<THREE.Mesh>} Terrain meshes (for terrain mode) */
        this._terrainMeshes = [];
        /** @type {Array<THREE.Mesh>} Water plane meshes (terrain mode) */
        this._waterMeshes = [];
        /** @type {Array<THREE.Group>} Foliage groups (terrain mode) */
        this._foliageMeshes = [];
        /** @type {Array<{id:string,propId:string,position:number[],scale:number,meshNames:string[]}>} Prop groups (prop library) */
        this._propGroups = [];

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
        this._snapEnabled   = false;  // Gizmo Snapping disabled by default for smooth movement

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
        
        // ── UI Panels ─────────────────────────────────────────────────────
        this.propertiesPanel = new PropertiesPanel(this);
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
            { default: WeatherSystem3D },
            { MaterialPreviewRenderer },
            { TransformControls }
        ] = await Promise.all([
            import('/lib/three/three.module.js'),
            import('/engines/shared/Renderer3D.js'),
            import('/engines/shared/SkyboxSystem.js'),
            import('/engines/shared/WeatherSystem3D.js'),
            import('/engines/shared/MaterialPreviewRenderer.js'),
            import('/lib/three/addons/controls/TransformControls.js?v=cachebust'),
        ]);

        this.THREE         = THREE_MODULE;
        this._Renderer3D   = Renderer3D;
        this._SkyboxSystem = SkyboxSystem;
        this._WeatherSystem3D = WeatherSystem3D;
        this._createDefaultSkyboxConfig = createDefaultSkyboxConfig;
        this._normalizeSkyboxConfig = normalizeSkyboxConfig;

        const THREE = this.THREE;

        this.materialPreviewRenderer = new MaterialPreviewRenderer(THREE);
        this.shaderEditorUI = new ShaderEditorUI(this);

        // ── Renderer ──────────────────────────────────────────────────────
        this.renderer3d = new Renderer3D(this.container, {
            antialias:  false,
            shadows:    true,
            shadowType: 1,       // PCFSoftShadowMap
            pixelRatio: Math.min(window.devicePixelRatio, 2),
        });
        await this.renderer3d.init();
        this.scene    = this.renderer3d.scene;
        this.camera   = this.renderer3d.camera;
        this.renderer = this.renderer3d.webgl;

        this._updateOrbitCamera();

        // ── Lighting ──────────────────────────────────────────────────────
        this._ambLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(this._ambLight);

        this._hemiLight = new THREE.HemisphereLight(0xbfdfff, 0x4a3828, 1.2);
        this._hemiLight.name = '__softFillLight';
        this.scene.add(this._hemiLight);
        
        this._sunLight = new THREE.DirectionalLight(0xfffbe0, 2.0);
        this._sunLight.position.set(30, 60, 30);
        this._sunLight.target.position.set(0, 0, 0);
        this._sunLight.castShadow = true;
        this._sunLight.shadow.mapSize.set(1024, 1024);
        this._sunLight.shadow.camera.left = -100;
        this._sunLight.shadow.camera.right = 100;
        this._sunLight.shadow.camera.top = 100;
        this._sunLight.shadow.camera.bottom = -100;
        this._sunLight.shadow.camera.near = 1;
        this._sunLight.shadow.camera.far = 200;
        this._sunLight.shadow.bias = -0.0005;
        this._sunLight.shadow.normalBias = 0.02;
        this.scene.add(this._sunLight);
        this.scene.add(this._sunLight.target);

        // ── Skybox ────────────────────────────────────────────────────────
        this.skybox = new SkyboxSystem(this.scene, { engineType: this._mode });
        this.weatherSystem = new WeatherSystem3D(this.scene, this.camera, { THREE });
        this._applySkyboxToViewport({ skybox: this._getDefaultSkybox(this._mode) }, this._mode);

        // ── Grid ──────────────────────────────────────────────────────────
        this.gridHelper = new THREE.GridHelper(50, 100, 0xcccccc, 0x444444);
        this.gridHelper.material.transparent = true;
        this.gridHelper.material.opacity = 0.5;
        this.gridHelper.material.depthWrite = false;
        this.scene.add(this.gridHelper);

        // ── Ground plane (shadow receiver) ──────────────────────────────
        const groundGeo = new THREE.PlaneGeometry(200, 200);
        const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
        this.groundPlane = new THREE.Mesh(groundGeo, groundMat);
        this.groundPlane.rotation.x = -Math.PI / 2;
        this.groundPlane.position.y = 0;
        this.groundPlane.receiveShadow = true;
        this.groundPlane.renderOrder = -10;
        this.scene.add(this.groundPlane);

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
        
        // Gizmo Snapping Configuration
        if (this._snapEnabled) {
            this.transformCtrl.setTranslationSnap(1.0);
            this.transformCtrl.setRotationSnap(Math.PI / 12); // 15 degrees
        }
        
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
                import('/lib/three/loaders/GLTFLoader.js'),
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

    async importFBX() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.fbx';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                // Use AssetLoader3D to load FBX
                const loader = new AssetLoader3D(this.scene, this.renderer3d?.paletteManager);
                const { group, animations } = await loader.loadFBX(URL.createObjectURL(file), {
                    cache: false,
                    flatShading: true,
                    remapColors: true,
                });

                // Add each mesh from the group to the scene
                let meshCount = 0;
                group.traverse((child) => {
                    if (child.isMesh) {
                        child.name = `fbx_${Date.now()}_${meshCount++}`;
                        child.userData = { type: 'trimesh', imported: true, source: 'fbx' };
                        this.meshGroup.add(child.clone());
                    }
                });

                this._updateSceneTree();
                this._markDirty();
                console.log(`[Editor3DCore] Imported ${meshCount} meshes from FBX: ${file.name}`);
            } catch (err) {
                console.error('[Editor3DCore] FBX import failed:', err);
                alert('Failed to import FBX: ' + err.message);
            }
        };
        input.click();
    }

    async importOBJ() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.obj';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const loader = new AssetLoader3D(this.scene, this.renderer3d?.paletteManager);
                const url = URL.createObjectURL(file);

                // Check if an MTL file with the same basename exists alongside the OBJ
                let mtlUrl = null;
                const objName = file.name.toLowerCase();
                if (objName.endsWith('.obj')) {
                    // Try to find a companion .mtl file
                    const basename = file.name.slice(0, -4);
                    const mtlFile = e.target.files[1]; // second file if user selected multiple
                    if (mtlFile && mtlFile.name.toLowerCase() === basename + '.mtl') {
                        mtlUrl = URL.createObjectURL(mtlFile);
                    } else if (file.webkitRelativePath) {
                        // If running in a directory-aware context, try to guess MTL path
                        const mtlPath = file.webkitRelativePath.replace(/\.obj$/i, '.mtl');
                        // Not easily resolved from a File object
                    }
                }

                const { group } = await loader.loadOBJ(url, mtlUrl, {
                    cache: false,
                    flatShading: true,
                    remapColors: true,
                });

                let meshCount = 0;
                group.traverse((child) => {
                    if (child.isMesh) {
                        child.name = `obj_${Date.now()}_${meshCount++}`;
                        child.userData = { type: 'trimesh', imported: true, source: 'obj' };
                        this.meshGroup.add(child.clone());
                    }
                });

                this._updateSceneTree();
                this._markDirty();
                console.log(`[Editor3DCore] Imported ${meshCount} meshes from OBJ: ${file.name}`);
            } catch (err) {
                console.error('[Editor3DCore] OBJ import failed:', err);
                alert('Failed to import OBJ: ' + err.message);
            }
        };
        input.click();
    }

    async importBlend() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.blend';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!this._project) {
                alert('Please load or create a project first before importing .blend files');
                return;
            }

            try {
                // Upload .blend file for server-side conversion
                const loader = new AssetLoader3D(this.scene, this.renderer3d?.paletteManager);
                const asset = await loader.importBlend(this._project, file);

                // Load the converted GLB
                const { scene, animations } = await loader.loadGLTF(asset.url, {
                    cache: true,
                    flatShading: true,
                    remapColors: true,
                });

                let meshCount = 0;
                scene.traverse((child) => {
                    if (child.isMesh) {
                        child.name = `blend_${Date.now()}_${meshCount++}`;
                        child.userData = { type: 'trimesh', imported: true, source: 'blend' };
                        this.meshGroup.add(child.clone());
                    }
                });

                this._updateSceneTree();
                this._markDirty();
                console.log(`[Editor3DCore] Imported ${meshCount} meshes from Blender: ${file.name} (converted to ${asset.name})`);
            } catch (err) {
                console.error('[Editor3DCore] Blender import failed:', err);
                alert('Failed to import .blend: ' + err.message);
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
            moon: { enabled: true, color: '#dce8ff', intensity: 0.25, azimuth: 225, elevation: 25 },
            weather: { enabled: false, type: 'clear', intensity: 0.35, windX: 0.4, windZ: 0.1 },
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
                { type: 'cel', tones: 5.0, satBoost: 1.1, minBright: 0.25 }
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
        this.weatherSystem?.applyConfig(skybox);

        // Update Sun & Ambient
        if (this._sunLight && skybox.sun) {
            this._sunLight.color.set(skybox.sun.color || '#ffffff');
            const sunInt = typeof skybox.sun.intensity === 'number' ? skybox.sun.intensity : 1.2;
            this._sunLight.intensity = sunInt;
            
            const az = (skybox.sun.azimuth ?? 45) * Math.PI / 180;
            const el = (skybox.sun.elevation ?? 45) * Math.PI / 180;
            const r = 100;
            this._sunLight.position.set(
                r * Math.cos(el) * Math.sin(az),
                r * Math.sin(el),
                r * Math.cos(el) * Math.cos(az)
            );
            this._sunLight.target.position.set(0, 0, 0);

            if (this._sunLight.shadow) {
                this._sunLight.shadow.mapSize.set(1024, 1024);
                this._sunLight.shadow.radius = 3;
                this._sunLight.shadow.bias = -0.0004;
                this._sunLight.shadow.normalBias = 0.02;
            }
        }
        
        if (this._ambLight && skybox.ambientColor) {
            this._ambLight.color.set(skybox.ambientColor);
        }
        if (this._ambLight && typeof skybox.ambientIntensity === 'number') {
            this._ambLight.intensity = skybox.ambientIntensity * 0.6;
        }
        if (this._hemiLight) {
            this._hemiLight.color.set(skybox.topColor || skybox.ambientColor || '#bfdfff');
            // Only override groundColor/intensity when ambientIntensity is explicitly
            // provided in the skybox config. The skybox bottomColor is the horizon sky
            // gradient, not the ground, so using it as hemi groundColor washes out
            // warm colors (trees look gray-tinted).
            if (typeof skybox.ambientColor === 'string') {
                this._hemiLight.groundColor.set(skybox.ambientColor);
            }
            if (typeof skybox.ambientIntensity === 'number') {
                this._hemiLight.intensity = Math.max(0.1, skybox.ambientIntensity * 0.9);
            }
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

    toggleSnap() {
        this._snapEnabled = !this._snapEnabled;
        if (this.transformCtrl) {
            if (this._snapEnabled) {
                this.transformCtrl.setTranslationSnap(1.0);
                this.transformCtrl.setRotationSnap(Math.PI / 12);
            } else {
                this.transformCtrl.setTranslationSnap(null);
                this.transformCtrl.setRotationSnap(null);
            }
        }
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
        this._syncProceduralTerrainToLevelData();
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
            colorHex: '#666666',
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
            position: [0, 1, 0]
        });
        this._rebuildScene(this._levelData);
        this._markDirty();
        const mesh = this.scene.getObjectByName(id);
        if (mesh) this.select(mesh);
    }

    spawnVehicle() {
        if (!this._levelData) {
            this._levelData = { geometry: [], entities: [], lights: [], materials: [] };
        }
        this._syncProceduralTerrainToLevelData();
        if (!this._levelData.entities) this._levelData.entities = [];

        this._pushUndo();
        const id = `vehicle_${Date.now().toString(36)}`;
        this._levelData.entities.push({
            id,
            type: 'vehicle',
            position: [0, 1, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
            width: 1.8,
            height: 0.75,
            depth: 3,
            colorHex: '#3f6fb4',
            properties: { studio: 'vehicle', label: 'Vehicle' },
        });
        this._rebuildScene(this._levelData);
        this._markDirty();
        const mesh = this.scene.getObjectByName(id);
        if (mesh) this.select(mesh);
    }

    spawnTerrain() {
        if (!this._levelData) return;
        if (!this._levelData.geometry) this._levelData.geometry = [];

        this._pushUndo();
        const id = `terrain_${Date.now().toString(36)}`;
        
        // Default terrain is a 64x64 plane with 32 segments
        const geo = new this.THREE.PlaneGeometry(64, 64, 32, 32);
        geo.rotateX(-Math.PI / 2); // Lay flat
        
        const def = {
            id,
            shape_type: 'custom_csg', // Reuse custom buffer geometry loader
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
            material_id: 'mat_default',
            custom_vertices: Array.from(geo.attributes.position.array),
            custom_normals: Array.from(geo.attributes.normal.array),
            custom_uvs: Array.from(geo.attributes.uv.array),
            custom_indices: geo.index ? Array.from(geo.index.array) : null,
        };

        this._levelData.geometry.push(def);
        this._rebuildScene(this._levelData);
        this._markDirty();
        
        const newMesh = this.scene.getObjectByName(id);
        if (newMesh) this.select(newMesh);
    }

    async performCSG(operationType) {
        if (!this._selected || this._selected.length < 2) {
            alert('Please select exactly 2 geometry objects for CSG operations.');
            return;
        }

        const mesh1 = this._selected[0];
        const mesh2 = this._selected[1];

        if (!mesh1.isMesh || !mesh2.isMesh || mesh1._isEnvironment || mesh2._isEnvironment || mesh1.userData._isLight || mesh2.userData._isLight || mesh1.userData._isEntity || mesh2.userData._isEntity) {
            alert('CSG operations only work on valid 3D geometry objects.');
            return;
        }

        let op = ADDITION;
        if (operationType === 'subtract') op = SUBTRACTION;
        else if (operationType === 'intersect') op = INTERSECTION;

        this._pushUndo();

        const evaluator = new Evaluator();
        evaluator.useGroups = false;
        
        const brush1 = new Brush(mesh1.geometry, mesh1.material);
        const brush2 = new Brush(mesh2.geometry, mesh2.material);
        
        brush1.position.copy(mesh1.position);
        brush1.rotation.copy(mesh1.rotation);
        brush1.scale.copy(mesh1.scale);
        brush1.updateMatrixWorld();
        
        brush2.position.copy(mesh2.position);
        brush2.rotation.copy(mesh2.rotation);
        brush2.scale.copy(mesh2.scale);
        brush2.updateMatrixWorld();

        const result = evaluator.evaluate(brush1, brush2, op);
        
        // Use result's geometry and the first mesh's material (or combined if evaluator preserved them)
        const newGeo = result.geometry.clone();
        
        // Create new definition based on first mesh but as a "custom" geometry shape_type
        const id = `csg_${Date.now().toString(36)}`;
        
        const def = {
            id,
            shape_type: 'custom_csg', // Special type so it doesn't get overwritten with a box
            position: [mesh1.position.x, mesh1.position.y, mesh1.position.z],
            rotation: [mesh1.rotation.x, mesh1.rotation.y, mesh1.rotation.z],
            scale: [mesh1.scale.x, mesh1.scale.y, mesh1.scale.z],
            material_id: mesh1.userData.material_id || 'mat_default',
            // Storing vertices and indices so it survives save/load
            custom_vertices: Array.from(newGeo.attributes.position.array),
            custom_normals: newGeo.attributes.normal ? Array.from(newGeo.attributes.normal.array) : null,
            custom_uvs: newGeo.attributes.uv ? Array.from(newGeo.attributes.uv.array) : null,
            custom_indices: newGeo.index ? Array.from(newGeo.index.array) : null,
        };

        // Remove old objects
        this._levelData.geometry = this._levelData.geometry.filter(g => g.id !== mesh1.name && g.id !== mesh2.name);
        
        // Add new combined object
        this._levelData.geometry.push(def);
        
        this._rebuildScene(this._levelData);
        this._markDirty();
        
        const newMesh = this.scene.getObjectByName(id);
        if (newMesh) this.select(newMesh);
    }

    _highlightSelection() {
        // Use outline pass to highlight selected objects
        if (this.renderer3d?.outlinePass) {
            this.renderer3d.outlinePass.selectedObjects = this._selected.filter(o => !o._isEnvironment);
            this.renderer3d.outlinePass.visibleEdgeColor.set('#ffaa00'); // Orange selection
            this.renderer3d.outlinePass.hiddenEdgeColor.set('#ffaa00');
            this.renderer3d.outlinePass.edgeStrength = 5.0;
            this.renderer3d.outlinePass.edgeThickness = 2.0;
        }
    }

    _updatePropertiesPanel() {
        this.propertiesPanel._updatePropertiesPanel();
    }

    _syncEnvironmentPanel() {
        this.select({ _isEnvironment: true, name: 'Environment' });
    }

    // UI Rendering methods moved to PropertiesPanel.js
    _applyEnvironmentChanges(changes) {
        this._pushUndo();
        this._levelData.skybox = this._levelData.skybox || this._getDefaultSkybox(this._mode);
        for (const [field, value] of Object.entries(changes)) {
            if (field.startsWith('sun.')) {
                this._levelData.skybox.sun = this._levelData.skybox.sun || {};
                this._levelData.skybox.sun[field.split('.')[1]] = value;
            } else if (field.startsWith('moon.')) {
                this._levelData.skybox.moon = this._levelData.skybox.moon || {};
                this._levelData.skybox.moon[field.split('.')[1]] = value;
            } else if (field.startsWith('weather.')) {
                this._levelData.skybox.weather = this._levelData.skybox.weather || {};
                this._levelData.skybox.weather[field.split('.')[1]] = value;
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
    }

    _applyEnvironmentChange(field, value) {
        this._applyEnvironmentChanges({ [field]: value });
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
        let color = fallbackColorHex || '#666666';
        let emissive = color;
        let emissiveIntensity = 0.02;
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
                if (matDef.channels.color?.value) color = matDef.channels.color.value;
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
                if (matDef.channels.luminance?.value) emissive = matDef.channels.luminance.value;
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

        const mat = new THREE.MeshLambertMaterial({
            color: new THREE.Color(overrides.colorHex || color), 
            emissive: new THREE.Color(overrides.emissive || emissive),
            emissiveIntensity: overrides.emissiveIntensity ?? Math.min(emissiveIntensity, 0.02),
            opacity, 
            transparent,
            side: THREE.DoubleSide,
            flatShading: true
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
        const preserveLiveTerrain = this._preserveLiveTerrainOnNextRebuild === true
            && levelData === this._levelData
            && Array.isArray(this._terrainMeshes)
            && this._terrainMeshes.length > 0;
        this._preserveLiveTerrainOnNextRebuild = false;

        // Detach TransformControls to avoid stale object reference after clear
        if (this.transformCtrl) {
            this.transformCtrl.detach();
        }

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
                if ((def.type === 'trimesh' || def.type === 'prop') && def.positions) {
                    geo = new THREE.BufferGeometry();
                    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(def.positions), 3));
                    if (def.normals) geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(def.normals), 3));
                    if (def.colors) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(def.colors), 3));
                    if (!def.normals) geo.computeVertexNormals();
                } else if (def.shape_type === 'custom_csg') {
                    geo = new THREE.BufferGeometry();
                    if (def.custom_vertices) geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(def.custom_vertices), 3));
                    if (def.custom_normals) geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(def.custom_normals), 3));
                    if (def.custom_uvs) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(def.custom_uvs), 2));
                    if (def.custom_indices) geo.setIndex(new THREE.BufferAttribute(new Uint16Array(def.custom_indices), 1));
                    
                    // Always compute vertex normals to fix black rendering bug on CSG
                    geo.computeVertexNormals();
                } else {
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
                            geo.rotateX(-Math.PI / 2); // Make planes flat by default
                            break;
                        case 'capsule':
                            geo = (typeof THREE.CapsuleGeometry !== 'undefined')
                                ? new THREE.CapsuleGeometry(w / 2, h, 8, 16)
                                : new THREE.CylinderGeometry(w / 2, w / 2, h, 16); // fallback
                            break;
                        case 'slope': {
                            const shape = new THREE.Shape();
                            shape.moveTo(0, 0);
                            shape.lineTo(w, 0);
                            shape.lineTo(0, h);
                            shape.lineTo(0, 0);
                            geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
                            geo.center();
                            break;
                        }
                        case 'wedge': {
                            const shape = new THREE.Shape();
                            shape.moveTo(0, 0);
                            shape.lineTo(w, 0);
                            shape.lineTo(w/2, h);
                            shape.lineTo(0, 0);
                            geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
                            geo.center();
                            break;
                        }
                        case 'stairs': {
                            const shape = new THREE.Shape();
                            const steps = 5;
                            shape.moveTo(0, 0);
                            shape.lineTo(w, 0);
                            for(let i=1; i<=steps; i++) {
                                shape.lineTo(w - (w/steps)*(i-1), h/steps * i);
                                shape.lineTo(w - (w/steps)*i, h/steps * i);
                            }
                            shape.lineTo(0, 0);
                            geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
                            geo.center();
                            break;
                        }
                        case 'arch': {
                            const shape = new THREE.Shape();
                            shape.moveTo(0, 0);
                            shape.lineTo(w*0.2, 0);
                            shape.lineTo(w*0.2, h*0.6);
                            // Arch curve
                            shape.absarc(w*0.5, h*0.6, w*0.3, Math.PI, 0, true);
                            shape.lineTo(w*0.8, 0);
                            shape.lineTo(w, 0);
                            shape.lineTo(w, h);
                            shape.lineTo(0, h);
                            shape.lineTo(0, 0);
                            geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 12 });
                            geo.center();
                            break;
                        }
                        case 'box':
                        default:
                            geo = new THREE.BoxGeometry(w, h, d);
                            break;
                    }
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
                const entColor = this._entityColor(ent.type);
                const geo = ent.type === 'vehicle'
                    ? new THREE.BoxGeometry(ent.width || 1.8, ent.height || 0.75, ent.depth || 3)
                    : new THREE.SphereGeometry(0.3, 8, 6);
                const mat = new THREE.MeshLambertMaterial({ 
                    color: new THREE.Color(entColor),
                    emissive: new THREE.Color(entColor),
                    emissiveIntensity: 0.02,
                    flatShading: true
                });
                const mesh = new THREE.Mesh(geo, mat);
                if (ent.position) mesh.position.set(...ent.position);
                if (Array.isArray(ent.rotation) && ent.rotation.length === 4) mesh.quaternion.set(...ent.rotation);
                mesh.name = ent.id || `ent_${this.entityGroup.children.length}`;
                mesh.userData = { ...ent, _isEntity: true };
                this.entityGroup.add(mesh);
            }
        }

        // Build lights as gizmos
        if (Array.isArray(levelData.lights)) {
            for (const lt of levelData.lights) {
                if (lt.id === '__ambient__' || lt.id === '__sun__') continue;
                const color = lt.colorHex || '#ffffff';
                const geo = new THREE.SphereGeometry(0.15, 6, 4);
                const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
                const mesh = new THREE.Mesh(geo, mat);
                if (lt.position) mesh.position.set(...lt.position);
                mesh.name = lt.id || `light_${this.lightGroup.children.length}`;
                mesh.userData = { ...lt, _isLight: true };
                this.lightGroup.add(mesh);
            }
        }

        // Restore terrain meshes from serialized data (not in meshGroup). For
        // block placement on live generated terrain, preserve the existing
        // terrain objects so rebuild does not visibly erase them while the
        // async restore import resolves.
        if (!preserveLiveTerrain) {
            for (const list of [this._terrainMeshes, this._waterMeshes, this._foliageMeshes]) {
                if (list) {
                    for (const m of list) {
                        m.parent?.remove(m);
                        if (m.geometry) m.geometry?.dispose();
                        if (m.material) {
                            if (Array.isArray(m.material)) m.material.forEach(x => x.dispose());
                            else m.material.dispose();
                        }
                        if (m.traverse) {
                            m.traverse(c => {
                                c.geometry?.dispose();
                                if (c.material) { if (Array.isArray(c.material)) c.material.forEach(x => x.dispose()); else c.material.dispose(); }
                            });
                        }
                    }
                    list.length = 0;
                }
            }
        }
        if (this._propGroups) this._propGroups = [];
        if (!preserveLiveTerrain && Array.isArray(levelData.terrainMeshes)) {
            for (const td of levelData.terrainMeshes) {
                if (td.elevationGrid) {
                    const elev = new Float32Array(td.elevationGrid);
                    const cellSize = Math.max(0.25, Number(td.cellSize ?? 1) || 1);
                    const opts = {
                        tileSize: cellSize,
                        maxHeight: td.heightScale || 8,
                        jitter: 0.05,
                    };
                    import('/engines/shared/LowPolyTerrainGen.js').then(mod => {
                        const style = td.terrainStyle || td.style || 'lowpoly';
                        let mesh;
                        const useRawSculptMesh = style === 'trimesh' || td.mode === 'trimesh' || td.preferSculptedMesh === true;
                        if (useRawSculptMesh && Array.isArray(td.sculptedPositions)) {
                            const geo = new this.THREE.BufferGeometry();
                            geo.setAttribute('position', new this.THREE.BufferAttribute(new Float32Array(td.sculptedPositions), 3));
                            if (Array.isArray(td.sculptedNormals)) {
                                geo.setAttribute('normal', new this.THREE.BufferAttribute(new Float32Array(td.sculptedNormals), 3));
                            }
                            if (Array.isArray(td.sculptedColors)) {
                                geo.setAttribute('color', new this.THREE.BufferAttribute(new Float32Array(td.sculptedColors), 3));
                            }
                            if (!Array.isArray(td.sculptedNormals)) geo.computeVertexNormals();
                            mesh = new this.THREE.Mesh(geo, new this.THREE.MeshLambertMaterial({
                                vertexColors: Array.isArray(td.sculptedColors),
                                flatShading: true
                            }));
                        } else if (style === 'minecraft' || style === 'veloren') {
                            const geo = this._buildRestoredVoxelTerrainGeometry(elev, td.genWidth || 65, td.genDepth || 65, opts.maxHeight, style);
                            mesh = new this.THREE.Mesh(geo, new this.THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
                        } else {
                            const gen = new mod.default();
                            mesh = gen.generate(elev, td.genWidth || 65, td.genDepth || 65, opts).mesh;
                        }
                        mesh.name = td.id || `terrain_restored_${Date.now().toString(36)}`;
                        mesh.userData = {
                            type: 'terrain',
                            _isTerrain: true,
                            elevationGrid: Array.from(elev),
                            genWidth: td.genWidth,
                            genDepth: td.genDepth,
                            cellSize,
                            heightScale: td.heightScale,
                            biome: td.biome,
                            biomePalette: td.biomePalette,
                            terrainStyle: style,
                            sculptedPositions: td.sculptedPositions,
                            sculptedNormals: td.sculptedNormals,
                            sculptedColors: td.sculptedColors,
                            waterLevel: td.waterLevel,
                            waterColorHex: td.waterColorHex,
                            waterOpacity: td.waterOpacity,
                            waterMask: td.waterMask,
                            riverPaths: td.riverPaths,
                            waterfallInstances: td.waterfallInstances,
                            lakeCount: td.lakeCount,
                            lakeSize: td.lakeSize,
                            riverCount: td.riverCount,
                            riverWidth: td.riverWidth,
                            waterfallsEnabled: td.waterfallsEnabled,
                            foliageInstances: td.foliageInstances,
                        };
                        if (td.position) mesh.position.set(...td.position);
                        mesh.receiveShadow = true;
                        this.scene.add(mesh);
                        this._terrainMeshes.push(mesh);
                        this._restoreTerrainExtras(td);
                        this._updateSceneTree();
                    }).catch(e => console.warn('[Editor3DCore] Failed to restore terrain:', e));
                }
            }
        }

        // Notify mode panel
        if (this._modePanel && typeof this._modePanel.onSceneRebuilt === 'function') {
            this._modePanel.onSceneRebuilt(levelData);
        }

        this._updateMaterialManager();
        this._updateSceneTree();
    }

    _restoreTerrainExtras(td) {
        const THREE = this.THREE;
        if (!THREE || !td) return;

        const w = td.genWidth || 65;
        const d = td.genDepth || 65;
        const cellSize = Math.max(0.25, Number(td.cellSize ?? 1) || 1);
        const maxHeight = td.heightScale || 8;
        const waterLevel = td.waterLevel ?? 0;
        const waterColorHex = td.waterColorHex || '#2a6a9a';
        const waterOpacity = Math.max(Number.isFinite(td.waterOpacity) ? td.waterOpacity : 0.82, 0.82);
        const waterMask = Array.isArray(td.waterMask) ? td.waterMask : null;
        const elevation = Array.isArray(td.elevationGrid) ? td.elevationGrid : null;

        if (waterMask && waterLevel > 0.02) {
            const waterY = waterLevel * maxHeight;
            const geo = this._buildRestoredWaterGeometry(waterMask, elevation, w, d, cellSize, waterY, waterLevel);
            const mat = new THREE.MeshLambertMaterial({
                color: new THREE.Color(waterColorHex),
                transparent: true,
                opacity: waterOpacity,
                flatShading: true,
                side: THREE.DoubleSide,
            });
            const water = new THREE.Mesh(geo, mat);
            water.name = `water_${td.id || Date.now().toString(36)}`;
            water.userData = { type: 'water', _isWater: true, waterLevelY: waterY, waterColorHex, waterOpacity, waterMask, riverPaths: td.riverPaths, genWidth: w, genDepth: d, cellSize };
            this.scene.add(water);
            this._waterMeshes.push(water);
        }

        if (Array.isArray(td.waterfallInstances) && td.waterfallInstances.length > 0) {
            const group = this._makeRestoredWaterfalls(td.waterfallInstances, maxHeight);
            this.scene.add(group);
            this._waterMeshes.push(group);
        }

        if (Array.isArray(td.foliageInstances) && td.foliageInstances.length > 0) {
            const group = new THREE.Group();
            group.name = `foliage_${td.id || Date.now().toString(36)}`;
            group.userData = { type: 'foliage', _isFoliage: true, instances: td.foliageInstances };
            let idx = 0;
            for (const inst of td.foliageInstances) {
                const obj = this._makeRestoredFoliage(inst.kind || 'grass', inst.scale || 1);
                if (!obj) continue;
                obj.position.set(...(inst.position || [0, 0, 0]));
                obj.rotation.y = inst.rotationY || 0;
                obj.name = `${inst.kind || 'foliage'}_${idx++}`;
                group.add(obj);
            }
            this.scene.add(group);
            this._foliageMeshes.push(group);
        }
    }

    _buildRestoredWaterGeometry(mask, elevation, w, d, tileSize, waterY, waterLevel = 0) {
        const positions = [];
        const addTri = (ax, az, bx, bz, cx, cz) => {
            positions.push(ax, waterY + 0.025, az, bx, waterY + 0.025, bz, cx, waterY + 0.025, cz);
        };
        for (let z = 0; z < d - 1; z++) {
            for (let x = 0; x < w - 1; x++) {
                const i00 = z * w + x;
                const i10 = z * w + x + 1;
                const i01 = (z + 1) * w + x;
                const i11 = (z + 1) * w + x + 1;
                const m = Math.max(mask[i00] || 0, mask[i10] || 0, mask[i01] || 0, mask[i11] || 0);
                const avgHeight = ((elevation?.[i00] || 0) + (elevation?.[i10] || 0) + (elevation?.[i01] || 0) + (elevation?.[i11] || 0)) / 4;
                const submerged = avgHeight <= waterLevel + 0.025;
                if (m <= 0.02 && !submerged) continue;
                const x0 = x * tileSize;
                const x1 = (x + 1) * tileSize;
                const z0 = z * tileSize;
                const z1 = (z + 1) * tileSize;
                addTri(x0, z0, x0, z1, x1, z1);
                addTri(x0, z0, x1, z1, x1, z0);
            }
        }
        const geo = new this.THREE.BufferGeometry();
        geo.setAttribute('position', new this.THREE.BufferAttribute(new Float32Array(positions), 3));
        geo.computeVertexNormals();
        return geo;
    }

    _buildRestoredVoxelTerrainGeometry(elevation, w, d, maxHeight, style) {
        const THREE = this.THREE;
        const positions = [];
        const colors = [];
        const cellsX = w - 1;
        const cellsZ = d - 1;
        const quant = style === 'veloren' ? 2 : 1;
        const minStep = style === 'veloren' ? 0.5 : 1;
        const color = new THREE.Color();

        const heightAt = (x, z) => {
            const v = elevation[Math.max(0, Math.min(d - 1, z)) * w + Math.max(0, Math.min(w - 1, x))] || 0;
            return Math.max(minStep, Math.round(v * maxHeight * quant) / quant);
        };
        const colorFor = (h) => {
            const n = Math.min(1, h / maxHeight);
            if (n < 0.2) return color.set(0x2e6b8a).clone();
            if (n < 0.32) return color.set(0xc2a86b).clone();
            if (n < 0.62) return color.set(0x4a7c3f).clone();
            if (n < 0.84) return color.set(0x6b6b5e).clone();
            return color.set(0xe8e8e8).clone();
        };
        const pushColor = (c, shade = 1) => {
            for (let i = 0; i < 6; i++) colors.push(Math.min(1, c.r * shade), Math.min(1, c.g * shade), Math.min(1, c.b * shade));
        };
        const addQuad = (verts, c, shade = 1) => {
            const [a, b, c0, d0] = verts;
            positions.push(...a, ...b, ...c0, ...a, ...c0, ...d0);
            pushColor(c, shade);
        };

        for (let z = 0; z < cellsZ; z++) {
            for (let x = 0; x < cellsX; x++) {
                const h = heightAt(x, z);
                const c = colorFor(h);
                const x0 = x, x1 = x + 1, z0 = z, z1 = z + 1;
                addQuad([[x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0]], c, 1.04);
                const neighbors = [
                    { h: z > 0 ? heightAt(x, z - 1) : 0, face: 'north' },
                    { h: z < cellsZ - 1 ? heightAt(x, z + 1) : 0, face: 'south' },
                    { h: x > 0 ? heightAt(x - 1, z) : 0, face: 'west' },
                    { h: x < cellsX - 1 ? heightAt(x + 1, z) : 0, face: 'east' },
                ];
                for (const n of neighbors) {
                    if (n.h >= h) continue;
                    const side = colorFor(h * 0.78);
                    if (n.face === 'north') addQuad([[x1, h, z0], [x0, h, z0], [x0, n.h, z0], [x1, n.h, z0]], side, 0.72);
                    if (n.face === 'south') addQuad([[x0, h, z1], [x1, h, z1], [x1, n.h, z1], [x0, n.h, z1]], side, 0.78);
                    if (n.face === 'west') addQuad([[x0, h, z0], [x0, h, z1], [x0, n.h, z1], [x0, n.h, z0]], side, 0.68);
                    if (n.face === 'east') addQuad([[x1, h, z1], [x1, h, z0], [x1, n.h, z0], [x1, n.h, z1]], side, 0.82);
                }
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
        geo.computeVertexNormals();
        return geo;
    }

    _makeRestoredFoliage(kind, scale) {
        const THREE = this.THREE;
        if (kind === 'rock') {
            const mesh = new THREE.Mesh(
                new THREE.DodecahedronGeometry(scale * 0.4),
                new THREE.MeshLambertMaterial({ color: 0x77746d, flatShading: true })
            );
            mesh.userData = { type: 'vegetation', kind: 'rock' };
            return mesh;
        }
        if (kind === 'grass') {
            const group = new THREE.Group();
            const mat = new THREE.MeshLambertMaterial({ color: 0x3f8a2f, side: THREE.DoubleSide, flatShading: true });
            const bladeH = scale * 1.8;
            for (let i = 0; i < 5; i++) {
                const blade = new THREE.Mesh(new THREE.PlaneGeometry(scale * 0.18, bladeH), mat);
                const a = (i / 5) * Math.PI * 2;
                blade.position.set(Math.cos(a) * scale * 0.08, bladeH * 0.5, Math.sin(a) * scale * 0.08);
                blade.rotation.y = a;
                blade.rotation.x = 0.25;
                group.add(blade);
            }
            group.userData = { type: 'grass', kind: 'grass' };
            return group;
        }

        const group = new THREE.Group();
        const trunkH = scale * 1.2;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(scale * 0.08, scale * 0.1, trunkH, 5),
            new THREE.MeshLambertMaterial({ color: 0x6B4226, flatShading: true })
        );
        trunk.position.y = trunkH / 2;
        group.add(trunk);
        const crown = new THREE.Mesh(
            new THREE.SphereGeometry(scale * 0.55, 5, 4),
            new THREE.MeshLambertMaterial({ color: kind === 'pine' ? 0x1a5a2f : 0x3a8a3f, flatShading: true })
        );
        crown.position.y = trunkH + scale * 0.25;
        crown.scale.y = kind === 'pine' ? 1.8 : 0.9;
        group.add(crown);
        group.userData = { type: 'vegetation', kind };
        return group;
    }

    _makeRestoredWaterfalls(instances, maxHeight) {
        const THREE = this.THREE;
        const group = new THREE.Group();
        group.name = `waterfalls_restored_${Date.now().toString(36)}`;
        group.userData = { type: 'waterfalls', _isWater: true, instances };
        const mat = new THREE.MeshLambertMaterial({
            color: 0x9ddcff,
            transparent: true,
            opacity: 0.72,
            flatShading: true,
            side: THREE.DoubleSide,
        });
        for (let i = 0; i < instances.length; i++) {
            const wf = instances[i];
            const width = Math.max(0.8, wf.width || 1);
            const height = Math.max(0.8, wf.height || 1);
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 3, 6), mat.clone());
            mesh.name = `waterfall_${i}`;
            mesh.position.set(wf.position?.[0] || 0, (wf.position?.[1] || 0) * maxHeight + height * 0.5, wf.position?.[2] || 0);
            mesh.rotation.y = wf.rotationY || 0;
            mesh.userData = { type: 'waterfall', _isWater: true };
            group.add(mesh);
        }
        return group;
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

        if (this._terrainMeshes && this._terrainMeshes.length > 0) {
            html += `<div class="tree-group"><div class="tree-group-label">🏔️ Terrain (${this._terrainMeshes.length})</div>`;
            for (const child of this._terrainMeshes) {
                const selected = this._selected.includes(child) ? 'selected' : '';
                html += `<div class="tree-item ${selected}" data-name="${child.name}">${child.name || '(terrain)'}</div>`;
            }
            html += '</div>';
        }

        if (this._waterMeshes && this._waterMeshes.length > 0) {
            html += `<div class="tree-group"><div class="tree-group-label">💧 Water (${this._waterMeshes.length})</div>`;
            for (const child of this._waterMeshes) {
                const selected = this._selected.includes(child) ? 'selected' : '';
                html += `<div class="tree-item ${selected}" data-name="${child.name}">${child.name || '(water)'}</div>`;
            }
            html += '</div>';
        }

        if (this._foliageMeshes && this._foliageMeshes.length > 0) {
            const allItems = [];
            for (const group of this._foliageMeshes) {
                for (const child of group.children) {
                    allItems.push(child);
                }
            }
            if (allItems.length > 0) {
                html += `<div class="tree-group"><div class="tree-group-label">🌿 Foliage (${allItems.length})</div>`;
                for (const child of allItems) {
                    const selected = this._selected.includes(child) ? 'selected' : '';
                    html += `<div class="tree-item ${selected}" data-name="${child.name}">${child.name || '(foliage)'}</div>`;
                }
                html += '</div>';
            }
        }

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

    loadMaterialPack(packName) {
        if (!this._levelData) return;
        if (!this._levelData.materials) this._levelData.materials = [];
        
        const newMaterials = MaterialPackManager.getMaterialsForPack(packName);
        if (newMaterials.length === 0) return;

        // Add them ensuring unique IDs
        for (const mat of newMaterials) {
            mat.id = 'mat_' + Math.random().toString(36).substr(2, 9);
            this._levelData.materials.push(mat);
        }

        this._updateMaterialManager();
        this._markDirty();
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
                const colorHex = mat.channels?.color?.value || '#666666';
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
                if (ud.propId) {
                    geoData.type = 'prop';
                    geoData.propId = ud.propId;
                    geoData.propGroup = ud.propGroup || null;
                    geoData.propPart = ud.propPart ?? null;
                }
                if (ud.material_assignments) {
                    geoData.material_assignments = { ...ud.material_assignments };
                }
                if (ud.material_overrides) {
                    geoData.material_overrides = { ...ud.material_overrides };
                }
                
                if ((ud.type === 'trimesh' || ud.type === 'prop') && mesh.geometry) {
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
                    rotation: [mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w],
                    scale:    [mesh.scale.x, mesh.scale.y, mesh.scale.z],
                    width:    ud.width,
                    height:   ud.height,
                    depth:    ud.depth,
                    colorHex: ud.colorHex,
                    properties: ud.properties || {},
                });
            }
        }
        const playerSpawn = data.entities.find(ent =>
            ent.type === 'player-spawn' || ent.type === 'player_spawn' || ent.properties?.studio === 'player'
        );
        if (playerSpawn?.position) {
            data.playerSpawn = {
                x: playerSpawn.position[0],
                y: playerSpawn.position[1],
                z: playerSpawn.position[2],
            };
            data.player = { ...(data.player || {}), ...(playerSpawn.properties || {}) };
        }
        const npcStudioCount = data.entities.filter(ent => ent.properties?.studio === 'npc').length;
        if (npcStudioCount > 0) {
            data.npcStudio = { ...(data.npcStudio || {}), count: npcStudioCount };
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
        // Ensure at least one light exists for the runtime. When no gizmos were
        // created (e.g. default __ambient__/__sun__ are skipped in _rebuildScene),
        // fall back to the level data's original light definitions.
        if (data.lights.length === 0 && Array.isArray(this._levelData?.lights) && this._levelData.lights.length > 0) {
            data.lights = [...this._levelData.lights];
        }

        // Serialize terrain meshes + water + foliage (stored separately from meshGroup)
        if (this._terrainMeshes && this._terrainMeshes.length > 0) {
            data.terrainMeshes = [];
            for (const mesh of this._terrainMeshes) {
                const ud = mesh.userData || {};
                if (ud.elevationGrid) {
                    data.terrainMeshes.push({
                        id: mesh.name,
                        type: 'terrain',
                        elevationGrid: ud.elevationGrid,
                        genWidth: ud.genWidth,
                        genDepth: ud.genDepth,
                        heightScale: ud.heightScale,
                        cellSize: ud.cellSize,
                        biome: ud.biome,
                        biomePalette: ud.biomePalette,
                        terrainStyle: ud.terrainStyle,
                        sculptedPositions: ud.sculptedPositions,
                        sculptedNormals: ud.sculptedNormals,
                        sculptedColors: ud.sculptedColors,
                        waterLevel: ud.waterLevel,
                        waterColorHex: ud.waterColorHex,
                        waterOpacity: ud.waterOpacity,
                        waterMask: ud.waterMask,
                        riverPaths: ud.riverPaths,
                        waterfallInstances: ud.waterfallInstances,
                        lakeCount: ud.lakeCount,
                        lakeSize: ud.lakeSize,
                        riverCount: ud.riverCount,
                        riverWidth: ud.riverWidth,
                        waterfallsEnabled: ud.waterfallsEnabled,
                        foliageInstances: ud.foliageInstances,
                        position: [mesh.position.x, mesh.position.y, mesh.position.z],
                    });
                }
            }
        }
        if (this._waterMeshes && this._waterMeshes.length > 0) {
            data.waterMeshes = [];
            for (const m of this._waterMeshes) {
                data.waterMeshes.push({
                    id: m.name,
                    position: [m.position.x, m.position.y, m.position.z],
                    waterLevel: m.userData.waterLevel ?? m.userData.waterLevelY ?? null,
                    waterColorHex: m.userData.waterColorHex ?? null,
                    waterOpacity: m.userData.waterOpacity ?? null,
                    waterMask: m.userData.waterMask ?? null,
                    genWidth: m.userData.genWidth ?? null,
                    genDepth: m.userData.genDepth ?? null,
                    cellSize: m.userData.cellSize ?? null,
                });
            }
        }
        if (this._foliageMeshes && this._foliageMeshes.length > 0) {
            data.foliageMeshes = [];
            for (const g of this._foliageMeshes) {
                data.foliageMeshes.push({
                    id: g.name,
                    position: [g.position.x, g.position.y, g.position.z],
                    count: g.children.length,
                    instances: g.userData?.instances ?? [],
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

        // No level loaded yet — nothing to validate
        if (!this._levelData) return errors;

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
        if (!this._levelData) {
            alert('No level is loaded. Please create or open a level before playtesting.');
            return;
        }

        const validationErrors = this._validateLevelForPlaytest();
        if (validationErrors.length > 0) {
            alert("Pre-playtest Validation Failed. Please fix these errors:\n\n" + validationErrors.join('\n\n'));
            return;
        }

        // Editor-only modes don't map 1:1 to a runtime engine.
        // Resolve them to the closest playable equivalent.
        const PLAYTEST_MODE_MAP = {
            'fps-3d':        'fps-3d',
            'topdown-3d':    'topdown-3d',
            'platformer-3d': 'platformer-3d',
            // Editor-only → nearest runtime
            'terrain':       'fps-3d',
            'proplib':       'fps-3d',
            'playerstudio':  'fps-3d',
            'npcstudio':     'fps-3d',
            'sculptstudio':  'fps-3d',
        };

        const runtimeMode = PLAYTEST_MODE_MAP[this._mode] || 'fps-3d';
        if (runtimeMode !== this._mode) {
            console.info(`[Editor3DCore] Editor mode "${this._mode}" has no direct runtime — playtesting as "${runtimeMode}".`);
        }

        const data = this._serializeLevelData();
        sessionStorage.setItem('redglitch_playtest_data', JSON.stringify(data));
        const url = `/engines/unified-3d/index.html?engine=${encodeURIComponent(runtimeMode)}&playtest=true`;
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

        const selMatPack = document.getElementById('sel-material-pack');
        if (selMatPack) {
            selMatPack.addEventListener('change', (e) => {
                const packName = e.target.value;
                if (packName) {
                    this.loadMaterialPack(packName);
                    e.target.value = ''; // Reset select
                }
            });
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

    _getPlacementRaycastObjects() {
        return [
            ...(this.meshGroup?.children || []),
            ...(this._terrainMeshes || []),
        ].filter(Boolean);
    }

    _syncProceduralTerrainToLevelData() {
        if (!this._levelData) return;
        if (this._terrainMeshes && this._terrainMeshes.length > 0) {
            this._levelData.terrainMeshes = this._terrainMeshes
                .filter(mesh => mesh?.userData?.elevationGrid)
                .map(mesh => {
                    const ud = mesh.userData || {};
                    return {
                        id: mesh.name,
                        type: 'terrain',
                        elevationGrid: ud.elevationGrid,
                        genWidth: ud.genWidth,
                        genDepth: ud.genDepth,
                        cellSize: ud.cellSize,
                        heightScale: ud.heightScale,
                        biome: ud.biome,
                        biomePalette: ud.biomePalette,
                        terrainStyle: ud.terrainStyle,
                        sculptedPositions: ud.sculptedPositions,
                        sculptedNormals: ud.sculptedNormals,
                        sculptedColors: ud.sculptedColors,
                        waterLevel: ud.waterLevel,
                        waterColorHex: ud.waterColorHex,
                        waterOpacity: ud.waterOpacity,
                        waterMask: ud.waterMask,
                        riverPaths: ud.riverPaths,
                        waterfallInstances: ud.waterfallInstances,
                        lakeCount: ud.lakeCount,
                        lakeSize: ud.lakeSize,
                        riverCount: ud.riverCount,
                        riverWidth: ud.riverWidth,
                        waterfallsEnabled: ud.waterfallsEnabled,
                        foliageInstances: ud.foliageInstances,
                        position: [mesh.position.x, mesh.position.y, mesh.position.z],
                    };
                });
        }
    }

    _onPointerDown(e) {
        if (this._gizmoDragging) return;
        if (this._modePanel?.handlePointerDown?.(e)) return;
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
                    if ((tool === 'player-studio' || tool === 'npc-studio') && this._modePanel?.placeSelectedAt) {
                        this._modePanel.placeSelectedAt(this.ghostMesh.position);
                    } else if (tool === 'entity' || tool === 'enemy' || tool === 'collectible' || tool === 'checkpoint' || tool === 'hazard' || tool === 'trigger' || tool === 'npc' || tool === 'building' || tool === 'resource') {
                        const entityType = state.entity || state.block || 'spawn';
                        const props = { ...(state.properties || {}) };
                        if (state.team !== undefined) props.team = state.team;
                        this.placeEntityAt(this.ghostMesh.position, entityType, props);
                    } else if (tool === 'light') {
                        this.placeLightAt(this.ghostMesh.position, state.lightType || 'point');
                    } else if (tool === 'prop' && this._modePanel?.placeSelectedAt) {
                        this._pushUndo();
                        this._modePanel.placeSelectedAt(this.ghostMesh.position);
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
        if (this._modePanel?.handlePointerMove?.(e)) return;
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
                    const hits = raycaster.intersectObjects(this._getPlacementRaycastObjects(), true);
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
        if (this._modePanel?.handlePointerUp?.(e)) return;
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
                    const hits = raycaster.intersectObjects(this._getPlacementRaycastObjects(), true)
                        .filter(hit => !hit.object.userData?._isTerrain);
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
        if (!this._levelData) {
            this._levelData = { geometry: [], entities: [], lights: [], materials: [] };
        }
        this._syncProceduralTerrainToLevelData();
        this._pushUndo();
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

        let color = '#666666';
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
        this._preserveLiveTerrainOnNextRebuild = true;
        this._rebuildScene(this._levelData);
        this._markDirty();
        
        // Auto-select the newly placed block
        const mesh = this.scene.getObjectByName(newBlock.id);
        if (mesh) this.select(mesh);
    }

    placeLightAt(pos, type = 'point') {
        if (!this._levelData) {
            this._levelData = { geometry: [], entities: [], lights: [], materials: [] };
        }
        this._syncProceduralTerrainToLevelData();
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
        if (!this._levelData) {
            this._levelData = { geometry: [], entities: [], lights: [], materials: [] };
        }
        this._syncProceduralTerrainToLevelData();
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

        if (meshObj.userData.propId) {
            this._removePropMeshFromTracking(meshObj.name);
            meshObj.parent?.remove(meshObj);
            if (meshObj.geometry) meshObj.geometry.dispose();
            if (meshObj.material) {
                if (Array.isArray(meshObj.material)) meshObj.material.forEach(m => m.dispose());
                else meshObj.material.dispose();
            }

            this.deselectAll();
            this._updateSceneTree();
            this._markDirty();
            return;
        }
        
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

    _removePropMeshFromTracking(meshName) {
        if (!Array.isArray(this._propGroups)) return;
        for (const group of this._propGroups) {
            if (Array.isArray(group.meshNames)) {
                group.meshNames = group.meshNames.filter(name => name !== meshName);
            }
        }
        this._propGroups = this._propGroups.filter(group => group.meshNames?.length > 0);
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
            if (obj.userData?.propId) {
                this._removePropMeshFromTracking(name);
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
        this.weatherSystem?.update(this.camera, dt);

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
            'vehicle': '#3f6fb4',
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
        this.weatherSystem?.dispose?.();
        for (const list of [this._terrainMeshes, this._waterMeshes, this._foliageMeshes]) {
            if (list) {
                for (const m of list) {
                    m.parent?.remove(m);
                    if (m.geometry) m.geometry?.dispose();
                    if (m.material) {
                        if (Array.isArray(m.material)) m.material.forEach(x => x.dispose());
                        else m.material.dispose();
                    }
                    if (m.traverse) {
                        m.traverse(c => {
                            c.geometry?.dispose();
                            if (c.material) {
                                if (Array.isArray(c.material)) c.material.forEach(x => x.dispose());
                                else c.material.dispose();
                            }
                        });
                    }
                }
                list.length = 0;
            }
        }
        if (this._propGroups) this._propGroups = [];
    }
}
