/**
 * Engine3DAdapter.js — Concrete 3D adapter base for Ketebe 3D engines.
 *
 * Extends Engine3DBase with:
 *  - Standard level lifecycle: initialize3D(), loadLevel3D(), unloadLevel3D()
 *  - 3D level JSON schema validation & hydration
 *  - Server-backed level fetch/save helpers via /api/levels3d
 *  - Default scene population from level data (geometry, entities, lights, skybox)
 *
 * Visual style: LOW-POLY + VOXEL, NO PBR, NO HDR, palette-indexed flat colors only.
 *
 * Usage:
 *   class MyEngine extends Engine3DAdapter {
 *     get engineType3D() { return 'topdown-3d'; }
 *     onLevelLoaded(level)  { // hydrate engine-specific systems
 *     onLevelUnloaded()     { // teardown
 *   }
 */

import Engine3DBase from './Engine3DBase.js';
import * as THREE from '/lib/three/three.module.js';
import { hexMaterial, PrimitiveFactory } from './Renderer3D.js';

// ── Level Schema Version ──────────────────────────────────────────────────────
const LEVEL_SCHEMA_VERSION = '1.0';

/**
 * 3D Level JSON schema:
 * {
 *   version:    string,          // LEVEL_SCHEMA_VERSION
 *   engineType: string,          // 'topdown-3d' | 'fps-3d' | 'platformer-3d'
 *   name:       string,
 *   geometry:   GeometryDef[],   // static meshes / voxel chunks
 *   entities:   EntityDef[],     // dynamic objects (NPCs, pickups, triggers)
 *   lights:     LightDef[],      // directional, point, spot, ambient
 *   navmesh:    NavmeshDef|null, // baked navmesh polygon soup
 *   skybox:     SkyboxDef|null,  // solid color or palette-idx gradient
 *   physics:    PhysicsDef,      // gravity, fixed-step config
 * }
 *
 * GeometryDef:  { id, type:'mesh'|'voxelChunk', position[3], rotation[4], scale[3], palette_index|colorHex, mesh_ref, chunk_data }
 * EntityDef:    { id, type, position[3], rotation[4], scale[3], properties{} }
 * LightDef:     { id, type:'ambient'|'directional'|'point'|'spot', color_index, intensity, position[3], target[3], castShadow }
 * NavmeshDef:   { vertices: number[], indices: number[], areas: number[] }
 * SkyboxDef:    { type:'solid'|'gradient', top_index, bottom_index }
 * PhysicsDef:   { gravity[3], fixedStep, iterations }
 */

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_PHYSICS = { gravity: [0, -9.82, 0], fixedStep: 1 / 60, iterations: 10 };
const DEFAULT_SKYBOX  = { type: 'solid', top_index: 0, bottom_index: 0 };

// ── Engine3DAdapter ───────────────────────────────────────────────────────────

export default class Engine3DAdapter extends Engine3DBase {

    constructor(container, options = {}) {
        // Engine3DBase expects (engineType3D, container)
        // We need to pass engineType first - child class will set this._engineType3D
        // Use a placeholder that will be overridden by child's getter
        super('generic-3d', container);

        /** @type {object|null} Currently loaded raw level data */
        this._currentLevel = null;

        /** @type {string|null} Project name owning the active level */
        this._projectName = null;

        /** @type {string|null} Active level id */
        this._levelId = null;

        /** @type {Map<string, THREE.Object3D>} scene objects keyed by level entity/geometry id */
        this._levelObjects = new Map();

        /** @type {boolean} True while level load is in progress */
        this._levelLoading = false;
    }

    // ── Abstract hooks ────────────────────────────────────────────────────────

    /**
     * Called after the scene has been populated from level data.
     * Override in subclasses to hydrate engine-specific systems.
     * @param {object} level - Validated, hydrated level data
     */
    onLevelLoaded(level) {}  // eslint-disable-line no-unused-vars

    /**
     * Called before the scene is cleared during unloadLevel3D().
     * Override to teardown engine-specific state.
     */
    onLevelUnloaded() {}

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * initialize3D() — one-time setup called after the renderer is ready.
     * Subclasses may override; always call super.initialize3D().
     */
    async initialize3D() {
        if (this._3dInitialized) return;
        await super.initialize3D ? super.initialize3D() : null;
        this._3dInitialized = true;
        console.log(`[Engine3DAdapter] initialize3D() complete for ${this.engineType3D}`);
    }

    /**
     * loadLevel3D(levelData) — validate, hydrate, and populate the scene.
     * @param {object} levelData - Raw level JSON (from server or inline)
     * @returns {Promise<object>} The hydrated level
     */
    async loadLevel3D(levelData) {
        if (this._levelLoading) {
            console.warn('[Engine3DAdapter] loadLevel3D() called while already loading — ignored');
            return null;
        }
        this._levelLoading = true;
        try {
            // Unload previous level
            if (this._currentLevel) {
                await this.unloadLevel3D();
            }

            // Validate + normalize
            const level = this._validateLevel(levelData);

            // Populate scene
            this._populateLights(level.lights);
            this._populateGeometry(level.geometry);
            
            // Phase 37: Advanced Lighting & Fog Integration
            if (level.lighting) {
                this._applyLightingConfig(level.lighting);
            } else {
                this._applySkybox(level.skybox);
            }
            
            this._applyPhysicsConfig(level.physics);

            this._currentLevel = level;

            // Notify subclass
            await Promise.resolve(this.onLevelLoaded(level));

            console.log(`[Engine3DAdapter] Level loaded: "${level.name}" (${level.engineType})`);
            return level;
        } catch (err) {
            console.error('[Engine3DAdapter] loadLevel3D failed:', err.message);
            throw err;
        } finally {
            this._levelLoading = false;
        }
    }

    /**
     * unloadLevel3D() — remove all level objects from scene, reset state.
     */
    async unloadLevel3D() {
        this.onLevelUnloaded();

        // Remove & dispose scene objects owned by this level
        for (const [, obj] of this._levelObjects) {
            if (this.scene) this.scene.remove(obj);
            _disposeObject(obj);
        }
        this._levelObjects.clear();
        this._currentLevel = null;
        this._levelId = null;
        console.log('[Engine3DAdapter] Level unloaded');
    }

    /**
     * fetchLevel(project, levelId) — load a level from the server.
     * @returns {Promise<object>} Hydrated level data
     */
    async fetchLevel(project, levelId) {
        const res = await fetch(`/api/levels3d/${encodeURIComponent(project)}/${encodeURIComponent(levelId)}`);
        if (!res.ok) throw new Error(`fetchLevel: HTTP ${res.status} for ${project}/${levelId}`);
        const data = await res.json();
        this._projectName = project;
        this._levelId = levelId;
        return this.loadLevel3D(data);
    }

    /**
     * saveLevel(project, levelId, extraData) — persist current level + optional overrides.
     * @returns {Promise<void>}
     */
    async saveLevel(project, levelId, extraData = {}) {
        if (!this._currentLevel) throw new Error('saveLevel: no active level');
        const payload = { ...this._currentLevel, ...extraData };
        const res = await fetch(
            `/api/levels3d/${encodeURIComponent(project)}/${encodeURIComponent(levelId)}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );
        if (!res.ok) throw new Error(`saveLevel: HTTP ${res.status}`);
        console.log(`[Engine3DAdapter] Level saved: ${project}/${levelId}`);
    }

    // ── Schema validation ─────────────────────────────────────────────────────

    _validateLevel(raw) {
        if (!raw || typeof raw !== 'object') throw new Error('Level data must be an object');

        const rawLights = (Array.isArray(raw.lights) && raw.lights.length > 0)
            ? raw.lights
            : [_defaultAmbient(), _defaultSun()];

        const level = {
            // Preserve engine-specific payload fields (e.g. topdown terrain/nav extras)
            ...raw,
            version:    raw.version    || LEVEL_SCHEMA_VERSION,
            engineType: raw.engineType || this.engineType3D || 'topdown-3d',
            name:       raw.name       || 'Untitled Level',
            geometry:   Array.isArray(raw.geometry)  ? raw.geometry  : [],
            entities:   Array.isArray(raw.entities)  ? raw.entities  : [],
            lights:     rawLights.map(_normalizeLightDef).filter(Boolean),
            navmesh:    raw.navmesh    || null,
            skybox:     raw.skybox     || { ...DEFAULT_SKYBOX },
            physics:    { ...DEFAULT_PHYSICS, ...(raw.physics || {}) },
        };

        // Normalize all transforms
        level.geometry  = level.geometry.map(_normalizeTransform);
        level.entities  = level.entities.map(_normalizeTransform);

        const valid3D = ['topdown-3d', 'fps-3d', 'platformer-3d'];
        if (!valid3D.includes(level.engineType)) {
            console.warn(`[Engine3DAdapter] Unknown engineType "${level.engineType}", proceeding anyway`);
        }

        return level;
    }

    // ── Scene population ──────────────────────────────────────────────────────

    _populateLights(lights) {
        if (!this.scene || !this.THREE) return;
        const THREE = this.THREE;
        const paletteManager = this._getPaletteManager();

        for (const def of lights) {
            let light = null;

            const color = _resolveColor(def, paletteManager);

            switch (def.type) {
                case 'ambient':
                    light = new THREE.AmbientLight(color, def.intensity ?? 0.4);
                    break;
                case 'directional': {
                    light = new THREE.DirectionalLight(color, def.intensity ?? 1.0);
                    if (def.castShadow) {
                        light.castShadow = true;
                        light.shadow.mapSize.set(512, 512);
                        light.shadow.camera.near = 0.5;
                        light.shadow.camera.far  = 500;
                    }
                    if (def.target) {
                        light.target.position.set(...def.target);
                        this.scene.add(light.target);
                    }
                    break;
                }
                case 'point':
                    light = new THREE.PointLight(color, def.intensity ?? 1.0, def.distance ?? 20, def.decay ?? 2);
                    break;
                case 'spot': {
                    light = new THREE.SpotLight(color, def.intensity ?? 1.0, def.distance ?? 30, def.angle ?? Math.PI / 6, def.penumbra ?? 0.2);
                    if (def.castShadow) light.castShadow = true;
                    break;
                }
                default:
                    console.warn(`[Engine3DAdapter] Unknown light type: ${def.type}`);
                    continue;
            }

            if (def.position) light.position.set(...def.position);
            if (def.id) light.name = def.id;

            this.scene.add(light);
            if (def.id) this._levelObjects.set(def.id, light);
        }
    }

    async _populateGeometry(geometry) {
        if (!this.scene || !this.THREE) return;
        const THREE = this.THREE;
        const paletteManager = this._getPaletteManager();

        // ── Load Texture Atlas (Phase 63) ────────────────────────────────────
        let atlas = null;
        const needsAtlas = geometry.some(d => d.textureId);
        if (needsAtlas) {
            try {
                const { default: TextureAtlas3D } = await import('./TextureAtlas3D.js');
                atlas = new TextureAtlas3D();
                await atlas.loadAsync(THREE);
            } catch (err) {
                console.warn('[Engine3DAdapter] Failed to load TextureAtlas3D:', err.message);
            }
        }

        for (const def of geometry) {
            let obj = null;

            if (def.type === 'voxelChunk') {
                this._emitLevelEvent('voxelChunk', def);
                continue;
            }

            // ── Geometry Factory (Phase 64/65) ──────────────────────────────
            const type = (def.blockType || def.type || 'box').toLowerCase();
            const w = def.width  || def.w || 1;
            const h = def.height || def.h || 1;
            const d = def.depth  || def.d || 1;
            
            const geo = PrimitiveFactory.create(type, w, h, d);

            let mat;
            if (def.textureId && atlas) {
                atlas.applyBlockUVs(geo, data.textureId);
                mat = atlas.getMaterial(THREE);
            } else {
                const color = _resolveColor(def, paletteManager);
                mat = hexMaterial(color);
            }

            // Phase 38: Support emissive overrides (for glow blocks)
            if (def.emissive || def.emissiveIntensity != null) {
                mat = mat.clone();
                if (def.emissive) mat.emissive.set(def.emissive);
                if (def.emissiveIntensity != null) mat.emissiveIntensity = def.emissiveIntensity;
            }

            obj = new THREE.Mesh(geo, mat);
            _applyTransformToObject(obj, def);
            if (def.id) obj.name = def.id;
            obj.castShadow    = def.castShadow    ?? false;
            obj.receiveShadow = def.receiveShadow ?? true;

            this.scene.add(obj);
            if (def.id) this._levelObjects.set(def.id, obj);
        }
    }

    _applyLightingConfig(config) {
        if (!this.scene || !this.THREE) return;
        const THREE = this.THREE;

        // 1. Sun Directional Light
        let sun = this.scene.getObjectByName('__sunLight') || this.scene.getObjectByName('__sun__');
        if (!sun && config.sunIntensity > 0) {
            sun = new THREE.DirectionalLight(config.sunColor, config.sunIntensity);
            sun.name = '__sunLight';
            this.scene.add(sun);
        }
        if (sun) {
            sun.color.set(config.sunColor);
            sun.intensity = config.sunIntensity;
            
            // Calculate direction from Azimuth/Elevation
            const az = (config.sunAzimuth ?? 45) * Math.PI / 180;
            const el = (config.sunElevation ?? 45) * Math.PI / 180;
            const r = 100;
            sun.position.set(
                r * Math.cos(el) * Math.sin(az),
                r * Math.sin(el),
                r * Math.cos(el) * Math.cos(az)
            );
            sun.target.position.set(0, 0, 0);
        }

        // 2. Ambient Light
        let amb = this.scene.getObjectByName('__ambLight') || this.scene.getObjectByName('__ambient__');
        if (!amb && config.ambientIntensity > 0) {
            amb = new THREE.AmbientLight(config.ambientColor, config.ambientIntensity);
            amb.name = '__ambLight';
            this.scene.add(amb);
        }
        if (amb) {
            amb.color.set(config.ambientColor);
            amb.intensity = config.ambientIntensity;
        }

        // 3. Fog
        if (config.fogEnabled) {
            this.scene.fog = new THREE.FogExp2(config.fogColor, config.fogDensity);
        } else {
            this.scene.fog = null;
        }

        // 4. Sky (Simple background or dome)
        if (config.skyTop && config.skyHorizon) {
            // If we have a complex skybox system, use it. Otherwise just set background color
            if (this.skybox && typeof this.skybox.setColors === 'function') {
                this.skybox.setColors(config.skyTop, config.skyHorizon);
            } else {
                this.scene.background = new THREE.Color(config.skyHorizon);
            }
        }
    }

    _applySkybox(skyboxDef) {
        if (!this.scene) return;
        const sky = skyboxDef || DEFAULT_SKYBOX;

        // Modern SkyboxSystem (Phase 62)
        if (this.skybox) {
            this.skybox.applyConfig(sky);
            return;
        }

        const paletteManager = this._getPaletteManager();
        if (paletteManager && sky.top_index != null) {
            const col = paletteManager.getColor(sky.top_index);
            this.scene.background = col;
        } else if (sky.colorHex) {
            const THREE = this.THREE;
            if (THREE?.Color) {
                this.scene.background = new THREE.Color(sky.colorHex);
            }
        }
    }

    _applyPhysicsConfig(physicsDef) {
        const physicsWorld = this._getPhysicsWorld();
        if (!physicsWorld) return;
        const pd = physicsDef || DEFAULT_PHYSICS;
        if (pd.gravity && typeof physicsWorld.setGravity === 'function') {
            physicsWorld.setGravity(pd.gravity[0], pd.gravity[1], pd.gravity[2]);
        }
        if (pd.fixedStep) physicsWorld.fixedStep = pd.fixedStep;
        if (pd.iterations && physicsWorld.world?.solver) {
            physicsWorld.world.solver.iterations = pd.iterations;
        }
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    _emitLevelEvent(type, data) {
        if (typeof this.emit === 'function') this.emit(`level:${type}`, data);
    }

    /**
     * getLevelObject(id) — retrieve a scene object by its level definition id.
     * @param {string} id
     * @returns {THREE.Object3D|undefined}
     */
    getLevelObject(id) {
        return this._levelObjects.get(id);
    }

    /** @returns {object|null} Current level data */
    get currentLevel() { return this._currentLevel; }

    /** @returns {boolean} True if a level is loaded */
    get hasLevel() { return this._currentLevel !== null; }

    _getPaletteManager() {
        return this.paletteManager ?? this.palette ?? null;
    }

    _getPhysicsWorld() {
        return this.physicsWorld ?? this.physics ?? null;
    }

    // ── Static helpers ────────────────────────────────────────────────────────

    /**
     * createEmptyLevel(engineType, name) — generate a blank level scaffold.
     * @param {'topdown-3d'|'fps-3d'|'platformer-3d'} engineType
     * @param {string} name
     * @returns {object}
     */
    static createEmptyLevel(engineType = 'topdown-3d', name = 'New Level') {
        return {
            version:    LEVEL_SCHEMA_VERSION,
            engineType,
            name,
            geometry:   [],
            entities:   [],
            lights:     [_defaultAmbient(), _defaultSun()],
            navmesh:    null,
            skybox:     { type: 'solid', top_index: 0 },
            physics:    { ...DEFAULT_PHYSICS },
        };
    }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

function _normalizeTransform(def) {
    const out = { ...def };
    if (!Array.isArray(out.position)) out.position = [0, 0, 0];
    if (!Array.isArray(out.rotation)) out.rotation = [0, 0, 0, 1]; // quaternion xyzw
    if (!Array.isArray(out.scale))    out.scale    = [1, 1, 1];
    return out;
}

function _applyTransformToObject(obj, def) {
    if (def.position) obj.position.set(...def.position);
    if (def.rotation) obj.quaternion.set(def.rotation[0], def.rotation[1], def.rotation[2], def.rotation[3]);
    if (def.scale)    obj.scale.set(...def.scale);
}

function _resolveColor(def, paletteManager) {
    if (def.colorHex) return def.colorHex;
    if (paletteManager && def.palette_index != null) {
        const col = paletteManager.getColor(def.palette_index);
        // Ensure we return a hex string or number, not a THREE.Color object 
        // if the caller expects to pass it to a constructor that might wrap it again
        return col;
    }
    return 0xcccccc;
}

function _normalizeLightDef(lightDef) {
    if (!lightDef || typeof lightDef !== 'object') return null;

    const type = _coerceLightType(lightDef.type ?? lightDef.lightType ?? lightDef.kind);
    const out = { ...lightDef, type };

    if (typeof out.color !== 'undefined' && typeof out.colorHex === 'undefined') {
        out.colorHex = out.color;
    }

    if (out.position) out.position = _toVec3(out.position, [0, 10, 0]);
    if (out.target) out.target = _toVec3(out.target, [0, 0, 0]);

    if (typeof out.intensity !== 'undefined') out.intensity = Number(out.intensity);
    if (typeof out.distance  !== 'undefined') out.distance  = Number(out.distance);
    if (typeof out.decay     !== 'undefined') out.decay     = Number(out.decay);
    if (typeof out.angle     !== 'undefined') out.angle     = Number(out.angle);
    if (typeof out.penumbra  !== 'undefined') out.penumbra  = Number(out.penumbra);

    if (typeof out.castShadow !== 'undefined') out.castShadow = !!out.castShadow;
    return out;
}

function _coerceLightType(input) {
    if (typeof input === 'string') {
        const key = input.trim().toLowerCase();
        if (['ambient', 'directional', 'point', 'spot'].includes(key)) return key;
        if (key === 'sun') return 'directional';
        if (key === 'hemisphere') return 'ambient';
        return 'ambient';
    }
    if (input && typeof input === 'object') {
        return _coerceLightType(
            input.value ?? input.type ?? input.name ?? input.label ?? input.id ?? 'ambient',
        );
    }
    return 'ambient';
}

function _toVec3(input, fallback) {
    if (Array.isArray(input)) {
        return [
            Number(input[0] ?? fallback[0]),
            Number(input[1] ?? fallback[1]),
            Number(input[2] ?? fallback[2]),
        ];
    }
    if (input && typeof input === 'object') {
        return [
            Number(input.x ?? fallback[0]),
            Number(input.y ?? fallback[1]),
            Number(input.z ?? fallback[2]),
        ];
    }
    return [...fallback];
}

function _defaultAmbient() {
    return { id: '__ambient__', type: 'ambient', intensity: 1.2, palette_index: null, colorHex: '#ffffff' };
}

function _defaultSun() {
    return {
        id: '__sun__', type: 'directional', intensity: 2.5,
        position: [30, 60, 30], target: [0, 0, 0],
        palette_index: null, colorHex: '#fffbe0', castShadow: true,
    };
}

function _disposeObject(obj) {
    if (!obj) return;
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
    }
    obj.traverse && obj.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
    });
}
