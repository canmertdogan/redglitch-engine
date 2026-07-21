/**
 * FPSMode.js — First-person shooter mode module for Unified3DGame.
 *
 * Wraps all FPS-specific systems (FPSCamera, FPSController, WorldGeometry,
 * WeaponSystem, EnemyAI, HUD_FPS, DecalSystem, VFX_FPS) and plugs them
 * into Game3DCore's lifecycle via ModeInterface.
 *
 * The subsystem files themselves are NOT rewritten — they remain in
 * `engines/fps-3d/` and are imported from there.
 */

import * as THREE from '/lib/three/three.module.js';
import ModeInterface from '../ModeInterface.js';
import { CameraMode } from '../../shared/Camera3DController.js';
import { LayerMask }   from '../../shared/Raycast3D.js';
import TerrainRuntime3D, { normalizeTerrainLevel } from '../TerrainRuntime3D.js?v=fps-swim3';
import VehicleSystem3D from '../VehicleSystem3D.js';
import {
    serialize3DPlayerState,
    deserialize3DPlayerState,
} from '../../shared/Save3D.js';

// FPS-specific subsystems (still live in engines/fps-3d/)
import FPS3DStrategy     from '../../3d/systems/FPS3DStrategy.js';
import FPSCamera         from '../../3d/systems/FPSCamera.js?v=hopfix1';
import FPSController, { MoveState } from '../../3d/systems/FPSController.js?v=fps-swim3';
import WorldGeometry     from '../../3d/systems/WorldGeometry.js';
import WeaponSystem, { WeaponState } from '../../3d/systems/WeaponSystem.js';
import EnemyAI, { EnemyState, Difficulty } from '../../3d/systems/EnemyAI.js';
import HUD_FPS           from '../../3d/systems/HUD_FPS.js';
import DecalSystem       from '../../3d/systems/DecalSystem.js';
import VFX_FPS           from '../../3d/systems/VFX_FPS.js?v=fps-soft-shadows1';

const FPS_SKY_TOP = '#2f5f78';
const FPS_SKY_BOTTOM = '#8eaeb8';
const FPS_BIOME_PALETTE = [
    { threshold: 0.18, color: '#56684d' },
    { threshold: 0.38, color: '#5f7f46' },
    { threshold: 0.62, color: '#718a4c' },
    { threshold: 0.82, color: '#74684d' },
    { threshold: 1.00, color: '#8a8370' },
];
const FPS_FOLIAGE_COLORS = {
    pine: '#2f6f42',
    oak: '#4f8a42',
    palm: '#3f9950',
    tree: '#3f7f3f',
    bush: '#4f9a4f',
    grass: '#4f9a4f',
    reed: '#7f9a3f',
    lily: '#4f8f3a',
    rock: '#78736a',
};

// ── FPSMode ───────────────────────────────────────────────────────────────────

export default class FPSMode extends ModeInterface {

    constructor() {
        super();

        // ── FPS-specific systems ──────────────────────────────────────────
        this.strategy       = null;   // FPS3DStrategy
        this.fpsCamera      = null;   // FPSCamera
        this.fpsController  = null;   // FPSController
        this.worldGeometry  = null;   // WorldGeometry
        this.weaponSystem   = null;   // WeaponSystem
        this.enemyAI        = null;   // EnemyAI
        this.hud            = null;   // HUD_FPS
        this.decals         = null;   // DecalSystem
        this.vfx            = null;   // VFX_FPS
        this.terrainRuntime = null;   // Shared playable terrain
        this.vehicles       = null;   // Shared vehicles

        // ── Player state ──────────────────────────────────────────────────
        this._health         = 100;
        this._ammo           = { current: 30, reserve: 90 };
        this._collectedItems = new Set();
        this._lastCheckpoint = null;
        this._initialEnemyCount = 0;
    }

    // ── Identity ──────────────────────────────────────────────────────────────

    get modeId() { return 'fps-3d'; }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async onInit(game) {
        await super.onInit(game);

        const { scene, renderer3d, camera3d, physics, palette,
                assets, input, audio, raycast, skybox, container } = game;

        // Set camera to FPS mode
        camera3d.setMode(CameraMode.FPS);

        // Balanced daylight default for FPS playtests: readable terrain without
        // washing out faces, props, or weapon VFX.
        skybox.setGradient(FPS_SKY_TOP, FPS_SKY_BOTTOM, {
            sun: { color: '#ffe0ad', intensity: 0.9, azimuth: 38, elevation: 48 },
            fogSync: true,
        });

        // ── Strategy ──────────────────────────────────────────────────────
        this.strategy = new FPS3DStrategy(game);
        this.strategy.initialize();

        this.terrainRuntime = new TerrainRuntime3D(game);
        this.vehicles = new VehicleSystem3D(game);

        // ── FPS Camera ────────────────────────────────────────────────────
        this.fpsCamera = new FPSCamera(camera3d, container, {
            sensitivity: 0.0015,
            bobEnabled:  false,
            leanEnabled: true,
            fovBase:     75,
            fovSprint:   6,
        });
        this.fpsCamera.attach();
        this.fpsCamera.onUnlocked = () => {
            if (game.isRunning && !game.isPaused) {
                game.pause();
            }
        };

        // ── FPS Controller ────────────────────────────────────────────────
        this.fpsController = new FPSController({
            physics,
            fpsCamera: this.fpsCamera,
            input,
            audio,
        }, {
            bunnyHop:     false,
            proneEnabled: false,
        });
        this.fpsController._gameTimeRef = () => game.gameTime;
        await this.fpsController.init();

        // ── World Geometry ────────────────────────────────────────────────
        this.worldGeometry = new WorldGeometry({
            scene,
            physics,
            assets,
            fpsController: this.fpsController,
        });

        // ── Weapon System ─────────────────────────────────────────────────
        this.weaponSystem = new WeaponSystem({
            scene,
            camera: renderer3d.camera,
            raycast,
            fpsCamera:     this.fpsCamera,
            fpsController: this.fpsController,
            assets,
            audio,
        });
        await this.weaponSystem.equip('pistol');

        // ── Enemy AI ──────────────────────────────────────────────────────
        this.enemyAI = new EnemyAI({
            scene,
            physics,
            assets,
            palette,
            raycast,
            weaponSystem: this.weaponSystem,
            difficulty:   game._options?.difficulty ?? 'normal',
        });
        this.enemyAI.setPlayerRef(this.fpsController);

        // ── HUD ───────────────────────────────────────────────────────────
        this.hud = new HUD_FPS(container, renderer3d?.camera);

        // ── DecalSystem ───────────────────────────────────────────────────
        this.decals = new DecalSystem({
            scene,
            raycast,
            palette,
        });

        // ── VFX ───────────────────────────────────────────────────────────
        this.vfx = new VFX_FPS({
            scene,
            renderer3d,
            palette,
        });
        this.vfx.configureDirectionalLight({
            color: 0xffe0ad,
            intensity: 0.95,
            position: [46, 76, 34],
            castShadow: true,
            mapSize: 2048,
            shadowCamSize: 130,
            shadowFar: 320,
            shadowRadius: 3.2,
            shadowBias: -0.00004,
            shadowNormalBias: 0.075,
            ambientColor: 0xb7c2bd,
            ambientIntensity: 0.42,
            skyColor: 0xb7d2dc,
            groundColor: 0x6b745b,
            hemisphereIntensity: 0.48,
        });

        // ── Wire callbacks ────────────────────────────────────────────────
        this._wireCallbacks(game);

        console.log('[FPSMode] onInit() complete');
    }

    /**
     * Wire all inter-system callbacks (damage, hit markers, VFX triggers, etc.)
     * Centralised here so they're easy to trace / debug.
     */
    _wireCallbacks(game) {
        // Enemy attack → player damage + HUD flash
        this.enemyAI.onEnemyAttack = (_id, damage, hitPos) => {
            this._health = Math.max(0, this._health - damage);
            this.hud?.updateHealth(this._health / 100);
            const camYaw = this.fpsCamera?._yaw ?? 0;
            const pp = this.fpsController?.getPosition?.() ?? null;
            if (pp) {
                this.hud?.flashDamage(hitPos ?? null, { x: pp.x, y: pp.y, z: pp.z }, camYaw);
            }
        };

        // Weapon ammo → HUD
        this.weaponSystem.onAmmoChanged = (_id, ammo) => {
            this._ammo = ammo;
            this.hud?.updateAmmo(ammo.mag, ammo.reserve);
        };

        // Weapon equip → HUD toast
        this.weaponSystem.onEquip = (_id, def) => {
            this.hud?.showWeaponToast(def?.name ?? _id);
        };

        // Weapon hit → enemy damage + decals
        this.weaponSystem.onHit = (id, damage, hitInfo) => {
            const isEnemy = !!this.enemyAI?.getEnemyState?.(id);
            this.enemyAI?.damageEnemy(id, damage, hitInfo?.point ?? null);
            this.hud?.showHitMarker(false);
            if (hitInfo?.point && hitInfo?.normal) {
                if (isEnemy) {
                    this.decals?.spawnBloodSplatter(hitInfo.point, hitInfo.normal);
                } else {
                    this.decals?.spawnBulletHole(hitInfo.point, hitInfo.normal, hitInfo.surface);
                }
                this.decals?.spawnImpactParticles(hitInfo.point, hitInfo.normal, hitInfo.surface);
            }
        };

        // Enemy died → kill hit-marker + completion check
        this.enemyAI.onEnemyDied = (_id) => {
            this.hud?.showHitMarker(true);
            this._checkCompletionState();
        };

        // Weapon VFX callbacks
        this.weaponSystem.onMuzzleFlash = (pos, dir) => {
            this.vfx?.muzzleFlash(pos, dir);
        };
        this.weaponSystem.onBulletTracer = (from, to) => {
            this.vfx?.bulletTracer(from, to);
        };
        this.weaponSystem.onExplosion = (projectile) => {
            const pos = projectile?.position ?? projectile;
            if (pos) this.vfx?.explosion(pos, projectile?.splashRadius ?? 1.5);
        };
    }

    // ── Level lifecycle ───────────────────────────────────────────────────────

    async onLevelLoaded(level) {
        this._initialEnemyCount = 0;
        const visualLevel = this._prepareFpsVisualLevel(level);
        this._applyFpsVisualProfile();

        if (this.terrainRuntime) {
            await this.terrainRuntime.load(visualLevel);
        }
        const runtimeLevel = normalizeTerrainLevel(visualLevel);

        // Load world geometry FIRST so the scene contains voxel/geometry meshes.
        // This allows _resolvePlayableSpawn to use the scene raycaster to find
        // the true floor height instead of falling back to sampleHeight (which
        // returns 0 by default when there is no terrain system).
        if (this.worldGeometry && (this._hasExplicitWorldGeometry(runtimeLevel) || !runtimeLevel?.terrain)) {
            await this.worldGeometry.loadFromLevel(runtimeLevel, this.game?.currentProject ?? '');
        }

        // Resolve spawn AFTER world geometry is loaded (scene has meshes)
        runtimeLevel.playerSpawn = this._resolvePlayableSpawn(runtimeLevel);

        this.strategy?.loadLevel(runtimeLevel);

        if (this.fpsController) {
            this._configureTerrainGrounding();
            await this.fpsController.init(runtimeLevel.playerSpawn);
        }

        // Load enemies and cover points
        if (this.enemyAI) {
            await this.enemyAI.loadFromLevel(runtimeLevel, this.game?.currentProject ?? '');
            this._initialEnemyCount = this._countLivingEnemies();
        }

        this.vehicles?.load(runtimeLevel);
    }

    _prepareFpsVisualLevel(level) {
        const out = JSON.parse(JSON.stringify(level || {}));

        out.skybox = {
            type: 'gradient',
            mode: 'gradient',
            topColor: FPS_SKY_TOP,
            bottomColor: FPS_SKY_BOTTOM,
            colorHex: FPS_SKY_BOTTOM,
            fogSync: false,
            sun: { color: '#ffe0ad', intensity: 0.9, azimuth: 38, elevation: 48 },
        };
        out.sky = out.skybox;
        out.lighting = null;
        out.fog = null;

        if (out.terrain && typeof out.terrain === 'object') {
            out.terrain.biomePalette = FPS_BIOME_PALETTE;
            out.terrain.waterColorHex = '#4a9cb0';
            out.terrain.waterOpacity = Number.isFinite(out.terrain.waterOpacity) ? Math.max(Math.min(out.terrain.waterOpacity, 0.58), 0.42) : 0.48;
        }

        if (Array.isArray(out.terrainMeshes)) {
            for (const mesh of out.terrainMeshes) {
                if (!mesh || mesh.type !== 'terrain') continue;
                mesh.biomePalette = FPS_BIOME_PALETTE;
                mesh.waterColorHex = '#4a9cb0';
                mesh.waterOpacity = Number.isFinite(mesh.waterOpacity) ? Math.max(Math.min(mesh.waterOpacity, 0.58), 0.42) : 0.48;
                if (Array.isArray(mesh.foliageInstances)) {
                    for (const inst of mesh.foliageInstances) {
                        const kind = String(inst.kind || inst.type || 'tree').toLowerCase();
                        inst.colorHex = FPS_FOLIAGE_COLORS[kind] || FPS_FOLIAGE_COLORS.tree;
                    }
                }
            }
        }

        if (Array.isArray(out.terrain?.foliage)) {
            for (const inst of out.terrain.foliage) {
                const kind = String(inst.kind || inst.type || 'tree').toLowerCase();
                inst.colorHex = FPS_FOLIAGE_COLORS[kind] || FPS_FOLIAGE_COLORS.tree;
            }
        }

        return out;
    }

    _applyFpsVisualProfile() {
        const game = this.game;
        game?.skybox?.setGradient?.(FPS_SKY_TOP, FPS_SKY_BOTTOM, {
            colorHex: FPS_SKY_BOTTOM,
            sun: { color: '#ffe0ad', intensity: 0.9, azimuth: 38, elevation: 48 },
            fogSync: false,
        });

        if (game?.scene) {
            game.scene.fog = null;
            game.scene.background = new THREE.Color(FPS_SKY_BOTTOM);
        }

        const renderer = game?.renderer3d;
        if (renderer?.webgl) {
            renderer.webgl.toneMappingExposure = 1.0;
        }
        renderer?.rebuildPostProcessing?.([
            {
                type: 'color_grading',
                brightness: 1.04,
                contrast: 1.02,
                saturation: 1.06,
            },
            {
                type: 'fps_atmosphere',
                vignette: 0.07,
                grain: 0.012,
                scanline: 0.012,
                chromatic: 0.00045,
                tint: '#8fd7e8',
                tintStrength: 0.006,
                lift: 0.07,
            },
        ]);
    }

    onLevelUnloaded() {
        this._initialEnemyCount = 0;
        this.vehicles?.dispose();
        this.terrainRuntime?.dispose();
        this.worldGeometry?.dispose();
        this.weaponSystem?.dispose();
        this.enemyAI?.dispose();
        this.decals?.clear();
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    update(dt) {
        const game = this.game;
        if (!game) return;

        // Ability cooldowns
        this.strategy?.tickAbilities(dt);

        // Player controller
        this.fpsController?.update(dt);
        this._recoverControllerFromTerrainVoid();

        // AI tick
        this.enemyAI?.update(dt);

        // Weapon system
        this.weaponSystem?.update(dt);

        // World geometry (stairs, triggers, portals)
        this.worldGeometry?.update(dt, game.gameTime);
        this.terrainRuntime?.update(dt, game.gameTime);

        this.vehicles?.update(
            dt,
            game.input,
            this.fpsController?.getPosition?.(),
            (x, y, z) => this.fpsController?.setPosition?.(x, y, z),
        );

        // Decals (particle physics + lifetime)
        this.decals?.update(dt);

        // VFX (muzzle flash, tracers, explosions)
        this.vfx?.update(dt);

        // FPS camera (bob, recoil, lean)
        if (this.fpsCamera && game.input) {
            const leanLeft  = game.input.isActionHeld?.('lean_left')  ?? game.input.isKeyHeld?.('KeyQ') ?? false;
            const leanRight = game.input.isActionHeld?.('lean_right') ?? game.input.isKeyHeld?.('KeyE') ?? false;
            this.fpsCamera.setLean(leanRight ? 1 : leanLeft ? -1 : 0);
        }
        this.fpsCamera?.update(dt);

        // HUD update (crosshair, damage flash, minimap)
        if (this.hud) {
            this.hud.update(dt, game.renderer3d?.camera);
            const spread = this.weaponSystem?.getSpreadNormalized() ?? 0;
            this.hud.setCrosshairSpread(spread);
            const pp = this.fpsController?.getPosition?.();
            if (pp) {
                const yaw     = this.fpsCamera?._yaw ?? 0;
                const enemies = this.enemyAI?.getEnemies() ?? [];
                this.hud.updateMinimap(pp, yaw, enemies);
            }
        }
    }

    // ── Completion ────────────────────────────────────────────────────────────

    _countLivingEnemies() {
        return this.enemyAI?.getEnemies?.().length ?? 0;
    }

    _checkCompletionState() {
        if (this.game?._levelComplete || this._initialEnemyCount <= 0) return;
        const remaining = this._countLivingEnemies();
        if (remaining > 0) return;
        this.game?.completeLevel({
            reason:          'all-enemies-defeated',
            initialEnemies:  this._initialEnemyCount,
            remainingEnemies: remaining,
        });
    }

    _hasExplicitWorldGeometry(level) {
        return !!level?.gltfUrl
            || (Array.isArray(level?.geometry) && level.geometry.length > 0)
            || !!(level?.voxelGrid && Object.keys(level.voxelGrid).length > 0);
    }

    _resolvePlayableSpawn(level) {
        const requested = level?.playerSpawn || {};
        let x = Number(requested.x);
        let z = Number(requested.z);
        const hasExplicitXZ = Number.isFinite(x) && Number.isFinite(z);
        const terrainBox = this._getTerrainBounds();

        if (!hasExplicitXZ) {
            if (terrainBox) {
                x = (terrainBox.min.x + terrainBox.max.x) * 0.5;
                z = (terrainBox.min.z + terrainBox.max.z) * 0.5;
            } else {
                x = 0;
                z = 0;
            }
        }

        const terrainMeshes = this.terrainRuntime?.getCollisionMeshes?.() ?? [];
        const candidate = this._sampleTerrainSpawnAt(x, z);
        if (!candidate.hit && terrainMeshes.length > 0 && terrainBox) {
            x = (terrainBox.min.x + terrainBox.max.x) * 0.5;
            z = (terrainBox.min.z + terrainBox.max.z) * 0.5;
        }

        const spawnNeedsClearance = !hasExplicitXZ || this._isNearFoliage(level, x, z, 4.5);
        if (terrainBox && spawnNeedsClearance) {
            const drySpawn = this._findDryTerrainSpawn(level, x, z, terrainBox);
            if (drySpawn) {
                x = drySpawn.x;
                z = drySpawn.z;
            }
        }

        const terrain = this._sampleTerrainSpawnAt(x, z);
        const requestedY = Number(requested.y);
        const fallbackY = Number.isFinite(requestedY) ? requestedY : 1.8;
        const surfaceY = terrain.hit ? terrain.y : fallbackY;
        const y = terrain.hit ? surfaceY + 0.05 : fallbackY;

        return { x, y, z };
    }

    _recoverControllerFromTerrainVoid() {
        if (!this.fpsController || !this.terrainRuntime?.system) return;
        const pos = this.fpsController.getPosition?.();
        if (!pos) return;
        const sample = this._sampleTerrainSpawnAt(pos.x, pos.z);
        if (!sample.hit || !Number.isFinite(sample.y)) return;

        // getPosition() is eye-level. In normal standing posture the eye should
        // stay well above the sampled feet-level terrain height. If it drops
        // below that guard band, the physics body has fallen through terrain.
        if (pos.y < sample.y + 0.5) {
            this.fpsController.setPosition?.(pos.x, sample.y + 0.05, pos.z);
        }
    }

    _configureTerrainGrounding() {
        if (!this.fpsController?.setTerrainGroundProvider) return;

        const terrainBox = this._getTerrainBounds();
        if (!this.terrainRuntime?.system || !terrainBox) {
            this.fpsController.setTerrainGroundProvider(null);
            return;
        }

        const margin = 0.25;
        this.fpsController.setTerrainGroundProvider((x, z) => {
            if (
                x < terrainBox.min.x - margin || x > terrainBox.max.x + margin ||
                z < terrainBox.min.z - margin || z > terrainBox.max.z + margin
            ) {
                return null;
            }

            const water = this.terrainRuntime.sampleWater?.(x, z);
            if (water?.inWater) {
                return { water, surface: 'water' };
            }

            const y = this.terrainRuntime.sampleHeight(x, z);
            if (!Number.isFinite(y)) return null;
            return { y, surface: 'grass' };
        });
    }

    _getTerrainBounds() {
        const meshes = this.terrainRuntime?.getCollisionMeshes?.() ?? [];
        if (!meshes.length) return null;
        const box = new THREE.Box3();
        for (const mesh of meshes) {
            if (!mesh) continue;
            mesh.updateMatrixWorld?.(true);
            box.expandByObject(mesh);
        }
        return box.isEmpty() ? null : box;
    }

    _findDryTerrainSpawn(level, preferredX, preferredZ, box) {
        const terrain = level?.terrain || {};
        const waterLevel = Number.isFinite(terrain.waterLevel) ? terrain.waterLevel : -Infinity;
        const foliage = this._collectFoliageInstances(level);
        const minX = box.min.x;
        const maxX = box.max.x;
        const minZ = box.min.z;
        const maxZ = box.max.z;
        const spanX = Math.max(1, maxX - minX);
        const spanZ = Math.max(1, maxZ - minZ);
        const stepX = Math.max(1, spanX / 16);
        const stepZ = Math.max(1, spanZ / 16);
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const originX = clamp(preferredX, minX + stepX, maxX - stepX);
        const originZ = clamp(preferredZ, minZ + stepZ, maxZ - stepZ);
        let best = null;
        let bestScore = Infinity;

        for (let dz = -8; dz <= 8; dz++) {
            for (let dx = -8; dx <= 8; dx++) {
                const x = clamp(originX + dx * stepX, minX + stepX, maxX - stepX);
                const z = clamp(originZ + dz * stepZ, minZ + stepZ, maxZ - stepZ);
                const sample = this._sampleTerrainSpawnAt(x, z);
                if (!sample.hit) continue;
                const dryClearance = sample.y - waterLevel;
                const isDry = dryClearance > 0.35;
                const dist = Math.hypot(x - preferredX, z - preferredZ);
                const foliagePenalty = this._foliagePenalty(foliage, x, z);
                const score = (isDry ? 0 : 100000) + foliagePenalty + dist - Math.max(0, dryClearance) * 2;
                if (score < bestScore) {
                    bestScore = score;
                    best = { x, y: sample.y, z, isDry };
                }
            }
        }

        return best;
    }

    _collectFoliageInstances(level) {
        const out = [];
        const add = (inst) => {
            if (!inst) return;
            const pos = Array.isArray(inst.position) ? inst.position : null;
            const x = Number(inst.x ?? pos?.[0]);
            const z = Number(inst.z ?? pos?.[2]);
            if (Number.isFinite(x) && Number.isFinite(z)) out.push({ x, z });
        };

        if (Array.isArray(level?.terrain?.foliage)) {
            for (const inst of level.terrain.foliage) add(inst);
        }
        if (Array.isArray(level?.terrainMeshes)) {
            for (const mesh of level.terrainMeshes) {
                if (Array.isArray(mesh?.foliageInstances)) {
                    for (const inst of mesh.foliageInstances) add(inst);
                }
            }
        }
        return out;
    }

    _isNearFoliage(level, x, z, radius) {
        return this._foliagePenalty(this._collectFoliageInstances(level), x, z, radius) > 0;
    }

    _foliagePenalty(foliage, x, z, radius = 5.5) {
        if (!foliage.length) return 0;
        let penalty = 0;
        for (const inst of foliage) {
            const dist = Math.hypot(x - inst.x, z - inst.z);
            if (dist < radius) penalty += (radius - dist) * 600;
        }
        return penalty;
    }

    _sampleTerrainSpawnAt(x, z) {
        const meshes = this.terrainRuntime?.getCollisionMeshes?.() ?? [];
        if (!meshes.length) {
            // Only trust sampleHeight when an actual terrain system is active.
            // When terrainRuntime.system is null, sampleHeight defaults to 0,
            // which would place the player inside voxel geometry (whose floor
            // is usually at Y=1 for a voxel at grid Y=0).
            const y = this.terrainRuntime?.sampleHeight?.(x, z);
            if (Number.isFinite(y) && this.terrainRuntime?.system) return { hit: true, y };
            if (this.game?.scene) {
                const ray = new THREE.Raycaster(
                    new THREE.Vector3(x + 0.01, 4096, z + 0.01),
                    new THREE.Vector3(0, -1, 0),
                    0, 8192,
                );
                const hits = ray.intersectObjects(this.game.scene.children, true);
                for (const h of hits) {
                    if (h.object.isMesh && h.object.visible && !h.object.userData._isWater) {
                        return { hit: true, y: h.point.y };
                    }
                }
            }
            const fallback = this.terrainRuntime?.sampleHeight?.(x, z);
            if (Number.isFinite(fallback)) return { hit: true, y: fallback };
            return { hit: false, y: 0 };
        }

        const ray = new THREE.Raycaster(
            new THREE.Vector3(x + 0.01, 4096, z + 0.01),
            new THREE.Vector3(0, -1, 0),
            0,
            8192,
        );
        const hits = ray.intersectObjects(meshes, false);
        if (hits.length > 0) return { hit: true, y: hits[0].point.y };
        const fallback = this.terrainRuntime?.sampleHeight?.(x, z);
        if (Number.isFinite(fallback)) return { hit: true, y: fallback };
        return { hit: false, y: 0 };
    }

    // ── Save / Load ───────────────────────────────────────────────────────────

    getPlayerData() {
        const playerPos = this.strategy?.getPlayerPosition() ?? null;
        const playerQuat = this.fpsCamera ? { x: 0, y: 0, z: 0, w: 1 } : null;
        return serialize3DPlayerState(
            playerPos
                ? { position: { x: playerPos[0], y: playerPos[1], z: playerPos[2] }, quaternion: playerQuat }
                : null,
            { hp: this._health, maxHp: 100 },
        );
    }

    async setPlayerData(data) {
        const ps = deserialize3DPlayerState(data);
        if (!ps) return;
        if (ps.hp !== undefined) this._health = ps.hp;
        if (ps.position) this.strategy?.setSpawnPoint(ps.position);
    }

    getLevelState() {
        return {
            ammo:            this._ammo,
            cameraState:     this.fpsCamera?.serialize()     ?? null,
            controllerState: this.fpsController?.serialize() ?? null,
            weaponState:     this.weaponSystem?.serialize()   ?? null,
            enemyState:      this.enemyAI?.serialize()        ?? null,
        };
    }

    async setLevelState(ls) {
        if (!ls) return;
        if (ls.ammo            !== undefined) this._ammo = ls.ammo;
        if (ls.cameraState)     this.fpsCamera?.deserialize(ls.cameraState);
        if (ls.controllerState) this.fpsController?.deserialize(ls.controllerState);
        if (ls.weaponState)     this.weaponSystem?.deserialize(ls.weaponState);
        if (ls.enemyState)      this.enemyAI?.deserialize(ls.enemyState);
    }

    // ── Pointer lock ──────────────────────────────────────────────────────────

    requestPointerLock() {
        this.fpsCamera 
            ? this.fpsCamera.requestPointerLock()
            : document.body.requestPointerLock?.()?.catch?.(() => {});
    }

    releasePointerLock() {
        this.fpsCamera
            ? this.fpsCamera.releasePointerLock()
            : document.exitPointerLock?.();
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    dispose() {
        this.onLevelUnloaded();
        this.releasePointerLock();
        this.fpsCamera?.detach();
        this.fpsController?.dispose();
        this.worldGeometry?.dispose();
        this.weaponSystem?.dispose();
        this.enemyAI?.dispose();
        this.hud?.dispose();
        this.decals?.dispose();
        this.vfx?.dispose();
        super.dispose();
    }
}
