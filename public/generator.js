// generator.js - Robust Procedural Generation

const TILE = {
    EMPTY: 0,
    WALL_STONE: 3,
    WALL_STONE_ALT: 4,
    FLOOR_GRASS: 287,
    FLOOR_GRASS_FLOWER: 288,
    FLOOR_STONE: 2,
    FLOOR_STONE_CRACKED: 6,
    FLOOR_DIRT: 28,
    TREE: 222,
    WATER: 150,
    ROOF: 9,
    FENCE: 10,
    WOOD_WALL: 67,
    WOOD_FLOOR: 8,
    LAVA: 14,
    BRICK: 11
};

window.generateMap = function() {
    const type = document.getElementById('gen-type').value;
    const densityRaw = document.getElementById('gen-density').value;
    const density = parseInt(densityRaw) / 10; // 1-10 scale

    const w = map.width;
    const h = map.height;

    // Reset Map
    map.layers = [
        new Array(w * h).fill(null), // Layer 0: Floors
        new Array(w * h).fill(null), // Layer 1: Walls/Objects
        new Array(w * h).fill(null)  // Layer 2: Decoration/Overlay
    ];
    map.collision = new Array(w * h).fill(0);
    map.decorations = [];
    
    map.tilesetPath = 'WORLD_PIXEL_ART';
    loadTileset('WORLD_PIXEL_ART').then(() => {
        console.log(`Generating ${type} with density ${density}...`);
        
        // --- Specialized Platformer Generator ---
        if (map.type === 'platformer-2d' && window.generatePlatformerWorld) {
            const seedEl = document.getElementById('gen-seed');
            const seed = seedEl ? seedEl.value || undefined : undefined;
            const genMap = window.generatePlatformerWorld(w, h, { 
                seed: seed, 
                density: Math.max(1, Math.round(density * 10)),
                theme: type === 'dungeon' ? 'caves' : 'islands' 
            });
            
            if (genMap) {
                map.width = genMap.width;
                map.height = genMap.height;
                map.layers = genMap.layers.map(arr => arr.slice());
                map.collision = genMap.collision.slice();
                map.decorations = (genMap.decorations || []).slice();
                if (genMap.spawn) map.spawn = genMap.spawn;
                if (genMap.exit) map.exit = genMap.exit;
                map.background = genMap.background || map.background;
                
                updateLayerList();
                render();
                return;
            }
        }

        // Prefer new modular generator if available
        try {
            const seedEl = document.getElementById('gen-seed');
            const seed = seedEl ? seedEl.value || undefined : undefined;
            if (window.generateWorld) {
                const genMap = window.generateWorld(type === 'heaven' ? 'sky' : type, w, h, { seed: seed, density: Math.max(1, Math.round(density * 10)) });
                // Apply generated map into the editor's global `map` structure
                if (genMap) {
                    map.width = genMap.width;
                    map.height = genMap.height;
                    map.layers = genMap.layers.map(arr => arr.slice());
                    map.collision = genMap.collision.slice();
                    map.decorations = (genMap.decorations || []).slice();
                    map.tilesetPath = genMap.tilesetPath || map.tilesetPath;
                    if (genMap.spawn) map.spawn = genMap.spawn;
                    if (genMap.exit) map.exit = genMap.exit;
                    updateLayerList();
                    render();
                    alert(`Generated ${type} (modular) with seed ${seed || 'random'}`);
                    return;
                }
            }
        } catch (e) {
            console.warn('generateWorld integration failed, falling back to legacy generators', e);
        }

        // Fallback to legacy generators
        switch(type) {
            case 'village': generateVillageV3(w, h, density); break;
            case 'dungeon': generateDungeonV3(w, h, density); break;
            case 'hell': generateHellscape(w, h, density); break;
            case 'heaven': generateSkyV2(w, h, density); break;
            case 'lab': generateLab(w, h, density); break;
            case 'platformer': generatePlatformer(w, h, density); break;
        }

        updateLayerList();
        render();
        alert(`Generated ${type}!`);
    });
};

// --- CORE UTILS ---

function setTile(x, y, layer, tile, col = null) {
    if (x >= 0 && x < map.width && y >= 0 && y < map.height) {
        const idx = y * map.width + x;
        map.layers[layer][idx] = tile;
        if (col !== null) map.collision[idx] = col;
    }
}

function fillRect(x, y, w, h, layer, tile, col = null) {
    for (let ty = y; ty < y + h; ty++) {
        for (let tx = x; tx < x + w; tx++) {
            setTile(tx, ty, layer, tile, col);
        }
    }
}

function addDecoration(x, y, type, data = "") {
    map.decorations.push({ x, y, type, data });
}

// --- GENERATORS ---

function generateVillageV3(w, h, density) {
    console.log("Generating Modern Village (Artifact Fix)...");

    // 1. Base Layer: Grass
    for (let i = 0; i < w * h; i++) {
        map.layers[0][i] = (Math.random() > 0.1) ? TILE.FLOOR_GRASS : TILE.FLOOR_GRASS_FLOWER;
        map.collision[i] = 0; // Clear collision initially
    }

    // 2. Road Network (Grid-like with noise)
    const roads = [];
    const mainRoadY = Math.floor(h / 2);
    const mainRoadX = Math.floor(w / 2);
    
    // Horizontal Main Road
    for (let x = 0; x < w; x++) {
        setTile(x, mainRoadY, 0, TILE.FLOOR_DIRT);
        setTile(x, mainRoadY + 1, 0, TILE.FLOOR_DIRT);
        roads.push({x, y: mainRoadY});
        roads.push({x, y: mainRoadY+1});
    }

    // Vertical Main Road
    for (let y = 0; y < h; y++) {
        setTile(mainRoadX, y, 0, TILE.FLOOR_DIRT);
        setTile(mainRoadX + 1, y, 0, TILE.FLOOR_DIRT);
        roads.push({x: mainRoadX, y});
        roads.push({x: mainRoadX+1, y});
    }

    // 3. Zoning & Placement
    const houses = [];
    const parkRadius = 6;
    const houseCount = Math.floor((w * h) / 100 * density); // Scale with map size

    // Central Park (No houses here)
    const parkCenter = {x: mainRoadX, y: mainRoadY};
    for(let y = parkCenter.y - parkRadius; y <= parkCenter.y + parkRadius; y++) {
        for(let x = parkCenter.x - parkRadius; x <= parkCenter.x + parkRadius; x++) {
            if (x > 0 && x < w && y > 0 && y < h) {
                // Fountain Center
                if (Math.abs(x - parkCenter.x) < 2 && Math.abs(y - parkCenter.y) < 2) {
                     setTile(x, y, 0, TILE.WATER, 1);
                } else {
                     setTile(x, y, 0, TILE.FLOOR_GRASS_FLOWER);
                     if (Math.random() < 0.1) setTile(x, y, 1, TILE.TREE, 1);
                }
            }
        }
    }
    // Add NPCs in Park
    for(let i=0; i<3; i++) {
        addDecoration(parkCenter.x + Math.floor(Math.random()*6)-3, parkCenter.y + Math.floor(Math.random()*6)-3, 'npc', 'villager_man');
    }

    // Attempt to place houses
    let attempts = 0;
    while(houses.length < houseCount && attempts < 2000) {
        attempts++;
        const hw = 5 + Math.floor(Math.random() * 4); // 5-8 width
        const hh = 4 + Math.floor(Math.random() * 4); // 4-7 height
        const hx = 2 + Math.floor(Math.random() * (w - hw - 4));
        const hy = 2 + Math.floor(Math.random() * (h - hh - 4));

        // Overlap Check (Roads, Park, Other Houses, AND MAP TILES)
        let overlap = false;
        
        // Park Buffer
        if (Math.abs(hx - parkCenter.x) < parkRadius + 2 && Math.abs(hy - parkCenter.y) < parkRadius + 2) overlap = true;

        // Existing Houses Buffer
        if (!overlap) {
            for(let h of houses) {
                if (hx < h.x + h.w + 2 && hx + hw + 2 > h.x && hy < h.y + h.h + 2 && hy + hh + 2 > h.y) {
                    overlap = true; break;
                }
            }
        }

        // PHYSICAL MAP CHECK (Crucial for avoiding dynamic paths)
        if (!overlap) {
            for(let y = hy - 1; y < hy + hh + 1; y++) {
                for(let x = hx - 1; x < hx + hw + 1; x++) {
                    const idx = y * w + x;
                    const tile = map.layers[0][idx];
                    // If hitting road, water, or wood floor, overlap!
                    if (tile === TILE.FLOOR_DIRT || tile === TILE.WATER || tile === TILE.WOOD_FLOOR) {
                        overlap = true; break;
                    }
                }
                if (overlap) break;
            }
        }

        if (!overlap) {
            buildModernHouse(hx, hy, hw, hh);
            houses.push({x: hx, y: hy, w: hw, h: hh});
            
            // Path to nearest road
            connectToRoad(hx + Math.floor(hw/2), hy + hh, roads);
        }
    }

    // 4. Details
    // Torches along roads
    for(let i=0; i<w*h; i++) {
         const x = i % w; const y = Math.floor(i/w);
         // If this is a road, maybe place torch
         if (map.layers[0][i] === TILE.FLOOR_DIRT && Math.random() < 0.02) {
             // Only if empty space above (visual)
             if (!map.layers[1][i]) addDecoration(x, y, 'torch');
         }
    }

    // Trees in empty spots (Strict Check)
    for(let i=0; i<w*h; i++) {
        const x = i % w; const y = Math.floor(i/w);
        const floor = map.layers[0][i];
        const wall = map.layers[1][i];
        
        // No trees on roads, water, or house floors
        if (floor !== TILE.FLOOR_DIRT && floor !== TILE.WATER && floor !== TILE.WOOD_FLOOR && 
            wall === null && map.collision[i] === 0 && Math.random() < 0.05) {
             setTile(x, y, 1, TILE.TREE, 1);
        }
    }

    map.spawn = {x: mainRoadX, y: mainRoadY + parkRadius + 2};
}

function buildModernHouse(x, y, w, h) {
    // Floor
    fillRect(x, y, w, h, 0, TILE.WOOD_FLOOR, 0);
    
    // Walls
    for(let i=0; i<w; i++) { 
        setTile(x+i, y, 1, TILE.WOOD_WALL, 1); 
        setTile(x+i, y+h-1, 1, TILE.WOOD_WALL, 1); 
    }
    for(let i=0; i<h; i++) { 
        setTile(x, y+i, 1, TILE.WOOD_WALL, 1); 
        setTile(x+w-1, y+i, 1, TILE.WOOD_WALL, 1); 
    }

    // Door
    const dx = x + Math.floor(w/2);
    setTile(dx, y+h-1, 1, null, 0); 
    addDecoration(dx, y+h-1, 'door');

    // Windows
    if (w > 5) setTile(x+2, y+h-1, 1, TILE.FENCE, 1); 
    if (w > 6) setTile(x+w-3, y+h-1, 1, TILE.FENCE, 1);

    // Interior
    if (Math.random() > 0.5) addDecoration(x+1, y+1, 'chest');
    addDecoration(x+w-2, y+1, 'candle');

    // NPC
    const npcType = Math.random() > 0.5 ? 'villager_man' : 'villager_woman';
    addDecoration(x + Math.floor(w/2), y + Math.floor(h/2), 'npc', npcType);
}

function connectToRoad(x, y, roads) {
    // L-Shaped Manhattan Pathfinding to Center
    // This avoids diagonal zig-zags and looks more like a planned path.
    
    const centerX = Math.floor(map.width/2);
    const centerY = Math.floor(map.height/2);
    
    // Determine target on the main cross-roads
    // We want to hit x=centerX OR y=centerY
    
    let targetX = centerX;
    let targetY = y; // Go horizontal first?
    
    // Simple heuristic: Go Vertical to Y-Center, or Horizontal to X-Center?
    // Let's just go Y first, then X.
    
    // Path 1: Vertical segment
    let cy = y;
    while(cy !== centerY) {
        // Stop if we hit a road already
        const idx = cy * map.width + x;
        if (map.layers[0][idx] === TILE.FLOOR_DIRT) return; 
        
        // Stop if we hit a house (don't slice through neighbors)
        if (map.layers[0][idx] === TILE.WOOD_FLOOR || map.layers[1][idx] === TILE.WOOD_WALL) return;

        setTile(x, cy, 0, TILE.FLOOR_DIRT);
        setTile(x, cy, 1, null, 0); // Clear obstacles/trees
        
        cy += (centerY > cy) ? 1 : -1;
    }
    
    // Path 2: Horizontal segment
    let cx = x;
    while(cx !== centerX) {
        const idx = cy * map.width + cx;
        if (map.layers[0][idx] === TILE.FLOOR_DIRT) return;
        
        // Stop if we hit a house
        if (map.layers[0][idx] === TILE.WOOD_FLOOR || map.layers[1][idx] === TILE.WOOD_WALL) return;

        setTile(cx, cy, 0, TILE.FLOOR_DIRT);
        setTile(cx, cy, 1, null, 0);
        
        cx += (centerX > cx) ? 1 : -1;
    }
}

function generateDungeonV3(w, h, density) {
    map.layers[0].fill(TILE.FLOOR_STONE);
    map.layers[1].fill(TILE.WALL_STONE);
    map.collision.fill(1);

    const rooms = [];
    const count = 6 + Math.floor(density);

    for(let i=0; i<count; i++) {
        const rw = 4 + Math.floor(Math.random()*6);
        const rh = 4 + Math.floor(Math.random()*6);
        const rx = 2 + Math.floor(Math.random()*(w-rw-4));
        const ry = 2 + Math.floor(Math.random()*(h-rh-4));

        if (!rooms.some(r => rx < r.x + r.w + 2 && rx + rw + 2 > r.x && ry < r.y + r.h + 2 && ry + rh + 2 > r.y)) {
            rooms.push({x: rx, y: ry, w: rw, h: rh});
            fillRect(rx, ry, rw, rh, 0, (Math.random() > 0.8) ? TILE.FLOOR_STONE_CRACKED : TILE.FLOOR_STONE, 0);
            fillRect(rx, ry, rw, rh, 1, null, 0); // Clear walls
            
            // Random room contents
            if (Math.random() > 0.7) addDecoration(rx + 1, ry + 1, 'chest');
            if (Math.random() > 0.5) addDecoration(rx + rw - 2, ry + 1, 'torch');
            if (Math.random() > 0.8) addDecoration(rx + Math.floor(rw/2), ry + Math.floor(rh/2), 'enemy');
        }
    }

    // Corridors
    for(let i=0; i<rooms.length-1; i++) {
        const r1 = rooms[i]; const r2 = rooms[i+1];
        connectPoints(r1.x+1, r1.y+1, r2.x+1, r2.y+1, 0, TILE.FLOOR_STONE, true);
    }

    map.spawn = {x: rooms[0].x+1, y: rooms[0].y+1};
    map.exit = {x: rooms[rooms.length-1].x+1, y: rooms[rooms.length-1].y+1};
}

function generateHellscape(w, h, density) {
    // Cellular Automata Cave with Lava
    for(let i=0; i<w*h; i++) {
        map.collision[i] = (Math.random() < 0.45) ? 1 : 0;
    }

    for(let step=0; step<5; step++) {
        const next = [...map.collision];
        for(let y=1; y<h-1; y++) {
            for(let x=1; x<w-1; x++) {
                let n = 0;
                for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++) if(map.collision[(y+dy)*w+(x+dx)]) n++;
                next[y*w+x] = (n >= 5) ? 1 : 0;
            }
        }
        map.collision = next;
    }

    for(let i=0; i<w*h; i++) {
        const x = i % w; const y = Math.floor(i/w);
        if (map.collision[i]) {
            setTile(x, y, 0, TILE.FLOOR_STONE_CRACKED);
            setTile(x, y, 1, TILE.WALL_STONE_ALT, 1);
        } else {
            const isLava = Math.random() < 0.15;
            setTile(x, y, 0, isLava ? TILE.LAVA : TILE.FLOOR_STONE_CRACKED, isLava ? 1 : 0);
            if (!isLava && Math.random() < 0.05 * density) addDecoration(x, y, 'fire_trap');
            if (!isLava && Math.random() < 0.03 * density) addDecoration(x, y, 'enemy', 'demon');
        }
    }

    map.spawn = findSpace(w, h);
    addDecoration(map.spawn.x, map.spawn.y, 'save_point');
}

function generateSkyV2(w, h, density) {
    map.layers[0].fill(null);
    map.collision.fill(1);
    
    const islands = 4 + Math.floor(density);
    for(let i=0; i<islands; i++) {
        const cx = 5 + Math.floor(Math.random()*(w-10));
        const cy = 5 + Math.floor(Math.random()*(h-10));
        const r = 3 + Math.floor(Math.random()*4);
        
        for(let y=cy-r; y<=cy+r; y++) {
            for(let x=cx-r; x<=cx+r; x++) {
                const dist = Math.sqrt((x-cx)**2 + (y-cy)**2);
                if (dist <= r) {
                    setTile(x, y, 0, TILE.FLOOR_GRASS, 0);
                    if (dist > r-1 && Math.random() > 0.5) setTile(x, y, 1, TILE.FENCE, 1);
                    else if (Math.random() < 0.1) addDecoration(x, y, 'glow');
                }
            }
        }
    }
    map.spawn = findSpace(w, h);
}

function generateLab(w, h, density) {
    // Grid-based Sci-Fi corridors
    map.layers[0].fill(TILE.FLOOR_STONE);
    map.layers[1].fill(TILE.BRICK);
    map.collision.fill(1);

    const cellSize = 6;
    for(let y=2; y<h-cellSize; y+=cellSize) {
        for(let x=2; x<w-cellSize; x+=cellSize) {
            fillRect(x, y, cellSize-1, cellSize-1, 0, TILE.FLOOR_STONE, 0);
            fillRect(x, y, cellSize-1, cellSize-1, 1, null, 0);
            
            // Connect to neighbors
            if (x + cellSize < w) fillRect(x+cellSize-2, y + 2, 3, 1, 1, null, 0);
            if (y + cellSize < h) fillRect(x + 2, y+cellSize-2, 1, 3, 1, null, 0);

            if (Math.random() > 0.8) addDecoration(x+2, y+2, 'teleport');
        }
    }
    map.spawn = {x:3, y:3};
}

function connectPoints(x1, y1, x2, y2, layer, tile, clearWall = false) {
    let cx = x1, cy = y1;
    while(cx !== x2) {
        setTile(cx, cy, layer, tile, 0);
        if(clearWall) setTile(cx, cy, 1, null, 0);
        cx += (x2>cx) ? 1 : -1;
    }
    while(cy !== y2) {
        setTile(cx, cy, layer, tile, 0);
        if(clearWall) setTile(cx, cy, 1, null, 0);
        cy += (y2>cy) ? 1 : -1;
    }
}

function findSpace(w, h) {
    for(let i=0; i<1000; i++) {
        const x = Math.floor(Math.random()*(w-2))+1;
        const y = Math.floor(Math.random()*(h-2))+1;
        if(map.collision[y*w+x] === 0) return {x,y};
    }
    return {x:Math.floor(w/2), y:Math.floor(h/2)};
}

function generatePlatformer(w, h, density) {
    console.log("Generating Platformer Level (Legacy Fallback)...");
    
    // 1. Clear Map
    for (let i = 0; i < w * h; i++) {
        map.layers[0][i] = null;
        map.layers[1][i] = null;
        map.collision[i] = 0;
    }

    const groundY = h - 3;
    
    // 2. Ground
    for (let x = 0; x < w; x++) {
        if (Math.random() > 0.1) {
            setTile(x, groundY, 0, TILE.FLOOR_STONE, 1);
            setTile(x, groundY + 1, 0, TILE.WALL_STONE, 1);
            setTile(x, groundY + 2, 0, TILE.WALL_STONE, 1);
        }
    }

    // 3. Random Platforms
    const platforms = Math.floor(w * h / 100 * density);
    for (let i = 0; i < platforms; i++) {
        const px = Math.floor(Math.random() * (w - 6)) + 3;
        const py = Math.floor(Math.random() * (groundY - 4)) + 2;
        const pw = Math.floor(Math.random() * 4) + 3;
        fillRect(px, py, pw, 1, 0, TILE.WOOD_FLOOR, 1);
        
        if (Math.random() > 0.7) addDecoration(px + 1, py - 1, 'coin');
    }

    map.spawn = {x: 2, y: groundY - 1};
    map.exit = {x: w - 3, y: groundY - 1};
}