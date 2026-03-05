/**
 * main.js — Platformer-3D Engine entry point
 *
 * Extends Engine3DAdapter with the full third-person platformer game loop:
 *   Input → CharacterController → PlatformerPhysics → ThirdPersonCamera
 *        → Collectibles → Checkpoints → Enemies → VFX → Render
 *
 * Visual style: LOW-POLY + VOXEL, flat palette colors, cel-shading only.
 * No PBR, no HDR, no texture atlases — pure MeshLambertMaterial.
 *
 * Systems wired here (stubs ready for later phases):
 *   - Renderer3D            (Phase 3)   — WebGL + EffectComposer pipeline
 *   - Camera3DController    (Phase 4)   — THIRD_PERSON mode
 *   - Physics3DWorld        (Phase 5)   — cannon-es fixed-step
 *   - PaletteManager        (Phase 6)   — 256-color palette
 *   - AssetLoader3D         (Phase 6)   — GLTF + .vox LRU cache
 *   - Input3D               (Phase 7)   — action-mapped input
 *   - AudioSpatial3D        (Phase 8)   — HRTF + reverb
 *   - Raycast3D             (Phase 9)   — layer-masked picking
 *   - ThirdPersonCamera     (Phase 43)  — null until loaded
 *   - PlatformerPhysics3D   (Phase 44)  — null until loaded
 *   - CharacterController3D (Phase 45)  — null until loaded
 *   - PlayerCharacter3D     (Phase 46)  — null until loaded
 *   - CollectibleSystem3D   (Phase 47)  — null until loaded
 *   - CheckpointSystem3D    (Phase 48)  — null until loaded
 *   - EnemyPlatformer3D     (Phase 49)  — null until loaded
 *   - VFX_Platformer3D      (Phase 50)  — null until loaded
 *
 * Entry point: window.Platformer3DGame
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
import ThirdPersonCamera        from './ThirdPersonCamera.js';
import PlatformerPhysics3D      from './PlatformerPhysics3D.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORMER3D_VERSION = '0.1.0';
const DEFAULT_SAVE_SLOT    = 0;
const FIXED_STEP           = 1 / 60;   // physics tick rate
const MAX_DELTA            = 0.1;      // delta cap (100 ms) — prevents spiral of death
const MAX_LIVES            = 3;        // default life count
const INVINCIBILITY_FRAMES = 90;       // ~1.5 s at 60 fps after taking damage

// ── Platformer3DGame ──────────────────────────────────────────────────────────

class Platformer3DGame extends Engine3DAdapter {

    constructor(container, options = {}) {
        super(container, options);

        // ── Identity ───────────────────────────────────────────────────────
        this._engineType3D  = 'platformer-3d';
        this.version        = PLATFORMER3D_VERSION;

        // ── Player state ───────────────────────────────────────────────────
        this.username       = null;
        this.saveSlot       = DEFAULT_SAVE_SLOT;
        this.currentProject = null;
        this.isRunning      = false;
        this.isPaused       = false;

        // Player vitals (populated by save/load + character system)
        this._lives         = MAX_LIVES;
        this._health        = 3;        // hit-points within current life
        this._coins         = 0;
        this._score         = 0;
        this._invincFrames  = 0;        // count down each tick; >0 = invincible

        // ── Shared systems (Phase 3–9, instantiated in init()) ─────────────
        this.renderer3d     = null;   // Renderer3D
        this.camera3d       = null;   // Camera3DController (THIRD_PERSON mode)
        this.physics        = null;   // Physics3DWorld
        this.palette        = null;   // PaletteManager
        this.assets         = null;   // AssetLoader3D
        this.input          = null;   // Input3D
        this.audio          = null;   // AudioSpatial3D
        this.raycaster      = null;   // Raycast3D

        // ── Engine-specific systems (Phase 43-50, lazy-loaded) ─────────────
        this.thirdPersonCam = null;   // ThirdPersonCamera   (Phase 43) — set in init()
        this.platformerPhys = null;   // PlatformerPhysics3D (Phase 44) — set in init()
        this.charController = null;   // CharacterController3D (Phase 45)
        this.playerChar     = null;   // PlayerCharacter3D   (Phase 46)
        this.collectibles   = null;   // CollectibleSystem3D (Phase 47)
        this.checkpoints    = null;   // CheckpointSystem3D  (Phase 48)
        this.enemies        = null;   // EnemyPlatformer3D   (Phase 49)
        this.vfx            = null;   // VFX_Platformer3D    (Phase 50)

        // ── Checkpoint / respawn state ─────────────────────────────────────
        this._checkpoint    = null;   // { position: THREE.Vector3, state: {} }
        this._deathY        = -20;    // fall below this Y → instant death
        this._respawning    = false;

        // ── Timing ────────────────────────────────────────────────────────
        this._accumulator   = 0;
        this._rafId         = null;

        // ── Lifecycle callbacks (set by index.html bootstrap) ─────────────
        this.onReady        = null;
        this.onLevelReady   = null;
        this.onLifeLost     = null;
        this.onGameOver     = null;
        this.onLevelComplete= null;
    }

    // ── Engine type ───────────────────────────────────────────────────────────
    get engineType3D() { return 'platformer-3d'; }

    // ─────────────────────────────────────────────────────────────────────────
    // Initialization
    // ─────────────────────────────────────────────────────────────────────────

    async init() {
        // 1. Shared systems from base phases
        this.renderer3d = new Renderer3D(this._container, {
            antialias: true,
            pixelRatio: Math.min(window.devicePixelRatio, 2),
            postProcess: ['outline', 'cel'],
        });
        await this.renderer3d.init();

        this.camera3d = new Camera3DController(this.renderer3d.camera, this.renderer3d.renderer);
        this.camera3d.setMode(CameraMode.THIRD_PERSON);

        this.physics = new Physics3DWorld({ gravity: [0, -20, 0], fixedStep: FIXED_STEP });
        await this.physics.init();

        this.palette  = new PaletteManager();
        this.assets   = new AssetLoader3D(this.palette);
        this.input    = new Input3D();
        this.audio    = new AudioSpatial3D(this.camera3d.camera);
        this.raycaster= new Raycast3D(this.renderer3d.scene, this.camera3d.camera);

        await this.input.init();

        // Third-person camera
        this.thirdPersonCam = new ThirdPersonCamera(
            this.camera3d,
            this.renderer3d.scene,
            this._container,
            { distance: 6, pivotHeight: 1.2, autoRotate: true }
        );
        this.thirdPersonCam.attach();

        // Platformer physics layer
        this.platformerPhys = new PlatformerPhysics3D(this.physics, {
            gravity:    -20,
            airJumps:   1,
        });

        // Bind platformer-specific input actions
        this._bindInputActions();

        this.onReady?.();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Login
    // ─────────────────────────────────────────────────────────────────────────

    async login(username) {
        this.username = username;
        // Load profile from server; fall back to defaults if not found
        try {
            const res = await fetch(`/api/profile/${username}`);
            if (res.ok) {
                const profile = await res.json();
                this._lives  = profile.lives  ?? MAX_LIVES;
                this._coins  = profile.coins  ?? 0;
                this._score  = profile.score  ?? 0;
            }
        } catch (_) { /* offline — use defaults */ }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Level loading
    // ─────────────────────────────────────────────────────────────────────────

    async loadProject(project, levelId) {
        this.currentProject = project;
        const res  = await fetch(`/api/levels3d/${encodeURIComponent(project)}/${encodeURIComponent(levelId)}`);
        if (!res.ok) throw new Error(`Level not found: ${project}/${levelId}`);
        const data = await res.json();
        await this._hydrateLevel(data);
    }

    async loadLevelFromData(data) {
        await this._hydrateLevel(data);
    }

    async _hydrateLevel(data) {
        // Delegate to Engine3DAdapter base for geometry/entities/lights
        await this.initialize3D(data);

        // Read platformer-specific fields
        this._deathY = data.deathY ?? -20;
        if (data.checkpoints?.length) {
            this.checkpoints?.fromData?.(data.checkpoints);
        }

        // Place player at spawn
        const spawn = data.playerSpawn ?? { x: 0, y: 2, z: 0 };
        this._setPlayerPosition(spawn.x, spawn.y, spawn.z);

        this.onLevelReady?.(data);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Game loop
    // ─────────────────────────────────────────────────────────────────────────

    _startLoop() {
        this.isRunning = true;
        let last = performance.now();

        const tick = (now) => {
            this._rafId = requestAnimationFrame(tick);
            if (this.isPaused) return;

            const rawDelta  = (now - last) / 1000;
            last            = now;
            const delta     = Math.min(rawDelta, MAX_DELTA);

            // Fixed-step physics accumulator
            this._accumulator += delta;
            while (this._accumulator >= FIXED_STEP) {
                this._fixedUpdate(FIXED_STEP);
                this._accumulator -= FIXED_STEP;
            }

            this._update(delta);
            this._render();
        };

        this._rafId = requestAnimationFrame(tick);
    }

    /** Fixed-step update — physics, character controller, collision */
    _fixedUpdate(dt) {
        this.physics?.step(dt);
        this.charController?.fixedUpdate?.(dt);
        this.platformerPhys?.fixedUpdate?.(dt);
    }

    /** Variable-step update — camera, VFX, audio, HUD */
    _update(dt) {
        // Input snapshot
        const inputState = this.input?.snapshot?.() ?? {};

        // Update game systems (stub-safe null checks throughout)
        this.charController?.update?.(dt, inputState);
        this.thirdPersonCam?.update?.(dt, this._getPlayerPosition());
        this.thirdPersonCam?.addLookDelta?.(-inputState.camLeft + inputState.camRight, inputState.camDown - inputState.camUp);
        if (inputState.camShoulderSwap && !this._prevShoulderSwap) this.thirdPersonCam?.swapShoulder?.();
        this._prevShoulderSwap = !!inputState.camShoulderSwap;
        this.camera3d?.update?.(dt);
        this.collectibles?.update?.(dt, this._getPlayerPosition());
        this.enemies?.update?.(dt);
        this.vfx?.update?.(dt);
        this.audio?.update?.(dt, this.camera3d?.camera);

        // Invincibility countdown
        if (this._invincFrames > 0) this._invincFrames--;

        // Death plane check
        const pos = this._getPlayerPosition();
        if (pos && pos.y < this._deathY && !this._respawning) {
            this._triggerDeath();
        }
    }

    /** Render */
    _render() {
        this.renderer3d?.render?.();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Life / checkpoint respawn system
    // ─────────────────────────────────────────────────────────────────────────

    setCheckpoint(position, stateSnapshot = {}) {
        this._checkpoint = {
            position: { x: position.x, y: position.y, z: position.z },
            state:    stateSnapshot,
        };
    }

    _triggerDeath() {
        if (this._respawning) return;
        this._respawning = true;

        this._lives--;
        this.onLifeLost?.(this._lives);

        if (this._lives <= 0) {
            this._gameOver();
            return;
        }

        // Respawn delay — show death VFX then teleport
        this.vfx?.spawnDeathExplosion?.(this._getPlayerPosition());
        setTimeout(() => this._respawn(), 1200);
    }

    _respawn() {
        const pos = this._checkpoint?.position ?? { x: 0, y: 2, z: 0 };
        this._setPlayerPosition(pos.x, pos.y, pos.z);
        this._health       = 3;
        this._invincFrames = INVINCIBILITY_FRAMES;
        this._respawning   = false;
        this.platformerPhys?.resetVelocity?.();
    }

    _gameOver() {
        this.isRunning = false;
        this.onGameOver?.();
    }

    /** Called by CheckpointSystem3D when the player reaches the level exit */
    levelComplete(stats = {}) {
        this.isRunning = false;
        this.onLevelComplete?.({ coins: this._coins, score: this._score, ...stats });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Input bindings
    // ─────────────────────────────────────────────────────────────────────────

    _bindInputActions() {
        if (!this.input) return;
        this.input.defineActions({
            moveLeft:    [{ type: 'key', code: 'KeyA' }, { type: 'key', code: 'ArrowLeft' }],
            moveRight:   [{ type: 'key', code: 'KeyD' }, { type: 'key', code: 'ArrowRight' }],
            moveForward: [{ type: 'key', code: 'KeyW' }, { type: 'key', code: 'ArrowUp' }],
            moveBack:    [{ type: 'key', code: 'KeyS' }, { type: 'key', code: 'ArrowDown' }],
            jump:        [{ type: 'key', code: 'Space' }],
            dash:        [{ type: 'key', code: 'ShiftLeft' }],
            groundPound: [{ type: 'key', code: 'ControlLeft' }],
            camRight:    [{ type: 'mouse', axis: 'dx', positive: true }],
            camLeft:     [{ type: 'mouse', axis: 'dx', positive: false }],
            camUp:       [{ type: 'mouse', axis: 'dy', positive: false }],
            camDown:     [{ type: 'mouse', axis: 'dy', positive: true }],
            camShoulderSwap: [{ type: 'key', code: 'KeyQ' }],
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Player position helpers (proxied to CharacterController3D when present)
    // ─────────────────────────────────────────────────────────────────────────

    _getPlayerPosition() {
        return this.charController?.getPosition?.() ?? this.playerChar?.mesh?.position ?? null;
    }

    _setPlayerPosition(x, y, z) {
        this.charController?.teleport?.(x, y, z);
        if (this.playerChar?.mesh) {
            this.playerChar.mesh.position.set(x, y, z);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pause / resume
    // ─────────────────────────────────────────────────────────────────────────

    pause()  { this.isPaused = true;  this.audio?.suspend?.(); }
    resume() { this.isPaused = false; this.audio?.resume?.(); }
    toggle() { this.isPaused ? this.resume() : this.pause(); }

    // ─────────────────────────────────────────────────────────────────────────
    // Save / load
    // ─────────────────────────────────────────────────────────────────────────

    async saveGame() {
        if (!this.username) return;
        const data = {
            lives:  this._lives,
            health: this._health,
            coins:  this._coins,
            score:  this._score,
            checkpoint: this._checkpoint,
        };
        const res = await fetch(
            `/api/save/${encodeURIComponent(this.username)}/${this.saveSlot}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
        );
        if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    }

    async loadGame() {
        if (!this.username) return;
        const res = await fetch(`/api/save/${encodeURIComponent(this.username)}/${this.saveSlot}`);
        if (!res.ok) return;
        const data = await res.json();
        this._lives      = data.lives  ?? MAX_LIVES;
        this._health     = data.health ?? 3;
        this._coins      = data.coins  ?? 0;
        this._score      = data.score  ?? 0;
        this._checkpoint = data.checkpoint ?? null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Engine3DAdapter overrides
    // ─────────────────────────────────────────────────────────────────────────

    onLevelLoaded(level) {
        // Called by Engine3DAdapter after geometry/entities/lights are placed.
        // Engine-specific hydration happens here (Phase 43+).
    }

    onLevelUnloaded() {
        this.collectibles?.clear?.();
        this.enemies?.clear?.();
        this.vfx?.clear?.();
        this._checkpoint = null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Destroy
    // ─────────────────────────────────────────────────────────────────────────

    destroy() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this.isRunning  = false;
        this.thirdPersonCam?.destroy?.();
        this.renderer3d?.dispose?.();
        this.physics?.destroy?.();
        this.audio?.destroy?.();
        this.input?.destroy?.();
    }
}

// ── Global export ─────────────────────────────────────────────────────────────
export default Platformer3DGame;
window.Platformer3DGame = Platformer3DGame;
