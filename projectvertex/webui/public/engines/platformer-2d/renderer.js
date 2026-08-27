class PlatformerRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.ctx.imageSmoothingEnabled = false;
        
        const config = window.PlatformerConfig || { TILE_SIZE: 32, CHUNK_SIZE: 16 };
        this.camera = { x: 0, y: 0 };
        this.tileset = new Image();
        this.tileset.src = '/sprite-art/platformer_spritesheet.png';
        
        this.tileSize = config.TILE_SIZE;
        this.viewW = canvas.width;
        this.viewH = canvas.height;

        // Chunking
        this.CHUNK_SIZE = config.CHUNK_SIZE;
        this.chunks = {}; 
        // LRU-ish cache bookkeeping for rendered chunks to avoid unbounded memory growth
        this.chunkUsage = new Map(); // key -> last used counter
        this.maxChunks = (window.PlatformerConfig && window.PlatformerConfig.MAX_RENDER_CHUNKS) || 256;
        this._chunkCounter = 0; 

        // Sprite Caching
        this.spriteCache = {}; // name_state_frame -> Canvas

        // Parallax
        this.parallax = window.ParallaxSystem ? new window.ParallaxSystem(this) : { addLayer: () => {}, clear: () => {}, render: () => {} };

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

        const lerp = (window.PlatformerConfig && window.PlatformerConfig.CAMERA_LERP) || 0.1;
        this.camera.x += (targetX - this.camera.x) * lerp;
        this.camera.y += (targetY - this.camera.y) * lerp;
        
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
                this.tileset = await loadImage('/sprite-art/platformer_spritesheet.png');
                this.tilesetReady = true;
            }
        } else {
            this.tileset = await loadImage(path || '/sprite-art/platformer_spritesheet.png');
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
        const tSize = (window.PlatformerConfig && window.PlatformerConfig.SOURCE_TILE_SIZE) || 16;
        const cols = 16;
        const totalTiles = 600; 
        const rows = Math.ceil(totalTiles / cols);
        canvas.width = cols * tSize;
        canvas.height = rows * tSize;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        
        const v = Date.now();
        const batchSize = 50; // Load in batches to avoid browser throttling
        
        // Use fetch + createImageBitmap for async decoding where available
        const supportsImageBitmap = typeof createImageBitmap === 'function';
        for (let i = 1; i <= totalTiles; i += batchSize) {
            const promises = [];
            for (let j = i; j < i + batchSize && j <= totalTiles; j++) {
                const x = ((j - 1) % cols) * tSize;
                const y = Math.floor((j - 1) / cols) * tSize;
                const url = encodeURI('/sprite-art/worldpixelart/texture_16px ' + j + '.png?v=' + v);

                if (supportsImageBitmap) {
                    promises.push(fetch(url)
                        .then(r => r.ok ? r.blob() : null)
                        .then(blob => blob ? createImageBitmap(blob) : null)
                        .then(imgBitmap => {
                            if (imgBitmap) ctx.drawImage(imgBitmap, x, y, tSize, tSize);
                        })
                        .catch(() => {}));
                } else {
                    // Fallback to Image() for older browsers
                    promises.push(new Promise(resolve => {
                        const img = new Image();
                        img.onload = () => { ctx.drawImage(img, x, y, tSize, tSize); resolve(); };
                        img.onerror = () => resolve();
                        img.src = url;
                    }));
                }
            }
            await Promise.all(promises);
        }

        console.log('[PlatformerRenderer] Tileset combined.');
        window._cachedCombinedTileset = canvas;
        return canvas;
    }

    invalidateCache() {
        this.chunks = {};
        this.chunkUsage.clear && this.chunkUsage.clear();
        this._chunkCounter = 0;
    }

    // Ensure cache size stays under limit by evicting least-recently-used chunks
    ensureCacheLimit() {
        try {
            const limit = this.maxChunks || 256;
            const keys = Object.keys(this.chunks);
            if (keys.length < limit) return;
            // Build array of [key, usage] and sort ascending
            const usages = keys.map(k => [k, this.chunkUsage.get(k) || 0]);
            usages.sort((a,b) => a[1] - b[1]);
            const toRemove = Math.max(1, Math.floor(keys.length - limit + 1));
            for (let i = 0; i < toRemove; i++) {
                const k = usages[i][0];
                try { delete this.chunks[k]; } catch(e) {}
                try { this.chunkUsage.delete(k); } catch(e) {}
            }
        } catch (e) { console.warn('[PlatformerRenderer] ensureCacheLimit failed', e); }
    }

    registerChunkUsage(key) {
        this._chunkCounter = (this._chunkCounter || 0) + 1;
        try { this.chunkUsage.set(key, this._chunkCounter); } catch(e) {}
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
        window.game?.fx?.render?.(this.camera.x, this.camera.y);

        this.ctx.restore();
        
        // 11. Soft Lighting Pass (Screen Space)
        if (window.game?.fx) {
            const lights = [];
            // Collect lights from entities
            entities.forEach(ent => {
                if (ent.light) lights.push({ 
                    x: ent.x + ent.w/2, 
                    y: ent.y + ent.h/2, 
                    radius: ent.light.radius || 150, 
                    color: ent.light.color || 'rgba(255, 30, 39, 0.2)', // RedGlitch hue
                    intensity: ent.light.intensity || 0.6
                });
            });
            
            // Player light
            if (player) {
                lights.push({
                    x: player.x + player.w/2,
                    y: player.y + player.h/2,
                    radius: player.isWorm ? 150 : 250,
                    color: player.isWorm ? 'rgba(255, 30, 39, 0.4)' : 'rgba(255, 30, 39, 0.25)',
                    intensity: 0.9
                });
            }

            window.game?.fx?.renderSoftLighting?.(this.camera.x, this.camera.y, lights);
        }

        // 11.5 CRT Scanlines & Vignette (Screen Space)
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        for (let i = 0; i < this.viewH; i += 4) {
            this.ctx.fillRect(0, i, this.viewW, 1);
        }
        const grad = this.ctx.createRadialGradient(this.viewW/2, this.viewH/2, this.viewH/4, this.viewW/2, this.viewH/2, this.viewW);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.8)');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, 0, this.viewW, this.viewH);
        this.ctx.restore();

        // 12. HUD (handled by GameHUD DOM overlay)
        if (window.game?.hud?.showDamageFlash && player._lastHp !== undefined && player.hp < player._lastHp) {
            window.game.hud.showDamageFlash(0.3);
        }
        if (player) player._lastHp = player.hp;
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
                        this.ctx.drawImage(img, deco.x * this.tileSize, deco.y * this.tileSize, deco.w || this.tileSize, deco.h || this.tileSize);
                    }
                }
            } else if (deco.tileId) {
                // Determine which tileset to use
                let targetTileset = this.tileset;
                let ts = (window.PlatformerConfig && window.PlatformerConfig.SOURCE_TILE_SIZE) || 16;
                let totalCols = Math.floor(this.tileset.width / ts) || 16;

                if (deco.tilesetKey && this.additionalTilesets && this.additionalTilesets[deco.tilesetKey]) {
                    targetTileset = this.additionalTilesets[deco.tilesetKey];
                    ts = deco.tileSize || ((window.PlatformerConfig && window.PlatformerConfig.SOURCE_TILE_SIZE) || 16);
                    totalCols = Math.max(1, Math.floor(targetTileset.width / ts));
                }

                const tid = deco.tileId - 1;
                if (tid >= 0 && targetTileset && targetTileset.width > 0) {
                    const sx = (tid % totalCols) * ts;
                    const sy = Math.floor(tid / totalCols) * ts;
                    this.ctx.drawImage(targetTileset, sx, sy, ts, ts, deco.x * this.tileSize, deco.y * this.tileSize, deco.w || this.tileSize, deco.h || this.tileSize);
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
                    // Keep cache bounded before creating new chunk
                    this.ensureCacheLimit();
                    const chunkCanvas = this.renderChunk(layerData, mapWidth, cx, cy, isCollision);
                    if (chunkCanvas) {
                        this.chunks[key] = chunkCanvas;
                        this.registerChunkUsage(key);
                    }
                }
                if (this.chunks[key]) {
                    // Mark as recently used
                    this.registerChunkUsage(key);
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
        // Determine tileset columns from tileset width and source tile size
        const tsForChunk = (window.PlatformerConfig && window.PlatformerConfig.SOURCE_TILE_SIZE) || 16;
        const totalCols = Math.max(1, Math.floor((this.tileset && this.tileset.width) / tsForChunk)) || 16; 

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
        const sprite = window.SPRITES && window.SPRITES[spriteKey];
        if (!sprite) return null;

        // If sprite is already an image/canvas, return directly
        if (sprite instanceof HTMLImageElement || sprite instanceof HTMLCanvasElement) {
            return sprite;
        }

        // If sprite exposes frames as images/canvases, use them
        if (Array.isArray(sprite.frames) && sprite.frames.length > 0) {
            const idx = frameIndex % sprite.frames.length;
            const f = sprite.frames[idx];
            if (f instanceof HTMLImageElement || f instanceof HTMLCanvasElement) return f;
        }

        // If sprite has a single image property
        if (sprite.image && (sprite.image instanceof HTMLImageElement || sprite.image instanceof HTMLCanvasElement)) {
            return sprite.image;
        }

        // Fallback to legacy text-palette sprite format: sprite.data (array of strings) and sprite.palette
        if (sprite.data && sprite.palette) {
            const height = sprite.height || sprite.data.length || targetH || 32;
            const frameW = sprite.frameWidth || sprite.width || targetW || height;
            const frameCount = sprite.frameCount || Math.max(1, Math.floor((sprite.width || frameW) / frameW));
            const actualFrame = frameIndex % frameCount;

            const canvas = document.createElement('canvas');
            canvas.width = frameW;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            const startX = actualFrame * frameW;
            for (let y = 0; y < height; y++) {
                const row = sprite.data[y] || '';
                for (let x = 0; x < frameW; x++) {
                    const ch = row[startX + x];
                    const color = sprite.palette && sprite.palette[ch];
                    if (color) {
                        ctx.fillStyle = color;
                        ctx.fillRect(x, y, 1, 1);
                    }
                }
            }
            return canvas;
        }

        // Nothing usable found
        return null;
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
            this.ctx.shadowColor = '#ff1e27';
            this.ctx.shadowBlur = 10;
            this.ctx.fillStyle = '#ff1e27';
            this.ctx.beginPath();
            this.ctx.arc(ghost.x + 12, ghost.y + 16, 10, 0, Math.PI * 2);
            this.ctx.fill();
        } else {
            const name = ghost.sprite || 'player';
            const frame = ghost.frame || 0;
            const gw = ghost.w || 24;
            const gh = ghost.h || 32;
            const img = this.generateSpriteFrame(name, frame, gw, gh);
            if (img) {
                this.ctx.translate(Math.floor(ghost.x + gw/2), Math.floor(ghost.y + gh/2));
                this.ctx.scale(ghost.facingRight ? 1 : -1, 1);
                
                // RedGlitch tint overlay for sprites
                this.ctx.drawImage(img, -gw/2, -gh/2, gw, gh);
                this.ctx.globalCompositeOperation = 'source-atop';
                this.ctx.fillStyle = `rgba(255, 30, 39, ${ghost.alpha * 0.8})`;
                this.ctx.fillRect(-gw/2, -gh/2, gw, gh);
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
            
            const bodyImg = player.playerBody || window.game?.playerBody;
            if (bodyImg) {
                this.ctx.drawImage(bodyImg, -sw/2, -sh/2 + wobble, sw, sh);
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
        
        const headImg = player.playerHead || window.game?.playerHead;
        if (headImg) {
            this.ctx.drawImage(headImg, -player.w/2, -player.h/2, player.w, player.h);
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
        this.ctx.fillRect(cp.x + Math.floor(this.tileSize/2), cp.y, Math.max(4, Math.floor(this.tileSize/8)), this.tileSize * 2);
        this.ctx.beginPath();
        this.ctx.moveTo(cp.x + Math.floor(this.tileSize/2), cp.y + Math.floor(this.tileSize/4));
        this.ctx.lineTo(cp.x + this.tileSize, cp.y + Math.floor(this.tileSize/2));
        this.ctx.lineTo(cp.x + Math.floor(this.tileSize/2), cp.y + Math.floor(this.tileSize * 3/4));
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();
    }

    drawGoal(goal) {
        const x = goal.x * this.tileSize;
        const y = goal.y * this.tileSize;
        this.ctx.save();
        this.ctx.fillStyle = '#ff0000';
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

}

window.PlatformerRenderer = PlatformerRenderer;
