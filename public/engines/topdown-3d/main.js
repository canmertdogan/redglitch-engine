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

        const container = this._container || document.getElementById('game-container');
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

        // ── Palette ────────────────────────────────────────────────────────
        this.palette = new PaletteManager();

        // ── Assets ─────────────────────────────────────────────────────────
        this.assets = new AssetLoader3D({
            palette: this.palette,
            THREE:   this.THREE,
        });

        // ── Input ──────────────────────────────────────────────────────────
        this.input = new Input3D(container);
        this.input.attach();

        // ── Audio ──────────────────────────────────────────────────────────
        this.audio = new AudioSpatial3D();
        this.audio.init();

        // ── Raycaster ──────────────────────────────────────────────────────
        this.raycast = new Raycast3D(this.scene);
        this.raycast.setCamera(this.renderer3d.camera);

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

    // ── Engine3DAdapter hooks ─────────────────────────────────────────────────

    /**
     * Called by Engine3DAdapter after the scene is populated.
     * Wire up phase-specific systems as they become available.
     */
    onLevelLoaded(level) {
        console.log(`[TopDownGame3D] onLevelLoaded: "${level.name}"`);
        this._levelId       = level.id ?? level.name ?? null;
        this._levelComplete = false;

        // Sync physics world with the level config
        if (this.physics && level.physics?.gravity) {
            this.physics.setGravity(...level.physics.gravity);
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
        if (this.pathfinding)  this.pathfinding.buildFromLevel(level);
        if (this.entities)     this.entities.onLevelLoaded(level);
        if (this.fogOfWar)     this.fogOfWar.onLevelLoaded(level);
        if (this.minimap)      this.minimap.onLevelLoaded(level);
    }

    onLevelUnloaded() {
        console.log('[TopDownGame3D] onLevelUnloaded');
        this.selectedUnits = [];
        this.gameTime      = 0;
        this._accumulator  = 0;

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
    }

    _render() {
        if (!this.renderer3d) return;
        this.renderer3d.render(this.scene, this.renderer3d.camera);
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
