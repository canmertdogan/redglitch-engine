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

import * as THREE             from '/lib/three/three.module.js';
import Engine3DAdapter          from '../shared/Engine3DAdapter.js';
import Renderer3D               from '../shared/Renderer3D.js';
import Camera3DController,
       { CameraMode }           from '../shared/Camera3DController.js';
import Physics3DWorld, { BodyType, ShapeType } from '../shared/Physics3DWorld.js';
import PaletteManager           from '../shared/PaletteManager.js';
import AssetLoader3D            from '../shared/AssetLoader3D.js';
import Input3D                  from '../shared/Input3D.js';
import AudioSpatial3D           from '../shared/AudioSpatial3D.js';
import Raycast3D,
       { LayerMask }            from '../shared/Raycast3D.js';
import SkyboxSystem             from '../shared/SkyboxSystem.js';
import ThirdPersonCamera        from './ThirdPersonCamera.js';
import PlatformerPhysics3D      from './PlatformerPhysics3D.js';
import CharacterController3D, { MoveState } from './CharacterController3D.js';
import PlayerCharacter3D        from './PlayerCharacter3D.js';
import CollectibleSystem3D      from './CollectibleSystem3D.js';
import CheckpointSystem3D       from './CheckpointSystem3D.js';
import {
    serializeSavePayload3D,
    deserializeSavePayload3D,
    serialize3DPlayerState,
    deserialize3DPlayerState,
} from '../shared/Save3D.js';
import EnemyPlatformer3D, { EnemyState } from './EnemyPlatformer3D.js';
import VFX_Platformer3D              from './VFX_Platformer3D.js';

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
        this.skybox         = null;   // SkyboxSystem

        // ── Engine-specific systems (Phase 43-50, lazy-loaded) ─────────────
        this.thirdPersonCam = null;   // ThirdPersonCamera   (Phase 43) — set in init()
        this.platformerPhys = null;   // PlatformerPhysics3D (Phase 44) — set in init()
        this.charController = null;   // CharacterController3D (Phase 45) — set in init()
        this.playerChar     = null;   // PlayerCharacter3D   (Phase 46) — set in init()
        this.collectibles   = null;   // CollectibleSystem3D (Phase 47) — set in init()
        this.checkpoints    = null;   // CheckpointSystem3D  (Phase 48) — set in init()
        this.enemies        = null;   // EnemyPlatformer3D   (Phase 49) — set in init()
        this.vfx            = null;   // VFX_Platformer3D    (Phase 50) — set in init()

        // Checkpoint / respawn state ─────────────────────────────────────
        this._checkpoint    = null;   // { position: THREE.Vector3, state: {} }
        this._deathY        = -999;   // safe default until level loads
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

        // ── TextureAtlas3D (optional) ─────────────────────────────────────
        this._atlas          = null;
        this._tilesetEnabled = false;

        // ── Runtime world data derived from platformer level payload ───────
        this._worldCollisionMeshes = [];
        this._worldPhysicsBodies = [];
    }

    // ── Engine type ───────────────────────────────────────────────────────────
    get engineType3D() { return 'platformer-3d'; }

    // ── TextureAtlas3D ────────────────────────────────────────────────────────

    /**
     * Load TextureAtlas3D and enable atlas mode for block meshes.
     * @param {object} [THREE_in]  THREE module reference
     */
    async enableTileset(THREE_in) {
        const T = THREE_in || (typeof THREE !== 'undefined' ? THREE : null);
        if (!T) { console.warn('[Platformer3D] enableTileset: THREE not available'); return; }
        const { default: TextureAtlas3D } = await import('/engines/shared/TextureAtlas3D.js');
        this._atlas = new TextureAtlas3D();
        await this._atlas.loadAsync(T);
        this._tilesetEnabled = true;
        console.log('[Platformer3D] Tileset enabled');
    }

    /** Revert block meshes to solid-color mode. */
    disableTileset() {
        this._tilesetEnabled = false;
        this._atlas          = null;
        console.log('[Platformer3D] Tileset disabled');
    }

    /** @returns {boolean} */
    isTilesetEnabled() { return this._tilesetEnabled; }

    /**
     * Build a BoxGeometry mesh for a platformer block type with atlas UVs or a solid fallback.
     * Platformer platform type → atlas block type mapping:
     *   flat/slope → 'flat', moving → 'moving', bouncy → 'bouncy',
     *   icy → 'icy', lava → 'lava_pf', crate → 'crate_pf'
     * @param {string} platType  'flat'|'slope'|'moving'|'bouncy'|'icy'|'lava'|'crate'
     * @param {number} w,h,d  dimensions in metres
     * @param {object} [T]    THREE module
     * @returns {THREE.Mesh}
     */
    buildAtlasBlockMesh(platType, w, h, d, T) {
        T = T || (typeof THREE !== 'undefined' ? THREE : null);
        if (!T) return null;
        const atlasType = { flat:'flat', slope:'flat', moving:'moving',
                            bouncy:'bouncy', icy:'icy', lava:'lava_pf', crate:'crate_pf' }[platType] || 'flat';
        const geo = new T.BoxGeometry(w, h, d);
        let mat;
        if (this._tilesetEnabled && this._atlas) {
            this._atlas.applyBlockUVs(geo, atlasType);
            mat = this._atlas.getMaterial(T);
        } else {
            mat = new T.MeshLambertMaterial({ color: 0x888888, flatShading: true });
        }
        const mesh = new T.Mesh(geo, mat);
        mesh.castShadow    = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Initialization
    // ─────────────────────────────────────────────────────────────────────────

    async init() {
        // 1. Shared systems from base phases
        this.renderer3d = new Renderer3D(this.container, {
            antialias: true,
            pixelRatio: Math.min(window.devicePixelRatio, 2),
            postProcess: ['outline', 'cel'],
        });
        await this.renderer3d.init();

        this.scene = this.renderer3d.scene;
        this.THREE = this.renderer3d.THREE;

        this.camera3d = new Camera3DController(this.renderer3d.camera, this.container);
        this.camera3d.setMode(CameraMode.THIRD_PERSON);

        this.physics = new Physics3DWorld({ gravity: [0, -20, 0], fixedStep: FIXED_STEP });
        await this.physics.init();

        this.palette  = new PaletteManager();
        this.assets   = new AssetLoader3D(this.scene, this.palette);
        this.input    = new Input3D(this.container);
        this.audio    = new AudioSpatial3D(this.camera3d.camera);
        this.raycaster= new Raycast3D(this.scene, this.camera3d.camera);

        // ── Skybox ─────────────────────────────────────────────────────────
        this.skybox = new SkyboxSystem(this.scene);
        this.skybox.setGradient('#1a3a6a', '#ffffff'); // bright platformer sky

        // ── Default Lighting ───────────────────────────────────────────────
        const amb = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(amb);
        const sun = new THREE.DirectionalLight(0xffffff, 1.5);
        sun.position.set(30, 60, 30);
        sun.castShadow = true;
        this.scene.add(sun);

        await this.input.init();

        // Third-person camera
        this.thirdPersonCam = new ThirdPersonCamera(
            this.camera3d,
            this.renderer3d.scene,
            this.container,
            { distance: 6, pivotHeight: 1.2, autoRotate: true }
        );
        this.thirdPersonCam.attach();

        // Platformer physics layer
        this.platformerPhys = new PlatformerPhysics3D(this.physics, {
            gravity:    -20,
            airJumps:   1,
        });

        // Character controller
        this.charController = new CharacterController3D({
            physics:      this.physics,
            platformerPhys: this.platformerPhys,
            input:        this.input,
            audio:        this.audio,
            camera3d:     this.camera3d,
        });
        await this.charController.init();

        // Give camera the proxy mesh to follow
        this.thirdPersonCam.setTarget(this.charController.getMesh());

        // Wire character callbacks
        this.charController.onLanded = (speed) => {
            if (speed > 8) this.vfx?.landDust?.(this.charController.getPosition());
        };
        this.charController.onDashStart = (dir) => {
            this._invincFrames = Math.max(this._invincFrames, 20);
            const pos = this.charController.getPosition();
            if (pos) this.vfx?.dashTrailPoint?.(pos);
        };
        this.charController.onGroundPound = (pos, force) => {
            if (pos) this.vfx?.groundPoundImpact?.(pos);
            this.enemies?.onShockwave?.(pos, force);
        };
        this.charController.onWallJump = (normal) => {
            const pos = this.charController.getPosition();
            if (pos && normal) this.vfx?.wallJumpSparks?.(pos, normal);
        };

        // Player character (low-poly model + animation)
        this.playerChar = new PlayerCharacter3D({
            scene:          this.renderer3d.scene,
            assets:         this.assets,
            palette:        this.palette,
            charController: this.charController,
            audio:          this.audio,
        });
        await this.playerChar.init();

        // Wire player character callbacks
        this.playerChar.onDeath = () => {
            this.vfx?.spawnDeathExplosion?.(this.charController.getPosition());
            setTimeout(() => this._triggerDeath(), 800);
        };
        this.playerChar.onHurt = (hp) => {
            this._health = hp;
        };

        // Collectible system
        this.collectibles = new CollectibleSystem3D({
            scene:        this.renderer3d.scene,
            camera:       this.camera3d.camera,
            palette:      this.palette,
            audio:        this.audio,
        });
        this.collectibles.onCoinCollected = (total, pos) => {
            this._coins = total;
            if (pos) this.vfx?.coinBurst?.(pos);
        };
        this.collectibles.onScoreChanged  = (score) => { this._score = score; };
        this.collectibles.onPowerUp       = (type)  => { this._handlePowerUp(type); };

        // Checkpoint system
        this.checkpoints = new CheckpointSystem3D({
            scene:   this.renderer3d.scene,
            palette: this.palette,
            audio:   this.audio,
        });
        this.checkpoints.onCheckpointActivated = (id, pos) => {
            this.setCheckpoint(pos, { coins: this._coins, score: this._score });
            this.vfx?.flashCheckpoint?.();
        };
        this.checkpoints.onPlayerDeath = () => { this._triggerDeath(); };
        this.checkpoints.onLevelComplete = (stats) => {
            this.levelComplete({ ...stats, coins: this.collectibles.coins, score: this.collectibles.score });
        };

        // Enemy system
        this.enemies = new EnemyPlatformer3D({
            scene:   this.renderer3d.scene,
            physics: this.physics,
            assets:  this.assets,
            palette: this.palette,
            audio:   this.audio,
        });
        this.enemies.setPlayerRef(this.charController);
        this.enemies.onEnemyDied = (id) => {
            // Bounce player up on stomp
            if (this.platformerPhys?._body) {
                this.platformerPhys._body.velocity.y = 8;
            }
            this._score += 100;
        };
        this.enemies.onPlayerHit = (damage) => {
            this.playerChar?.takeDamage?.(damage);
            this.vfx?.flashInvincible?.();
        };

        // VFX system (Phase 50)
        const hudEl = document.getElementById('hud');
        this.vfx = new VFX_Platformer3D({
            scene:        this.renderer3d.scene,
            palette:      this.palette?.colors ?? null,
            hudContainer: hudEl ?? null,
        });
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
        await this._hydrateLevel(data, levelId);
    }

    async loadLevelFromData(data, levelId = null) {
        await this._hydrateLevel(data, levelId);
    }

    _buildRuntimeLevelData(data = {}) {
        const runtimeLevel = { ...data, engineType: 'platformer-3d' };

        // Platformer payload uses sky/topColor indexes; Engine3DAdapter expects skybox.
        if (!runtimeLevel.skybox) {
            const top = runtimeLevel.sky?.topColor;
            if (typeof top === 'number') {
                runtimeLevel.skybox = { type: 'solid', top_index: top };
            } else if (typeof top === 'string' && top.trim()) {
                runtimeLevel.skybox = { type: 'solid', colorHex: top };
            }
        }

        const sourceLights = Array.isArray(runtimeLevel.lights) ? runtimeLevel.lights : [];
        const normalizedLights = sourceLights.map((light) => ({
            ...light,
            position: Array.isArray(light?.position)
                ? light.position
                : [Number(light?.position?.x ?? 0), Number(light?.position?.y ?? 10), Number(light?.position?.z ?? 0)],
            target: light?.target == null
                ? light?.target
                : (Array.isArray(light.target)
                    ? light.target
                    : [Number(light?.target?.x ?? 0), Number(light?.target?.y ?? 0), Number(light?.target?.z ?? 0)]),
        }));

        const hasAmbient = normalizedLights.some((light) => String(light?.type || '').toLowerCase() === 'ambient');
        if (!hasAmbient) {
            const ambient = runtimeLevel.ambientLight ?? {};
            normalizedLights.unshift({
                id: '__platformer_ambient__',
                type: 'ambient',
                colorHex: ambient.color ?? '#ffffff',
                intensity: Number(ambient.intensity ?? 0.5),
            });
        }
        runtimeLevel.lights = normalizedLights;

        if (!Array.isArray(runtimeLevel.geometry) || runtimeLevel.geometry.length === 0) {
            const platforms = Array.isArray(runtimeLevel.platforms) ? runtimeLevel.platforms : [];
            runtimeLevel.geometry = platforms.map((platform, idx) => this._platformToGeometry(platform, idx));
        }

        return runtimeLevel;
    }

    _platformToGeometry(platform, index) {
        const w = Math.max(0.1, Number(platform?.w ?? platform?.width ?? 2));
        const h = Math.max(0.1, Number(platform?.h ?? platform?.height ?? 1));
        const d = Math.max(0.1, Number(platform?.d ?? platform?.depth ?? 2));
        const x = Number(platform?.x ?? 0);
        const y = Number(platform?.y ?? 0) + h * 0.5;
        const z = Number(platform?.z ?? 0);
        const [qx, qy, qz, qw] = this._platformRotationToQuaternion(platform?.rot ?? platform?.rotation);
        const friction = Number(platform?.friction);
        const restitution = Number(platform?.restitution);

        return {
            id: platform?.id || `platform_${index}`,
            type: platform?.blockType || platform?.subtype || 'mesh',
            width: w,
            height: h,
            depth: d,
            position: [x, y, z],
            rotation: [qx, qy, qz, qw],
            scale: [1, 1, 1],
            palette_index: Number.isFinite(platform?.colorIdx) ? platform.colorIdx : 122,
            colorHex: platform?.colorHex || null,
            textureId: platform?.textureId || null,
            castShadow: true,
            receiveShadow: true,
            _friction: Number.isFinite(friction) ? friction : undefined,
            _restitution: Number.isFinite(restitution) ? restitution : undefined,
        };
    }

    _platformRotationToQuaternion(rotation) {
        if (Array.isArray(rotation) && rotation.length === 4) {
            return [
                Number(rotation[0] ?? 0),
                Number(rotation[1] ?? 0),
                Number(rotation[2] ?? 0),
                Number(rotation[3] ?? 1),
            ];
        }

        const THREE = this.renderer3d?.THREE;
        if (!THREE) return [0, 0, 0, 1];

        const toRadians = (value) => {
            const n = Number(value ?? 0);
            if (!Number.isFinite(n)) return 0;
            return Math.abs(n) > (Math.PI * 2 + 1e-6) ? n * Math.PI / 180 : n;
        };

        const rx = Array.isArray(rotation) ? rotation[0] : rotation?.x;
        const ry = Array.isArray(rotation) ? rotation[1] : rotation?.y;
        const rz = Array.isArray(rotation) ? rotation[2] : rotation?.z;

        const euler = new THREE.Euler(toRadians(rx), toRadians(ry), toRadians(rz), 'XYZ');
        const q = new THREE.Quaternion().setFromEuler(euler);
        return [q.x, q.y, q.z, q.w];
    }

    _rebuildCollisionWorld(runtimeLevel) {
        if (this.physics?.world && typeof this.physics.removeBody === 'function') {
            for (const body of this._worldPhysicsBodies) {
                this.physics.removeBody(body);
            }
        }
        this._worldPhysicsBodies = [];

        const meshes = [];
        const geometryDefs = Array.isArray(runtimeLevel?.geometry) ? runtimeLevel.geometry : [];

        for (const def of geometryDefs) {
            const mesh = def?.id ? this.getLevelObject(def.id) : null;
            if (!mesh || !mesh.isMesh) continue;
            meshes.push(mesh);

            if (!this.physics?.world || typeof this.physics.createBody !== 'function') continue;

            const width = Math.max(0.1, Number(def.width ?? 1));
            const height = Math.max(0.1, Number(def.height ?? 1));
            const depth = Math.max(0.1, Number(def.depth ?? 1));

            const body = this.physics.createBody({
                type: BodyType.STATIC,
                shape: ShapeType.BOX,
                size: { x: width * 0.5, y: height * 0.5, z: depth * 0.5 },
                position: {
                    x: Number(def.position?.[0] ?? mesh.position.x),
                    y: Number(def.position?.[1] ?? mesh.position.y),
                    z: Number(def.position?.[2] ?? mesh.position.z),
                },
                friction: Number.isFinite(def._friction) ? def._friction : 0.7,
                restitution: Number.isFinite(def._restitution) ? def._restitution : 0.05,
            });

            if (body?.body && Array.isArray(def.rotation) && def.rotation.length === 4) {
                body.body.quaternion.set(
                    Number(def.rotation[0] ?? 0),
                    Number(def.rotation[1] ?? 0),
                    Number(def.rotation[2] ?? 0),
                    Number(def.rotation[3] ?? 1),
                );
                body.body.aabbNeedsUpdate = true;
            }

            this._worldPhysicsBodies.push(body);
        }

        this._worldCollisionMeshes = meshes;
        this.charController?.setCollisionMeshes?.(meshes);
        this.thirdPersonCam?.setCollisionMeshes?.(meshes);
        this.playerChar?.setCollisionMeshes?.(meshes);
    }

    async _hydrateLevel(data, levelId = null) {
        // Use Engine3DAdapter's level lifecycle path so unload/reload stays consistent.
        const resolvedLevelId = levelId || data?.id || data?.levelId || this._levelId || 'level01';
        const runtimeLevel = this._buildRuntimeLevelData(data);
        await this.loadLevel3D(runtimeLevel);
        this._rebuildCollisionWorld(runtimeLevel);
        this._levelId = resolvedLevelId;

        // Read platformer-specific fields
        this._deathY = data.deathY ?? -20;

        // Clear and re-hydrate systems for new level
        this.checkpoints?.clear?.();
        this.collectibles?.clear?.();
        this.collectibles?.resetScore?.();

        // v2.0: checkpoints[] array takes precedence over embedded entities
        if (this.checkpoints) {
            // Merge v2.0 checkpoints[] into the data structure expected by spawnFromLevelData
            if (Array.isArray(data.checkpoints) && data.checkpoints.length > 0) {
                const merged = { ...data };
                // Convert {id, pos:{x,y,z}, yaw} → {id, x, y, z}
                merged.checkpoints = data.checkpoints.map(cp => ({
                    id: cp.id,
                    x: cp.pos?.x ?? cp.x ?? 0,
                    y: cp.pos?.y ?? cp.y ?? 0,
                    z: cp.pos?.z ?? cp.z ?? 0,
                    yaw: cp.yaw || 0,
                }));
                this.checkpoints.spawnFromLevelData(merged);
            } else {
                this.checkpoints.spawnFromLevelData(data);
            }
            this._deathY = this.checkpoints.deathY;
        }

        // Spawn collectibles — v2.0 uses collectibles[], legacy uses entities[]
        if (this.collectibles) {
            const colEntities = [];
            // v2.0 collectibles[]
            if (Array.isArray(data.collectibles)) {
                data.collectibles.forEach(c => colEntities.push({
                    type: c.type || 'coin',
                    x: c.pos?.x ?? c.x ?? 0,
                    y: c.pos?.y ?? c.y ?? 0,
                    z: c.pos?.z ?? c.z ?? 0,
                    ...c.config,
                }));
            }
            // Legacy entities[] (coins/stars/powerups that aren't enemies)
            if (Array.isArray(data.entities)) {
                const collectibleTypes = new Set(['coin', 'star', 'key', 'powerup', 'coin_trail_arc']);
                data.entities.filter(e => collectibleTypes.has(e.type)).forEach(e => colEntities.push(e));
            }
            if (colEntities.length) this.collectibles.spawnFromLevelData(colEntities);
        }

        // Spawn enemies from entity list
        if (this.enemies && data.entities?.length) {
            this.enemies.clear();
            await this.enemies.loadFromLevel(data);
        }

        // Place player at spawn
        this._respawn();

        this.onLevelReady?.(data);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Game loop
    // ─────────────────────────────────────────────────────────────────────────

    _startLoop() {
        if (this.isRunning) return;
        this.isRunning = true;
        let last = performance.now();

        const tick = (now) => {
            if (!this.isRunning) return;
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

    _stopLoop() {
        this.isRunning = false;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    /** Fixed-step update — physics, character controller, collision */
    _fixedUpdate(dt) {
        this.physics?.step(dt);
        this.charController?.fixedUpdate?.(dt);
        this.platformerPhys?.fixedUpdate?.(dt);
    }

    /** Variable-step update — camera, VFX, audio, HUD */
    _update(dt) {
        const inputState = this._buildInputState();

        // Update game systems (stub-safe null checks throughout)
        this.charController?.update?.(dt, inputState);
        this.playerChar?.update?.(dt);
        this.thirdPersonCam?.update?.(dt, this._getPlayerPosition());
        if (inputState.camShoulderSwap && !this._prevShoulderSwap) this.thirdPersonCam?.swapShoulder?.();
        this._prevShoulderSwap = !!inputState.camShoulderSwap;
        this.camera3d?.update?.(dt);
        this.skybox?.update?.(this.renderer3d.camera);
        this.collectibles?.update?.(dt, this._getPlayerPosition());
        this.checkpoints?.update?.(dt, this._getPlayerPosition());
        this.enemies?.update?.(dt);
        this.vfx?.update?.(dt);

        // Jump dust on takeoff (rising edge of jump action while was-grounded)
        if (inputState.jump && !this._prevJumpInput) {
            const charPos = this._getPlayerPosition();
            if (charPos) this.vfx?.jumpDust?.(charPos);
        }
        this._prevJumpInput = !!inputState.jump;

        this.audio?.update?.(dt, this.camera3d?.camera);

        // Invincibility countdown
        if (this._invincFrames > 0) this._invincFrames--;

        // Death plane check
        const pos = this._getPlayerPosition();
        if (pos && pos.y < this._deathY && !this._respawning) {
            this._triggerDeath();
        }
    }

    _buildInputState() {
        if (!this.input) return {};

        this.input.update?.();

        const axis = this.input.getAxis?.() ?? { x: 0, y: 0 };
        const look = this.input.getLookAxis?.() ?? { x: 0, y: 0 };

        const moveForward = axis.y < -0.1 || !!this.input.isAction?.('moveForward');
        const moveBack = axis.y > 0.1
            || !!this.input.isAction?.('moveBackward')
            || !!this.input.isAction?.('moveBack');

        return {
            moveLeft: axis.x < -0.1 || !!this.input.isAction?.('moveLeft'),
            moveRight: axis.x > 0.1 || !!this.input.isAction?.('moveRight'),
            moveForward,
            moveBackward: moveBack,
            moveBack,
            jump: !!this.input.isAction?.('jump'),
            dash: !!this.input.isAction?.('dash'),
            groundPound: !!this.input.isAction?.('groundPound'),
            camRight: look.x > 0.001,
            camLeft: look.x < -0.001,
            camUp: look.y < -0.001,
            camDown: look.y > 0.001,
            camShoulderSwap: !!this.input.isAction?.('camShoulderSwap'),
        };
    }

    /** Render */
    _render() {
        this.renderer3d?.render?.(FIXED_STEP);
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
        this.vfx?.flashDeath?.();
        setTimeout(() => this._respawn(), 1200);
    }

    _respawn() {
        const cpPos = this.checkpoints?.getActiveCPPosition?.() ?? this._checkpoint?.position;
        const pos   = cpPos ?? { x: 0, y: 2, z: 0 };
        this._setPlayerPosition(pos.x, pos.y, pos.z);
        this._health       = 3;
        this._invincFrames = INVINCIBILITY_FRAMES;
        this._respawning   = false;
        this.platformerPhys?.resetVelocity?.();
        this.playerChar?.revive?.();
    }

    _gameOver() {
        this._stopLoop();
        this.onGameOver?.();
    }

    /** Called by CheckpointSystem3D when the player reaches the level exit */
    levelComplete(stats = {}) {
        this._stopLoop();
        this.vfx?.flashComplete?.();
        this.onLevelComplete?.({ coins: this._coins, score: this._score, ...stats });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Input bindings
    // ─────────────────────────────────────────────────────────────────────────

    _bindInputActions() {
        if (!this.input?.loadActionMap) return;
        this.input.loadActionMap({
            moveLeft:    ['KeyA', 'ArrowLeft'],
            moveRight:   ['KeyD', 'ArrowRight'],
            moveForward: ['KeyW', 'ArrowUp'],
            moveBackward:['KeyS', 'ArrowDown'],
            jump:        ['Space'],
            dash:        ['ShiftLeft', 'ShiftRight'],
            groundPound: ['ControlLeft', 'ControlRight'],
            camShoulderSwap: ['KeyQ'],
        }, true);
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

    async saveGame(slot = this.saveSlot) {
        if (!this.username) return;
        const payload = this._buildSavePayload();
        const res = await fetch(
            `/api/save/${encodeURIComponent(this.username)}/${slot}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );
        if (!res.ok) throw new Error(`Save failed: ${res.status}`);
        console.log(`[Platformer3D] Game saved: slot ${slot}`);
    }

    async loadGame(slot = this.saveSlot) {
        if (!this.username) return;
        const res = await fetch(`/api/save/${encodeURIComponent(this.username)}/${slot}`);
        if (!res.ok) return;
        const raw = await res.json();
        await this._applySavePayload(raw);
        console.log(`[Platformer3D] Game loaded: slot ${slot}`);
    }

    _buildSavePayload() {
        const playerMesh = this.charController
            ? { position: this.charController.getPosition?.() ?? { x:0, y:0, z:0 },
                quaternion: this.playerChar?.mesh?.quaternion ?? null,
                _velocity:  this.charController._velocity ?? null }
            : null;
        const cpPos = this.checkpoints?.getActiveCPPosition?.() ?? this._checkpoint?.position ?? null;
        return serializeSavePayload3D('platformer-3d', {
            version:  this.version,
            project:  this.currentProject,
            levelId:  this._levelId,
            player:   serialize3DPlayerState(playerMesh, {
                hp:    this._health,
                lives: this._lives,
                coins: this._coins,
                score: this._score,
            }),
            lastCheckpoint: cpPos
                ? { id: this.checkpoints?.getActiveCPId?.() ?? null,
                    position: [cpPos.x ?? cpPos[0], cpPos.y ?? cpPos[1], cpPos.z ?? cpPos[2]] }
                : null,
            // IDs of collectibles already picked up in the current level
            collectedItems: this.collectibles?.getCollectedIds?.() ?? [],
            levelState: {
                levelId: this._levelId,
            },
        });
    }

    async _applySavePayload(raw) {
        const data = deserializeSavePayload3D(raw, 'platformer-3d');
        if (!data) return; // schema mismatch or 2D save

        if (data.project && data.levelId) {
            await this.loadProject(data.project, data.levelId);
        }

        const ps = deserialize3DPlayerState(data.player);
        if (ps) {
            if (ps.hp    !== undefined) this._health = ps.hp;
            if (ps.lives !== undefined) this._lives  = ps.lives;
            if (ps.coins !== undefined) this._coins  = ps.coins;
            if (ps.score !== undefined) this._score  = ps.score;
        }

        // Restore checkpoint position so player respawns correctly
        const cp = data.lastCheckpoint;
        if (cp?.position) {
            this._checkpoint = {
                position: { x: cp.position[0], y: cp.position[1], z: cp.position[2] },
                state:    { coins: this._coins, score: this._score },
            };
        }

        // Mark already-collected items so they don't respawn
        if (Array.isArray(data.collectedItems) && this.collectibles?.markCollected) {
            for (const id of data.collectedItems) this.collectibles.markCollected(id);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Engine3DAdapter overrides
    // ─────────────────────────────────────────────────────────────────────────

    onLevelLoaded(level) {
        // Called by Engine3DAdapter after geometry/entities/lights are placed.
        // Engine-specific hydration happens here (Phase 43+).
    }

    onLevelUnloaded() {
        if (this.physics?.world && typeof this.physics.removeBody === 'function') {
            for (const body of this._worldPhysicsBodies) {
                this.physics.removeBody(body);
            }
        }
        this._worldPhysicsBodies = [];
        this._worldCollisionMeshes = [];
        this.charController?.setCollisionMeshes?.([]);
        this.thirdPersonCam?.setCollisionMeshes?.([]);
        this.playerChar?.setCollisionMeshes?.([]);

        this.collectibles?.clear?.();
        this.enemies?.clear?.();
        this.vfx?.clear?.();
        this._checkpoint = null;
    }

    _handlePowerUp(type) {
        switch (type) {
            case 'invincible':
                this._invincFrames = 600;   // 10 s
                this.playerChar?.setInvincible?.(600);
                break;
            case 'doublejump':
                if (this.platformerPhys) this.platformerPhys._maxAirJumps = 2;
                setTimeout(() => { if (this.platformerPhys) this.platformerPhys._maxAirJumps = 1; }, 15000);
                break;
            case 'speed':
                if (this.charController) this.charController._runSpeed = 14;
                setTimeout(() => { if (this.charController) this.charController._runSpeed = 8; }, 10000);
                break;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Destroy
    // ─────────────────────────────────────────────────────────────────────────

    destroy() {
        this._stopLoop();
        this.charController?.destroy?.();
        this.playerChar?.destroy?.();
        this.thirdPersonCam?.destroy?.();
        this.platformerPhys?.destroy?.();
        this.collectibles?.destroy?.();
        this.checkpoints?.destroy?.();
        this.enemies?.destroy?.();
        this.vfx?.destroy?.();
        this.renderer3d?.dispose?.();
        this.physics?.dispose?.();
        this.audio?.dispose?.();
        this.input?.dispose?.();
    }
}

// ── Global export ─────────────────────────────────────────────────────────────
export default Platformer3DGame;
window.Platformer3DGame = Platformer3DGame;
