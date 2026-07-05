/**
 * Game3DCore.js — Centralised 3D game runtime for RedGlitch / Ketebe Engine.
 *
 * Extracts ALL duplicated init / loop / save / event code that was previously
 * copy-pasted across FPSGame, TopDownGame3D, and Platformer3DGame into one
 * authoritative implementation.
 *
 * A Game3DCore owns:
 *   • Renderer3D          (WebGL + post-processing pipeline)
 *   • Camera3DController  (mode set by the active ModeInterface)
 *   • Physics3DWorld      (cannon-es fixed-step)
 *   • PaletteManager      (256-color palette)
 *   • AssetLoader3D       (GLTF + .vox LRU cache)
 *   • Input3D             (action-mapped input)
 *   • AudioSpatial3D      (HRTF + reverb)
 *   • Raycast3D           (layer-masked picking)
 *   • SkyboxSystem        (gradient / solid sky)
 *
 * It delegates mode-specific behaviour to a `ModeInterface` subclass loaded
 * at init time via `setMode()`.
 *
 * Visual style enforced: LOW-POLY + VOXEL, NO PBR, NO HDR, palette-indexed
 * flat colors only.
 */

import * as THREE              from '/lib/three/three.module.js';
import Engine3DAdapter         from '../shared/Engine3DAdapter.js?v=cachebust2';
import Renderer3D              from '../shared/Renderer3D.js';
import Camera3DController,
       { CameraMode }          from '../shared/Camera3DController.js';
import Physics3DWorld          from '../shared/Physics3DWorld.js';
import PaletteManager          from '../shared/PaletteManager.js';
import AssetLoader3D           from '../shared/AssetLoader3D.js';
import Input3D                 from '../shared/Input3D.js?v=cachebust6';
import AudioSpatial3D          from '../shared/AudioSpatial3D.js';
import Raycast3D,
       { LayerMask }           from '../shared/Raycast3D.js';
import SkyboxSystem, {
    createDefaultSkyboxConfig,
    normalizeSkyboxConfig,
} from '../shared/SkyboxSystem.js';
import WeatherSystem3D        from '../shared/WeatherSystem3D.js';
import {
    serializeSavePayload3D,
    deserializeSavePayload3D,
    serialize3DPlayerState,
    deserialize3DPlayerState,
} from '../shared/Save3D.js';
import HybridScene3D           from '../shared/HybridScene3D.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const CORE_VERSION   = '1.0.0';
const FIXED_STEP     = 1 / 60;   // physics tick rate (seconds)
const MAX_DELTA      = 0.1;      // cap to avoid spiral of death
const DEFAULT_SAVE_SLOT = 0;

// ── Game3DCore ────────────────────────────────────────────────────────────────

export default class Game3DCore extends Engine3DAdapter {

    /**
     * @param {HTMLElement} container  DOM element to mount the renderer into
     * @param {object}      [options]  Engine-wide options
     */
    constructor(container, options = {}) {
        super(container, options);

        // ── Identity ──────────────────────────────────────────────────────
        /** @type {string} One of 'fps-3d' | 'topdown-3d' | 'platformer-3d' */
        this._engineType3D = options.engineType || 'fps-3d';
        this.version       = CORE_VERSION;

        // ── Player / session state ────────────────────────────────────────
        this.username       = null;
        this.saveSlot       = DEFAULT_SAVE_SLOT;
        this.currentProject = null;
        this.isRunning      = false;
        this.isPaused       = false;

        // ── Options ───────────────────────────────────────────────────────
        this._options = options;

        // ── Shared systems (instantiated in initCore) ─────────────────────
        this.renderer3d = null;
        /** @type {HybridScene3D|null} */
        this.hybridScene = null;
        /** @type {Camera3DController|null} */
        this.camera3d   = null;
        /** @type {Physics3DWorld|null} */
        this.physics    = null;
        /** @type {PaletteManager|null} */
        this.palette    = null;
        /** @type {AssetLoader3D|null} */
        this.assets     = null;
        /** @type {Input3D|null} */
        this.input      = null;
        /** @type {AudioSpatial3D|null} */
        this.audio      = null;
        /** @type {Raycast3D|null} */
        this.raycast    = null;
        /** @type {SkyboxSystem|null} */
        this.skybox     = null;
        /** @type {WeatherSystem3D|null} */
        this.weatherSystem = null;

        // ── Active mode module ────────────────────────────────────────────
        /** @type {import('./ModeInterface.js').default|null} */
        this.mode = null;

        // ── Game state ────────────────────────────────────────────────────
        this.gameTime     = 0;       // seconds since level start
        this._accumulator = 0;       // physics sub-step accumulator
        this._lastTS      = 0;       // last rAF timestamp
        this._levelId     = null;
        this._currentLevel = null;
        this._levelComplete = false;

        // ── Event emitter ─────────────────────────────────────────────────
        this._listeners = new Map();

        // ── Lifecycle callbacks (set by bootstrap / index.html) ───────────
        this.onReady       = null;
        this.onLevelReady  = null;
        this.onGameOver    = null;
    }

    // ── Engine type accessor ──────────────────────────────────────────────────

    get engineType3D() { return this._engineType3D; }

    // ── Mode management ──────────────────────────────────────────────────────

    /**
     * Set the active mode module.  Called once during init before the game
     * loop starts.
     * @param {import('./ModeInterface.js').default} modeModule
     */
    async setMode(modeModule) {
        // Dispose previous mode if swapping mid-game
        if (this.mode) {
            this.mode.dispose();
        }
        this.mode = modeModule;
        this._engineType3D = modeModule.modeId;
        await this.mode.onInit(this);
        this.mode.onGameOver = () => {
            if (this.gameHUD) {
                this.gameHUD.state._showGameOver = true;
                this.gameHUD.showScreen('gameover');
            }
        };
        console.log(`[Game3DCore] Mode set → ${modeModule.modeId}`);
    }

    // ── Core initialisation ──────────────────────────────────────────────────

    /**
     * initCore() — create all shared 3D systems.
     * Call once before setMode() or login().
     * @returns {Promise<Game3DCore>}
     */
    async initCore() {
        console.log(`[Game3DCore v${CORE_VERSION}] initCore()`);

        const container = this.container || document.getElementById('game-container');
        if (!container) throw new Error('[Game3DCore] no container element');
        this.container = container;

        // ── Renderer ──────────────────────────────────────────────────────
        this.renderer3d = new Renderer3D(container, {
            antialias:  false,
            shadows:    true,
            shadowType: 1,       // PCFSoftShadowMap
            pixelRatio: Math.min(window.devicePixelRatio, 2),
        });
        await this.renderer3d.init();

        this.THREE = this.renderer3d.THREE;
        
        // ── Hybrid Scene Manager ──────────────────────────────────────────
        this.hybridScene = new HybridScene3D(this.renderer3d);
        this.scene = this.hybridScene.scene;

        // ── Camera ────────────────────────────────────────────────────────
        this.camera3d = new Camera3DController(this.renderer3d.camera, container, {
            fov: this._options.fov ?? 75,
        });

        // ── Physics ───────────────────────────────────────────────────────
        const gravity = this._options.gravity ?? [0, -9.82, 0];
        this.physics = new Physics3DWorld({ gravity });
        this.physics.init();

        // ── Palette ───────────────────────────────────────────────────────
        this.palette = new PaletteManager();

        // ── Assets ────────────────────────────────────────────────────────
        this.assets = new AssetLoader3D(this.scene, this.palette);

        // ── Input ─────────────────────────────────────────────────────────
        this.input = new Input3D(container);
        this.input.attach();

        // ── Audio ─────────────────────────────────────────────────────────
        this.audio = new AudioSpatial3D();
        this.audio.init();

        // ── Raycaster ─────────────────────────────────────────────────────
        this.raycast = new Raycast3D(this.scene);
        this.raycast.setCamera(this.renderer3d.camera);

        // ── Skybox ────────────────────────────────────────────────────────
        this.skybox = new SkyboxSystem(this.scene, { engineType: this.engineType3D });
        this.skybox.applyConfig(createDefaultSkyboxConfig(this.engineType3D), {
            engineType: this.engineType3D,
        });
        this.skybox.update(this.renderer3d.camera, 0);
        this.weatherSystem = new WeatherSystem3D(this.scene, this.renderer3d.camera, { THREE });
        this.weatherSystem.applyConfig(createDefaultSkyboxConfig(this.engineType3D));

        // ── Window resize ─────────────────────────────────────────────────
        this._boundOnResize = () => this._onResize();
        window.addEventListener('resize', this._boundOnResize);
        this._onResize();

        // ── Project input map ─────────────────────────────────────────────
        if (this.currentProject) {
            await this.input.loadActionMap(
                `/projects/${this.currentProject}/data/input3d.json`
            ).catch(() => {});
        }

        // ── Generic editable HUD ──────────────────────────────────────────
        // FPS owns a purpose-built HUD_FPS overlay. Loading the generic .redui HUD
        // there creates duplicate panels and unresolved RPG-style bindings.
        if (this._usesGenericHUD()) {
            try {
                this.gameHUD = new window.GameHUD();
                this.gameHUD.init(this.container);
                this.gameHUD.onAction = (cmd) => this._handleHUDAction(cmd);
                const r = await fetch('/interfaces/main.redui');
                if (r.ok) {
                    const data = await r.json();
                    this.gameHUD.load(data);
                    this.gameHUD.showScreen('main_hud');
                }
            } catch (e) {
                console.log('[Game3DCore] No HUD config found', e);
            }
        }

        console.log('[Game3DCore] initCore() complete');
        return this;
    }

    // ── Login / project load ─────────────────────────────────────────────────

    /** Set player identity and start the game loop. */
    async login(username) {
        this.username = username;
        console.log(`[Game3DCore] login: ${username}`);
        this._startLoop();
    }

    /** Load a project level from the server. */
    async loadProject(projectName, levelId) {
        this.currentProject = projectName;
        await this.fetchLevel(projectName, levelId);
        if (typeof this.onLevelReady === 'function') this.onLevelReady(this._currentLevel);
    }

    /** Load a level directly from JSON (playtest mode). */
    async loadLevelFromData(levelData) {
        await this.loadLevel3D(levelData);
        if (typeof this.onLevelReady === 'function') this.onLevelReady(this._currentLevel);
    }

    // ── Engine3DAdapter hooks ────────────────────────────────────────────────

    async onLevelLoaded(level) {
        console.log(`[Game3DCore] onLevelLoaded: "${level.name}" (mode: ${this._engineType3D})`);
        this._levelId       = level.id ?? level.name ?? null;
        this._currentLevel  = level;
        this._levelComplete = false;

        // Sync physics gravity from level config
        if (this.physics && level.physics?.gravity) {
            this.physics.setGravity(...level.physics.gravity);
        }

        // Apply skybox from level config
        if (this.skybox) {
            const skyboxData = normalizeSkyboxConfig(level.skybox ?? level.sky ?? level.lighting ?? null, {
                engineType: this.engineType3D,
                paletteManager: this.palette,
                fallbackFog: level.fog ?? null,
            });
            this.skybox.applyConfig(skyboxData, {
                engineType: this.engineType3D,
                paletteManager: this.palette,
                fallbackFog: level.fog ?? null,
            });
            this.skybox.update(this.renderer3d?.camera, 0);
            this.weatherSystem?.applyConfig(skyboxData);
        }

        // Sync raycaster layers
        if (this.raycast && this.physics) {
            this.raycast.syncFromPhysicsWorld(this.physics, {
                static:    LayerMask.TERRAIN,
                dynamic:   LayerMask.ENTITY,
                kinematic: LayerMask.PROP,
            });
        }

        // Delegate to mode
        if (this.mode) {
            await this.mode.onLevelLoaded(level);
        }
    }

    onLevelUnloaded() {
        console.log('[Game3DCore] onLevelUnloaded');
        this.gameTime      = 0;
        this._accumulator  = 0;
        this._currentLevel = null;
        this._levelComplete = false;

        // Delegate to mode
        if (this.mode) {
            this.mode.onLevelUnloaded();
        }
    }

    // ── Game loop ─────────────────────────────────────────────────────────────

    _startLoop() {
        if (this.isRunning) return;
        this.isRunning = true;
        this._lastTS   = performance.now();
        requestAnimationFrame(ts => this._loop(ts));
        console.log('[Game3DCore] Game loop started');
    }

    _stopLoop() {
        this.isRunning = false;
    }

    _handleHUDAction(cmd) {
        if (cmd === 'retryLevel') this._retryLevel();
        if (cmd === 'quitToMenu') this._quitToMenu();
        if (cmd === 'togglePause') this.togglePause();
    }

    _usesGenericHUD() {
        return this._engineType3D !== 'fps-3d';
    }

    _quitToMenu() {
        if (window.CAMPAIGN_RUNTIME_MODE && window.parent) {
            window.parent.location.href = 'slot_selection.html';
        } else {
            this._stopLoop();
            if (this.gameHUD) this.gameHUD.hide();
        }
    }

    async _retryLevel() {
        this.isRunning = false;
        if (this.gameHUD) {
            this.gameHUD.state._showGameOver = false;
            this.gameHUD.showScreen('main_hud');
        }
        this.mode?.dispose?.();
        await this.initCore();
    }

    _loop(timestamp) {
        if (!this.isRunning) return;
        requestAnimationFrame(ts => this._loop(ts));

        // Phase 26: Performance Profiling
        if (window.RedGlitchProfiler) window.RedGlitchProfiler.beginFrame();

        const rawDt  = Math.min((timestamp - this._lastTS) / 1000, MAX_DELTA);
        this._lastTS = timestamp;

        if (this.isPaused) {
            if (window.RedGlitchProfiler) window.RedGlitchProfiler.endFrame();
            return;
        }

        this.gameTime += rawDt;

        // ── Fixed-step physics accumulation ────────────────────────────
        this._accumulator += rawDt;
        while (this._accumulator >= FIXED_STEP) {
            this.physics?.step(FIXED_STEP);
            if (this.mode) this.mode.fixedUpdate(FIXED_STEP);
            this._accumulator -= FIXED_STEP;
        }

        // ── Variable-step update ──────────────────────────────────────
        this._coreUpdate(rawDt);

        // ── Render ────────────────────────────────────────────────────
        this._coreRender(rawDt);

        if (window.RedGlitchProfiler) {
            window.RedGlitchProfiler.updateStats({
                drawCalls: this.renderer3d?.webgl ? this.renderer3d.webgl.info.render.calls : 0
            });
            window.RedGlitchProfiler.endFrame();
        }
    }

    /**
     * Shared per-frame update — runs input, mode update, camera, audio,
     * skybox sync.  Mode-specific logic is in mode.update().
     */
    _coreUpdate(dt) {
        // 1. Input
        this.input?.update(dt);

        // 2. Mode-specific update (camera, entities, HUD, VFX, etc.)
        if (this.mode) this.mode.update(dt);

        // 3. Camera
        this.camera3d?.update(dt);

        // 4. Skybox follows camera
        this.skybox?.update(this.renderer3d?.camera, dt);
        this.weatherSystem?.update(this.renderer3d?.camera, dt);

        // 5. Spatial audio listener follows camera
        if (this.audio && this.renderer3d?.camera) {
            const cam = this.renderer3d.camera;
            this.audio.updateListenerPosition(
                cam.position.x, cam.position.y, cam.position.z,
                cam.getWorldDirection
                    ? cam.getWorldDirection(new this.THREE.Vector3())
                    : null,
            );
        }

        // 6. Hybrid scene frustum culling and mesh updates
        if (this.hybridScene && this.camera3d?.camera) {
            this.hybridScene.update(dt, this.camera3d.camera);
        }

        // 7. GameHUD Sync
        if (this._usesGenericHUD() && this.gameHUD && this.mode && this.mode.player) {
            const p = this.mode.player;
            this.gameHUD.sync({
                player: {
                    hp: p.hp || 100,
                    maxHp: p.maxHp || 100,
                    mana: p.mana || 50,
                    maxMana: p.maxMana || 50,
                    stamina: p.stamina || 100,
                    maxStamina: p.maxStamina || 100,
                    coins: p.coins || 0,
                    xp: p.xp || 0,
                    level: p.level || 1
                },
                gameTimeFormatted: `${Math.floor(this.gameTime)}:${String(Math.floor((this.gameTime%1)*60)).padStart(2,'0')}`
            });
        }
    }

    _coreRender(dt) {
        if (!this.hybridScene) return;
        this.hybridScene.render(dt);
    }

    // ── Level completion ──────────────────────────────────────────────────────

    /**
     * completeLevel(data) — called by mode modules to signal level completion.
     * Emits a one-shot 'levelComplete' event consumed by campaign adapters.
     */
    completeLevel(data = {}) {
        if (this._levelComplete) return false;
        this._levelComplete = true;
        this.emit('levelComplete', {
            levelId:     this._levelId,
            engineType:  this._engineType3D,
            playerState: this.mode?.getPlayerData?.() ?? {},
            ...data,
        });
        return true;
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
            try { cb(data); } catch (e) { console.warn(`[Game3DCore] emit(${event}) error:`, e); }
        }
    }

    // ── Save / Load ───────────────────────────────────────────────────────────

    async saveGame(slot = this.saveSlot) {
        if (!this.username) { console.warn('[Game3DCore] saveGame: no username'); return; }
        const payload = this._buildSavePayload();
        const res = await fetch(`/api/save/${encodeURIComponent(this.username)}/${slot}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`saveGame HTTP ${res.status}`);
        console.log(`[Game3DCore] Game saved: slot ${slot}`);
    }

    async loadGame(slot = this.saveSlot) {
        if (!this.username) { console.warn('[Game3DCore] loadGame: no username'); return; }
        const res = await fetch(`/api/save/${encodeURIComponent(this.username)}/${slot}`);
        if (!res.ok) throw new Error(`loadGame HTTP ${res.status}`);
        const data = await res.json();
        await this._applySavePayload(data);
        console.log(`[Game3DCore] Game loaded: slot ${slot}`);
    }

    _buildSavePayload() {
        return serializeSavePayload3D(this._engineType3D, {
            version:        this.version,
            project:        this.currentProject,
            levelId:        this._levelId,
            gameTime:       this.gameTime,
            player:         this.mode?.getPlayerData?.()  ?? {},
            levelState:     this.mode?.getLevelState?.()   ?? {},
            lastCheckpoint: this.mode?.getPlayerData?.()?.lastCheckpoint ?? null,
            collectedItems: this.mode?.getPlayerData?.()?.collectedItems ?? [],
        });
    }

    async _applySavePayload(raw) {
        const data = deserializeSavePayload3D(raw, this._engineType3D);
        if (!data) return;

        if (data.project && data.levelId) {
            await this.loadProject(data.project, data.levelId);
        }
        if (data.gameTime !== undefined) this.gameTime = data.gameTime;

        // Delegate mode-specific restoration
        if (this.mode) {
            if (data.player)     await this.mode.setPlayerData(data.player);
            if (data.levelState) await this.mode.setLevelState(data.levelState);
        }
    }

    // ── Pointer lock helpers ──────────────────────────────────────────────────

    requestPointerLock() {
        this.mode?.requestPointerLock?.();
    }

    releasePointerLock() {
        this.mode?.releasePointerLock?.();
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    pause() {
        this.isPaused = true;
        this.releasePointerLock();
        console.log('[Game3DCore] Paused');
    }

    resume() {
        this.isPaused = false;
        console.log('[Game3DCore] Resumed');
    }

    toggle() {
        this.isPaused ? this.resume() : this.pause();
    }

    _onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.renderer3d?.resize(w, h);
        this.camera3d?.onResize(w, h);
        // Let mode handle additional resizes (minimap, etc.)
        if (this.mode && typeof this.mode.onResize === 'function') {
            this.mode.onResize(w, h);
        }
    }

    dispose() {
        this._stopLoop();
        this.onLevelUnloaded();

        // Dispose mode first
        this.mode?.dispose();
        this.mode = null;

        // Dispose shared systems
        this.releasePointerLock();
        this.input?.detach();
        this.skybox?.dispose?.();
        this.weatherSystem?.dispose?.();
        this.audio?.dispose();
        this.renderer3d?.dispose();
        this.raycast?.dispose();

        // ── Clean up UI ───────────────────────────────────────────────────
        if (this.gameHUD) {
            this.gameHUD.destroy();
            this.gameHUD = null;
        }

        this._listeners.clear();

        // Remove window listener
        if (this._boundOnResize) {
            window.removeEventListener('resize', this._boundOnResize);
        }

        console.log('[Game3DCore] Disposed');
    }
}

// ── Export constants for mode modules ─────────────────────────────────────────
export { FIXED_STEP, MAX_DELTA, THREE, CameraMode, LayerMask };
