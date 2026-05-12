/**
 * Ketebe Engine - Shared Atmosphere System
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
        this.resize();
        this.resizeHandler = () => this.resize();
        window.addEventListener('resize', this.resizeHandler);
        this.offCanvas = document.createElement('canvas');
        this.oCtx = this.offCanvas.getContext('2d');
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
    start() {
        // Phase 28: Disabled intrusive skyblock animation by user request
        if (this.canvas) this.canvas.style.display = 'none';
        this.running = false;
    }
    stop() {
        this.running = false;
        if (this.canvas) this.canvas.style.display = 'none';
    }
    setVisible(visible) {
        this.stop();
    }
    destroy() {
        this.stop();
        window.removeEventListener('resize', this.resizeHandler);
    }
    animate() {
        return;
    }
};