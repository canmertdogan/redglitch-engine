/**
 * SkyboxSystem.js — Shared skybox and environment system for RedGlitch 3D.
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

const SKYBOX_PRESETS = {
    'unified-3d': {
        type: 'gradient',
        mode: 'gradient',
        topColor: '#1a2a3a',
        bottomColor: '#87ceeb',
        colorHex: '#87ceeb',
        fogSync: true,
        fallbackMode: 'gradient',
        top_index: null,
        bottom_index: null,
        sun: { color: '#fffbe0', intensity: 1.4, azimuth: 45, elevation: 45 },
        moon: { enabled: true, color: '#dce8ff', intensity: 0.25, azimuth: 225, elevation: 25 },
        weather: { enabled: false, type: 'clear', intensity: 0.35, windX: 0.4, windZ: 0.1 },
    },
    'topdown-3d': {
        type: 'gradient',
        mode: 'gradient',
        topColor: '#3a6a8a',
        bottomColor: '#ccddee',
        colorHex: '#ccddee',
        fogSync: true,
        fallbackMode: 'gradient',
        top_index: null,
        bottom_index: null,
        sun: { color: '#fffbe0', intensity: 1.2, azimuth: 45, elevation: 45 },
        moon: { enabled: true, color: '#dce8ff', intensity: 0.22, azimuth: 225, elevation: 25 },
        weather: { enabled: false, type: 'clear', intensity: 0.35, windX: 0.4, windZ: 0.1 },
    },
    'fps-3d': {
        type: 'gradient',
        mode: 'gradient',
        topColor: '#2f5f78',
        bottomColor: '#8eaeb8',
        colorHex: '#8eaeb8',
        fogSync: true,
        fallbackMode: 'gradient',
        top_index: null,
        bottom_index: null,
        sun: { color: '#ffe0ad', intensity: 0.9, azimuth: 38, elevation: 48 },
        moon: { enabled: true, color: '#c8d8ff', intensity: 0.08, azimuth: 210, elevation: 30 },
        weather: { enabled: false, type: 'clear', intensity: 0.35, windX: 0.4, windZ: 0.1 },
    },
    'platformer-3d': {
        type: 'gradient',
        mode: 'gradient',
        topColor: '#1a3a6a',
        bottomColor: '#ffffff',
        colorHex: '#ffffff',
        fogSync: true,
        fallbackMode: 'gradient',
        top_index: null,
        bottom_index: null,
        sun: { color: '#fff4cc', intensity: 1.3, azimuth: 45, elevation: 50 },
        moon: { enabled: true, color: '#dce8ff', intensity: 0.18, azimuth: 225, elevation: 22 },
        weather: { enabled: false, type: 'clear', intensity: 0.35, windX: 0.4, windZ: 0.1 },
    },
};

function _cloneSunConfig(sun = {}) {
    return {
        color: sun.color || '#fffbe0',
        intensity: Number.isFinite(Number(sun.intensity)) ? Number(sun.intensity) : 1.2,
        azimuth: Number.isFinite(Number(sun.azimuth)) ? Number(sun.azimuth) : 45,
        elevation: Number.isFinite(Number(sun.elevation)) ? Number(sun.elevation) : 45,
    };
}

function _normalizeMode(value, fallback = 'gradient') {
    const mode = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (mode === 'solid' || mode === 'gradient' || mode === 'voxel') return mode;
    return fallback;
}

function _normalizeNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function _hashSeed(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) {
        return seed >>> 0;
    }
    const text = String(seed ?? 'redglitch-skybox');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function _mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function _randomRange(rng, min, max) {
    return min + (max - min) * rng();
}

function _randomUnitVector(rng) {
    const u = rng() * 2 - 1;
    const theta = rng() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    return {
        x: Math.cos(theta) * s,
        y: u,
        z: Math.sin(theta) * s,
    };
}

function _randomHemisphereVector(rng, minY = 0.08) {
    const v = _randomUnitVector(rng);
    if (v.y < minY) v.y = Math.abs(v.y) + minY;
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function _colorToHex(value, paletteManager = null) {
    if (value == null || value === '') return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (paletteManager && typeof paletteManager.getColor === 'function') {
            const paletteColor = paletteManager.getColor(value);
            if (paletteColor && typeof paletteColor.getHexString === 'function') {
                return `#${paletteColor.getHexString()}`;
            }
        }
        return null;
    }
    if (value && typeof value.getHexString === 'function') {
        return `#${value.getHexString()}`;
    }
    if (value && typeof value === 'object') {
        if (typeof value.color !== 'undefined') {
            return _colorToHex(value.color, paletteManager);
        }
        if (Number.isFinite(Number(value.r)) && Number.isFinite(Number(value.g)) && Number.isFinite(Number(value.b))) {
            const r = Math.max(0, Math.min(255, Math.round(Number(value.r) * 255)));
            const g = Math.max(0, Math.min(255, Math.round(Number(value.g) * 255)));
            const b = Math.max(0, Math.min(255, Math.round(Number(value.b) * 255)));
            return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
        }
    }
    return null;
}

function _resolvePaletteIndex(index, paletteManager, fallback) {
    if (!Number.isFinite(Number(index))) return fallback;
    if (!paletteManager || typeof paletteManager.getColor !== 'function') return fallback;
    const color = paletteManager.getColor(Number(index));
    return color && typeof color.getHexString === 'function'
        ? `#${color.getHexString()}`
        : fallback;
}

function _normalizeSunConfig(source, defaults) {
    const sunSource = source && typeof source.sun === 'object' && source.sun !== null ? source.sun : {};
    const color = _colorToHex(
        source?.sunColor ?? source?.sun?.color ?? source?.sun?.colorHex ?? sunSource.color ?? sunSource.colorHex,
        null,
    ) || defaults.sun.color;

    return {
        color,
        intensity: _normalizeNumber(source?.sunIntensity ?? source?.sun?.intensity ?? sunSource.intensity, defaults.sun.intensity),
        azimuth: _normalizeNumber(source?.sunAzimuth ?? source?.sun?.azimuth ?? sunSource.azimuth, defaults.sun.azimuth),
        elevation: _normalizeNumber(source?.sunElevation ?? source?.sun?.elevation ?? sunSource.elevation, defaults.sun.elevation),
    };
}

function _createPreset(engineType) {
    const preset = SKYBOX_PRESETS[engineType] || SKYBOX_PRESETS['unified-3d'];
    return {
        ...preset,
        sun: _cloneSunConfig(preset.sun),
    };
}

export function createDefaultSkyboxConfig(engineType = 'unified-3d') {
    return _createPreset(engineType);
}

export function normalizeSkyboxConfig(input = null, options = {}) {
    const engineType = options.engineType || input?.engineType || 'unified-3d';
    const paletteManager = options.paletteManager ?? null;
    const fallbackFog = options.fallbackFog ?? options.fog ?? null;
    const defaults = createDefaultSkyboxConfig(engineType);

    const source = typeof input === 'string'
        ? { type: 'solid', colorHex: input }
        : (input && typeof input === 'object' ? input : {});

    const topIndex = Number.isFinite(Number(source.top_index ?? source.topIndex))
        ? Number(source.top_index ?? source.topIndex)
        : null;
    const bottomIndex = Number.isFinite(Number(source.bottom_index ?? source.bottomIndex))
        ? Number(source.bottom_index ?? source.bottomIndex)
        : null;

    const fogColor = _colorToHex(
        source?.fog?.color ?? source?.fogColor ?? fallbackFog?.color ?? fallbackFog?.colorHex,
        paletteManager,
    );

    let topColor = _colorToHex(
        source.topColor ?? source.skyTop ?? source.top ?? source.horizonTop,
        paletteManager,
    );
    let bottomColor = _colorToHex(
        source.bottomColor ?? source.skyHorizon ?? source.bottom ?? source.horizonColor,
        paletteManager,
    );
    let colorHex = _colorToHex(
        source.colorHex ?? source.color ?? source.fallbackColor,
        paletteManager,
    );

    if (!topColor && topIndex != null) {
        topColor = _resolvePaletteIndex(topIndex, paletteManager, defaults.topColor);
    }
    if (!bottomColor && bottomIndex != null) {
        bottomColor = _resolvePaletteIndex(bottomIndex, paletteManager, defaults.bottomColor);
    }
    if (!bottomColor && fogColor) {
        bottomColor = fogColor;
    }
    if (!topColor) topColor = defaults.topColor;
    if (!bottomColor) bottomColor = defaults.bottomColor;
    if (!colorHex) colorHex = bottomColor || topColor || defaults.colorHex;

    let type = _normalizeMode(source.type ?? source.mode, null);
    if (!type) {
        if (source.colorHex != null || source.color != null) {
            type = 'solid';
        } else if (
            source.topColor != null || source.bottomColor != null ||
            source.skyTop != null || source.skyHorizon != null ||
            topIndex != null || bottomIndex != null
        ) {
            type = topColor === bottomColor ? 'solid' : 'gradient';
        } else {
            type = defaults.type;
        }
    }

    const fallbackMode = _normalizeMode(
        source.fallbackMode ?? source.fallback ?? source.fallbackType,
        defaults.fallbackMode,
    );
    const sun = _normalizeSunConfig(source, defaults);
    const fogSync = source.fogSync !== undefined ? !!source.fogSync : defaults.fogSync;

    return {
        ...source,
        type,
        mode: type,
        topColor,
        bottomColor,
        colorHex: type === 'solid' ? colorHex : (colorHex || bottomColor),
        fogSync,
        fallbackMode,
        top_index: topIndex,
        bottom_index: bottomIndex,
        sun,
        sunColor: sun.color,
        sunIntensity: sun.intensity,
        sunAzimuth: sun.azimuth,
        sunElevation: sun.elevation,
    };
}

export const DEFAULT_SKYBOX_CONFIG = createDefaultSkyboxConfig('unified-3d');

class SkyboxSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {object} [options]
     */
    constructor(scene, options = {}) {
        this.scene = scene;
        this.mesh = null;
        this.mode = 'gradient'; // 'solid' | 'gradient' | 'voxel'
        this._ownsBackground = false;
        this._backgroundColor = null;
        this._lastUpdateAt = 0;
        this._voxelState = null;
        this.config = normalizeSkyboxConfig(
            options.config ?? options.skybox ?? null,
            {
                engineType: options.engineType || 'unified-3d',
                paletteManager: options.paletteManager ?? null,
                fallbackFog: options.fog ?? null,
            },
        );
    }

    /**
     * Set a simple solid background color.
     * @param {string|number} color
     */
    setSolid(color, options = {}) {
        return this.applyConfig(
            { ...this.config, type: 'solid', colorHex: color, topColor: color, bottomColor: color },
            options,
        );
    }

    /**
     * Alias used by older lighting code.
     * @param {string|number} topColor
     * @param {string|number} bottomColor
     * @param {object} [options]
     */
    setColors(topColor, bottomColor, options = {}) {
        return this.setGradient(topColor, bottomColor, options);
    }

    /**
     * Set a vertical gradient skybox using a large inverted sphere.
     * @param {string|number} topColor
     * @param {string|number} bottomColor
     * @param {object} [options]
     */
    setGradient(topColor, bottomColor, options = {}) {
        return this.applyConfig(
            {
                ...this.config,
                type: 'gradient',
                topColor,
                bottomColor,
                colorHex: options.colorHex ?? bottomColor,
            },
            options,
        );
    }

    /**
     * Set a voxel-style procedural sky (stars/clouds).
     * Currently falls back to gradient/solid rendering until the voxel phase lands.
     * @param {object} [config]
     * @param {object} [options]
     */
    setVoxelSky(config = {}, options = {}) {
        return this.applyConfig(
            { ...this.config, ...config, type: 'voxel' },
            options,
        );
    }

    /**
     * Apply a preset or full config object.
     * @param {object} cfg
     * @param {object} [options]
     */
    applyConfig(cfg, options = {}) {
        if (!cfg) return this.getConfig();
        const normalized = normalizeSkyboxConfig(cfg, options);
        this.config = normalized;
        this.mode = normalized.type;
        this._lastUpdateAt = 0;

        if (normalized.type === 'solid') {
            this._applySolid(normalized);
        } else if (normalized.type === 'voxel') {
            this._applyVoxel(normalized);
        } else {
            this._applyGradient(normalized);
        }

        return this.getConfig();
    }

    getConfig() {
        return {
            ...this.config,
            sun: { ...this.config.sun },
        };
    }

    update(camera, deltaSeconds = null) {
        const now = (typeof performance !== 'undefined' && performance.now)
            ? performance.now()
            : Date.now();
        const dt = Number.isFinite(deltaSeconds)
            ? _clamp(deltaSeconds, 0, 0.1)
            : (this._lastUpdateAt > 0 ? _clamp((now - this._lastUpdateAt) / 1000, 0, 0.1) : 0);
        this._lastUpdateAt = now;

        if (this.mesh && camera) {
            this.mesh.position.copy(camera.position);
            this.mesh.updateMatrixWorld?.(true);
        }

        if (this.mode === 'voxel' && this._voxelState) {
            this._advanceVoxel(dt);
        }
    }

    _applySolid(config) {
        this._cleanup();
        const color = config.colorHex || config.bottomColor || config.topColor || '#000000';
        this.scene.background = new THREE.Color(color);
        this._ownsBackground = true;
        this._backgroundColor = color;
        if (config.fogSync && this.scene.fog?.color) {
            this.scene.fog.color.set(color);
        }
    }

    _applyGradient(config) {
        this._cleanup();
        this.mesh = this._createGradientShell(config);
        this.scene.add(this.mesh);
        const bottomColor = config.bottomColor || config.colorHex || '#ccddee';
        this.scene.background = new THREE.Color(bottomColor);
        this._ownsBackground = true;
        this._backgroundColor = bottomColor;
        if (config.fogSync && this.scene.fog?.color) {
            this.scene.fog.color.set(bottomColor);
        }
    }

    _applyVoxel(config) {
        this._cleanup();

        const cfg = {
            seed: config.seed ?? config.skySeed ?? config.skyboxSeed ?? 1337,
            starCount: Math.max(32, Math.floor(config.starCount ?? 220)),
            starRadius: Math.max(120, Number(config.starRadius ?? 360)),
            starSize: Math.max(0.03, Number(config.starSize ?? 0.12)),
            starOpacity: _clamp(Number(config.starOpacity ?? 0.95), 0.1, 1),
            cloudCount: Math.max(2, Math.floor(config.cloudCount ?? 12)),
            cloudPuffs: Math.max(3, Math.floor(config.cloudPuffs ?? 8)),
            cloudRadius: Math.max(80, Number(config.cloudRadius ?? 220)),
            cloudBand: Math.max(20, Number(config.cloudBand ?? 90)),
            cloudSize: Math.max(0.5, Number(config.cloudSize ?? 2.8)),
            cloudOpacity: _clamp(Number(config.cloudOpacity ?? 0.34), 0.05, 1),
            cloudSpeed: Number(config.cloudSpeed ?? 0.02),
            cloudTilt: Number(config.cloudTilt ?? 0.12),
            cloudColor: config.cloudColor || '#ffffff',
            cloudTint: config.cloudTint || '#f6fbff',
            starColors: Array.isArray(config.starColors) && config.starColors.length > 0
                ? config.starColors
                : ['#ffffff', '#fff4d6', '#cfe8ff'],
            topColor: config.topColor || '#1a2a3a',
            bottomColor: config.bottomColor || '#0a0806',
            fallbackMode: config.fallbackMode || 'gradient',
            fogSync: config.fogSync !== undefined ? !!config.fogSync : true,
        };

        const rng = _mulberry32(_hashSeed(cfg.seed));
        const root = new THREE.Group();
        root.name = 'skybox_voxel_root';
        root.renderOrder = -100;
        root.frustumCulled = false;

        if (cfg.fallbackMode !== 'solid') {
            const shell = this._createGradientShell({
                topColor: cfg.topColor,
                bottomColor: cfg.bottomColor,
            });
            shell.renderOrder = -100;
            root.add(shell);
        } else {
            this.scene.background = new THREE.Color(cfg.bottomColor);
        }

        const stars = this._createVoxelStarField(cfg, rng);
        stars.renderOrder = -99;
        root.add(stars);

        const clouds = this._createVoxelCloudField(cfg, rng);
        clouds.renderOrder = -98;
        root.add(clouds);

        this.mesh = root;
        this.scene.add(root);
        this.scene.background = new THREE.Color(cfg.bottomColor);
        this._ownsBackground = true;
        this._backgroundColor = cfg.bottomColor;
        if (cfg.fogSync && this.scene.fog?.color) {
            this.scene.fog.color.set(cfg.bottomColor);
        }

        this._voxelState = {
            cfg,
            time: 0,
            root,
            stars,
            clouds,
        };
    }

    _createGradientShell(config) {
        const topColor = config.topColor || config.colorHex || '#3a6a8a';
        const bottomColor = config.bottomColor || config.colorHex || '#ccddee';

        const geometry = new THREE.SphereGeometry(400, 32, 15);
        const material = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {
                uTopColor: { value: new THREE.Color(topColor) },
                uBottomColor: { value: new THREE.Color(bottomColor) },
                uExponent: { value: 0.6 },
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
                    float h = normalize(vWorldPosition).y;
                    float t = max(pow(max(h, 0.0), uExponent), 0.0);
                    gl_FragColor = vec4(mix(uBottomColor, uTopColor, t), 1.0);
                }
            `,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'skybox_mesh';
        mesh.renderOrder = -100;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        return mesh;
    }

    _createVoxelStarField(cfg, rng) {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: cfg.starOpacity,
            depthWrite: false,
            toneMapped: false,
        });
        const mesh = new THREE.InstancedMesh(geometry, material, cfg.starCount);
        mesh.name = 'skybox_voxel_stars';
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (mesh.instanceColor) {
            mesh.instanceColor.setUsage?.(THREE.DynamicDrawUsage);
        }

        const matrix = new THREE.Matrix4();
        const color = new THREE.Color();
        const positions = [];
        for (let i = 0; i < cfg.starCount; i++) {
            const dir = _randomHemisphereVector(rng, 0.1);
            const radius = _randomRange(rng, cfg.starRadius * 0.82, cfg.starRadius * 1.08);
            const scale = _randomRange(rng, cfg.starSize * 0.65, cfg.starSize * 1.35);
            const x = dir.x * radius;
            const y = Math.abs(dir.y) * radius + _randomRange(rng, 8, 36);
            const z = dir.z * radius;

            matrix.compose(
                new THREE.Vector3(x, y, z),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI)),
                new THREE.Vector3(scale, scale, scale),
            );
            mesh.setMatrixAt(i, matrix);

            const starColor = cfg.starColors[Math.floor(rng() * cfg.starColors.length) % cfg.starColors.length];
            color.set(starColor);
            mesh.setColorAt(i, color);
            positions.push({ x, y, z, scale, color: starColor });
        }
        mesh.userData = { positions };
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        return mesh;
    }

    _createVoxelCloudField(cfg, rng) {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(cfg.cloudColor),
            vertexColors: true,
            transparent: true,
            opacity: cfg.cloudOpacity,
            depthWrite: false,
            fog: false,
            toneMapped: false,
        });

        const instanceCount = cfg.cloudCount * cfg.cloudPuffs;
        const mesh = new THREE.InstancedMesh(geometry, material, instanceCount);
        mesh.name = 'skybox_voxel_clouds';
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        const matrix = new THREE.Matrix4();
        const quat = new THREE.Quaternion();
        const color = new THREE.Color(cfg.cloudTint);
        const clouds = [];
        let index = 0;
        for (let c = 0; c < cfg.cloudCount; c++) {
            const dir = _randomHemisphereVector(rng, 0.25);
            const radius = _randomRange(rng, cfg.cloudRadius * 0.8, cfg.cloudRadius * 1.1);
            const baseY = _randomRange(rng, cfg.cloudBand * 0.35, cfg.cloudBand * 1.1);
            const center = new THREE.Vector3(
                dir.x * radius,
                baseY + Math.abs(dir.y) * cfg.cloudBand,
                dir.z * radius,
            );
            const drift = new THREE.Vector3(
                _randomRange(rng, -0.08, 0.08),
                _randomRange(rng, -0.01, 0.03),
                _randomRange(rng, -0.08, 0.08),
            );
            const puffStates = [];

            for (let p = 0; p < cfg.cloudPuffs; p++) {
                const offset = new THREE.Vector3(
                    _randomRange(rng, -cfg.cloudSize, cfg.cloudSize),
                    _randomRange(rng, -cfg.cloudSize * 0.45, cfg.cloudSize * 0.45),
                    _randomRange(rng, -cfg.cloudSize, cfg.cloudSize),
                );
                const scale = new THREE.Vector3(
                    _randomRange(rng, 0.8, 1.8) * cfg.cloudSize,
                    _randomRange(rng, 0.35, 0.9) * cfg.cloudSize,
                    _randomRange(rng, 0.8, 1.8) * cfg.cloudSize,
                );
                const pos = center.clone().add(offset);
                quat.setFromEuler(new THREE.Euler(_randomRange(rng, -0.18, 0.18), _randomRange(rng, 0, Math.PI * 2), _randomRange(rng, -0.18, 0.18)));
                matrix.compose(pos, quat, scale);
                mesh.setMatrixAt(index, matrix);
                if (mesh.setColorAt) mesh.setColorAt(index, color);
                puffStates.push({
                    base: pos.clone(),
                    drift,
                    scale: scale.clone(),
                });
                index++;
            }

            clouds.push({
                center,
                drift,
                puffStates,
            });
        }

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.userData = { clouds, cfg };
        return mesh;
    }

    _advanceVoxel(dt) {
        const state = this._voxelState;
        if (!state) return;
        state.time += Number.isFinite(dt) ? dt : 0;

        if (state.clouds) {
            state.clouds.rotation.y = state.time * state.cfg.cloudSpeed;
            state.clouds.rotation.x = Math.sin(state.time * 0.07) * state.cfg.cloudTilt;
        }

        if (state.stars?.material) {
            const twinkle = 0.88 + Math.sin(state.time * 0.65) * 0.06;
            state.stars.material.opacity = _clamp(twinkle, 0.72, 1);
            state.stars.rotation.y = state.time * 0.005;
        }
    }

    _cleanup() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.traverse?.(node => {
                if (node.geometry) node.geometry.dispose();
                if (node.material) {
                    if (Array.isArray(node.material)) node.material.forEach(mat => mat.dispose());
                    else node.material.dispose();
                }
            });
            this.mesh = null;
        }
        this._voxelState = null;
    }

    dispose() {
        this._cleanup();
        if (this._ownsBackground && this.scene) {
            this.scene.background = null;
        }
        this._ownsBackground = false;
        this._backgroundColor = null;
    }
}

export default SkyboxSystem;
