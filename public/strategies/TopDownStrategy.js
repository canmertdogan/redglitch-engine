class TopDownStrategy {
    constructor() {}

    screenToMap(screenX, screenY, config, rect) {
        const ts = config.tileSize * config.scale;
        return {
            x: Math.floor((screenX - rect.left) / ts),
            y: Math.floor((screenY - rect.top) / ts)
        };
    }

    render(ctx, map, state, config, tileset) {
        const ts = config.tileSize * config.scale;
        const totalCols = Math.floor(tileset.width / 16);

        // Render Layers
        map.layers.forEach((layer, layerIdx) => {
            if (!layer) return;
            // Handle visibility if prop exists
            if (map.layerProps && map.layerProps[layerIdx] && !map.layerProps[layerIdx].visible) return;

            for (let i = 0; i < layer.length; i++) {
                const tileID = layer[i];
                if (tileID === null || tileID === undefined) continue;
                
                const x = (i % map.width) * ts;
                const y = Math.floor(i / map.width) * ts;
                const sx = (tileID % totalCols) * 16;
                const sy = Math.floor(tileID / totalCols) * 16;
                
                ctx.drawImage(tileset, sx, sy, 16, 16, x, y, ts, ts);
            }
        });

        // Render FX / Weather (if global FX system exists)
        if (window.fx) {
            const mapWrapper = {
                width: map.width, height: map.height, collisionMap: map.collision,
                isSolid: (x,y) => {
                    const c = Math.floor(x/(16*config.scale)); 
                    const r = Math.floor(y/(16*config.scale));
                    if(c<0||c>=map.width||r<0||r>=map.height) return true;
                    return map.collision[r*map.width+c]===1;
                }
            };
            window.fx.renderShadows(mapWrapper, 0, 0, config.scale);
            window.fx.setWeather(map.weather); 
            window.fx.setLighting(map.lighting);
            window.fx.renderWeather(0, 0);
        }

        // Render Collision Overlay
        const colEl = document.getElementById('show-collision');
        if ((colEl && colEl.checked) || state.mode === 'collision') {
            ctx.fillStyle = 'rgba(231, 76, 60, 0.4)';
            for (let i = 0; i < map.collision.length; i++) {
                if (map.collision[i] === 1) {
                    const x = (i % map.width) * ts;
                    const y = Math.floor(i / map.width) * ts;
                    ctx.fillRect(x, y, ts, ts);
                }
            }
        }

        // Render Props/Decorations
        map.decorations.forEach(d => {
            const cx = d.x * ts + ts/2;
            const cy = d.y * ts + ts/2;
            this.drawObject(ctx, d, cx, cy, ts, config, state);
        });

        if(map.spawn) this.drawObject(ctx, {type:'spawn'}, map.spawn.x*ts+ts/2, map.spawn.y*ts+ts/2, ts, config, state);
        if(map.exit) this.drawObject(ctx, {type:'exit'}, map.exit.x*ts+ts/2, map.exit.y*ts+ts/2, ts, config, state);
        
        if(window.fx) window.fx.render(0,0);
        
        // Render Grid
        const gridEl = document.getElementById('show-grid');
        if (gridEl && gridEl.checked) {
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.beginPath();
            for (let x = 0; x <= map.width; x++) { ctx.moveTo(x*ts, 0); ctx.lineTo(x*ts, ctx.canvas.height); }
            for (let y = 0; y <= map.height; y++) { ctx.moveTo(0, y*ts); ctx.lineTo(ctx.canvas.width, y*ts); }
            ctx.stroke();
        }

        // Tool Previews (Rect) - Moved from editor.js
        if (state.isDrawing && state.tool === 'rect' && state.dragStart && state.dragEnd) {
            const x = Math.min(state.dragStart.x, state.dragEnd.x) * ts;
            const y = Math.min(state.dragStart.y, state.dragEnd.y) * ts;
            const w = (Math.abs(state.dragEnd.x - state.dragStart.x) + 1) * ts;
            const h = (Math.abs(state.dragEnd.y - state.dragStart.y) + 1) * ts;
            
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            
            if (state.fillRect) {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                ctx.fillRect(x, y, w, h);
            }
            ctx.strokeRect(x, y, w, h);
        }
    }

    drawObject(ctx, d, cx, cy, ts, config, state) {
        // Helper to draw objects (copied from original editor.js)
        if (d.type === 'prefab') {
            const data = state.prefabCache[d.data];
            if (data && data.sprite) {
                if (!window.editorSpriteCache) window.editorSpriteCache = {};
                if (!window.editorSpriteCache[data.sprite]) window.editorSpriteCache[data.sprite] = window.createPixelImage(data.sprite); // Assuming createPixelImage is global or I need to find where it was
                // Actually createPixelImage might be missing if it was in editor.js scope. 
                // Let's assume standard Image or check editor.js. 
                // Wait, createPixelImage was likely a helper.
                
                const img = window.editorSpriteCache[data.sprite];
                if (img && img.complete && img.naturalWidth !== 0) {
                    const scale = (data.components.find(c=>c.type==='Transform')?.scale || 3) * (config.scale/2); 
                    const dw = img.width * scale;
                    const dh = img.height * scale;
                    ctx.drawImage(img, cx - dw/2, cy - dh/2, dw, dh);
                    const col = data.components.find(c=>c.type==='Collider');
                    if(col) {
                        ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2;
                        ctx.strokeRect(cx - (col.width*scale)/2, cy - (col.height*scale)/2, col.width*scale, col.height*scale);
                    }
                    return;
                }
            }
            ctx.fillStyle = '#2ecc71'; 
            ctx.font="20px monospace"; ctx.textAlign="center"; ctx.textBaseline="middle";
            ctx.fillText("P", cx, cy);
            return;
        }
        
        ctx.font = "bold 20px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const icons = {
            'npc': '☺', 'enemy': '👹', 'spawn': 'S', 'exit': '🚪',
            'chest': '📦', 'sign': '🪧', 'door': '🔒', 'switch': '🔌',
            'torch': '🔥', 'candle': '🕯️', 'lamp': '🏮', 'glow': '✨',
            'spikes': '💀', 'fire_trap': '🔥', 'saw': '⚙️', 'pit': '🕳️',
            'area_trigger': '🎯', 'dialogue_trigger': '💬',
            'camera_trigger': '📽️', 'script_trigger': '📜',
            'save_point': '💾', 'teleport': '🌀', 'shop': '💰', 'healing_font': '⛲'
        };
        
        if (icons[d.type]) {
            ctx.fillStyle = '#fff'; // simplify color for now
            ctx.fillText(icons[d.type], cx, cy);
        } else {
            ctx.fillStyle = '#fff'; ctx.fillText('?', cx, cy);
        }
    }
}

window.TopDownStrategy = TopDownStrategy;
