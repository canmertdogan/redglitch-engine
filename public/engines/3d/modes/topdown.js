/**
 * modes/topdown.js — Top-Down 3D mode configuration for RedGlitch3DGame
 *
 * Declares which subsystems to instantiate, camera mode, and HUD type
 * when the engine runs in Top-Down mode.
 */

export default {
    name: 'topdown-3d',
    label: 'Top-Down 3D',

    /** Camera3DController mode key */
    cameraMode: 'TOPDOWN',

    /** No pointer lock for RTS-style camera */
    pointerLock: false,

    /** Default physics */
    physics: { gravity: [0, -9.82, 0], fixedStep: 1 / 60, iterations: 10 },

    /** Default player state */
    playerDefaults: {
        team: 0,
        selectedUnits: [],
    },

    /** HUD overlay type */
    hudType: 'topdown',

    /**
     * System manifest — lazy-loaded subsystem classes.
     */
    systems: [
        {
            key: 'topdownCamera',
            loader: () => import('../systems/TopDownCamera3D.js'),
            initArgs: (engine) => [engine.camera3d, engine.input, engine.container],
        },
        {
            key: 'terrain',
            loader: () => import('../systems/TerrainSystem3D.js'),
            initArgs: (engine) => [engine.scene, engine.physics, engine.palette],
        },
        {
            key: 'entities',
            loader: () => import('../systems/EntitySystem3D.js'),
            initArgs: (engine) => [engine.scene, engine.physics, engine.palette, engine.assets],
        },
        {
            key: 'pathfinding',
            loader: () => import('../systems/Pathfinding3D.js'),
            initArgs: (engine) => [engine.scene],
        },
        {
            key: 'fogOfWar',
            loader: () => import('../systems/FogOfWar3D.js'),
            initArgs: (engine) => [engine.scene],
        },
        {
            key: 'abilities',
            loader: () => import('../systems/AbilitySystem3D.js'),
            initArgs: (engine) => [engine],
        },
        {
            key: 'vfx',
            loader: () => import('../systems/VFXSystem3D.js'),
            initArgs: (engine) => [engine.scene, engine.palette],
        },
        {
            key: 'minimap',
            loader: () => import('../systems/Minimap3D.js'),
            initArgs: (engine) => [engine.container, engine.scene],
        },
    ],

    /**
     * Called after all systems are instantiated.
     */
    onSystemsReady(engine) {
        // Wire pathfinding into entity system
        if (engine.entities && engine.pathfinding) {
            engine.entities.pathfinding = engine.pathfinding;
        }
        // Wire fog of war into entities for visibility checks
        if (engine.entities && engine.fogOfWar) {
            engine.entities.fogOfWar = engine.fogOfWar;
        }
    },

    /**
     * Mode-specific update order.
     */
    updateOrder: [
        'topdownCamera',
        'terrain',
        'pathfinding',
        'entities',
        'abilities',
        'fogOfWar',
        'vfx',
        'minimap',
    ],
};
