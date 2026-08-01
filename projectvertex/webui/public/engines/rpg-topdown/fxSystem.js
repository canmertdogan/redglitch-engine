// fxSystem.js - Visual Effects, Particles, and Post-Processing

class Particle {
    constructor() {
        this.active = false;
        this.x = 0; this.y = 0; this.z = 0;
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

        // Physics Init
        const spread = (config.physics?.spread || 360);
        const angle = (Math.random() * spread - spread/2 - 90) * (Math.PI / 180);
        const speedMin = config.speed?.min || 50;
        const speedMax = config.speed?.max || 100;
        const speed = (speedMin + Math.random() * (speedMax - speedMin)) / 32;
        
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.vz = (config.physics?.jump || 0) / 16;

        // Life
        const lifeMin = config.life?.min || 0.5;
        const lifeMax = config.life?.max || 1.0;
        this.maxLife = lifeMin + Math.random() * (lifeMax - lifeMin);
        this.life = this.maxLife;
    }

    update(dt) {
        if (!this.active) return;

        const grav = (this.config.physics?.gravity || 0) * 2;
        const drag = this.config.physics?.drag || 1.0;
        
        this.vx *= drag;
        this.vy *= drag;
        this.vz -= grav * dt;

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.z += this.vz * dt;

        if (this.z < 0) {
            this.z = 0;
            if (this.config.physics?.bounce) this.vz *= -this.config.physics.bounce;
            else this.vz = 0;
        }

        this.life -= dt;
        if (this.life <= 0) this.active = false;
    }

    draw(ctx, rendererOrCamX, camY) {
        if (!this.active) return;

        let pos;
        if (typeof rendererOrCamX === 'object' && rendererOrCamX.project) {
            pos = rendererOrCamX.project(this.x, this.y, this.z);
        } else {
            pos = {
                x: this.x - rendererOrCamX,
                y: this.y - camY - this.z
            };
        }
        
        const progress = 1 - (this.life / this.maxLife);
        const sizeStart = this.config.size?.start || 4;
        const sizeEnd = this.config.size?.end || 0;
        const size = sizeStart + (sizeEnd - sizeStart) * progress;
        
        const alpha = Math.max(0, this.life / this.maxLife);
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = this.config.blend || 'source-over';

        if (this.sprite) {
            ctx.drawImage(this.sprite, Math.floor(pos.x - size/2), Math.floor(pos.y - size/2), size, size);
        } else {
            const cStart = this.config.color?.start || '#fff';
            const cEnd = this.config.color?.end || '#fff';
            ctx.fillStyle = progress < 0.5 ? cStart : cEnd;
            ctx.fillRect(Math.floor(pos.x - size/2), Math.floor(pos.y - size/2), size, size);
        }
        
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
    }
}

class TextParticle {
    constructor() {
        this.active = false;
        this.x = 0; this.y = 0; this.z = 0;
        this.vx = 0; this.vy = 0; this.vz = 0;
        this.life = 0; this.maxLife = 0;
        this.text = "";
        this.color = "#fff";
        this.size = 12;
    }

    init(x, y, text, color) {
        this.active = true;
        this.x = x; 
        this.y = y;
        this.z = 0;
        this.text = text;
        this.color = color;
        
        // Pop Effect: Up and random side
        this.vx = (Math.random() - 0.5) * 60;
        this.vy = -100 - Math.random() * 50;
        this.vz = 0;
        
        this.life = 1.0; 
        this.maxLife = 1.0;
        this.size = 16;
    }

    update(dt) {
        if (!this.active) return;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.z += this.vz * dt;
        this.vy += 400 * dt; // Gravity
        this.life -= dt;
        if (this.life <= 0) this.active = false;
    }

    draw(ctx, rendererOrCamX, camY) {
        if (!this.active) return;
        const progress = this.life / this.maxLife;
        
        let sx = 0, sy = 0;
        if (typeof rendererOrCamX === 'object' && rendererOrCamX.project) {
            const pos = rendererOrCamX.project(this.x, this.y, this.z);
            sx = pos.x; sy = pos.y;
        } else {
            sx = this.x - rendererOrCamX;
            sy = this.y - camY - this.z;
        }

        ctx.save();
        ctx.fillStyle = this.color;
        ctx.font = `bold ${Math.floor(this.size)}px "VT323", monospace`;
        ctx.textAlign = "center";
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.strokeText(this.text, Math.floor(sx), Math.floor(sy));
        
        ctx.globalAlpha = progress;
        ctx.fillText(this.text, Math.floor(sx), Math.floor(sy));
        
        ctx.restore();
    }
}

class Emitter {
    constructor(name, config, x, y, z, system) {
        this.name = name;
        this.config = config;
        this.x = x; this.y = y; this.z = z;
        this.system = system;
        this.active = true;
        this.elapsed = 0;
        this.spawnTimer = 0;
        
        // If Burst, spawn all now
        if (config.mode === 'burst') {
            const count = config.count || 10;
            for(let i=0; i<count; i++) this.emit();
            this.active = false; // Burst is instantaneous
        }
    }

    update(dt) {
        if (!this.active) return;
        
        this.elapsed += dt;
        if (this.config.duration > 0 && this.elapsed >= this.config.duration) {
            this.active = false;
            return;
        }

        // Continuous
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
        // Resolve sprite
        let sprite = null;
        if (this.config.sprite) {
            // Check cache
            if (!this.system.spriteCache[this.config.sprite]) {
                const img = new Image();
                img.src = this.config.sprite; // Path
                this.system.spriteCache[this.config.sprite] = img;
            }
            sprite = this.system.spriteCache[this.config.sprite];
        }
        
        this.system.spawnParticle(this.x, this.y, this.z, this.config, sprite);
    }
}

window.FXSystem = class FXSystem {
    constructor(ctx, width, height) {
        this.ctx = ctx;
        this.width = width;
        this.height = height;
        
        this.effects = {}; // Loaded definitions
        this.emitters = [];
        this.pool = [];
        this.textPool = [];
        this.maxParticles = 2000;
        this.spriteCache = {}; // path -> Image

        // Pre-allocate pool
        for(let i=0; i<this.maxParticles; i++) {
            this.pool.push(new Particle());
        }
        this.poolIndex = 0; // Ring Buffer Index

        // Pre-allocate text pool
        for(let i=0; i<50; i++) {
            this.textPool.push(new TextParticle());
        }
        this.textPoolIndex = 0; // Ring Buffer Index

        // Legacy / Environment
        this.weatherType = 'none';
        this.lightingType = 'day';
        this.shakeTime = 0;
        this.shakeIntensity = 0;
        this.lightningFlash = 0;
        this.gameTime = 12;

        // Defined keyframes for a smooth aesthetic cycle
        this.timeKeyframes = [
            { h: 0,  c: [10, 10, 20, 0.9] },   // Midnight (Deep Dark)
            { h: 4,  c: [20, 20, 40, 0.85] },  // Late Night
            { h: 5,  c: [40, 30, 60, 0.7] },   // Pre-Dawn (Purple Mist)
            { h: 6,  c: [180, 50, 50, 0.5] },  // Dawn (Deep Red)
            { h: 7,  c: [255, 140, 50, 0.35] },// Sunrise (Intense Orange)
            { h: 8,  c: [255, 220, 100, 0.2] },// Morning Glory (Golden)
            { h: 9,  c: [255, 240, 200, 0.1] },// Late Morning (Warm White)
            { h: 10, c: [255, 255, 255, 0.0] },// Day (Clear)
            { h: 16, c: [255, 255, 255, 0.0] },// Afternoon (Clear)
            { h: 17, c: [255, 220, 150, 0.1] },// Late Afternoon (Warm)
            { h: 18, c: [255, 180, 50, 0.3] }, // Sunset (Gold/Orange)
            { h: 19, c: [200, 100, 50, 0.5] }, // Dusk (Red/Orange)
            { h: 20, c: [60, 40, 80, 0.7] },   // Twilight (Purple)
            { h: 21, c: [20, 20, 50, 0.85] },  // Early Night
            { h: 24, c: [10, 10, 20, 0.9] }    // Wrap to Midnight
        ];

        this.init();
    }

    async init() {
        try {
            const list = await fetch('/api/fx/list').then(r => r.json());
            for (const name of list) {
                const config = await fetch(`/api/fx/${name}`).then(r => r.json());
                this.effects[name] = config;
            }
            console.log(`FX System: Loaded ${list.length} effects.`);
        } catch(e) { console.warn("FX Load failed", e); }
    }

    resize(w, h) {
        this.width = w;
        this.height = h;
    }

    // --- API ---

    play(name, x, y, z = 0) {
        const config = this.effects[name];
        if (!config) return;
        this.emitters.push(new Emitter(name, config, x, y, z, this));
    }

    spawnParticle(x, y, z, config, sprite) {
        const p = this.pool[this.poolIndex];
        this.poolIndex = (this.poolIndex + 1) % this.maxParticles;
        p.init(x, y, z, config, sprite);
    }

    spawnParticles(x, y, effectName, count = 10) {
        const config = this.effects[effectName];
        if (!config) {
            // Fallback for common effects like smoke
            const defaultConfig = {
                life: { min: 0.5, max: 1.0 },
                speed: { min: 20, max: 50 },
                size: { start: 4, end: 0 },
                color: { start: '#888', end: '#444' },
                physics: { gravity: -0.1, drag: 0.9, spread: 360 }
            };
            for(let i=0; i<count; i++) {
                this.spawnParticle(x + (Math.random()-0.5)*10, y + (Math.random()-0.5)*10, 0, defaultConfig);
            }
            return;
        }
        
        for(let i=0; i<count; i++) {
            this.spawnParticle(x + (Math.random()-0.5)*10, y + (Math.random()-0.5)*10, 0, config);
        }
    }

    popText(x, y, text, color = "#fff") {
        // Ring Buffer Strategy
        const p = this.textPool[this.textPoolIndex];
        this.textPoolIndex = (this.textPoolIndex + 1) % this.textPool.length;
        
        p.init(x, y, text, color);
    }

    // --- LEGACY/ENV METHODS ---
    
    setWeather(type) { this.weatherType = type || 'none'; this.lightningFlash = 0; }
    setLighting(type) { this.lightingType = type || 'day'; }
    
    setTime(hour) {
        this.gameTime = hour;
        
        const keyframes = this.timeKeyframes;

        // Find current interval
        let start = keyframes[0], end = keyframes[keyframes.length-1];
        
        for (let i = 0; i < keyframes.length - 1; i++) {
            if (hour >= keyframes[i].h && hour < keyframes[i+1].h) {
                start = keyframes[i]; 
                end = keyframes[i+1]; 
                break;
            }
        }

        // Lerp
        const p = (hour - start.h) / (end.h - start.h);
        const r = Math.floor(start.c[0] + (end.c[0] - start.c[0]) * p);
        const g = Math.floor(start.c[1] + (end.c[1] - start.c[1]) * p);
        const b = Math.floor(start.c[2] + (end.c[2] - start.c[2]) * p);
        const a = start.c[3] + (end.c[3] - start.c[3]) * p;

        this.ambientColor = `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    shake(intensity, duration) {
        this.shakeIntensity = intensity;
        this.shakeTime = duration;
    }

    update(dt = 0.016) {
        // Update Emitters
        for (let i = this.emitters.length - 1; i >= 0; i--) {
            const em = this.emitters[i];
            em.update(dt);
            if (!em.active) this.emitters.splice(i, 1);
        }

        // Update Particles
        this.pool.forEach(p => p.update(dt));
        this.textPool.forEach(p => p.update(dt));

        // Screen Shake decay
        if (this.shakeTime > 0) this.shakeTime--;
        
        // Lightning Logic
        if (this.weatherType === 'rain') {
            // Random chance for lightning
            if (Math.random() < 0.005) { // ~0.3 flashes per second at 60fps
                this.lightningFlash = 1.0;
                this.shake(5, 10); // Thunder shake
            }
        }
        if (this.lightningFlash > 0) {
            this.lightningFlash -= 0.05; // Fade out speed
            if (this.lightningFlash < 0) this.lightningFlash = 0;
        }
    }

    render(rendererOrCamX = 0, cameraY = 0) {
        this.ctx.save();

        if (this.shakeTime > 0) {
            const dx = (Math.random() - 0.5) * this.shakeIntensity;
            const dy = (Math.random() - 0.5) * this.shakeIntensity;
            this.ctx.translate(dx, dy);
        }

        // Render Particles
        this.pool.forEach(p => p.draw(this.ctx, rendererOrCamX, cameraY));
        this.textPool.forEach(p => p.draw(this.ctx, rendererOrCamX, cameraY));

        // Weather and other full-screen effects usually still use screen-space cam
        const cx = typeof rendererOrCamX === 'object' ? rendererOrCamX.camera.x : rendererOrCamX;
        const cy = typeof rendererOrCamX === 'object' ? rendererOrCamX.camera.y : cameraY;

        this.renderWeather(cx, cy);
        this.renderSunShafts(cx, cy);

        this.ctx.restore();
    }

    renderSunShafts(cameraX, cameraY) {
        // Dawn: 5-9, Dusk: 17-20
        const isDawn = (this.gameTime >= 5 && this.gameTime < 9);
        const isDusk = (this.gameTime >= 17 && this.gameTime < 20);
        
        if (!isDawn && !isDusk) return;

        this.ctx.save();
        this.ctx.globalCompositeOperation = 'screen';
        
        // Intensity Curve (Peak at 7 and 18.5)
        let alpha = 0;
        let angle = 0;
        let color = '';

        if (isDawn) {
            // Peak at 7:00
            const dist = 1 - Math.abs(this.gameTime - 7) / 2; 
            alpha = Math.max(0, dist * 0.3);
            angle = -0.5 + (this.gameTime - 5) * 0.2; // -0.5 to 0.3
            color = 'rgba(255, 220, 150,';
        } else {
            // Peak at 18:30
            const dist = 1 - Math.abs(this.gameTime - 18.5) / 1.5;
            alpha = Math.max(0, dist * 0.3);
            angle = 0.5 + (this.gameTime - 17) * 0.2; // 0.5 to 1.1
            color = 'rgba(255, 150, 50,';
        }

        if (alpha > 0) {
            const ctx = this.ctx;
            const w = this.width;
            const h = this.height;
            
            // Draw 5 big shafts
            for(let i=0; i<5; i++) {
                const x = (i * (w/4)) + Math.sin(Date.now() * 0.0005 + i) * 50;
                
                const grad = ctx.createLinearGradient(x, 0, x - Math.tan(angle)*h, h);
                grad.addColorStop(0, `${color} ${alpha})`);
                grad.addColorStop(1, `${color} 0)`);
                
                ctx.fillStyle = grad;
                
                // Rotation transform for shafts
                ctx.beginPath();
                ctx.moveTo(x - 50, 0);
                ctx.lineTo(x + 50, 0);
                ctx.lineTo(x + 50 - Math.tan(angle)*h, h);
                ctx.lineTo(x - 50 - Math.tan(angle)*h, h);
                ctx.fill();
            }
        }
        this.ctx.restore();
    }

    // --- RENDERERS ---

    renderWeather(cameraX, cameraY) {
        if (this.weatherType === 'none') return;
        
        this.ctx.save();
        
        if (this.weatherType === 'rain') {
            const time = Date.now() * 0.001;
            const w = this.width;
            const h = this.height;
            
            // 3 Layers of Rain for Parallax
            // Layer 1: Background (Slow, faint, small)
            this.drawRainLayer(cameraX, cameraY, 0.5, 0.3, 15, 2, 'rgba(150, 180, 220, 0.3)');
            
            // Layer 2: Midground
            this.drawRainLayer(cameraX, cameraY, 1.0, 0.6, 20, 3, 'rgba(180, 200, 255, 0.5)');
            
            // Layer 3: Foreground (Fast, bright, long)
            this.drawRainLayer(cameraX, cameraY, 1.5, 1.0, 30, 4, 'rgba(220, 240, 255, 0.7)');

        } else if (this.weatherType === 'fog') {
            // ... fog logic ...
            // Enhanced Fog: Rolling noise
            const time = Date.now() * 0.0005;
            for (let i = 0; i < 5; i++) {
                this.ctx.fillStyle = `rgba(200, 200, 220, 0.05)`;
                const offset = Math.sin(time + i) * 100;
                this.ctx.fillRect(0, i * (this.height/5) + offset, this.width, this.height/5);
            }
        } else if (this.weatherType === 'heat') {
            const shift = Math.sin(Date.now() * 0.01) * 2;
            this.ctx.fillStyle = 'rgba(255, 100, 0, 0.05)';
            this.ctx.fillRect(shift, 0, this.width, this.height);
        }
        this.ctx.restore();
    }

    drawRainLayer(camX, camY, speedMult, alpha, len, width, color) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.beginPath();
        
        const time = Date.now() * 0.001;
        const count = 100; // Drops per layer
        const angle = 0.2; // Radians tilt
        
        for(let i=0; i<count; i++) {
            // Pseudo-random positions based on index
            // Offset by camera position * parallax factor (speedMult)
            // Offset by time * drop speed
            
            const rX = Math.sin(i * 123.456) * 10000;
            const rY = Math.cos(i * 789.012) * 10000;
            
            let x = (rX - camX * (0.1 * speedMult)) % this.width;
            let y = (rY + time * 800 * speedMult - camY * (0.1 * speedMult)) % this.height;
            
            // Wrap around
            if (x < 0) x += this.width;
            if (y < 0) y += this.height;
            
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x - Math.sin(angle) * len, y + Math.cos(angle) * len);
        }
        this.ctx.stroke();
    }

    renderShadows(mapSystem, cameraX, cameraY, scale = 3) {
        if (!mapSystem || !mapSystem.collisionMap) return;
        
        const ctx = this.ctx;
        const ts = 16 * scale; // Tilesize
        
        const startCol = Math.max(0, Math.floor(cameraX / ts));
        const endCol = Math.min(mapSystem.width - 1, Math.floor((cameraX + this.width) / ts) + 1);
        const startRow = Math.max(0, Math.floor(cameraY / ts));
        const endRow = Math.min(mapSystem.height - 1, Math.floor((cameraY + this.height) / ts) + 1);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        for (let y = startRow; y <= endRow; y++) {
            for (let x = startCol; x <= endCol; x++) {
                const idx = y * mapSystem.width + x;
                if (mapSystem.collisionMap[idx] === 1) {
                    const sx = Math.floor(x * ts - cameraX);
                    const sy = Math.floor(y * ts - cameraY);
                    
                    // Simple drop shadow for wall depth
                    if (y + 1 < mapSystem.height && mapSystem.collisionMap[(y+1)*mapSystem.width + x] === 0) {
                        ctx.fillRect(sx, sy + ts, ts, ts * 0.3);
                    }
                }
            }
        }
    }

    renderSoftLighting(cameraX, cameraY, lights) {
        if (this.width <= 0 || this.height <= 0) return;

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
        
        // --- PASS 1: The Darkness Mask ---
        lCtx.save();
        lCtx.globalCompositeOperation = 'source-over';
        
        // Use the smooth ambient color calculated by setTime()
        // Fallback to transparent if undefined
        const ambient = this.ambientColor || 'rgba(0,0,0,0)';
        
        // Check if alpha is > 0 to avoid unnecessary work
        // Extract alpha roughly or just draw
        lCtx.fillStyle = ambient;
        lCtx.fillRect(0, 0, this.width, this.height);

        // Cut holes (Lights) - Only if we have darkness/overlay
        // We can check if ambient is not fully transparent, or just do it.
        // Optimization: parse alpha from string? 
        // For now, just run it. If alpha is 0, cutting holes in nothing does nothing.
        
        lCtx.globalCompositeOperation = 'destination-out';
        lights.forEach(light => {
                const lx = Math.floor(light.x - cameraX);
                const ly = Math.floor(light.y - cameraY);
                const r = light.radius || 100;
                
                // Gradient for soft edges
                const grad = lCtx.createRadialGradient(lx, ly, r * 0.1, lx, ly, r);
                grad.addColorStop(0, 'rgba(0,0,0,1)');   // Fully cut
                grad.addColorStop(1, 'rgba(0,0,0,0)');   // No cut
                
                lCtx.fillStyle = grad;
                lCtx.beginPath();
                lCtx.arc(lx, ly, r, 0, Math.PI * 2);
                lCtx.fill();
            });
        
        lCtx.restore();

        // --- DRAW PASS 1 TO MAIN CANVAS ---
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.drawImage(this.lightCanvas, 0, 0);

        // --- PASS 2: Color Overlay (The "Glow") ---
        // We add color on top of the scene using 'screen' or 'lighter' 
        // to make it look like light hitting the floor
        this.ctx.globalCompositeOperation = 'screen'; 
        
        // Lightning Flash Overlay
        if (this.lightningFlash > 0) {
            this.ctx.fillStyle = `rgba(200, 220, 255, ${this.lightningFlash * 0.4})`;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }
        
        lights.forEach(light => {
            if (!light.color) return;
            const lx = Math.floor(light.x - cameraX);
            const ly = Math.floor(light.y - cameraY);
            const r = light.radius || 100;
            
            const grad = this.ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
            grad.addColorStop(0, light.color);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            
            this.ctx.globalAlpha = (light.intensity || 0.5);
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(lx, ly, r, 0, Math.PI * 2);
            this.ctx.fill();
        });
        
        this.ctx.restore();
    }
};