/**
 * Renderer3D.js — WebGL renderer + cel/outline post-processing pipeline.
 *
 * Visual style: LOW-POLY + VOXEL, NO PBR, NO HDR, NO tone-mapping.
 * Pipeline: RenderPass → OutlinePass (1-2 px black edges) → CelQuantizePass (3-tone).
 *
 * Usage (ES module, inside a 3D engine's init3D()):
 *
 *   import Renderer3D from '/engines/shared/Renderer3D.js';
 *
 *   this.renderer3D = new Renderer3D(container, scene, camera);
 *   await this.renderer3D.init();
 *
 *   // per frame:
 *   this.renderer3D.render(delta);
 *
 *   // optional extra passes:
 *   this.renderer3D.setPostProcessing([myExtraPass]);
 */

import * as THREE from '/lib/three/three.module.js';
import { EffectComposer } from '/lib/three/postprocessing/EffectComposer.js';
import { RenderPass }     from '/lib/three/postprocessing/RenderPass.js';
import { OutlinePass }    from '/lib/three/postprocessing/OutlinePass.js';
import { ShaderPass }     from '/lib/three/postprocessing/ShaderPass.js';

// ── 3-tone cel quantization shader ───────────────────────────────────────────
const CelQuantizeShader = {
    name: 'CelQuantizeShader',
    uniforms: {
        tDiffuse:   { value: null },
        uTones:     { value: 3.0 },      // number of brightness bands
        uSatBoost:  { value: 1.15 },     // subtle saturation boost
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform float uTones;
        uniform float uSatBoost;
        varying vec2 vUv;

        vec3 rgb2hsv(vec3 c) {
            vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
            vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
            vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
            float d = q.x - min(q.w, q.y);
            float e = 1.0e-10;
            return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
        }

        vec3 hsv2rgb(vec3 c) {
            vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
            vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
            return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            vec3 hsv   = rgb2hsv(texel.rgb);
            // Quantize brightness into uTones bands
            hsv.z = floor(hsv.z * uTones + 0.5) / uTones;
            // Mild saturation boost for palette-pop
            hsv.y = clamp(hsv.y * uSatBoost, 0.0, 1.0);
            gl_FragColor = vec4(hsv2rgb(hsv), texel.a);
        }
    `
};

// ── Renderer3D class ──────────────────────────────────────────────────────────

class Renderer3D {
    /**
     * @param {HTMLElement}   container  Mount target; canvas is appended here
     * @param {THREE.Scene}   scene      Shared scene reference
     * @param {THREE.Camera}  camera     Active camera reference
     * @param {object}        [options]
     * @param {boolean}       [options.outline=true]   Enable OutlinePass
     * @param {boolean}       [options.cel=true]       Enable cel quantization
     * @param {number}        [options.tones=3]        Cel tone count
     * @param {number}        [options.outlinePx=1.5]  Outline thickness in px
     */
    constructor(container, scene, camera, options = {}) {
        this.container = container;
        this.scene     = scene;
        this.camera    = camera;

        this._opts = {
            outline:   options.outline   !== false,
            cel:       options.cel       !== false,
            tones:     options.tones     ?? 3,
            outlinePx: options.outlinePx ?? 1.5,
        };

        /** @type {THREE.WebGLRenderer} */
        this.webgl = null;

        /** @type {EffectComposer} */
        this.composer = null;

        /** @type {OutlinePass|null} */
        this.outlinePass = null;

        /** @type {ShaderPass|null} */
        this.celPass = null;

        /** @type {Pass[]} */
        this._extraPasses = [];

        // Fixed-step accumulator for 60 FPS target
        this._fixedStep  = 1 / 60;
        this._accumulator = 0;

        this._resizeObserver = null;
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    /**
     * Build the WebGLRenderer and post-processing composer.
     * Must be called once before render().
     */
    init() {
        const { width, height } = this._size();

        // ── WebGLRenderer ────────────────────────────────────────────────────
        this.webgl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
        this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.webgl.setSize(width, height);
        // Low-poly style: no tone mapping, no HDR
        this.webgl.toneMapping          = THREE.NoToneMapping;
        this.webgl.shadowMap.enabled    = true;
        this.webgl.shadowMap.type       = THREE.PCFSoftShadowMap;
        // Flat shading default on new MeshLambertMaterial (set per-material in engines)
        this.container.appendChild(this.webgl.domElement);

        // ── EffectComposer ───────────────────────────────────────────────────
        this.composer = new EffectComposer(this.webgl);

        // Pass 1 — standard scene render
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Pass 2 — OutlinePass (black cel edges, 1-2 px)
        if (this._opts.outline) {
            this.outlinePass = new OutlinePass(
                new THREE.Vector2(width, height),
                this.scene,
                this.camera
            );
            this.outlinePass.edgeStrength  = 3.0;
            this.outlinePass.edgeGlow      = 0.0;
            this.outlinePass.edgeThickness = this._opts.outlinePx;
            this.outlinePass.visibleEdgeColor.set('#000000');
            this.outlinePass.hiddenEdgeColor.set('#000000');
            this.composer.addPass(this.outlinePass);
        }

        // Pass 3 — 3-tone cel quantization
        if (this._opts.cel) {
            this.celPass = new ShaderPass(CelQuantizeShader);
            this.celPass.uniforms.uTones.value = this._opts.tones;
            this.composer.addPass(this.celPass);
        }

        // ── Resize observer ──────────────────────────────────────────────────
        this._resizeObserver = new ResizeObserver(() => this._onResize());
        this._resizeObserver.observe(this.container);

        return this; // fluent
    }

    // ── Per-frame render ─────────────────────────────────────────────────────

    /**
     * Advance the fixed-step accumulator and render one composer frame.
     * Call once per RAF callback from Engine3DBase._loop().
     * @param {number} delta  Elapsed seconds since last frame (already capped by Engine3DBase)
     */
    render(delta) {
        this._accumulator += delta;

        // Consume fixed steps (prevents spiral-of-death via Engine3DBase cap)
        while (this._accumulator >= this._fixedStep) {
            this._accumulator -= this._fixedStep;
        }

        this.composer.render(delta);
    }

    // ── Post-processing API ──────────────────────────────────────────────────

    /**
     * Replace extra passes appended after the built-in pipeline.
     * Called by subclass engines for engine-specific FX.
     * @param {Pass[]} passes
     */
    setPostProcessing(passes) {
        // Remove old extras
        this._extraPasses.forEach(p => {
            const idx = this.composer.passes.indexOf(p);
            if (idx !== -1) this.composer.passes.splice(idx, 1);
        });
        this._extraPasses = passes;
        passes.forEach(p => this.composer.addPass(p));
    }

    /**
     * Add meshes to the OutlinePass selected-objects list.
     * @param {THREE.Mesh[]} meshes
     */
    addOutlined(meshes) {
        if (this.outlinePass) {
            this.outlinePass.selectedObjects = [
                ...this.outlinePass.selectedObjects,
                ...meshes
            ];
        }
    }

    /**
     * Clear the OutlinePass selection.
     */
    clearOutlined() {
        if (this.outlinePass) this.outlinePass.selectedObjects = [];
    }

    /**
     * Adjust the cel tone count at runtime (e.g. low-health desaturation).
     * @param {number} tones  Integer 1–6
     */
    setCelTones(tones) {
        if (this.celPass) this.celPass.uniforms.uTones.value = tones;
    }

    // ── Resize ───────────────────────────────────────────────────────────────

    resize() {
        this._onResize();
    }

    _onResize() {
        const { width, height } = this._size();
        this.webgl.setSize(width, height);
        this.composer.setSize(width, height);
        if (this.outlinePass) {
            this.outlinePass.resolution.set(width, height);
        }
        if (this.camera && this.camera.isPerspectiveCamera) {
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
        }
    }

    _size() {
        return {
            width:  this.container.clientWidth  || window.innerWidth,
            height: this.container.clientHeight || window.innerHeight,
        };
    }

    // ── Dispose ──────────────────────────────────────────────────────────────

    dispose() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        if (this.webgl) {
            this.webgl.dispose();
            if (this.webgl.domElement.parentNode) {
                this.webgl.domElement.parentNode.removeChild(this.webgl.domElement);
            }
            this.webgl = null;
        }
        this.composer = null;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Apply THREE.FlatShading to every mesh in a scene/group.
 * Call after loading GLTF/vox models to enforce the low-poly look.
 * @param {THREE.Object3D} root
 */
export function applyFlatShading(root) {
    root.traverse(obj => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
            m.flatShading = true;
            m.needsUpdate = true;
        });
    });
}

/**
 * Create a standard low-poly Lambert material from a THREE.Color or hex.
 * @param {number|string} color  Hex color (e.g. 0x4caf50 or '#4caf50')
 * @returns {THREE.MeshLambertMaterial}
 */
export function paletteMaterial(color) {
    return new THREE.MeshLambertMaterial({
        color,
        flatShading: true,
    });
}

export { CelQuantizeShader };
export default Renderer3D;
