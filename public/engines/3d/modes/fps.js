/**
 * modes/fps.js — FPS mode configuration for RedGlitch3DGame
 *
 * Declares which subsystems to instantiate, camera mode, and HUD type
 * when the engine runs in FPS mode.
 */

export default {
    name: 'fps-3d',
    label: 'FPS 3D',

    /** Camera3DController mode key */
    cameraMode: 'FPS',

    /** Request pointer lock on start */
    pointerLock: true,

    /** Default physics */
    physics: { gravity: [0, -9.82, 0], fixedStep: 1 / 60, iterations: 10 },

    /** Default player state */
    playerDefaults: {
        health: 100,
        ammo: { current: 30, reserve: 90 },
    },

    /** HUD overlay type */
    hudType: 'fps',

    /**
     * System manifest — lazy-loaded subsystem classes.
     * Each entry: { key, loader, initArgs? }
     *   key:      property name on the engine instance (e.g. this.fpsCamera)
     *   loader:   async () => module with default export
     *   initArgs: optional function(engine) => constructor args array
     */
    systems: [
        {
            key: 'fpsCamera',
            loader: () => import('../systems/FPSCamera.js?v=hopfix1'),
            initArgs: (engine) => [engine.camera3d, engine.container, {
                bobEnabled: false,
                fovSprint: 6,
            }],
        },
        {
            key: 'fpsController',
            loader: () => import('../systems/FPSController.js?v=hopfix1'),
            initArgs: (engine) => [{
                physics: engine.physics,
                fpsCamera: engine.fpsCamera,
                input: engine.input,
                audio: engine.audio,
            }, {
                bunnyHop: false,
            }],
        },
        {
            key: 'worldGeometry',
            loader: () => import('../systems/WorldGeometry.js'),
            initArgs: (engine) => [{ scene: engine.scene, physics: engine.physics, assets: engine.assets, fpsController: engine.fpsController }],
        },
        {
            key: 'weaponSystem',
            loader: () => import('../systems/WeaponSystem.js'),
            initArgs: (engine) => [{
                scene: engine.scene,
                camera: engine.renderer3d?.camera ?? engine.camera3d?.camera,
                raycast: engine.raycast,
                fpsCamera: engine.fpsCamera,
                fpsController: engine.fpsController,
                assets: engine.assets,
                audio: engine.audio,
            }],
        },
        {
            key: 'enemyAI',
            loader: () => import('../systems/EnemyAI.js'),
            initArgs: (engine) => [{
                scene: engine.scene,
                physics: engine.physics,
                assets: engine.assets,
                palette: engine.palette,
                raycast: engine.raycast,
                weaponSystem: engine.weaponSystem,
                difficulty: engine._options?.difficulty ?? 'normal',
            }],
        },
        {
            key: 'hud',
            loader: () => import('../systems/HUD_FPS.js'),
            initArgs: (engine) => [engine.container],
        },
        {
            key: 'decals',
            loader: () => import('../systems/DecalSystem.js'),
            initArgs: (engine) => [{
                scene: engine.scene,
                raycast: engine.raycast,
                palette: engine.palette,
            }],
        },
        {
            key: 'vfx',
            loader: () => import('../systems/VFX_FPS.js?v=fps-soft-shadows1'),
            initArgs: (engine) => [{
                scene: engine.scene,
                renderer3d: engine.renderer3d,
                palette: engine.palette,
            }],
        },
    ],

    /**
     * Called after all systems are instantiated.
     * Wire cross-system references here.
     */
    onSystemsReady(engine) {
        // FPS camera drives the main camera
        if (engine.fpsCamera && engine.camera3d) {
            engine.fpsCamera.attach(engine.camera3d.camera);
        }
        // HUD needs weapon + health references
        if (engine.hud) {
            engine.hud.bindEngine(engine);
        }
        if (engine.enemyAI && engine.fpsController) {
            engine.enemyAI.setPlayerRef(engine.fpsController);
        }
        if (engine.vfx) {
            engine.vfx.configureDirectionalLight({
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
        }
        engine.renderer3d?.rebuildPostProcessing?.([
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
    },

    /**
     * Mode-specific update order within the game loop.
     * Returns array of system keys in tick order.
     */
    updateOrder: [
        'fpsController',
        'fpsCamera',
        'weaponSystem',
        'enemyAI',
        'decals',
        'vfx',
        'hud',
    ],
};
