/**
 * modes/platformer.js — Platformer 3D mode configuration for RedGlitch3DGame
 *
 * Declares which subsystems to instantiate, camera mode, and HUD type
 * when the engine runs in Platformer mode.
 */

export default {
    name: 'platformer-3d',
    label: 'Platformer 3D',

    /** Camera3DController mode key */
    cameraMode: 'THIRD_PERSON',

    /** No pointer lock for third-person camera */
    pointerLock: false,

    /** Default physics — slightly stronger gravity for platformer feel */
    physics: { gravity: [0, -20, 0], fixedStep: 1 / 60, iterations: 10 },

    /** Default player state */
    playerDefaults: {
        lives: 3,
        health: 3,
        coins: 0,
        score: 0,
    },

    /** HUD overlay type */
    hudType: 'platformer',

    /**
     * System manifest — lazy-loaded subsystem classes.
     */
    systems: [
        {
            key: 'thirdPersonCam',
            loader: () => import('../systems/ThirdPersonCamera.js'),
            initArgs: (engine) => [engine.camera3d, engine.input, engine.container],
        },
        {
            key: 'platformerPhys',
            loader: () => import('../systems/PlatformerPhysics3D.js'),
            initArgs: (engine) => [engine.scene, engine.physics],
        },
        {
            key: 'charController',
            loader: () => import('../systems/CharacterController3D.js'),
            initArgs: (engine) => [engine, engine.input, engine.physics],
        },
        {
            key: 'playerChar',
            loader: () => import('../systems/PlayerCharacter3D.js'),
            initArgs: (engine) => [engine.scene, engine.palette, engine.assets],
        },
        {
            key: 'collectibles',
            loader: () => import('../systems/CollectibleSystem3D.js'),
            initArgs: (engine) => [engine.scene, engine.physics, engine.palette],
        },
        {
            key: 'checkpoints',
            loader: () => import('../systems/CheckpointSystem3D.js'),
            initArgs: (engine) => [engine.scene, engine.physics],
        },
        {
            key: 'enemies',
            loader: () => import('../systems/EnemyPlatformer3D.js'),
            initArgs: (engine) => [engine],
        },
        {
            key: 'vfx',
            loader: () => import('../systems/VFX_Platformer3D.js'),
            initArgs: (engine) => [engine.scene, engine.palette],
        },
    ],

    /**
     * Called after all systems are instantiated.
     */
    onSystemsReady(engine) {
        // Wire player character into camera tracking
        if (engine.thirdPersonCam && engine.playerChar) {
            engine.thirdPersonCam.setTarget(engine.playerChar.mesh);
        }
        // Wire character controller into player character
        if (engine.charController && engine.playerChar) {
            engine.charController.setPlayerChar(engine.playerChar);
        }
    },

    /**
     * Mode-specific update order.
     */
    updateOrder: [
        'charController',
        'platformerPhys',
        'playerChar',
        'collectibles',
        'checkpoints',
        'enemies',
        'thirdPersonCam',
        'vfx',
    ],
};
