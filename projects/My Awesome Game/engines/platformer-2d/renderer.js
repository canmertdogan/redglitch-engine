class PlatformerRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.ctx.imageSmoothingEnabled = false;
        
        this.camera = { x: 0, y: 0 };
        this.tileset = new Image();
        this.tileset.src = 'base_game/assets/world_tileset.png'; 
        
        this.tileSize = 32;
        this.viewW = canvas.width;
        this.viewH = canvas.height;

        // Chunking
        this.CHUNK_SIZE = 16;
        this.chunks = {}; 

        // Sprite Caching
        this.spriteCache = {}; // name_state_frame -> Canvas
    }

    resize(w, h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this.viewW = w;
        this.viewH = h;
        this.ctx.imageSmoothingEnabled = false;
    }

    updateCamera(player, mapWidth, mapHeight) {
        let targetX = player.x + player.w/2 - this.viewW/2;
        let targetY = player.y + player.h/2 - this.viewH/2;

        targetX = Math.max(0, Math.min(targetX, mapWidth * this.tileSize - this.viewW));
        targetY = Math.max(0, Math.min(targetY, mapHeight * this.tileSize - this.viewH));

        this.camera.x += (targetX - this.camera.x) * 0.1;
        this.camera.y += (targetY - this.camera.y) * 0.1;
        
        this.camera.x = Math.floor(this.camera.x);
        this.camera.y = Math.floor(this.camera.y);
    }

    async loadTileset(path) {
        return new Promise(async (resolve) => {
            if (path === 'WORLD_PIXEL_ART') {
                try {
                    this.tileset = await this.combineWorldPixelArt();
                    resolve();
                } catch(e) {
                    this.tileset.src = '/engines/rpg-topdown/assets/world_tileset.png';
                    resolve();
                }
            } else {
                const img = new Image();
                img.onload = () => { this.tileset = img; resolve(); };
                img.onerror = () => {
                    this.tileset.src = '/engines/rpg-topdown/assets/world_tileset.png';
                    resolve();
                };
                img.src = path || '/engines/rpg-topdown/assets/world_tileset.png';
            }
        });
    }

    async combineWorldPixelArt() {
        const canvas = document.createElement('canvas');
        const tSize = 16;
        const cols = 16;
        const totalTiles = 600; 
        const rows = Math.ceil(totalTiles / cols);
        canvas.width = cols * tSize;
        canvas.height = rows * tSize;
        const ctx = canvas.getContext('2d');
        
        const promises = [];
        for (let i = 1; i <= totalTiles; i++) {
            promises.push(new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    const x = ((i - 1) % cols) * tSize;
                    const y = Math.floor((i - 1) / cols) * tSize;
                    ctx.drawImage(img, x, y, tSize, tSize);
                    resolve();
                };
                img.onerror = () => resolve();
                img.src = `/sprite-art/worldpixelart/texture_16px ${i}.png`;
            }));
        }
        await Promise.all(promises);
        return canvas;
    }

    invalidateCache() {
        this.chunks = {};
    }

    render(map, player, entities = [], collectibles = [], checkpoints = []) {
        if (map && map.background && map.background.startsWith('#')) {
            this.ctx.fillStyle = map.background;
            this.ctx.fillRect(0, 0, this.viewW, this.viewH);
        } else {
            this.ctx.fillStyle = '#87CEEB';
            this.ctx.fillRect(0, 0, this.viewW, this.viewH);
        }

        this.ctx.save();
        this.ctx.translate(-this.camera.x, -this.camera.y);

        if (map) {
            if (this.currentMap !== map) {
                this.invalidateCache();
                this.currentMap = map;
            }
            if (map.layers) {
                map.layers.forEach((layer, i) => this.drawLayerChunked(layer, map.width, i));
            } else if (map.collision) {
                this.drawLayerChunked(map.collision, map.width, 'col', true);
            }
        }

        checkpoints.forEach(cp => this.drawCheckpoint(cp));
        collectibles.forEach(item => !item.collected && this.drawCollectible(item));
        if(map && (map.goal || map.exit)) this.drawGoal(map.exit || map.goal);

        if (player.draw) player.draw(this);
        else this.drawPlayer(player);

        entities.forEach(ent => {
            if (ent.draw) ent.draw(this);
            else this.drawEntity(ent);
        });

        if (window.game && window.game.fx) {
            window.game.fx.renderWeather(this.camera.x, this.camera.y);
        }

        this.ctx.restore();
        this.drawHUD(player);
    }

    drawLayerChunked(layerData, mapWidth, layerIndex, isCollision = false) {
        if (!layerData) return;
        const startCx = Math.floor(this.camera.x / (this.tileSize * this.CHUNK_SIZE));
        const startCy = Math.floor(this.camera.y / (this.tileSize * this.CHUNK_SIZE));
        const endCx = Math.floor((this.camera.x + this.viewW) / (this.tileSize * this.CHUNK_SIZE));
        const endCy = Math.floor((this.camera.y + this.viewH) / (this.tileSize * this.CHUNK_SIZE));

        for (let cy = startCy; cy <= endCy; cy++) {
            for (let cx = startCx; cx <= endCx; cx++) {
                const key = `${layerIndex}_${cx}_${cy}`;
                if (!this.chunks[key]) {
                    this.chunks[key] = this.renderChunk(layerData, mapWidth, cx, cy, isCollision);
                }
                if (this.chunks[key]) {
                    this.ctx.drawImage(this.chunks[key], cx * this.CHUNK_SIZE * this.tileSize, cy * this.CHUNK_SIZE * this.tileSize);
                }
            }
        }
    }

    renderChunk(layerData, mapWidth, cx, cy, isCollision) {
        const canvas = document.createElement('canvas');
        canvas.width = this.CHUNK_SIZE * this.tileSize;
        canvas.height = this.CHUNK_SIZE * this.tileSize;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        let hasContent = false;
        const totalCols = Math.floor(this.tileset.width / 16) || 16;

        for (let y = 0; y < this.CHUNK_SIZE; y++) {
            for (let x = 0; x < this.CHUNK_SIZE; x++) {
                const tileX = cx * this.CHUNK_SIZE + x;
                const tileY = cy * this.CHUNK_SIZE + y;
                const idx = tileY * mapWidth + tileX;
                if (idx < 0 || idx >= layerData.length) continue;

                const tileId = layerData[idx];
                if (tileId !== null && tileId !== undefined && tileId !== 0) {
                    hasContent = true;
                    const drawX = x * this.tileSize;
                    const drawY = y * this.tileSize;

                    if (isCollision) {
                        ctx.fillStyle = 'rgba(231, 76, 60, 0.5)';
                        ctx.fillRect(drawX, drawY, this.tileSize, this.tileSize);
                    } else {
                        const ts = 16;
                        const sx = (tileId % totalCols) * ts;
                        const sy = Math.floor(tileId / totalCols) * ts;
                        ctx.drawImage(this.tileset, sx, sy, ts, ts, drawX, drawY, this.tileSize, this.tileSize);
                    }
                }
            }
        }
        return hasContent ? canvas : null;
    }

    drawEntitySprite(entity) {
        const ctx = this.ctx;
        if (!window.SPRITES) {
            this.drawFallback(entity);
            return;
        }

        const name = entity.spriteName || 'player';
        const state = entity.animState || 'idle';
        const frame = entity.animFrame || 0;

        // Priority 1: Exact frame key (player_run_0)
        let spriteKey = `${name}_${state}_${frame}`;
        // Priority 2: State key (player_run - treated as strip)
        if (!window.SPRITES[spriteKey]) spriteKey = `${name}_${state}`;
        // Priority 3: Base key (player - treated as strip or single)
        if (!window.SPRITES[spriteKey]) spriteKey = name;

        if (!window.SPRITES[spriteKey]) {
            this.drawFallback(entity);
            return;
        }

        // Cache Check
        const cacheKey = `${spriteKey}_f${frame}_${entity.w}x${entity.h}`;
        if (!this.spriteCache[cacheKey]) {
            this.spriteCache[cacheKey] = this.generateSpriteFrame(spriteKey, frame, entity.w, entity.h);
        }

        const img = this.spriteCache[cacheKey];
        if (img) {
            ctx.save();
            ctx.translate(Math.floor(entity.x + entity.w/2), Math.floor(entity.y + entity.h/2));
            ctx.scale(entity.facingRight ? 1 : -1, 1);
            
            // Subtle Bobbing for idle/single frames
            let bob = 0;
            if (state === 'idle' || img.isSingleFrame) {
                bob = Math.sin(Date.now() * 0.005) * 2;
            }

            ctx.drawImage(img, -entity.w/2, -entity.h/2 + bob, entity.w, entity.h);
            ctx.restore();
        } else {
            this.drawFallback(entity);
        }
    }

    generateSpriteFrame(spriteKey, frameIndex, targetW, targetH) {
        const sprite = window.SPRITES[spriteKey];
        if (!sprite) return null;

        // Determine if it's a strip or a single frame
        const frameW = sprite.height; 
        const frameCount = Math.floor(sprite.width / frameW);
        const actualFrame = frameIndex % (frameCount || 1);

        const canvas = document.createElement('canvas');
        canvas.width = frameW;
        canvas.height = sprite.height;
        canvas.isSingleFrame = (frameCount <= 1);
        
        const ctx = canvas.getContext('2d');
        const startX = actualFrame * frameW;
        
        for (let y = 0; y < sprite.height; y++) {
            const row = sprite.data[y];
            if (!row) continue;
            for (let x = 0; x < frameW; x++) {
                const char = row[startX + x];
                const color = sprite.palette[char];
                if (color) {
                    ctx.fillStyle = color;
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }
        return canvas;
    }

    drawFallback(entity) {
        this.ctx.fillStyle = entity.color || '#f0f';
        this.ctx.fillRect(Math.floor(entity.x), Math.floor(entity.y), entity.w, entity.h);
    }

    drawPlayer(player) {
        this.ctx.fillStyle = player.color;
        this.ctx.fillRect(Math.floor(player.x), Math.floor(player.y), player.w, player.h);
    }

    drawEntity(ent) {
        this.ctx.fillStyle = ent.color || '#f0f';
        this.ctx.fillRect(Math.floor(ent.x), Math.floor(ent.y), ent.w, ent.h);
    }

    drawWorm(player) {
        const history = player.history || [];
        const segmentCount = player.segmentCount || 8;
        const segmentSpacing = player.segmentSpacing || 4;
        const glowColor = player.glowColor || '#e74c3c';
        
        this.ctx.save();
        this.ctx.shadowColor = glowColor;
        this.ctx.shadowBlur = 15;

        for (let i = segmentCount; i > 0; i--) {
            const hIdx = i * segmentSpacing;
            const pos = history[hIdx] || { x: player.x, y: player.y, dir: player.facingRight ? 1 : -1 };
            const taper = 1.0 - (i / (segmentCount + 2)) * 0.8;
            const sw = player.w * taper;
            const sh = player.h * taper;
            const wobble = Math.sin(Date.now() * 0.012 + i * 0.8) * (8 * (1 - taper));

            this.ctx.save();
            this.ctx.translate(pos.x + player.w/2, pos.y + player.h/2);
            this.ctx.scale(pos.dir, 1);
            this.ctx.fillStyle = glowColor;
            this.ctx.beginPath();
            this.ctx.arc(0, wobble, sw/2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }

        const headWobble = Math.sin(Date.now() * 0.012) * 3;
        this.ctx.save();
        this.ctx.translate(player.x + player.w/2, player.y + player.h/2 + headWobble);
        this.ctx.scale(player.facingRight ? 1 : -1, 1);
        this.ctx.fillStyle = glowColor;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, player.w/2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(2, -6, 4, 4);
        this.ctx.fillRect(8, -6, 4, 4);
        this.ctx.restore();
        this.ctx.restore();
    }

    drawCollectible(item) {
        this.ctx.save();
        if(item.type === 'coin') {
            this.ctx.fillStyle = '#FFD700';
            this.ctx.beginPath();
            this.ctx.arc(item.x + 8, item.y + 8, 8, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = '#FFA500';
            this.ctx.beginPath();
            this.ctx.arc(item.x + 8, item.y + 8, 4, 0, Math.PI * 2);
            this.ctx.fill();
        } else {
            this.ctx.fillStyle = item.color || '#0f0';
            this.ctx.fillRect(item.x, item.y, item.w, item.h);
        }
        this.ctx.restore();
    }

    drawCheckpoint(cp) {
        this.ctx.save();
        this.ctx.fillStyle = cp.activated ? '#2ecc71' : '#95a5a6';
        this.ctx.fillRect(cp.x + 12, cp.y, 4, 64);
        this.ctx.beginPath();
        this.ctx.moveTo(cp.x + 16, cp.y + 8);
        this.ctx.lineTo(cp.x + 32, cp.y + 16);
        this.ctx.lineTo(cp.x + 16, cp.y + 24);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();
    }

    drawGoal(goal) {
        const x = goal.x * 32;
        const y = goal.y * 32;
        this.ctx.save();
        this.ctx.fillStyle = '#f1c40f';
        this.ctx.beginPath();
        for(let i = 0; i < 5; i++) {
            const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
            const radius = i % 2 === 0 ? 20 : 10;
            const px = x + 16 + Math.cos(angle) * radius;
            const py = y + 32 + Math.sin(angle) * radius;
            if(i === 0) this.ctx.moveTo(px, py); else this.ctx.lineTo(px, py);
        }
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();
    }

    drawHUD(player) {
        this.ctx.save();
        this.ctx.font = '24px VT323, monospace';
        this.ctx.fillStyle = '#fff';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 3;
        const coinText = `COINS: ${player.coins || 0}`;
        this.ctx.strokeText(coinText, 20, 40);
        this.ctx.fillText(coinText, 20, 40);
        const hpBarW = 200;
        const hpBarH = 20;
        const hpBarX = 20;
        const hpBarY = 50;
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(hpBarX - 2, hpBarY - 2, hpBarW + 4, hpBarH + 4);
        const hpPercent = (player.hp || 100) / (player.maxHp || 100);
        this.ctx.fillStyle = hpPercent > 0.5 ? '#2ecc71' : hpPercent > 0.25 ? '#f39c12' : '#e74c3c';
        this.ctx.fillRect(hpBarX, hpBarY, hpBarW * hpPercent, hpBarH);
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(hpBarX, hpBarY, hpBarW, hpBarH);
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(`HP: ${Math.floor(player.hp || 100)}/${player.maxHp || 100}`, hpBarX + 5, hpBarY + 15);
        this.ctx.restore();
    }
}

window.PlatformerRenderer = PlatformerRenderer;
