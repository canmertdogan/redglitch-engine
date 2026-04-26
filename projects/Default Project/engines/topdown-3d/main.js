/**
 * main.js — Topdown-3D Engine entry point
 *
 * Extends Engine3DAdapter with the full topdown-3D game loop:
 *   Input → Physics → AI → Abilities → VFX → Camera → Audio → Render
 *
 * Visual style: LOW-POLY + VOXEL, flat palette colors, cel-shading only.
 * No PBR, no HDR, no texture atlases — pure MeshLambertMaterial + OutlinePass.
 *
 * Systems wired here (stubs ready for later phases):
 *   - Renderer3D        (Phase 3)   — WebGL + EffectComposer pipeline
 *   - Camera3DController(Phase 4)   — TOPDOWN mode, 55° pitch
 *   - Physics3DWorld    (Phase 5)   — cannon-es fixed-step
 *   - PaletteManager    (Phase 6)   — 256-color palette
 *   - AssetLoader3D     (Phase 6)   — GLTF + .vox LRU cache
 *   - Input3D           (Phase 7)   — action-mapped input
 *   - AudioSpatial3D    (Phase 8)   — HRTF + reverb
 *   - Raycast3D         (Phase 9)   — layer-masked picking
 *   - TopDownCamera3D   (Phase 12)  — null until loaded
 *   - TerrainSystem3D   (Phase 13)  — null until loaded
 *   - EntitySystem3D    (Phase 14)  — null until loaded
 *   - Pathfinding3D     (Phase 15)  — null until loaded
 *   - FogOfWar3D        (Phase 16)  — null until loaded
 *   - AbilitySystem3D   (Phase 17)  — null until loaded
 *   - VFXSystem3D       (Phase 18)  — null until loaded
 *   - Minimap3D         (Phase 19)  — null until loaded
 *
 * Entry point: window.TopDownGame3D
 */

import * as THREE             from '/lib/three/three.module.js';
import Engine3DAdapter          from '../shared/Engine3DAdapter.js';
import Renderer3D               from '../shared/Renderer3D.js';
import Camera3DController,
       { CameraMode }           from '../shared/Camera3DController.js';
import Physics3DWorld           from '../shared/Physics3DWorld.js';
import PaletteManager           from '../shared/PaletteManager.js';
import AssetLoader3D            from '../shared/AssetLoader3D.js';
import Input3D                  from '../shared/Input3D.js';
import AudioSpatial3D           from '../shared/AudioSpatial3D.js';
import Raycast3D,
       { LayerMask }            from '../shared/Raycast3D.js';
import SkyboxSystem             from '../shared/SkyboxSystem.js';
import TopDownCamera3D          from './TopDownCamera3D.js';
import TerrainSystem3D, { BlockType } from './TerrainSystem3D.js';
import EntitySystem3D, { AIState, Entity3D } from './EntitySystem3D.js';
import Pathfinding3D, { AreaType } from './Pathfinding3D.js';
import FogOfWar3D, { VisState } from './FogOfWar3D.js';
import AbilitySystem3D, { AbilityShape, DamageType, BuffType } from './AbilitySystem3D.js';
import VFXSystem3D, { EffectType } from './VFXSystem3D.js';
import Minimap3D from './Minimap3D.js';
import TopDown3DStrategy from './TopDown3DStrategy.js';
import {
    serializeSavePayload3D,
    deserializeSavePayload3D,
    serialize3DPlayerState,
    deserialize3DPlayerState,
} from '../shared/Save3D.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const TOPDOWN3D_VERSION = '0.1.0';
const DEFAULT_SAVE_SLOT  = 0;
const FIXED_STEP         = 1 / 60;   // physics tick rate
const MAX_DELTA          = 0.1;      // delta cap (100 ms) — prevents spiral of death
const FOG_SAVE_KEY       = 'fog_explored';

// ── TopDownGame3D ─────────────────────────────────────────────────────────────

class TopDownGame3D extends Engine3DAdapter {

    constructor(container, options = {}) {
        super(container, options);

        // ── Identity ───────────────────────────────────────────────────────
        this._engineType3D = 'topdown-3d';
        this.version       = TOPDOWN3D_VERSION;

        // ── Player state ───────────────────────────────────────────────────
        this.username    = null;
        this.saveSlot    = DEFAULT_SAVE_SLOT;
        this.currentProject = null;
        this.isRunning   = false;
        this.isPaused    = false;

        // ── Shared systems (Phase 3–9, instantiated in init()) ─────────────
        this.renderer3d      = null;   // Renderer3D
        this.camera3d        = null;   // Camera3DController
        this.physics         = null;   // Physics3DWorld
        this.palette         = null;   // PaletteManager
        this.assets          = null;   // AssetLoader3D
        this.input           = null;   // Input3D
        this.audio           = null;   // AudioSpatial3D
        this.raycast         = null;   // Raycast3D
        this.skybox          = null;   // SkyboxSystem

        // ── Phase-specific systems (populated in later phases) ─────────────
        this.topdownCamera   = null;   // TopDownCamera3D    (Phase 12)
        this.terrain         = null;   // TerrainSystem3D    (Phase 13)
        this.entities        = null;   // EntitySystem3D     (Phase 14)
        this.pathfinding     = null;   // Pathfinding3D      (Phase 15)
        this.fogOfWar        = null;   // FogOfWar3D         (Phase 16)
        this.abilities       = null;   // AbilitySystem3D    (Phase 17)
        this.vfx             = null;   // VFXSystem3D        (Phase 18)
        this.minimap         = null;   // Minimap3D          (Phase 19)
        this.strategy        = null;   // TopDown3DStrategy  (Phase 20)

        // ── Game state ─────────────────────────────────────────────────────
        this.selectedUnits   = [];     // array of entity ids
        this.gameTime        = 0;      // seconds since level start
        this._accumulator    = 0;      // physics sub-step accumulator
        this._lastTS         = 0;      // last requestAnimationFrame timestamp
        this._levelComplete  = false;  // set true to trigger exit (Phase 20)
        this._levelId        = null;   // current loaded level id
        this._playerTeam     = 0;      // team treated as player/allies
        this._initialHostileCount = 0; // baseline hostiles at level start

        // ── Event listeners (on/off/emit — Phase 20) ───────────────────────
        this._listeners      = new Map([
            ['levelComplete', []],
            ['gameOver',      []],
            ['unitDied',      []],
            ['abilityCast',   []],
        ]);

        // ── Event callbacks (set by launcher / editor) ─────────────────────
        this.onReady         = null;
        this.onLevelReady    = null;
        this.onGameOver      = null;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * init() — create all shared systems, attach renderer canvas.
     * Call once before loadLevel3D() or login().
     */
    async init() {
        console.log(`[TopDownGame3D v${TOPDOWN3D_VERSION}] init()`);

        const container = this.container || document.getElementById('game-container');
        if (!container) throw new Error('TopDownGame3D: no container element');

        // ── Renderer ───────────────────────────────────────────────────────
        this.renderer3d = new Renderer3D(container, {
            antialias:   false,   // low-poly — no need for AA
            shadows:     true,
            shadowType:  1,       // PCFSoftShadowMap index
            pixelRatio:  Math.min(window.devicePixelRatio, 2),
        });
        await this.renderer3d.init();

        // Expose THREE + scene for Engine3DAdapter's populate helpers
        this.THREE = this.renderer3d.THREE;
        this.scene  = this.renderer3d.scene;

        // ── Camera ─────────────────────────────────────────────────────────
        this.camera3d = new Camera3DController(this.renderer3d.camera, container, {
            mode: CameraMode.TOPDOWN,
        });

        // ── Physics ────────────────────────────────────────────────────────
        this.physics = new Physics3DWorld({ gravity: [0, -9.82, 0] });
        this.physics.init();

        // ── Palette ────────────────────────────────────────────────────────
        this.palette = new PaletteManager();

        // ── Assets ─────────────────────────────────────────────────────────
        this.assets = new AssetLoader3D(this.scene, this.palette);

        // ── Input ──────────────────────────────────────────────────────────
        this.input = new Input3D(container);
        this.input.attach();

        // ── Audio ──────────────────────────────────────────────────────────
        this.audio = new AudioSpatial3D();
        this.audio.init();

        // ── Raycaster ──────────────────────────────────────────────────────
        this.raycast = new Raycast3D(this.scene);
        this.raycast.setCamera(this.renderer3d.camera);

        // ── Skybox ─────────────────────────────────────────────────────────
        this.skybox = new SkyboxSystem(this.scene);
        this.skybox.setGradient('#3a6a8a', '#ccddee'); // classic RPG sky

        // ── Default Lighting ───────────────────────────────────────────────
        const amb = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(amb);
        const sun = new THREE.DirectionalLight(0xffffff, 1.5);
        sun.position.set(30, 60, 30);
        sun.castShadow = true;
        this.scene.add(sun);

        // ── Terrain (Phase 13) ─────────────────────────────────────────────
        this.terrain = new TerrainSystem3D(this.scene, this.palette, this.physics);

        // ── Entities (Phase 14) ────────────────────────────────────────────
        this.entities = new EntitySystem3D(
            this.scene, this.assets, this.physics, this.palette, this.terrain
        );

        // ── Pathfinding (Phase 15) ─────────────────────────────────────────
        this.pathfinding = new Pathfinding3D(this.scene);

        // ── Fog of War (Phase 16) ──────────────────────────────────────────
        this.fogOfWar = new FogOfWar3D(this.scene, {
            worldW: 64, worldH: 64, playerTeam: 0,
        });

        // ── VFX (Phase 18) — created before abilities so abilities can ref it ─
        this.vfx = new VFXSystem3D(
            this.scene, this.palette, this.renderer3d.outlinePass ?? null
        );

        // ── Abilities (Phase 17) ───────────────────────────────────────────
        this.abilities = new AbilitySystem3D(
            this.scene, this.entities, this.vfx, this.palette
        );
        this.topdownCamera = new TopDownCamera3D(this.renderer3d.camera, container, {
            pitch:       55,
            zoom:        24,
            edgeScroll:  true,
            keyPan:      true,
            freeRotation: false,
        });

        // ── Minimap (Phase 19) — needs topdownCamera + fogOfWar + entities ──
        this.minimap = new Minimap3D(
            this.renderer3d.webgl, this.scene, this.renderer3d.camera, {
                worldW:       64,
                worldH:       64,
                topdownCamera: this.topdownCamera,
                fogOfWar:      this.fogOfWar,
                entities:      this.entities,
                palette:       this.palette,
            }
        );

        // ── Strategy (Phase 20) ────────────────────────────────────────────
        this.strategy = new TopDown3DStrategy(this);

        // ── Window resize ──────────────────────────────────────────────────
        window.addEventListener('resize', () => this._onResize());
        this._onResize();

        // ── Project-level input map (if project set) ──────────────────────
        if (this.currentProject) {
            await this.input.loadActionMap(`/projects/${this.currentProject}/data/input3d.json`).catch(() => {});
        }

        console.log('[TopDownGame3D] init() complete');
        if (typeof this.onReady === 'function') this.onReady(this);
        return this;
    }

    /**
     * login(username) — set player identity and start the engine loop.
     */
    async login(username) {
        this.username = username;
        console.log(`[TopDownGame3D] login: ${username}`);
        this._startLoop();
    }

    /**
     * loadProject(projectName, levelId) — load a project's level from server.
     */
    async loadProject(projectName, levelId) {
        this.currentProject = projectName;
        await this.fetchLevel(projectName, levelId);
        if (typeof this.onLevelReady === 'function') this.onLevelReady(this._currentLevel);
    }

    /**
     * loadLevelFromData(levelData) — load a level directly from JSON (playtest).
     */
    async loadLevelFromData(levelData) {
        await this.loadLevel3D(levelData);
        if (typeof this.onLevelReady === 'function') this.onLevelReady(this._currentLevel);
    }

    async loadLevel3D(levelData) {
        const normalized = this._normalizeLegacyEditorLevel(levelData);
        return super.loadLevel3D(normalized);
    }

    _normalizeLegacyEditorLevel(levelData) {
        if (!levelData || typeof levelData !== 'object') return levelData;
        const terrain = levelData.terrain;
        if (!terrain || terrain.mode) return levelData;
        if (!terrain.type && !Array.isArray(levelData.trimesh?.positions) && !Array.isArray(terrain.heightMap)) {
            return levelData;
        }

        const normalized = JSON.parse(JSON.stringify(levelData));
        const triW = Number(normalized.trimesh?.width);
        const triH = Number(normalized.trimesh?.height);
        const worldW = Number(
            normalized.worldW
            ?? normalized.bounds?.width
            ?? (Number.isFinite(triW) && triW > 0 ? triW : 64),
        ) || 64;
        const worldH = Number(
            normalized.worldH
            ?? normalized.bounds?.height
            ?? (Number.isFinite(triH) && triH > 0 ? triH : 64),
        ) || 64;

        normalized.bounds = {
            ...(normalized.bounds || {}),
            width: worldW,
            height: worldH,
        };

        const needsOffset = this._legacyLevelNeedsOffset(normalized, worldW, worldH);
        const offsetX = needsOffset ? worldW * 0.5 : 0;
        const offsetZ = needsOffset ? worldH * 0.5 : 0;

        this._shiftLegacyLevelCoordinates(normalized, offsetX, offsetZ);
        this._normalizeLegacyNavmesh(normalized, offsetX, offsetZ);
        this._normalizeLegacyTerrain(normalized, worldW, worldH);
        this._normalizeLegacyAtmosphere(normalized);

        return normalized;
    }

    _legacyLevelNeedsOffset(levelData, worldW, worldH) { // eslint-disable-line no-unused-vars
        const triPos = levelData.trimesh?.positions;
        if (Array.isArray(triPos) && triPos.length >= 3) {
            let minX = Infinity;
            let minZ = Infinity;
            for (let i = 0; i < triPos.length; i += 3) {
                const x = Number(triPos[i] ?? 0);
                const z = Number(triPos[i + 2] ?? 0);
                if (x < minX) minX = x;
                if (z < minZ) minZ = z;
            }
            return minX < 0 || minZ < 0;
        }

        const inspectVec = (vec) => {
            if (!Array.isArray(vec) || vec.length === 0) return false;
            const x = Number(vec[0] ?? 0);
            const z = Number(vec[2] ?? vec[1] ?? 0);
            return x < 0 || z < 0;
        };

        for (const e of levelData.entities || []) {
            if (inspectVec(e?.position)) return true;
        }
        for (const l of levelData.lights || []) {
            if (inspectVec(l?.position)) return true;
        }
        for (const t of levelData.triggers || []) {
            if (inspectVec(t?.position)) return true;
        }
        for (const w of levelData.waypoints || []) {
            if (inspectVec(w?.position)) return true;
        }

        const nmVerts = levelData.navmesh?.vertices;
        if (Array.isArray(nmVerts) && nmVerts.length >= 3) {
            for (let i = 0; i < nmVerts.length; i += 3) {
                const x = Number(nmVerts[i] ?? 0);
                const z = Number(nmVerts[i + 2] ?? 0);
                if (x < 0 || z < 0) return true;
            }
        }

        return false;
    }

    _shiftLegacyLevelCoordinates(levelData, offsetX, offsetZ) {
        if (!offsetX && !offsetZ) return;

        const shiftVec = (vec) => {
            if (!Array.isArray(vec) || vec.length === 0) return;
            vec[0] = Number(vec[0] ?? 0) + offsetX;
            if (vec.length >= 3) {
                vec[2] = Number(vec[2] ?? 0) + offsetZ;
            } else if (vec.length >= 2) {
                vec[1] = Number(vec[1] ?? 0) + offsetZ;
            }
        };

        for (const e of levelData.entities || []) shiftVec(e?.position);
        for (const l of levelData.lights || []) shiftVec(l?.position);
        for (const t of levelData.triggers || []) shiftVec(t?.position);
        for (const w of levelData.waypoints || []) shiftVec(w?.position);
        for (const g of levelData.geometry || []) shiftVec(g?.position);

        const navVerts = levelData.navmesh?.vertices;
        if (Array.isArray(navVerts)) {
            for (let i = 0; i < navVerts.length; i += 3) {
                navVerts[i] = Number(navVerts[i] ?? 0) + offsetX;
                navVerts[i + 2] = Number(navVerts[i + 2] ?? 0) + offsetZ;
            }
        }

        const triPos = levelData.trimesh?.positions;
        if (Array.isArray(triPos)) {
            for (let i = 0; i < triPos.length; i += 3) {
                triPos[i] = Number(triPos[i] ?? 0) + offsetX;
                triPos[i + 2] = Number(triPos[i + 2] ?? 0) + offsetZ;
            }
        }
    }

    _normalizeLegacyNavmesh(levelData, offsetX, offsetZ) {
        const navmesh = levelData.navmesh;
        if (!navmesh || typeof navmesh !== 'object') return;

        if (Array.isArray(navmesh.vertices) && Array.isArray(navmesh.indices)) {
            return;
        }

        const tris = Array.isArray(navmesh.triangles) ? navmesh.triangles : null;
        if (!tris || tris.length === 0) return;

        const vertices = [];
        const indices = [];
        const areas = [];

        for (const tri of tris) {
            const verts = tri?.verts;
            if (!Array.isArray(verts) || verts.length !== 3) continue;
            const base = vertices.length / 3;
            for (const v of verts) {
                vertices.push(
                    Number(v?.[0] ?? 0) + offsetX,
                    Number(v?.[1] ?? 0),
                    Number(v?.[2] ?? 0) + offsetZ,
                );
            }
            indices.push(base, base + 1, base + 2);
            areas.push(0);
        }

        if (indices.length > 0) {
            levelData.navmesh = { vertices, indices, areas };
        }
    }

    _normalizeLegacyTerrain(levelData, worldW, worldH) {
        const td = levelData.terrain || {};
        const cellSize = Math.max(0.25, Number(td.cellSize ?? 1) || 1);

        if (Array.isArray(levelData.trimesh?.positions) && levelData.trimesh.positions.length >= 9) {
            levelData.terrain = {
                ...td,
                mode: 'trimesh',
                cellSize,
            };
            return;
        }

        const gridW = Math.max(2, Math.floor(worldW / cellSize) + 1);
        const gridD = Math.max(2, Math.floor(worldH / cellSize) + 1);
        const elevation = this._buildLegacyElevation(
            td.heightMap, gridW, gridD, worldW, worldH,
        );

        const normalizedTerrain = {
            ...td,
            mode: 'lowpoly',
            cellSize,
            gridW,
            gridD,
            elevation,
            faceColors: Array.isArray(td.faceColors) ? td.faceColors : [],
        };
        if (Number.isFinite(td.waterLevel)) {
            normalizedTerrain.waterLevel = td.waterLevel;
        }
        levelData.terrain = normalizedTerrain;
    }

    _normalizeLegacyAtmosphere(levelData) {
        if (!levelData || typeof levelData !== 'object') return;
        if (!levelData.skybox || typeof levelData.skybox !== 'object') {
            const skyColor = levelData.skyColor;
            if (typeof skyColor === 'string' && skyColor.trim()) {
                levelData.skybox = { type: 'solid', colorHex: skyColor };
            }
        }
    }

    _resolveLevelCenter(level) {
        const safeHalf = (value, fallback) => {
            const n = Number(value);
            return Number.isFinite(n) ? (n * 0.5) : fallback;
        };

        const terrain = level?.terrain;
        if (terrain?.mode === 'lowpoly') {
            const gridW = Number(terrain.gridW);
            const gridD = Number(terrain.gridD);
            const cellSize = Math.max(0.25, Number(terrain.cellSize ?? 1) || 1);
            if (Number.isFinite(gridW) && Number.isFinite(gridD) && gridW > 1 && gridD > 1) {
                return {
                    x: ((gridW - 1) * cellSize) * 0.5,
                    z: ((gridD - 1) * cellSize) * 0.5,
                };
            }
        }

        if (terrain?.mode === 'trimesh') {
            const triPos = level?.trimesh?.positions;
            if (Array.isArray(triPos) && triPos.length >= 3) {
                let minX = Infinity;
                let maxX = -Infinity;
                let minZ = Infinity;
                let maxZ = -Infinity;
                for (let i = 0; i < triPos.length; i += 3) {
                    const x = Number(triPos[i] ?? 0);
                    const z = Number(triPos[i + 2] ?? 0);
                    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (z < minZ) minZ = z;
                    if (z > maxZ) maxZ = z;
                }
                if (Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minZ) && Number.isFinite(maxZ)) {
                    return { x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5 };
                }
            }
        }

        const entities = Array.isArray(level?.entities) ? level.entities : [];
        if (entities.length > 0) {
            let sx = 0;
            let sz = 0;
            let count = 0;
            for (const entity of entities) {
                const pos = entity?.position;
                if (!Array.isArray(pos) || pos.length === 0) continue;
                const x = Number(pos[0] ?? 0);
                const z = Number(pos[2] ?? pos[1] ?? 0);
                if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
                sx += x;
                sz += z;
                count++;
            }
            if (count > 0) {
                return { x: sx / count, z: sz / count };
            }
        }

        return { x: safeHalf(level?.bounds?.width ?? 64, 32), z: safeHalf(level?.bounds?.height ?? 64, 32) };
    }

    _buildLegacyElevation(heightMap, gridW, gridD, worldW, worldH) {
        const total = gridW * gridD;
        const elevation = new Array(total).fill(0);
        if (!Array.isArray(heightMap) || heightMap.length === 0) return elevation;

        if (heightMap.length >= total) {
            for (let i = 0; i < total; i++) {
                elevation[i] = Number(heightMap[i] ?? 0) || 0;
            }
            return elevation;
        }

        if (heightMap.length === worldW * worldH) {
            for (let gz = 0; gz < gridD; gz++) {
                const sz = Math.min(worldH - 1, Math.round((gz / Math.max(1, gridD - 1)) * (worldH - 1)));
                for (let gx = 0; gx < gridW; gx++) {
                    const sx = Math.min(worldW - 1, Math.round((gx / Math.max(1, gridW - 1)) * (worldW - 1)));
                    elevation[gz * gridW + gx] = Number(heightMap[sz * worldW + sx] ?? 0) || 0;
                }
            }
        }

        return elevation;
    }

    // ── Engine3DAdapter hooks ─────────────────────────────────────────────────

    /**
     * Called by Engine3DAdapter after the scene is populated.
     * Wire up phase-specific systems as they become available.
     */
    async onLevelLoaded(level) {
        console.log(`[TopDownGame3D] onLevelLoaded: "${level.name}"`);
        this._levelId       = level.id ?? level.name ?? null;
        this._levelComplete = false;
        this._playerTeam    = Number(level?.playerTeam ?? 0) || 0;

        // Sync physics world with the level config
        if (this.physics && level.physics?.gravity) {
            this.physics.setGravity(...level.physics.gravity);
        }

        // Apply skybox from level config
        if (this.skybox) {
            if (level.skybox) {
                this.skybox.applyConfig(level.skybox);
            } else if (level.fog) {
                this.skybox.setSolid(level.fog.color);
            }
        }

        // Register static geometry with raycaster terrain layer
        if (this.raycast && this.physics) {
            this.raycast.syncFromPhysicsWorld(this.physics, {
                static:   LayerMask.TERRAIN,
                dynamic:  LayerMask.ENTITY,
                kinematic: LayerMask.PROP,
            });
        }

        // Phase-13+ systems: hydrate if already loaded
        if (this.terrain)      this.terrain.onLevelLoaded(level);
        if (this.pathfinding) {
            const navmesh = level?.navmesh;
            const hasNavmesh = Array.isArray(navmesh?.vertices) && navmesh.vertices.length >= 9
                && Array.isArray(navmesh?.indices) && navmesh.indices.length >= 3;
            if (hasNavmesh) {
                this.pathfinding.buildFromLevel(level);
            } else if (this.terrain) {
                const worldW = Number(level?.bounds?.width ?? 64) || 64;
                const worldH = Number(level?.bounds?.height ?? 64) || 64;
                const cellSize = Math.max(0.5, Number(level?.terrain?.cellSize ?? 2) || 2);
                const gridW = Math.max(8, Math.floor(worldW / cellSize));
                const gridH = Math.max(8, Math.floor(worldH / cellSize));
                this.pathfinding.buildFromTerrain(this.terrain, gridW, gridH, cellSize);
            } else {
                this.pathfinding.buildFlatFallback();
            }
        }
        if (this.entities) {
            await this.entities.onLevelLoaded(level);
            this._initialHostileCount = this._countLivingHostiles();
        }
        if (this.fogOfWar) {
            this.fogOfWar.onLevelLoaded(level);
            if (this.entities) {
                for (const e of this.entities.getAllEntities()) {
                    const vision = e.stats?.visionRadius ?? e.stats?.vision ?? 8;
                    this.fogOfWar.registerUnit(e.id, e.team ?? 0, vision);
                }
            }
        }
        if (this.minimap)      this.minimap.onLevelLoaded(level);
        if (this.topdownCamera) {
            const center = this._resolveLevelCenter(level);
            if (Number.isFinite(center?.x) && Number.isFinite(center?.z)) {
                this.topdownCamera.panToWorld(center.x, center.z);
                this.topdownCamera.snapToTarget?.();
            }
        }
    }

    onLevelUnloaded() {
        console.log('[TopDownGame3D] onLevelUnloaded');
        this.selectedUnits = [];
        this.gameTime      = 0;
        this._accumulator  = 0;
        this._levelComplete = false;
        this._initialHostileCount = 0;

        if (this.terrain)  this.terrain.dispose();
        if (this.entities) this.entities.dispose();
        if (this.fogOfWar) this.fogOfWar.dispose();
        if (this.vfx)      this.vfx.dispose();
        if (this.minimap)  this.minimap.dispose();
    }

    // ── Game loop ─────────────────────────────────────────────────────────────

    _startLoop() {
        if (this.isRunning) return;
        this.isRunning  = true;
        this._lastTS    = performance.now();
        requestAnimationFrame(ts => this._loop(ts));
        console.log('[TopDownGame3D] Game loop started');
    }

    _stopLoop() {
        this.isRunning = false;
    }

    _loop(timestamp) {
        if (!this.isRunning) return;
        requestAnimationFrame(ts => this._loop(ts));

        const rawDt = Math.min((timestamp - this._lastTS) / 1000, MAX_DELTA);
        this._lastTS  = timestamp;

        if (this.isPaused) return;

        this.gameTime += rawDt;
        this._update(rawDt);
        this._render();
    }

    _update(dt) {
        // 1. Input
        this.input?.update(dt);

        // 2. Physics (fixed-step accumulation)
        this._accumulator += dt;
        while (this._accumulator >= FIXED_STEP) {
            this.physics?.step(FIXED_STEP);
            this._accumulator -= FIXED_STEP;
        }

        // 3. Terrain animations (water sine-wave etc.)
        this.terrain?.update(dt, this.gameTime);

        // 4. Entity / NPC tick (AI + movement)
        this.entities?.update(dt);

        // 5. Pathfinding ORCA tick (feed live entity positions/velocities)
        if (this.pathfinding && this.entities) {
            const agents = this.entities.getAllEntities().map(e => ({
                id:       e.id,
                position: { x: e.root.position.x, y: e.root.position.y, z: e.root.position.z },
                velocity: e.orcaVelocity ?? { x: 0, z: 0 },
            }));
            this.pathfinding.updateAgents(dt, agents);
        }

        // 6. Abilities + combat
        this.abilities?.update(dt);

        // 7. Fog of war raster — build unit-position map for vision update
        if (this.fogOfWar && this.entities) {
            const unitPos = new Map();
            for (const e of this.entities.getAllEntities()) {
                unitPos.set(e.id, e.root.position);
            }
            this.fogOfWar.update(dt, unitPos);
        }

        // 8. VFX particles
        this.vfx?.update(dt);

        // 9. Camera (follows selected unit centroid for topdown mode)
        const focusPoint = this._getSelectionCentroid();
        this.topdownCamera?.update(dt, focusPoint);
        this.camera3d?.update(dt);
        this.skybox?.update(this.renderer3d.camera);

        // 10. Spatial audio listener follows camera
        if (this.audio && this.renderer3d?.camera) {
            const cam = this.renderer3d.camera;
            this.audio.updateListenerPosition(
                cam.position.x, cam.position.y, cam.position.z,
                cam.getWorldDirection ? cam.getWorldDirection(new this.THREE.Vector3()) : null,
            );
        }

        // 11. Minimap
        this.minimap?.update(dt);

        // 12. Completion check
        this._checkCompletionState();
    }

    _render() {
        if (!this.renderer3d) return;
        this.renderer3d.render();
    }

    // ── Selection helpers ─────────────────────────────────────────────────────

    /**
     * Compute the world-space centroid of all selected units.
     * Returns null if nothing is selected.
     * @returns {THREE.Vector3|null}
     */
    _getSelectionCentroid() {
        if (!this.selectedUnits.length || !this.entities) return null;
        const THREE = this.THREE;
        const sum = new THREE.Vector3();
        let count = 0;
        for (const id of this.selectedUnits) {
            const pos = this.entities.getPosition(id);
            if (pos) { sum.add(pos); count++; }
        }
        return count ? sum.divideScalar(count) : null;
    }

    /**
     * selectUnit(id) — add a unit to the selection set.
     */
    selectUnit(id) {
        if (!this.selectedUnits.includes(id)) {
            this.selectedUnits.push(id);
            this.entities?.setSelected(this.selectedUnits);
        }
    }

    /**
     * deselectAll() — clear selection.
     */
    deselectAll() {
        this.selectedUnits = [];
        this.entities?.setSelected([]);
    }

    // ── Event emitter (Phase 20) ───────────────────────────────────────────────
    on(event, cb) {
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event).push(cb);
    }

    off(event, cb) {
        const arr = this._listeners.get(event);
        if (!arr) return;
        const i = arr.indexOf(cb);
        if (i !== -1) arr.splice(i, 1);
    }

    emit(event, data) {
        for (const cb of (this._listeners.get(event) ?? [])) {
            try { cb(data); } catch (e) { console.warn(`[TopDownGame3D] emit(${event}) error:`, e); }
        }
    }

    /**
     * completeLevel() — single source of truth for topdown-3d completion.
     * Emits a one-shot levelComplete event consumed by the campaign adapter.
     */
    completeLevel(data = {}) {
        if (this._levelComplete) return false;
        this._levelComplete = true;
        this.emit('levelComplete', {
            levelId: this._levelId,
            playerState: this.strategy?.getPlayerData?.() ?? null,
            ...data,
        });
        return true;
    }

    _countLivingHostiles() {
        if (!this.entities) return 0;
        return this.entities.getAllEntities().filter(entity =>
            entity.team !== this._playerTeam && entity.ai?.state !== AIState.DEAD
        ).length;
    }

    _checkCompletionState() {
        if (this._levelComplete || this._initialHostileCount <= 0) return;
        if (this._countLivingHostiles() > 0) return;
        this.completeLevel({
            reason: 'all-hostiles-defeated',
            initialHostiles: this._initialHostileCount,
        });
    }

    // ── Strategy helpers (Phase 20) ────────────────────────────────────────────
    /** Screen pixel → world map position via terrain raycast. */
    screenToMap(screenX, screenY) {
        return this.strategy?.screenToMap(screenX, screenY)
            ?? { wx: 0, wz: 0, wy: 0, hit: false };
    }

    /** Issue a move order for selected units to a screen position. */
    commandTo(screenX, screenY) {
        this.strategy?.commandUnitsTo(this.selectedUnits, screenX, screenY);
    }

    /** Rubber-band select units inside a screen-space rectangle. */
    selectRect(x0, y0, x1, y1, team = 0) {
        const ids = this.strategy?.selectUnitsInRect(x0, y0, x1, y1, team) ?? [];
        this.selectedUnits = ids;
        this.entities?.setSelected(ids);
        return ids;
    }

    // ── Save / Load ───────────────────────────────────────────────────────────

    async saveGame(slot = this.saveSlot) {
        if (!this.username) { console.warn('[TopDownGame3D] saveGame: no username'); return; }
        const payload = this._buildSavePayload();
        const res = await fetch(`/api/save/${this.username}/${slot}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`saveGame HTTP ${res.status}`);
        console.log(`[TopDownGame3D] Game saved: slot ${slot}`);
    }

    async loadGame(slot = this.saveSlot) {
        if (!this.username) { console.warn('[TopDownGame3D] loadGame: no username'); return; }
        const res = await fetch(`/api/save/${this.username}/${slot}`);
        if (!res.ok) throw new Error(`loadGame HTTP ${res.status}`);
        const data = await res.json();
        await this._applySavePayload(data);
        console.log(`[TopDownGame3D] Game loaded: slot ${slot}`);
    }

    _buildSavePayload() {
        // Snapshot the hero-unit mesh for positional state if available
        const heroMesh = this.entities?.getHero?.()?.mesh ?? null;
        return serializeSavePayload3D('topdown-3d', {
            version:        this.version,
            project:        this.currentProject,
            levelId:        this._levelId,
            gameTime:       this.gameTime,
            selectedUnits:  [...this.selectedUnits],
            player:         serialize3DPlayerState(heroMesh, {
                hp:    this.player?.hp    ?? 100,
                maxHp: this.player?.maxHp ?? 100,
            }),
            // topdown-3d has no platformer checkpoints; checkpoint = last level/portal
            lastCheckpoint: this._levelId ? { id: this._levelId, levelId: this._levelId } : null,
            // Collected interactables this session (populated by EntitySystem3D)
            collectedItems: this.entities?.getCollectedIds?.() ?? [],
            levelState: {
                fog:          this.fogOfWar?.serialize()    || null,
                entityStates: this.entities?.serialize()   || null,
                abilityStates:this.abilities?.serialize()  || null,
                cameraState:  this.topdownCamera?.serialize() || null,
            },
        });
    }

    async _applySavePayload(raw) {
        const data = deserializeSavePayload3D(raw, 'topdown-3d');
        if (!data) return; // schema mismatch or 2D save — silently skip

        if (data.project && data.levelId) {
            await this.loadProject(data.project, data.levelId);
        }
        if (data.gameTime !== undefined) this.gameTime = data.gameTime;

        const ls = data.levelState ?? {};
        if (ls.fog)          this.fogOfWar?.deserialize(ls.fog);
        if (ls.entityStates) this.entities?.deserialize(ls.entityStates);
        if (ls.abilityStates)this.abilities?.deserialize(ls.abilityStates);
        if (ls.cameraState)  this.topdownCamera?.deserialize(ls.cameraState);

        // Restore player vitals from 3D player state
        const ps = deserialize3DPlayerState(data.player);
        if (ps && this.player) {
            if (ps.hp    !== undefined) this.player.hp    = ps.hp;
            if (ps.maxHp !== undefined) this.player.maxHp = ps.maxHp;
        }
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    pause()  { this.isPaused = true;  console.log('[TopDownGame3D] Paused'); }
    resume() { this.isPaused = false; console.log('[TopDownGame3D] Resumed'); }
    toggle() { this.isPaused ? this.resume() : this.pause(); }

    _onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.renderer3d?.resize(w, h);
        this.camera3d?.onResize(w, h);
        this.topdownCamera?.onResize(w, h);
        this.minimap?.onResize(w, h);
    }

    get engineType3D() { return this._engineType3D; }

    dispose() {
        this._stopLoop();
        this.onLevelUnloaded();
        this.input?.detach();
        this.audio?.dispose();
        this.renderer3d?.dispose();
        this.raycast?.dispose();
        console.log('[TopDownGame3D] Disposed');
    }
}

// ── Expose globally ───────────────────────────────────────────────────────────
window.TopDownGame3D = TopDownGame3D;

export default TopDownGame3D;
