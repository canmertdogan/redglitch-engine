/**
 * RedGlitch Engine - Shared Atmosphere System
 * Handles pixel-art island and cloud backgrounds
 */
window.AtmosphereSystem = class AtmosphereSystem {
    constructor() {
        this.canvas = document.getElementById('atmosphere-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.pixelScale = 4;
        this.clouds = [];
        this.islands = [];
        this.time = 0;
        this.running = false;
        this._visible = false;
        this._animFrame = null;
        this._config = {
            cloudCount: 6,
            cloudSpeed: 0.15,
            islandCount: 3,
            horizonColor: '#1a2a3a',
            skyTopColor: '#0a0a12',
            skyBottomColor: '#1a1a2e',
            cloudColor: 'rgba(60, 70, 90, 0.35)',
            islandColor: '#1a2a1a',
        };
        this.resize();
        this.resizeHandler = () => this.resize();
        window.addEventListener('resize', this.resizeHandler);
        this.offCanvas = document.createElement('canvas');
        this.oCtx = this.offCanvas.getContext('2d');
        this._initClouds();
        this._initIslands();
    }

    _initClouds() {
        this.clouds = [];
        for (let i = 0; i < this._config.cloudCount; i++) {
            this.clouds.push(this._createCloud());
        }
    }

    _createCloud() {
        return {
            x: Math.random() * this.internalW,
            y: 10 + Math.random() * (this.internalH * 0.3),
            w: 40 + Math.random() * 80,
            h: 8 + Math.random() * 16,
            speed: this._config.cloudSpeed * (0.5 + Math.random()),
            opacity: 0.3 + Math.random() * 0.5,
            segments: 3 + Math.floor(Math.random() * 4),
        };
    }

    _initIslands() {
        this.islands = [];
        for (let i = 0; i < this._config.islandCount; i++) {
            this.islands.push(this._createIsland(i));
        }
    }

    _createIsland(index) {
        return {
            x: (index / this._config.islandCount) * this.internalW + Math.random() * 60 - 30,
            y: this.internalH * (0.5 + Math.random() * 0.3),
            w: 40 + Math.random() * 80,
            h: 10 + Math.random() * 20,
            peakH: 15 + Math.random() * 40,
            color: this._adjustColor(this._config.islandColor, Math.random() * 40 - 20),
        };
    }

    _adjustColor(hex, amount) {
        const num = parseInt(hex.slice(1), 16);
        const r = Math.min(255, Math.max(0, ((num >> 16) & 0xFF) + amount));
        const g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount));
        const b = Math.min(255, Math.max(0, (num & 0xFF) + amount));
        return `rgb(${r},${g},${b})`;
    }

    resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.internalW = Math.ceil(this.canvas.width / this.pixelScale);
        this.internalH = Math.ceil(this.canvas.height / this.pixelScale);
        if (this.offCanvas) {
            this.offCanvas.width = this.internalW;
            this.offCanvas.height = this.internalH;
        }
    }

    start(config) {
        if (this.running) return;
        if (config) Object.assign(this._config, config);
        this._visible = true;
        this.canvas.style.display = 'block';
        this.canvas.style.pointerEvents = 'none';
        this.running = true;
        this._initClouds();
        this._initIslands();
        this.animate();
    }

    stop() {
        this.running = false;
        this._visible = false;
        if (this._animFrame) {
            cancelAnimationFrame(this._animFrame);
            this._animFrame = null;
        }
        if (this.canvas) {
            this.canvas.style.display = 'none';
        }
    }

    setVisible(visible) {
        if (visible && !this.running) {
            this.start();
        } else if (!visible && this.running) {
            this.stop();
        }
    }

    destroy() {
        this.stop();
        window.removeEventListener('resize', this.resizeHandler);
    }

    animate() {
        if (!this.running || !this.canvas) return;
        this.time += 0.016;

        const ctx = this.oCtx;
        const w = this.internalW;
        const h = this.internalH;
        ctx.clearRect(0, 0, w, h);

        // Sky gradient
        const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
        skyGrad.addColorStop(0, this._config.skyTopColor);
        skyGrad.addColorStop(0.6, this._config.skyBottomColor);
        skyGrad.addColorStop(1, this._config.horizonColor);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, h);

        // Stars (small dots in the sky)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        for (let i = 0; i < 30; i++) {
            const sx = (i * 137.5 + this.time * 0.1) % w;
            const sy = (i * 97.3 + 20) % (h * 0.4);
            const twinkle = 0.5 + Math.sin(this.time * 2 + i) * 0.5;
            ctx.globalAlpha = 0.2 * twinkle;
            ctx.fillRect(sx, sy, 1, 1);
        }
        ctx.globalAlpha = 1;

        // Islands
        for (const island of this.islands) {
            ctx.fillStyle = island.color;
            ctx.beginPath();
            ctx.moveTo(island.x - island.w / 2, island.y);
            ctx.quadraticCurveTo(island.x - island.w / 4, island.y - island.peakH, island.x, island.y - island.peakH * 0.6);
            ctx.quadraticCurveTo(island.x + island.w / 4, island.y - island.peakH, island.x + island.w / 2, island.y);
            ctx.closePath();
            ctx.fill();
        }

        // Clouds
        for (const cloud of this.clouds) {
            cloud.x += cloud.speed;
            if (cloud.x > w + cloud.w) {
                cloud.x = -cloud.w;
                cloud.y = 10 + Math.random() * (h * 0.3);
            }
            ctx.fillStyle = this._config.cloudColor;
            ctx.globalAlpha = cloud.opacity;
            for (let s = 0; s < cloud.segments; s++) {
                const sx = cloud.x + (s / cloud.segments) * cloud.w;
                const sy = cloud.y + Math.sin(s * 1.5) * cloud.h * 0.3;
                const sr = cloud.h * (0.6 + Math.sin(s * 0.7) * 0.4);
                ctx.beginPath();
                ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;

        // Scale up to canvas
        const mainCtx = this.ctx;
        mainCtx.imageSmoothingEnabled = false;
        mainCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        mainCtx.drawImage(this.offCanvas, 0, 0, this.canvas.width, this.canvas.height);

        this._animFrame = requestAnimationFrame(() => this.animate());
    }
};