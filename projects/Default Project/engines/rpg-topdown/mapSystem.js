// mapSystem.js - Stable Map Engine

window.MapSystem = class MapSystem {
    constructor(ctx, tileSize = 16) {
        this.ctx = ctx;
        this.tileSize = tileSize;
        this.scale = 3; 
        this.tileset = null;
        this.propImages = {
            torch: new Image(), chest: new Image(), candle: new Image(),
            npc: window.createPixelImage('player'), sign: window.createPixelImage('sign')
        };
        this.propImages.torch.src = "base_game/assets/props/torch.png";
        this.propImages.chest.src = "base_game/assets/props/chest.png";
        this.propImages.candle.src = "base_game/assets/props/candle.png";
        this.mapData = []; this.collisionMap = []; this.decorations = [];
        this.width = 0; this.height = 0; this.tilesetCols = 16;
        
        // Cache
        this.cacheCanvas = document.createElement('canvas');
        this.cacheCtx = this.cacheCanvas.getContext('2d');
        this.isCached = false;
    }

    async loadMap(mapData) {
        this.width = mapData.width;
        this.height = mapData.height;
        this.type = mapData.type || 'topdown';
        this.isoOrder = null; // Reset isometric cache
        
        // Robust Layer Selection
        if (mapData.layers && Array.isArray(mapData.layers) && mapData.layers.length > 0) {
            this.layers = mapData.layers;
        } else if (mapData.visual) {
            this.layers = [mapData.visual];
        } else {
            this.layers = [[]]; // Empty fallback
        }
        
        this.collisionMap = mapData.collision;
        this.decorations = mapData.decorations || [];
        this.mapExit = mapData.exit;

        const tsPath = mapData.tilesetPath || "base_game/assets/world_tileset.png";
        if (tsPath === 'WORLD_PIXEL_ART') {
            this.tileset = await this.combineWorldPixelArt();
            this.cacheMap();
        } else {
            this.tileset = new Image();
            this.tileset.src = tsPath;
            await new Promise((resolve) => {
                this.tileset.onload = resolve;
                this.tileset.onerror = () => { console.error("Tileset failed:", tsPath); resolve(); };
            });
            this.cacheMap();
        }
    }

    cacheMap() {
        if (!this.tileset || !this.width || !this.height) return;
        const ts = this.tileSize * this.scale;
        
        // Resize cache
        this.cacheCanvas.width = this.width * ts;
        this.cacheCanvas.height = this.height * ts;
        
        console.log(`Caching Map: ${this.width}x${this.height} tiles (${this.cacheCanvas.width}x${this.cacheCanvas.height}px)`);

        this.cacheCtx.clearRect(0, 0, this.cacheCanvas.width, this.cacheCanvas.height);
        this.cacheCtx.imageSmoothingEnabled = false;

        this.layers.forEach(layer => {
            if (!layer) return;
            for (let c = 0; c < this.width; c++) {
                for (let r = 0; r < this.height; r++) {
                    const idx = r * this.width + c;
                    const tileID = layer[idx];
                    if (tileID === undefined || tileID === null) continue;
                    const srcX = (tileID % 16) * this.tileSize;
                    const srcY = Math.floor(tileID / 16) * this.tileSize;
                    this.cacheCtx.drawImage(this.tileset, srcX, srcY, this.tileSize, this.tileSize, c * ts, r * ts, ts, ts);
                }
            }
        });
        this.isCached = true;
    }

    async combineWorldPixelArt() {
        const canvas = document.createElement('canvas');
        const tSize = 16; const cols = 16; const totalTiles = 600;
        canvas.width = cols * tSize; canvas.height = Math.ceil(totalTiles / cols) * tSize;
        const ctx = canvas.getContext('2d');
        const promises = [];
        
        console.log("Generating Dynamic World Tileset...");
        
        for (let i = 1; i <= totalTiles; i++) {
            promises.push(new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    const x = ((i - 1) % cols) * tSize;
                    const y = Math.floor((i - 1) / cols) * tSize;
                    ctx.drawImage(img, x, y, tSize, tSize); 
                    resolve();
                };
                img.onerror = () => {
                    // Log but don't fail the promise
                    if (i < 10) console.warn(`Texture ${i} missing from worldpixelart`);
                    resolve(); 
                };
                img.src = `sprite-art/worldpixelart/texture_16px ${i}.png`;
            }));
        }
        await Promise.all(promises);
        console.log("Tileset Generation Complete.");
        return canvas;
    }

    draw(cameraX, cameraY, canvasWidth, canvasHeight) {
        if (!this.tileset || (this.tileset instanceof Image && !this.tileset.complete)) return;
        const ts = this.tileSize * this.scale;
        if (this.type === 'isometric') this.drawIsometric(cameraX, cameraY, canvasWidth, canvasHeight, ts);
        else this.drawStandard(cameraX, cameraY, canvasWidth, canvasHeight, ts);
    }

    drawStandard(cameraX, cameraY, canvasWidth, canvasHeight, ts) {
        // Use Cache if available
        if (this.isCached && this.cacheCanvas.width > 0) {
            // Draw visible portion of cache
            // Source: cameraX, cameraY, width, height
            // Dest: 0, 0, width, height
            
            // Safety Check bounds
            const sx = Math.max(0, cameraX);
            const sy = Math.max(0, cameraY);
            const sw = Math.min(canvasWidth, this.cacheCanvas.width - sx);
            const sh = Math.min(canvasHeight, this.cacheCanvas.height - sy);
            
            if (sw > 0 && sh > 0) {
                this.ctx.drawImage(this.cacheCanvas, sx, sy, sw, sh, Math.max(0, -cameraX), Math.max(0, -cameraY), sw, sh);
            }
        } else {
            // Fallback (or if map changed dynamically)
            const startCol = Math.max(0, Math.floor(cameraX / ts));
            const endCol = Math.min(this.width - 1, Math.floor((cameraX + canvasWidth) / ts));
            const startRow = Math.max(0, Math.floor(cameraY / ts));
            const endRow = Math.min(this.height - 1, Math.floor((cameraY + canvasHeight) / ts));

            this.layers.forEach(layer => {
                if (!layer) return;
                for (let c = startCol; c <= endCol; c++) {
                    for (let r = startRow; r <= endRow; r++) {
                        const idx = r * this.width + c;
                        const tileID = layer[idx];
                        if (tileID === undefined || tileID === null) continue;
                        const srcX = (tileID % 16) * this.tileSize;
                        const srcY = Math.floor(tileID / 16) * this.tileSize;
                        this.ctx.drawImage(this.tileset, srcX, srcY, this.tileSize, this.tileSize, Math.floor(c * ts - cameraX), Math.floor(r * ts - cameraY), ts, ts);
                    }
                }
            });
        }

        this.decorations.forEach(deco => {
            // DO NOT draw entity markers (npc, enemy, spawn) in-game
            if (['npc', 'enemy', 'spawn'].includes(deco.type)) return;
            
            const img = this.propImages[deco.type];
            if (img && (img.complete || img instanceof HTMLCanvasElement)) {
                this.drawProp(deco, img, deco.x * ts - cameraX, deco.y * ts - cameraY, ts, canvasWidth, canvasHeight);
            }
        });
    }

    drawIsometric(cameraX, cameraY, canvasWidth, canvasHeight, ts) {
        const centerX = canvasWidth / 2 - cameraX;
        
        // Optimize: Generate and sort isoOrder only once (or on resize/load)
        if (!this.isoOrder || this.isoOrder.length !== this.width * this.height) {
            this.isoOrder = [];
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    this.isoOrder.push({x, y, depth: x + y});
                }
            }
            this.isoOrder.sort((a, b) => a.depth - b.depth);
        }
        
        this.isoOrder.forEach(t => {
            const idx = t.y * this.width + t.x;
            const collType = this.collisionMap[idx] || 0;
            let blockH = 0;
            let blockColor1 = '#534';
            let blockColor2 = '#756';
            
            // Determine block height and color based on collision type
            if (collType === 1) {
                blockH = ts; // Full height shadowed
            } else if (collType === 2) {
                blockH = ts * 0.8; // Shadowless wall (slightly shorter visual)
                blockColor1 = '#246';
                blockColor2 = '#468';
            } else if (collType === 3) {
                blockH = ts * 0.5; // Half height
                blockColor1 = '#853';
                blockColor2 = '#a75';
            }

            // Screen Position (Base of the tile)
            const screenX = centerX + (t.x - t.y) * ts;
            const screenY = (t.x + t.y) * (ts / 2) - cameraY;

            // Check Visibility
            if (screenX > -ts * 2 && screenX < canvasWidth + ts && screenY > -ts - blockH && screenY < canvasHeight + ts) {
                // DRAW BLOCK SIDES (If has height)
                if (blockH > 0) {
                    this.ctx.fillStyle = blockColor1;
                    this.ctx.beginPath();
                    this.ctx.moveTo(screenX, screenY + ts);
                    this.ctx.lineTo(screenX + ts, screenY + ts/2);
                    this.ctx.lineTo(screenX + ts, screenY + ts/2 - blockH);
                    this.ctx.lineTo(screenX, screenY + ts - blockH);
                    this.ctx.fill();

                    this.ctx.fillStyle = blockColor2;
                    this.ctx.beginPath();
                    this.ctx.moveTo(screenX - ts, screenY + ts/2);
                    this.ctx.lineTo(screenX, screenY + ts);
                    this.ctx.lineTo(screenX, screenY + ts - blockH);
                    this.ctx.lineTo(screenX - ts, screenY + ts/2 - blockH);
                    this.ctx.fill();
                }

                // DRAW TOP FACE - Iterate Layers
                this.layers.forEach(layer => {
                    const tileID = layer[idx];
                    if (tileID !== undefined && tileID !== null) {
                        const srcX = (tileID % 16) * this.tileSize;
                        const srcY = Math.floor(tileID / 16) * this.tileSize;
                        this.ctx.drawImage(this.tileset, srcX, srcY, this.tileSize, this.tileSize, Math.floor(screenX - ts), Math.floor(screenY - blockH), ts * 2, ts);
                    }
                });

                // DRAW PROPS
                const props = this.decorations.filter(d => d.x === t.x && d.y === t.y);
                props.forEach(deco => {
                    const img = this.propImages[deco.type];
                    const elev = this.isSolid(t.x * ts, t.y * ts) ? blockH : 0;
                    if (img && (img.complete || img instanceof HTMLCanvasElement)) {
                        this.drawProp(deco, img, screenX - ts/2, screenY - elev, ts, canvasWidth, canvasHeight);
                    }
                });
            }
        });
    }

    drawProp(deco, img, x, y, ts, cw, ch) {
        if (x > -ts && x < cw && y > -ts && y < ch) {
            const s = (deco.type === 'npc' || deco.type === 'enemy') ? 1.0 : 0.6;
            const dw = ts * s, dh = ts * s;
            const ox = (ts - dw) / 2, oy = (ts - dh) / 2 + (deco.type === 'torch' ? -10 : 0);
            this.ctx.drawImage(img, 0, 0, img.width, img.height, Math.floor(x + ox), Math.floor(y + oy), dw, dh);
        }
    }
    
    getCollisionType(x, y) {
        const ts = this.tileSize * this.scale;
        const c = Math.floor(x / ts), r = Math.floor(y / ts);
        if (c < 0 || c >= this.width || r < 0 || r >= this.height) return 1; // Out of bounds = solid
        return this.collisionMap[r * this.width + c] || 0;
    }
    
    isSolid(x, y, direction = null) {
        const collType = this.getCollisionType(x, y);
        
        // Passable
        if (collType === 0) return false;
        
        // Trigger zone (passable but detectable)
        if (collType === 8) return false;
        
        // One-way collision (4=up, 5=down, 6=left, 7=right)
        if (collType >= 4 && collType <= 7) {
            if (!direction) return true; // Default to solid if no direction given
            
            // Allow passage from specific directions
            if (collType === 4 && direction === 'down') return false; // Can move down through "one-way up"
            if (collType === 5 && direction === 'up') return false;
            if (collType === 6 && direction === 'right') return false;
            if (collType === 7 && direction === 'left') return false;
            
            return true;
        }
        
        // Solid types (1, 2, 3)
        return collType === 1 || collType === 2 || collType === 3;
    }
    
    isTriggerZone(x, y) {
        return this.getCollisionType(x, y) === 8;
    }
    
    isHalfHeight(x, y) {
        return this.getCollisionType(x, y) === 3;
    }
}