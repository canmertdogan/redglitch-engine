/**
 * Engine3DBase.js — Abstract base class for all 3D engines in Ketebe.
 *
 * Extends the existing EngineAdapter contract with a 3D lifecycle layer.
 * Shared by topdown-3d, fps-3d, and platformer-3d engine types.
 *
 * Visual style enforced: LOW-POLY + VOXEL, NO PBR, NO HDR, palette-indexed flat colors only.
 */

// ── Logger Hook (mirrors rpg-topdown/main.js pattern) ───────────────────────
(function _installLoggerHook3D() {
    if (typeof window === 'undefined' || window.__loggerHook3DInstalled) return;
    window.__loggerHook3DInstalled = true;

    const _orig = { log: console.log, warn: console.warn, error: console.error };

    function _send(level, msg) {
        if (!window.opener) return;
        try {
            const safe = typeof msg === 'string' ? msg : JSON.stringify(msg, (k, v) => {
                if (k === 'scene' || k === 'renderer' || k === 'canvas') return '[THREE/DOM]';
                return v;
            });
            window.opener.postMessage({ type: 'log', level, message: safe }, '*');
        } catch (_) {
            window.opener.postMessage({ type: 'log', level, message: String(msg) }, '*');
        }
    }

    console.log   = function(...a) { _send('info',    a.map(String).join(' ')); _orig.log.apply(console, a); };
    console.warn  = function(...a) { _send('warning', a.map(String).join(' ')); _orig.warn.apply(console, a); };
    console.error = function(...a) { _send('error',   a.map(String).join(' ')); _orig.error.apply(console, a); };
}());

// ── Engine3DBase ─────────────────────────────────────────────────────────────

class Engine3DBase extends EngineAdapter {
    /**
     * @param {string} engineType3D  - One of: 'topdown-3d' | 'fps-3d' | 'platformer-3d'
     * @param {HTMLElement} container - DOM element to mount the renderer canvas into
     */
    constructor(engineType3D, container) {
        // Pass engineType string up to EngineAdapter
        super(engineType3D);

        /** Identifies which 3D sub-mode is active at runtime */
        this.engineType3D = engineType3D;

        /** Mount target for the WebGL canvas */
        this.container = container || document.body;

        // ── Three.js core objects (set during init3D) ──────────────────────
        /** @type {THREE.Scene|null} */
        this.scene = null;

        /** @type {THREE.WebGLRenderer|null} */
        this.renderer = null;

        /** @type {THREE.Clock|null} */
        this.clock = null;

        /** @type {THREE.Camera|null} */
        this.camera = null;

        // ── Loop state ──────────────────────────────────────────────────────
        this._rafId = null;
        this._running = false;
        this._paused  = false;
    }

    // ── 3D Lifecycle (abstract — subclasses MUST override) ──────────────────

    /**
     * Set up Three.js scene, camera, lights, and engine-specific objects.
     * Called once after the renderer canvas has been mounted.
     * @returns {Promise<void>}
     */
    async init3D() {
        throw new Error(`[Engine3DBase:${this.engineType3D}] init3D() must be implemented by subclass`);
    }

    /**
     * Begin the render/update loop.
     * Subclasses may override but should call super.start3D() to activate _loop().
     */
    start3D() {
        if (this._running) return;
        this._running = true;
        this._paused  = false;
        this.clock.start();
        this._loop();
        console.log(`[Engine3DBase:${this.engineType3D}] start3D()`);
    }

    /**
     * Per-frame update — physics, input, game logic.
     * @param {number} delta  Elapsed seconds since last frame (capped at 0.1 s)
     */
    update3D(delta) {
        // Default no-op; subclasses override
    }

    /**
     * Per-frame render — Three.js draw call (or EffectComposer pass).
     * Subclasses override when using post-processing.
     */
    render3D() {
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /**
     * Tear down Three.js resources, cancel the loop, dispose geometries/materials.
     */
    destroy3D() {
        this._stopLoop();
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement && this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
            this.renderer = null;
        }
        if (this.scene) {
            _disposeScene(this.scene);
            this.scene = null;
        }
        this.clock  = null;
        this.camera = null;
        console.log(`[Engine3DBase:${this.engineType3D}] destroy3D()`);
    }

    // ── EngineAdapter overrides ──────────────────────────────────────────────

    async initialize() {
        if (this.isInitialized) return;
        console.log(`[Engine3DBase:${this.engineType3D}] initialize()`);

        // Create Three.js core objects shared by all 3D engines
        this.scene    = new THREE.Scene();
        this.clock    = new THREE.Clock(false);
        this.renderer = _buildRenderer(this.container);

        // Let subclass finish scene setup
        await this.init3D();

        this.isInitialized = true;
    }

    start() {
        this.start3D();
    }

    stop() {
        this._stopLoop();
        this._running = false;
        this._paused  = false;
        console.log(`[Engine3DBase:${this.engineType3D}] stop()`);
    }

    pause() {
        this._paused = true;
        this.clock.stop();
        console.log(`[Engine3DBase:${this.engineType3D}] pause()`);
    }

    resume() {
        this._paused = false;
        this.clock.start();
        console.log(`[Engine3DBase:${this.engineType3D}] resume()`);
    }

    destroy() {
        this.destroy3D();
        super.destroy();
    }

    resize() {
        if (!this.renderer || !this.camera) return;
        const w = this.container.clientWidth  || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;
        this.renderer.setSize(w, h);
        if (this.camera.isPerspectiveCamera) {
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
        }
    }

    // Subclasses implement these for cross-engine serialization
    async loadLevel(levelId, levelPath = null) {
        throw new Error(`[Engine3DBase:${this.engineType3D}] loadLevel() must be implemented by subclass`);
    }
    async unloadLevel() {
        throw new Error(`[Engine3DBase:${this.engineType3D}] unloadLevel() must be implemented by subclass`);
    }
    getState()            { return {}; }
    async setState(state) {}
    getPlayerData()       { return {}; }
    setPlayerData(data)   {}

    // ── Internal ─────────────────────────────────────────────────────────────

    _loop() {
        if (!this._running) return;
        this._rafId = requestAnimationFrame(() => this._loop());
        if (this._paused) return;

        const raw   = this.clock.getDelta();
        const delta = Math.min(raw, 0.1); // cap at 100 ms to avoid spiral-of-death
        this.update3D(delta);
        this.render3D();
    }

    _stopLoop() {
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Create a WebGLRenderer sized to the container, appended to its DOM node.
 * Subclasses replace this.renderer in init3D() if they need EffectComposer.
 * @param {HTMLElement} container
 * @returns {THREE.WebGLRenderer}
 */
function _buildRenderer(container) {
    const w = container.clientWidth  || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    // Flat/low-poly style: no tone mapping, no HDR
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);
    return renderer;
}

/**
 * Recursively dispose all geometries and materials in a scene.
 * @param {THREE.Scene} scene
 */
function _disposeScene(scene) {
    scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(m => m.dispose());
        }
    });
}

// ── Export ────────────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Engine3DBase;
}
