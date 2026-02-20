class PlatformerRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.ctx.imageSmoothingEnabled = false;
        
        const config = window.PlatformerConfig || { TILE_SIZE: 32, CHUNK_SIZE: 16 };
        this.camera = { x: 0, y: 0 };
        this.tileset = new Image();
        this.tileset.src = '/engines/rpg-topdown/assets/world_tileset.png'; 
        
        this.tileSize = config.TILE_SIZE;
        this.viewW = canvas.width;
        this.viewH = canvas.height;

        // Chunking
        this.CHUNK_SIZE = config.CHUNK_SIZE;
        this.chunks = {}; 

        // Sprite Caching
        this.spriteCache = {}; // name_state_frame -> Canvas

        // Parallax
        this.parallax = new window.ParallaxSystem(this);

        // Shake
        this.shakeAmount = 0;
        this.shakeTimer = 0;

        // Editor / Zoom
        this.zoom = config.DEFAULT_ZOOM || 1.0;
    }

    setZoom(value) {
        this.zoom = value;
    }

    shake(amount = 5, duration = 0.2) {
        this.shakeAmount = amount;
        this.shakeTimer = duration;
    }

    resize(w, h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this.viewW = w;
        this.viewH = h;
        this.ctx.imageSmoothingEnabled = false;
        
        // Invalidate cache on resize to ensure full coverage if needed
        this.invalidateCache();
    }

    setCameraToPlayer(player, mapWidth, mapHeight) {
        if (!player || isNaN(player.x)) return;
        
        // World viewport size
        const worldViewW = this.viewW / this.zoom;
        const worldViewH = this.viewH / this.zoom;

        this.camera.x = player.x + player.w/2 - worldViewW/2;
        this.camera.y = player.y + player.h/2 - worldViewH/2;
        
        const maxW = (mapWidth || 20) * this.tileSize;
        const maxH = (mapHeight || 15) * this.tileSize;
        this.camera.x = Math.max(0, Math.min(this.camera.x, Math.max(0, maxW - worldViewW)));
        this.camera.y = Math.max(0, Math.min(this.camera.y, Math.max(0, maxH - worldViewH)));
    }

    addParallaxLayer(image, sx, sy, op) {
        this.parallax.addLayer(image, sx, sy, op);
    }

    updateCamera(player, mapWidth, mapHeight) {
        if (!player || isNaN(player.x)) return;

        // World viewport size
        const worldViewW = this.viewW / this.zoom;
        const worldViewH = this.viewH / this.zoom;

        let targetX = player.x + player.w/2 - worldViewW/2;
        let targetY = player.y + player.h/2 - worldViewH/2;

        const maxW = (mapWidth || 20) * this.tileSize;
        const maxH = (mapHeight || 15) * this.tileSize;

        targetX = Math.max(0, Math.min(targetX, Math.max(0, maxW - worldViewW)));
        targetY = Math.max(0, Math.min(targetY, Math.max(0, maxH - worldViewH)));

        if (isNaN(this.camera.x)) this.camera.x = targetX;
        if (isNaN(this.camera.y)) this.camera.y = targetY;

        this.camera.x += (targetX - this.camera.x) * 0.1;
        this.camera.y += (targetY - this.camera.y) * 0.1;
        
        this.camera.x = Math.floor(this.camera.x) || 0;
        this.camera.y = Math.floor(this.camera.y) || 0;

        // Apply Shake
        if (this.shakeTimer > 0) {
            const dt = 1/60;
            this.shakeTimer -= dt;
            this.camera.x += (Math.random() - 0.5) * 2 * this.shakeAmount;
            this.camera.y += (Math.random() - 0.5) * 2 * this.shakeAmount;
        }
    }

    async loadTileset(path) {
        if (this.currentTilesetPath === path && this.tilesetReady) return;
        this.currentTilesetPath = path;
        this.tilesetReady = false;

        // Reset additional tilesets
        this.additionalTilesets = {};

        // Helper to load a single image
        const loadImage = (src) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => {
                    console.warn(`[PlatformerRenderer] Failed to load tileset: ${src}`);
                    resolve(null);
                };
                img.src = src;
            });
        };

        // 1. Load Main Tileset
        if (path === 'WORLD_PIXEL_ART') {
            try {
                this.tileset = await this.combineWorldPixelArt();
                this.tilesetReady = true;
            } catch(e) {
                console.error('[PlatformerRenderer] Tileset combining failed', e);
                this.tileset = await loadImage('/engines/rpg-topdown/assets/world_tileset.png');
                this.tilesetReady = true;
            }
        } else {
            this.tileset = await loadImage(path || '/engines/rpg-topdown/assets/world_tileset.png');
            this.tilesetReady = true;
        }

        // 2. Load Additional Tilesets if defined in map
        if (this.currentMap && this.currentMap.additionalTilesets) {
            for (const [key, tpath] of Object.entries(this.currentMap.additionalTilesets)) {
                const img = await loadImage(tpath);
                if (img) this.additionalTilesets[key] = img;
            }
        }

        this.invalidateCache();
    }

    async combineWorldPixelArt() {
        if (window._cachedCombinedTileset) return window._cachedCombinedTileset;

        console.log('[PlatformerRenderer] Combining tileset...');
        const canvas = document.createElement('canvas');
        const tSize = 16;
        const cols = 16;
        const totalTiles = 600; 
        const rows = Math.ceil(totalTiles / cols);
        canvas.width = cols * tSize;
        canvas.height = rows * tSize;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        
        const v = Date.now();
        const batchSize = 50; // Load in batches to avoid browser throttling
        
        for (let i = 1; i <= totalTiles; i += batchSize) {
            const promises = [];
            for (let j = i; j < i + batchSize && j <= totalTiles; j++) {
                promises.push(new Promise(resolve => {
                    const img = new Image();
                    img.onload = () => {
                        const x = ((j - 1) % cols) * tSize;
                        const y = Math.floor((j - 1) / cols) * tSize;
                        ctx.drawImage(img, x, y, tSize, tSize);
                        resolve();
                    };
                    img.onerror = () => resolve();
                    img.src = '/sprite-art/worldpixelart/texture_16px ' + j + '.png?v=' + v;
                }));
            }
            await Promise.all(promises);
        }

        console.log('[PlatformerRenderer] Tileset combined.');
        window._cachedCombinedTileset = canvas;
        return canvas;
    }

    invalidateCache() {
        this.chunks = {};
    }

    isSolid(map, x, y) {
        if(!map) return false;
        if(y < 0 || y >= map.height) return false;
        if(x < 0 || x >= map.width) return false;
        const tile = map.collision[y * map.width + x];
        return tile === 1;
    }

    calculateBitmask(map, x, y) {
        let mask = 0;
        if (this.isSolid(map, x, y - 1)) mask += 1; // Top
        if (this.isSolid(map, x + 1, y)) mask += 2; // Right
        if (this.isSolid(map, x, y + 1)) mask += 4; // Bottom
        if (this.isSolid(map, x - 1, y)) mask += 8; // Left
        return mask;
    }

    render(map, player, entities = [], collectibles = [], checkpoints = []) {
        if (!map) return;

        // 1. Background Fill & Parallax
        if (map.background && map.background.startsWith('#')) {
            this.ctx.fillStyle = map.background;
            this.ctx.fillRect(0, 0, this.viewW, this.viewH);
        } else {
            this.ctx.fillStyle = window.PlatformerConfig?.DEFAULT_BG || '#87CEEB';
            this.ctx.fillRect(0, 0, this.viewW, this.viewH);
        }

        // Draw Parallax
        this.parallax.render(this.camera.x, this.camera.y);

        this.ctx.save();
        this.ctx.scale(this.zoom, this.zoom);
        this.ctx.translate(-this.camera.x, -this.camera.y);

        if (this.currentMap !== map) {
            this.invalidateCache();
            this.currentMap = map;
        }
        
        // 2. Separate layers into Background, Main, and Foreground
        const bgLayers = [];
        const mainLayers = [];
        const fgLayers = [];

        if (map.layers && map.layers.length > 0) {
            map.layers.forEach((layer, i) => {
                if (!layer) return;
                const layerData = Array.isArray(layer) ? layer : layer.data;
                const layerName = layer.name || `layer_${i}`;
                
                if (layerName.toLowerCase().includes('foreground') || layerName.toLowerCase().includes('fg')) {
                    fgLayers.push({ data: layerData, index: i });
                } else if (layerName.toLowerCase().includes('background') || layerName.toLowerCase().includes('bg') || i === 0) {
                    bgLayers.push({ data: layerData, index: i });
                } else {
                    mainLayers.push({ data: layerData, index: i });
                }
            });
        }

        // 3. Render Background Layers
        bgLayers.forEach(l => this.drawLayerChunked(l.data, map.width, l.index));

        // 4. Render Decorations (Background pass)
        if (map.decorations) {
            this.drawDecorations(map.decorations, false);
        }

        // 5. Render Main Layers
        mainLayers.forEach(l => this.drawLayerChunked(l.data, map.width, l.index));

        // Fallback: If NO visual layers, draw collision
        if (bgLayers.length === 0 && mainLayers.length === 0 && map.collision) {
            this.drawLayerChunked(map.collision, map.width, 'col', true);
        }

        // 6. Interactive Elements
        checkpoints.forEach(cp => this.drawCheckpoint(cp));
        collectibles.forEach(item => !item.collected && this.drawCollectible(item));
        if(map.goal || map.exit) this.drawGoal(map.exit || map.goal);

        // 7. Entities & Player
        if (player) {
            if (player.draw) player.draw(this);
            else this.drawPlayer(player);
        }

        entities.forEach(ent => {
            if (ent.draw) ent.draw(this);
            else this.drawEntity(ent);
        });

        // 8. Foreground Decorations
        if (map.decorations) {
            this.drawDecorations(map.decorations, true);
        }

        // 9. Foreground Layers
        fgLayers.forEach(l => this.drawLayerChunked(l.data, map.width, l.index));

        // 10. FX / Particles (World Space)
        if (window.game && window.game.fx) {
            window.game.fx.render(this.camera.x, this.camera.y);
        }

        this.ctx.restore();
        
        // 11. Soft Lighting Pass (Screen Space)
        if (window.game && window.game.fx) {
            const lights = [];
            // Collect lights from entities
            entities.forEach(ent => {
                if (ent.light) lights.push({ 
                    x: ent.x + ent.w/2, 
                    y: ent.y + ent.h/2, 
                    radius: ent.light.radius || 150, 
                    color: ent.light.color || 'rgba(255, 200, 100, 0.2)',
                    intensity: ent.light.intensity || 0.6
                });
            });
            
            // Player light
            if (player) {
                lights.push({
                    x: player.x + player.w/2,
                    y: player.y + player.h/2,
                    radius: player.isWorm ? 150 : 200,
                    color: player.isWorm ? 'rgba(231, 76, 60, 0.4)' : 'rgba(255, 255, 200, 0.3)',
                    intensity: 0.8
                });
            }

            window.game.fx.renderSoftLighting(this.camera.x, this.camera.y, lights);
        }

        // 12. HUD
        this.drawHUD(player);
    }

    drawDecorations(decorations, foregroundOnly = false) {
        if (!this.tilesetReady) return;

        decorations.forEach(deco => {
            const isFG = deco.isForeground || (deco.type === 'prefab' && deco.data?.toLowerCase().includes('fg')) || deco.layer === 'foreground';
            if (foregroundOnly !== !!isFG) return;

            this.ctx.save();
            this.ctx.globalAlpha = deco.opacity !== undefined ? deco.opacity : 1.0;

            if (deco.type === 'prefab') {
                const spriteName = deco.sprite || deco.data;
                if (window.createPixelImage) {
                    const img = window.createPixelImage(spriteName);
                    if (img) {
                        this.ctx.drawImage(img, deco.x * 32, deco.y * 32, deco.w || 32, deco.h || 32);
                    }
                }
            } else if (deco.tileId) {
                // Determine which tileset to use
                let targetTileset = this.tileset;
                let ts = 16;
                let totalCols = 16;

                if (deco.tilesetKey && this.additionalTilesets && this.additionalTilesets[deco.tilesetKey]) {
                    targetTileset = this.additionalTilesets[deco.tilesetKey];
                    ts = deco.tileSize || 16;
                    totalCols = Math.floor(targetTileset.width / ts);
                }

                const tid = deco.tileId - 1;
                if (tid >= 0 && targetTileset && targetTileset.width > 0) {
                    const sx = (tid % totalCols) * ts;
                    const sy = Math.floor(tid / totalCols) * ts;
                    this.ctx.drawImage(targetTileset, sx, sy, ts, ts, deco.x * 32, deco.y * 32, deco.w || 32, deco.h || 32);
                }
            }
            this.ctx.restore();
        });
    }

    drawLayerChunked(layerData, mapWidth, layerIndex, isCollision = false) {
        if (!layerData) return;
        const worldViewW = this.viewW / this.zoom;
        const worldViewH = this.viewH / this.zoom;

        const startCx = Math.floor(this.camera.x / (this.tileSize * this.CHUNK_SIZE));
        const startCy = Math.floor(this.camera.y / (this.tileSize * this.CHUNK_SIZE));
        const endCx = Math.floor((this.camera.x + worldViewW) / (this.tileSize * this.CHUNK_SIZE));
        const endCy = Math.floor((this.camera.y + worldViewH) / (this.tileSize * this.CHUNK_SIZE));

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
        // The combined tileset is 16 columns wide
        const totalCols = 16; 

        for (let y = 0; y < this.CHUNK_SIZE; y++) {
            for (let x = 0; x < this.CHUNK_SIZE; x++) {
                const tileX = cx * this.CHUNK_SIZE + x;
                const tileY = cy * this.CHUNK_SIZE + y;
                
                // Bounds Check: Prevent wrapping to next row if tileX >= mapWidth
                if (tileX < 0 || tileX >= mapWidth || tileY < 0) continue;
                
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
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                        ctx.strokeRect(drawX, drawY, this.tileSize, this.tileSize);
                    } else if (this.tileset && (this.tileset.width > 0) && this.tilesetReady) {
                        const ts = 16;
                        let tid = tileId - 1;

                        // SMART AUTO-TILING: Focus on Solid Block (ID 1)
                        // Connectivity layout assumed to be 16 tiles starting at index 16 (Row 2)
                        // if tileId is 1. We can generalize this if needed.
                        if (tileId === 1 && this.currentMap?.autoTiling) {
                            const mask = this.calculateBitmask(this.currentMap, tileX, tileY);
                            // We assume Row 2 (index 16) is the connectivity row for grass/stone
                            const autoTileRowOffset = 16; 
                            tid = autoTileRowOffset + mask;
                        }

                        if (tid >= 0) {
                            const sx = (tid % totalCols) * ts;
                            const sy = Math.floor(tid / totalCols) * ts;
                            ctx.drawImage(this.tileset, sx, sy, ts, ts, drawX, drawY, this.tileSize, this.tileSize);
                        }
                    } else {
                        // Color block fallback or "loading" state
                        ctx.fillStyle = '#444'; // Slightly lighter than #222
                        ctx.fillRect(drawX, drawY, this.tileSize, this.tileSize);
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

        // Try to find sprite in global registry
        let sprite = window.SPRITES[name];
        if (!sprite) {
            this.drawFallback(entity);
            return;
        }

        // Cache Check
        const cacheKey = `${name}_${state}_f${frame}_${entity.w}x${entity.h}`;
        if (!this.spriteCache[cacheKey]) {
            this.spriteCache[cacheKey] = this.generateSpriteFrame(name, frame, entity.w, entity.h);
        }

        const img = this.spriteCache[cacheKey];
        if (img) {
            ctx.save();
            ctx.translate(Math.floor(entity.x + entity.w/2), Math.floor(entity.y + entity.h/2));
            ctx.scale(entity.facingRight ? 1 : -1, 1);
            
            let bob = 0;
            if (state === 'idle') {
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

        if (sprite instanceof HTMLImageElement || sprite instanceof HTMLCanvasElement) {
            return sprite;
        }

        const frameW = sprite.height; 
        const frameCount = Math.floor(sprite.width / frameW) || 1;
        const actualFrame = frameIndex % frameCount;

        const canvas = document.createElement('canvas');
        canvas.width = frameW;
        canvas.height = sprite.height;
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
        this.ctx.save();
        this.ctx.fillStyle = entity.color || '#f0f';
        this.ctx.fillRect(Math.floor(entity.x), Math.floor(entity.y), entity.w, entity.h);
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(Math.floor(entity.x), Math.floor(entity.y), entity.w, entity.h);
        this.ctx.restore();
    }

    drawPlayer(player) {
        this.ctx.fillStyle = player.color;
        this.ctx.fillRect(Math.floor(player.x), Math.floor(player.y), player.w, player.h);
    }

    drawEntity(ent) {
        this.ctx.fillStyle = ent.color || '#f0f';
        this.ctx.fillRect(Math.floor(ent.x), Math.floor(ent.y), ent.w, ent.h);
    }

    drawGhost(ghost) {
        this.ctx.save();
        this.ctx.globalAlpha = ghost.alpha;
        
        if (ghost.isWorm) {
            this.ctx.shadowColor = '#e74c3c';
            this.ctx.shadowBlur = 10;
            this.ctx.fillStyle = '#e74c3c';
            this.ctx.beginPath();
            this.ctx.arc(ghost.x + 12, ghost.y + 16, 10, 0, Math.PI * 2);
            this.ctx.fill();
        } else {
            const name = ghost.sprite || 'player';
            const frame = ghost.frame || 0;
            const img = this.generateSpriteFrame(name, frame, 24, 32);
            if (img) {
                this.ctx.translate(Math.floor(ghost.x + 12), Math.floor(ghost.y + 16));
                this.ctx.scale(ghost.facingRight ? 1 : -1, 1);
                this.ctx.drawImage(img, -12, -16, 24, 32);
            }
        }
        this.ctx.restore();
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
            
            if (window.game && window.game.playerBody) {
                this.ctx.drawImage(window.game.playerBody, -sw/2, -sh/2 + wobble, sw, sh);
            } else {
                this.ctx.beginPath();
                this.ctx.arc(0, wobble, sw/2, 0, Math.PI * 2);
                this.ctx.fill();
            }
            this.ctx.restore();
        }

        const headWobble = Math.sin(Date.now() * 0.012) * 3;
        this.ctx.save();
        this.ctx.translate(player.x + player.w/2, player.y + player.h/2 + headWobble);
        this.ctx.scale(player.facingRight ? 1 : -1, 1);
        
        if (window.game && window.game.playerHead) {
            this.ctx.drawImage(window.game.playerHead, -player.w/2, -player.h/2, player.w, player.h);
        } else {
            this.ctx.fillStyle = glowColor;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, player.w/2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = '#fff';
            this.ctx.fillRect(2, -6, 4, 4);
            this.ctx.fillRect(8, -6, 4, 4);
        }
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
