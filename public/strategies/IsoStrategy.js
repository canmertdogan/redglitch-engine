class IsoStrategy {
    constructor() {
        this.tileCache = {};
        this.lastTileset = null;
        this.cacheCols = 0;
        this.renderQueue = []; 
        this._projCache = {};
    }

    getTileDims(config) {
        const base = config.tileSize * config.scale;
        return { w: base * 2, h: base };
    }

    isTilesetReady(tileset) {
        if (!tileset) return false;
        if (tileset instanceof HTMLImageElement) return tileset.complete && tileset.naturalWidth > 0;
        return tileset.width > 0;
    }

    prepareCache(tileset, config) {
        const sourceId = (tileset instanceof HTMLImageElement) ? (tileset.src || 'img') : 'canvas_combined';
        if (this.lastTileset !== sourceId) {
            this.tileCache = {};
            this.lastTileset = sourceId;
            const ts = config.tileSize;
            this.tilesetCols = Math.floor(tileset.width / ts);
        }
    }

    getTileImage(tileID, shape, tileset, config) {
        const key = tileID + "_" + shape;
        if (this.tileCache[key]) return this.tileCache[key];

        const dims = this.getTileDims(config);
        const canvas = document.createElement('canvas');
        canvas.width = dims.w;
        canvas.height = (dims.h * 2) * 6;
        
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        const ts = config.tileSize;
        const cols = this.tilesetCols || Math.floor(tileset.width / ts);
        const sx = (tileID % cols) * ts;
        const sy = Math.floor(tileID / cols) * ts;

        for (let s = 0; s < 6; s++) {
            const dy = s * (dims.h * 2);
            this.drawShapeToCache(ctx, dims.w/2, dy, dims.w, dims.h, tileset, sx, sy, ts, s);
        }
        
        this.tileCache[key] = canvas;
        return canvas;
    }

    drawShapeToCache(ctx, x, y, w, h, tileset, sx, sy, ts, shape) {
        let sNW = 0, sNE = 0, sSE = 0, sSW = 0;
        let bodyH = h; 

        if (shape === 1) { sNW = h; sSW = h; } 
        if (shape === 2) { sNE = h; sSE = h; } 
        if (shape === 3) { sNW = h; sNE = h; } 
        if (shape === 4) { sSW = h; sSE = h; } 
        if (shape === 5) { bodyH = h / 2; } 

        // Right Side
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + w/2, y + h/2 + sNE); 
        ctx.lineTo(x, y + h + sSE);         
        ctx.lineTo(x, y + h + bodyH);           
        ctx.lineTo(x + w/2, y + h/2 + bodyH);   
        ctx.closePath(); 
        ctx.clip();
        ctx.drawImage(tileset, sx, sy, ts, ts, x, y + h/2, w/2, h * 1.5);
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; 
        ctx.fill();
        ctx.restore();

        // Left Side
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x - w/2, y + h/2 + sNW); 
        ctx.lineTo(x, y + h + sSW);         
        ctx.lineTo(x, y + h + bodyH);           
        ctx.lineTo(x - w/2, y + h/2 + bodyH);   
        ctx.closePath(); 
        ctx.clip();
        ctx.drawImage(tileset, sx, sy, ts, ts, x - w/2, y + h/2, w/2, h * 1.5);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; 
        ctx.fill();
        ctx.restore();

        // Top Face
        ctx.save();
        const ty = (shape === 5) ? y + h/2 : y;
        ctx.beginPath();
        ctx.moveTo(x, ty + sNE);             
        ctx.lineTo(x + w/2, ty + h/2 + sSE); 
        ctx.lineTo(x, ty + h + sSW);         
        ctx.lineTo(x - w/2, ty + h/2 + sNW); 
        ctx.closePath(); 
        ctx.clip();
        ctx.drawImage(tileset, sx, sy, ts, ts, x - w/2, ty, w, h + Math.max(sNW, sNE, sSE, sSW));
        ctx.restore();

        // Outline
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.moveTo(x, y + h + bodyH);
        ctx.lineTo(x + w/2, y + h/2 + bodyH);
        ctx.lineTo(x + w/2, y + h/2 + sNE + (shape===5?h/2:0));
        ctx.lineTo(x, y + sNE + (shape===5?h/2:0));
        ctx.lineTo(x - w/2, y + h/2 + sNW + (shape===5?h/2:0));
        ctx.lineTo(x - w/2, y + h/2 + bodyH);
        ctx.closePath(); 
        ctx.stroke();
    }

    screenToMap(screenX, screenY, config, rect, state = {}) {
        const dims = this.getTileDims(config);
        const offsetX = (rect.width / 2) + (state.camX || 0);
        const offsetY = (rect.height / 4) + (state.camY || 0);
        const sx = screenX - rect.left - offsetX;
        const sy = screenY - rect.top - offsetY;
        return {
            x: Math.floor((sx / (dims.w / 2) + sy / (dims.h / 2)) / 2),
            y: Math.floor((sy / (dims.h / 2) - sx / (dims.w / 2)) / 2)
        };
    }

    project(mapX, mapY, mapZ, dims) {
        return {
            x: (mapX - mapY) * (dims.w / 2),
            y: (mapX + mapY) * (dims.h / 2) - (mapZ * dims.h)
        };
    }

    buildOcclusionMap(map) {
        // Ensure occlusion is a valid TypedArray
        if (!map.occlusion || !(map.occlusion instanceof Int8Array) || map.occlusion.length !== map.width * map.height) {
            map.occlusion = new Int8Array(map.width * map.height).fill(-127);
            map.occlusionDirty = true;
        }
        
        if (!map.occlusionDirty && map.lastOcclusionTime === map.lastModified) return;

        const w = map.width;
        const h = map.height;
        map.occlusion.fill(-127);

        for (let l = map.layers.length - 1; l >= 0; l--) {
            const layer = map.layers[l];
            const zLayer = map.z ? map.z[l] : null;
            const sLayer = map.shapes ? map.shapes[l] : null;
            
            if (!layer || !zLayer || !sLayer) continue;

            for (let i = 0; i < w * h; i++) {
                if (map.occlusion[i] > -100) continue; 
                const tid = layer[i];
                if (tid !== null && tid !== undefined) {
                    if (sLayer[i] === 0) { 
                        map.occlusion[i] = zLayer[i];
                    }
                }
            }
        }
        
        map.occlusionDirty = false;
        map.lastOcclusionTime = map.lastModified || Date.now();
    }

    calculateLighting(map) {
        if (map.lighting && !map.occlusionDirty) return; // Reuse if valid
        
        // lighting: 0 = fully lit, 1 = shadowed
        map.lighting = new Uint8Array(map.width * map.height);
        
        // Shadow Height Map (tracks the "shadow volume" moving diagonally)
        // We assume Sun comes from Top-Left (-1, -1).
        // Shadow propagates to (x, y) from (x-1, y-1).
        // Since we iterate x: 0->w, y: 0->h, we can process in order.
        
        // We need a temp buffer for shadow heights? 
        // Or just compute on the fly if we iterate diagonally? 
        // Simple iteration x,y works because x-1,y-1 are already computed.
        
        const shadowH = new Int8Array(map.width * map.height).fill(-127);
        const w = map.width;
        
        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const idx = y * w + x;
                const surfaceZ = map.occlusion[idx]; // Highest solid block
                
                // Get shadow caster height from neighbor (Sun Direction)
                // Neighbor is (x-1, y-1)
                let incomingShadowZ = -127;
                if (x > 0 && y > 0) {
                    incomingShadowZ = shadowH[(y - 1) * w + (x - 1)];
                }
                
                // Shadow falls 1 block per tile (45 degree sun)
                incomingShadowZ -= 1;
                
                // Am I in shadow?
                if (surfaceZ < incomingShadowZ) {
                    map.lighting[idx] = 1; // Shadowed
                } else {
                    map.lighting[idx] = 0; // Lit
                }
                
                // What shadow do I cast?
                // Either my own height, or the shadow passing through me
                shadowH[idx] = Math.max(surfaceZ, incomingShadowZ);
            }
        }
    }

    invalidateChunks() {
        // Clear caches that might be affected by map changes
        this._projCache = {};
        this.renderQueue.length = 0;
    }

    render(ctx, map, state, config, tileset, sprites) {
        if (!this.isTilesetReady(tileset)) return;
        
        ctx.imageSmoothingEnabled = false;
        this.prepareCache(tileset, config);
        
        // Only rebuild occlusion if map changed
        if (map.occlusionDirty !== false) {
            this.buildOcclusionMap(map);
            this.calculateLighting(map);
        }

        const dims = this.getTileDims(config);
        const cw = ctx.canvas.width;
        const ch = ctx.canvas.height;
        
        ctx.save();
        ctx.translate(cw / 2 + (state.camX || 0), ch / 4 + (state.camY || 0));

        // Viewport bounds calculation
        const camX = state.camX || 0;
        const camY = state.camY || 0;
        const vLeft = -cw/2 - camX - dims.w;
        const vRight = cw/2 - camX + dims.w;
        const vTop = -ch/4 - camY - (dims.h * 12); 
        const vBottom = ch - ch/4 - camY + dims.h * 2;

        // Calculate visible tile range more efficiently
        const halfW = dims.w / 2;
        const halfH = dims.h / 2;
        
        // Convert screen corners to map coords
        const toMap = (sx, sy) => ({
            x: Math.floor((sx / halfW + sy / halfH) / 2),
            y: Math.floor((sy / halfH - sx / halfW) / 2)
        });
        
        const corners = [
            toMap(vLeft, vTop), toMap(vRight, vTop),
            toMap(vLeft, vBottom), toMap(vRight, vBottom)
        ];
        
        const pad = 3;
        const minX = Math.max(0, Math.min(...corners.map(c => c.x)) - pad);
        const maxX = Math.min(map.width, Math.max(...corners.map(c => c.x)) + pad);
        const minY = Math.max(0, Math.min(...corners.map(c => c.y)) - pad);
        const maxY = Math.min(map.height, Math.max(...corners.map(c => c.y)) + pad);

        // Reuse render queue array (avoid allocation)
        this.renderQueue.length = 0;

        // Light tints (pre-defined to avoid allocations)
        const colShadow = 'rgba(10, 15, 40, 0.45)'; 
        const colSun = 'rgba(255, 220, 150, 0.12)'; 

        // Build render queue - tiles only
        const mapW = map.width;
        const layers = map.layers;
        const zLayers = map.z || [];
        const shapes = map.shapes || [];
        const occlusion = map.occlusion || [];
        const lighting = map.lighting || [];
        const layerCount = layers ? layers.length : 0;

        for (let y = minY; y < maxY; y++) {
            for (let x = minX; x < maxX; x++) {
                const idx = y * mapW + x;
                const occlusionZ = occlusion[idx];
                const isShadowed = lighting[idx] === 1;

                const baseX = (x - y) * halfW;
                const baseY = (x + y) * halfH;
                
                // Quick viewport cull
                if (baseX < vLeft || baseX > vRight || baseY < vTop || baseY > vBottom) continue;

                for (let l = 0; l < layerCount; l++) {
                    const layer = layers[l];
                    if (!layer) continue;
                    
                    // Skip hidden layers
                    if (map.layerProps && map.layerProps[l] && !map.layerProps[l].visible) continue;

                    const tid = layer[idx];
                    if (tid === null || tid === undefined) continue;

                    // Safety check for z-layers
                    const zLayer = zLayers[l];
                    if (!zLayer) continue;
                    const z = zLayer[idx];
                    // if (z < occlusionZ) continue; // Occluded - Disabled to allow floating/stacked blocks

                    this.renderQueue.push({
                        type: 't',
                        img: this.getTileImage(tid, shapes[l] ? shapes[l][idx] : 0, tileset, config),
                        sy: (shapes[l] ? shapes[l][idx] : 0) * (dims.h * 2),
                        x: baseX,
                        y: baseY - (z * dims.h),
                        depth: (x + y) + (z * 0.01),
                        tint: isShadowed ? colShadow : colSun,
                        isShadowed: isShadowed
                    });
                }
            }
        }

        // Add entities (player, decorations)
        const ents = state.entities || [];
        if (map.decorations) {
            for (const d of map.decorations) {
                if (d.x < minX - 1 || d.x > maxX + 1 || d.y < minY - 1 || d.y > maxY + 1) continue;
                const lIdx = Math.floor(d.y) * mapW + Math.floor(d.x);
                const isShad = lIdx >= 0 && lIdx < lighting.length && lighting[lIdx] === 1;
                this.renderQueue.push({
                    type: 'd', data: d,
                    depth: (d.x + d.y) + ((d.z||0) * 0.01) + 0.005,
                    x: d.x, y: d.y, z: d.z||0,
                    tint: isShad ? colShadow : null
                });
            }
        }
        for (const e of ents) {
            const lIdx = Math.floor(e.y) * mapW + Math.floor(e.x);
            const isShad = lIdx >= 0 && lIdx < lighting.length && lighting[lIdx] === 1;
            this.renderQueue.push({
                type: 'e', data: e,
                depth: (e.x + e.y) + ((e.z||0) * 0.01) + 0.005,
                x: e.x, y: e.y, z: e.z||0,
                tint: isShad ? colShadow : null
            });
        }

        // Sort by depth (painter's algorithm)
        this.renderQueue.sort((a, b) => a.depth - b.depth);

        // Render all items
        const qLen = this.renderQueue.length;
        const tsW = dims.w;
        const tsH = dims.h * 2;

        for (let i = 0; i < qLen; i++) {
            const item = this.renderQueue[i];
            
            if (item.type === 't') {
                if (item.img) {
                    ctx.drawImage(item.img, 0, item.sy, tsW, tsH, item.x - tsW/2, item.y, tsW, tsH);
                    
                    // Apply lighting tint (simplified)
                    if (item.tint && item.isShadowed) {
                        ctx.fillStyle = item.tint;
                        ctx.fillRect(item.x - tsW/2, item.y, tsW, tsH);
                    }
                }
            } else {
                const pos = this.project(item.x, item.y, item.z, dims);
                
                if (item.type === 'd') {
                    this.drawObject(ctx, item.data, pos.x, pos.y, dims, config, state, sprites);
                } else if (item.type === 'e') {
                    // Check if this is a worm entity
                    if (item.data.isWorm && item.data.history) {
                        this.drawWorm(ctx, item.data, dims, sprites);
                    } else if (sprites && sprites[item.data.animState]) {
                        this.drawCharacter(ctx, item.data, pos.x, pos.y, dims, sprites);
                    } else {
                        // Fallback player rendering
                        ctx.fillStyle = item.data.color || '#f1c40f';
                        const pH = dims.h * 1.5;
                        ctx.fillRect(pos.x - 8, pos.y - pH, 16, pH);
                    }
                }
            }
        }
        
        // Grid rendering (only if enabled)
        if (state.showGrid) {
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            const mw = map.width, mh = map.height;
            const gridZ = state.isoHeight || 0;
            for (let i = 0; i <= Math.max(mw, mh); i++) {
                if (i <= mh) {
                    const p1 = this.project(0, i, gridZ, dims);
                    const p2 = this.project(mw, i, gridZ, dims);
                    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                }
                if (i <= mw) {
                    const p1 = this.project(i, 0, gridZ, dims);
                    const p2 = this.project(i, mh, gridZ, dims);
                    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                }
            }
            ctx.stroke();
        }

        ctx.restore();
    }

    drawCharacter(ctx, player, cx, cy, dims, sprites) {
        // Check for 4-directional character sprite first
        if (sprites.character && sprites.character.complete && sprites.character.naturalWidth > 0) {
            this.drawCharacter4Dir(ctx, player, cx, cy, dims, sprites.character);
            return;
        }
        
        // Fallback to legacy Knight sprites (side-view only)
        const state = player.animState || 'idle';
        const img = sprites[state] || sprites['idle'];
        
        if (!img || !img.complete || img.naturalWidth === 0) return;

        const fH = img.height;
        const fW = img.height; 
        const totalFrames = Math.floor(img.width / fW);
        const frame = (player.frame || 0) % totalFrames;

        const scale = 1.5; 
        
        ctx.save();
        ctx.translate(cx, cy);
        
        if (player.facing === -1) {
            ctx.scale(-1, 1);
        }
        
        ctx.drawImage(img, frame * fW, 0, fW, fH, -fW/2 * scale, -fH * scale + (dims.h/2), fW * scale, fH * scale);
        
        ctx.restore();
    }
    
    drawCharacter4Dir(ctx, player, cx, cy, dims, spriteSheet) {
        // Dungeon_Character.png layout: 112x64 pixels
        // 7 different characters × 4 directions
        // Each frame is 16x16, 1 frame per direction per character
        // Rows: 0=down, 1=left, 2=right, 3=up (standard RPG layout)
        // We can use alternating characters (0 and 1) for walk animation
        
        const frameW = 16;
        const frameH = 16;
        
        // Direction to row mapping
        const directionRows = {
            'down': 0,
            'left': 1, 
            'right': 2,
            'up': 3
        };
        
        const direction = player.direction || 'down';
        const row = directionRows[direction] || 0;
        
        // For walk animation, alternate between character 0 and character 1
        // (they look similar but provide visual movement)
        let charIndex = 0;
        if (player.animState === 'run') {
            // 2-frame walk cycle using characters 0 and 1
            charIndex = ((player.frame || 0) % 2);
        }
        
        // Source coordinates
        const sx = charIndex * frameW;
        const sy = row * frameH;
        
        // Draw scaled up for visibility
        const scale = 3.0;
        const drawW = frameW * scale;
        const drawH = frameH * scale;
        
        ctx.save();
        ctx.imageSmoothingEnabled = false; // Keep pixel art crisp
        
        // Add subtle bob effect when running for more life
        let bobOffset = 0;
        if (player.animState === 'run') {
            bobOffset = Math.abs(Math.sin((player.frame || 0) * 1.5)) * 3;
        }
        
        ctx.drawImage(
            spriteSheet,
            sx, sy, frameW, frameH,
            cx - drawW/2, cy - drawH + (dims.h/2) - bobOffset,
            drawW, drawH
        );
        
        ctx.restore();
    }
    
    drawWorm(ctx, player, dims, sprites) {
        // Ketebe Canavarı Worm - matching 2D engine exactly
        const history = player.history || [];
        const segmentCount = player.segmentCount || 8;  // Match 2D default
        const segmentSpacing = player.segmentSpacing || 4;  // Match 2D default
        const glowColor = player.glowColor || '#e74c3c';
        const isMoving = player.animState === 'run';
        
        // Get player size (matching 2D: width/height * scale)
        const sw = (player.width || 16) * (player.scale || 3);
        const sh = (player.height || 16) * (player.scale || 3);
        
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        
        // Set glow effect (matching 2D engine)
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = isMoving ? 10 : 25;
        
        // Get caterpillar sprites (from game object via sprites parameter)
        const headSprite = sprites.caterpillar_head;
        const bodySprite = sprites.caterpillar_body;
        
        // Draw segments from tail to head (so head renders on top)
        for (let i = segmentCount; i > 0; i--) {
            const hIdx = i * segmentSpacing;
            const pos = history[hIdx] || { 
                x: player.x, 
                y: player.y, 
                z: player.z,
                dir: player.direction === 'left' ? -1 : 1  // Match 2D direction convention
            };
            
            // Taper formula matching 2D: 1.0 - (i / (segmentCount + 2)) * 0.8
            const taper = 1.0 - (i / (segmentCount + 2)) * 0.8;
            const segW = sw * taper;
            const segH = sh * taper;
            
            // Project position to isometric screen space
            const screenPos = this.project(pos.x, pos.y, pos.z, dims);
            
            // Wobble animation (matching 2D: sin(Date.now() * 0.012 + i * 0.8) * 12 * (1-taper))
            const wobble = isMoving ? Math.sin(Date.now() * 0.012 + i * 0.8) * (12 * (1 - taper)) : 0;
            
            // Draw body segment
            if (bodySprite && bodySprite.width > 0) {
                ctx.save();
                ctx.translate(screenPos.x, screenPos.y + dims.h/4);  // Offset for isometric
                ctx.scale(pos.dir || 1, 1);  // Flip based on direction
                ctx.drawImage(bodySprite, -segW/2, -segH/2 + wobble, segW, segH);
                ctx.restore();
            } else {
                // Fallback: colored ellipse
                this.drawWormSegmentFallback(ctx, screenPos.x, screenPos.y + dims.h/4 + wobble, taper, glowColor);
            }
        }
        
        // Draw HEAD (matching 2D: with headWobble)
        const headWobble = isMoving ? Math.sin(Date.now() * 0.012) * 5 : 0;
        const headPos = this.project(player.x, player.y, player.z, dims);
        
        if (headSprite && headSprite.width > 0) {
            ctx.save();
            ctx.translate(headPos.x, headPos.y + dims.h/4 + headWobble);
            // Direction: 1 = right, -1 = left (matching 2D)
            const dir = (player.direction === 'left') ? -1 : 1;
            ctx.scale(dir, 1);
            ctx.drawImage(headSprite, -sw/2, -sh/2, sw, sh);
            ctx.restore();
        } else {
            // Fallback: draw head with eyes
            this.drawWormHeadFallback(ctx, headPos.x, headPos.y + dims.h/4 + headWobble, sw, glowColor);
        }
        
        ctx.shadowBlur = 0;
        ctx.restore();
    }
    
    drawWormHeadFallback(ctx, cx, cy, size, glowColor) {
        // Fallback head when caterpillar_head sprite not available
        const radius = size * 0.4;
        
        // Main head circle
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Eyes (white with black pupils, matching 2D sprite design)
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx - radius * 0.3, cy - radius * 0.2, radius * 0.25, 0, Math.PI * 2);
        ctx.arc(cx + radius * 0.3, cy - radius * 0.2, radius * 0.25, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(cx - radius * 0.25, cy - radius * 0.15, radius * 0.12, 0, Math.PI * 2);
        ctx.arc(cx + radius * 0.25, cy - radius * 0.15, radius * 0.12, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawWormSegmentFallback(ctx, cx, cy, taper, glowColor) {
        // Fallback body segment when caterpillar_body sprite not available
        const baseRadius = 16 * taper;
        
        // Parse glow color and create gradient
        const r = parseInt(glowColor.slice(1, 3), 16);
        const g = parseInt(glowColor.slice(3, 5), 16);
        const b = parseInt(glowColor.slice(5, 7), 16);
        
        // Darker center, brighter edges (like 2D sprite)
        ctx.fillStyle = `rgb(${Math.floor(r * 0.7)}, ${Math.floor(g * 0.3)}, ${Math.floor(b * 0.3)})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, baseRadius, baseRadius * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Orange accent ring (matching caterpillar_body palette)
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 2 * taper;
        ctx.beginPath();
        ctx.ellipse(cx, cy, baseRadius * 0.7, baseRadius * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    drawObject(ctx, d, cx, cy, dims, config, state, sprites) {
        if (d.type === 'prefab') {
            const data = state.prefabCache ? state.prefabCache[d.data] : null;
            if (data && data.sprite) {
                if (!window.editorSpriteCache) window.editorSpriteCache = {};
                if (!window.editorSpriteCache[data.sprite]) window.editorSpriteCache[data.sprite] = window.createPixelImage(data.sprite); 
                const img = window.editorSpriteCache[data.sprite];
                if (img && img.complete && img.naturalWidth !== 0) {
                    const scale = (data.components.find(c=>c.type==='Transform')?.scale || 3) * (config.scale/2); 
                    const dw = img.width * scale; const dh = img.height * scale;
                    ctx.drawImage(img, cx - dw/2, cy + dims.h/2 - dh, dw, dh);
                    return;
                }
            }
            ctx.fillStyle = '#2ecc71'; ctx.fillText("P", cx, cy + dims.h/2);
            return;
        }

        // Special rendering for exit signs (make them very visible in editor)
        if (d.type === 'exit') {
            ctx.save();
            ctx.shadowColor = '#00ff00';
            ctx.shadowBlur = 10;
            
            // Draw base platform
            ctx.fillStyle = '#2ecc71';
            ctx.fillRect(cx - 16, cy + dims.h/2 - 8, 32, 16);
            
            // Draw door/portal symbol
            ctx.fillStyle = '#27ae60';
            ctx.fillRect(cx - 12, cy + dims.h/2 - 24, 24, 24);
            
            // Draw highlight
            ctx.fillStyle = '#52ff52';
            ctx.fillRect(cx - 10, cy + dims.h/2 - 22, 4, 20);
            
            // Draw text
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('EXIT', cx, cy + dims.h/2 - 12);
            
            ctx.restore();
            return;
        }

        // Try to find sprite for this type or ID
        let spriteName = d.type;
        if (d.type === 'npc' && d.id) {
            // Check if specific NPC sprite exists (e.g. 'goblin'), otherwise fallback to generic 'npc'
            if (sprites && sprites[d.id]) spriteName = d.id;
        }
        
        if (sprites && sprites[spriteName]) {
            if (!window.editorSpriteCache) window.editorSpriteCache = {};
            if (!window.editorSpriteCache[spriteName]) window.editorSpriteCache[spriteName] = window.createPixelImage(spriteName);
            const img = window.editorSpriteCache[spriteName];
            
            if (img && img.width > 0) {
                const scale = (d.scale || 2.0) * (config.scale / 2); 
                const dw = img.width * scale; 
                const dh = img.height * scale;
                ctx.drawImage(img, cx - dw/2, cy + dims.h/2 - dh, dw, dh);
                return;
            }
        }

        ctx.font = "bold 16px monospace"; ctx.textAlign = "center";
        const icons = { 'npc': '☺', 'enemy': '👹', 'spawn': 'S', 'exit': '🚪', 'chest': '📦', 'checkpoint': '💾' };
        ctx.fillStyle = "cyan";
        ctx.fillText(icons[d.type] || "♦", cx, cy + dims.h/2);
    }

    draw3DGuides(ctx, mx, my, mz, dims, map) {
        if (mx < 0 || my < 0 || mx >= map.width || my >= map.height) return;
        const basePos = this.project(mx, my, 0, dims);
        const topPos = this.project(mx, my, mz, dims);
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(basePos.x, basePos.y); ctx.lineTo(basePos.x + dims.w/2, basePos.y + dims.h/2); ctx.lineTo(basePos.x, basePos.y + dims.h); ctx.lineTo(basePos.x - dims.w/2, basePos.y + dims.h/2); ctx.closePath(); ctx.stroke();
        ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(basePos.x, basePos.y + dims.h/2); ctx.lineTo(topPos.x, topPos.y + dims.h/2); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(topPos.x, topPos.y); ctx.lineTo(topPos.x + dims.w/2, topPos.y + dims.h/2); ctx.lineTo(topPos.x, topPos.y + dims.h); ctx.lineTo(topPos.x - dims.w/2, topPos.y + dims.h/2); ctx.closePath();
        ctx.fillStyle = 'rgba(241, 196, 15, 0.2)'; ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#f1c40f"; ctx.font = "12px monospace"; ctx.fillText(`Z: ${mz}`, topPos.x + dims.w/2 + 5, topPos.y + dims.h/2);
    }

    draw3DBox(ctx, t, dims, color) {
        const x1 = t.x, y1 = t.y, z1 = t.z;
        const x2 = t.x + t.w, y2 = t.y + t.h, z2 = t.z + (t.depth || 1);
        const p1 = this.project(x1, y1, z1, dims); const p2 = this.project(x2, y1, z1, dims);
        const p3 = this.project(x2, y2, z1, dims); const p4 = this.project(x1, y2, z1, dims);
        const p5 = this.project(x1, y1, z2, dims); const p6 = this.project(x2, y1, z2, dims);
        const p7 = this.project(x2, y2, z2, dims); const p8 = this.project(x1, y2, z2, dims);
        ctx.fillStyle = color; ctx.strokeStyle = color.replace('0.2', '1.0').replace('0.4', '1.0'); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p5.x, p5.y); ctx.lineTo(p6.x, p6.y); ctx.lineTo(p7.x, p7.y); ctx.lineTo(p8.x, p8.y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p6.x, p6.y); ctx.lineTo(p7.x, p7.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p2.x, p2.y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p7.x, p7.y); ctx.lineTo(p8.x, p8.y); ctx.lineTo(p4.x, p4.y); ctx.lineTo(p3.x, p3.y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "10px monospace"; ctx.textAlign = "center"; ctx.fillText(t.event, p7.x, p7.y - 10);
    }
}
window.IsoStrategy = IsoStrategy;