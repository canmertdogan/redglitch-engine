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
            loader: () => import('../systems/FPSCamera.js'),
            initArgs: (engine) => [engine.camera3d, engine.input, engine.container],
        },
        {
            key: 'fpsController',
            loader: () => import('../systems/FPSController.js'),
            initArgs: (engine) => [engine, engine.physics, engine.input],
        },
        {
            key: 'worldGeometry',
            loader: () => import('../systems/WorldGeometry.js'),
            initArgs: (engine) => [engine.scene, engine.physics, engine.palette],
        },
        {
            key: 'weaponSystem',
            loader: () => import('../systems/WeaponSystem.js'),
            initArgs: (engine) => [engine],
        },
        {
            key: 'enemyAI',
            loader: () => import('../systems/EnemyAI.js'),
            initArgs: (engine) => [engine],
        },
        {
            key: 'hud',
            loader: () => import('../systems/HUD_FPS.js'),
            initArgs: (engine) => [engine.container],
        },
        {
            key: 'decals',
            loader: () => import('../systems/DecalSystem.js'),
            initArgs: (engine) => [engine.scene],
        },
        {
            key: 'vfx',
            loader: () => import('../systems/VFX_FPS.js'),
            initArgs: (engine) => [engine.scene, engine.palette],
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
    },

    /**
     * Mode-specific update order within the game loop.
     * Returns array of system keys in tick order.
     */
    updateOrder: [
        'fpsCamera',
        'fpsController',
        'weaponSystem',
        'enemyAI',
        'decals',
        'vfx',
        'hud',
    ],
};
