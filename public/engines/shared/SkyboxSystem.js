/**
 * SkyboxSystem.js — Shared skybox and environment system for Vortex 3D.
 *
 * Supports:
 *   - Solid color backgrounds
 *   - 2-color vertical gradients (Atmospheric)
 *   - "Fake" voxel stars/clouds (procedural)
 *   - Sync with Fog
 *
 * Visual style: Low-poly / Pixel-art friendly. No high-res textures.
 */

import * as THREE from '/lib/three/three.module.js';

class SkyboxSystem {
    /**
     * @param {THREE.Scene} scene
     */
    constructor(scene) {
        this.scene = scene;
        this.mesh  = null;
        this.mode  = 'gradient'; // 'solid' | 'gradient' | 'voxel'
        
        this.config = {
            topColor:    '#3a6a8a',
            bottomColor: '#ccddee',
            fogSync:     true
        };
    }

    /**
     * Set a simple solid background color.
     * @param {string|number} color 
     */
    setSolid(color) {
        this.mode = 'solid';
        this._cleanup();
        this.scene.background = new THREE.Color(color);
        if (this.config.fogSync && this.scene.fog) {
            this.scene.fog.color.set(color);
        }
    }

    /**
     * Set a vertical gradient skybox using a large inverted sphere.
     * @param {string} topColor 
     * @param {string} bottomColor 
     */
    setGradient(topColor, bottomColor) {
        this.mode = 'gradient';
        this.config.topColor = topColor;
        this.config.bottomColor = bottomColor;

        this._cleanup();

        // We use a large sphere for the gradient
        const geometry = new THREE.SphereGeometry(400, 32, 15);
        const material = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {
                uTopColor:    { value: new THREE.Color(topColor) },
                uBottomColor: { value: new THREE.Color(bottomColor) },
                uExponent:    { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vWorldPosition;
                uniform vec3 uTopColor;
                uniform vec3 uBottomColor;
                uniform float uExponent;
                void main() {
                    // Use world position normalization to create the 'Eyeball' effect
                    float h = normalize(vWorldPosition).y;
                    float t = max(pow(max(h, 0.0), uExponent), 0.0);
                    gl_FragColor = vec4(mix(uBottomColor, uTopColor, t), 1.0);
                }
            `
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.name = 'skybox_mesh';
        this.mesh.renderOrder = -100; // render behind everything else
        this.scene.add(this.mesh);
        
        // Fallback: set scene background to bottomColor so it's not pure black
        this.scene.background = new THREE.Color(bottomColor);
    }

    /**
     * Set a voxel-style procedural sky (stars/clouds).
     * Currently a placeholder for future implementation.
     */
    setVoxelSky() {
        this.setGradient('#050510', '#1a1a2a');
        // TODO: Add tiny cubes as stars
    }

    /**
     * Apply a preset or full config object.
     * @param {object} cfg 
     */
    applyConfig(cfg) {
        if (!cfg) return;
        if (cfg.mode) this.mode = cfg.mode;
        if (cfg.topColor)    this.config.topColor = cfg.topColor;
        if (cfg.bottomColor) this.config.bottomColor = cfg.bottomColor;
        
        if (this.mode === 'gradient') {
            this.setGradient(this.config.topColor, this.config.bottomColor);
        } else if (this.mode === 'solid') {
            this.setSolid(this.config.topColor);
        }
    }

    update(camera) {
        if (this.mesh && camera) {
            this.mesh.position.copy(camera.position);
        }
    }

    _cleanup() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.mesh = null;
        }
    }

    dispose() {
        this._cleanup();
    }
}

export default SkyboxSystem;
