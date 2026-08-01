window.WeatherSystem = class WeatherSystem {
    constructor() {
        this.particles = [];
        this.type = 'clear';
        this.intensity = 1;
        this.wind = { x: 0, y: 0 };
        this.transition = 0;
        this.targetType = 'clear';
        this._lightningTimer = 0;
        this._lightningFlash = 0;
        this._fogCanvas = document.createElement('canvas');
        this._fogCtx = this._fogCanvas.getContext('2d');
        this._fogOffscreen = document.createElement('canvas');
        this._fogOffCtx = this._fogOffscreen.getContext('2d');
        this._fogDirty = true;
        this._time = 0;
    }

    setType(type, intensity = 1, instant = false) {
        const validTypes = ['clear', 'rain', 'snow', 'fog', 'storm', 'ash', 'heat'];
        if (!validTypes.includes(type)) return;
        this.targetType = type;
        this.intensity = Math.max(0.1, Math.min(3, intensity));
        if (instant) {
            this.type = type;
            this.transition = 1;
            this.particles = [];
        }
    }

    update(deltaTime, width, height) {
        this._time += deltaTime;

        if (this.type !== this.targetType) {
            this.transition += deltaTime * 0.5;
            if (this.transition >= 1) {
                this.type = this.targetType;
                this.transition = 1;
                this.particles = [];
            }
        } else {
            this.transition = Math.min(1, this.transition + deltaTime);
        }

        const maxParticles = this._getMaxParticles();
        const spawnRate = this._getSpawnRate() * this.intensity;
        const currentParticles = this.particles.filter(p => p.active).length;

        if (currentParticles < maxParticles && Math.random() < spawnRate * deltaTime) {
            this._spawnParticle(width, height);
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            if (!p.active) continue;
            p.x += (p.vx + this.wind.x * p.windAffinity) * deltaTime;
            p.y += p.vy * deltaTime;
            p.life -= deltaTime;
            if (p.type === 'rain') p.vy += 200 * deltaTime;
            if (p.type === 'snow') {
                p.vy += 20 * deltaTime;
                p.x += Math.sin(this._time * 2 + p.seed) * 0.3;
            }
            if (p.type === 'ash') {
                p.x += Math.sin(this._time * 0.5 + p.seed) * 5 * deltaTime;
            }
            p.opacity = Math.min(1, p.life / p.maxLife * 2) * (this.transition);
            if (p.y > height + 10 || p.x < -10 || p.x > width + 10 || p.life <= 0) {
                p.active = false;
            }
        }
        this.particles = this.particles.filter(p => p.active || !p.rendered);

        this._updateLightning(deltaTime);
        this._updateFog(width, height);
    }

    draw(ctx) {
        const t = this.transition;
        if (t <= 0) return;

        ctx.save();

        switch (this.type) {
            case 'rain':
                this._drawRain(ctx);
                break;
            case 'snow':
                this._drawSnow(ctx);
                break;
            case 'storm':
                this._drawRain(ctx);
                this._drawLightning(ctx);
                this._drawStormOverlay(ctx);
                break;
            case 'fog':
                this._drawFog(ctx);
                break;
            case 'ash':
                this._drawAsh(ctx);
                break;
            case 'heat':
                this._drawHeat(ctx);
                break;
        }

        ctx.restore();
    }

    _getMaxParticles() {
        switch (this.type) {
            case 'rain': return 300;
            case 'snow': return 200;
            case 'storm': return 400;
            case 'ash': return 80;
            default: return 0;
        }
    }

    _getSpawnRate() {
        switch (this.type) {
            case 'rain': return 60;
            case 'snow': return 30;
            case 'storm': return 80;
            case 'ash': return 15;
            default: return 0;
        }
    }

    _spawnParticle(width, height) {
        let p;
        switch (this.type) {
            case 'rain':
                p = {
                    active: true, type: 'rain',
                    x: Math.random() * width, y: -10,
                    vx: -50 + Math.random() * 20, vy: 400 + Math.random() * 300,
                    size: 1.5, length: 8 + Math.random() * 6, seed: Math.random() * 100,
                    life: 1.5, maxLife: 1.5, opacity: 1, windAffinity: 0.3
                };
                break;
            case 'snow':
                p = {
                    active: true, type: 'snow',
                    x: Math.random() * width, y: -10,
                    vx: 10 + Math.random() * 20, vy: 40 + Math.random() * 30,
                    size: 2 + Math.random() * 4, seed: Math.random() * 100,
                    life: 6 + Math.random() * 4, maxLife: 10, opacity: 1, windAffinity: 0.8
                };
                break;
            case 'storm':
                p = {
                    active: true, type: 'rain',
                    x: Math.random() * width, y: -15,
                    vx: -120 + Math.random() * 40, vy: 600 + Math.random() * 400,
                    size: 2, length: 12 + Math.random() * 8, seed: Math.random() * 100,
                    life: 0.8, maxLife: 0.8, opacity: 1, windAffinity: 0.5
                };
                break;
            case 'ash':
                p = {
                    active: true, type: 'ash',
                    x: Math.random() * width, y: -10,
                    vx: (Math.random() - 0.5) * 40, vy: 15 + Math.random() * 25,
                    size: 1 + Math.random() * 2, seed: Math.random() * 100,
                    life: 5 + Math.random() * 5, maxLife: 10, opacity: 1, windAffinity: 0.9
                };
                break;
        }
        if (p) this.particles.push(p);
    }

    _drawRain(ctx) {
        ctx.strokeStyle = `rgba(160, 190, 220, ${0.3 * this.intensity * this.transition})`;
        ctx.lineWidth = 1.2;
        for (const p of this.particles) {
            if (!p.active) continue;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 0.02, p.y - p.length);
            ctx.stroke();
        }
    }

    _drawSnow(ctx) {
        for (const p of this.particles) {
            if (!p.active) continue;
            const alpha = p.opacity * 0.7 * this.intensity * this.transition;
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawAsh(ctx) {
        for (const p of this.particles) {
            if (!p.active) continue;
            ctx.fillStyle = `rgba(200, 200, 200, ${p.opacity * 0.5 * this.transition})`;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        ctx.fillStyle = `rgba(0, 0, 0, ${0.1 * this.intensity * this.transition})`;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    _drawHeat(ctx) {
        const offset = Math.sin(this._time * 3) * 6;
        ctx.fillStyle = `rgba(231, 76, 60, ${0.04 * this.intensity * this.transition})`;
        ctx.fillRect(offset, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = `rgba(200, 100, 0, ${0.02 * this.intensity * this.transition})`;
        ctx.fillRect(-offset * 0.5, 0, ctx.canvas.width, ctx.canvas.height);
    }

    _drawStormOverlay(ctx) {
        ctx.fillStyle = `rgba(20, 20, 35, ${0.15 * this.intensity * this.transition})`;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    _updateLightning(deltaTime) {
        this._lightningTimer -= deltaTime;
        if (this._lightningTimer <= 0 && this.type === 'storm') {
            this._lightningFlash = 0.15 + Math.random() * 0.15;
            this._lightningTimer = 4 + Math.random() * 10;
        }
        if (this._lightningFlash > 0) {
            this._lightningFlash -= deltaTime * 0.5;
        }
    }

    _drawLightning(ctx) {
        if (this._lightningFlash > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${this._lightningFlash * 0.4 * this.transition})`;
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        }
    }

    _updateFog(width, height) {
        if (this.type !== 'fog') return;
        if (this._fogCanvas.width !== width || this._fogCanvas.height !== height) {
            this._fogCanvas.width = width;
            this._fogCanvas.height = height;
            this._fogOffscreen.width = Math.ceil(width / 4);
            this._fogOffscreen.height = Math.ceil(height / 4);
            this._fogDirty = true;
        }
    }

    _drawFog(ctx) {
        const w = this._fogCanvas.width || ctx.canvas.width;
        const h = this._fogCanvas.height || ctx.canvas.height;
        if (!w || !h) return;

        const sw = Math.ceil(w / 4);
        const sh = Math.ceil(h / 4);
        if (this._fogDirty) {
            const offCtx = this._fogOffCtx;
            const imageData = offCtx.createImageData(sw, sh);
            for (let i = 0; i < imageData.data.length; i += 4) {
                const noise = Math.random();
                const alpha = Math.floor(noise * 80 * this.intensity * this.transition);
                imageData.data[i] = 200;
                imageData.data[i + 1] = 200;
                imageData.data[i + 2] = 210;
                imageData.data[i + 3] = alpha;
            }
            offCtx.putImageData(imageData, 0, 0);
            const offX = Math.sin(this._time * 0.02) * 10;
            const offY = Math.cos(this._time * 0.03) * 8;
            this._fogCtx.clearRect(0, 0, w, h);
            this._fogCtx.drawImage(this._fogOffscreen, offX, offY, w, h);
            this._fogDirty = false;
        } else {
            const offX = Math.sin(this._time * 0.02) * 10;
            const offY = Math.cos(this._time * 0.03) * 8;
            this._fogCtx.clearRect(0, 0, w, h);
            this._fogCtx.drawImage(this._fogOffscreen, offX, offY, w, h);
        }
        ctx.drawImage(this._fogCanvas, 0, 0);
    }
};
