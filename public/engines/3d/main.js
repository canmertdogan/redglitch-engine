/**
 * main.js — RedGlitch3DGame
 *
 * THE unified 3D engine for RedGlitch.
 * Merges fps-3d, topdown-3d, and platformer-3d into ONE class.
 *
 * Architecture:
 *   - Shared core: Renderer3D, Camera3D, Physics, Input, Audio, Raycast, Skybox
 *   - Mode configs: modes/fps.js, modes/topdown.js, modes/platformer.js
 *   - System registry: mode subsystems are lazy-loaded and registered at switchMode()
 *   - Game loop iterates registered systems in mode-specified order
 *
 * Visual style: LOW-POLY + VOXEL, flat palette colors, cel-shading only.
 * No PBR, no HDR — pure MeshLambertMaterial.
 *
 * Entry point: window.RedGlitch3DGame
 * Backward compat: window.FPSGame, window.TopDownGame3D, window.Platformer3DGame
 */

import * as THREE               from '/lib/three/three.module.js';
import Engine3DAdapter           from '../shared/Engine3DAdapter.js';
import Renderer3D                from '../shared/Renderer3D.js';
import Camera3DController,
       { CameraMode }           from '../shared/Camera3DController.js';
import Physics3DWorld            from '../shared/Physics3DWorld.js';
import PaletteManager            from '../shared/PaletteManager.js';
import AssetLoader3D             from '../shared/AssetLoader3D.js';
import Input3D                   from '../shared/Input3D.js';
import AudioSpatial3D            from '../shared/AudioSpatial3D.js';
import Raycast3D, { LayerMask }  from '../shared/Raycast3D.js';
import SkyboxSystem              from '../shared/SkyboxSystem.js';
import {
    serializeSavePayload3D,
    deserializeSavePayload3D,
    serialize3DPlayerState,
    deserialize3DPlayerState,
} from '../shared/Save3D.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const ENGINE_VERSION  = '1.0.0';
const DEFAULT_SAVE    = 0;
const FIXED_STEP      = 1 / 60;
const MAX_DELTA       = 0.1;

// ── Mode registry ─────────────────────────────────────────────────────────────

const MODE_LOADERS = {
    'fps-3d':        () => import('./modes/fps.js'),
    'topdown-3d':    () => import('./modes/topdown.js'),
    'platformer-3d': () => import('./modes/platformer.js'),
};

// ── CameraMode mapping ───────────────────────────────────────────────────────

const CAMERA_MODE_MAP = {
    'FPS':          CameraMode.FPS,
    'TOPDOWN':      CameraMode.TOPDOWN,
    'THIRD_PERSON': CameraMode.THIRD_PERSON,
};

// ── RedGlitch3DGame ───────────────────────────────────────────────────────────

class RedGlitch3DGame extends Engine3DAdapter {

    constructor(container, options = {}) {
        super(container, options);

        // ── Identity ───────────────────────────────────────────────────────
        this._engineType3D  = options.engineType || options.mode || 'fps-3d';
        this.version        = ENGINE_VERSION;

        // ── Player state ───────────────────────────────────────────────────
        this.username       = null;
        this.saveSlot       = DEFAULT_SAVE;
        this.currentProject = null;
        this.isRunning      = false;
        this.isPaused       = false;

        // ── Player vitals (superset across all modes) ──────────────────────
        this._health        = 100;
        this._ammo          = { current: 30, reserve: 90 };
        this._lives         = 3;
        this._coins         = 0;
        this._score         = 0;
        this._invincFrames  = 0;
        this._collectedItems = new Set();
        this._lastCheckpoint = null;
        this._checkpoint    = null;
        this._deathY        = -999;
        this._respawning    = false;
        this._flags         = {};
        this.selectedUnits  = [];
        this._playerTeam    = 0;

        // ── Shared systems (instantiated in init()) ────────────────────────
        this.renderer3d     = null;
        this.camera3d       = null;
        this.physics        = null;
        this.palette        = null;
        this.assets         = null;
        this.input          = null;
        this.audio          = null;
        this.raycast        = null;
        this.skybox         = null;
        this.strategy       = null;

        // ── Mode-specific ──────────────────────────────────────────────────
        this._modeConfig    = null;   // loaded mode config module
        this._modeSystems   = [];     // array of { key, instance } for current mode
        this._updateOrder   = [];     // system keys in tick order

        // ── Game state ─────────────────────────────────────────────────────
        this.gameTime       = 0;
        this._accumulator   = 0;
        this._lastTS        = 0;
        this._levelId       = null;
        this._currentLevel  = null;
        this._levelComplete = false;
        this._initialEnemyCount   = 0;
        this._initialHostileCount = 0;

        // ── Event emitter ──────────────────────────────────────────────────
        this._listeners = new Map([
            ['playerDied',    []],
            ['levelComplete', []],
            ['enemyKilled',   []],
            ['weaponFired',   []],
            ['gameOver',      []],
            ['unitDied',      []],
            ['abilityCast',   []],
        ]);

        // ── Callbacks ──────────────────────────────────────────────────────
        this.onReady        = null;
        this.onLevelReady   = null;
        this.onGameOver     = null;
        this.onLevelComplete = null;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * init(mode?) — initialize shared systems and load initial mode.
     * @param {string} [mode] — 'fps-3d' | 'topdown-3d' | 'platformer-3d'
     */
    async init(mode) {
        const engineMode = mode || this._engineType3D || 'fps-3d';
        this._engineType3D = engineMode;

        console.log(`[RedGlitch3D v${ENGINE_VERSION}] init(${engineMode})`);

        const container = this.container || document.getElementById('game-container');
        if (!container) throw new Error('[RedGlitch3D] no container element');
        this.container = container;

        // ── Renderer ───────────────────────────────────────────────────────
        this.renderer3d = new Renderer3D(container, {
            antialias:  false,
            shadows:    true,
            shadowType: 1,
            pixelRatio: Math.min(window.devicePixelRatio, 2),
        });
        await this.renderer3d.init();

        this.THREE  = this.renderer3d.THREE;
        this.scene  = this.renderer3d.scene;

        // ── Camera (mode will set the correct CameraMode) ──────────────────
        this.camera3d = new Camera3DController(this.renderer3d.camera, container, {
            mode: CameraMode.FPS,
            fov:  75,
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
        this.skybox.setGradient('#1a2a3a', '#0a0806');

        // ── Default Lighting ───────────────────────────────────────────────
        const amb = new THREE.AmbientLight(0xffffff, 1.0);
        amb.name = '_rg3d_ambient';
        this.scene.add(amb);
        const sun = new THREE.DirectionalLight(0xffffff, 1.5);
        sun.name = '_rg3d_sun';
        sun.position.set(30, 60, 30);
        sun.castShadow = true;
        this.scene.add(sun);

        // ── Window resize ──────────────────────────────────────────────────
        this._resizeBound = () => this._onResize();
        window.addEventListener('resize', this._resizeBound);
        this._onResize();

        // ── Project input map ──────────────────────────────────────────────
        if (this.currentProject) {
            await this.input.loadActionMap(
                `/projects/${this.currentProject}/data/input3d.json`
            ).catch(() => {});
        }

        // ── Load initial mode ──────────────────────────────────────────────
        await this.switchMode(engineMode);

        console.log(`[RedGlitch3D] init(${engineMode}) complete`);
        if (typeof this.onReady === 'function') this.onReady(this);
        return this;
    }

    // ── Mode switching ────────────────────────────────────────────────────────

    /**
     * switchMode(mode) — tear down current mode systems, load new mode.
     * @param {string} mode — 'fps-3d' | 'topdown-3d' | 'platformer-3d'
     */
    async switchMode(mode) {
        if (!MODE_LOADERS[mode]) {
            throw new Error(`[RedGlitch3D] Unknown mode: ${mode}`);
        }

        console.log(`[RedGlitch3D] switchMode → ${mode}`);

        // ── Dispose current mode systems ───────────────────────────────────
        await this._disposeModeSystems();

        // ── Load mode config ───────────────────────────────────────────────
        const mod = await MODE_LOADERS[mode]();
        this._modeConfig   = mod.default;
        this._engineType3D = mode;

        // ── Apply camera mode ──────────────────────────────────────────────
        const camMode = CAMERA_MODE_MAP[this._modeConfig.cameraMode] ?? CameraMode.FPS;
        if (this.camera3d) {
            this.camera3d.setMode(camMode);
        }

        // ── Apply physics config ───────────────────────────────────────────
        if (this._modeConfig.physics && this.physics) {
            const g = this._modeConfig.physics.gravity;
            if (g) this.physics.setGravity(g[0], g[1], g[2]);
        }

        // ── Apply player defaults ──────────────────────────────────────────
        if (this._modeConfig.playerDefaults) {
            const d = this._modeConfig.playerDefaults;
            if (d.health !== undefined) this._health = d.health;
            if (d.ammo   !== undefined) this._ammo   = d.ammo;
            if (d.lives  !== undefined) this._lives  = d.lives;
            if (d.coins  !== undefined) this._coins  = d.coins;
            if (d.score  !== undefined) this._score  = d.score;
        }

        // ── Instantiate mode systems ───────────────────────────────────────
        this._modeSystems = [];
        this._updateOrder = this._modeConfig.updateOrder || [];

        for (const def of this._modeConfig.systems) {
            try {
                const sysModule = await def.loader();
                const SysClass  = sysModule.default;
                const args      = def.initArgs ? def.initArgs(this) : [this];
                const instance  = new SysClass(...args);

                // Call init() if the system has one
                if (typeof instance.init === 'function') {
                    await instance.init();
                }

                this[def.key] = instance;
                this._modeSystems.push({ key: def.key, instance });
            } catch (err) {
                console.warn(`[RedGlitch3D] Failed to load system "${def.key}":`, err);
            }
        }

        // ── Cross-wire systems ─────────────────────────────────────────────
        if (typeof this._modeConfig.onSystemsReady === 'function') {
            this._modeConfig.onSystemsReady(this);
        }

        console.log(`[RedGlitch3D] Mode "${mode}" ready — ${this._modeSystems.length} systems loaded`);
    }

    /**
     * Dispose all current mode systems.
     */
    async _disposeModeSystems() {
        for (const { key, instance } of this._modeSystems) {
            try {
                if (typeof instance.dispose === 'function') instance.dispose();
                else if (typeof instance.destroy === 'function') instance.destroy();
                else if (typeof instance.detach === 'function') instance.detach();
            } catch (e) {
                console.warn(`[RedGlitch3D] Error disposing "${key}":`, e);
            }
            this[key] = null;
        }
        this._modeSystems = [];
        this._updateOrder = [];
    }

    // ── Game loop ─────────────────────────────────────────────────────────────

    _startLoop() {
        if (this.isRunning) return;
        this.isRunning = true;
        this._lastTS   = performance.now();
        requestAnimationFrame(ts => this._loop(ts));
        console.log('[RedGlitch3D] Game loop started');
    }

    _stopLoop() {
        this.isRunning = false;
    }

    _loop(timestamp) {
        if (!this.isRunning) return;
        requestAnimationFrame(ts => this._loop(ts));

        const rawDt  = Math.min((timestamp - this._lastTS) / 1000, MAX_DELTA);
        this._lastTS = timestamp;

        if (this.isPaused) return;

        this.gameTime += rawDt;
        this._update(rawDt);
        this._render();
    }

    _update(dt) {
        // 1. Input
        this.input?.update(dt);

        // 2. Mode-specific systems in declared order
        for (const key of this._updateOrder) {
            const sys = this[key];
            if (sys && typeof sys.update === 'function') {
                sys.update(dt);
            }
        }

        // 3. Physics fixed-step
        this._accumulator += dt;
        while (this._accumulator >= FIXED_STEP) {
            this.physics?.step(FIXED_STEP);
            this._accumulator -= FIXED_STEP;
        }

        // 4. Skybox follows camera
        this.skybox?.update(this.renderer3d?.camera);

        // 5. Spatial audio listener
        if (this.audio && this.renderer3d?.camera) {
            const cam = this.renderer3d.camera;
            this.audio.updateListenerPosition(
                cam.position.x, cam.position.y, cam.position.z,
                cam.getWorldDirection
                    ? cam.getWorldDirection(new THREE.Vector3())
                    : null,
            );
        }

        // 6. Strategy update
        this.strategy?.update?.(dt);

        // 7. Completion checks
        this._checkCompletionState();
    }

    _render() {
        if (!this.renderer3d) return;
        this.renderer3d.render();
    }

    // ── Level lifecycle ───────────────────────────────────────────────────────

    async login(username) {
        this.username = username;
        console.log(`[RedGlitch3D] login: ${username}`);
        this._startLoop();
    }

    async loadProject(projectName, levelId) {
        this.currentProject = projectName;
        await this.fetchLevel(projectName, levelId);
        if (typeof this.onLevelReady === 'function') this.onLevelReady(this._currentLevel);
    }

    async loadLevelFromData(levelData) {
        // Normalize TopDown legacy format if applicable
        const normalized = this._engineType3D === 'topdown-3d'
            ? this._normalizeLegacyEditorLevel(levelData)
            : levelData;
        await this.loadLevel3D(normalized);
        if (typeof this.onLevelReady === 'function') this.onLevelReady(this._currentLevel);
    }

    async loadLevel3D(levelData) {
        if (this._engineType3D === 'topdown-3d') {
            const normalized = this._normalizeLegacyEditorLevel(levelData);
            return super.loadLevel3D(normalized);
        }
        return super.loadLevel3D(levelData);
    }

    // ── Engine3DAdapter hooks ─────────────────────────────────────────────────

    async onLevelLoaded(level) {
        console.log(`[RedGlitch3D] onLevelLoaded: "${level.name}" (mode: ${this._engineType3D})`);
        this._levelId       = level.id ?? level.name ?? null;
        this._currentLevel  = level;
        this._levelComplete = false;

        // Sync physics gravity from level config
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

        // Sync raycaster layers
        if (this.raycast && this.physics) {
            this.raycast.syncFromPhysicsWorld(this.physics, {
                static:    LayerMask.TERRAIN,
                dynamic:   LayerMask.ENTITY,
                kinematic: LayerMask.PROP,
            });
        }

        // Strategy: set player spawn point from level data
        this.strategy?.loadLevel?.(level);

        // ── Mode-specific level loading ────────────────────────────────────

        // FPS: reposition controller + load world geometry + enemies
        if (this.fpsController) {
            const spawn = level?.playerSpawn ?? { x: 0, y: 1.8, z: 0 };
            await this.fpsController.init(spawn);
        }
        if (this.worldGeometry) {
            await this.worldGeometry.loadFromLevel(level, this.currentProject ?? '');
        }
        if (this.enemyAI) {
            await this.enemyAI.loadFromLevel(level, this.currentProject ?? '');
            this._initialEnemyCount = this._countLivingEnemies();
        }

        // TopDown: terrain + entities + pathfinding + fog
        if (this.terrain) {
            await this.terrain.loadFromLevel?.(level);
        }
        if (this.entities) {
            await this.entities.loadFromLevel?.(level);
            this._initialHostileCount = this.entities.countHostiles?.() ?? 0;
        }
        if (this.pathfinding) {
            await this.pathfinding.loadFromLevel?.(level);
        }
        if (this.fogOfWar) {
            this.fogOfWar.loadFromLevel?.(level);
        }
        if (this.abilities) {
            this.abilities.loadFromLevel?.(level);
        }
        if (this.topdownCamera) {
            this.topdownCamera.loadFromLevel?.(level);
        }
        if (this.minimap) {
            this.minimap.loadFromLevel?.(level);
        }

        // Platformer: player character + collectibles + checkpoints + enemies
        if (this.playerChar) {
            await this.playerChar.loadFromLevel?.(level);
        }
        if (this.charController) {
            const spawn = level?.playerSpawn ?? { x: 0, y: 5, z: 0 };
            await this.charController.init?.(spawn);
        }
        if (this.collectibles) {
            await this.collectibles.loadFromLevel?.(level);
        }
        if (this.checkpoints) {
            await this.checkpoints.loadFromLevel?.(level);
        }
        if (this.enemies) {
            await this.enemies.loadFromLevel?.(level, this.currentProject ?? '');
        }
        if (this.platformerPhys) {
            this.platformerPhys.loadFromLevel?.(level);
        }
    }

    onLevelUnloaded() {
        console.log('[RedGlitch3D] onLevelUnloaded');
        this.gameTime     = 0;
        this._accumulator = 0;
        this._currentLevel = null;
        this._levelComplete = false;
        this._initialEnemyCount   = 0;
        this._initialHostileCount = 0;

        // Dispose level-scoped data from each system
        for (const { instance } of this._modeSystems) {
            if (typeof instance.dispose === 'function') {
                // Some systems have a clear() for level data vs dispose() for full teardown
                if (typeof instance.clear === 'function') {
                    instance.clear();
                }
            }
        }
    }

    // ── Pointer lock helpers ──────────────────────────────────────────────────

    requestPointerLock() {
        this.fpsCamera 
            ? this.fpsCamera.requestPointerLock()
            : document.body.requestPointerLock?.()?.catch?.(() => {});
    }

    releasePointerLock() {
        if (this.fpsCamera) {
            this.fpsCamera.releasePointerLock();
        } else {
            document.exitPointerLock?.();
        }
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
            try { cb(data); } catch (e) { console.warn(`[RedGlitch3D] emit(${event}) error:`, e); }
        }
    }

    // ── Level completion ──────────────────────────────────────────────────────

    completeLevel(data = {}) {
        if (this._levelComplete) return false;
        this._levelComplete = true;
        this.emit('levelComplete', {
            levelId: this._levelId,
            engineType: this._engineType3D,
            playerState: this._getPlayerState(),
            ...data,
        });
        return true;
    }

    _getPlayerState() {
        return {
            position: this.strategy?.getPlayerPosition?.() ?? null,
            health:   this._health,
            ammo:     this._ammo,
            lives:    this._lives,
            coins:    this._coins,
            score:    this._score,
            flags:    this._flags,
        };
    }

    _countLivingEnemies() {
        return this.enemyAI?.getEnemies?.().length ?? 0;
    }

    _checkCompletionState() {
        if (this._levelComplete) return;

        // FPS: all enemies defeated
        if (this._engineType3D === 'fps-3d' && this._initialEnemyCount > 0) {
            if (this._countLivingEnemies() <= 0) {
                this.completeLevel({ reason: 'all-enemies-defeated' });
            }
        }
    }

    // ── Save / Load ───────────────────────────────────────────────────────────

    async saveGame(slot = this.saveSlot) {
        if (!this.username) { console.warn('[RedGlitch3D] saveGame: no username'); return; }
        const payload = this._buildSavePayload();
        const res = await fetch(`/api/save/${this.username}/${slot}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`saveGame HTTP ${res.status}`);
        console.log(`[RedGlitch3D] Game saved: slot ${slot}`);
    }

    async loadGame(slot = this.saveSlot) {
        if (!this.username) { console.warn('[RedGlitch3D] loadGame: no username'); return; }
        const res = await fetch(`/api/save/${this.username}/${slot}`);
        if (!res.ok) throw new Error(`loadGame HTTP ${res.status}`);
        const data = await res.json();
        await this._applySavePayload(data);
        console.log(`[RedGlitch3D] Game loaded: slot ${slot}`);
    }

    _buildSavePayload() {
        const playerPos = this.strategy?.getPlayerPosition?.() ?? null;
        return serializeSavePayload3D(this._engineType3D, {
            version:         this.version,
            project:         this.currentProject,
            levelId:         this._levelId,
            gameTime:        this.gameTime,
            mode:            this._engineType3D,
            player: serialize3DPlayerState(
                playerPos ? { position: { x: playerPos[0], y: playerPos[1], z: playerPos[2] } } : null,
                { hp: this._health, maxHp: 100 }
            ),
            lastCheckpoint:  this._lastCheckpoint ?? null,
            collectedItems:  this._collectedItems ? [...this._collectedItems] : [],
            levelState: {
                ammo:    this._ammo,
                lives:   this._lives,
                coins:   this._coins,
                score:   this._score,
                flags:   this._flags,
                // Serialize each mode system that supports it
                ...this._serializeModeSystems(),
            },
        });
    }

    _serializeModeSystems() {
        const out = {};
        for (const { key, instance } of this._modeSystems) {
            if (typeof instance.serialize === 'function') {
                out[key + 'State'] = instance.serialize();
            }
        }
        return out;
    }

    async _applySavePayload(raw) {
        const data = deserializeSavePayload3D(raw, this._engineType3D);
        if (!data) return;

        // Switch mode if save was from a different mode
        if (data.mode && data.mode !== this._engineType3D) {
            await this.switchMode(data.mode);
        }

        if (data.project && data.levelId) {
            await this.loadProject(data.project, data.levelId);
        }
        if (data.gameTime !== undefined) this.gameTime = data.gameTime;

        const ps = deserialize3DPlayerState(data.player);
        if (ps) {
            if (ps.hp !== undefined) this._health = ps.hp;
            if (ps.position) this.strategy?.setSpawnPoint?.(ps.position);
        }

        if (Array.isArray(data.collectedItems)) {
            this._collectedItems = new Set(data.collectedItems);
        }

        const ls = data.levelState ?? {};
        if (ls.ammo  !== undefined) this._ammo  = ls.ammo;
        if (ls.lives !== undefined) this._lives = ls.lives;
        if (ls.coins !== undefined) this._coins = ls.coins;
        if (ls.score !== undefined) this._score = ls.score;
        if (ls.flags !== undefined) this._flags = ls.flags;

        // Deserialize mode systems
        for (const { key, instance } of this._modeSystems) {
            const stateKey = key + 'State';
            if (ls[stateKey] && typeof instance.deserialize === 'function') {
                instance.deserialize(ls[stateKey]);
            }
        }
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    pause() {
        this.isPaused = true;
        if (this._modeConfig?.pointerLock) this.releasePointerLock();
        console.log('[RedGlitch3D] Paused');
    }

    resume() {
        this.isPaused = false;
        console.log('[RedGlitch3D] Resumed');
    }

    toggle() { this.isPaused ? this.resume() : this.pause(); }

    _onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.renderer3d?.resize(w, h);
        this.camera3d?.onResize(w, h);
        // Forward resize to mode camera systems
        this.fpsCamera?.onResize?.(w, h);
        this.topdownCamera?.onResize?.(w, h);
        this.thirdPersonCam?.onResize?.(w, h);
    }

    get engineType3D() { return this._engineType3D; }

    get currentMode() { return this._modeConfig; }

    dispose() {
        this._stopLoop();
        this.onLevelUnloaded();
        this.releasePointerLock();

        // Dispose all mode systems
        this._disposeModeSystems();

        // Dispose shared systems
        this.input?.detach();
        this.audio?.dispose();
        this.raycast?.dispose();
        this.renderer3d?.dispose();
        window.removeEventListener('resize', this._resizeBound);

        console.log('[RedGlitch3D] Disposed');
    }

    // ── TopDown legacy level normalization ─────────────────────────────────────
    // Moved from topdown-3d/main.js — preserves backward compat for old levels

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

    _legacyLevelNeedsOffset(levelData, worldW, worldH) {
        const triPos = levelData.trimesh?.positions;
        if (Array.isArray(triPos) && triPos.length >= 3) {
            let minX = Infinity, minZ = Infinity;
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
        for (const e of levelData.entities || []) if (inspectVec(e?.position)) return true;
        for (const l of levelData.lights || []) if (inspectVec(l?.position)) return true;
        for (const t of levelData.triggers || []) if (inspectVec(t?.position)) return true;
        for (const w of levelData.waypoints || []) if (inspectVec(w?.position)) return true;
        const nmVerts = levelData.navmesh?.vertices;
        if (Array.isArray(nmVerts) && nmVerts.length >= 3) {
            for (let i = 0; i < nmVerts.length; i += 3) {
                if (Number(nmVerts[i] ?? 0) < 0 || Number(nmVerts[i + 2] ?? 0) < 0) return true;
            }
        }
        return false;
    }

    _shiftLegacyLevelCoordinates(levelData, offsetX, offsetZ) {
        if (!offsetX && !offsetZ) return;
        const shiftVec = (vec) => {
            if (!Array.isArray(vec) || vec.length === 0) return;
            vec[0] = Number(vec[0] ?? 0) + offsetX;
            if (vec.length >= 3) vec[2] = Number(vec[2] ?? 0) + offsetZ;
            else if (vec.length >= 2) vec[1] = Number(vec[1] ?? 0) + offsetZ;
        };
        for (const e of levelData.entities || []) shiftVec(e?.position);
        for (const l of levelData.lights || []) shiftVec(l?.position);
        for (const t of levelData.triggers || []) shiftVec(t?.position);
        for (const w of levelData.waypoints || []) shiftVec(w?.position);
        for (const g of levelData.geometry || []) shiftVec(g?.position);
        const navVerts = levelData.navmesh?.vertices;
        if (Array.isArray(navVerts)) {
            for (let i = 0; i < navVerts.length; i += 3) {
                navVerts[i]     = Number(navVerts[i] ?? 0)     + offsetX;
                navVerts[i + 2] = Number(navVerts[i + 2] ?? 0) + offsetZ;
            }
        }
    }

    _normalizeLegacyNavmesh(levelData, offsetX, offsetZ) {
        // Stub — full implementation in TopDown3DStrategy
    }

    _normalizeLegacyTerrain(levelData, worldW, worldH) {
        // Stub — full implementation in TerrainSystem3D
    }

    _normalizeLegacyAtmosphere(levelData) {
        // Stub — full implementation in TerrainSystem3D
    }
}

// ── Expose globally ───────────────────────────────────────────────────────────

window.RedGlitch3DGame = RedGlitch3DGame;

// ── Backward compatibility — old code can still reference old class names ─────
window.FPSGame          = RedGlitch3DGame;
window.TopDownGame3D    = RedGlitch3DGame;
window.Platformer3DGame = RedGlitch3DGame;

export default RedGlitch3DGame;
