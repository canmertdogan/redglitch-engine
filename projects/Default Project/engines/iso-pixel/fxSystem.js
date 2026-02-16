// fxSystem.js - Isometric Visual Effects, Particles, Weather, and Lighting

// ============================================
// SOFT LIGHT SYSTEM
// ============================================

class SoftLight {
    constructor(config = {}) {
        this.id = config.id || Math.random().toString(36).substr(2, 9);
        this.x = config.x || 0;           // World X
        this.y = config.y || 0;           // World Y
        this.z = config.z || 0;           // World Z (height)
        this.radius = config.radius || 150;
        this.color = config.color || '#ffaa44';
        this.intensity = config.intensity || 0.7;
        this.falloff = config.falloff || 'smooth';  // 'linear', 'smooth', 'sharp', 'exp'
        this.falloffExp = config.falloffExp || 2;   // Exponent for custom falloff
        this.blendMode = config.blendMode || 'additive';  // 'additive', 'multiply', 'screen'
        this.flickerAmount = config.flickerAmount || 0;
        this.flickerSpeed = config.flickerSpeed || 5;
        this.pulseAmount = config.pulseAmount || 0;
        this.pulseSpeed = config.pulseSpeed || 2;
        this.active = true;
        this.castsShadow = config.castsShadow !== false;
        
        // Runtime state
        this._flickerOffset = Math.random() * 100;
        this._currentIntensity = this.intensity;
        this._currentRadius = this.radius;
    }

    update(dt) {
        if (!this.active) return;
        
        const time = Date.now() * 0.001;
        
        // Flicker effect (like fire/torch)
        if (this.flickerAmount > 0) {
            const flicker = Math.sin(time * this.flickerSpeed + this._flickerOffset) * 0.5 +
                           Math.sin(time * this.flickerSpeed * 2.3 + this._flickerOffset * 1.7) * 0.3 +
                           Math.sin(time * this.flickerSpeed * 5.1 + this._flickerOffset * 0.5) * 0.2;
            this._currentIntensity = this.intensity * (1 + flicker * this.flickerAmount);
        } else {
            this._currentIntensity = this.intensity;
        }
        
        // Pulse effect (smooth breathing)
        if (this.pulseAmount > 0) {
            const pulse = (Math.sin(time * this.pulseSpeed) + 1) * 0.5;
            this._currentRadius = this.radius * (1 + pulse * this.pulseAmount);
        } else {
            this._currentRadius = this.radius;
        }
    }

    // Calculate falloff multiplier at distance ratio (0-1)
    getFalloff(distRatio) {
        const t = Math.min(1, Math.max(0, distRatio));
        switch (this.falloff) {
            case 'linear':
                return 1 - t;
            case 'smooth':
                // Smooth hermite interpolation
                return 1 - (t * t * (3 - 2 * t));
            case 'sharp':
                // Sharp center, quick falloff
                return Math.pow(1 - t, 3);
            case 'exp':
                // Exponential falloff
                return Math.pow(1 - t, this.falloffExp);
            case 'soft':
                // Very soft edges
                return Math.cos(t * Math.PI * 0.5);
            default:
                return 1 - t;
        }
    }

    // Parse color to RGB components
    getRGB() {
        const color = this.color;
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            if (hex.length === 3) {
                return {
                    r: parseInt(hex[0] + hex[0], 16),
                    g: parseInt(hex[1] + hex[1], 16),
                    b: parseInt(hex[2] + hex[2], 16)
                };
            }
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16)
            };
        }
        // Handle rgb/rgba strings
        const match = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
        }
        return { r: 255, g: 200, b: 100 };
    }
}

class AreaLight {
    constructor(config = {}) {
        this.id = config.id || Math.random().toString(36).substr(2, 9);
        this.x = config.x || 0;
        this.y = config.y || 0;
        this.z = config.z || 0;
        this.width = config.width || 3;    // World units
        this.height = config.height || 2;  // World units
        this.color = config.color || '#ffffff';
        this.intensity = config.intensity || 0.5;
        this.falloff = config.falloff || 'smooth';
        this.softness = config.softness || 0.5;  // Edge softness (0-1)
        this.blendMode = config.blendMode || 'additive';
        this.active = true;
        this._currentIntensity = this.intensity;
    }

    update(dt) {
        this._currentIntensity = this.intensity;
    }

    getRGB() {
        const color = this.color;
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16)
            };
        }
        return { r: 255, g: 255, b: 255 };
    }
}

// Light accumulation buffer for soft lighting
class LightBuffer {
    constructor(width, height) {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize(width, height);
    }

    resize(width, height) {
        // Use lower resolution for performance (1/2 or 1/4 of screen)
        this.scale = 0.5;
        this.canvas.width = Math.floor(width * this.scale);
        this.canvas.height = Math.floor(height * this.scale);
        this.width = width;
        this.height = height;
    }

    clear(ambientColor = 'rgba(0,0,0,0.8)') {
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = ambientColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Draw a soft radial light
    drawLight(screenX, screenY, radius, color, intensity, falloffFn) {
        const ctx = this.ctx;
        const x = screenX * this.scale;
        const y = screenY * this.scale;
        const r = radius * this.scale;
        
        // Create multi-stop gradient for smooth falloff
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        const rgb = color;
        
        // Build gradient stops based on falloff function
        const steps = 8;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const falloff = falloffFn(t);
            const alpha = falloff * intensity;
            gradient.addColorStop(t, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`);
        }
        
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw colored light glow (additive)
    drawColoredGlow(screenX, screenY, radius, color, intensity, falloffFn, blendMode = 'additive') {
        const ctx = this.ctx;
        const x = screenX * this.scale;
        const y = screenY * this.scale;
        const r = radius * this.scale * 0.7;  // Glow is slightly smaller
        
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        const rgb = color;
        
        const steps = 6;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const falloff = falloffFn(t);
            const alpha = falloff * intensity * 0.6;
            gradient.addColorStop(t, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`);
        }
        
        // Set blend mode
        if (blendMode === 'additive' || blendMode === 'screen') {
            ctx.globalCompositeOperation = 'lighter';
        } else if (blendMode === 'multiply') {
            ctx.globalCompositeOperation = 'multiply';
        } else {
            ctx.globalCompositeOperation = 'source-over';
        }
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw area light (rectangular soft light)
    drawAreaLight(screenX, screenY, width, height, color, intensity, softness) {
        const ctx = this.ctx;
        const x = screenX * this.scale;
        const y = screenY * this.scale;
        const w = width * this.scale;
        const h = height * this.scale;
        const rgb = color;
        
        // Draw soft rectangle using multiple gradients
        ctx.globalCompositeOperation = 'destination-out';
        
        // Core bright area
        const coreAlpha = intensity;
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${coreAlpha})`;
        const coreW = w * (1 - softness);
        const coreH = h * (1 - softness);
        ctx.fillRect(x - coreW/2, y - coreH/2, coreW, coreH);
        
        // Soft edges using gradients
        const edgeSize = w * softness;
        
        // Left edge
        const leftGrad = ctx.createLinearGradient(x - w/2, y, x - coreW/2, y);
        leftGrad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
        leftGrad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${coreAlpha})`);
        ctx.fillStyle = leftGrad;
        ctx.fillRect(x - w/2, y - coreH/2, edgeSize, coreH);
        
        // Right edge
        const rightGrad = ctx.createLinearGradient(x + coreW/2, y, x + w/2, y);
        rightGrad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${coreAlpha})`);
        rightGrad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
        ctx.fillStyle = rightGrad;
        ctx.fillRect(x + coreW/2, y - coreH/2, edgeSize, coreH);
    }

    // Render the light buffer to main canvas
    render(targetCtx, blendMode = 'source-over') {
        targetCtx.save();
        targetCtx.globalCompositeOperation = blendMode;
        targetCtx.drawImage(this.canvas, 0, 0, this.width, this.height);
        targetCtx.restore();
    }
}

// ============================================
// PARTICLE SYSTEM
// ============================================

class IsoParticle {
    constructor() {
        this.active = false;
        this.x = 0; this.y = 0; this.z = 0;  // World coordinates
        this.vx = 0; this.vy = 0; this.vz = 0;
        this.life = 0; this.maxLife = 0;
        this.config = null;
        this.sprite = null;
    }

    init(x, y, z, config, sprite) {
        this.active = true;
        this.x = x; this.y = y; this.z = z;
        this.config = config;
        this.sprite = sprite;

        const spread = (config.physics?.spread || 360);
        const angle = (Math.random() * spread - spread/2) * (Math.PI / 180);
        const speedMin = config.speed?.min || 1;
        const speedMax = config.speed?.max || 3;
        const speed = speedMin + Math.random() * (speedMax - speedMin);
        
        // Velocity in world space
        this.vx = Math.cos(angle) * speed * 0.05;
        this.vy = Math.sin(angle) * speed * 0.05;
        this.vz = (config.physics?.jump || 0) * 0.01;

        const lifeMin = config.life?.min || 0.5;
        const lifeMax = config.life?.max || 1.5;
        this.maxLife = lifeMin + Math.random() * (lifeMax - lifeMin);
        this.life = this.maxLife;
    }

    update(dt) {
        if (!this.active) return;

        const grav = (this.config.physics?.gravity || 0) * 0.5;
        const drag = this.config.physics?.drag || 0.98;
        
        this.vx *= drag;
        this.vy *= drag;
        this.vz -= grav * dt;

        this.x += this.vx;
        this.y += this.vy;
        this.z += this.vz;

        if (this.z < 0) {
            this.z = 0;
            if (this.config.physics?.bounce) this.vz *= -this.config.physics.bounce;
            else this.vz = 0;
        }

        this.life -= dt;
        if (this.life <= 0) this.active = false;
    }

    draw(ctx, projectFn, dims) {
        if (!this.active) return;

        const pos = projectFn(this.x, this.y, this.z, dims);
        const progress = 1 - (this.life / this.maxLife);
        const sizeStart = this.config.size?.start || 8;
        const sizeEnd = this.config.size?.end || 2;
        const size = sizeStart + (sizeEnd - sizeStart) * progress;
        
        const alpha = Math.max(0, this.life / this.maxLife);
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = this.config.blend || 'source-over';

        if (this.sprite && this.sprite.complete) {
            ctx.drawImage(this.sprite, pos.x - size/2, pos.y - size/2, size, size);
        } else {
            const cStart = this.config.color?.start || '#fff';
            const cEnd = this.config.color?.end || '#fff';
            ctx.fillStyle = progress < 0.5 ? cStart : cEnd;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, size/2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
    }
}

class IsoTextParticle {
    constructor() {
        this.active = false;
        this.x = 0; this.y = 0; this.z = 0;
        this.vx = 0; this.vy = 0; this.vz = 0;
        this.life = 0; this.maxLife = 0;
        this.text = "";
        this.color = "#fff";
        this.size = 16;
    }

    init(x, y, z, text, color) {
        this.active = true;
        this.x = x; this.y = y; this.z = z;
        this.text = text;
        this.color = color;
        
        this.vx = (Math.random() - 0.5) * 0.1;
        this.vy = (Math.random() - 0.5) * 0.1;
        this.vz = 0.15 + Math.random() * 0.05;
        
        this.life = 1.2; 
        this.maxLife = 1.2;
        this.size = 18;
    }

    update(dt) {
        if (!this.active) return;
        this.x += this.vx;
        this.y += this.vy;
        this.z += this.vz;
        this.vz -= 0.01; // Gravity
        this.life -= dt;
        if (this.life <= 0) this.active = false;
    }

    draw(ctx, projectFn, dims) {
        if (!this.active) return;
        const progress = this.life / this.maxLife;
        const pos = projectFn(this.x, this.y, this.z, dims);

        ctx.save();
        ctx.font = `bold ${Math.floor(this.size * (0.8 + progress * 0.2))}px "VT323", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        // Outline
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.strokeText(this.text, pos.x, pos.y);
        
        // Fill
        ctx.globalAlpha = progress;
        ctx.fillStyle = this.color;
        ctx.fillText(this.text, pos.x, pos.y);
        
        ctx.restore();
    }
}

class IsoEmitter {
    constructor(name, config, x, y, z, system) {
        this.name = name;
        this.config = config;
        this.x = x; this.y = y; this.z = z;
        this.system = system;
        this.active = true;
        this.elapsed = 0;
        this.spawnTimer = 0;
        
        if (config.mode === 'burst') {
            const count = config.count || 10;
            for(let i = 0; i < count; i++) this.emit();
            this.active = false;
        }
    }

    update(dt) {
        if (!this.active) return;
        
        this.elapsed += dt;
        if (this.config.duration > 0 && this.elapsed >= this.config.duration) {
            this.active = false;
            return;
        }

        if (this.config.mode === 'continuous') {
            const rate = this.config.count || 10; 
            const interval = 1.0 / rate;
            this.spawnTimer += dt;
            while(this.spawnTimer >= interval) {
                this.emit();
                this.spawnTimer -= interval;
            }
        }
    }

    emit() {
        let sprite = null;
        if (this.config.sprite) {
            if (!this.system.spriteCache[this.config.sprite]) {
                const img = new Image();
                img.src = this.config.sprite;
                this.system.spriteCache[this.config.sprite] = img;
            }
            sprite = this.system.spriteCache[this.config.sprite];
        }
        this.system.spawnParticle(this.x, this.y, this.z, this.config, sprite);
    }
}

window.IsoFXSystem = class IsoFXSystem {
    constructor(ctx, canvas, projectFn) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.width = canvas.width;
        this.height = canvas.height;
        this.projectFn = projectFn;  // Function to convert world coords to screen
        
        this.effects = {};
        this.emitters = [];
        this.pool = [];
        this.textPool = [];
        this.maxParticles = 1500;
        this.spriteCache = {};

        // Pre-allocate pools
        for(let i = 0; i < this.maxParticles; i++) {
            this.pool.push(new IsoParticle());
        }
        this.poolIndex = 0;

        for(let i = 0; i < 50; i++) {
            this.textPool.push(new IsoTextParticle());
        }
        this.textPoolIndex = 0;

        // Weather
        this.weatherType = 'none';
        this.weatherParticles = [];
        this.maxWeatherParticles = 300;
        
        // Lighting
        this.lightingType = 'day';
        this.gameTime = 12;
        this.ambientColor = 'rgba(0,0,0,0)';
        this.ambientIntensity = 0;
        this.lights = [];
        
        // NEW: Soft lighting system
        this.softLights = [];
        this.areaLights = [];
        this.lightBuffer = new LightBuffer(canvas.width, canvas.height);
        this.softLightingEnabled = true;
        this.playerLightRadius = 120;
        this.playerLightIntensity = 0.9;
        this.playerLightColor = '#ffeedd';
        
        // Lighting presets
        this.lightingPresets = {
            day: { ambient: 'rgba(0,0,0,0)', ambientIntensity: 0 },
            dusk: { ambient: 'rgba(40,20,60,0.3)', ambientIntensity: 0.3 },
            night: { ambient: 'rgba(10,10,30,0.75)', ambientIntensity: 0.75 },
            dungeon: { ambient: 'rgba(5,5,15,0.9)', ambientIntensity: 0.9 },
            cave: { ambient: 'rgba(0,0,0,0.95)', ambientIntensity: 0.95 }
        };
        
        // Screen effects
        this.shakeTime = 0;
        this.shakeIntensity = 0;
        this.lightningFlash = 0;
        
        // Time keyframes for day/night cycle
        this.timeKeyframes = [
            { h: 0,  c: [10, 10, 30, 0.85] },
            { h: 5,  c: [40, 30, 60, 0.6] },
            { h: 6,  c: [180, 80, 50, 0.4] },
            { h: 7,  c: [255, 160, 80, 0.25] },
            { h: 8,  c: [255, 220, 150, 0.1] },
            { h: 10, c: [255, 255, 255, 0.0] },
            { h: 16, c: [255, 255, 255, 0.0] },
            { h: 17, c: [255, 220, 150, 0.1] },
            { h: 18, c: [255, 150, 50, 0.3] },
            { h: 19, c: [180, 80, 50, 0.5] },
            { h: 20, c: [60, 40, 80, 0.7] },
            { h: 22, c: [20, 20, 50, 0.8] },
            { h: 24, c: [10, 10, 30, 0.85] }
        ];

        // Built-in effect definitions
        this.effects = {
            hit: {
                mode: 'burst', count: 8, duration: 0,
                color: { start: '#fff', end: '#ff0' },
                size: { start: 6, end: 1 },
                speed: { min: 2, max: 5 },
                life: { min: 0.2, max: 0.4 },
                physics: { spread: 360, gravity: 0, drag: 0.95 },
                blend: 'lighter'
            },
            blood: {
                mode: 'burst', count: 12, duration: 0,
                color: { start: '#e74c3c', end: '#8b0000' },
                size: { start: 5, end: 2 },
                speed: { min: 1, max: 4 },
                life: { min: 0.3, max: 0.6 },
                physics: { spread: 360, gravity: 15, bounce: 0.3, drag: 0.98 }
            },
            magic: {
                mode: 'burst', count: 15, duration: 0,
                color: { start: '#9b59b6', end: '#3498db' },
                size: { start: 8, end: 1 },
                speed: { min: 2, max: 6 },
                life: { min: 0.4, max: 0.8 },
                physics: { spread: 360, gravity: -5, drag: 0.96 },
                blend: 'screen'
            },
            fire: {
                mode: 'continuous', count: 20, duration: -1,
                color: { start: '#f39c12', end: '#e74c3c' },
                size: { start: 10, end: 2 },
                speed: { min: 0.5, max: 2 },
                life: { min: 0.3, max: 0.6 },
                physics: { spread: 60, gravity: -8, drag: 0.98 },
                blend: 'lighter'
            },
            dust: {
                mode: 'burst', count: 6, duration: 0,
                color: { start: '#bdc3c7', end: '#7f8c8d' },
                size: { start: 4, end: 8 },
                speed: { min: 0.5, max: 2 },
                life: { min: 0.5, max: 1.0 },
                physics: { spread: 180, gravity: 2, drag: 0.92 }
            }
        };
    }

    resize(w, h) {
        this.width = w;
        this.height = h;
    }

    // Update canvas reference if needed
    updateCanvas() {
        if (this.canvas) {
            this.width = this.canvas.width;
            this.height = this.canvas.height;
        }
    }

    // --- API ---

    play(name, x, y, z = 0) {
        const config = this.effects[name];
        if (!config) {
            console.warn(`FX effect '${name}' not found`);
            return;
        }
        this.emitters.push(new IsoEmitter(name, config, x, y, z, this));
    }

    spawnParticle(x, y, z, config, sprite) {
        const p = this.pool[this.poolIndex];
        this.poolIndex = (this.poolIndex + 1) % this.maxParticles;
        p.init(x, y, z, config, sprite);
    }

    popText(x, y, z, text, color = "#fff") {
        const p = this.textPool[this.textPoolIndex];
        this.textPoolIndex = (this.textPoolIndex + 1) % this.textPool.length;
        p.init(x, y, z, text, color);
    }

    addLight(x, y, z, radius, color, intensity = 0.5) {
        this.lights.push({ x, y, z, radius, color, intensity, flicker: 0 });
        return this.lights.length - 1;
    }

    removeLight(index) {
        if (index >= 0 && index < this.lights.length) {
            this.lights.splice(index, 1);
        }
    }

    // --- SOFT LIGHTING API ---

    /**
     * Add a soft point light with configurable falloff
     * @param {Object} config - Light configuration
     * @param {number} config.x - World X position
     * @param {number} config.y - World Y position
     * @param {number} config.z - World Z position (height)
     * @param {number} config.radius - Light radius in pixels
     * @param {string} config.color - Light color (hex or rgb)
     * @param {number} config.intensity - Light intensity (0-1)
     * @param {string} config.falloff - Falloff type: 'linear', 'smooth', 'sharp', 'exp', 'soft'
     * @param {number} config.flickerAmount - Flicker intensity (0-1)
     * @param {number} config.pulseAmount - Pulse intensity (0-1)
     * @returns {string} Light ID for later removal/modification
     */
    addSoftLight(config) {
        const light = new SoftLight(config);
        this.softLights.push(light);
        return light.id;
    }

    /**
     * Add an area light (soft rectangular light)
     * @param {Object} config - Area light configuration
     * @returns {string} Light ID
     */
    addAreaLight(config) {
        const light = new AreaLight(config);
        this.areaLights.push(light);
        return light.id;
    }

    /**
     * Remove a soft light by ID
     */
    removeSoftLight(id) {
        const idx = this.softLights.findIndex(l => l.id === id);
        if (idx !== -1) this.softLights.splice(idx, 1);
        
        const areaIdx = this.areaLights.findIndex(l => l.id === id);
        if (areaIdx !== -1) this.areaLights.splice(areaIdx, 1);
    }

    /**
     * Get a soft light by ID for modification
     */
    getSoftLight(id) {
        return this.softLights.find(l => l.id === id) || 
               this.areaLights.find(l => l.id === id);
    }

    /**
     * Update soft light properties
     */
    updateSoftLight(id, props) {
        const light = this.getSoftLight(id);
        if (light) {
            Object.assign(light, props);
        }
    }

    /**
     * Apply a lighting preset
     * @param {string} preset - Preset name: 'day', 'dusk', 'night', 'dungeon', 'cave'
     */
    applyLightingPreset(preset) {
        const p = this.lightingPresets[preset];
        if (p) {
            this.ambientColor = p.ambient;
            this.ambientIntensity = p.ambientIntensity;
        }
    }

    /**
     * Set player light properties (light that follows player)
     */
    setPlayerLight(radius, intensity, color) {
        if (radius !== undefined) this.playerLightRadius = radius;
        if (intensity !== undefined) this.playerLightIntensity = intensity;
        if (color !== undefined) this.playerLightColor = color;
    }

    /**
     * Enable/disable soft lighting system
     */
    setSoftLightingEnabled(enabled) {
        this.softLightingEnabled = enabled;
    }

    /**
     * Create a torch-style flickering light
     */
    createTorchLight(x, y, z, color = '#ff8833', radius = 100) {
        return this.addSoftLight({
            x, y, z,
            radius,
            color,
            intensity: 0.8,
            falloff: 'smooth',
            flickerAmount: 0.3,
            flickerSpeed: 8,
            blendMode: 'additive'
        });
    }

    /**
     * Create a magic orb-style pulsing light
     */
    createMagicLight(x, y, z, color = '#8844ff', radius = 80) {
        return this.addSoftLight({
            x, y, z,
            radius,
            color,
            intensity: 0.6,
            falloff: 'soft',
            pulseAmount: 0.2,
            pulseSpeed: 3,
            blendMode: 'screen'
        });
    }

    // --- Weather & Environment ---
    
    setWeather(type) { 
        this.weatherType = type || 'none'; 
        this.lightningFlash = 0;
        this.weatherParticles = [];
    }
    
    setLighting(type) { 
        this.lightingType = type || 'day'; 
    }
    
    setTime(hour) {
        this.gameTime = hour % 24;
        
        const keyframes = this.timeKeyframes;
        let start = keyframes[0], end = keyframes[keyframes.length-1];
        
        for (let i = 0; i < keyframes.length - 1; i++) {
            if (this.gameTime >= keyframes[i].h && this.gameTime < keyframes[i+1].h) {
                start = keyframes[i]; 
                end = keyframes[i+1]; 
                break;
            }
        }

        const p = (this.gameTime - start.h) / (end.h - start.h);
        const r = Math.floor(start.c[0] + (end.c[0] - start.c[0]) * p);
        const g = Math.floor(start.c[1] + (end.c[1] - start.c[1]) * p);
        const b = Math.floor(start.c[2] + (end.c[2] - start.c[2]) * p);
        const a = start.c[3] + (end.c[3] - start.c[3]) * p;

        this.ambientColor = `rgba(${r}, ${g}, ${b}, ${a})`;
        this.ambientIntensity = a;
    }

    shake(intensity, durationFrames) {
        this.shakeIntensity = intensity;
        this.shakeTime = durationFrames;
    }

    // --- Update ---

    update(dt = 0.016) {
        // Emitters
        for (let i = this.emitters.length - 1; i >= 0; i--) {
            const em = this.emitters[i];
            em.update(dt);
            if (!em.active) this.emitters.splice(i, 1);
        }

        // Particles
        this.pool.forEach(p => p.update(dt));
        this.textPool.forEach(p => p.update(dt));

        // Update soft lights
        this.softLights.forEach(light => light.update(dt));
        this.areaLights.forEach(light => light.update(dt));

        // Weather particles
        this.updateWeather(dt);

        // Screen shake decay
        if (this.shakeTime > 0) this.shakeTime--;
        
        // Lightning
        if (this.weatherType === 'rain' && Math.random() < 0.003) {
            this.lightningFlash = 1.0;
            this.shake(8, 15);
        }
        if (this.lightningFlash > 0) {
            this.lightningFlash -= 0.06;
            if (this.lightningFlash < 0) this.lightningFlash = 0;
        }

        // Light flickering
        this.lights.forEach(light => {
            if (light.color && light.color.includes('255')) {
                light.flicker = Math.sin(Date.now() * 0.01 + light.x) * 0.1;
            }
        });
    }

    updateWeather(dt) {
        if (this.weatherType === 'none') {
            this.weatherParticles = [];
            return;
        }

        // Add new particles
        const maxP = this.weatherType === 'rain' ? 200 : 
                     this.weatherType === 'snow' ? 150 : 
                     this.weatherType === 'ash' ? 80 : 50;

        while (this.weatherParticles.length < maxP) {
            const p = this.createWeatherParticle();
            if (p) this.weatherParticles.push(p);
        }

        // Update particles
        for (let i = this.weatherParticles.length - 1; i >= 0; i--) {
            const p = this.weatherParticles[i];
            
            if (this.weatherType === 'rain') {
                p.x += p.vx * dt * 60;
                p.y += p.vy * dt * 60;
                p.screenY += p.speed * dt * 60;
            } else if (this.weatherType === 'snow' || this.weatherType === 'ash') {
                p.x += Math.sin(Date.now() * 0.001 + p.seed) * 0.02;
                p.y += p.vy * dt * 60;
                p.screenY += p.speed * dt * 60;
            } else if (this.weatherType === 'fog') {
                p.x += p.vx * dt;
                p.alpha = 0.3 + Math.sin(Date.now() * 0.0005 + p.seed) * 0.1;
            }

            // Remove off-screen
            if (p.screenY > this.height + 50 || p.y < -10) {
                this.weatherParticles.splice(i, 1);
            }
        }
    }

    createWeatherParticle() {
        if (this.weatherType === 'rain') {
            return {
                x: Math.random() * this.width * 1.5 - this.width * 0.25,
                y: -10 - Math.random() * 50,
                screenY: -10 - Math.random() * 50,
                vx: 0.5,
                vy: 0.3,
                speed: 12 + Math.random() * 8,
                length: 15 + Math.random() * 10,
                layer: Math.floor(Math.random() * 3)
            };
        } else if (this.weatherType === 'snow') {
            return {
                x: Math.random() * this.width,
                y: -10,
                screenY: -10,
                vy: 0.1,
                speed: 1 + Math.random() * 2,
                size: 2 + Math.random() * 4,
                seed: Math.random() * 100
            };
        } else if (this.weatherType === 'ash') {
            return {
                x: Math.random() * this.width,
                y: -10,
                screenY: -10,
                vy: 0.05,
                speed: 0.5 + Math.random() * 1,
                size: 1 + Math.random() * 2,
                seed: Math.random() * 100
            };
        } else if (this.weatherType === 'fog') {
            return {
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 0.5,
                size: 100 + Math.random() * 200,
                alpha: 0.2 + Math.random() * 0.2,
                seed: Math.random() * 100
            };
        }
        return null;
    }

    // --- Render ---

    render(projectFn, dims, camX = 0, camY = 0) {
        this.ctx.save();

        // Screen shake
        if (this.shakeTime > 0) {
            const dx = (Math.random() - 0.5) * this.shakeIntensity;
            const dy = (Math.random() - 0.5) * this.shakeIntensity;
            this.ctx.translate(dx, dy);
        }

        // Particles
        this.pool.forEach(p => p.draw(this.ctx, projectFn, dims));
        this.textPool.forEach(p => p.draw(this.ctx, projectFn, dims));

        this.ctx.restore();
    }

    renderWeather(camX = 0, camY = 0) {
        if (this.weatherType === 'none') return;
        
        this.ctx.save();
        
        if (this.weatherType === 'rain') {
            // Layer 0: Background (faint)
            this.ctx.strokeStyle = 'rgba(150, 180, 220, 0.3)';
            this.ctx.lineWidth = 1;
            this.drawRainDrops(0, 0.4);
            
            // Layer 1: Mid
            this.ctx.strokeStyle = 'rgba(180, 200, 255, 0.5)';
            this.ctx.lineWidth = 2;
            this.drawRainDrops(1, 0.7);
            
            // Layer 2: Foreground
            this.ctx.strokeStyle = 'rgba(220, 240, 255, 0.7)';
            this.ctx.lineWidth = 2;
            this.drawRainDrops(2, 1.0);

        } else if (this.weatherType === 'snow') {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.weatherParticles.forEach(p => {
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.screenY, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            });

        } else if (this.weatherType === 'ash') {
            this.ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
            this.weatherParticles.forEach(p => {
                this.ctx.fillRect(p.x, p.screenY, p.size, p.size);
            });

        } else if (this.weatherType === 'fog') {
            this.weatherParticles.forEach(p => {
                const grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
                grad.addColorStop(0, `rgba(200, 210, 220, ${p.alpha})`);
                grad.addColorStop(1, 'rgba(200, 210, 220, 0)');
                this.ctx.fillStyle = grad;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            });

        } else if (this.weatherType === 'heat') {
            const time = Date.now() * 0.002;
            this.ctx.fillStyle = `rgba(255, 100, 0, ${0.03 + Math.sin(time) * 0.02})`;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }
        
        this.ctx.restore();
    }

    drawRainDrops(layer, lengthMult) {
        this.ctx.beginPath();
        const angle = 0.15;
        
        this.weatherParticles.forEach(p => {
            if (p.layer !== layer) return;
            const len = p.length * lengthMult;
            this.ctx.moveTo(p.x, p.screenY);
            this.ctx.lineTo(p.x + Math.sin(angle) * len, p.screenY + Math.cos(angle) * len);
        });
        this.ctx.stroke();
    }

    renderLighting(projectFn, dims, camX = 0, camY = 0) {
        // Use the new soft lighting system if enabled
        if (this.softLightingEnabled) {
            this.renderSoftLighting(projectFn, dims, camX, camY);
            return;
        }
        
        // Legacy lighting fallback
        this.renderLegacyLighting(projectFn, dims, camX, camY);
    }

    // New soft lighting system with smooth falloff and color blending
    renderSoftLighting(projectFn, dims, camX = 0, camY = 0) {
        // Resize light buffer if needed
        if (this.lightBuffer.width !== this.width || this.lightBuffer.height !== this.height) {
            this.lightBuffer.resize(this.width, this.height);
        }

        // Clear with ambient darkness
        this.lightBuffer.clear(this.ambientColor);

        // Draw all soft lights
        this.softLights.forEach(light => {
            if (!light.active) return;
            
            const pos = projectFn(light.x, light.y, light.z, dims);
            const screenX = pos.x + this.width/2 + camX;
            const screenY = pos.y + this.height/4 + camY;
            const rgb = light.getRGB();
            
            // Cut light hole in darkness
            this.lightBuffer.drawLight(
                screenX, screenY,
                light._currentRadius,
                rgb,
                light._currentIntensity,
                (t) => light.getFalloff(t)
            );
        });

        // Draw area lights
        this.areaLights.forEach(light => {
            if (!light.active) return;
            
            const pos = projectFn(light.x, light.y, light.z, dims);
            const screenX = pos.x + this.width/2 + camX;
            const screenY = pos.y + this.height/4 + camY;
            
            // Convert world size to screen size (approximate)
            const screenW = light.width * (dims.w || 32);
            const screenH = light.height * (dims.h || 16);
            
            this.lightBuffer.drawAreaLight(
                screenX, screenY,
                screenW, screenH,
                light.getRGB(),
                light._currentIntensity,
                light.softness
            );
        });

        // Draw legacy lights (for backwards compatibility)
        this.lights.forEach(light => {
            const pos = projectFn(light.x, light.y, light.z, dims);
            const screenX = pos.x + this.width/2 + camX;
            const screenY = pos.y + this.height/4 + camY;
            const r = light.radius * (1 + (light.flicker || 0));
            
            // Simple smooth falloff for legacy lights
            this.lightBuffer.drawLight(
                screenX, screenY, r,
                { r: 255, g: 255, b: 255 },
                light.intensity || 0.5,
                (t) => 1 - (t * t * (3 - 2 * t))  // Smooth falloff
            );
        });

        // Draw player light (always centered, follows camera)
        if (this.playerLightRadius > 0 && this.playerLightIntensity > 0) {
            const playerRgb = this.parseColor(this.playerLightColor);
            this.lightBuffer.drawLight(
                this.width / 2,
                this.height / 4,
                this.playerLightRadius,
                playerRgb,
                this.playerLightIntensity,
                (t) => 1 - (t * t * (3 - 2 * t))  // Smooth falloff
            );
        }

        // Render the light buffer to main canvas (darkness overlay)
        this.lightBuffer.render(this.ctx, 'source-over');

        // Now draw colored light glows on top (additive blending)
        this.ctx.save();
        
        // Soft lights color glow
        this.softLights.forEach(light => {
            if (!light.active) return;
            
            const pos = projectFn(light.x, light.y, light.z, dims);
            const screenX = pos.x + this.width/2 + camX;
            const screenY = pos.y + this.height/4 + camY;
            const rgb = light.getRGB();
            const r = light._currentRadius * 0.7;
            
            // Set blend mode
            if (light.blendMode === 'additive' || light.blendMode === 'screen') {
                this.ctx.globalCompositeOperation = 'lighter';
            } else if (light.blendMode === 'multiply') {
                this.ctx.globalCompositeOperation = 'multiply';
            } else {
                this.ctx.globalCompositeOperation = 'screen';
            }
            
            // Create gradient for colored glow
            const grad = this.ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, r);
            const alpha = light._currentIntensity * 0.4;
            grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`);
            grad.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.5})`);
            grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
            
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(screenX, screenY, r, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Legacy colored light glows
        this.ctx.globalCompositeOperation = 'screen';
        this.lights.forEach(light => {
            if (!light.color) return;
            const pos = projectFn(light.x, light.y, light.z, dims);
            const screenX = pos.x + this.width/2 + camX;
            const screenY = pos.y + this.height/4 + camY;
            const r = light.radius * (1 + (light.flicker || 0));
            
            const grad = this.ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, r * 0.7);
            grad.addColorStop(0, light.color);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            
            this.ctx.globalAlpha = (light.intensity || 0.5) * (1 + (light.flicker || 0) * 0.5);
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(screenX, screenY, r, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Lightning flash
        if (this.lightningFlash > 0) {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.fillStyle = `rgba(200, 220, 255, ${this.lightningFlash * 0.5})`;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        this.ctx.restore();
    }

    // Parse color string to RGB object
    parseColor(color) {
        if (!color) return { r: 255, g: 238, b: 221 };
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            if (hex.length === 3) {
                return {
                    r: parseInt(hex[0] + hex[0], 16),
                    g: parseInt(hex[1] + hex[1], 16),
                    b: parseInt(hex[2] + hex[2], 16)
                };
            }
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16)
            };
        }
        const match = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
        }
        return { r: 255, g: 238, b: 221 };
    }

    // Legacy lighting for backwards compatibility
    renderLegacyLighting(projectFn, dims, camX = 0, camY = 0) {
        // Create light canvas if needed
        if (!this.lightCanvas) {
            this.lightCanvas = document.createElement('canvas');
            this.lightCtx = this.lightCanvas.getContext('2d');
        }
        
        if (this.lightCanvas.width !== this.width || this.lightCanvas.height !== this.height) {
            this.lightCanvas.width = this.width;
            this.lightCanvas.height = this.height;
        }

        const lCtx = this.lightCtx;
        lCtx.clearRect(0, 0, this.width, this.height);
        
        // Ambient darkness
        lCtx.globalCompositeOperation = 'source-over';
        lCtx.fillStyle = this.ambientColor;
        lCtx.fillRect(0, 0, this.width, this.height);

        // Cut light holes
        lCtx.globalCompositeOperation = 'destination-out';
        
        this.lights.forEach(light => {
            const pos = projectFn(light.x, light.y, light.z, dims);
            const screenX = pos.x + this.width/2 + camX;
            const screenY = pos.y + this.height/4 + camY;
            const r = light.radius * (1 + light.flicker);
            
            const grad = lCtx.createRadialGradient(screenX, screenY, r * 0.1, screenX, screenY, r);
            grad.addColorStop(0, 'rgba(0,0,0,1)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            
            lCtx.fillStyle = grad;
            lCtx.beginPath();
            lCtx.arc(screenX, screenY, r, 0, Math.PI * 2);
            lCtx.fill();
        });

        // Player light
        const playerLightRadius = this.playerLightRadius;
        const grad = lCtx.createRadialGradient(
            this.width/2, this.height/4, playerLightRadius * 0.2,
            this.width/2, this.height/4, playerLightRadius
        );
        grad.addColorStop(0, 'rgba(0,0,0,0.8)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        lCtx.fillStyle = grad;
        lCtx.beginPath();
        lCtx.arc(this.width/2, this.height/4, playerLightRadius, 0, Math.PI * 2);
        lCtx.fill();

        // Draw to main canvas
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.drawImage(this.lightCanvas, 0, 0);

        // Lightning flash
        if (this.lightningFlash > 0) {
            this.ctx.fillStyle = `rgba(200, 220, 255, ${this.lightningFlash * 0.5})`;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        // Colored light glows
        this.ctx.globalCompositeOperation = 'screen';
        this.lights.forEach(light => {
            if (!light.color) return;
            const pos = projectFn(light.x, light.y, light.z, dims);
            const screenX = pos.x + this.width/2 + camX;
            const screenY = pos.y + this.height/4 + camY;
            const r = light.radius * (1 + light.flicker);
            
            const grad = this.ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, r * 0.7);
            grad.addColorStop(0, light.color);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            
            this.ctx.globalAlpha = (light.intensity || 0.5) * (1 + light.flicker * 0.5);
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(screenX, screenY, r, 0, Math.PI * 2);
            this.ctx.fill();
        });

        this.ctx.restore();
    }

    renderSunShafts() {
        const isDawn = (this.gameTime >= 5 && this.gameTime < 9);
        const isDusk = (this.gameTime >= 17 && this.gameTime < 20);
        
        if (!isDawn && !isDusk) return;

        this.ctx.save();
        this.ctx.globalCompositeOperation = 'screen';
        
        let alpha = 0, angle = 0, color = '';

        if (isDawn) {
            const dist = 1 - Math.abs(this.gameTime - 7) / 2;
            alpha = Math.max(0, dist * 0.25);
            angle = -0.4 + (this.gameTime - 5) * 0.15;
            color = 'rgba(255, 220, 150,';
        } else {
            const dist = 1 - Math.abs(this.gameTime - 18.5) / 1.5;
            alpha = Math.max(0, dist * 0.25);
            angle = 0.4 + (this.gameTime - 17) * 0.15;
            color = 'rgba(255, 150, 50,';
        }

        if (alpha > 0) {
            for(let i = 0; i < 4; i++) {
                const x = (i * (this.width/3)) + Math.sin(Date.now() * 0.0003 + i) * 40;
                
                const grad = this.ctx.createLinearGradient(x, 0, x - Math.tan(angle) * this.height, this.height);
                grad.addColorStop(0, `${color} ${alpha})`);
                grad.addColorStop(1, `${color} 0)`);
                
                this.ctx.fillStyle = grad;
                this.ctx.beginPath();
                this.ctx.moveTo(x - 40, 0);
                this.ctx.lineTo(x + 40, 0);
                this.ctx.lineTo(x + 40 - Math.tan(angle) * this.height, this.height);
                this.ctx.lineTo(x - 40 - Math.tan(angle) * this.height, this.height);
                this.ctx.fill();
            }
        }
        this.ctx.restore();
    }

    // --- New Layered Render Methods (called by main.js) ---

    renderBackground(ctx) {
        this.updateCanvas();
        
        // Sky gradient based on time of day
        const grad = ctx.createLinearGradient(0, 0, 0, this.height);
        
        if (this.gameTime < 6 || this.gameTime > 20) {
            // Night sky
            grad.addColorStop(0, '#0a0a1a');
            grad.addColorStop(0.5, '#1a1a2e');
            grad.addColorStop(1, '#2d2d4a');
            
            // Draw stars at night
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, this.width, this.height);
            this.renderStars(ctx);
        } else if (this.gameTime >= 6 && this.gameTime < 9) {
            // Dawn
            grad.addColorStop(0, '#2d2d4a');
            grad.addColorStop(0.3, '#ff7e5f');
            grad.addColorStop(0.6, '#feb47b');
            grad.addColorStop(1, '#ffdb99');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, this.width, this.height);
        } else if (this.gameTime >= 17 && this.gameTime <= 20) {
            // Dusk
            grad.addColorStop(0, '#1a1a3a');
            grad.addColorStop(0.3, '#ff6b6b');
            grad.addColorStop(0.6, '#ffa07a');
            grad.addColorStop(1, '#ffd93d');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, this.width, this.height);
        } else {
            // Day
            grad.addColorStop(0, '#4facfe');
            grad.addColorStop(0.5, '#87ceeb');
            grad.addColorStop(1, '#d4edfc');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, this.width, this.height);
            
            // Sun (simple)
            if (this.gameTime >= 10 && this.gameTime <= 16) {
                const sunX = this.width * 0.8;
                const sunY = this.height * 0.15;
                const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 80);
                sunGrad.addColorStop(0, 'rgba(255, 255, 200, 0.9)');
                sunGrad.addColorStop(0.3, 'rgba(255, 255, 100, 0.6)');
                sunGrad.addColorStop(1, 'rgba(255, 255, 100, 0)');
                ctx.fillStyle = sunGrad;
                ctx.beginPath();
                ctx.arc(sunX, sunY, 80, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    renderStars(ctx) {
        // Simple procedural stars (based on fixed seed pattern)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        const starCount = 80;
        for (let i = 0; i < starCount; i++) {
            // Pseudo-random positions that stay consistent
            const seed = i * 1234567;
            const x = (seed % this.width);
            const y = ((seed * 7) % (this.height * 0.6));
            const size = 0.5 + (i % 3);
            const twinkle = 0.5 + Math.sin(Date.now() * 0.002 + i) * 0.5;
            
            ctx.globalAlpha = twinkle * 0.8;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    renderWorld(ctx) {
        // Render particles that exist in world space
        // (ctx is already translated to world position)
        const dims = { w: 32, h: 16 }; // Default tile dims
        
        // Wrapper that uses the stored project function
        const projectWrapper = (x, y, z) => {
            if (this.projectFn) {
                return this.projectFn(x, y, z);
            }
            // Fallback: basic isometric projection
            return {
                x: (x - y) * (dims.w / 2),
                y: (x + y) * (dims.h / 2) - (z * dims.h)
            };
        };

        // Screen shake applied here
        if (this.shakeTime > 0) {
            const dx = (Math.random() - 0.5) * this.shakeIntensity;
            const dy = (Math.random() - 0.5) * this.shakeIntensity;
            ctx.translate(dx, dy);
        }

        // Render world-space particles
        ctx.save();
        this.pool.forEach(p => {
            if (p.active) {
                p.draw(ctx, projectWrapper, dims);
            }
        });
        this.textPool.forEach(p => {
            if (p.active) {
                p.draw(ctx, projectWrapper, dims);
            }
        });
        ctx.restore();
    }

    renderScreen(ctx) {
        // Render screen-space effects (weather, lighting, overlays)
        this.updateCanvas();
        
        // Weather layer
        this.renderWeather(0, 0);
        
        // Sun shafts at dawn/dusk
        this.renderSunShafts();
        
        // Soft lighting overlay (always render if there are lights or ambient darkness)
        const hasLighting = this.softLights.length > 0 || 
                           this.areaLights.length > 0 || 
                           this.lights.length > 0 ||
                           this.ambientIntensity > 0.01;
        
        if (hasLighting || this.gameTime < 7 || this.gameTime > 18) {
            const dims = { w: 32, h: 16 };
            const projectWrapper = (x, y, z) => {
                if (this.projectFn) {
                    return this.projectFn(x, y, z);
                }
                return { x: (x - y) * 16, y: (x + y) * 8 - z * 16 };
            };
            this.renderLighting(projectWrapper, dims, 0, 0);
        }
        
        // Lightning flash
        if (this.lightningFlash > 0) {
            ctx.fillStyle = `rgba(200, 220, 255, ${this.lightningFlash * 0.5})`;
            ctx.fillRect(0, 0, this.width, this.height);
        }
    }
};
