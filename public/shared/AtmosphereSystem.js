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
        if (!this.canvas) return;
        this.islands = [];
        this.clouds = [];
        for (let i = 0; i < 5; i++) {
            this.islands.push({ x: Math.random() * this.internalW, y: Math.random() * this.internalH, w: 20 + Math.random() * 30, h: 10 + Math.random() * 15, speed: 0.05 + Math.random() * 0.1, seed: Math.random() * 100 });
        }
        for (let i = 0; i < 10; i++) {
            this.clouds.push({ x: Math.random() * this.internalW, y: Math.random() * this.internalH, w: 15 + Math.random() * 25, h: 8 + Math.random() * 12, speed: 0.1 + Math.random() * 0.2 });
        }
        this.running = true;
        this.animate();
    }
    stop() {
        this.running = false;
    }
    destroy() {
        this.stop();
        window.removeEventListener('resize', this.resizeHandler);
    }
    animate() {
        if (!this.running) return;
        if (!this.canvas || this.canvas.style.display === 'none') { requestAnimationFrame(() => this.animate()); return; }
        this.time += 0.01;
        const oCtx = this.oCtx;
        oCtx.imageSmoothingEnabled = false;
        const grad = oCtx.createLinearGradient(0, 0, 0, this.internalH); grad.addColorStop(0, '#4facfe'); grad.addColorStop(1, '#00f2fe');
        oCtx.fillStyle = grad; oCtx.fillRect(0, 0, this.internalW, this.internalH);
        oCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this.clouds.forEach(c => { c.x -= c.speed; if (c.x + c.w < 0) c.x = this.internalW; oCtx.fillRect(Math.floor(c.x), Math.floor(c.y), c.w, c.h); });
        this.islands.forEach(isl => {
            isl.x -= isl.speed; if (isl.x + isl.w < 0) { isl.x = this.internalW; isl.y = Math.random() * this.internalH; } 
            const hover = Math.sin(this.time + isl.seed) * 2; const drawX = Math.floor(isl.x); const drawY = Math.floor(isl.y + hover);
            oCtx.fillStyle = '#2ecc71'; oCtx.fillRect(drawX, drawY, isl.w, isl.h / 3);
            oCtx.fillStyle = '#8b4513'; oCtx.beginPath(); oCtx.moveTo(drawX, drawY + isl.h / 3); oCtx.lineTo(drawX + isl.w, drawY + isl.h / 3); oCtx.lineTo(drawX + isl.w / 2, drawY + isl.h); oCtx.fill();
            if (isl.seed > 50) { oCtx.fillStyle = '#3498db'; oCtx.fillRect(drawX + isl.w/2 - 2, drawY + isl.h/3, 4, isl.h/2); } 
        });
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this.offCanvas, 0, 0, this.internalW, this.internalH, 0, 0, this.canvas.width, this.canvas.height);
        requestAnimationFrame(() => this.animate());
    }
};