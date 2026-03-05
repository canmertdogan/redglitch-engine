/**
 * main.js — FPS-3D Engine entry point
 *
 * Extends Engine3DAdapter with the full FPS game loop:
 *   Input → Player Controller → Physics → AI → Audio → Render
 *
 * Visual style: LOW-POLY + VOXEL, flat palette colors, cel-shading only.
 * No PBR, no HDR, no texture atlases — pure MeshLambertMaterial.
 *
 * Systems wired here (stubs ready for later phases):
 *   - Renderer3D        (Phase 3)   — WebGL + EffectComposer pipeline
 *   - Camera3DController(Phase 4)   — FPS mode, perspective 75°
 *   - Physics3DWorld    (Phase 5)   — cannon-es fixed-step
 *   - PaletteManager    (Phase 6)   — 256-color palette
 *   - AssetLoader3D     (Phase 6)   — GLTF + .vox LRU cache
 *   - Input3D           (Phase 7)   — action-mapped input
 *   - AudioSpatial3D    (Phase 8)   — HRTF + reverb
 *   - Raycast3D         (Phase 9)   — layer-masked picking
 *   - FPSCamera         (Phase 27)  — null until loaded
 *   - FPSController     (Phase 28)  — null until loaded
 *   - WorldGeometry     (Phase 29)  — null until loaded
 *   - WeaponSystem      (Phase 30)  — null until loaded
 *   - EnemyAI           (Phase 31)  — null until loaded
 *
 * Entry point: window.FPSGame
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
import FPS3DStrategy            from './FPS3DStrategy.js';
import FPSCamera                from './FPSCamera.js';
import FPSController, { MoveState } from './FPSController.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const FPS3D_VERSION  = '0.1.0';
const DEFAULT_SAVE_SLOT = 0;
const FIXED_STEP     = 1 / 60;   // physics tick rate
const MAX_DELTA      = 0.1;      // delta cap (100 ms) — prevents spiral of death

// ── FPSGame ───────────────────────────────────────────────────────────────────

class FPSGame extends Engine3DAdapter {

    constructor(container, options = {}) {
        super(container, options);

        // ── Identity ───────────────────────────────────────────────────────
        this._engineType3D  = 'fps-3d';
        this.version        = FPS3D_VERSION;

        // ── Player state ───────────────────────────────────────────────────
        this.username       = null;
        this.saveSlot       = DEFAULT_SAVE_SLOT;
        this.currentProject = null;
        this.isRunning      = false;
        this.isPaused       = false;

        // Player vitals (populated by save/load + weapon/damage systems)
        this._health        = 100;
        this._ammo          = { current: 30, reserve: 90 };

        // ── Shared systems (Phase 3–9, instantiated in init()) ─────────────
        this.renderer3d     = null;   // Renderer3D
        this.camera3d       = null;   // Camera3DController (FPS mode)
        this.physics        = null;   // Physics3DWorld
        this.palette        = null;   // PaletteManager
        this.assets         = null;   // AssetLoader3D
        this.input          = null;   // Input3D
        this.audio          = null;   // AudioSpatial3D
        this.raycast        = null;   // Raycast3D

        // ── FPS-specific systems (populated in later phases) ───────────────
        this.fpsCamera      = null;   // FPSCamera       (Phase 27)
        this.fpsController  = null;   // FPSController   (Phase 28)
        this.worldGeometry  = null;   // WorldGeometry   (Phase 29)
        this.weaponSystem   = null;   // WeaponSystem    (Phase 30)
        this.enemyAI        = null;   // EnemyAI         (Phase 31)
        this.strategy       = null;   // FPS3DStrategy   (Phase 26)

        // ── Game state ─────────────────────────────────────────────────────
        this.gameTime       = 0;      // seconds since level start
        this._accumulator   = 0;      // physics sub-step accumulator
        this._lastTS        = 0;      // last requestAnimationFrame timestamp
        this._levelId       = null;   // current loaded level id
        this._currentLevel  = null;   // raw level JSON

        // ── Event callbacks (set by launcher / index.html) ─────────────────
        this.onReady        = null;
        this.onLevelReady   = null;
        this.onGameOver     = null;

        // ── Event emitter ──────────────────────────────────────────────────
        this._listeners     = new Map([
            ['playerDied',    []],
            ['levelComplete', []],
            ['enemyKilled',   []],
            ['weaponFired',   []],
        ]);
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * init() — create all shared systems and attach renderer canvas.
     * Call once before loadProject() or login().
     */
    async init() {
        console.log(`[FPSGame v${FPS3D_VERSION}] init()`);

        const container = this._container || document.getElementById('game-container');
        if (!container) throw new Error('[FPSGame] no container element');

        // ── Renderer ───────────────────────────────────────────────────────
        this.renderer3d = new Renderer3D(container, {
            antialias:   false,
            shadows:     true,
            shadowType:  1,       // PCFSoftShadowMap
            pixelRatio:  Math.min(window.devicePixelRatio, 2),
        });
        await this.renderer3d.init();

        this.THREE = this.renderer3d.THREE;
        this.scene  = this.renderer3d.scene;

        // ── Camera (FPS perspective, 75° FOV) ──────────────────────────────
        this.camera3d = new Camera3DController(this.renderer3d.camera, container, {
            mode: CameraMode.FPS,
            fov:  75,
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

        // ── Strategy (Phase 26) ────────────────────────────────────────────
        this.strategy = new FPS3DStrategy(this);
        this.strategy.initialize();

        // ── FPS Camera (Phase 27) ──────────────────────────────────────────
        this.fpsCamera = new FPSCamera(this.camera3d, container, {
            sensitivity: 0.0015,
            bobEnabled:  true,
            leanEnabled: true,
            fovBase:     75,
            fovSprint:   10,
        });
        this.fpsCamera.attach();
        // Sync pointer lock callbacks to game pause system
        this.fpsCamera.onUnlocked = () => {
            if (this.isRunning && !this.isPaused) {
                // Pointer lock lost without ESC — treat as implicit pause
                this.pause();
            }
        };

        // ── FPS Controller (Phase 28) ──────────────────────────────────────
        this.fpsController = new FPSController({
            physics:   this.physics,
            fpsCamera: this.fpsCamera,
            input:     this.input,
            audio:     this.audio,
        }, {
            bunnyHop:    true,
            proneEnabled: false,
        });
        // Provide game-time accessor for bhop window
        this.fpsController._gameTimeRef = () => this.gameTime;
        await this.fpsController.init();

        // ── Window resize ──────────────────────────────────────────────────
        window.addEventListener('resize', () => this._onResize());
        this._onResize();

        // ── Project input map ──────────────────────────────────────────────
        if (this.currentProject) {
            await this.input.loadActionMap(
                `/projects/${this.currentProject}/data/input3d.json`
            ).catch(() => {});
        }

        console.log('[FPSGame] init() complete');
        if (typeof this.onReady === 'function') this.onReady(this);
        return this;
    }

    /** login(username) — set player identity and start the engine loop. */
    async login(username) {
        this.username = username;
        console.log(`[FPSGame] login: ${username}`);
        this._startLoop();
    }

    /** loadProject(projectName, levelId) — load a project level from server. */
    async loadProject(projectName, levelId) {
        this.currentProject = projectName;
        await this.fetchLevel(projectName, levelId);
        if (typeof this.onLevelReady === 'function') this.onLevelReady(this._currentLevel);
    }

    /** loadLevelFromData(levelData) — load directly from JSON (playtest mode). */
    async loadLevelFromData(levelData) {
        await this.loadLevel3D(levelData);
        if (typeof this.onLevelReady === 'function') this.onLevelReady(this._currentLevel);
    }

    // ── Engine3DAdapter hooks ─────────────────────────────────────────────────

    onLevelLoaded(level) {
        console.log(`[FPSGame] onLevelLoaded: "${level.name}"`);
        this._levelId      = level.id ?? level.name ?? null;
        this._currentLevel = level;

        // Sync physics gravity from level config
        if (this.physics && level.physics?.gravity) {
            this.physics.setGravity(...level.physics.gravity);
        }

        // Sync raycaster layers
        if (this.raycast && this.physics) {
            this.raycast.syncFromPhysicsWorld(this.physics, {
                static:    LayerMask.TERRAIN,
                dynamic:   LayerMask.ENTITY,
                kinematic: LayerMask.PROP,
            });
        }

        // Strategy: set player spawn point from level data
        this.strategy?.loadLevel(level);

        // Phase 28: re-position controller at level spawn
        if (this.fpsController) {
            const spawn = level?.playerSpawn ?? { x: 0, y: 1.8, z: 0 };
            await this.fpsController.init(spawn);
        }

        // Phase 29+: WorldGeometry — null until loaded
        // this.worldGeometry?.onLevelLoaded(level);
    }

    onLevelUnloaded() {
        console.log('[FPSGame] onLevelUnloaded');
        this.gameTime     = 0;
        this._accumulator = 0;
        this._currentLevel = null;

        // Phase 29+
        // this.worldGeometry?.dispose();
        // this.weaponSystem?.dispose();
        // this.enemyAI?.dispose();
    }

    // ── Game loop ─────────────────────────────────────────────────────────────

    _startLoop() {
        if (this.isRunning) return;
        this.isRunning = true;
        this._lastTS   = performance.now();
        requestAnimationFrame(ts => this._loop(ts));
        console.log('[FPSGame] Game loop started');
    }

    _stopLoop() {
        this.isRunning = false;
    }

    _loop(timestamp) {
        if (!this.isRunning) return;
        requestAnimationFrame(ts => this._loop(ts));

        const rawDt   = Math.min((timestamp - this._lastTS) / 1000, MAX_DELTA);
        this._lastTS  = timestamp;

        if (this.isPaused) return;

        this.gameTime += rawDt;
        this._update(rawDt);
        this._render();
    }

    _update(dt) {
        // 1. Input (Phase 7)
        this.input?.update(dt);

        // 2. Player controller (Phase 28) — FPSController drives capsule body
        this.fpsController?.update(dt);

        // 3. Physics fixed-step accumulation (Phase 5)
        this._accumulator += dt;
        while (this._accumulator >= FIXED_STEP) {
            this.physics?.step(FIXED_STEP);
            this._accumulator -= FIXED_STEP;
        }

        // 4. AI tick (Phase 31)
        this.enemyAI?.update(dt);

        // 5. Weapon system (Phase 30)
        this.weaponSystem?.update(dt);

        // 6. FPS camera (Phase 27) — bob, recoil, lean
        if (this.fpsCamera && this.input) {
            // Q = lean left, E = lean right (if Input3D exposes isActionHeld)
            const leanLeft  = this.input.isActionHeld?.('lean_left')  ?? this.input.isKeyHeld?.('KeyQ') ?? false;
            const leanRight = this.input.isActionHeld?.('lean_right') ?? this.input.isKeyHeld?.('KeyE') ?? false;
            const leanDir   = leanRight ? 1 : leanLeft ? -1 : 0;
            this.fpsCamera.setLean(leanDir);
        }
        this.fpsCamera?.update(dt);

        // 7. Spatial audio listener follows camera (Phase 8)
        if (this.audio && this.renderer3d?.camera) {
            const cam = this.renderer3d.camera;
            this.audio.updateListenerPosition(
                cam.position.x, cam.position.y, cam.position.z,
                cam.getWorldDirection
                    ? cam.getWorldDirection(new this.THREE.Vector3())
                    : null,
            );
        }
    }

    _render() {
        if (!this.renderer3d) return;
        this.renderer3d.render(this.scene, this.renderer3d.camera);
    }

    // ── Pointer lock helpers (Phase 27 will extend) ───────────────────────────

    /**
     * requestPointerLock() — called on first click-to-start.
     * Delegates to FPSCamera which manages pointer lock state.
     */
    requestPointerLock() {
        this.fpsCamera
            ? this.fpsCamera.requestPointerLock()
            : document.body.requestPointerLock?.();
    }

    /** releasePointerLock() — called on ESC / pause. */
    releasePointerLock() {
        this.fpsCamera
            ? this.fpsCamera.releasePointerLock()
            : document.exitPointerLock?.();
    }

    // ── Event emitter ─────────────────────────────────────────────────────────

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
            try { cb(data); } catch (e) { console.warn(`[FPSGame] emit(${event}) error:`, e); }
        }
    }

    // ── Save / Load ───────────────────────────────────────────────────────────

    async saveGame(slot = this.saveSlot) {
        if (!this.username) { console.warn('[FPSGame] saveGame: no username'); return; }
        const payload = this._buildSavePayload();
        const res = await fetch(`/api/save/${this.username}/${slot}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`saveGame HTTP ${res.status}`);
        console.log(`[FPSGame] Game saved: slot ${slot}`);
    }

    async loadGame(slot = this.saveSlot) {
        if (!this.username) { console.warn('[FPSGame] loadGame: no username'); return; }
        const res = await fetch(`/api/save/${this.username}/${slot}`);
        if (!res.ok) throw new Error(`loadGame HTTP ${res.status}`);
        const data = await res.json();
        await this._applySavePayload(data);
        console.log(`[FPSGame] Game loaded: slot ${slot}`);
    }

    _buildSavePayload() {
        return {
            version:         this.version,
            engineType:      'fps-3d',
            project:         this.currentProject,
            levelId:         this._levelId,
            gameTime:        this.gameTime,
            health:          this._health,
            ammo:            this._ammo,
            playerPos:       this.strategy?.getPlayerPosition() ?? null,
            cameraState:     this.fpsCamera?.serialize()      ?? null,
            controllerState: this.fpsController?.serialize()  ?? null,
            timestamp:       Date.now(),
        };
    }

    async _applySavePayload(data) {
        if (data.project && data.levelId) {
            await this.loadProject(data.project, data.levelId);
        }
        if (data.gameTime !== undefined) this.gameTime = data.gameTime;
        if (data.health   !== undefined) this._health  = data.health;
        if (data.ammo     !== undefined) this._ammo    = data.ammo;
        if (data.playerPos)       this.strategy?.setSpawnPoint(data.playerPos);
        if (data.cameraState)     this.fpsCamera?.deserialize(data.cameraState);
        if (data.controllerState) this.fpsController?.deserialize(data.controllerState);
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    pause()  { this.isPaused = true;  this.releasePointerLock(); console.log('[FPSGame] Paused'); }
    resume() { this.isPaused = false; console.log('[FPSGame] Resumed'); }
    toggle() { this.isPaused ? this.resume() : this.pause(); }

    _onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.renderer3d?.resize(w, h);
        this.camera3d?.onResize(w, h);
        this.fpsCamera?.onResize?.(w, h);
    }

    get engineType3D() { return this._engineType3D; }

    dispose() {
        this._stopLoop();
        this.onLevelUnloaded();
        this.releasePointerLock();
        this.fpsCamera?.detach();
        this.fpsController?.dispose();
        this.input?.detach();
        this.audio?.dispose();
        this.renderer3d?.dispose();
        this.raycast?.dispose();
        console.log('[FPSGame] Disposed');
    }
}

// ── Expose globally ───────────────────────────────────────────────────────────
window.FPSGame = FPSGame;

export default FPSGame;
