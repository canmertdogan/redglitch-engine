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

import ModeInterface from '../ModeInterface.js';
import { CameraMode } from '../../shared/Camera3DController.js';
import { LayerMask }   from '../../shared/Raycast3D.js';
import {
    serialize3DPlayerState,
    deserialize3DPlayerState,
} from '../../shared/Save3D.js';

// FPS-specific subsystems (still live in engines/fps-3d/)
import FPS3DStrategy     from '../../3d/systems/FPS3DStrategy.js';
import FPSCamera         from '../../3d/systems/FPSCamera.js';
import FPSController, { MoveState } from '../../3d/systems/FPSController.js';
import WorldGeometry     from '../../3d/systems/WorldGeometry.js';
import WeaponSystem, { WeaponState } from '../../3d/systems/WeaponSystem.js';
import EnemyAI, { EnemyState, Difficulty } from '../../3d/systems/EnemyAI.js';
import HUD_FPS           from '../../3d/systems/HUD_FPS.js';
import DecalSystem       from '../../3d/systems/DecalSystem.js';
import VFX_FPS           from '../../3d/systems/VFX_FPS.js';

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

        // Default moody sky for FPS
        skybox.setGradient('#1a2a3a', '#0a0806');

        // ── Strategy ──────────────────────────────────────────────────────
        this.strategy = new FPS3DStrategy(game);
        this.strategy.initialize();

        // ── FPS Camera ────────────────────────────────────────────────────
        this.fpsCamera = new FPSCamera(camera3d, container, {
            sensitivity: 0.0015,
            bobEnabled:  true,
            leanEnabled: true,
            fovBase:     75,
            fovSprint:   10,
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
            bunnyHop:     true,
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
        this.vfx.configureDirectionalLight();

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

        // Strategy: set player spawn from level data
        this.strategy?.loadLevel(level);

        // Re-position controller at spawn
        if (this.fpsController) {
            const spawn = level?.playerSpawn ?? { x: 0, y: 1.8, z: 0 };
            await this.fpsController.init(spawn);
        }

        // Load world geometry + collision
        if (this.worldGeometry) {
            await this.worldGeometry.loadFromLevel(level, this.game?.currentProject ?? '');
        }

        // Load enemies and cover points
        if (this.enemyAI) {
            await this.enemyAI.loadFromLevel(level, this.game?.currentProject ?? '');
            this._initialEnemyCount = this._countLivingEnemies();
        }
    }

    onLevelUnloaded() {
        this._initialEnemyCount = 0;
        this.worldGeometry?.dispose();
        this.weaponSystem?.dispose();
        this.enemyAI?.dispose();
        this.decals?.clear();
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    update(dt) {
        const game = this.game;
        if (!game) return;

        // Player controller
        this.fpsController?.update(dt);

        // AI tick
        this.enemyAI?.update(dt);

        // Weapon system
        this.weaponSystem?.update(dt);

        // World geometry (stairs, triggers, portals)
        this.worldGeometry?.update(dt, game.gameTime);

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
