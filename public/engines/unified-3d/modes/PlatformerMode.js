/**
 * PlatformerMode.js — 3D Platformer mode module for Unified3DGame.
 *
 * Wraps all Platformer-specific systems (ThirdPersonCamera, PlatformerPhysics3D,
 * CharacterController3D, PlayerCharacter3D, CollectibleSystem3D,
 * CheckpointSystem3D, EnemyPlatformer3D, VFX_Platformer3D) and plugs them
 * into Game3DCore's lifecycle via ModeInterface.
 *
 * Includes platform-to-geometry conversion and checkpoint/respawn logic
 * ported from platformer-3d/main.js.
 */

import * as THREE from '/lib/three/three.module.js';
import ModeInterface from '../ModeInterface.js';
import { CameraMode } from '../../shared/Camera3DController.js';
import { BodyType, ShapeType } from '../../shared/Physics3DWorld.js';
import TerrainRuntime3D, { normalizeTerrainLevel } from '../TerrainRuntime3D.js';
import VehicleSystem3D from '../VehicleSystem3D.js';
import {
    serializeSavePayload3D,
    deserializeSavePayload3D,
    serialize3DPlayerState,
    deserialize3DPlayerState,
} from '../../shared/Save3D.js';

// Platformer-specific subsystems (still live in engines/platformer-3d/)
import ThirdPersonCamera    from '../../3d/systems/ThirdPersonCamera.js';
import PlatformerPhysics3D  from '../../3d/systems/PlatformerPhysics3D.js';
import CharacterController3D, { MoveState } from '../../3d/systems/CharacterController3D.js';
import PlayerCharacter3D    from '../../3d/systems/PlayerCharacter3D.js';
import CollectibleSystem3D  from '../../3d/systems/CollectibleSystem3D.js';
import CheckpointSystem3D   from '../../3d/systems/CheckpointSystem3D.js';
import EnemyPlatformer3D, { EnemyState } from '../../3d/systems/EnemyPlatformer3D.js';
import VFX_Platformer3D     from '../../3d/systems/VFX_Platformer3D.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_LIVES            = 3;
const INVINCIBILITY_FRAMES = 90;   // ~1.5 s at 60 fps
const FIXED_STEP           = 1 / 60;

// ── PlatformerMode ────────────────────────────────────────────────────────────

export default class PlatformerMode extends ModeInterface {

    constructor() {
        super();

        // ── Platformer-specific systems ───────────────────────────────────
        this.thirdPersonCam  = null;   // ThirdPersonCamera
        this.platformerPhys  = null;   // PlatformerPhysics3D
        this.charController  = null;   // CharacterController3D
        this.playerChar      = null;   // PlayerCharacter3D
        this.collectibles    = null;   // CollectibleSystem3D
        this.checkpoints     = null;   // CheckpointSystem3D
        this.enemies         = null;   // EnemyPlatformer3D
        this.vfx             = null;   // VFX_Platformer3D
        this.terrainRuntime  = null;   // Shared playable terrain
        this.vehicles        = null;   // Shared vehicles

        // ── Player state ──────────────────────────────────────────────────
        this._lives          = MAX_LIVES;
        this._health         = 3;
        this._coins          = 0;
        this._score          = 0;
        this._invincFrames   = 0;
        this._checkpoint     = null;
        this._deathY         = -999;
        this._respawning     = false;

        // ── Input state ───────────────────────────────────────────────────
        this._prevJumpInput      = false;
        this._prevShoulderSwap   = false;

        // ── Runtime collision data ────────────────────────────────────────
        this._worldCollisionMeshes = [];
        this._worldPhysicsBodies   = [];

        // ── TextureAtlas (optional) ───────────────────────────────────────
        this._atlas          = null;
        this._tilesetEnabled = false;

        // ── Callbacks for external use ────────────────────────────────────
        this.onLifeLost      = null;
        this.onGameOver      = null;
        this.onLevelComplete = null;
    }

    // ── Identity ──────────────────────────────────────────────────────────────

    get modeId() { return 'platformer-3d'; }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async onInit(game) {
        await super.onInit(game);

        const { scene, renderer3d, camera3d, physics, palette,
                assets, input, audio, raycast, skybox, container } = game;

        // Camera mode
        camera3d.setMode(CameraMode.THIRD_PERSON);

        // Bright platformer sky
        skybox.setGradient('#1a3a6a', '#ffffff');

        // ── Default Lighting ──────────────────────────────────────────────
        const amb = new THREE.AmbientLight(0xffffff, 0.45);
        scene.add(amb);
        const fill = new THREE.HemisphereLight(0xddefff, 0x4a3828, 0.65);
        fill.name = '__softFillLight';
        scene.add(fill);
        const sun = new THREE.DirectionalLight(0xfff4dc, 1.25);
        sun.position.set(30, 60, 30);
        sun.castShadow = true;
        sun.shadow?.mapSize?.set?.(1024, 1024);
        scene.add(sun);

        // ── Input ─────────────────────────────────────────────────────────
        await input.init?.();
        this._bindInputActions(input);

        // ── Third-person camera ───────────────────────────────────────────
        this.thirdPersonCam = new ThirdPersonCamera(
            camera3d, scene, container,
            { distance: 6, pivotHeight: 1.2, autoRotate: true }
        );
        this.thirdPersonCam.attach();

        // ── Platformer physics layer ──────────────────────────────────────
        this.platformerPhys = new PlatformerPhysics3D(physics, {
            gravity:  -20,
            airJumps: 1,
        });

        this.terrainRuntime = new TerrainRuntime3D(game);
        this.vehicles = new VehicleSystem3D(game);

        // ── Character controller ──────────────────────────────────────────
        this.charController = new CharacterController3D({
            physics,
            platformerPhys: this.platformerPhys,
            input,
            audio,
            camera3d,
        });
        await this.charController.init();

        // Give camera the proxy mesh to follow
        this.thirdPersonCam.setTarget(this.charController.getMesh());

        // ── Character callbacks ───────────────────────────────────────────
        this.charController.onLanded = (speed) => {
            if (speed > 8) this.vfx?.landDust?.(this.charController.getPosition());
        };
        this.charController.onDashStart = (_dir) => {
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

        // ── Player character (low-poly model + animation) ─────────────────
        this.playerChar = new PlayerCharacter3D({
            scene,
            assets,
            palette,
            charController: this.charController,
            audio,
        });
        await this.playerChar.init();

        this.playerChar.onDeath = () => {
            this.vfx?.spawnDeathExplosion?.(this.charController.getPosition());
            setTimeout(() => this._triggerDeath(), 800);
        };
        this.playerChar.onHurt = (hp) => {
            this._health = hp;
        };

        // ── Collectibles ──────────────────────────────────────────────────
        this.collectibles = new CollectibleSystem3D({
            scene,
            camera: camera3d.camera,
            palette,
            audio,
        });
        this.collectibles.onCoinCollected = (total, pos) => {
            this._coins = total;
            if (pos) this.vfx?.coinBurst?.(pos);
        };
        this.collectibles.onScoreChanged = (score) => { this._score = score; };
        this.collectibles.onPowerUp      = (type)  => { this._handlePowerUp(type); };

        // ── Checkpoints ───────────────────────────────────────────────────
        this.checkpoints = new CheckpointSystem3D({
            scene,
            palette,
            audio,
        });
        this.checkpoints.onCheckpointActivated = (_id, pos) => {
            this.setCheckpoint(pos, { coins: this._coins, score: this._score });
            this.vfx?.flashCheckpoint?.();
        };
        this.checkpoints.onPlayerDeath   = () => { this._triggerDeath(); };
        this.checkpoints.onLevelComplete = (stats) => {
            this._levelComplete(stats);
        };

        // ── Enemies ───────────────────────────────────────────────────────
        this.enemies = new EnemyPlatformer3D({
            scene,
            physics,
            assets,
            palette,
            audio,
        });
        this.enemies.setPlayerRef(this.charController);
        this.enemies.onEnemyDied = (_id) => {
            if (this.platformerPhys?._body) {
                this.platformerPhys._body.velocity.y = 8;
            }
            this._score += 100;
        };
        this.enemies.onPlayerHit = (damage) => {
            this.playerChar?.takeDamage?.(damage);
            this.vfx?.flashInvincible?.();
        };

        // ── VFX ───────────────────────────────────────────────────────────
        const hudEl = document.getElementById('hud');
        this.vfx = new VFX_Platformer3D({
            scene,
            palette:      palette?.colors ?? null,
            hudContainer: hudEl ?? null,
        });

        console.log('[PlatformerMode] onInit() complete');
    }

    // ── Level lifecycle ───────────────────────────────────────────────────────

    async onLevelLoaded(level) {
        const playableLevel = this.terrainRuntime?.load(level) ?? normalizeTerrainLevel(level);

        // Build runtime level data with geometry + lights
        const runtimeLevel = this._buildRuntimeLevelData(playableLevel);

        // Rebuild collision world from geometry
        this._rebuildCollisionWorld(runtimeLevel);
        this._appendTerrainCollisionMeshes();

        // Read platformer-specific fields
        this._deathY = playableLevel.deathY ?? -20;

        // Clear and re-hydrate systems for new level
        this.checkpoints?.clear?.();
        this.collectibles?.clear?.();
        this.collectibles?.resetScore?.();

        // Checkpoints
        if (this.checkpoints) {
            if (Array.isArray(playableLevel.checkpoints) && playableLevel.checkpoints.length > 0) {
                const merged = { ...playableLevel };
                merged.checkpoints = playableLevel.checkpoints.map(cp => ({
                    id:  cp.id,
                    x:   cp.pos?.x ?? cp.x ?? 0,
                    y:   cp.pos?.y ?? cp.y ?? 0,
                    z:   cp.pos?.z ?? cp.z ?? 0,
                    yaw: cp.yaw || 0,
                }));
                this.checkpoints.spawnFromLevelData(merged);
            } else {
                this.checkpoints.spawnFromLevelData(playableLevel);
            }
            this._deathY = this.checkpoints.deathY;
        }

        // Collectibles
        if (this.collectibles) {
            const colEntities = [];
            if (Array.isArray(playableLevel.collectibles)) {
                playableLevel.collectibles.forEach(c => colEntities.push({
                    type: c.type || 'coin',
                    x: c.pos?.x ?? c.x ?? 0,
                    y: c.pos?.y ?? c.y ?? 0,
                    z: c.pos?.z ?? c.z ?? 0,
                    ...c.config,
                }));
            }
            if (Array.isArray(playableLevel.entities)) {
                const collectibleTypes = new Set(['coin', 'star', 'key', 'powerup', 'coin_trail_arc']);
                playableLevel.entities.filter(e => collectibleTypes.has(e.type)).forEach(e => colEntities.push(e));
            }
            if (colEntities.length) this.collectibles.spawnFromLevelData(colEntities);
        }

        // Enemies
        if (this.enemies && playableLevel.entities?.length) {
            this.enemies.clear();
            await this.enemies.loadFromLevel(playableLevel);
        }

        this.vehicles?.load(playableLevel);

        // Place player at spawn
        this._respawn();
    }

    onLevelUnloaded() {
        // Clean up physics bodies
        if (this.game?.physics?.world && typeof this.game.physics.removeBody === 'function') {
            for (const body of this._worldPhysicsBodies) {
                this.game.physics.removeBody(body);
            }
        }
        this._worldPhysicsBodies   = [];
        this._worldCollisionMeshes = [];
        this.charController?.setCollisionMeshes?.([]);
        this.thirdPersonCam?.setCollisionMeshes?.([]);
        this.playerChar?.setCollisionMeshes?.([]);

        this.vehicles?.dispose();
        this.terrainRuntime?.dispose();
        this.collectibles?.clear?.();
        this.enemies?.clear?.();
        this.vfx?.clear?.();
        this._checkpoint = null;
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    update(dt) {
        const game = this.game;
        if (!game) return;

        const inputState = this._buildInputState(game.input);

        // Character controller
        this.charController?.update?.(dt, inputState);
        this.playerChar?.update?.(dt);
        this.terrainRuntime?.update(dt, game.gameTime);
        this.vehicles?.update(
            dt,
            game.input,
            this._getPlayerPosition(),
            (x, y, z) => this._setPlayerPosition(x, y, z),
        );

        // Third-person camera
        this.thirdPersonCam?.update?.(dt, this._getPlayerPosition());
        if (inputState.camShoulderSwap && !this._prevShoulderSwap) {
            this.thirdPersonCam?.swapShoulder?.();
        }
        this._prevShoulderSwap = !!inputState.camShoulderSwap;

        // Collectibles + checkpoints
        this.collectibles?.update?.(dt, this._getPlayerPosition());
        this.checkpoints?.update?.(dt, this._getPlayerPosition());

        // Enemies
        this.enemies?.update?.(dt);

        // VFX
        this.vfx?.update?.(dt);

        // Jump dust on takeoff
        if (inputState.jump && !this._prevJumpInput) {
            const charPos = this._getPlayerPosition();
            if (charPos) this.vfx?.jumpDust?.(charPos);
        }
        this._prevJumpInput = !!inputState.jump;

        // Invincibility countdown
        if (this._invincFrames > 0) this._invincFrames--;

        // Death plane check
        const pos = this._getPlayerPosition();
        if (pos && pos.y < this._deathY && !this._respawning) {
            this._triggerDeath();
        }
    }

    fixedUpdate(dt) {
        this.charController?.fixedUpdate?.(dt);
        this.platformerPhys?.fixedUpdate?.(dt);
    }

    // ── Input ─────────────────────────────────────────────────────────────────

    _bindInputActions(input) {
        if (!input?.loadActionMap) return;
        input.loadActionMap({
            moveLeft:       ['KeyA', 'ArrowLeft'],
            moveRight:      ['KeyD', 'ArrowRight'],
            moveForward:    ['KeyW', 'ArrowUp'],
            moveBackward:   ['KeyS', 'ArrowDown'],
            jump:           ['Space'],
            dash:           ['ShiftLeft', 'ShiftRight'],
            groundPound:    ['ControlLeft', 'ControlRight'],
            camShoulderSwap:['KeyQ'],
        }, true);
    }

    _buildInputState(input) {
        if (!input) return {};
        input.update?.();
        const axis = input.getAxis?.() ?? { x: 0, y: 0 };
        const look = input.getLookAxis?.() ?? { x: 0, y: 0 };
        const moveForward = axis.y < -0.1 || !!input.isAction?.('moveForward');
        const moveBack    = axis.y > 0.1  || !!input.isAction?.('moveBackward') || !!input.isAction?.('moveBack');
        return {
            moveLeft:     axis.x < -0.1 || !!input.isAction?.('moveLeft'),
            moveRight:    axis.x > 0.1  || !!input.isAction?.('moveRight'),
            moveForward,
            moveBackward: moveBack,
            moveBack,
            jump:           !!input.isAction?.('jump'),
            dash:           !!input.isAction?.('dash'),
            groundPound:    !!input.isAction?.('groundPound'),
            camRight:       look.x > 0.001,
            camLeft:        look.x < -0.001,
            camUp:          look.y < -0.001,
            camDown:        look.y > 0.001,
            camShoulderSwap:!!input.isAction?.('camShoulderSwap'),
        };
    }

    // ── Checkpoint / respawn system ───────────────────────────────────────────

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
            this.game?._stopLoop();
            this.onGameOver?.();
            this.game?.onGameOver?.();
            return;
        }
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

    _levelComplete(stats = {}) {
        this.game?._stopLoop();
        this.vfx?.flashComplete?.();
        const data = { coins: this._coins, score: this._score, ...stats };
        this.onLevelComplete?.(data);
        this.game?.completeLevel(data);
    }

    // ── Player position helpers ───────────────────────────────────────────────

    _getPlayerPosition() {
        return this.charController?.getPosition?.() ?? this.playerChar?.mesh?.position ?? null;
    }

    _setPlayerPosition(x, y, z) {
        this.charController?.teleport?.(x, y, z);
        if (this.playerChar?.mesh) {
            this.playerChar.mesh.position.set(x, y, z);
        }
    }

    // ── Power-ups ─────────────────────────────────────────────────────────────

    _handlePowerUp(type) {
        switch (type) {
            case 'invincible':
                this._invincFrames = 600;
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

    // ── Runtime level data builders ───────────────────────────────────────────

    _buildRuntimeLevelData(data = {}) {
        const runtimeLevel = { ...data, engineType: 'platformer-3d' };
        if (!runtimeLevel.skybox) {
            const top = runtimeLevel.sky?.topColor;
            if (typeof top === 'number') runtimeLevel.skybox = { type: 'solid', top_index: top };
            else if (typeof top === 'string' && top.trim()) runtimeLevel.skybox = { type: 'solid', colorHex: top };
        }
        const sourceLights = Array.isArray(runtimeLevel.lights) ? runtimeLevel.lights : [];
        const normalizedLights = sourceLights.map(light => ({
            ...light,
            position: Array.isArray(light?.position) ? light.position
                : [Number(light?.position?.x ?? 0), Number(light?.position?.y ?? 10), Number(light?.position?.z ?? 0)],
            target: light?.target == null ? light?.target
                : (Array.isArray(light.target) ? light.target
                    : [Number(light?.target?.x ?? 0), Number(light?.target?.y ?? 0), Number(light?.target?.z ?? 0)]),
        }));
        const hasAmbient = normalizedLights.some(l => String(l?.type || '').toLowerCase() === 'ambient');
        if (!hasAmbient) {
            const ambient = runtimeLevel.ambientLight ?? {};
            normalizedLights.unshift({
                id: '__platformer_ambient__', type: 'ambient',
                colorHex: ambient.color ?? '#ffffff', intensity: Number(ambient.intensity ?? 0.5),
            });
        }
        runtimeLevel.lights = normalizedLights;
        if (!Array.isArray(runtimeLevel.geometry) || runtimeLevel.geometry.length === 0) {
            const platforms = Array.isArray(runtimeLevel.platforms) ? runtimeLevel.platforms : [];
            runtimeLevel.geometry = platforms.map((p, idx) => this._platformToGeometry(p, idx));
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
        const friction    = Number(platform?.friction);
        const restitution = Number(platform?.restitution);
        return {
            id:           platform?.id || `platform_${index}`,
            type:         platform?.blockType || platform?.subtype || 'mesh',
            width: w, height: h, depth: d,
            position:     [x, y, z],
            rotation:     [qx, qy, qz, qw],
            scale:        [1, 1, 1],
            palette_index: Number.isFinite(platform?.colorIdx) ? platform.colorIdx : 122,
            colorHex:     platform?.colorHex || null,
            textureId:    platform?.textureId || null,
            castShadow:   true,
            receiveShadow: true,
            _friction:    Number.isFinite(friction) ? friction : undefined,
            _restitution: Number.isFinite(restitution) ? restitution : undefined,
        };
    }

    _platformRotationToQuaternion(rotation) {
        if (Array.isArray(rotation) && rotation.length === 4) {
            return [Number(rotation[0] ?? 0), Number(rotation[1] ?? 0), Number(rotation[2] ?? 0), Number(rotation[3] ?? 1)];
        }
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
        const game = this.game;
        if (!game) return;
        if (game.physics?.world && typeof game.physics.removeBody === 'function') {
            for (const body of this._worldPhysicsBodies) game.physics.removeBody(body);
        }
        this._worldPhysicsBodies = [];
        const meshes = [];
        const geometryDefs = Array.isArray(runtimeLevel?.geometry) ? runtimeLevel.geometry : [];
        for (const def of geometryDefs) {
            const mesh = def?.id ? game.getLevelObject(def.id) : null;
            if (!mesh || !mesh.isMesh) continue;
            meshes.push(mesh);
            if (!game.physics?.world || typeof game.physics.createBody !== 'function') continue;
            const w = Math.max(0.1, Number(def.width ?? 1));
            const h = Math.max(0.1, Number(def.height ?? 1));
            const d = Math.max(0.1, Number(def.depth ?? 1));
            const body = game.physics.createBody({
                type:  BodyType.STATIC,
                shape: ShapeType.BOX,
                size:  { x: w * 0.5, y: h * 0.5, z: d * 0.5 },
                position: {
                    x: Number(def.position?.[0] ?? mesh.position.x),
                    y: Number(def.position?.[1] ?? mesh.position.y),
                    z: Number(def.position?.[2] ?? mesh.position.z),
                },
                friction:    Number.isFinite(def._friction) ? def._friction : 0.7,
                restitution: Number.isFinite(def._restitution) ? def._restitution : 0.05,
            });
            if (body?.body && Array.isArray(def.rotation) && def.rotation.length === 4) {
                body.body.quaternion.set(
                    Number(def.rotation[0] ?? 0), Number(def.rotation[1] ?? 0),
                    Number(def.rotation[2] ?? 0), Number(def.rotation[3] ?? 1),
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

    _appendTerrainCollisionMeshes() {
        const terrainMeshes = this.terrainRuntime?.getCollisionMeshes?.() ?? [];
        if (!terrainMeshes.length) return;
        const meshes = [...this._worldCollisionMeshes, ...terrainMeshes];
        this._worldCollisionMeshes = meshes;
        this.charController?.setCollisionMeshes?.(meshes);
        this.thirdPersonCam?.setCollisionMeshes?.(meshes);
        this.playerChar?.setCollisionMeshes?.(meshes);
    }

    // ── Save / Load ───────────────────────────────────────────────────────────

    getPlayerData() {
        const playerMesh = this.charController
            ? { position:   this.charController.getPosition?.() ?? { x: 0, y: 0, z: 0 },
                quaternion: this.playerChar?.mesh?.quaternion ?? null,
                _velocity:  this.charController._velocity ?? null }
            : null;
        const cpPos = this.checkpoints?.getActiveCPPosition?.() ?? this._checkpoint?.position ?? null;
        return {
            ...serialize3DPlayerState(playerMesh, {
                hp:    this._health,
                lives: this._lives,
                coins: this._coins,
                score: this._score,
            }),
            lastCheckpoint: cpPos
                ? { id: this.checkpoints?.getActiveCPId?.() ?? null,
                    position: [cpPos.x ?? cpPos[0], cpPos.y ?? cpPos[1], cpPos.z ?? cpPos[2]] }
                : null,
            collectedItems: this.collectibles?.getCollectedIds?.() ?? [],
        };
    }

    async setPlayerData(data) {
        const ps = deserialize3DPlayerState(data);
        if (ps) {
            if (ps.hp    !== undefined) this._health = ps.hp;
            if (ps.lives !== undefined) this._lives  = ps.lives;
            if (ps.coins !== undefined) this._coins  = ps.coins;
            if (ps.score !== undefined) this._score  = ps.score;
        }
        const cp = data?.lastCheckpoint;
        if (cp?.position) {
            this._checkpoint = {
                position: { x: cp.position[0], y: cp.position[1], z: cp.position[2] },
                state:    { coins: this._coins, score: this._score },
            };
        }
        if (Array.isArray(data?.collectedItems) && this.collectibles?.markCollected) {
            for (const id of data.collectedItems) this.collectibles.markCollected(id);
        }
    }

    getLevelState() {
        return { levelId: this.game?._levelId };
    }

    async setLevelState(_ls) {
        // Platformer has minimal level state (checkpoint + collectibles in playerData)
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    dispose() {
        this.onLevelUnloaded();
        this.charController?.destroy?.();
        this.playerChar?.destroy?.();
        this.thirdPersonCam?.destroy?.();
        this.platformerPhys?.destroy?.();
        this.collectibles?.destroy?.();
        this.checkpoints?.destroy?.();
        this.enemies?.destroy?.();
        this.vfx?.destroy?.();
        super.dispose();
    }
}
