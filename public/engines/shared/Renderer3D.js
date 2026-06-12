/**
 * Renderer3D.js — WebGL renderer + cel/outline post-processing pipeline.
 */

import * as THREE from '/lib/three/three.module.js';
import { EffectComposer } from '/lib/three/postprocessing/EffectComposer.js';
import { RenderPass }     from '/lib/three/postprocessing/RenderPass.js';
import { ShaderPass }     from '/lib/three/postprocessing/ShaderPass.js';
import { OutlinePass }    from '/lib/three/postprocessing/OutlinePass.js';
import { OutputPass }     from './OutputPass.js';

// ── 3-tone cel quantization shader ───────────────────────────────────────────
const CelQuantizeShader = {
    name: 'CelQuantizeShader',
    uniforms: {
        tDiffuse:  { value: null },
        uTones:    { value: 3.0 },
        uSatBoost: { value: 1.1 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
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
            float levels = max(1.0, uTones - 1.0);
            hsv.z = floor(hsv.z * levels + 0.5) / levels;
            hsv.y = clamp(hsv.y * uSatBoost, 0.0, 1.0);
            gl_FragColor = vec4(hsv2rgb(hsv), texel.a);
        }
    `
};

// ── Color Grading Shader ─────────────────────────────────────────────────────
const ColorGradingShader = {
    name: 'ColorGradingShader',
    uniforms: {
        tDiffuse: { value: null },
        uBrightness: { value: 1.0 },
        uContrast: { value: 1.0 },
        uSaturation: { value: 1.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uBrightness;
        uniform float uContrast;
        uniform float uSaturation;
        varying vec2 vUv;
        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            
            // Brightness
            vec3 color = texel.rgb * uBrightness;
            
            // Contrast
            color = (color - 0.5) * max(uContrast, 0.0) + 0.5;
            
            // Saturation
            const vec3 W = vec3(0.2125, 0.7154, 0.0721);
            vec3 intensity = vec3(dot(color, W));
            color = mix(intensity, color, uSaturation);
            
            gl_FragColor = vec4(color, texel.a);
        }
    `
};

// ── Screen Fog Shader ────────────────────────────────────────────────────────
const ScreenFogShader = {
    name: 'ScreenFogShader',
    uniforms: {
        tDiffuse: { value: null },
        uFogColor: { value: new THREE.Color(0x000000) },
        uFogDensity: { value: 0.5 },
        uFogHeightMin: { value: 0.0 },
        uFogHeightMax: { value: 1.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform float uFogHeightMin;
        uniform float uFogHeightMax;
        varying vec2 vUv;
        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            
            // Simple gradient based on screen Y
            float factor = smoothstep(uFogHeightMin, uFogHeightMax, vUv.y);
            factor = clamp(factor * uFogDensity, 0.0, 1.0);
            
            gl_FragColor = vec4(mix(uFogColor, texel.rgb, factor), texel.a);
        }
    `
};

// ── Glow Shader (Pseudo-bloom) ───────────────────────────────────────────────
const GlowShader = {
    name: 'GlowShader',
    uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 1.0 },
        uThreshold: { value: 0.8 },
        uRadius: { value: 0.005 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uIntensity;
        uniform float uThreshold;
        uniform float uRadius;
        varying vec2 vUv;
        
        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            
            // Simple 5-tap cross blur
            vec3 sum = vec3(0.0);
            vec2 offsets[4];
            offsets[0] = vec2(uRadius, 0.0);
            offsets[1] = vec2(-uRadius, 0.0);
            offsets[2] = vec2(0.0, uRadius);
            offsets[3] = vec2(0.0, -uRadius);
            
            for(int i = 0; i < 4; i++) {
                vec3 sampleColor = texture2D(tDiffuse, vUv + offsets[i]).rgb;
                float brightness = max(max(sampleColor.r, sampleColor.g), sampleColor.b);
                if (brightness > uThreshold) {
                    sum += sampleColor * (brightness - uThreshold);
                }
            }
            
            vec3 finalColor = texel.rgb + (sum * uIntensity);
            gl_FragColor = vec4(finalColor, texel.a);
        }
    `
};

class Renderer3D {
    constructor(container, opts = {}) {
        this.container = container;
        this.THREE     = THREE;
        this.scene     = new THREE.Scene();
        this.camera    = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        this.webgl     = null;
        this.composer  = null;
        this._opts     = {
            canvas:    opts.canvas || null,
            outline:   opts.outline !== false,
            outlinePx: opts.outlinePx || 1.5,
            cel:       opts.cel !== false,
            tones:     opts.tones || 3.0,
            ...opts
        };
        this._resizeObserver = null;
    }

    init() {
        let { width, height } = this._size();
        width = Math.max(width, 16); height = Math.max(height, 16);
        const rOpts = { antialias: false, powerPreference: 'high-performance', alpha: false };
        if (this._opts.canvas) rOpts.canvas = this._opts.canvas;
        this.webgl = new THREE.WebGLRenderer(rOpts);
        this.webgl.setClearColor(0x050505, 1);
        this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.webgl.setSize(width, height);
        this.webgl.outputColorSpace = THREE.SRGBColorSpace;
        this.webgl.toneMapping = THREE.NoToneMapping;
        this.webgl.shadowMap.enabled = true;
        this.webgl.shadowMap.type = THREE.PCFShadowMap;
        if (!this._opts.canvas) this.container.appendChild(this.webgl.domElement);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.composer = new EffectComposer(this.webgl);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        if (this._opts.outline) {
            const op = new OutlinePass(new THREE.Vector2(width, height), this.scene, this.camera);
            op.edgeStrength = 3.0; op.edgeThickness = this._opts.outlinePx;
            op.visibleEdgeColor.set('#000000'); op.hiddenEdgeColor.set('#000000');
            this.composer.addPass(op);
        }
        if (this._opts.cel) {
            const cp = new ShaderPass(CelQuantizeShader);
            cp.uniforms.uTones.value = this._opts.tones;
            this.composer.addPass(cp);
        }
        this.composer.addPass(new OutputPass());
        this._resizeObserver = new ResizeObserver(() => this._onResize());
        this._resizeObserver.observe(this.container);
        return this;
    }

    rebuildPostProcessing(stackConfig = []) {
        if (!this.composer) return;

        let { width, height } = this._size();
        width = Math.max(width, 16); height = Math.max(height, 16);

        // Clear existing passes
        this.composer.passes.forEach(p => { if (p.dispose) p.dispose(); });
        this.composer.passes = [];
        this.outlinePass = null; // Reset outline pass reference

        // Base render pass
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        // Add configured passes
        for (const passConfig of stackConfig) {
            if (passConfig.type === 'outline') {
                const op = new OutlinePass(new THREE.Vector2(width, height), this.scene, this.camera);
                op.edgeStrength = passConfig.edgeStrength ?? 3.0;
                op.edgeThickness = passConfig.edgeThickness ?? 1.5;
                op.visibleEdgeColor.set(passConfig.edgeColor || '#000000');
                op.hiddenEdgeColor.set(passConfig.edgeColor || '#000000');
                this.outlinePass = op; // Save for selection highlighting
                this.composer.addPass(op);
            }
            else if (passConfig.type === 'cel') {
                const cp = new ShaderPass(CelQuantizeShader);
                cp.uniforms.uTones.value = passConfig.tones ?? 3.0;
                cp.uniforms.uSatBoost.value = passConfig.satBoost ?? 1.1;
                this.composer.addPass(cp);
            }
            else if (passConfig.type === 'color_grading') {
                const cg = new ShaderPass(ColorGradingShader);
                cg.uniforms.uBrightness.value = passConfig.brightness ?? 1.0;
                cg.uniforms.uContrast.value = passConfig.contrast ?? 1.0;
                cg.uniforms.uSaturation.value = passConfig.saturation ?? 1.0;
                this.composer.addPass(cg);
            }
            else if (passConfig.type === 'fog') {
                const fp = new ShaderPass(ScreenFogShader);
                fp.uniforms.uFogColor.value = new THREE.Color(passConfig.color || '#000000');
                fp.uniforms.uFogDensity.value = passConfig.density ?? 0.5;
                fp.uniforms.uFogHeightMin.value = passConfig.heightMin ?? 0.0;
                fp.uniforms.uFogHeightMax.value = passConfig.heightMax ?? 1.0;
                this.composer.addPass(fp);
            }
            else if (passConfig.type === 'glow') {
                const gp = new ShaderPass(GlowShader);
                gp.uniforms.uIntensity.value = passConfig.intensity ?? 1.0;
                gp.uniforms.uThreshold.value = passConfig.threshold ?? 0.8;
                gp.uniforms.uRadius.value = passConfig.radius ?? 0.005;
                this.composer.addPass(gp);
            }
        }

        // Final output
        this.composer.addPass(new OutputPass());
    }

    render() { if (this.composer) this.composer.render(); }

    resize(width, height) {
        if (width > 0 && height > 0 && this.webgl) {
            this.webgl.setSize(width, height);
            if (this.composer) this.composer.setSize(width, height);
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
        }
    }

    _size() { 
        return { 
            width: this.container.clientWidth, 
            height: this.container.clientHeight 
        }; 
    }

    _onResize() {
        const { width, height } = this._size();
        if (width <= 0 || height <= 0 || !this.webgl) return;

        // Only resize if different to avoid flickering/looping
        const currentSize = new THREE.Vector2();
        this.webgl.getSize(currentSize);
        if (currentSize.x === width && currentSize.y === height) return;

        this.webgl.setSize(width, height);
        if (this.composer) this.composer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }


    dispose() { this._resizeObserver?.disconnect(); this.webgl?.dispose(); this.composer?.dispose(); }
}

/**
 * PrimitiveFactory — Ensures identical geometry generation across Editor and Engine.
 */
export const PrimitiveFactory = {
    create(type, w, h, d) {
        type = (type || 'box').toLowerCase();
        switch (type) {
            case 'plane':    return new THREE.PlaneGeometry(w, d);
            case 'pillar':
            case 'cylinder': return new THREE.CylinderGeometry(w/2, w/2, h, 32);
            case 'sphere':   return new THREE.SphereGeometry(w/2, 32, 24);
            case 'cone':     return new THREE.ConeGeometry(w/2, h, 32);
            case 'slope':    return this._buildSlope(w, h, d);
            case 'wedge':    return this._buildWedge(w, h, d);
            case 'stairs':   return this._buildStairs(w, h, d);
            case 'arch':     const g = new THREE.BoxGeometry(w, h * 0.3, d); g.translate(0, h * 0.85, 0); return g;
            default:         return new THREE.BoxGeometry(w, h, d);
        }
    },

    _buildSlope(w, h, d) {
        const hw = w / 2, hd = d / 2;
        const pos = new Float32Array([-hw,0,hd, hw,0,hd, hw,0,-hd, -hw,0,-hd, -hw,h,hd, hw,h,hd]);
        const idx = [0,1,5, 0,5,4, 1,2,5, 0,3,2, 0,2,1, 3,0,4, 4,5,2, 4,2,3, 2,3,4, 2,4,5];
        // Wait, looking at the previous line: 1,2,5 and 0,3,2 and 0,2,1 and 3,0,4...
        // Let's just normalize it to proper CCW.
        const normalizedIdx = [
            0,1,5, 0,5,4, // Front/Slope
            1,2,5,        // Right side (1:R-F-B, 2:R-B-B, 5:R-F-T)
            2,3,0, 2,0,1, // Bottom
            3,0,4,        // Left side (3:L-B-B, 0:L-F-B, 4:L-F-T)
            4,5,2, 4,2,3  // Back/Top
        ];
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setIndex(normalizedIdx); geo.computeVertexNormals(); return geo;
    },

    _buildWedge(w, h, d) {
        const hw = w / 2, hd = d / 2;
        const pos = new Float32Array([-hw,0,hd, hw,0,hd, hw,0,-hd, -hw,0,-hd, -hw,h,hd]);
        const idx = [0,1,4, 1,2,4, 2,3,4, 3,0,4, 0,3,2, 0,2,1];
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setIndex(idx); geo.computeVertexNormals(); return geo;
    },

    _buildStairs(w, h, d) {
        const STEPS = 4, sw = w, sh = h/STEPS, sd = d/STEPS, pos = [], idx = [];
        let vi = 0;
        for (let i=0; i<STEPS; i++) {
            const z0 = d/2 - i*sd, z1 = z0 - sd, y1 = (i+1)*sh, hw = sw/2;
            pos.push(-hw,0,z0, hw,0,z0, hw,y1,z0, -hw,y1,z0); idx.push(vi,vi+1,vi+2, vi,vi+2,vi+3); vi+=4;
            pos.push(-hw,y1,z0, hw,y1,z0, hw,y1,z1, -hw,y1,z1); idx.push(vi,vi+1,vi+2, vi,vi+2,vi+3); vi+=4;
        }
        const hw = sw/2; pos.push(-hw,0,d/2, hw,0,d/2, hw,0,-d/2, -hw,0,-d/2);
        idx.push(vi,vi+2,vi+1, vi,vi+3,vi+2);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
        geo.setIndex(idx); geo.computeVertexNormals(); return geo;
    }
};

export function applyFlatShading(obj) {
    obj.traverse(c => {
        if (c.isMesh && c.material) {
            if (Array.isArray(c.material)) c.material.forEach(m => { m.flatShading = true; m.needsUpdate = true; });
            else { c.material.flatShading = true; c.material.needsUpdate = true; }
        }
    });
}
const _hexMatCache = {};
export function hexMaterial(color) {
    if (!_hexMatCache[color]) {
        _hexMatCache[color] = new THREE.MeshLambertMaterial({ 
            color: new THREE.Color(color), 
            flatShading: true,
            emissive: new THREE.Color(color),
            emissiveIntensity: 0.02 // Reduced from 0.05 to restore shadow depth
        });
    }
    return _hexMatCache[color];
}
// ── Exports ───────────────────────────────────────────────────────────────────

export { CelQuantizeShader };
export default Renderer3D;

// Expose to window for standard scripts (Editors)
if (typeof window !== 'undefined') {
    window.Renderer3D = Renderer3D;
    window.PrimitiveFactory = PrimitiveFactory;
}
